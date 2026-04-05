import { describe, expect, it } from 'vitest';
import {
  detectConservedMoieties,
  computeConservationConstants,
  reduceSystem,
  type ReactionEntry,
  type ConservedMoiety,
} from '../../src/services/analysis/ConservedMoietyDetector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the stoichiometry matrix for verification purposes.
 * S[i][r] = net change of species i when reaction r fires.
 */
function buildS(reactions: ReactionEntry[], numSpecies: number): number[][] {
  const S: number[][] = Array.from({ length: numSpecies }, () =>
    new Array(reactions.length).fill(0),
  );
  for (let r = 0; r < reactions.length; r++) {
    for (let k = 0; k < reactions[r].reactants.length; k++) S[reactions[r].reactants[k]][r] -= 1;
    for (let k = 0; k < reactions[r].products.length; k++) S[reactions[r].products[k]][r] += 1;
  }
  return S;
}

/**
 * Verify that every detected moiety is actually in the left nullspace of S,
 * i.e. coefficients^T * S_col = 0 for every reaction column.
 */
function verifyNullspace(moieties: ConservedMoiety[], reactions: ReactionEntry[], numSpecies: number): void {
  const S = buildS(reactions, numSpecies);
  for (const m of moieties) {
    for (let r = 0; r < reactions.length; r++) {
      let dot = 0;
      for (let i = 0; i < numSpecies; i++) {
        dot += m.coefficients[i] * S[i][r];
      }
      expect(Math.abs(dot)).toBeLessThan(1e-9);
    }
  }
}

/**
 * Check that a specific expected conservation vector lies in the span of the
 * detected moieties.  We do this by solving for coefficients alpha such that
 * sum alpha_k * moiety_k = expected.  We use a simple least-squares check:
 * assemble the moiety coefficient vectors as columns and verify the expected
 * vector has zero residual.
 */
function expectInSpan(moieties: ConservedMoiety[], expected: number[]): void {
  const n = expected.length;
  const m = moieties.length;
  if (m === 0) {
    // expected vector must be zero
    for (const v of expected) expect(Math.abs(v)).toBeLessThan(1e-9);
    return;
  }

  // Build matrix A (n x m) where columns are moiety coefficient vectors
  // Solve A * alpha = expected via normal equations: A^T A alpha = A^T expected
  const AtA: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
  const Atb: number[] = new Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += moieties[i].coefficients[k] * moieties[j].coefficients[k];
      AtA[i][j] = s;
    }
    let s = 0;
    for (let k = 0; k < n; k++) s += moieties[i].coefficients[k] * expected[k];
    Atb[i] = s;
  }

  // Solve by Gaussian elimination
  const aug = AtA.map((row, i) => [...row, Atb[i]]);
  for (let col = 0; col < m; col++) {
    let maxRow = col;
    for (let r = col + 1; r < m; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[maxRow][col])) maxRow = r;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    if (Math.abs(aug[col][col]) < 1e-12) continue;
    const pivot = aug[col][col];
    for (let c = col; c <= m; c++) aug[col][c] /= pivot;
    for (let r = 0; r < m; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      for (let c = col; c <= m; c++) aug[r][c] -= f * aug[col][c];
    }
  }
  const alpha = aug.map((row) => row[m]);

  // Compute residual
  for (let k = 0; k < n; k++) {
    let reconstructed = 0;
    for (let i = 0; i < m; i++) reconstructed += alpha[i] * moieties[i].coefficients[k];
    expect(Math.abs(reconstructed - expected[k])).toBeLessThan(1e-8);
  }
}

/**
 * Verify that conservation constants hold: for each moiety,
 * sum c_i * y0[i] = moiety.constant.
 */
function verifyConstants(moieties: ConservedMoiety[], y0: number[]): void {
  for (const m of moieties) {
    let total = 0;
    for (let i = 0; i < y0.length; i++) total += m.coefficients[i] * y0[i];
    expect(total).toBeCloseTo(m.constant, 8);
  }
}

