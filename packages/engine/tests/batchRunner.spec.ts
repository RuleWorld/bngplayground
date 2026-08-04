import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BNGLModel, SimulationResults } from '../src/types';
import type { BatchReporter, BatchSimulator } from '../src/utils/batchRunner';
import { runSingleBatchItem, normalizeFilterNames, safeModelName } from '../src/utils/batchRunner';

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

        expect(success).toBe('success');
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

        expect(success).toBe('success');
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

        expect(success).toBe('success');
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

        expect(success).toBe('skipped');
        expect(simulator.simulate).not.toHaveBeenCalled();
        expect(reporter.warn).toHaveBeenCalledWith(
            '[Batch] Skipping nf-model: NFsim models are not supported by the batch runner (detected: nfsim).'
        );
    });

    it('reports failed when simulation throws', async () => {
        (simulator.parse as ReturnType<typeof vi.fn>).mockResolvedValue({
            ...createBaseModel(),
            simulationPhases: [],
            actions: [],
        });
        (simulator.simulate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));

        const success = await runSingleBatchItem(
            { simulator, reporter },
            { name: 'boom-model', code: 'simulate_ode({t_end=>10,n_steps=>10})' }
        );

        expect(success).toBe('failed');
        expect(reporter.error).toHaveBeenCalledWith('❌ Failed:', expect.any(Error));
    });
});

describe('normalizeFilterNames', () => {
    it('returns null for undefined, null, or empty array', () => {
        expect(normalizeFilterNames(undefined)).toBeNull();
        expect(normalizeFilterNames(null as unknown as string[])).toBeNull();
        expect(normalizeFilterNames([])).toBeNull();
    });

    it('returns null if all names are empty or whitespace', () => {
        expect(normalizeFilterNames(['', ' ', '   '])).toBeNull();
        expect(normalizeFilterNames([null as unknown as string, undefined as unknown as string])).toBeNull();
    });

    it('trims and lowercases valid names', () => {
        expect(normalizeFilterNames(['  foo  ', 'BAR', 'BaZ '])).toEqual(['foo', 'bar', 'baz']);
    });

    it('filters out empty/whitespace names and normalizes the rest', () => {
        expect(normalizeFilterNames(['  ', 'A', '', ' b ', undefined as unknown as string, 'C'])).toEqual(['a', 'b', 'c']);
    });
});

describe('safeModelName', () => {
    it('returns lowercase name when it contains only alphanumeric characters', () => {
        expect(safeModelName('MyModel')).toBe('mymodel');
        expect(safeModelName('MODEL123')).toBe('model123');
    });

    it('replaces spaces with underscores', () => {
        expect(safeModelName('My Model')).toBe('my_model');
    });

    it('replaces special characters with underscores', () => {
        expect(safeModelName('Model!@#')).toBe('model___');
        expect(safeModelName('Model-Name')).toBe('model_name');
    });

    it('handles empty strings', () => {
        expect(safeModelName('')).toBe('');
    });

    it('handles strings with only symbols', () => {
        expect(safeModelName('!@#')).toBe('___');
    });

    it('replaces unicode characters', () => {
        // '😊' consists of two surrogate characters in JS, so it results in two underscores
        expect(safeModelName('Model😊')).toBe('model__');
    });
});
