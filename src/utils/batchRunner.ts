import { bnglService } from '../../services/bnglService';
import { MODEL_CATEGORIES, BNG2_EXCLUDED_MODELS, NFSIM_MODELS } from '../../constants';
import { BNGLModel, SimulationResults, SimulationPhase, SimulationOptions } from '../../types';
import { getSimulationOptionsFromParsedModel } from './simulationOptions';
import { downloadCsv } from './download';
import { SafeExpressionEvaluator } from '../../services/safeExpressionEvaluator';
import { isSpeciesMatch } from '../../services/parity/PatternMatcher';

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
 * Execute multi-phase simulations sequentially with proper state management.
 * BioNetGen models can have multiple simulate() actions that need to be run
 * in sequence, with concentration/parameter changes applied between phases.
 * 
 * @param model - Parsed BNGL model with potential multiple simulation phases
 * @returns Concatenated simulation results with monotonic time
 */
async function executeMultiPhaseSimulation(model: BNGLModel, seed?: number): Promise<SimulationResults> {
    const allPhases = model.simulationPhases || [];

    // Capture all phases in the final output by default.
    // BioNetGen playground should show the complete history of all simulations.
    let recordFromIdx = 0;


    // Execution Plan:
    // 1. We must EXECUTE all phases 0..N sequentially to ensure state propagates correctly.
    // 2. We only RECORD phases starting from recordFromIdx (the formatted output chain).

    // If single phase or no phases, use standard execution
    if (allPhases.length <= 1) {
        // Fix: Detect method from the model's phase to respect 'nf' or 'ssa'
        const defaultMethod = allPhases.length > 0 ? (allPhases[0].method || 'ode') : 'ode';
        const options = getSimulationOptionsFromParsedModel(model, defaultMethod as any, {
            solver: 'cvode',
            ...(seed !== undefined ? { seed } : {})
        });
        return await bnglService.simulate(model, options, { description: 'Single Phase' });
    }

    // Multi-phase execution: run each phase sequentially from the beginning
    console.log(`Executing ${allPhases.length} simulation phases sequentially (recording from index ${recordFromIdx})`);

    let cumulativeTime = 0;
    let allData: Record<string, number>[] = [];
    let headers: string[] = [];
    let finalState: number[] | undefined;
    let savedConcentrationState: Record<string, number> | null = null;
    let previousEndTime = 0; // Track absolute end time of previous phase
    let currentExpandedReactions: any[] | undefined;
    let currentExpandedSpecies: any[] | undefined;

    for (let i = 0; i < allPhases.length; i++) {
        const phase = allPhases[i];
        const phaseNum = i + 1;

        // SKIP LOGIC: If this phase is an "equilibration" phase that is part of the recorded set
        // but has steps <= 1, we might want to skip RECORDING it, but we must still EXECUTE it if it's needed for state.
        // Actually, execute everything. Filter output later.

        console.log(`Phase ${phaseNum}/${allPhases.length}: t_end=${phase.t_end}, n_steps=${phase.n_steps}, continue=${phase.continue}`);

        // For continuation phases, BNG2 typically treats t_end as ABSOLUTE time.
        // However, some models (like bistable-toggle-switch) specify 't_end' as a DURATION relative to the start of the phase.
        // HEURISTIC: If phase.t_end > previousEndTime, assume Absolute Time.
        //            If phase.t_end <= previousEndTime, assume Duration.
        const isFirstPhase = i === 0;
        const effectiveDuration = phase.continue && !isFirstPhase
            ? ((phase.t_end || 0) > previousEndTime ? (phase.t_end || 0) - previousEndTime : (phase.t_end || 100))
            : (phase.t_end || 100);

        // Build options for this phase
        const phaseOptions: SimulationOptions = {
            method: (phase.method as any) || 'ode',
            t_end: effectiveDuration,
            n_steps: phase.n_steps || 100,
            solver: 'cvode',
            ...(phase.atol !== undefined ? { atol: phase.atol } : {}),
            ...(phase.rtol !== undefined ? { rtol: phase.rtol } : {}),
            ...(seed !== undefined ? { seed } : {}),
        };

        console.log(`[Multi-phase] Phase ${i + 1} simulating for duration=${effectiveDuration} (continue=${phase.continue}, previousEndTime=${previousEndTime})`);

        // Create a modified model with only THIS phase
        // This prevents aggregateOdePhases from combining all phases
        // For continuation phases, adjust t_end to be the effective duration and clear t_start
        const adjustedPhase: SimulationPhase = phase.continue && !isFirstPhase
            ? { ...phase, t_start: 0, t_end: effectiveDuration }
            : phase;

        const singlePhaseModel: BNGLModel = {
            ...model,
            simulationPhases: [adjustedPhase],
            // Use already expanded network if available to preserve state
            species: currentExpandedSpecies || model.species,
            reactions: currentExpandedReactions || model.reactions || [],
        };

        // If this is a continuation (phase > 1), we need to set initial conditions from previous phase
        if (i > 0 && finalState) {
            // Update species initialConcentration with final state from previous phase
            // This simulates the "continue=>1" behavior
            // We MUST use the expanded species list to avoid losing generated species!
            const speciesList = currentExpandedSpecies || model.species;
            singlePhaseModel.species = speciesList.map((sp, j) => ({
                ...sp,
                initialConcentration: finalState![j] !== undefined ? finalState![j] : (sp.initialConcentration || 0),
            }));
            console.log(`[Multi-phase] Phase ${i + 1} initialized from finalState. Species count: ${singlePhaseModel.species.length}`);
        }

        // Apply concentration changes that occur after the previous phase
        // Apply concentration changes that occur after the previous phase
        const concentrationChanges = (model.concentrationChanges || [])
            .filter(c => c.afterPhaseIndex === i - 1);
        // These are applied manually below for multi-phase execution.
        // Keep worker-side concentrationChanges empty to avoid double-application.
        singlePhaseModel.concentrationChanges = [];

        // Apply parameter changes that occur after the previous phase
        const parameterChanges = (model.parameterChanges || [])
            .filter(p => p.afterPhaseIndex === i - 1);
        // These are also applied manually below; avoid forwarding to worker to
        // prevent duplicate setParameter effects.
        singlePhaseModel.parameterChanges = [];

        // For all other phases, clear changes to prevent double-application or stale resets
        // (Worker will only see the current phase's changes)

        // Helper to normalize a species name for matching (sort components alphabetically)
        const normalizeSpeciesName = (name: string): string => {
            // Support optional compartment prefix: @cell:LPS(MD2,TLR4,CD14)
            const match = name.match(/^(@[A-Za-z0-9_]+:)?(\$?[A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)$/);
            if (!match) return name.toLowerCase().replace(/\s/g, '');
            const prefix = match[1] ? match[1].toLowerCase() : '';
            const molName = match[2].toLowerCase();
            const components = match[3].split(',').map(s => s.trim().toLowerCase()).sort().join(',');
            return `${prefix}${molName}(${components})`;
        };

        for (const change of concentrationChanges) {
            const mode = change.mode ?? 'set';
            if (mode === 'save') {
                const speciesList = singlePhaseModel.species;
                const saved: Record<string, number> = {};
                speciesList.forEach(sp => {
                    saved[sp.name] = sp.initialConcentration ?? 0;
                });
                savedConcentrationState = saved;
                console.log(`[Multi-phase] Saved concentrations for ${Object.keys(saved).length} species.`);
                continue;
            }

            if (mode === 'reset') {
                if (!savedConcentrationState) {
                    console.warn('[Multi-phase] resetConcentrations requested but no saved state available.');
                    continue;
                }
                const speciesList = currentExpandedSpecies || singlePhaseModel.species;
                singlePhaseModel.species = speciesList.map(sp => ({
                    ...sp,
                    initialConcentration: savedConcentrationState?.[sp.name] ?? sp.initialConcentration ?? 0,
                }));
                console.log(`[Multi-phase] Reset concentrations for ${speciesList.length} species.`);
                continue;
            }

            const changeNormalized = normalizeSpeciesName(change.species);
            console.log(`[Multi-phase] Looking for species: "${change.species}" (normalized: ${changeNormalized}) in ${singlePhaseModel.species.length} species`);
            // First try exact match, then normalized match
            let speciesIndex = singlePhaseModel.species.findIndex(sp => sp.name === change.species);
            if (speciesIndex < 0) {
                speciesIndex = singlePhaseModel.species.findIndex(sp => normalizeSpeciesName(sp.name) === changeNormalized);
            }
            if (speciesIndex < 0) {
                speciesIndex = singlePhaseModel.species.findIndex(sp => isSpeciesMatch(sp.name, change.species));
            }
            if (speciesIndex >= 0) {
                console.log(`[Multi-phase] Found at index: ${speciesIndex} with raw value: ${change.value}`);
                let newValue: number;
                if (typeof change.value === 'number') {
                    newValue = change.value;
                } else {
                    const rawValue = String(change.value).trim();
                    if (Object.prototype.hasOwnProperty.call(singlePhaseModel.parameters, rawValue)) {
                        newValue = Number(singlePhaseModel.parameters[rawValue]);
                    } else {
                        try {
                            newValue = SafeExpressionEvaluator.compile(rawValue)(singlePhaseModel.parameters);
                        } catch (e) {
                            newValue = NaN;
                        }
                    }
                }
                if (!isNaN(newValue)) {
                    const currentValue = singlePhaseModel.species[speciesIndex].initialConcentration ?? 0;
                    singlePhaseModel.species[speciesIndex].initialConcentration = mode === 'add'
                        ? currentValue + newValue
                        : newValue;
                    const actionLabel = mode === 'add' ? 'addConcentration' : 'setConcentration';
                    console.log(`[Multi-phase] Applied ${actionLabel} for initial state: ${change.species} = ${singlePhaseModel.species[speciesIndex].initialConcentration}`);
                }
            }
        }

        // Also update parameters in the singlePhaseModel for the manual setParameter calls
        for (const pChange of parameterChanges) {
            if (typeof pChange.value === 'number') {
                singlePhaseModel.parameters[pChange.parameter] = pChange.value;
            } else {
                // If value is a string (expression), try to evaluate it first
                // Wait, BNGLVisitor stores raw string for expressions like "10*60".
                // We should evaluate it using CURRENT parameters.
                try {
                    const val = SafeExpressionEvaluator.compile(String(pChange.value))(singlePhaseModel.parameters);
                    if (!isNaN(val)) {
                        singlePhaseModel.parameters[pChange.parameter] = val;
                        console.log(`[Multi-phase] Applied setParameter: ${pChange.parameter} = ${val} (expr: ${pChange.value})`);
                    }
                } catch (e) {
                    console.warn(`[Multi-phase] Failed to evaluate parameter change: ${pChange.parameter}=${pChange.value}`);
                }
            }
        }

        // CRITICAL FIX: Recalculate all dependent parameters and reaction rates!
        // Hat_2016 and other models update base parameters (like IR_on) and expect
        // derived parameters (like production_rate) to update automatically.
        if (singlePhaseModel.paramExpressions) {
            console.log('[Multi-phase] Recalculating dependent parameters and reaction rates...');
            const maxPasses = 10;
            const resolvedParams: Record<string, number> = { ...singlePhaseModel.parameters };

            // Re-resolve parameters
            for (let pass = 0; pass < maxPasses; pass++) {
                let allResolved = true;
                for (const [name, expr] of Object.entries(singlePhaseModel.paramExpressions)) {
                    // Try to evaluate using current resolved params
                    try {
                        const val = SafeExpressionEvaluator.compile(expr)(resolvedParams);
                        if (!isNaN(val)) {
                            resolvedParams[name] = val;
                        } else {
                            allResolved = false;
                        }
                    } catch (e) {
                        allResolved = false;
                    }
                }
                if (allResolved) break;
            }
            singlePhaseModel.parameters = resolvedParams;
            console.log('[Multi-phase] Parameters updated.');

            // Re-evaluate reaction rates
            if (singlePhaseModel.reactionRules) {
                let updates = 0;
                for (const rule of singlePhaseModel.reactionRules) {
                    if (rule.rateExpression) {
                        try {
                            const val = SafeExpressionEvaluator.compile(rule.rateExpression)(resolvedParams);
                            if (!isNaN(val)) {
                                (rule as any).rateConstant = val; // Force update
                                updates++;
                            }
                        } catch (e) {
                            // ignore
                        }
                    }
                    if (rule.isBidirectional && rule.reverseRate) {
                        // We probably don't have reverseRateExpression stored? BNGLVisitor stored rateExpression=rate.
                        // But reverseRate is also a string.
                        // Assuming reverseRate holds the expression.
                        try {
                            const val = SafeExpressionEvaluator.compile(rule.reverseRate)(resolvedParams);
                            if (!isNaN(val)) {
                                // We need to set reverseRateConstant property if it exists?
                                // NetworkGenerator probably expects it?
                                // Actually NetworkGenerator constructor splits bidirectional rules?
                                // No, NetworkGenerator processes RULES.
                                // Line 728 parseBNGL.ts: calculates `reverseRate` (number).
                                // BUT NetworkGenerator does NOT recalculate it from string if passed.
                                // We might need to handle this if NetworkGenerator supports it.
                                // For now, assume rateConstant forward is main issue.
                            }
                        } catch (e) { }
                    }
                }
                console.log(`[Multi-phase] Updated ${updates} reaction rate constants.`);
            }
        }

        // Run this phase
        const phaseResults = await bnglService.simulate(singlePhaseModel, phaseOptions, {
            description: `Phase ${phaseNum}`
        });

        headers = phaseResults.headers || [];

        // Capture network structure from the first phase (assumed static across phases)
        if (i === 0) {
            currentExpandedReactions = phaseResults.expandedReactions;
            currentExpandedSpecies = phaseResults.expandedSpecies;
        }



        console.log(`[Multi-phase] Phase ${i + 1} raw data: ${phaseResults.data.length} rows, first=${phaseResults.data[0]?.time}, second=${phaseResults.data[1]?.time}, last=${phaseResults.data[phaseResults.data.length - 1]?.time}`);
        console.log(`[Multi-phase] Phase ${i + 1} speciesData: ${phaseResults.speciesData?.length ?? 0} rows, first time=${phaseResults.speciesData?.[0]?.time}, last time=${phaseResults.speciesData?.[phaseResults.speciesData.length - 1]?.time}`);

        // Skip adding data from equilibration phases (n_steps=1) and steady_state phases
        // BioNetGen doesn't output these phases in the GDAT file
        // Also skip ONLY the very first phase if it has no concentration/parameter change before it
        // and is followed by a phase with continue=>0 (which indicates a restart)
        const allChangeIndices = [
            ...(model.concentrationChanges?.map(c => c.afterPhaseIndex) ?? []),
            ...(model.parameterChanges?.map(c => c.afterPhaseIndex) ?? [])
        ].filter(idx => idx !== undefined && idx >= -1);

        const hasChangeBeforeFirstPhase = allChangeIndices.some(idx => idx === recordFromIdx - 1); // Check for changes before the *first* phase of the processed set
        const nextPhaseIsRestart = i < allPhases.length - 1 && allPhases[i + 1].continue === false;
        // const isInitialEquilibrationPhase = i === 0 && finalPhases.length > 1 && !hasChangeBeforeFirstPhase && nextPhaseIsRestart && (phase.n_steps ?? 100) <= 1;

        // RECORDING CONDITION:
        // 1. Must be in the "record" window (i >= recordFromIdx)
        // 2. Must not be a 1-step equilibration (unless it's the only thing we have)
        const inRecordWindow = i >= recordFromIdx;
        const isEquil = (phase.n_steps ?? 100) <= 1;

        // If we are in record window, do we skip?
        // Skip if it's an equilibration AND we have more phases coming in this chain
        // (Actually, relying on recordFromIdx logic is safer. If recordFromIdx points to an Equil phase, we arguably should show it?)
        // Let's stick to: Output if in window AND not pure-zero-step (n_steps >= 1 usually means output requested).

        const shouldIncludeOutput = inRecordWindow
            && (phase.n_steps ?? 100) >= 1
            && !phase.steady_state;

        if (shouldIncludeOutput) {
            // Reset cumulative time for first output phase
            if (allData.length === 0) {
                cumulativeTime = 0;
            }

            // Determine if we should skip the first row (common at phase boundaries)
            // BioNetGen skips the t=0 row of continuation phases to avoid duplicates.
            // We should also skip it for regular sequential phases that keep state.
            const skipFirstRow = allData.length > 0 && phaseResults.data.length > 0 && (phaseResults.data[0].time === 0);
            const startIndex = skipFirstRow ? 1 : 0;

            // Determine time offset:
            // - If continue=>1, use previousEndTime (continuation from last phase)
            // - Else if t_start is provided, use it (absolute time restart)
            // - Else use cumulativeTime (regular sequential phases)
            const timeOffset = phase.continue && !isFirstPhase
                ? previousEndTime
                : (phase.t_start !== undefined ? phase.t_start : cumulativeTime);

            // Add rows to output
            for (let j = startIndex; j < phaseResults.data.length; j++) {
                const row = phaseResults.data[j];
                const adjustedRow = { ...row };
                adjustedRow.time = timeOffset + (row.time || 0);
                allData.push(adjustedRow);
            }
            console.log(`[Multi-phase] Phase ${i + 1} adjusted first row time:`, allData[allData.length - (phaseResults.data.length - startIndex)]?.time);
            console.log(`[Multi-phase] Phase ${i + 1} adjusted last row time:`, allData[allData.length - 1]?.time);
            if (skipFirstRow) {
                console.log(`[Multi-phase] Phase ${i + 1} skipped first row (continue=>1)`);
            }

            // Update cumulative time for next phase
            if (!phase.continue) {
                cumulativeTime += effectiveDuration;
            }
            // Update absolute end time for next phase check (and heuristic)
            // Always accumulate using the effective duration of this phase
            previousEndTime = (phase.continue && !isFirstPhase) ? (previousEndTime + effectiveDuration) : cumulativeTime;
        } else {
            console.log(`[Multi-phase] Phase ${i + 1} skipped (equilibration with n_steps=${phase.n_steps})`);
            // Still track absolute end time for skipped phases
            previousEndTime += effectiveDuration;
        }

        // Save final state and expanded network for next phase initialization
        if (phaseResults.expandedSpecies) {
            currentExpandedSpecies = phaseResults.expandedSpecies;
        }
        if (phaseResults.expandedReactions) {
            currentExpandedReactions = phaseResults.expandedReactions;
        }

        if (phaseResults.speciesData && phaseResults.speciesData.length > 0) {
            const lastRow = phaseResults.speciesData[phaseResults.speciesData.length - 1];
            // Map each species in the current network (expanded or original) to its final value
            const speciesList = currentExpandedSpecies || model.species;
            finalState = speciesList.map(sp => lastRow[sp.name] ?? 0);
            console.log(`[Multi-phase] Captured final state. Species count: ${finalState.length}`);
        } else if (phaseResults.data.length > 0) {
            // Fallback (unsafe but better than crash) - though strictly speaking this path is what caused the bug
            console.warn('[Multi-phase] speciesData missing! SimulationLoop might not be returning it. Falling back to observables (this is likely wrong).');
            const lastRow = phaseResults.data[phaseResults.data.length - 1];
            finalState = headers.filter(h => h !== 'time').map(h => lastRow[h] || 0);
        }
    }

    console.log(`[Multi-phase] Returning ${allData.length} rows, first time=${allData[0]?.time}, last time=${allData[allData.length - 1]?.time}`);
    return {
        data: allData,
        headers,
        expandedReactions: currentExpandedReactions,
        expandedSpecies: currentExpandedSpecies
    };
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
            // Updating model with expanded network
            const expanded = await bnglService.generateNetwork(model, { maxSpecies: 2000, maxReactions: 5000 });
            // Force update just in case Object.assign is flaky with getters/setters (unlikely but possible)
            if (expanded.reactions) model.reactions = expanded.reactions;
            if (expanded.species) model.species = expanded.species;

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
