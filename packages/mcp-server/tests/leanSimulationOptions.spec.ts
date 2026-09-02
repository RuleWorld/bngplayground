import { beforeEach, describe, expect, it, vi } from 'vitest';

const engineMocks = vi.hoisted(() => ({
    abcSMC: vi.fn(),
    computeFIM: vi.fn(),
    fitParameters: vi.fn(),
    generateExpandedNetwork: vi.fn(),
    loadEvaluator: vi.fn(),
    parseBNGLWithANTLR: vi.fn(),
    parsePEtab: vi.fn(),
    profileLikelihood: vi.fn(),
    pruneModel: vi.fn(),
    simulate: vi.fn(),
    sobolSensitivity: vi.fn(),
    updateMassActionRates: vi.fn(),
}));

vi.mock('@bngplayground/engine', async (importOriginal) => ({
    ...await importOriginal<typeof import('@bngplayground/engine')>(),
    ...engineMocks,
}));

vi.mock('../src/services/pathwayCommons/pathwayCommonsService.js', () => ({
    queryPathwayCommons: vi.fn(async () => ({
        summary: '',
        confirmedInteractions: [],
        missingInteractions: [],
    })),
}));

import { handleBayesianInference } from '../src/handlers/bayesianInference.js';
import { handleComputeFim } from '../src/handlers/computeFim.js';
import { handleFitParameters } from '../src/handlers/fitParameters.js';
import { handleIdentifiability } from '../src/handlers/identifiability.js';
import { handleImportPetab } from '../src/handlers/importPetab.js';
import { handleReduceModel } from '../src/handlers/reduceModel.js';
import { handleSobolSensitivity } from '../src/handlers/sobolSensitivity.js';
import { withDataOnlySimulationOutput } from '../src/services/engine.js';
import { diagnoseModelDeep } from '../src/services/intelligence/diagnose.js';

const MODEL = {
    parameters: { k: 1 },
    moleculeTypes: [{ name: 'A', components: [] }],
    species: [{ name: 'A()', initialConcentration: 10 }],
    observables: [{ name: 'Obs', type: 'molecules', pattern: 'A()' }],
    reactions: [{ reactants: ['A()'], products: [], rate: 'k', rateConstant: 1 }],
    reactionRules: [{
        name: 'decay',
        reactants: ['A()'],
        products: [],
        rate: 'k',
        isBidirectional: false,
    }],
};

const DATA = [
    { time: 0, observables: { Obs: 10 } },
    { time: 1, observables: { Obs: 4 } },
];

const SIMULATION_RESULT = {
    headers: ['time', 'Obs'],
    data: [{ time: 0, Obs: 10 }, { time: 1, Obs: 4 }],
};

function expectEverySimulationToBeDataOnly(): void {
    expect(engineMocks.simulate).toHaveBeenCalled();
    for (const [, , options] of engineMocks.simulate.mock.calls) {
        expect(options).toEqual(expect.objectContaining({
            includeSpeciesData: false,
            includeExpandedNetwork: false,
        }));
    }
}

beforeEach(() => {
    vi.clearAllMocks();

    engineMocks.parseBNGLWithANTLR.mockReturnValue({
        success: true,
        model: structuredClone(MODEL),
        errors: [],
    });
    engineMocks.generateExpandedNetwork.mockImplementation(async (model) => model);
    engineMocks.loadEvaluator.mockResolvedValue(undefined);
    engineMocks.simulate.mockResolvedValue(SIMULATION_RESULT);
    engineMocks.updateMassActionRates.mockImplementation(() => undefined);

    engineMocks.computeFIM.mockImplementation(async (config) => {
        await config.simulate({ k: 1.1 });
        return {
            jacobian: [[1]],
            paramNames: ['k'],
            eigenvalues: [1],
            conditionNumber: 1,
            identifiableParams: ['k'],
            unidentifiableParams: [],
        };
    });
    engineMocks.profileLikelihood.mockImplementation(async (config) => {
        await config.simulate({ k: 1.1 });
        return { profiles: {}, threshold: 0, baselineSSR: 0 };
    });
    engineMocks.sobolSensitivity.mockImplementation(async (config) => {
        await config.simulate({ k: 1.1 });
        return [{
            observable: 'Obs',
            firstOrder: [],
            totalOrder: [],
            totalVariance: 0,
            nSimulations: 1,
        }];
    });
    engineMocks.abcSMC.mockImplementation(async (config) => {
        await config.simulate({ k: 1.1 });
        return { populations: [] };
    });
    engineMocks.fitParameters.mockImplementation(async (config) => {
        await config.simulate({ k: 1.1 }, {
            includeSpeciesData: true,
            includeExpandedNetwork: true,
        });
        return {
            params: [1.1],
            paramNames: ['k'],
            sse: 0,
            rSquared: 1,
            nEval: 1,
            converged: true,
        };
    });
    engineMocks.pruneModel.mockReturnValue({
        reducedCode: '',
        prunedParameters: [],
        prunedRules: [],
        keptRules: [],
        reductionRatio: 0,
    });
    engineMocks.parsePEtab.mockReturnValue({
        paramBounds: [{ name: 'k', min: 0.1, max: 2, initial: 1 }],
        measurements: DATA.map((point) => ({ time: point.time, values: point.observables })),
        warnings: [],
    });
});

