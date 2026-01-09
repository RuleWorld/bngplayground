// @ts-nocheck
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator';
import { describe, it, expect } from 'vitest';

const digestBNGL = `
begin model

begin parameters
  k_bind 0.01
  k_unbind 0.002
  k_convert 0.03
end parameters

begin molecule types
  Lig(site)
  Rec(site)
  Prod()
end molecule types

begin seed species
  Lig(site) 75
  Rec(site) 50
end seed species

begin reaction rules
  Lig(site) + Rec(site) <-> Lig(site!1).Rec(site!1) k_bind, k_unbind
  Lig(site!1).Rec(site!1) -> Rec(site) + Prod() k_convert
end reaction rules

end model
`;

describe('Digest model expansion', () => {
  it('expand digest model end-to-end', async () => {
    const bngl = digestBNGL;

    const getBlock = (name: string) => {
      const re = new RegExp('begin\\s+' + name + '([\\s\\S]*?)end\\s+' + name, 'i');
      const m = bngl.match(re);
      return m ? m[1].trim() : '';
    };

    const paramsBlock = getBlock('parameters');
    const seedsBlock = getBlock('seed species');
    const rulesBlock = getBlock('reaction rules');

    const parameters: Record<string, number> = {};
    for (const raw of paramsBlock.split(/\r?\n/)) {
      const line = raw.split('#')[0].trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 2) parameters[parts[0]] = parseFloat(parts[1]);
    }

    const seedMap = BNGLParser.parseSeedSpecies(seedsBlock, new Map(Object.entries(parameters)));
    const seedSpecies = Array.from(seedMap.keys());
    const seedGraphs = seedSpecies.map(s => BNGLParser.parseSpeciesGraph(s));

    // collect rule statements
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

    const rules: any[] = [];
    for (const stmt of statements) {
      const arrowRegex = /(?:<->|->|<-|~>)/;
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
        // ignore parse errors for now
      }
    }

    const gen = new NetworkGenerator({ maxSpecies: 10000, maxIterations: 200 });
    const result = await gen.generate(seedGraphs, rules, undefined, undefined);

    console.log('expandDigest result species:', result.species.length, 'reactions:', result.reactions.length);
    // Expect >0 reactions for a correctly parsed model
    expect(result.reactions.length).toBeGreaterThan(0);
  });
});

