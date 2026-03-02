/**
 * tests/services/projectedNM.spec.ts
 *
 * Tests for the bound-constrained ProjectedNM-style optimizer.
 *
 * Verifies:
 * 1. Convergence on standard test functions
 * 2. Bound constraint enforcement
 * 3. Barrier penalty behavior
 * 4. Edge cases (tight bounds, zero-width bounds)
 */

import { describe, it, expect } from 'vitest';
import { projectedNM } from '../../services/optimization/projectedNM';

// ---------------------------------------------------------------------------
// Standard test functions
// ---------------------------------------------------------------------------

/** Sphere function: f(x) = sum(x_i^2). Global min at origin. */
const sphere = async (x: number[]): Promise<number> =>
    x.reduce((s, xi) => s + xi * xi, 0);

/** Shifted sphere: f(x) = (x0 - 3)^2 + (x1 - 2)^2. Global min at (3, 2). */
const shiftedSphere = async (x: number[]): Promise<number> =>
    (x[0] - 3) ** 2 + (x[1] - 2) ** 2;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectedNM-style bound-constrained optimizer', () => {
    it('converges on 2D sphere without bounds', async () => {
        const result = await projectedNM(sphere, [5, -3], {
            maxEval: 500,
            ftol: 1e-10,
        });

        expect(result.value).toBeLessThan(1e-6);
        expect(Math.abs(result.x[0])).toBeLessThan(1e-3);
        expect(Math.abs(result.x[1])).toBeLessThan(1e-3);
    });

    it('respects lower bounds', async () => {
        // Minimum of sphere is at (0, 0), but bounds require x >= 1.
        const result = await projectedNM(sphere, [5, 5], {
            maxEval: 500,
            ftol: 1e-10,
            lowerBounds: [1, 1],
            upperBounds: [10, 10],
        });

        // Solution should be at the bound corner (1, 1).
        expect(result.x[0]).toBeGreaterThanOrEqual(1 - 1e-10);
        expect(result.x[1]).toBeGreaterThanOrEqual(1 - 1e-10);
        expect(result.x[0]).toBeLessThan(1.1);
        expect(result.x[1]).toBeLessThan(1.1);
    });

    it('respects upper bounds', async () => {
        // Minimum of shiftedSphere is at (3, 2), but upper bound restricts x0 <= 2.
        const result = await projectedNM(shiftedSphere, [1, 1], {
            maxEval: 500,
            ftol: 1e-10,
            lowerBounds: [0, 0],
            upperBounds: [2, 5],
        });

        // x[0] should be at the upper bound (2), x[1] should be at minimum (2).
        expect(result.x[0]).toBeLessThanOrEqual(2 + 1e-10);
        expect(Math.abs(result.x[0] - 2)).toBeLessThan(0.1);
        expect(Math.abs(result.x[1] - 2)).toBeLessThan(0.1);
    });

    it('solution stays within bounds even with tight constraints', async () => {
        const result = await projectedNM(sphere, [1.5, 1.5], {
            maxEval: 300,
            ftol: 1e-8,
            lowerBounds: [1, 1],
            upperBounds: [2, 2],
        });

        // All values should be within bounds.
        expect(result.x[0]).toBeGreaterThanOrEqual(1 - 1e-10);
        expect(result.x[0]).toBeLessThanOrEqual(2 + 1e-10);
        expect(result.x[1]).toBeGreaterThanOrEqual(1 - 1e-10);
        expect(result.x[1]).toBeLessThanOrEqual(2 + 1e-10);
    });

    it('barrier penalty produces feasible solution', async () => {
        const result = await projectedNM(sphere, [5, 5], {
            maxEval: 500,
            ftol: 1e-10,
            lowerBounds: [1, 1],
            upperBounds: [10, 10],
            barrierStrength: 0.1,
        });

        // Solution should be feasible.
        expect(result.x[0]).toBeGreaterThanOrEqual(1 - 1e-10);
        expect(result.x[1]).toBeGreaterThanOrEqual(1 - 1e-10);
        expect(result.x[0]).toBeLessThanOrEqual(10 + 1e-10);
        expect(result.x[1]).toBeLessThanOrEqual(10 + 1e-10);
        // Should converge toward the bound corner.
        expect(result.x[0]).toBeLessThan(3);
        expect(result.x[1]).toBeLessThan(3);
    });

    it('respects AbortSignal', async () => {
        const controller = new AbortController();
        // Abort immediately to guarantee detection.
        controller.abort();

        const result = await projectedNM(sphere, [5, -3], {
            maxEval: 100000,
            signal: controller.signal,
        });

        expect(result.stopReason).toBe('aborted');
    });

    it('handles 1D optimization', async () => {
        const f1d = async (x: number[]): Promise<number> => (x[0] - 2) ** 2;

        const result = await projectedNM(f1d, [5], {
            maxEval: 200,
            ftol: 1e-8,
            lowerBounds: [0],
            upperBounds: [10],
        });

        expect(Math.abs(result.x[0] - 2)).toBeLessThan(0.01);
    });
});
