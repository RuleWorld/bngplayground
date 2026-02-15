import * as fs from 'fs';
import * as path from 'path';
import { BNGLParser } from '../src/services/graph/core/BNGLParser.ts';
import { GraphCanonicalizer } from '../src/services/graph/core/Canonical.ts';

type CliArgs = {
  webNet: string;
  bngNet: string;
  top: number;
  json: boolean;
  failOnMismatch: boolean;
};

type ParsedNet = {
  parameters: Array<{ index: number; name: string; valueExpr: string }>;
  species: Array<{ index: number; pattern: string; concentrationExpr: string }>;
  reactions: Array<{ index: number; reactants: number[]; products: number[]; rateExpr: string }>;
};

type AggregatedRate = {
  count: number;
  sumCoeff: number;
  hasNumericCoeff: boolean;
  sampleRateExpr: string;
};

type ComparisonSummary = {
  web: { parameters: number; species: number; reactions: number };
  bng: { parameters: number; species: number; reactions: number };
  speciesSetDiff: { missingInWeb: number; extraInWeb: number; missingSample: string[]; extraSample: string[] };
  reactionSignatureDiff: { missingInWeb: number; extraInWeb: number; missingSample: string[]; extraSample: string[] };
  rateCoefficientDiff: {
    checked: number;
    mismatches: number;
    mismatchesSample: Array<{
      signature: string;
      webCoeff: number;
      bngCoeff: number;
      absDiff: number;
      relDiff: number;
      webRateExpr: string;
      bngRateExpr: string;
    }>;
  };
};

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {
    top: 20,
    json: false,
    failOnMismatch: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--web' || a === '--web-net') {
      args.webNet = argv[i + 1];
      i++;
    } else if (a === '--bng' || a === '--bng-net') {
      args.bngNet = argv[i + 1];
      i++;
    } else if (a === '--top') {
      const n = Number.parseInt(argv[i + 1] ?? '', 10);
      if (Number.isFinite(n) && n > 0) args.top = n;
      i++;
    } else if (a === '--json') {
      args.json = true;
    } else if (a === '--fail-on-mismatch') {
      args.failOnMismatch = true;
    }
  }

  if (!args.webNet || !args.bngNet) {
    throw new Error('Usage: npx ts-node --esm scripts/compare_net_files.ts --web <web.net> --bng <bng.net> [--top 20] [--json] [--fail-on-mismatch]');
  }

  return args as CliArgs;
}

function stripInlineComment(s: string): string {
  const idx = s.indexOf('#');
  return (idx >= 0 ? s.slice(0, idx) : s).trim();
}

function parseNetFile(filePath: string): ParsedNet {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);

  const parameters: ParsedNet['parameters'] = [];
  const species: ParsedNet['species'] = [];
  const reactions: ParsedNet['reactions'] = [];

  let section: '' | 'parameters' | 'species' | 'reactions' = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (line === 'begin parameters') {
      section = 'parameters';
      continue;
    }
    if (line === 'end parameters') {
      section = '';
      continue;
    }
    if (line === 'begin species') {
      section = 'species';
      continue;
    }
    if (line === 'end species') {
      section = '';
      continue;
    }
    if (line === 'begin reactions') {
      section = 'reactions';
      continue;
    }
    if (line === 'end reactions') {
      section = '';
      continue;
    }

    if (section === 'parameters') {
      const m = line.match(/^(\d+)\s+([^\s]+)\s+(.+)$/);
      if (!m) continue;
      parameters.push({
        index: Number.parseInt(m[1], 10),
        name: m[2],
        valueExpr: stripInlineComment(m[3]),
      });
      continue;
    }

    if (section === 'species') {
      const m = line.match(/^(\d+)\s+([^\s]+)\s+(.+)$/);
      if (!m) continue;
      species.push({
        index: Number.parseInt(m[1], 10),
        pattern: m[2],
        concentrationExpr: stripInlineComment(m[3]),
      });
      continue;
    }

    if (section === 'reactions') {
      const lineNoComment = stripInlineComment(line);
      const tokens = lineNoComment.split(/\s+/).filter(Boolean);
      if (tokens.length < 3) continue;

      const index = Number.parseInt(tokens[0], 10);
      if (!Number.isFinite(index)) continue;

      const reactants = tokens[1].split(',').map((v) => Number.parseInt(v, 10)).filter((n) => Number.isFinite(n));

      // Some exported nets omit explicit "0" for null products in degradation reactions:
      // "<idx> <reactants> <rateExpr>".
      let products: number[] = [];
      let rateExpr = '';
      if (tokens.length === 3) {
        products = [0];
        rateExpr = tokens[2];
      } else {
        products = tokens[2].split(',').map((v) => Number.parseInt(v, 10)).filter((n) => Number.isFinite(n));
        rateExpr = tokens[3] ?? '';
      }

      reactions.push({
        index,
        reactants,
        products,
        rateExpr,
      });
    }
  }

  return { parameters, species, reactions };
}

