import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BNGLModel, SimulationResults } from '../src/types';
import type { BatchReporter, BatchSimulator } from '../src/utils/batchRunner';
import { runSingleBatchItem, safeModelName } from '../src/utils/batchRunner';

function createBaseModel(): BNGLModel {
    return {
        parameters: {},
        moleculeTypes: [],
        species: [{ name: 'A()', initialConcentration: 100 }],
        observables: [{ name: 'A_total', type: 'molecules', pattern: 'A()' }],
        reactions: [],
        reactionRules: [{
            reactants: ['A()'],
            products: [],
            rate: 'k',
            isBidirectional: false,
        }],
    };
}

function createResults(): SimulationResults {
    return {
        headers: ['time', 'A_total'],
        data: [{ time: 0, A_total: 100 }],
    };
}

describe('batchRunner', () => {
    let simulator: BatchSimulator;
    let reporter: BatchReporter;

    beforeEach(() => {
        simulator = {
            parse: vi.fn(),
            generateNetwork: vi.fn(async (model: BNGLModel) => ({
                ...model,
                reactions: [{
                    reactants: ['A()'],
                    products: [],
                    rate: 'k',
                    rateConstant: 1,
                }],
            })),
            simulate: vi.fn(async () => createResults()),
        };

        reporter = {
            log: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            group: vi.fn(),
            groupEnd: vi.fn(),
            time: vi.fn(),
            timeEnd: vi.fn(),
            onExport: vi.fn(async () => {}),
        };
    });

    it('runs ODE models when parsing misses simulation phases', async () => {
        (simulator.parse as ReturnType<typeof vi.fn>).mockResolvedValue({
            ...createBaseModel(),
            simulationOptions: { t_end: 12, n_steps: 6 },
            simulationPhases: [],
            actions: [],
        });

        const success = await runSingleBatchItem(
            { simulator, reporter },
            { name: 'ode-missing-phases', code: 'simulate_ode({t_end=>12,n_steps=>6})' }
        );

        expect(success).toBe(true);
        expect(simulator.generateNetwork).toHaveBeenCalledTimes(1);
        expect(simulator.simulate).toHaveBeenCalledTimes(1);
        const simulatedModel = (simulator.simulate as ReturnType<typeof vi.fn>).mock.calls[0][0] as BNGLModel;
        expect(simulatedModel.simulationPhases).toEqual([{ method: 'ode', t_end: 12, n_steps: 6 }]);
    });

    it('injects a default ODE phase for models without simulate actions', async () => {
        (simulator.parse as ReturnType<typeof vi.fn>).mockResolvedValue({
            ...createBaseModel(),
            simulationOptions: { t_end: 25, n_steps: 5 },
            simulationPhases: [],
            actions: [],
        });

        const success = await runSingleBatchItem(
            { simulator, reporter },
            { name: 'missing-simulate', code: 'begin model\nend model' }
        );

        expect(success).toBe(true);
        expect(simulator.generateNetwork).toHaveBeenCalledTimes(1);
        const simulatedModel = (simulator.simulate as ReturnType<typeof vi.fn>).mock.calls[0][0] as BNGLModel;
        expect(simulatedModel.simulationPhases).toEqual([{ method: 'ode', t_end: 25, n_steps: 5 }]);
    });

    it('allows authored SSA phases through the batch runner', async () => {
        (simulator.parse as ReturnType<typeof vi.fn>).mockResolvedValue({
            ...createBaseModel(),
            simulationPhases: [{ method: 'ssa', t_end: 10, n_steps: 10 }],
            actions: [{ type: 'simulate', args: { method: 'ssa' } }],
        });

        const success = await runSingleBatchItem(
            { simulator, reporter },
            { name: 'ssa-model', code: 'simulate_ssa({t_end=>10,n_steps=>10})' }
        );

        expect(success).toBe(true);
        expect(simulator.simulate).toHaveBeenCalledTimes(1);
        expect(reporter.warn).not.toHaveBeenCalled();
    });

    it('skips NFsim models', async () => {
        (simulator.parse as ReturnType<typeof vi.fn>).mockResolvedValue({
            ...createBaseModel(),
            simulationPhases: [],
            actions: [],
        });

        const success = await runSingleBatchItem(
            { simulator, reporter },
            { name: 'nf-model', code: 'simulate_nf({t_end=>10,n_steps=>10})' }
        );

        expect(success).toBe(false);
        expect(simulator.simulate).not.toHaveBeenCalled();
        expect(reporter.warn).toHaveBeenCalledWith(
            '[Batch] Skipping nf-model: NFsim models are not supported by the batch runner (detected: nfsim).'
        );
    });
});

describe('safeModelName', () => {
    it('returns lowercase for alphanumeric strings', () => {
        expect(safeModelName('ModelName123')).toBe('modelname123');
    });

    it('replaces special characters with underscores', () => {
        expect(safeModelName('My-Model (test) & version 1.0!')).toBe('my_model__test____version_1_0_');
        expect(safeModelName('hello/world\\test')).toBe('hello_world_test');
    });

    it('handles an empty string', () => {
        expect(safeModelName('')).toBe('');
    });

    it('handles strings that are already safe', () => {
        expect(safeModelName('safe_model_name')).toBe('safe_model_name');
        expect(safeModelName('another_123')).toBe('another_123');
    });
});