// -----------------------------------------------------------------------
// 1. Simple enzyme system: E + S <-> ES -> E + P
//    Species: 0=E, 1=S, 2=ES, 3=P
//    Reactions: (E+S -> ES), (ES -> E+S), (ES -> E+P)
//    Conservation laws: [E]+[ES]=const, [S]+[ES]+[P]=const
// -----------------------------------------------------------------------
describe('ConservedMoietyDetector', () => {
  describe('enzyme kinetics (E + S <-> ES -> E + P)', () => {
    const reactions: ReactionEntry[] = [
      { reactants: [0, 1], products: [2] },    // E + S -> ES
      { reactants: [2], products: [0, 1] },     // ES -> E + S
      { reactants: [2], products: [0, 3] },     // ES -> E + P
    ];
    const numSpecies = 4;

    it('should detect two conservation laws', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      expect(moieties.length).toBe(2);
      verifyNullspace(moieties, reactions, numSpecies);
    });

    it('should span the expected conservation laws [E]+[ES] and [S]+[ES]+[P]', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      // [E]+[ES] = [1, 0, 1, 0]
      expectInSpan(moieties, [1, 0, 1, 0]);
      // [S]+[ES]+[P] = [0, 1, 1, 1]
      expectInSpan(moieties, [0, 1, 1, 1]);
    });

    it('should compute correct conservation constants from initial conditions', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      const y0 = [1, 5, 0, 0];
      computeConservationConstants(moieties, y0);
      verifyConstants(moieties, y0);
    });
  });

  // -------------------------------------------------------------------
  // 2. Simple binding: A + B <-> AB
  //    Species: 0=A, 1=B, 2=AB
  //    Conservation laws: [A]+[AB]=const, [B]+[AB]=const
  // -------------------------------------------------------------------
  describe('simple binding (A + B <-> AB)', () => {
    const reactions: ReactionEntry[] = [
      { reactants: [0, 1], products: [2] },
      { reactants: [2], products: [0, 1] },
    ];
    const numSpecies = 3;

    it('should detect two conservation laws', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      expect(moieties.length).toBe(2);
      verifyNullspace(moieties, reactions, numSpecies);
    });

    it('should span [A]+[AB] and [B]+[AB]', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      expectInSpan(moieties, [1, 0, 1]); // [A]+[AB]
      expectInSpan(moieties, [0, 1, 1]); // [B]+[AB]
    });
  });

  // -------------------------------------------------------------------
  // 3. Linear chain: A -> B -> C
  //    Conservation law: [A]+[B]+[C]=const
  // -------------------------------------------------------------------
  describe('linear chain (A -> B -> C)', () => {
    const reactions: ReactionEntry[] = [
      { reactants: [0], products: [1] },
      { reactants: [1], products: [2] },
    ];
    const numSpecies = 3;

    it('should detect one conservation law', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      expect(moieties.length).toBe(1);
      verifyNullspace(moieties, reactions, numSpecies);
    });

    it('should span [A]+[B]+[C]', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      expectInSpan(moieties, [1, 1, 1]);
    });

    it('should compute correct constant', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      const y0 = [10, 0, 0];
      computeConservationConstants(moieties, y0);
      verifyConstants(moieties, y0);
    });
  });

  // -------------------------------------------------------------------
  // 4. Closed system: A <-> B
  //    Conservation law: [A]+[B]=const
  // -------------------------------------------------------------------
  describe('closed system (A <-> B)', () => {
    const reactions: ReactionEntry[] = [
      { reactants: [0], products: [1] },
      { reactants: [1], products: [0] },
    ];
    const numSpecies = 2;

    it('should detect [A]+[B]=const', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      expect(moieties.length).toBe(1);
      verifyNullspace(moieties, reactions, numSpecies);
      expectInSpan(moieties, [1, 1]);
    });

    it('should compute correct constant', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      const y0 = [4, 6];
      computeConservationConstants(moieties, y0);
      verifyConstants(moieties, y0);
    });
  });

  // -------------------------------------------------------------------
  // 5. Multiple independent conservations
  //    A + B <-> AB  (species 0,1,2)
  //    C + D <-> CD  (species 3,4,5)
  //    4 conservation laws spanning:
  //    [A]+[AB], [B]+[AB], [C]+[CD], [D]+[CD]
  // -------------------------------------------------------------------
  describe('multiple independent conservations', () => {
    const reactions: ReactionEntry[] = [
      { reactants: [0, 1], products: [2] },
      { reactants: [2], products: [0, 1] },
      { reactants: [3, 4], products: [5] },
      { reactants: [5], products: [3, 4] },
    ];
    const numSpecies = 6;

    it('should detect four conservation laws', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      expect(moieties.length).toBe(4);
      verifyNullspace(moieties, reactions, numSpecies);
    });

    it('should span all four expected conservation laws', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      expectInSpan(moieties, [1, 0, 1, 0, 0, 0]); // A + AB
      expectInSpan(moieties, [0, 1, 1, 0, 0, 0]); // B + AB
      expectInSpan(moieties, [0, 0, 0, 1, 0, 1]); // C + CD
      expectInSpan(moieties, [0, 0, 0, 0, 1, 1]); // D + CD
    });
  });

  // -------------------------------------------------------------------
  // 6. No conserved moieties (open system with synthesis/degradation)
  // -------------------------------------------------------------------
  describe('open system with synthesis/degradation', () => {
    const reactions: ReactionEntry[] = [
      { reactants: [], products: [0] }, // 0 -> A
      { reactants: [0], products: [] }, // A -> 0
    ];
    const numSpecies = 1;

    it('should detect no conservation laws', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      expect(moieties.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // 7. Reduction: verify reduced system, reconstruction
  // -------------------------------------------------------------------
  describe('reduceSystem', () => {
    // Enzyme system: E(0) + S(1) <-> ES(2) -> E(0) + P(3)
    const reactions: ReactionEntry[] = [
      { reactants: [0, 1], products: [2] },
      { reactants: [2], products: [0, 1] },
      { reactants: [2], products: [0, 3] },
    ];
    const numSpecies = 4;
    const y0 = [1, 5, 0, 0];

    it('should produce a smaller system', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      computeConservationConstants(moieties, y0);
      const reduced = reduceSystem(reactions, numSpecies, y0, moieties);

      // 4 species, 2 conservation laws => 2 independent species
      expect(reduced.reducedSize).toBe(2);
      expect(reduced.independentSpecies.length).toBe(2);
      expect(reduced.dependentSpecies.length).toBe(2);
    });

    it('should reconstruct correct dependent species values at t=0', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      computeConservationConstants(moieties, y0);
      const reduced = reduceSystem(reactions, numSpecies, y0, moieties);

      const indepValues = reduced.independentSpecies.map((idx) => y0[idx]);
      const fullReconstructed = reduced.reconstruct(indepValues);

      for (let i = 0; i < numSpecies; i++) {
        expect(fullReconstructed[i]).toBeCloseTo(y0[i], 8);
      }
    });

    it('should reconstruct correctly at a mid-simulation state', () => {
      const moieties = detectConservedMoieties(reactions, numSpecies);
      computeConservationConstants(moieties, y0);
      const reduced = reduceSystem(reactions, numSpecies, y0, moieties);

      // Build a valid mid-simulation state that satisfies conservation laws.
      // We reconstruct from independent species values to guarantee validity.
      // Use ES=0.7, then the conservation laws determine E, S, P.
      // Start by picking arbitrary independent values and reconstructing.
      const indepValues = reduced.independentSpecies.map((idx) => {
        // Perturb from initial state
        if (idx === 0) return 0.3;  // E or whichever is independent
        if (idx === 1) return 4.3;
        if (idx === 2) return 0.7;
        if (idx === 3) return 0.0;
        return y0[idx];
      });
      const fullReconstructed = reduced.reconstruct(indepValues);

      // Verify conservation laws hold on the reconstructed state
      for (const m of moieties) {
        let total = 0;
        for (let i = 0; i < numSpecies; i++) {
          total += m.coefficients[i] * fullReconstructed[i];
        }
        expect(total).toBeCloseTo(m.constant, 8);
      }

      // Verify independent species are passed through correctly
      for (let p = 0; p < reduced.independentSpecies.length; p++) {
        expect(fullReconstructed[reduced.independentSpecies[p]]).toBeCloseTo(indepValues[p], 8);
      }
    });
  });

  // -------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------
  describe('edge cases', () => {
    it('should handle zero species', () => {
      const moieties = detectConservedMoieties([], 0);
      expect(moieties.length).toBe(0);
    });

    it('should handle no reactions (all species conserved independently)', () => {
      const moieties = detectConservedMoieties([], 3);
      expect(moieties.length).toBe(3);
      // Each species is independently conserved
      for (let i = 0; i < 3; i++) {
        const m = moieties.find(
          (m) => m.speciesIndices.length === 1 && m.speciesIndices[0] === i,
        );
        expect(m).toBeDefined();
      }
    });

    it('should handle single-species system with self-loop (A -> A)', () => {
      const reactions: ReactionEntry[] = [{ reactants: [0], products: [0] }];
      const moieties = detectConservedMoieties(reactions, 1);
      // Net stoichiometry is 0 for species 0, so it is conserved
      expect(moieties.length).toBe(1);
    });

    it('reduceSystem with no moieties returns full system', () => {
      const reactions: ReactionEntry[] = [
        { reactants: [], products: [0] },
        { reactants: [0], products: [] },
      ];
      const reduced = reduceSystem(reactions, 1, [5], []);
      expect(reduced.reducedSize).toBe(1);
      expect(reduced.independentSpecies).toEqual([0]);
      expect(reduced.dependentSpecies).toEqual([]);
      expect(reduced.reconstruct([5])).toEqual([5]);
    });
  });
});
