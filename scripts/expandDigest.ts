import fs from 'fs';
import path from 'path';
import { BNGLParser } from '../packages/engine/src/services/graph/core/BNGLParser';
import { NetworkGenerator } from '../packages/engine/src/services/graph/NetworkGenerator';

const root = path.resolve(__dirname, '..');
const digestPath = path.join(root, 'digest.txt');
const bngl = fs.readFileSync(digestPath, 'utf8');

const getBlock = (name: string) => {
  const re = new RegExp('begin\\s+' + name + '([\\s\\S]*?)end\\s+' + name, 'i');
  const m = bngl.match(re);
  return m ? m[1].trim() : '';
};

const paramsBlock = getBlock('parameters');
const molTypesBlock = getBlock('molecule types');
const seedsBlock = getBlock('seed species');
const rulesBlock = getBlock('reaction rules');

// parse parameters
const parameters: Record<string, number> = {};
for (const raw of paramsBlock.split(/\r?\n/)) {
  const line = raw.split('#')[0].trim();
  if (!line) continue;
  const parts = line.split(/\s+/);
  if (parts.length >= 2) parameters[parts[0]] = parseFloat(parts[1]);
}

console.log('Loaded parameters:', Object.keys(parameters).length);

// parse seeds
const seedMap = BNGLParser.parseSeedSpecies(seedsBlock, new Map(Object.entries(parameters)));
const seedSpecies = Array.from(seedMap.keys());
console.log('Parsed seed species count:', seedSpecies.length);

const seedGraphs = seedSpecies.map(s => {
  try {
    const g = BNGLParser.parseSpeciesGraph(s);
    return g;
  } catch (e) {
    console.error('Failed to parse seed species', s, e);
    return undefined;
  }
}).filter(Boolean) as any[];

// helper to split products and rate tokens (copied logic)
const splitProductsAndRates = (segment: string) => {
  const tokens = segment.trim().split(/\s+/);
  if (tokens.length === 0) return { productChunk: '', rateChunk: '' };
  const rateTokens: string[] = [];
  while (tokens.length > 0) {
    const token = tokens[tokens.length - 1];
    const cleaned = token.replace(/,$/, '');
    const isParam = Object.prototype.hasOwnProperty.call(parameters, cleaned);
    const numeric = cleaned !== '' && !Number.isNaN(parseFloat(cleaned));
    const singleZeroProduct = tokens.length === 1 && cleaned === '0';
    if ((!isParam && !numeric) || singleZeroProduct) break;
    rateTokens.push(cleaned);
    tokens.pop();
  }
  return { productChunk: tokens.join(' ').trim(), rateChunk: rateTokens.reverse().join(' ').trim() };
};

// parse rules into BNGLParser.parseRxnRule
const statements: string[] = [];
{
  let current = '';
  for (const raw of rulesBlock.split(/\r?\n/)) {
    const cleaned = raw.replace(/#.*$/,'').trim();
    if (!cleaned) continue;
    if (cleaned.endsWith('\\')) {
      current += cleaned.slice(0,-1).trim() + ' ';
    } else {
      current += cleaned;
      statements.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) statements.push(current.trim());
}

console.log('Found rule statements:', statements.length);

const rules: any[] = [];
for (const stmt of statements) {
  // find arrow
  const arrowRegex = /(?:<->|->|<-|~>)/;
  const m = stmt.match(arrowRegex);
  if (!m) {
    console.warn('Skipping rule without arrow:', stmt.slice(0,120));
    continue;
  }
  const parts = stmt.split(arrowRegex).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) continue;

  const lhs = parts[0];
  const rhsPlus = parts.slice(1).join(' ');
  const { productChunk, rateChunk } = splitProductsAndRates(rhsPlus);
  const rateToken = rateChunk.split(',')[0] || '';
  const rateVal = parameters[rateToken] ?? (rateToken ? parseFloat(rateToken) : NaN);
  const ruleStr = `${lhs} -> ${productChunk || '0'}`;
  try {
    const rateNum = Number.isFinite(rateVal) ? rateVal : 1.0;
    const rxnRule = BNGLParser.parseRxnRule(ruleStr, rateNum, stmt);
    rules.push(rxnRule);
  } catch (e) {
    console.error('Failed to parse rule:', stmt.slice(0,200), e);
  }
}

console.log('Parsed RxnRule count:', rules.length);

(async () => {
  try {
    const gen = new NetworkGenerator({ maxSpecies: 10000, maxIterations: 200 });
    const result = await gen.generate(seedGraphs, rules as any[], (p) => {
      // minimal progress
      if (p.iteration % 50 === 0) console.log('progress', p);
    });

    console.log('Generated species:', result.species.length, 'reactions:', result.reactions.length);
    console.log('Sample species:', result.species.slice(0,10).map(s=>s.graph.toString()));
    console.log('Sample reactions:', result.reactions.slice(0,10).map(r => ({ reactants: r.reactants.map(i=>result.species[i].graph.toString()), products: r.products.map(i=>result.species[i].graph.toString()), rate: r.rate })));
  } catch (e) {
    console.error('Generation failed', e);
    process.exitCode = 2;
  }
})();
