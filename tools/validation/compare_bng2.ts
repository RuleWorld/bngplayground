/**
 * Compare our parser output against BNG2.pl reference output (.net files)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NetworkGenerator } from '@bngplayground/engine';
import { BNGLParser } from '@bngplayground/engine';
import { GraphCanonicalizer } from '@bngplayground/engine';
import { parseBNGL } from '../../services/parseBNGL.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const ROOT_DIR = PROJECT_ROOT;

interface BNG2Species {
  index: number;
  pattern: string;
  concentration: string;
}

interface BNG2Reaction {
  index: number;
  reactants: number[];
  products: number[];
  rate: string;
}

interface BNG2Network {
  species: BNG2Species[];
  reactions: BNG2Reaction[];
}

function parseArgs(argv: string[]) {
  const out: { net?: string; dir?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--net' || a === '--netFile') {
      out.net = argv[i + 1];
      i++;
    } else if (a === '--dir' || a === '--netDir') {
      out.dir = argv[i + 1];
      i++;
    }
  }
  return out;
}

function stripNetComment(s: string): string {
  // BNG2 reaction lines often include an inline comment: "rate #ruleName"
  // Keep only the expression before '#'.
  const idx = s.indexOf('#');
  return (idx >= 0 ? s.slice(0, idx) : s).trim();
}

function canonicalizeSpeciesText(speciesText: string): string {
  const g = BNGLParser.parseSpeciesGraph(speciesText);
  return GraphCanonicalizer.canonicalize(g);
}

function buildCanonicalByIndexFromBng2Net(net: BNG2Network): Map<number, string> {
  const out = new Map<number, string>();
  for (const s of net.species) {
    try {
      out.set(s.index, canonicalizeSpeciesText(s.pattern));
    } catch {
      // ignore
    }
  }
  return out;
}

function buildCanonicalByIndexFromOurNetwork(ourSpecies: Array<{ graph: any }>): string[] {
  return ourSpecies.map((s) => GraphCanonicalizer.canonicalize(s.graph));
}

type RxnSig = string;
interface RateAgg {
  count: number;
  sumCoeff: number;
  sample: { reactants: string[]; products: string[] };
  ruleNames: Map<string, number>;
}

function makeRxnSig(reactantsCanon: string[], productsCanon: string[]): RxnSig {
  const r = reactantsCanon.slice().sort().join(' + ');
  const p = productsCanon.slice().sort().join(' + ');
  return `${r} => ${p}`;
}

function aggAdd(
  map: Map<RxnSig, RateAgg>,
  sig: RxnSig,
  coeff: number,
  sample: RateAgg['sample'],
  ruleName?: string
) {
  const prev = map.get(sig);
  if (!prev) {
    const ruleNames = new Map<string, number>();
    if (ruleName) ruleNames.set(ruleName, 1);
    map.set(sig, { count: 1, sumCoeff: coeff, sample, ruleNames });
    return;
  }
  prev.count += 1;
  prev.sumCoeff += coeff;
  if (ruleName) {
    prev.ruleNames.set(ruleName, (prev.ruleNames.get(ruleName) ?? 0) + 1);
  }
}

function topRuleNames(agg: RateAgg, max = 3): string {
  const entries = Array.from(agg.ruleNames.entries())
    .filter(([name]) => name && name.trim())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([name, n]) => `${name}${n > 1 ? `(${n})` : ''}`);
  return entries.length > 0 ? entries.join(', ') : '<unknown>';
}

function evaluateNetRateExpr(expr: string, parametersMap: Map<string, number>): number {
  const cleaned = stripNetComment(expr);
  if (!cleaned) return NaN;
  try {
    const val = BNGLParser.evaluateExpression(cleaned, parametersMap as any);
    return Number(val);
  } catch {
    // Fallback: sometimes the rate is already numeric.
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }
}

/**
 * Parse a BNG2 .net file to extract species and reactions
 */
