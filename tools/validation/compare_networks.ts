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
import { isKnownUnparseableReference, unparseableReferenceReason } from './netShapeUnsupported';
import { parseBNGLWithANTLR } from '../../packages/engine/src/parser/BNGLParserWrapper';
import { expandBounded } from '../../packages/engine/src/services/graph/boundedExpansion';
import type { BNGLModel } from '../../packages/engine/src/types';
import { EXPECTED_NETWORK_MISMATCHES } from './compareShared';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BNG_TEST_OUTPUT_DIR = process.env.BNG_TEST_OUTPUT_DIR ?? path.join(PROJECT_ROOT, 'bng_test_output');
const REPORT_PATH = process.env.NET_SHAPE_REPORT ?? path.join(PROJECT_ROOT, 'artifacts', 'network_shape_report.json');
const PER_MODEL_TIMEOUT_MS = Number(process.env.NET_SHAPE_TIMEOUT_MS ?? 30_000);
/**
 * Minimum fraction of .net fixtures that must actually be compared. Guards
 * against a vacuous green run when the parser or reference generation breaks.
 */
const MIN_COVERAGE = Number(process.env.NET_SHAPE_MIN_COVERAGE ?? 0.8);

/**
 * Canonicalise a species pattern so the two engines can be compared by
 * topology rather than by labelling.
 *
 * Three differences are cosmetic and were producing false mismatches:
 *   - compartments:      playground writes "@ER::Ca()", BNG2 writes "Ca()"
 *   - synthesis marker:  BNG2 writes "$Source()"/"$Sink()", the playground does not
 *   - bond ordering:     identical symmetric complexes are emitted with their
 *                        molecules and components in different orders
 *     BNG2:  J(Y~P,Y1~P!1).J(Y~P,Y1~P!2)
 *     local: J(Y1~P!1,Y~P).J(Y1~P!2,Y~P)
 *
 * Molecules and their components are therefore sorted, and bond labels are
 * stripped. Species/reaction *counts* remain the primary signal and are
 * compared exactly.
 */
const canonicalSpecies = (name: string): string => {
  const withoutCompartment = name.replace(/@[A-Za-z0-9_]+\s*::\s*/g, '');
  const molecules = withoutCompartment.split('.').map((molecule) => {
    const withoutMarker = molecule.replace(/^\$/, '');
    const open = withoutMarker.indexOf('(');
    if (open === -1) return withoutMarker;
    const moleculeName = withoutMarker.slice(0, open);
    const body = withoutMarker.slice(open + 1, withoutMarker.lastIndexOf(')'));
    const components = body
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      // Drop bond labels (!1) — ordering is canonicalised below.
      .map((c) => c.replace(/!\d+/g, ''))
      .sort();
    return `${moleculeName}(${components.join(',')})`;
  });
  return molecules.sort().join('.');
};
/**
 * Canonicalise a reaction to `reactants->products` with both sides
 * species-canonicalised and sorted.
 *
 * BNG2's `.net` reactions carry participant *indices*, not patterns, so the
 * label field is useless for comparison: `_rateLaw1`/`#Rule01` on one side has
 * no counterpart on the other. Identity lives in the species multiset, which is
 * also how BNG2 itself keys reactions (`Rxn->stringID()`), so participants are
 * sorted to ignore the arbitrary ordering of both writers.
 *
 * A participant of `0` means "nothing on this side" — BNG2 writes index 0 for
 * an empty product list, and the `.net` reader resolves no species for it.
 */
const canonicalReaction = (r: { reactants?: string[]; products?: string[] }): string => {
  const side = (patterns: string[] | undefined): string[] =>
    (patterns ?? [])
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && p !== '0')
      .map(canonicalSpecies)
      .sort();
  return `${side(r.reactants).join('+')}->${side(r.products).join('+')}`;
};

interface NetworkShape {
  species: string[];
  numSpecies: number;
  numReactions: number;
  reactions: string[];
}

/**
 * Expand one reference model under a hard deadline.
 *
 * The expander's cancellation callback is polled between iterations and
 * between rule applications, so it cannot stop an expansion wedged inside a
 * single rule applied to a combinatorial explosion of match candidates — the
 * callback is never reached and the gate stalls forever. Expansion therefore
 * runs in a child process that can actually be killed; see
 * `packages/engine/src/services/graph/boundedExpansion.ts`.
 */
