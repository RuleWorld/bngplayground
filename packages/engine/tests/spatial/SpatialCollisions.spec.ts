/**
 * SpatialCollisions.spec.ts — regression tests for the spatial collision solver.
 *
 * C1: a molecule must take part in at most one reaction per step. Previously the
 *     `break` after a firing only exited the inner `for (const rxn of reactions)`
 *     loop, so the same reactant could react with several partners in one step
 *     and molecule count was not conserved.
 *
 * C2: collisions must be searched over a molecule's own cell plus the 26
 *     neighbours. Previously only same-cell pairs were compared, so pairs within
 *     rxnRadius but in adjacent cells never reacted and bimolecular rates were
 *     underestimated.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpatialSimulation } from '../../src/services/spatial/SpatialSimulation';
import type { SpatialSimulationConfig } from '../../src/services/spatial/SpatialConfig';

const MODEL = `
begin model

begin parameters
  kf 1000
  kr 1000
  MCELL_DIFFUSION_CONSTANT_3D_A 0
  MCELL_DIFFUSION_CONSTANT_3D_B 0
  MCELL_DIFFUSION_CONSTANT_3D_C 0
end parameters

begin compartments
  EC 3 1
end compartments

begin species
  A(s) 0
  B(s) 0
  C(s) 0
end species

begin reactions
  A(s)+B(s) -> C(s) kf
  C(s) -> A(s)+B(s) kr
end reactions

end model
`;

/** Species indices follow declaration order in the model: A=0, B=1, C=2. */
const A = 0;
const B = 1;
const C = 2;

interface Placed {
  speciesId: number;
  x: number;
  y: number;
  z: number;
}

/**
 * Private state of the solver. The test reaches into it to pin molecule
 * positions deterministically instead of relying on random seeding, and to
 * drive single steps without running the whole time course.
 */
interface SolverInternals {
  molecules: Placed[];
  nextMoleculeId: number;
  gridCellSize: number;
  advanceStep(): void;
}

// Single, named test seam for the private-state access, so each use below is an
// ordinary typed member read rather than a repeated inline cast.
function solver(sim: SpatialSimulation): SolverInternals {
  return sim as unknown as SolverInternals;
}

async function simWithMolecules(
  placed: Placed[],
  config?: Partial<SpatialSimulationConfig>,
): Promise<SpatialSimulation> {
  const sim = new SpatialSimulation({ seed: 42, ...config });
  await sim.initialize(MODEL);

  const s = solver(sim);
  s.molecules = placed.map((p, i) => ({
    id: i,
    speciesId: p.speciesId,
    x: p.x,
    y: p.y,
    z: p.z,
    compartmentId: 0,
  }));
  s.nextMoleculeId = placed.length;
  return sim;
}

/** Species id → count, over the solver's current molecule pool. */
function counts(sim: SpatialSimulation): Record<number, number> {
  const result: Record<number, number> = {};
  for (const m of solver(sim).molecules) {
    result[m.speciesId] = (result[m.speciesId] ?? 0) + 1;
  }
  return result;
}

/**
 * Config that makes the association rate ~1 per step (p = 1 - exp(-kf*dt) with
 * kf=1000 and dt=10), so a firing is effectively certain and the assertions can
 * be exact. Cell size is pinned to rxnRadius so chosen coordinates straddle
 * cell boundaries deliberately.
 */
const CERTAIN: Partial<SpatialSimulationConfig> = {
  dt: 10,
  partitionCellSize: 1e-6,
  rxnRadius: 0.01,
};
describe('spatial reaction radius configuration', () => {
  it.each([0, -1, NaN, Infinity, -Infinity])(
    'rejects invalid reaction radius %s',
    (rxnRadius) => {
      expect(() => new SpatialSimulation({ rxnRadius })).toThrow(
        'Spatial reaction radius must be finite and positive',
      );
    },
  );
});


