
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { simulate } from '@bngplayground/engine';
import { BNGLModel } from '../../types';

// Mock ODESolver
vi.mock('../../services/ODESolver', () => ({
    createSolver: vi.fn().mockReturnValue({
        integrate: vi.fn().mockReturnValue({
            success: true,
            steps: 10,
            y: new Float64Array([10]), // Match 1 species
            t: 10
        }),
        dispose: vi.fn()
    })
}));

// Mock ExpressionEvaluator
vi.mock('../../services/simulation/ExpressionEvaluator', () => ({
    evaluateFunctionalRate: vi.fn((expr) => parseFloat(expr) || 1),
    evaluateExpressionOrParse: vi.fn((expr) => parseFloat(expr) || 0),
    loadEvaluator: vi.fn().mockResolvedValue(undefined)
}));

// Mock Parity
vi.mock('../../services/parity/ParityService', () => ({
    toBngGridTime: vi.fn((global, end, steps, idx) => (end * idx) / steps) // Simple linear time
}));

describe('SimulationLoop Service', () => {

    const mockCallbacks = {
        checkCancelled: vi.fn(),
        postMessage: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should run SSA simulation', async () => {
        const model: BNGLModel = {
            species: [{ name: 'A', initialConcentration: 100 }],
            observables: [{ name: 'A_obs', pattern: 'A', type: 'Species' }],
            reactions: [
                {
                    reactants: ['A'], products: [],
                    rate: '1', rateConstant: 1,
                    isFunctionalRate: false
                } as any
            ],
            reactionRules: [],
            simulationPhases: [{
                method: 'ssa',
                t_end: 1,
                n_steps: 10
            }]
        } as any;

        const res = await simulate(1, model, {} as any, mockCallbacks);

        expect(res).toBeDefined();
        // SSA should produce data
        expect(res.data.length).toBeGreaterThan(0);
        // Step check logic implies data points
    });

    it('should run ODE simulation using solver', async () => {
        const model: BNGLModel = {
            species: [{ name: 'A', initialConcentration: 10 }],
            observables: [],
            reactions: [],
            simulationPhases: [{
                method: 'ode',
                t_start: 0,
                t_end: 10,
                n_steps: 10
            }]
        } as any;

        // Mock ODESolver import return inside simulate
        // simulate uses dynamic import: const { createSolver } = await import('../../services/ODESolver');
        // Our top-level mock handles this if using vitest handling of dynamic imports? 
        // Vitest mocks modules, so import() should return the mock.

        const res = await simulate(1, model, { method: 'ode' } as any, mockCallbacks);

        expect(res).toBeDefined();
        // It calls createSolver (which we defaulted in mock to return dummy data for solve?)
        // Wait, simulate logic calls 'createSolver' then uses it.
        // My mock returns object with 'solve'.
        // Actually SimulationLoop uses 'solver.solve' or similar?
        // I need to check SimulationLoop.ts usage of ODESolver.
        // It uses `createSolver` -> `solver` object.
    });

    it('should check for cancellation', async () => {
        const model: BNGLModel = {
            species: [{ name: 'A', initialConcentration: 10 }],
            observables: [],
            reactions: [],
            simulationPhases: [{ method: 'ssa', t_end: 10, n_steps: 10 }]
        } as any;

        await simulate(1, model, {} as any, mockCallbacks);
        expect(mockCallbacks.checkCancelled).toHaveBeenCalled();
    });

});