describe('data-only simulation options', () => {
    it('overrides conflicting metadata requests without mutating the input', () => {
        const input = { method: 'ode', includeSpeciesData: true, includeExpandedNetwork: true };

        expect(withDataOnlySimulationOutput(input)).toEqual({
            method: 'ode',
            includeSpeciesData: false,
            includeExpandedNetwork: false,
        });
        expect(input).toEqual({
            method: 'ode',
            includeSpeciesData: true,
            includeExpandedNetwork: true,
        });
    });

    const handlerCases: Array<[string, () => Promise<unknown>]> = [
        ['compute_fim', () => handleComputeFim({ code: 'model', parameters: ['k'] })],
        ['identifiability_analysis', () => handleIdentifiability({
            code: 'model',
            parameters: ['k'],
            data: DATA,
            n_grid: 2,
        })],
        ['sobol_sensitivity', () => handleSobolSensitivity({
            code: 'model',
            parameters: [{ name: 'k', min: 0.1, max: 2 }],
            n_samples: 2,
            n_bootstrap: 2,
        })],
        ['bayesian_inference', () => handleBayesianInference({
            code: 'model',
            priors: [{ name: 'k', distribution: 'uniform', min: 0.1, max: 2 }],
            data: DATA,
            n_particles: 2,
            n_populations: 1,
        })],
        ['fit_parameters', () => handleFitParameters({
            code: 'model',
            parameters: { k: { min: 0.1, max: 2, initial: 1 } },
            data: DATA,
            max_iterations: 1,
        })],
        ['reduce_model', () => handleReduceModel({
            code: 'model',
            parameters: { k: { min: 0.1, max: 2, initial: 1 } },
            data: DATA,
            max_iterations: 1,
        })],
        ['import_petab', () => handleImportPetab({
            code: 'model',
            petab_parameters: 'parameterId\tlowerBound\tupperBound\n',
            petab_measurements: 'observableId\ttime\tmeasurement\n',
            max_iterations: 1,
        })],
    ];

    for (const [name, runHandler] of handlerCases) {
        it(`${name} propagates lean options to its repeated simulator`, async () => {
            await runHandler();
            expectEverySimulationToBeDataOnly();
        });
    }

    it('exposes the profile optimizer evaluation bound to the engine', async () => {
        await handleIdentifiability({
            code: 'model',
            parameters: ['k'],
            data: DATA,
            n_grid: 2,
            max_reopt_eval: 7,
        });

        expect(engineMocks.profileLikelihood).toHaveBeenCalledWith(expect.objectContaining({
            maxReoptEval: 7,
        }));
    });

    it('deep diagnosis uses lean output for Sobol and FIM simulations', async () => {
        engineMocks.sobolSensitivity.mockImplementationOnce(async (config) => {
            await config.simulate({ k: 1.1 });
            return [];
        });

        await diagnoseModelDeep({ code: 'model', max_parameters: 1 });

        // The first call is handleSimulate's baseline trajectory. The remaining
        // analysis callbacks share diagnoseModelDeep's data-only options.
        expect(engineMocks.simulate.mock.calls.length).toBeGreaterThanOrEqual(3);
        for (const [, , options] of engineMocks.simulate.mock.calls.slice(1)) {
            expect(options).toEqual(expect.objectContaining({
                includeSpeciesData: false,
                includeExpandedNetwork: false,
            }));
        }
    });
});