describe('spatial collision solver', () => {
  beforeEach(() => {
    // The simulation narrates its setup at info level; silence it for readability.
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('C1: one reactant cannot react twice in a single step', () => {
    it('creates exactly one product from one A with three B neighbours', async () => {
      const sim = await simWithMolecules(
        [
          { speciesId: A, x: 0, y: 0, z: 0 },
          { speciesId: B, x: 0.002, y: 0, z: 0 },
          { speciesId: B, x: -0.002, y: 0, z: 0 },
          { speciesId: B, x: 0, y: 0.003, z: 0 },
        ],
        CERTAIN,
      );

      solver(sim).advanceStep();

      const c = counts(sim);
      expect(c[C]).toBe(1);
      expect(c[A]).toBeUndefined();
      expect(c[B]).toBe(2);
    });

    it('conserves the A + C and B + C mass balances for A + B <-> C', async () => {
      const placed: Placed[] = [];
      // A dense cluster plus a spread population: plenty of partners in range,
      // which is exactly the regime where the unfixed solver over-fires.
      for (let i = 0; i < 20; i++) {
        const x = (i % 5) * 0.004;
        const y = Math.floor(i / 5) * 0.004;
        placed.push({ speciesId: A, x, y, z: 0 });
        placed.push({ speciesId: B, x: x + 0.002, y, z: 0 });
      }

      const sim = await simWithMolecules(placed, {
        dt: 1e-4,
        partitionCellSize: 1e-6,
        rxnRadius: 0.01,
      });
      const s = solver(sim);

      // A + B <-> C is 2->1 in one direction and 1->2 in the other, so the raw
      // molecule total legitimately moves. What must hold every step is the
      // pair of moiety balances: each C carries exactly one A and one B, so a
      // reactant firing twice would drive A + C above its initial value.
      for (let i = 0; i < 200; i++) {
        s.advanceStep();
        const c = counts(sim);
        expect((c[A] ?? 0) + (c[C] ?? 0)).toBe(20);
        expect((c[B] ?? 0) + (c[C] ?? 0)).toBe(20);
      }

      // Sanity: the system actually exchanged molecules over those steps,
      // otherwise the balance above would hold trivially.
      const c = counts(sim);
      expect(c[C]).toBeGreaterThan(0);
    });
  });

  describe('C2: neighbouring cells are searched', () => {
    it('reacts across an x-axis cell boundary', async () => {
      // With cell size == rxnRadius these sit in adjacent x cells but are well
      // within reaction range; a same-cell-only search finds no partner.
      const sim = await simWithMolecules(
        [
          { speciesId: A, x: 0.0075, y: 0, z: 0 },
          { speciesId: B, x: 0.0125, y: 0, z: 0 },
        ],
        CERTAIN,
      );

      solver(sim).advanceStep();

      const c = counts(sim);
      expect(c[C]).toBe(1);
      expect(c[A]).toBeUndefined();
      expect(c[B]).toBeUndefined();
    });

    it('reacts across a y-axis cell boundary', async () => {
      const sim = await simWithMolecules(
        [
          { speciesId: A, x: 0, y: 0.001, z: 0 },
          { speciesId: B, x: 0, y: -0.001, z: 0 },
        ],
        CERTAIN,
      );

      solver(sim).advanceStep();

      expect(counts(sim)[C]).toBe(1);
    });

    it('reacts once when both partners sit in a neighbouring cell', async () => {
      // Exercises the overlapping-neighbourhood case end to end: a symmetric
      // 3x3x3 search finds this pair from both molecules' own cells, so the
      // solver must fire it exactly once — one C out of one A and one B.
      const sim = await simWithMolecules(
        [
          { speciesId: A, x: 0.0075, y: 0, z: 0 },
          { speciesId: B, x: 0.0125, y: 0, z: 0 },
        ],
        CERTAIN,
      );

      solver(sim).advanceStep();

      const c = counts(sim);
      expect(c[C]).toBe(1);
      expect(Object.values(c).reduce((sum, n) => sum + n, 0)).toBe(1);
    });

    it('raises the cell size to at least rxnRadius so the search is complete', async () => {
      const sim = await simWithMolecules([{ speciesId: A, x: 0, y: 0, z: 0 }], {
        partitionCellSize: 1e-9,
        rxnRadius: 0.01,
      });

      expect(solver(sim).gridCellSize).toBeGreaterThanOrEqual(0.01);
    });
  });
});