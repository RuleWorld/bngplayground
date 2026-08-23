import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBNGLStrict } from '../packages/engine/src/parser/BNGLParserWrapper';
import { generateExpandedNetwork } from '../packages/engine/src/services/simulation/NetworkExpansion';
import { simulate } from '../packages/engine/src/services/simulation/SimulationLoop';
import { computeFIM } from '../packages/engine/src/services/analysis/FisherInformationMatrix';
import { analyzeReactionInformation } from '../packages/engine/src/services/analysis/ReactionInformationTheory';

const rulehubRoot = process.env.RULEHUB_ROOT || '';
const modelPath = rulehubRoot
  ? `${rulehubRoot}/Published/vilar2002/vilar_2002.bngl`
  : '';
const maybeIt = modelPath && existsSync(modelPath) ? it : it.skip;

describe('Circadian Oscillator Vilar 2002 Analysis', () => {
  maybeIt('should successfully execute the full diagnostic workflow', async () => {
    // 1. Read and Parse
    let modelCode = readFileSync(modelPath, 'utf8');
    modelCode = modelCode.replace(/molecular\s+types/gi, 'molecule types');
    const parsed = parseBNGLStrict(modelCode);
    expect(parsed.reactionRules.length).toBeGreaterThan(0);
    expect(parsed.species.length).toBeGreaterThan(0);

    // 2. Expand Network
    const expanded = await generateExpandedNetwork(parsed, () => {}, () => {});
    expect(expanded.species.length).toBeGreaterThan(0);
    expect(expanded.reactions.length).toBeGreaterThan(0);

    // 3. FIM Analysis
    const parametersToAnalyze = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10'];
    const baseParameters: Record<string, number> = {
      k1: 0.01, k2: 0.2, k3: 0.5, k4: 1, k5: 2, k6: 10, k7: 50, k8: 100, k9: 500, k10: 5
    };

    const simulateCallback = async (overrides: Record<string, number>) => {
      const overriddenReactions = expanded.reactions.map(r => {
        let rateConstant = r.rateConstant;
        if (typeof r.rate === 'string' && overrides[r.rate] !== undefined) {
          rateConstant = overrides[r.rate];
        }
        return {
          ...r,
          rateConstant,
        };
      });

      const modelToSimulate = {
        ...expanded,
        parameters: {
          ...expanded.parameters,
          ...overrides,
        },
        reactions: overriddenReactions,
      };

      const results = await simulate(0, modelToSimulate, {
        method: 'ode',
        t_end: 50,
        n_steps: 10,
        solver: 'cvode',
        atol: 1e-8,
        rtol: 1e-8,
      } as any, { checkCancelled: () => {}, postMessage: () => {} });

      return { data: results.data };
    };

    const fimResult = await computeFIM({
      simulate: simulateCallback,
      parameters: baseParameters,
      parameterNames: parametersToAnalyze,
      allTimepoints: true,
      logParameters: true,
    });

    expect(fimResult.eigenvalues.length).toBe(parametersToAnalyze.length);
    expect(fimResult.conditionNumber).toBeGreaterThan(0);

    // 4. SSA Stochastic Simulation
    const ssaResults = await simulate(0, expanded, {
      method: 'ssa',
      t_end: 10,
      n_steps: 50,
      seed: 12345,
      recordFirings: true,
      maxFiringEvents: 2000,
    } as any, { checkCancelled: () => {}, postMessage: () => {} });

    expect(ssaResults.firingLog).toBeDefined();
    const firingLog = ssaResults.firingLog || [];
    expect(firingLog.length).toBeGreaterThan(0);

    // 5. Information Theory
    const itResult = analyzeReactionInformation({
      firingLog: firingLog,
      nReactions: expanded.reactions.length,
      nShuffles: 10,
      historyLength: 2,
    });

    expect(itResult.entropy.length).toBe(expanded.reactions.length);
    expect(itResult.transferEntropy).toBeDefined();
  });
});
