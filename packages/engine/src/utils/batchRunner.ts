import { BNGLModel, SimulationResults } from '../types';
import { getSimulationOptionsFromParsedModel } from './simulationOptions';

/**
 * Interface for a model definition in a batch.
 */
export interface BatchModelDef {
    name: string;
    code?: string;
    id?: string;
}

/**
 * Interface for the simulation service used by the batch runner.
 */
export interface BatchSimulator {
    parse(code: string, options?: { description?: string }): Promise<BNGLModel>;
    generateNetwork(model: BNGLModel, options: any, options2?: { description?: string }): Promise<BNGLModel>;
    simulate(model: BNGLModel, options: any, options2?: { description?: string }): Promise<SimulationResults>;
    loadModelCode?(id: string): Promise<string | undefined>;
    restart?(): void;
}

/**
 * Interface for reporting progress and results.
 */
export interface BatchReporter {
    log(message: string): void;
    warn(message: string): void;
    error(message: string, error?: any): void;
    group(name: string): void;
    groupEnd(): void;
    time(label: string): void;
    timeEnd(label: string): void;
    /**
     * Callback for exporting results.
     * NOTE: Implementation is environment-specific (e.g., browser downloads vs server-side file writing).
     */
    onExport(results: SimulationResults, modelDef: BatchModelDef, model: BNGLModel): Promise<void>;
}

export interface BatchRunnerOptions {
    simulator: BatchSimulator;
    reporter: BatchReporter;
    verbose?: boolean;
    nfSimModels?: Set<string>;
    /**
     * Enable strict functional-rate evaluation so unresolved variables or NaN
     * results throw loudly instead of silently returning 0. Intended for
     * reference-output / CI generation.
     */
    strictFunctionalRates?: boolean;
}

export function normalizeFilterNames(names?: string[]) {
    if (!names || names.length === 0) return null;
    const normalized = names
        .map(n => String(n ?? '').trim())
        .filter(Boolean)
        .map(n => n.toLowerCase());
    return normalized.length ? normalized : null;
}

