// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { EXAMPLES } from '../constants';
import { parseBNGL } from '../services/parseBNGL';
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { NetworkGenerator } from '../src/services/graph/NetworkGenerator';
import { GraphCanonicalizer } from '../src/services/graph/core/Canonical';
import type { BNGLModel } from '../types';

const MAX_SPECIES = 1500;
const MAX_REACTIONS = 20000;
const MAX_ITERATIONS = 150;
const MAX_COMPLEX_SIZE = 500;

const RUNAWAY_EXAMPLE_IDS = new Set<string>();

const formatSpeciesList = (list: string[]) => (list.length > 0 ? list.join(' + ') : '0');

async function generateNetworkForModel(model: BNGLModel) {
  const seedSpecies = model.species.map((s) => BNGLParser.parseSpeciesGraph(s.name));

  const parametersMap = new Map(Object.entries(model.parameters || {}));
  const observableNames = new Set((model.observables || []).map((o) => o.name));
  const functionNames = new Set((model.functions || []).map((f) => f.name));

  const isFunctionalRateExpr = (rateExpr: string): boolean => {
    if (!rateExpr) return false;
    for (const obsName of observableNames) {
      if (new RegExp(`\\b${obsName}\\b`).test(rateExpr)) return true;
    }
    for (const funcName of functionNames) {
      if (new RegExp(`\\b${funcName}\\s*\\(`).test(rateExpr)) return true;
    }
    return false;
  };

  const evalRate = (rateExpr: string): number => {
    try {
      const v = BNGLParser.evaluateExpression(rateExpr, parametersMap);
      return Number.isFinite(v) ? v : 0;
    } catch {
      return 0;
    }
  };

  const rules = model.reactionRules.flatMap((r) => {
    const ruleStr = `${formatSpeciesList(r.reactants)} -> ${formatSpeciesList(r.products)}`;

    const isForwardFunctional = isFunctionalRateExpr(r.rate);
    const rate = isForwardFunctional ? 0 : evalRate(r.rate);

    const forward = BNGLParser.parseRxnRule(ruleStr, rate, `${r.reactants.join('+')}->${r.products.join('+')}`);
    if (isForwardFunctional) {
      (forward as any).rateExpression = r.rate;
      (forward as any).isFunctionalRate = true;
    }

    if (r.constraints && r.constraints.length > 0) {
      forward.applyConstraints(r.constraints, (s) => BNGLParser.parseSpeciesGraph(s));
    }

    if (r.isBidirectional) {
      const reverseStr = `${formatSpeciesList(r.products)} -> ${formatSpeciesList(r.reactants)}`;

      const reverseExpr = r.reverseRate ?? r.rate;
      const isReverseFunctional = isFunctionalRateExpr(reverseExpr);
      const reverseRate = isReverseFunctional ? 0 : evalRate(reverseExpr);

      const reverse = BNGLParser.parseRxnRule(reverseStr, reverseRate, `${r.products.join('+')}->${r.reactants.join('+')}`);
      if (isReverseFunctional) {
        (reverse as any).rateExpression = reverseExpr;
        (reverse as any).isFunctionalRate = true;
      }

      if (r.constraints && r.constraints.length > 0) {
        reverse.applyConstraints(r.constraints, (s) => BNGLParser.parseSpeciesGraph(s));
      }
      return [forward, reverse];
    }

    return [forward];
  });

  const generator = new NetworkGenerator({
    maxSpecies: MAX_SPECIES,
    maxReactions: MAX_REACTIONS,
    maxIterations: MAX_ITERATIONS,
    maxAgg: MAX_COMPLEX_SIZE,
    maxStoich: MAX_COMPLEX_SIZE,
    checkInterval: 250,
    memoryLimit: 5e8,
    compartments: model.compartments?.map((c) => ({
      name: c.name,
      dimension: c.dimension,
      size: c.size,
      parent: c.parent,
    })),
  });

  return generator.generate(seedSpecies, rules);
}

describe('Example gallery models', () => {
  EXAMPLES.forEach((example) => {
    it(`generates a finite network for ${example.name}`, async () => {
      const model = parseBNGL(example.code);
      expect(model.species.length).toBeGreaterThan(0);
      expect(model.reactionRules.length).toBeGreaterThan(0);

      const resultPromise = generateNetworkForModel(model);
      const isRunaway = RUNAWAY_EXAMPLE_IDS.has(example.id);

      if (isRunaway) {
        await expect(resultPromise).rejects.toMatchObject({
          name: 'NetworkGenerationLimitError',
          message: expect.stringContaining('rule "'),
        });
        return;
      }

      const result = await resultPromise;

      expect(result.species.length).toBeGreaterThan(0);
      expect(result.reactions.length).toBeGreaterThan(0);
      expect(result.species.length).toBeLessThanOrEqual(MAX_SPECIES);
      expect(result.reactions.length).toBeLessThanOrEqual(MAX_REACTIONS);

      const canonicalSeen = new Set<string>();
      for (const species of result.species) {
        const canonical = GraphCanonicalizer.canonicalize(species.graph);
        expect(canonicalSeen.has(canonical)).toBe(false);
        canonicalSeen.add(canonical);

        expect(species.graph.molecules.length).toBeLessThanOrEqual(MAX_COMPLEX_SIZE);

        const rendered = BNGLParser.speciesGraphToString(species.graph);
        expect(rendered.includes('undefined')).toBe(false);
        expect(rendered.includes('[object')).toBe(false);
      }

      for (const reaction of result.reactions) {
        expect(Number.isFinite(reaction.rate)).toBe(true);
      }
    }, 20000);
  });
});