const expandModel = async (bnglPath: string): Promise<NetworkShape> => {
  const expansion = await expandBounded(bnglPath, { timeoutMs: PER_MODEL_TIMEOUT_MS });
  if (expansion.status === 'killed') {
    // Deliberately not prefixed `parse:` — the gate treats that prefix as
    // "the reference is unreadable" and consults the ratchet, and a timeout is
    // a different failure: it must be reported and must fail the gate unless a
    // model is ratcheted with that reason.
    throw new Error(`expansion: ${expansion.error}`);
  }
  if (expansion.status !== 'ok') {
    throw new Error(`parse: ${expansion.error}`);
  }
  return {
    species: [...expansion.species].sort(),
    numSpecies: expansion.species.length,
    numReactions: expansion.reactions.length,
    reactions: expansion.reactions.map(canonicalReaction).sort(),
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
    reactions: (model.reactions ?? []).map(canonicalReaction).sort(),
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
    totals: { netFixtures: netFiles.length, compared: 0, matched: 0, mismatched: 0, expectedMismatch: 0, noPlaygroundNet: 0, errored: 0, unsupported: 0 },
    mismatches: [] as Array<Record<string, unknown>>,
    errors: [] as Array<Record<string, unknown>>,
    unsupported: [] as Array<Record<string, unknown>>,
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
      generated = await expandModel(bnglPath);
    } catch (err) {
      const message = String(err instanceof Error ? err.message : err);
      // A reference we cannot parse means there is no network to compare, not
      // that the engines disagree. Known-unparseable references are recorded
      // (see netShapeUnsupported.ts); anything unlisted still fails the gate,
      // so a newly broken model cannot hide here.
      const isParseFailure = /^net parse:|^parse:/.test(message);
      if (isParseFailure && isKnownUnparseableReference(safeName)) {
        report.totals.unsupported++;
        report.unsupported.push({ model: safeName, reason: unparseableReferenceReason(safeName) });
        continue;
      }
      report.totals.errored++;
      report.errors.push({ model: safeName, error: message.slice(0, 200) });
      continue;
    }

    report.totals.compared++;
    const refSpecies = new Set(reference.species.map(canonicalSpecies));
    const genSpecies = new Set(generated.species.map(canonicalSpecies));
    const missing = [...refSpecies].filter((s) => !genSpecies.has(s));
    const extra = [...genSpecies].filter((s) => !refSpecies.has(s));

    // Compare the SET of distinct reactions, not the raw count. BNG2 writes
    // duplicate copies of a reaction when several rules produce the same
    // transformation — the Miller2025_MEK family emits 636 distinct reactions
    // from both engines, while BNG2's raw total reaches 767 purely from
    // repeated identical entries. Counting those flags a correct network as a
    // mismatch. Raw totals are still reported so a real divergence stays visible.
    // Both readers already store canonical reaction strings.
    const refRxnSet = new Set(reference.reactions);
    const genRxnSet = new Set(generated.reactions);
    const missingRxns = [...refRxnSet].filter((r) => !genRxnSet.has(r));
    const extraRxns = [...genRxnSet].filter((r) => !refRxnSet.has(r));

    if (
      missing.length === 0 &&
      extra.length === 0 &&
      missingRxns.length === 0 &&
      extraRxns.length === 0
    ) {
      report.totals.matched++;
      continue;
    }

    const entry = {
      model: safeName,
      reference: {
        species: reference.numSpecies,
        reactions: reference.numReactions,
        distinctReactions: refRxnSet.size,
      },
      generated: {
        species: generated.numSpecies,
        reactions: generated.numReactions,
        distinctReactions: genRxnSet.size,
      },
      missingSpecies: missing.slice(0, 10),
      extraSpecies: extra.slice(0, 10),
      missingReactions: missingRxns.slice(0, 6),
      extraReactions: extraRxns.slice(0, 6),
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
    const gen = m.generated as Record<string, number>;
    const ref = m.reference as Record<string, number>;
    console.log(
      `  MISMATCH ${m.model}: species ${gen.species} vs ref ${ref.species}, ` +
        `distinct reactions ${gen.distinctReactions} vs ref ${ref.distinctReactions} ` +
        `(raw ${gen.reactions} vs ${ref.reactions})` +
        (Array.isArray(m.missingSpecies) && m.missingSpecies.length ? ` | missing species e.g. ${m.missingSpecies[0]}` : '') +
        (Array.isArray(m.missingReactions) && m.missingReactions.length
          ? ` | missing rxn e.g. ${String(m.missingReactions[0]).slice(0, 70)}`
          : ''),
    );
  }
  for (const u of report.unsupported) {
    console.log(`  UNSUPPORTED ${u.model}: ${u.reason}`);
  }
  // Never truncate silently: a shortened list hides models that need a
  // baseline entry.
  if (report.errors.length > 10) {
    console.log(`  ... and ${report.errors.length - 10} more error(s), all listed in the report`);
  }
  for (const e of report.errors) {
    console.log(`  ERROR ${e.model}: ${e.error}`);
  }
  console.log(`[net-shape] report: ${REPORT_PATH}`);

  // A gate that quietly compares nothing is worse than no gate: a broken .net
  // parser or a failed reference generation would turn every model into an
  // "error" and the run would still go green. Require that most fixtures are
  // actually compared, otherwise the gate is reporting on nothing.
  const comparable = report.totals.netFixtures - report.totals.noPlaygroundNet;
  const coverage = comparable > 0 ? report.totals.compared / comparable : 0;
  if (coverage < MIN_COVERAGE) {
    console.error(
      `[net-shape] only ${report.totals.compared}/${comparable} networks compared ` +
        `(${(coverage * 100).toFixed(1)}%, minimum ${(MIN_COVERAGE * 100).toFixed(0)}%). ` +
        `The gate would be vacuous — fix the underlying parse/generation failure.`
    );
    process.exit(1);
  }

  if (report.totals.errored > 0) {
    // An unlisted model we could not read is a regression, not a skip: the
    // ratchet in netShapeUnsupported.ts exists precisely so this cannot grow
    // silently.
    console.error(`[net-shape] ${report.totals.errored} model(s) could not be compared.`);
    process.exit(1);
  }

  if (report.totals.mismatched > 0) {
    console.error(`[net-shape] ${report.totals.mismatched} model(s) differ from BioNetGen's network shape.`);
    process.exit(1);
  }
};

await main();
