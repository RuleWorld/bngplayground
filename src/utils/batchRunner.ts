import { bnglService } from '../../services/bnglService';
import {
    normalizeFilterNames,
    safeModelName,
    runSingleBatchItem,
    BatchSimulator,
    BatchReporter,
} from '@bngplayground/engine';
import { downloadCsv } from './download';
import { loadModelCode } from '../../services/modelLoader';
import { loadModelCatalog, getModelCatalogSync } from '../../services/modelCatalog';

const NFSIM_MODELS = new Set<string>();

// If you need extra verbosity for batch runner, flip this to true locally
const VERBOSE_BATCH_RUNNER = false;

/**
 * App-side implementation of the BatchSimulator interface.
 */
const appSimulator: BatchSimulator = {
    parse: (code, options) => bnglService.parse(code, options),
    generateNetwork: (model, options, options2) => bnglService.generateNetwork(model, options, options2),
    simulate: (model, options, options2) => bnglService.simulate(model, options, options2),
    loadModelCode: (id) => loadModelCode(id),
    restart: () => bnglService.restart()
};

/**
 * App-side implementation of the BatchReporter interface.
 */
const appReporter: BatchReporter = {
    log: (msg) => console.log(msg),
    warn: (msg) => console.warn(msg),
    error: (msg, err) => console.error(msg, err),
    group: (name) => console.group(name),
    groupEnd: () => console.groupEnd(),
    time: (label) => console.time(label),
    timeEnd: (label) => console.timeEnd(label),
    onExport: async (results, modelDef, _model) => {
        // Standard CSV export
        const headers = results.headers || [];
        const safeName = safeModelName(modelDef.id || modelDef.name);

        if (results.dataBySuffix && Object.keys(results.dataBySuffix).length > 0) {
            for (const [suffix, suffixData] of Object.entries(results.dataBySuffix)) {
                if (suffixData.length === 0) continue;
                const sfx = suffix === '__default__' ? '' : `_${suffix}`;
                downloadCsv(suffixData, headers, `results_${safeName}${sfx}.csv`);
            }
        } else {
            downloadCsv(results.data, headers, `results_${safeName}.csv`);
        }
    }
};

export async function runModels(modelNames?: string[]) {
    const filter = normalizeFilterNames(modelNames);
    const catalog = await loadModelCatalog();
    const allModels = catalog.examples;
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

    const options = {
        simulator: appSimulator,
        reporter: appReporter,
        verbose: VERBOSE_BATCH_RUNNER,
        nfSimModels: NFSIM_MODELS
    };

    for (const modelDef of modelsToProcess) {
        const success = await runSingleBatchItem(options, modelDef, batchSeed);
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
    const catalog = getModelCatalogSync();
    const all = catalog?.examples ?? [];
    return all.map(m => ({ id: m.id || m.name, name: m.name }));
}

export async function getModelEntriesAsync() {
    const catalog = await loadModelCatalog();
    const all = catalog.examples ?? [];
    return all.map(m => ({ id: m.id || m.name, name: m.name }));
}

export function getModelNames() {
    return getModelEntries().map(m => m.name);
}

export async function runAllModels() {
    return runModels();
}

export async function runNfSimModels() {
    const nfModels = Array.from(NFSIM_MODELS);
    return runModels(nfModels);
}

// Expose on window for Playwright
if (typeof window !== 'undefined') {
    (window as any).runModels = runModels;
    (window as any).runCustomModel = async (name: string, code: string) => {
        const globalAny = (window as any);
        const batchSeed = typeof globalAny.__batchSeed === 'number' ? globalAny.__batchSeed : undefined;

        const options = {
            simulator: appSimulator,
            reporter: appReporter,
            verbose: VERBOSE_BATCH_RUNNER,
            nfSimModels: NFSIM_MODELS
        };

        return runSingleBatchItem(options, { name, code, id: name }, batchSeed);
    };
    (window as any).runAllModels = runAllModels;
    (window as any).runNfSimModels = runNfSimModels;
    (window as any).getModelEntries = getModelEntries;
    (window as any).getModelEntriesAsync = getModelEntriesAsync;
    (window as any).getModelNames = getModelNames;
}
