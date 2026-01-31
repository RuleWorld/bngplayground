
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { simulate } from '../../services/simulation/SimulationLoop';
import { jitCompiler } from '../../src/services/JITCompiler';
import { BNGLModel } from '../../types';

// Mock ODESolver
const mockSolve = vi.fn();
vi.mock('../../services/ODESolver', () => ({
    createSolver: vi.fn().mockReturnValue({
        integrate: mockSolve,
        dispose: vi.fn()
    }),
    AutoSolver: class {
        integrate = mockSolve;
    },
    Rosenbrock23Solver: class {
        integrate = mockSolve;
    },
    RK45Solver: class {
        integrate = mockSolve;
    }
}));

// Mock ExpressionEvaluator
vi.mock('../../services/simulation/ExpressionEvaluator', () => ({
    evaluateFunctionalRate: vi.fn((expr) => parseFloat(expr) || 1),
    evaluateExpressionOrParse: vi.fn((expr) => parseFloat(expr) || 0),
    loadEvaluator: vi.fn().mockResolvedValue(undefined)
}));

// Mock Parity
vi.mock('../../services/parity/ParityService', () => ({
    toBngGridTime: vi.fn((global, end, steps, idx) => (end * idx) / steps)
}));

describe('JIT Compiler Cache Verification', () => {

    const mockCallbacks = {
        checkCancelled: vi.fn(),
        postMessage: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset specific mock behaviors
        mockSolve.mockReturnValue({
            success: true,
            steps: 10,
            y: new Float64Array(10),
            t: 10
        });
        // Clear JIT cache
        jitCompiler.clearCache();
    });

    it('should recompile when parameters change between simulations', async () => {
        const compileSpy = vi.spyOn(jitCompiler, 'compile');

        // Initial Model with Parameter k=1
        const model: BNGLModel = {
            species: [{ name: 'A', initialConcentration: 100 }, { name: 'B', initialConcentration: 0 }],
            observables: [{ name: 'A_obs', pattern: 'A', type: 'Species' }],
            parameters: { 'k_rate': 1.0 },
            reactions: [
                {
                    reactants: ['A'], products: ['B'],
                    rate: 'k_rate', rateConstant: 1.0,
                    isFunctionalRate: false
                } as any
            ],
            reactionRules: [],
            simulationPhases: []
        } as any;

        // Run Phase 1
        await simulate(1, model, { method: 'ode', t_end: 10, n_steps: 10 } as any, mockCallbacks);

        expect(compileSpy).toHaveBeenCalledTimes(1);
        const firstCallArgs = compileSpy.mock.calls[0];
        // Check params passed to compile
        expect(firstCallArgs[2]).toEqual({ 'k_rate': 1.0 });

        // Phase 2: Update Parameter k=200 (JIT should invalidate cache)
        const modelPhase2 = JSON.parse(JSON.stringify(model));
        modelPhase2.parameters['k_rate'] = 200.0;
        // Also update the rateConstant used in reaction object (SimulationLoop might use this or JIT)
        // JIT uses rateConstant property. If it's a number, it's used directly.
        // But JIT now inlines parameters if provided.
        // If rate is expression 'k_rate', simulation logic (NetworkGen) usually resolves it?
        // Actually, if 'k_rate' is a parameter, the reaction.rateConstant might be the EVALUATED value.
        // BUT JIT also takes a 'parameters' object.
        // My fix in SimulationLoop.ts passes 'model.parameters' to JIT compile.
        // So checking the spy args is sufficient.
        modelPhase2.reactions[0].rateConstant = 200.0; // Simulate NetworkGen update or similar

        await simulate(1, modelPhase2, { method: 'ode', t_end: 10, n_steps: 10 } as any, mockCallbacks);

        expect(compileSpy).toHaveBeenCalledTimes(2);
        const secondCallArgs = compileSpy.mock.calls[1];
        expect(secondCallArgs[2]).toEqual({ 'k_rate': 200.0 });

        // Phase 3: No change (should hit cache)
        await simulate(1, modelPhase2, { method: 'ode', t_end: 10, n_steps: 10 } as any, mockCallbacks);

        // Should STILL be 2 if cache was hit (compile method returns cached)
        // Wait, compile method implementation checks cache internally.
        // So compile IS called, but it returns early.
        // Wait, Spy observes the METHOD call.
        // So it will be 3 calls.
        // But I should check that JITCompiler "compiled" vs "returned cached".
        // The return value has 'compiledAt'.

        const res2 = await compileSpy.mock.results[1].value; // Result of 2nd call
        const res3 = await compileSpy.mock.results[2].value; // Result of 3rd call

        // If cached, they should be the SAME object instance
        expect(res3).toBe(res2);

        // Compare with first call (different parameters)
        const res1 = await compileSpy.mock.results[0].value;
        expect(res2).not.toBe(res1);

    });
});