export function safeModelName(name: string) {
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function stripLineComments(text: string): string {
    return text
        .split(/\r?\n/)
        .map((line) => {
            const idx = line.indexOf('#');
            return idx >= 0 ? line.slice(0, idx) : line;
        })
        .join('\n');
}

function detectSimMethodFromCode(text: string): 'ode' | 'ssa' | 'nfsim' | 'unspecified' | 'missing' {
    const stripped = stripLineComments(text);
    if (!/\bsimulate(?:_ode|_ssa|_nf)?\s*\(/i.test(stripped)) return 'missing';

    const lower = stripped.toLowerCase();
    const compact = lower.replace(/\s+/g, '');
    const hasSSA =
        /simulate_ssa\s*\(/.test(lower) ||
        compact.includes('method=>"ssa"') ||
        compact.includes("method=>'ssa'");
    const hasNF =
        /simulate_nf\s*\(|nfsim\s*\(/.test(lower) ||
        compact.includes('method=>"nf"') ||
        compact.includes("method=>'nf'") ||
        compact.includes('method=>"nfsim"') ||
        compact.includes("method=>'nfsim'");
    const hasODE =
        /simulate_ode\s*\(/.test(lower) ||
        compact.includes('method=>"ode"') ||
        compact.includes("method=>'ode'");

    if (hasSSA) return 'ssa';
    if (hasNF) return 'nfsim';
    if (hasODE) return 'ode';
    return 'unspecified';
}

function hasBatchCompatibleSimulationPhases(model: BNGLModel): boolean {
    const phases = model.simulationPhases ?? [];
    return phases.length > 0 && phases.every((phase) => phase.method === 'ode' || phase.method === 'ssa');
}

function resolveBatchSimulationMethod(
    model: BNGLModel,
    code: string
): 'ode' | 'ssa' | 'nfsim' {
    if (hasBatchCompatibleSimulationPhases(model)) {
        return model.simulationPhases?.some((phase) => phase.method === 'ssa') ? 'ssa' : 'ode';
    }

    const detectedMethod = detectSimMethodFromCode(code);
    if (detectedMethod === 'ssa') return 'ssa';
    if (detectedMethod === 'nfsim') return 'nfsim';
    return 'ode';
}

function ensureBatchSimulationPhases(model: BNGLModel, method: 'ode' | 'ssa'): void {
    if ((model.simulationPhases?.length ?? 0) > 0) return;

    const options = getSimulationOptionsFromParsedModel(model, method);
    model.simulationPhases = [{
        method,
        t_end: options.t_end,
        n_steps: options.n_steps,
        ...(options.atol !== undefined ? { atol: options.atol } : {}),
        ...(options.rtol !== undefined ? { rtol: options.rtol } : {}),
    }];
}

/**
 * Run simulation using the worker's native phase/action execution path.
 */
export async function executeMultiPhaseSimulation(
    simulator: BatchSimulator,
    model: BNGLModel,
    seed?: number,
    strictFunctionalRates?: boolean
): Promise<SimulationResults> {
    const options = getSimulationOptionsFromParsedModel(model, 'default', {
        solver: 'cvode',
        includeSpeciesData: false,
        ...(seed !== undefined ? { seed } : {}),
        ...(strictFunctionalRates !== undefined ? { strictFunctionalRates } : {})
    });
    const phaseCount = model.simulationPhases?.length ?? 0;
    const label = phaseCount > 1 ? `Multi-Phase (${phaseCount})` : 'Single Phase';
    return await simulator.simulate(model, options, { description: label });
}

/**
 * Result of running a single batch item:
 * - `'success'`: parsed, simulated, and exported cleanly.
 * - `'skipped'`: intentionally not run (e.g. NFsim model, which the batch
 *   runner does not support). This is NOT a failure.
 * - `'failed'`: an actual error occurred while parsing/simulating/exporting.
 */
export type BatchItemStatus = 'success' | 'skipped' | 'failed';

export async function runSingleBatchItem(
    options: BatchRunnerOptions,
    modelDef: BatchModelDef,
    batchSeed?: number
): Promise<BatchItemStatus> {
    const { simulator, reporter, verbose, nfSimModels, strictFunctionalRates } = options;
    reporter.group(`Processing: ${modelDef.name}`);
    try {
        // Resolve code
        let code = modelDef.code;
        if (!code && modelDef.id && simulator.loadModelCode) {
            code = await simulator.loadModelCode(modelDef.id);
        }
        if (!code) throw new Error(
          `No BNGL code available for model "${modelDef.name}". ` +
          'Either provide the code directly in the model definition, or ensure loadModelCode is configured to retrieve it by ID.'
        );

        // 1. Parse
        if (verbose) reporter.time('Parse');
        const model: BNGLModel = await simulator.parse(code, { description: `Batch Parse: ${modelDef.name}` });
        if (verbose) reporter.timeEnd('Parse');

        const detectedMethod = detectSimMethodFromCode(code);
        const batchMethod = resolveBatchSimulationMethod(model, code);
        if (batchMethod === 'nfsim') {
            const modelLabel = modelDef.id || modelDef.name;
            reporter.warn(`[Batch] Skipping ${modelLabel}: NFsim models are not supported by the batch runner (detected: ${detectedMethod}).`);
            reporter.groupEnd();
            // Intentional skip — NOT a failure. If another unsupported method
            // (e.g. spatial) is added here, return 'skipped' for it too rather
            // than exempting the model in EXPECTED_MISMATCHES.
            return 'skipped';
        }

        ensureBatchSimulationPhases(model, batchMethod);

        // 1b. Network Generation
        const actions = model.actions || [];
        const hasReactionRules = (model.reactionRules?.length ?? 0) > 0;
        const hasExpandedNetwork = (model.reactions?.length ?? 0) > 0;
        const needsNetGen = actions.some(a =>
            a.type === 'generate_network' ||
            a.type === 'simulate_ode' ||
            (a.type === 'simulate' && a.args?.method === 'ode')
        ) || (actions.length === 0 && batchMethod === 'ode' && hasReactionRules && !hasExpandedNetwork);

        const isNfSimModel = nfSimModels?.has(modelDef.id || modelDef.name) ?? false;

        if (needsNetGen && !isNfSimModel) {
            if (verbose) reporter.time('NetGen');
            reporter.log('Generating network...');
            const netOptions = {
                maxSpecies: model.networkOptions?.maxSpecies ?? 2000,
                maxReactions: model.networkOptions?.maxReactions ?? 5000,
                maxIterations: model.networkOptions?.maxIter ?? 1000,
                maxAgg: model.networkOptions?.maxAgg ?? 500,
                ...(model.networkOptions?.maxStoich !== undefined ? { maxStoich: model.networkOptions.maxStoich as any } : {})
            };

            const expanded = await simulator.generateNetwork(model, netOptions, { description: `Batch NetGen: ${modelDef.name}` });
            if (expanded.reactions) model.reactions = expanded.reactions;
            if (expanded.species) model.species = expanded.species;
            if ((expanded as any).concreteObservables) (model as any).concreteObservables = (expanded as any).concreteObservables;

            if (verbose) reporter.timeEnd('NetGen');
        }

        // 2. Simulate
        if (verbose) reporter.time('Simulate');
        model.simulationPhases = model.simulationPhases ?? [];
        const results: SimulationResults = await executeMultiPhaseSimulation(simulator, model, batchSeed, strictFunctionalRates);
        if (verbose) reporter.timeEnd('Simulate');

        // 3. Export (via reporter callback)
        await reporter.onExport(results, modelDef, model);

        reporter.log('✅ Exported results');
        reporter.groupEnd();
        return 'success';
    } catch (e: any) {
        reporter.error('❌ Failed:', e);
        if (simulator.restart && (e.message?.includes('terminated') || e.message?.includes('Worker'))) {
            reporter.warn('⚠️ Simulator terminated/crashed. Restarting...');
            simulator.restart();
        }
        reporter.groupEnd();
        return 'failed';
    }
}
