import { describe, it, expect } from 'vitest';
import type { ReactionFiringEvent } from '../../src/types';

describe('ReactionInformationTheory — optimized paths', () => {
  function log(times: number[], reactionIndex: number, ruleName: string): ReactionFiringEvent[] {
    return times.map((t) => ({ time: t, reactionIndex, ruleName, propensity: 1 }));
  }

  const regular = Array.from({ length: 20 }, (_, i) => i + 1);
  const firingLog: ReactionFiringEvent[] = [
    ...log(regular, 0, 'R0'),
    ...log(regular, 1, 'R1'),
    ...log([0.5, 10.5], 2, 'R2'),
  ].sort((a, b) => a.time - b.time);

  it('is deterministic across repeated runs', async () => {
    const { analyzeReactionInformation } = await import('../../src/services/analysis/ReactionInformationTheory');
    const a = analyzeReactionInformation({ firingLog, nReactions: 3 });
    const b = analyzeReactionInformation({ firingLog, nReactions: 3 });

    expect(a.mutualInformation.length).toBe(b.mutualInformation.length);
    for (let i = 0; i < a.mutualInformation.length; i++) {
      expect(a.mutualInformation[i].mutualInformation).toBe(b.mutualInformation[i].mutualInformation);
      expect(a.mutualInformation[i].pValue).toBe(b.mutualInformation[i].pValue);
    }
    expect(a.transferEntropy.length).toBe(b.transferEntropy.length);
    for (let i = 0; i < a.transferEntropy.length; i++) {
      expect(a.transferEntropy[i].transferEntropy).toBe(b.transferEntropy[i].transferEntropy);
      expect(a.transferEntropy[i].pValue).toBe(b.transferEntropy[i].pValue);
    }
  });

  it('scores the perfectly co-firing pair (0,1) highest and calls it significant', async () => {
    const { analyzeReactionInformation } = await import('../../src/services/analysis/ReactionInformationTheory');
    const res = analyzeReactionInformation({ firingLog, nReactions: 3 });

    const findPair = (x: number, y: number) =>
      res.mutualInformation.find(
        (m) => (m.pair.reaction1 === x && m.pair.reaction2 === y) || (m.pair.reaction1 === y && m.pair.reaction2 === x),
      );

    const mi01 = findPair(0, 1);
    expect(mi01).toBeDefined();
    expect(mi01!.mutualInformation).toBeGreaterThan(0);

    const strongest = [...res.mutualInformation].sort((a, b) => b.mutualInformation - a.mutualInformation)[0];
    expect(strongest.pair.reaction1 === 0 || strongest.pair.reaction2 === 0).toBe(true);
    expect(strongest.pair.reaction1 === 1 || strongest.pair.reaction2 === 1).toBe(true);

    expect(mi01!.pValue).toBeLessThan(0.05);
  });

  it('produces finite transfer-entropy values with valid p-values', async () => {
    const { analyzeReactionInformation } = await import('../../src/services/analysis/ReactionInformationTheory');
    const res = analyzeReactionInformation({ firingLog, nReactions: 3 });
    expect(res.transferEntropy.length).toBeGreaterThan(0);
    for (const te of res.transferEntropy) {
      expect(Number.isFinite(te.transferEntropy)).toBe(true);
      expect(Number.isFinite(te.reverseTE)).toBe(true);
      expect(Number.isFinite(te.netInformationFlow)).toBe(true);
      expect(te.pValue).toBeGreaterThanOrEqual(0);
      expect(te.pValue).toBeLessThanOrEqual(1);
    }
  });

  it('leaves the full computation intact (no pair skipping) by default', async () => {
    const { analyzeReactionInformation } = await import('../../src/services/analysis/ReactionInformationTheory');
    const res = analyzeReactionInformation({ firingLog, nReactions: 3 });
    expect(res.mutualInformation.length).toBe(3);
    expect(res.transferEntropy.length).toBe(6);
  });
});
