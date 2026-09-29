/**
 * Network-shape parity: compare the playground's generated network against
 * BioNetGen's, using the `.net` files BNG2.pl already produces during reference
 * generation.
 *
 * Trajectory parity alone can hide structural faults: a rule that the expander
 * silently drops yields a smaller network whose observables may still look
 * plausible. Species and reaction counts are the cheapest, most direct signal
 * that the two implementations built the same chemistry.
 *
 * Usage: npx tsx tools/validation/compare_networks.ts
 * Env:
 *   BNG_TEST_OUTPUT_DIR  directory holding <model>.bngl + <model>.net (default bng_test_output)
 *   NET_SHAPE_REPORT     path for the JSON report (default artifacts/network_shape_report.json)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseNetFile } from '../../packages/engine/src/services/graph/NetParser';
import { parseBNGLWithANTLR } from '../../packages/engine/src/parser/BNGLParserWrapper';
import { generateExpandedNetwork } from '../../packages/engine/src/services/simulation/NetworkExpansion';
import type { BNGLModel } from '../../packages/engine/src/types';
import { EXPECTED_NETWORK_MISMATCHES } from './compareShared';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BNG_TEST_OUTPUT_DIR = process.env.BNG_TEST_OUTPUT_DIR ?? path.join(PROJECT_ROOT, 'bng_test_output');
const REPORT_PATH = process.env.NET_SHAPE_REPORT ?? path.join(PROJECT_ROOT, 'artifacts', 'network_shape_report.json');
const PER_MODEL_TIMEOUT_MS = Number(process.env.NET_SHAPE_TIMEOUT_MS ?? 30_000);

/** Compartments are annotated differently by the two engines; compare topology only. */
const stripCompartment = (name: string): string => name.replace(/@[A-Za-z0-9_]+\s*::\s*/g, '');

interface NetworkShape {
  species: string[];
  numSpecies: number;
  numReactions: number;
  reactions: string[];
}

class Timeout extends Error {
  constructor() {
    super('timeout');
    this.name = 'Timeout';
  }
}

const withDeadline = async <T>(work: () => Promise<T>, ms: number): Promise<T> => {
  const expiry = Date.now() + ms;
  const check = () => {
    if (Date.now() > expiry) throw new Timeout();
  };
  // The engine polls checkCancelled cooperatively during expansion.
  return work(check);
};

const expandModel = async (bngl: string, check: () => void): Promise<NetworkShape> => {
  const parsed = parseBNGLWithANTLR(bngl);
  if (!parsed.success) {
    throw new Error(`parse: ${parsed.errors?.[0]?.message ?? 'failed'}`);
  }
  const net = await generateExpandedNetwork(parsed.model as BNGLModel, check, () => {});
  return {
    species: net.species.map((s) => s.name).sort(),
    numSpecies: net.species.length,
    numReactions: net.reactions.length,
    reactions: net.reactions.map((r) => r.name).sort(),
  };
};

const readReferenceShape = (netText: string): NetworkShape => {
  const parsed = parseNetFile(netText);
  if (!parsed.success) {
    throw new Error(`net parse: ${parsed.errors[0] ?? 'failed'}`);
  }
  const model = parsed.model;
  return {
    species: (model.species ?? []).map((s) => s.name).sort(),
    numSpecies: (model.species ?? []).length,
    numReactions: (model.reactions ?? []).length,
    reactions: (model.reactions ?? []).map((r) => r.name).sort(),
  };
};

const main = async (): Promise<void> => {
  if (!fs.existsSync(BNG_TEST_OUTPUT_DIR)) {
    console.error(`[net-shape] reference directory not found: ${BNG_TEST_OUTPUT_DIR}`);
    process.exit(1);
  }

  const netFiles = fs.readdirSync(BNG_TEST_OUTPUT_DIR).filter((f) => f.toLowerCase().endsWith('.net'));
  const report = {
    generatedAt: new Date().toISOString(),
    referenceDir: BNG_TEST_OUTPUT_DIR,
    totals: { netFixtures: netFiles.length, compared: 0, matched: 0, mismatched: 0, expectedMismatch: 0, noPlaygroundNet: 0, errored: 0 },
    mismatches: [] as Array<Record<string, unknown>>,
    errors: [] as Array<Record<string, unknown>>,
  };

  for (const netFile of netFiles) {
    const safeName = path.basename(netFile, path.extname(netFile));
    const bnglPath = path.join(BNG_TEST_OUTPUT_DIR, `${safeName}.bngl`);
    if (!fs.existsSync(bnglPath)) {
      report.totals.noPlaygroundNet++;
      continue;
    }

    let reference: NetworkShape;
    let generated: NetworkShape;
    try {
      reference = readReferenceShape(fs.readFileSync(path.join(BNG_TEST_OUTPUT_DIR, netFile), 'utf8'));
      generated = await withDeadline(
        (check) => expandModel(fs.readFileSync(bnglPath, 'utf8'), check),
        PER_MODEL_TIMEOUT_MS,
      );
    } catch (err) {
      report.totals.errored++;
      report.errors.push({ model: safeName, error: String(err instanceof Error ? err.message : err).slice(0, 200) });
      continue;
    }

    report.totals.compared++;
    const refSpecies = new Set(reference.species.map(stripCompartment));
    const genSpecies = new Set(generated.species.map(stripCompartment));
    const missing = [...refSpecies].filter((s) => !genSpecies.has(s));
    const extra = [...genSpecies].filter((s) => !refSpecies.has(s));
    const countsMatch =
      reference.numSpecies === generated.numSpecies && reference.numReactions === generated.numReactions;

    if (countsMatch && missing.length === 0 && extra.length === 0) {
      report.totals.matched++;
      continue;
    }

    const entry = {
      model: safeName,
      reference: { species: reference.numSpecies, reactions: reference.numReactions },
      generated: { species: generated.numSpecies, reactions: generated.numReactions },
      missingSpecies: missing.slice(0, 10),
      extraSpecies: extra.slice(0, 10),
    };
    if (EXPECTED_NETWORK_MISMATCHES[safeName.toLowerCase()]) {
      report.totals.expectedMismatch++;
      entry.expected = EXPECTED_NETWORK_MISMATCHES[safeName.toLowerCase()];
    } else {
      report.totals.mismatched++;
    }
    report.mismatches.push(entry);
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 1));

  console.log('[net-shape] reference dir:', BNG_TEST_OUTPUT_DIR);
  console.log('[net-shape] totals:', report.totals);
  for (const m of report.mismatches) {
    if (m.expected) continue;
    console.log(
      `  MISMATCH ${m.model}: species ${m.generated.species} vs ref ${m.reference.species}, ` +
        `reactions ${m.generated.reactions} vs ref ${m.reference.reactions}` +
        (Array.isArray(m.missingSpecies) && m.missingSpecies.length ? ` | missing e.g. ${m.missingSpecies[0]}` : '') +
        (Array.isArray(m.extraSpecies) && m.extraSpecies.length ? ` | extra e.g. ${m.extraSpecies[0]}` : ''),
    );
  }
  console.log(`[net-shape] report: ${REPORT_PATH}`);

  if (report.totals.mismatched > 0) {
    console.error(`[net-shape] ${report.totals.mismatched} model(s) differ from BioNetGen's network shape.`);
    process.exit(1);
  }
};

await main();
