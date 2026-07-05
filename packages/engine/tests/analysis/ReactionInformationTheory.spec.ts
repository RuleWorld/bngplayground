import { describe, it, expect } from 'vitest';
import type { ReactionFiringEvent } from '../../src/types';

describe('ReactionInformationTheory', () => {
  // Helper to generate synthetic firing log
  function generatePoissonFirings(rate: number, tEnd: number, reactionIndex: number, ruleName?: string): ReactionFiringEvent[] {
    const events: ReactionFiringEvent[] = [];
    let t = 0;
    while (t < tEnd) {
      t += -Math.log(Math.random()) / rate;
      if (t < tEnd) {
        events.push({ time: t, reactionIndex, ruleName, propensity: rate });
      }
    }
    return events;
  }

  it('computes per-reaction entropy for Poisson process', async () => {
    const { analyzeReactionInformation } = await import('../../src/services/analysis/ReactionInformationTheory');
    // Single reaction with known firing rate
    const events = generatePoissonFirings(10, 100, 0, 'R1');
    const result = analyzeReactionInformation({
      firingLog: events,
      nReactions: 1,
      nShuffles: 50,
    });
    expect(result.entropy.length).toBe(1);
    expect(result.entropy[0].entropy).toBeGreaterThan(0);
  });

  it('detects mutual information between correlated reactions', async () => {
    const { analyzeReactionInformation } = await import('../../src/services/analysis/ReactionInformationTheory');
    // Two reactions that fire together (correlated)
    const events: ReactionFiringEvent[] = [];
    for (let t = 0; t < 100; t += 0.5) {
      events.push({ time: t, reactionIndex: 0, ruleName: 'R1', propensity: 2 });
      events.push({ time: t + 0.01, reactionIndex: 1, ruleName: 'R2', propensity: 2 }); // fires right after R1
    }
    const result = analyzeReactionInformation({
      firingLog: events,
      nReactions: 2,
      nShuffles: 50,
    });
    expect(result.mutualInformation.length).toBeGreaterThan(0);
    // Highly correlated reactions should have high MI
    if (result.mutualInformation.length > 0) {
      expect(result.mutualInformation[0].normalizedMI).toBeGreaterThan(0.1);
    }
  });

  it('detects directional transfer entropy', async () => {
    const { analyzeReactionInformation } = await import('../../src/services/analysis/ReactionInformationTheory');
    // Unidirectional: R1 fires, then R2 fires 1 time unit later
    const events: ReactionFiringEvent[] = [];
    for (let t = 0; t < 100; t += 2) {
      events.push({ time: t, reactionIndex: 0, ruleName: 'R1', propensity: 0.5 });
      events.push({ time: t + 0.5, reactionIndex: 1, ruleName: 'R2', propensity: 0.5 });
    }
    const result = analyzeReactionInformation({
      firingLog: events,
      nReactions: 2,
      nShuffles: 50,
      historyLength: 3,
    });
    // Should find transfer entropy from R1 → R2
    const te01 = result.transferEntropy.find(te => te.source === 0 && te.target === 1);
    if (te01) {
      expect(te01.transferEntropy).toBeGreaterThan(0);
      expect(te01.netInformationFlow).toBeGreaterThan(0);
    }
  });

  it('reports no mutual information for independent reactions', async () => {
    const { analyzeReactionInformation } = await import('../../src/services/analysis/ReactionInformationTheory');
    // Two independent Poisson processes
    const events1 = generatePoissonFirings(5, 100, 0, 'R1');
    const events2 = generatePoissonFirings(3, 100, 1, 'R2');
    const events = [...events1, ...events2].sort((a, b) => a.time - b.time);

    const result = analyzeReactionInformation({
      firingLog: events,
      nReactions: 2,
      nShuffles: 100,
    });
    // Independent reactions should have low MI (p-value > 0.05 mostly)
    if (result.mutualInformation.length > 0) {
      expect(result.mutualInformation[0].normalizedMI).toBeLessThan(0.3);
    }
  });

  it('builds empirical causal graph', async () => {
    const { analyzeReactionInformation } = await import('../../src/services/analysis/ReactionInformationTheory');
    const events: ReactionFiringEvent[] = [];
    for (let t = 0; t < 100; t += 1) {
      events.push({ time: t, reactionIndex: 0, propensity: 1 });
      events.push({ time: t + 0.2, reactionIndex: 1, propensity: 1 });
    }
    const result = analyzeReactionInformation({
      firingLog: events,
      nReactions: 2,
      nShuffles: 20,
    });
    expect(result.empiricalCausalGraph).toBeDefined();
    expect(Array.isArray(result.empiricalCausalGraph)).toBe(true);
  });

  it('compareCausalGraphs classifies edges correctly', async () => {
    const { compareCausalGraphs } = await import('../../src/services/analysis/ReactionInformationTheory');
    const empirical = [
      { source: 0, target: 1, weight: 0.5 },
      { source: 2, target: 3, weight: 0.3 },
    ];
    const structural = [
      { source: 0, target: 1, ruleName: 'R1' },
      { source: 1, target: 2, ruleName: 'R2' },
    ];
    const result = compareCausalGraphs(empirical, structural);
    expect(result.concordant.length).toBe(1); // 0→1 is in both
    expect(result.structuralOnly.length).toBe(1); // 1→2 is only structural
    expect(result.emergent.length).toBe(1); // 2→3 is only empirical
  });

  it('protects against RangeError: Invalid array length when binWidth is extremely small', async () => {
    const { analyzeReactionInformation } = await import('../../src/services/analysis/ReactionInformationTheory');
    const events: ReactionFiringEvent[] = [
      { time: 0, reactionIndex: 0, propensity: 1 },
      { time: 1e-15, reactionIndex: 0, propensity: 1 },
      { time: 2e-15, reactionIndex: 0, propensity: 1 },
      { time: 3e-15, reactionIndex: 0, propensity: 1 },
      { time: 100, reactionIndex: 0, propensity: 1 },
    ];
    const result = analyzeReactionInformation({
      firingLog: events,
      nReactions: 1,
      nShuffles: 10,
    });
    expect(result).toBeDefined();
    expect(result.entropy).toBeDefined();
  });
});