function parseBNG2NetFile(content: string): BNG2Network {
  const lines = content.split('\n');
  const species: BNG2Species[] = [];
  const reactions: BNG2Reaction[] = [];

  let inSpecies = false;
  let inReactions = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'begin species') {
      inSpecies = true;
      continue;
    }
    if (trimmed === 'end species') {
      inSpecies = false;
      continue;
    }
    if (trimmed === 'begin reactions') {
      inReactions = true;
      continue;
    }
    if (trimmed === 'end reactions') {
      inReactions = false;
      continue;
    }

    if (inSpecies && trimmed && !trimmed.startsWith('#')) {
      // Format: index pattern concentration
      const match = trimmed.match(/^\s*(\d+)\s+(\S+)\s+(\S+)/);
      if (match) {
        species.push({
          index: parseInt(match[1]),
          pattern: match[2],
          concentration: match[3]
        });
      }
    }

    if (inReactions && trimmed && !trimmed.startsWith('#')) {
      // Format: index reactant_indices product_indices rate
      // e.g., "1 1,2 3 kf"
      const match = trimmed.match(/^\s*(\d+)\s+([0-9,]+)\s+([0-9,]+)\s+(.+)/);
      if (match) {
        reactions.push({
          index: parseInt(match[1]),
          reactants: match[2].split(',').map(Number),
          products: match[3].split(',').map(Number),
          rate: match[4].trim()
        });
      }
    }
  }

  return { species, reactions };
}

/**
 * Normalize a species string for comparison
 * - Parse molecule and components, then sort them
 */
function normalizeSpecies(pattern: string): string {
  // Parse molecules and sort components within each molecule
  // Format: Mol1(comp1,comp2).Mol2(comp3,comp4)
  try {
    const molecules = pattern.split('.');
    const normalized = molecules.map(mol => {
      const match = mol.match(/^(\w+)\(([^)]*)\)$/);
      if (!match) return mol.toLowerCase();
      const [, name, compsStr] = match;
      const comps = compsStr.split(',').map(c => c.trim()).filter(c => c).sort();
      return `${name.toLowerCase()}(${comps.join(',')})`;
    }).sort();
    return normalized.join('.');
  } catch {
    return pattern.toLowerCase().replace(/\s+/g, '');
  }
}

function compareReactionsCanonical(
  bng2: BNG2Network,
  ourNetwork: { species: any[]; reactions: any[] },
  parametersMap: Map<string, number>
): {
  bng2Agg: Map<RxnSig, RateAgg>;
  ourAgg: Map<RxnSig, RateAgg>;
  missing: Array<{ sig: RxnSig; bng2: RateAgg }>;
  extra: Array<{ sig: RxnSig; ours: RateAgg }>;
  rateMismatches: Array<{ sig: RxnSig; bng2: RateAgg; ours: RateAgg; absDiff: number; relDiff: number }>;
} {
  const bng2CanonByIndex = buildCanonicalByIndexFromBng2Net(bng2);
  const ourCanonByIndex = buildCanonicalByIndexFromOurNetwork(ourNetwork.species);

  const bng2Agg = new Map<RxnSig, RateAgg>();
  const ourAgg = new Map<RxnSig, RateAgg>();

  for (const rxn of bng2.reactions) {
    const reactantsCanon = rxn.reactants
      .map((i) => bng2CanonByIndex.get(i))
      .filter((x): x is string => typeof x === 'string');
    const productsCanon = rxn.products
      .map((i) => bng2CanonByIndex.get(i))
      .filter((x): x is string => typeof x === 'string');
    if (reactantsCanon.length !== rxn.reactants.length || productsCanon.length !== rxn.products.length) {
      continue;
    }
    const sig = makeRxnSig(reactantsCanon, productsCanon);
    const coeff = evaluateNetRateExpr(rxn.rate, parametersMap);
    // Capture rule name from inline comment if present: "k #RuleName".
    const idx = rxn.rate.indexOf('#');
    const ruleName = idx >= 0 ? rxn.rate.slice(idx + 1).trim() : undefined;
    aggAdd(bng2Agg, sig, coeff, { reactants: reactantsCanon, products: productsCanon }, ruleName);
  }

  for (const rxn of ourNetwork.reactions) {
    const reactantsCanon = rxn.reactants
      .map((i: number) => ourCanonByIndex[i])
      .filter((x: unknown): x is string => typeof x === 'string');
    const productsCanon = rxn.products
      .map((i: number) => ourCanonByIndex[i])
      .filter((x: unknown): x is string => typeof x === 'string');
    if (reactantsCanon.length !== rxn.reactants.length || productsCanon.length !== rxn.products.length) {
      continue;
    }

    const sig = makeRxnSig(reactantsCanon, productsCanon);
    const propensity = (rxn as any).propensityFactor ?? 1;
    const rateExpr = (rxn as any).rateExpression as string | undefined;
    let coeff = Number(rxn.rate) * Number(propensity);
    if (rateExpr) {
      const evaluated = evaluateNetRateExpr(rateExpr, parametersMap);
      coeff = Number(rxn.rate) * Number(propensity) * evaluated;
    }
    const ruleName = (rxn as any).name as string | undefined;
    aggAdd(ourAgg, sig, coeff, { reactants: reactantsCanon, products: productsCanon }, ruleName);
  }

  const missing: Array<{ sig: RxnSig; bng2: RateAgg }> = [];
  const extra: Array<{ sig: RxnSig; ours: RateAgg }> = [];
  const rateMismatches: Array<{ sig: RxnSig; bng2: RateAgg; ours: RateAgg; absDiff: number; relDiff: number }> = [];

  for (const [sig, b] of bng2Agg.entries()) {
    const o = ourAgg.get(sig);
    if (!o) {
      missing.push({ sig, bng2: b });
      continue;
    }

    const absDiff = Math.abs(b.sumCoeff - o.sumCoeff);
    const denom = Math.max(Math.abs(b.sumCoeff), Math.abs(o.sumCoeff), 1e-30);
    const relDiff = absDiff / denom;
    if (absDiff > 1e-12 && relDiff > 1e-12) {
      rateMismatches.push({ sig, bng2: b, ours: o, absDiff, relDiff });
    }
  }

  for (const [sig, o] of ourAgg.entries()) {
    if (!bng2Agg.has(sig)) {
      extra.push({ sig, ours: o });
    }
  }

  rateMismatches.sort((a, b) => b.absDiff - a.absDiff);
  return { bng2Agg, ourAgg, missing, extra, rateMismatches };
}

