import { bnglService } from '../../services/bnglService';
import { MODEL_CATEGORIES, BNG2_EXCLUDED_MODELS, NFSIM_MODELS } from '../../constants';
import { BNGLModel, SimulationResults } from '../../types';
import { getSimulationOptionsFromParsedModel } from './simulationOptions';
import { downloadCsv } from './download';

// If you need extra verbosity for batch runner, flip this to true locally
const VERBOSE_BATCH_RUNNER = false;

function normalizeFilterNames(names?: string[]) {
    if (!names || names.length === 0) return null;
    const normalized = names
        .map(n => String(n ?? '').trim())
        .filter(Boolean)
        .map(n => n.toLowerCase());
    return normalized.length ? normalized : null;
}

function safeModelName(name: string) {
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

/**
 * Run simulation using the worker's native phase/action execution path.
 * This preserves BNGL phase semantics (continue, setParameter, setConcentration,
 * save/reset actions) and avoids unit drift between chained ODE phases.
 */
async function executeMultiPhaseSimulation(model: BNGLModel, seed?: number): Promise<SimulationResults> {
    const options = getSimulationOptionsFromParsedModel(model, 'default', {
        solver: 'cvode',
        includeSpeciesData: false,
        ...(seed !== undefined ? { seed } : {})
    });
    const phaseCount = model.simulationPhases?.length ?? 0;
    const label = phaseCount > 1 ? `Multi-Phase (${phaseCount})` : 'Single Phase';
    return await bnglService.simulate(model, options, { description: label });
}


async function runSingleBatchItem(modelDef: { name: string, code: string, id?: string }, batchSeed?: number) {
    console.group(`Processing: ${modelDef.name}`);
    try {
        // 1. Parse
        if (VERBOSE_BATCH_RUNNER) console.time('Parse');
        const model: BNGLModel = await bnglService.parse(modelDef.code, { description: `Batch Parse: ${modelDef.name}` });
        if (VERBOSE_BATCH_RUNNER) console.timeEnd('Parse');

        // 1b. Network Generation (Fix for rule-based models)
        const actions = model.actions || [];
        const needsNetGen = actions.some(a =>
            a.type === 'generate_network' ||
            a.type === 'simulate_ode' ||
            (a.type === 'simulate' && a.args?.method === 'ode')
        );

        // NFsim models often fail network generation (infinite species)
        // We should skip this step for known NFsim models unless strictly required?
        // Actually, if the model is in NFSIM_MODELS, we should probably SKIP the expanded network generation
        // even if it has a generate_network action, because that action might be intended for BNG2 which handles iter limits better,
        // or it might just be a leftover. 
        // User explicitly said: "nfsim isn't supposed to generate a network".
        const isNfSimModel = NFSIM_MODELS.has(modelDef.id || modelDef.name);

        if (needsNetGen && !isNfSimModel) {
            if (VERBOSE_BATCH_RUNNER) console.time('NetGen');
            console.log('Generating network...');
            // Prefer model-declared generate_network limits; fall back to parity-safe defaults.
            const netOptions = {
                maxSpecies: model.networkOptions?.maxSpecies ?? 2000,
                maxReactions: model.networkOptions?.maxReactions ?? 5000,
                maxIterations: model.networkOptions?.maxIter ?? 1000,
                maxAgg: model.networkOptions?.maxAgg ?? 500,
                ...(model.networkOptions?.maxStoich !== undefined ? { maxStoich: model.networkOptions.maxStoich as any } : {})
            };

            // Updating model with expanded network
            const expanded = await bnglService.generateNetwork(model, netOptions, { description: `Batch NetGen: ${modelDef.name}` });
            // Force update just in case Object.assign is flaky with getters/setters (unlikely but possible)
            if (expanded.reactions) model.reactions = expanded.reactions;
            if (expanded.species) model.species = expanded.species;
            if ((expanded as any).concreteObservables) (model as any).concreteObservables = (expanded as any).concreteObservables;

            if (VERBOSE_BATCH_RUNNER) console.timeEnd('NetGen');
        }

        // 2. Simulate (with multi-phase support)
        if (VERBOSE_BATCH_RUNNER) console.time('Simulate');
        // Auto-inject simulate action if none exist (for models that only define network)
        model.simulationPhases = model.simulationPhases ?? [];
        if (model.simulationPhases.length === 0) {
            console.log(`[Batch] Auto-injecting default simulate action for ${model.name}`);
            model.simulationPhases.push({ method: 'ode', t_end: 100, n_steps: 100 });
        }
        const results: SimulationResults = await executeMultiPhaseSimulation(model, batchSeed);
        if (VERBOSE_BATCH_RUNNER) console.timeEnd('Simulate');

        if (modelDef.id === 'Lang_2024' || modelDef.name.includes('Lang')) {
            console.log(`[Lang_2024 Debug] Model Loaded: ${model.name}`);
            console.log(`[Lang_2024 Debug] Seed Species Count: ${model.species.length}`);
            console.log(`[Lang_2024 Debug] Rules Count: ${model.reactionRules.length}`);
            if (model.reactionRules.length > 0) {
                console.log(`[Lang_2024 Debug] First 5 rules: ${model.reactionRules.slice(0, 5).map(r => r.name).join(', ')}`);
            }

            if (results.expandedReactions) {
                console.log(`[Lang_2024 Debug] Total Generated Reactions: ${results.expandedReactions.length}`);

                // Look for CCNE degradation reactions
                // Note: In generated reactions, reactants/products are just indices or names if expanded
                // We need to inspect them carefully.
                const ccneReactions = results.expandedReactions.filter(r => {
                    return r.reactants.some(s => s.includes('CCNE')) || r.products.some(s => s.includes('CCNE'));
                });
                console.log(`[Lang_2024 Debug] Found ${ccneReactions.length} reactions involving CCNE:`);
                ccneReactions.forEach((r, i) => {
                    console.log(`  CCNE Rxn ${i}: ${r.reactants.join(' + ')} -> ${r.products.join(' + ')} (k=${r.rateConstant}, expr=${r.rateExpression})`);
                });
            } else {
                console.log('[Lang_2024 Debug] No expanded reactions found in results.');
            }
        }

        // 4. Export
        const headers = results.headers || [];
        const safeName = safeModelName(modelDef.id || modelDef.name);
        downloadCsv(results.data, headers, `results_${safeName}.csv`);

        console.log('✅ Exported CSV');
        console.groupEnd();
        return true;
    } catch (e: any) {
        console.error('❌ Failed:', e);
        // If the worker crashed or was terminated, we MUST restart it to continue processing subsequent models
        if (e.message?.includes('terminated') || e.message?.includes('Worker')) {
            console.warn('⚠️ Worker terminated/crashed. Restarting service for next model...');
            bnglService.restart();
        }
        console.groupEnd();
        return false;
    }
}

export async function runModels(modelNames?: string[]) {
    const filter = normalizeFilterNames(modelNames);
    const allModelsRaw = MODEL_CATEGORIES.flatMap(c => c.models);
    const allModels = Array.from(new Map(allModelsRaw.map(m => [m.id || m.name, m])).values());
    const modelsToProcess = filter
        ? allModels.filter(m => {
            const n = m.name.toLowerCase();
            const safe = safeModelName(m.name);
            const id = m.id ? m.id.toLowerCase() : '';
            return filter.includes(n) || filter.includes(safe) || (id && filter.includes(id));
        })
        : allModels;

    console.group('🚀 Batch Model Runner');
    console.log(`Found ${modelsToProcess.length} models to process.`);
    if (filter) console.log('Model filter:', filter);

    let successCount = 0;
    let failCount = 0;

    const globalAny = (typeof window !== 'undefined' ? (window as any) : undefined);
    const batchSeed = typeof globalAny?.__batchSeed === 'number' ? globalAny.__batchSeed : undefined;
    if (batchSeed !== undefined) {
        console.log(`[Batch] Using deterministic seed: ${batchSeed}`);
    }

    for (const modelDef of modelsToProcess) {
        const success = await runSingleBatchItem(modelDef, batchSeed);
        if (success) successCount++;
        else failCount++;

        // Slight delay to allow browser to breathe/download
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`Batch Run Complete. Success: ${successCount}, Failed: ${failCount}`);
    console.groupEnd();
    return { success: successCount, failed: failCount };
}

export function getModelEntries() {
    const all = MODEL_CATEGORIES.flatMap(c => c.models)
        .filter(m => !BNG2_EXCLUDED_MODELS.has(m.id) && !BNG2_EXCLUDED_MODELS.has(m.name));
    const deduped = Array.from(new Map(all.map(m => [m.id || m.name, m])).values());
    return deduped.map(m => ({ id: m.id || m.name, name: m.name }));
}

export function getModelNames() {
    return getModelEntries().map(m => m.name);
}

export async function runAllModels() {
    return runModels();
}

export async function runNfSimModels() {
    const nfModels = Array.from(NFSIM_MODELS).filter(m => !BNG2_EXCLUDED_MODELS.has(m));
    return runModels(nfModels);
}

// Expose on window for Playwright
if (typeof window !== 'undefined') {
    (window as any).runModels = runModels;
    (window as any).runCustomModel = async (name: string, code: string) => {
        const globalAny = (window as any);
        const batchSeed = typeof globalAny.__batchSeed === 'number' ? globalAny.__batchSeed : undefined;
        return runSingleBatchItem({ name, code, id: name }, batchSeed);
    };
    (window as any).runAllModels = runAllModels;
    (window as any).runNfSimModels = runNfSimModels;
    (window as any).getModelEntries = getModelEntries;
    (window as any).getModelNames = getModelNames;
}