function normalizeFallbackSpecies(pattern: string): string {
  return pattern.replace(/\s+/g, '').replace(/::/g, ':');
}

function canonicalizeSpecies(pattern: string): string {
  try {
    const g = BNGLParser.parseSpeciesGraph(pattern);
    return GraphCanonicalizer.canonicalize(g);
  } catch {
    return normalizeFallbackSpecies(pattern);
  }
}

function buildCanonicalSpeciesByIndex(net: ParsedNet): Map<number, string> {
  const map = new Map<number, string>();
  for (const s of net.species) {
    map.set(s.index, canonicalizeSpecies(s.pattern));
  }
  return map;
}

function signatureFromReaction(
  reaction: ParsedNet['reactions'][number],
  canonicalByIndex: Map<number, string>,
): string | null {
  const reactants = reaction.reactants
    .filter((idx) => idx !== 0)
    .map((idx) => canonicalByIndex.get(idx))
    .filter((v): v is string => typeof v === 'string')
    .sort();

  const products = reaction.products
    .filter((idx) => idx !== 0)
    .map((idx) => canonicalByIndex.get(idx))
    .filter((v): v is string => typeof v === 'string')
    .sort();

  const reactantOk = reaction.reactants.filter((idx) => idx !== 0).length === reactants.length;
  const productOk = reaction.products.filter((idx) => idx !== 0).length === products.length;
  if (!reactantOk || !productOk) return null;

  return `${reactants.join(' + ')} => ${products.join(' + ')}`;
}

function evaluateRateCoeff(rateExpr: string, parameterMap: Map<string, number>): number {
  const expr = stripInlineComment(rateExpr);
  if (!expr) return Number.NaN;
  try {
    const v = BNGLParser.evaluateExpression(expr, parameterMap);
    return Number(v);
  } catch {
    const n = Number.parseFloat(expr);
    return Number.isFinite(n) ? n : Number.NaN;
  }
}

function aggregateReactions(net: ParsedNet): Map<string, AggregatedRate> {
  const canonicalByIndex = buildCanonicalSpeciesByIndex(net);
  const paramMap = new Map<string, number>();
  for (const p of net.parameters) {
    const v = evaluateRateCoeff(p.valueExpr, paramMap);
    if (Number.isFinite(v)) paramMap.set(p.name, v);
  }

  const agg = new Map<string, AggregatedRate>();

  for (const rxn of net.reactions) {
    const sig = signatureFromReaction(rxn, canonicalByIndex);
    if (!sig) continue;

    const coeff = evaluateRateCoeff(rxn.rateExpr, paramMap);
    const prev = agg.get(sig);
    if (!prev) {
      agg.set(sig, {
        count: 1,
        sumCoeff: Number.isFinite(coeff) ? coeff : 0,
        hasNumericCoeff: Number.isFinite(coeff),
        sampleRateExpr: rxn.rateExpr,
      });
      continue;
    }

    prev.count += 1;
    if (Number.isFinite(coeff)) {
      prev.sumCoeff += coeff;
      prev.hasNumericCoeff = prev.hasNumericCoeff || true;
    }
  }

  return agg;
}

