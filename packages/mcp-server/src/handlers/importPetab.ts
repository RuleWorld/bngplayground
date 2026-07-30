import { parsePEtab, fitParameters, simulate, loadEvaluator } from '@bngplayground/engine';
import type { ToolArgs, ToolResult } from '../types/index.js';
import { importPetabArgsSchema } from '../schemas/index.js';
import { createToolResult, parseArgs, parseModelOrThrow, expandModel, cloneExpandedModel, updateMassActionRates } from '../services/engine.js';
import { structureError } from '../services/errors.js';

export async function handleImportPetab(args: ToolArgs): Promise<ToolResult<any>> {
    try {
        const parsedArgs = parseArgs('import_petab', importPetabArgsSchema, args);
        const model = parseModelOrThrow(parsedArgs.code);
        const expandedModel = await expandModel(model);

        const files = new Map<string, string>();
        files.set('parameters.tsv', parsedArgs.petab_parameters);
        files.set('measurements.tsv', parsedArgs.petab_measurements);
        if (parsedArgs.petab_conditions) {
            files.set('conditions.tsv', parsedArgs.petab_conditions);
        }

        const petab = parsePEtab(files);
        await loadEvaluator();

        const tEnd = Math.max(...petab.measurements.map((m) => m.time));

        const result = await fitParameters({
            model: expandedModel,
            paramBounds: petab.paramBounds,
            experimentalData: petab.measurements,
            simulate: async (overrides, options) => {
                const runModel = cloneExpandedModel(expandedModel);
                Object.entries(overrides).forEach(([k, v]) => {
                    runModel.parameters[k] = v;
                });
                updateMassActionRates(runModel);
                return simulate(0, runModel, { ...options, method: 'ode', t_end: tEnd, n_steps: 100 }, {
                    checkCancelled: () => { },
                    postMessage: () => { },
                });
            },
            algorithm: parsedArgs.algorithm as any,
            maxEval: parsedArgs.max_iterations ?? 500,
        });

        return createToolResult({
            ...result,
            petab_warnings: petab.warnings,
            n_parameters_estimated: petab.paramBounds.length,
            n_measurements: petab.measurements.length,
        });
    } catch (error) {
        return createToolResult(structureError(error instanceof Error ? error : new Error(String(error), { cause: error })));
    }
}