/**
 * Find corresponding BNGL model for a .net file
 */
function findBnglModel(netFile: string): string | null {
  const baseName = path.basename(netFile, '.net');

  // Try different name patterns
  const patterns = [
    // temp_test_ModelName_bngl.net -> published-models/**/ModelName.bngl
    baseName.replace(/^temp_test_/, '').replace(/_bngl.*$/, ''),
    // temp_mapk.net -> published-models/**/mapk.bngl
    baseName.replace(/^temp_/, ''),
  ];

  const publishedModelsDir = path.join(ROOT_DIR, 'published-models');
  const bngTestOutputDir = path.join(ROOT_DIR, 'bng_test_output');
  const publicModelsDir = path.join(ROOT_DIR, 'public', 'models');

  function searchDir(dir: string, targetName: string): string | null {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        const found = searchDir(fullPath, targetName);
        if (found) return found;
      } else if (item.name.toLowerCase() === targetName.toLowerCase() + '.bngl') {
        return fullPath;
      }
    }
    return null;
  }

  // 1) Fast paths (non-recursive) for this repo's common model locations.
  for (const pattern of patterns) {
    const directCandidates = [
      path.join(bngTestOutputDir, `${pattern}.bngl`),
      path.join(publicModelsDir, `${pattern}.bngl`),
    ];
    for (const candidate of directCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  // 2) Back-compat recursive search for older layouts.
  if (fs.existsSync(publishedModelsDir)) {
    for (const pattern of patterns) {
      const found = searchDir(publishedModelsDir, pattern);
      if (found) return found;
    }
  }

  return null;
}

interface ComparisonResult {
  netFile: string;
  bnglFile: string | null;
  bng2Species: number;
  ourSpecies: number;
  bng2Reactions: number;
  ourReactions: number;
  speciesMatch: boolean;
  reactionsMatch: boolean;
  speciesDiff: string[];
  error?: string;
}

async function compareModel(
  netFilePath: string,
  options: { verboseRxnDiff?: boolean } = {}
): Promise<ComparisonResult> {
  const netFileName = path.basename(netFilePath);
  console.log(`\nComparing ${netFileName}...`);

  const result: ComparisonResult = {
    netFile: netFileName,
    bnglFile: null,
    bng2Species: 0,
    ourSpecies: 0,
    bng2Reactions: 0,
    ourReactions: 0,
    speciesMatch: false,
    reactionsMatch: false,
    speciesDiff: []
  };

  try {
    // Parse BNG2 .net file
    const netContent = fs.readFileSync(netFilePath, 'utf8');
    const bng2Network = parseBNG2NetFile(netContent);
    result.bng2Species = bng2Network.species.length;
    result.bng2Reactions = bng2Network.reactions.length;

    // Find corresponding BNGL model
    const bnglPath = findBnglModel(netFilePath);
    if (!bnglPath) {
      result.error = 'Could not find corresponding BNGL model';
      return result;
    }
    result.bnglFile = path.basename(bnglPath);

    // Parse with our parser
    const bnglCode = fs.readFileSync(bnglPath, 'utf8');
    const model = parseBNGL(bnglCode);

    const seedSpecies = model.species.map(s => BNGLParser.parseSpeciesGraph(s.name));

    // Build numeric parameters map for evaluating BNG2 .net rate expressions.
    const parametersMap = new Map<string, number>();
    for (const [k, v] of Object.entries(model.parameters ?? {})) {
      const n = Number(v);
      if (Number.isFinite(n)) parametersMap.set(k, n);
    }

    const rules = model.reactionRules.flatMap(r => {
      const rate = model.parameters[r.rate] ?? parseFloat(r.rate);
      const reverseRate = r.reverseRate ? (model.parameters[r.reverseRate] ?? parseFloat(r.reverseRate)) : rate;
      const ruleStr = `${r.reactants.join(' + ')} -> ${r.products.join(' + ')}`;

      try {
        const forwardRule = BNGLParser.parseRxnRule(ruleStr, rate);
        // Preserve rule name for debugging/attribution.
        (forwardRule as any).name = (r as any).name ?? (r as any).id ?? (r as any).label ?? forwardRule.name;
        if (r.constraints && r.constraints.length > 0) {
          forwardRule.applyConstraints(r.constraints, (s) => BNGLParser.parseSpeciesGraph(s));
        }

        if (r.isBidirectional) {
          const reverseRuleStr = `${r.products.join(' + ')} -> ${r.reactants.join(' + ')}`;
          const reverseRule = BNGLParser.parseRxnRule(reverseRuleStr, reverseRate);
          (reverseRule as any).name = ((forwardRule as any).name ? `${(forwardRule as any).name}_rev` : reverseRule.name);
          return [forwardRule, reverseRule];
        }
        return [forwardRule];
      } catch {
        return [];
      }
    });

    const generatorOptions = {
      maxSpecies: 5000,
      maxReactions: 5000,
      maxIterations: model.networkOptions?.maxIter ?? 50,
      maxAgg: model.networkOptions?.maxAgg ?? 50,
      maxStoich: (model.networkOptions?.maxStoich ?? 100) as any,
      partialReturnOnLimit: true
    };

    const generator = new NetworkGenerator(generatorOptions);
    const ourNetwork = await generator.generate(seedSpecies, rules, () => { });

    result.ourSpecies = ourNetwork.species.length;
    result.ourReactions = ourNetwork.reactions.length;

    // Compare species counts
    result.speciesMatch = result.bng2Species === result.ourSpecies;
    result.reactionsMatch = result.bng2Reactions === result.ourReactions;

    // Find species differences
    const bng2SpeciesSet = new Set(bng2Network.species.map(s => normalizeSpecies(s.pattern)));
    const ourSpeciesSet = new Set(ourNetwork.species.map(s => normalizeSpecies(s.toString())));

    // Species in BNG2 but not in ours
    const missingInOurs: string[] = [];
    for (const s of bng2Network.species) {
      const normalized = normalizeSpecies(s.pattern);
      if (!ourSpeciesSet.has(normalized)) {
        missingInOurs.push(s.pattern);
      }
    }

    // Species in ours but not in BNG2
    const extraInOurs: string[] = [];
    for (const s of ourNetwork.species) {
      const normalized = normalizeSpecies(s.toString());
      if (!bng2SpeciesSet.has(normalized)) {
        extraInOurs.push(s.toString());
      }
    }

    if (missingInOurs.length > 0) {
      result.speciesDiff.push(`Missing in ours (${missingInOurs.length}): ${missingInOurs.slice(0, 5).join(', ')}${missingInOurs.length > 5 ? '...' : ''}`);
    }
    if (extraInOurs.length > 0) {
      result.speciesDiff.push(`Extra in ours (${extraInOurs.length}): ${extraInOurs.slice(0, 5).join(', ')}${extraInOurs.length > 5 ? '...' : ''}`);
    }

    // Reaction-level diff (canonical + rate coefficient)
    const rxnCmp = compareReactionsCanonical(bng2Network, ourNetwork as any, parametersMap);
    if (rxnCmp.missing.length > 0) {
      result.speciesDiff.push(`Missing reactions (canonical) in ours: ${rxnCmp.missing.length}`);
    }
    if (rxnCmp.extra.length > 0) {
      result.speciesDiff.push(`Extra reactions (canonical) in ours: ${rxnCmp.extra.length}`);
    }
    if (rxnCmp.rateMismatches.length > 0) {
      const worst = rxnCmp.rateMismatches[0];
      result.speciesDiff.push(
        `Rate mismatches (canonical): ${rxnCmp.rateMismatches.length} (worst abs=${worst.absDiff.toExponential(6)}, rel=${worst.relDiff.toExponential(3)})`
      );
    }

    if (options.verboseRxnDiff) {
      const showN = 12;
      if (rxnCmp.missing.length > 0) {
        console.log(`\n=== Missing reactions in ours (canonical, first ${showN}) ===`);
        for (const m of rxnCmp.missing.slice(0, showN)) {
          console.log(`- coeff=${m.bng2.sumCoeff} count=${m.bng2.count} rules=${topRuleNames(m.bng2)} :: ${m.sig}`);
        }
      }
      if (rxnCmp.extra.length > 0) {
        console.log(`\n=== Extra reactions in ours (canonical, first ${showN}) ===`);
        for (const e of rxnCmp.extra.slice(0, showN)) {
          console.log(`- coeff=${e.ours.sumCoeff} count=${e.ours.count} rules=${topRuleNames(e.ours)} :: ${e.sig}`);
        }
      }
      if (rxnCmp.rateMismatches.length > 0) {
        console.log(`\n=== Rate coefficient mismatches (first ${showN}) ===`);
        for (const mm of rxnCmp.rateMismatches.slice(0, showN)) {
          console.log(
            `- abs=${mm.absDiff} rel=${mm.relDiff} :: bng2=${mm.bng2.sumCoeff} (count=${mm.bng2.count}, rules=${topRuleNames(mm.bng2)}) vs ours=${mm.ours.sumCoeff} (count=${mm.ours.count}, rules=${topRuleNames(mm.ours)}) :: ${mm.sig}`
          );
        }
      }
    }

  } catch (e: any) {
    result.error = e.message;
  }

  return result;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  let netFiles: string[] = [];

  if (args.net) {
    netFiles = [path.resolve(ROOT_DIR, args.net)];
  } else if (args.dir) {
    const dirPath = path.resolve(ROOT_DIR, args.dir);
    netFiles = fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.net'))
      .map(f => path.join(dirPath, f));
  } else {
    // Backward-compatible default: compare temp_*.net in repo root
    netFiles = fs.readdirSync(ROOT_DIR)
      .filter(f => f.startsWith('temp_') && f.endsWith('.net'))
      .map(f => path.join(ROOT_DIR, f));
  }

  console.log(`Found ${netFiles.length} BNG2 .net files to compare against.\n`);

  const results: ComparisonResult[] = [];

  for (const netFile of netFiles) {
    const result = await compareModel(netFile, { verboseRxnDiff: !!args.net });
    results.push(result);

    const speciesStatus = result.speciesMatch ? '✅' : (Math.abs(result.bng2Species - result.ourSpecies) <= 2 ? '⚠️' : '❌');
    const reactionsStatus = result.reactionsMatch ? '✅' : (Math.abs(result.bng2Reactions - result.ourReactions) <= 5 ? '⚠️' : '❌');

    if (result.error) {
      console.log(`❌ ${result.netFile}: ${result.error}`);
    } else {
      console.log(`${speciesStatus} Species: BNG2=${result.bng2Species} vs Ours=${result.ourSpecies}`);
      console.log(`${reactionsStatus} Reactions: BNG2=${result.bng2Reactions} vs Ours=${result.ourReactions}`);
      if (result.speciesDiff.length > 0) {
        result.speciesDiff.forEach(d => console.log(`   ${d}`));
      }
    }
  }

  console.log('\n=== SUMMARY ===');
  const matched = results.filter(r => r.speciesMatch && r.reactionsMatch && !r.error).length;
  const closeMatch = results.filter(r => !r.error && !r.speciesMatch && Math.abs(r.bng2Species - r.ourSpecies) <= 2).length;
  const failed = results.filter(r => r.error).length;
  const mismatch = results.length - matched - closeMatch - failed;

  console.log(`Exact match (species & reactions): ${matched}/${results.length}`);
  console.log(`Close match (within 2 species): ${closeMatch}/${results.length}`);
  console.log(`Mismatch: ${mismatch}/${results.length}`);
  console.log(`Errors/Missing: ${failed}/${results.length}`);

  // Print detailed mismatches
  const mismatches = results.filter(r => !r.error && !r.speciesMatch);
  if (mismatches.length > 0) {
    console.log('\n=== MISMATCHES ===');
    for (const m of mismatches) {
      console.log(`\n${m.netFile} (${m.bnglFile}):`);
      console.log(`  BNG2: ${m.bng2Species} species, ${m.bng2Reactions} reactions`);
      console.log(`  Ours: ${m.ourSpecies} species, ${m.ourReactions} reactions`);
      m.speciesDiff.forEach(d => console.log(`  ${d}`));
    }
  }
}

run();