function compareNetFiles(webNetPath: string, bngNetPath: string, top: number): ComparisonSummary {
  const webNet = parseNetFile(webNetPath);
  const bngNet = parseNetFile(bngNetPath);

  const webCanonByIndex = buildCanonicalSpeciesByIndex(webNet);
  const bngCanonByIndex = buildCanonicalSpeciesByIndex(bngNet);

  const webSpeciesSet = new Set(webCanonByIndex.values());
  const bngSpeciesSet = new Set(bngCanonByIndex.values());

  const missingSpecies = Array.from(bngSpeciesSet).filter((s) => !webSpeciesSet.has(s));
  const extraSpecies = Array.from(webSpeciesSet).filter((s) => !bngSpeciesSet.has(s));

  const webAgg = aggregateReactions(webNet);
  const bngAgg = aggregateReactions(bngNet);

  const missingSigs = Array.from(bngAgg.keys()).filter((k) => !webAgg.has(k));
  const extraSigs = Array.from(webAgg.keys()).filter((k) => !bngAgg.has(k));

  const overlap = Array.from(bngAgg.keys()).filter((k) => webAgg.has(k));
  const coeffMismatches: ComparisonSummary['rateCoefficientDiff']['mismatchesSample'] = [];
  let coeffChecked = 0;

  for (const key of overlap) {
    const b = bngAgg.get(key)!;
    const w = webAgg.get(key)!;
    if (!b.hasNumericCoeff || !w.hasNumericCoeff) continue;
    coeffChecked++;

    const absDiff = Math.abs(b.sumCoeff - w.sumCoeff);
    const denom = Math.max(Math.abs(b.sumCoeff), Math.abs(w.sumCoeff), 1e-30);
    const relDiff = absDiff / denom;
    if (absDiff > 1e-12 && relDiff > 1e-9) {
      coeffMismatches.push({
        signature: key,
        webCoeff: w.sumCoeff,
        bngCoeff: b.sumCoeff,
        absDiff,
        relDiff,
        webRateExpr: w.sampleRateExpr,
        bngRateExpr: b.sampleRateExpr,
      });
    }
  }

  coeffMismatches.sort((a, b) => b.absDiff - a.absDiff);

  return {
    web: {
      parameters: webNet.parameters.length,
      species: webNet.species.length,
      reactions: webNet.reactions.length,
    },
    bng: {
      parameters: bngNet.parameters.length,
      species: bngNet.species.length,
      reactions: bngNet.reactions.length,
    },
    speciesSetDiff: {
      missingInWeb: missingSpecies.length,
      extraInWeb: extraSpecies.length,
      missingSample: missingSpecies.slice(0, top),
      extraSample: extraSpecies.slice(0, top),
    },
    reactionSignatureDiff: {
      missingInWeb: missingSigs.length,
      extraInWeb: extraSigs.length,
      missingSample: missingSigs.slice(0, top),
      extraSample: extraSigs.slice(0, top),
    },
    rateCoefficientDiff: {
      checked: coeffChecked,
      mismatches: coeffMismatches.length,
      mismatchesSample: coeffMismatches.slice(0, top),
    },
  };
}

function printSummary(summary: ComparisonSummary): void {
  console.log('='.repeat(80));
  console.log('NET PARITY SUMMARY');
  console.log('='.repeat(80));
  console.log(`Web net: params=${summary.web.parameters}, species=${summary.web.species}, reactions=${summary.web.reactions}`);
  console.log(`BNG net: params=${summary.bng.parameters}, species=${summary.bng.species}, reactions=${summary.bng.reactions}`);
  console.log('');
  console.log(`Species set diff: missingInWeb=${summary.speciesSetDiff.missingInWeb}, extraInWeb=${summary.speciesSetDiff.extraInWeb}`);
  console.log(`Reaction signature diff: missingInWeb=${summary.reactionSignatureDiff.missingInWeb}, extraInWeb=${summary.reactionSignatureDiff.extraInWeb}`);
  console.log(`Rate coefficient diff: checked=${summary.rateCoefficientDiff.checked}, mismatches=${summary.rateCoefficientDiff.mismatches}`);
}

function hasMismatch(summary: ComparisonSummary): boolean {
  return summary.speciesSetDiff.missingInWeb > 0
    || summary.speciesSetDiff.extraInWeb > 0
    || summary.reactionSignatureDiff.missingInWeb > 0
    || summary.reactionSignatureDiff.extraInWeb > 0
    || summary.rateCoefficientDiff.mismatches > 0;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const webNetPath = path.resolve(args.webNet);
  const bngNetPath = path.resolve(args.bngNet);

  const summary = compareNetFiles(webNetPath, bngNetPath, args.top);

  if (args.json) {
    console.log(JSON.stringify({
      webNetPath,
      bngNetPath,
      summary,
    }, null, 2));
  } else {
    printSummary(summary);
  }

  if (args.failOnMismatch && hasMismatch(summary)) {
    process.exitCode = 2;
  }
}

main();
