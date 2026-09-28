#!/usr/bin/env node
import { createServer } from 'vite';
import { chromium } from 'playwright';

const vite = await createServer({
  configFile: './vite.config.ts',
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
await vite.listen();
const address = vite.httpServer.address();
if (!address || typeof address === 'string') throw new Error('Vite did not bind a TCP port');
const url = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

const stateToggleModel = (siteCount) => {
  const sites = Array.from({ length: siteCount }, (_, i) => `x${i + 1}~u~p`).join(',');
  const initial = Array.from({ length: siteCount }, (_, i) => `x${i + 1}~u`).join(',');
  const rules = Array.from({ length: siteCount }, (_, i) =>
    `toggle_${i + 1}: A(x${i + 1}~u) -> A(x${i + 1}~p) k`,
  ).join('\n');
  return `begin model\nbegin parameters\nk 1\nA0 100\nend parameters\nbegin molecule types\nA(${sites})\nend molecule types\nbegin species\nA(${initial}) A0\nend species\nbegin observables\nMolecules A A()\nend observables\nbegin reaction rules\n${rules}\nend reaction rules\nend model`;
};

const models = [
  { name: 'tiny-conversion', code: `begin model\nbegin parameters\nk 1\nA0 100\nend parameters\nbegin molecule types\nA()\nB()\nend molecule types\nbegin species\nA() A0\nend species\nbegin observables\nMolecules A A()\nMolecules B B()\nend observables\nbegin reaction rules\nconvert: A() -> B() k\nend reaction rules\nend model`, method: 'ode' },
  { name: 'medium-32-state-network', code: stateToggleModel(5), method: 'ode' },
  { name: 'large-256-state-network', code: stateToggleModel(8), method: 'ode' },
  { name: 'nfsim-network-free-binding', code: `begin model\nbegin parameters\nk 0.001\nA0 100\nend parameters\nbegin molecule types\nA(x)\nend molecule types\nbegin species\nA(x) A0\nend species\nbegin observables\nMolecules A A()\nend observables\nbegin reaction rules\nbind: A(x) + A(x) -> A(x!1).A(x!1) k\nend reaction rules\nend model`, method: 'nf' },
];

try {
  const page = await browser.newPage();
  page.on('console', (message) => process.stderr.write(`[browser:${message.type()}] ${message.text()}\n`));
  page.on('pageerror', (error) => process.stderr.write(`[browser:error] ${error.stack ?? error.message}\n`));
  page.on('requestfailed', (request) => process.stderr.write(`[browser:request-failed] ${request.url()} ${request.failure()?.errorText ?? ''}\n`));
  await page.addInitScript(() => {
    const metrics = { workersCreated: 0, sentBytes: 0, receivedBytes: 0, generatedNetworkProgress: 0, compactResults: 0, responseTypes: {} };
    const bytes = (value, seen = new Set()) => {
      if (value == null) return 0;
      if (value instanceof ArrayBuffer) return value.byteLength;
      if (ArrayBuffer.isView(value)) return value.byteLength;
      if (typeof value === 'string') return new TextEncoder().encode(value).byteLength;
      if (typeof value !== 'object' || seen.has(value)) return 0;
      seen.add(value);
      let size = 0;
      for (const [key, item] of Object.entries(value)) size += key.length * 2 + bytes(item, seen);
      return size;
    };
    const originalWorker = window.Worker;
    window.Worker = new Proxy(originalWorker, {
      construct(Target, args) {
        metrics.workersCreated += 1;
        const worker = new Target(...args);
        const post = worker.postMessage.bind(worker);
        worker.postMessage = (message, transfer) => { metrics.sentBytes += bytes(message); return post(message, transfer); };
        const add = worker.addEventListener.bind(worker);
        worker.addEventListener = (type, listener, options) => type === 'message'
          ? add(type, (event) => {
            metrics.receivedBytes += bytes(event.data);
            metrics.responseTypes[event.data?.type] = (metrics.responseTypes[event.data?.type] ?? 0) + 1;
            if (event.data?.type === 'generate_network_progress') metrics.generatedNetworkProgress += 1;
            if (event.data?.payload?.transport === 'float64-matrix') metrics.compactResults += 1;
            listener.call(worker, event);
          }, options)
          : add(type, listener, options);
        return worker;
      },
    });
    window.__preparedBenchmarkMetrics = metrics;
  });
  await page.route(`${url}/bngplayground/`, (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body></body></html>',
  }));
  await page.goto(`${url}/bngplayground/`, { waitUntil: 'domcontentloaded' });
  const report = await page.evaluate(async (inputModels) => {
    const { bnglService } = await import('/bngplayground/services/bnglService.ts');
    const { BnglWorkerPool, estimateSimulationWorkerCount } = await import('/bngplayground/services/BnglWorkerPool.ts');
    const lean = { method: 'ode', solver: 'auto', t_end: 1, n_steps: 8, includeSpeciesData: false, includeExpandedNetwork: false };
    const measure = async (work) => {
      const start = performance.now();
      const result = await work();
      return { ms: performance.now() - start, result };
    };
    const cases = [];
    for (const item of inputModels) {
      const metricsBefore = { ...window.__preparedBenchmarkMetrics };
      const parsed = await measure(() => bnglService.parse(item.code));
      const model = parsed.result;
      model.networkOptions = { maxSpecies: 2000, maxReactions: 10000 };
      const prepared = await measure(() => bnglService.prepareModel(model));
      const options = { ...lean, method: item.method };
      const first = await measure(() => bnglService.simulateCached(prepared.result, undefined, options));
      const networkProgressAfterFirst = window.__preparedBenchmarkMetrics.generatedNetworkProgress;
      let kinetic = null;
      let seed = null;
      let network = null;
      let rich = null;
      if (item.method === 'ode') {
        kinetic = await measure(() => bnglService.simulateCached(prepared.result, { k: 1.5 }, options));
        const networkProgressAfterKinetic = window.__preparedBenchmarkMetrics.generatedNetworkProgress;
        const parseResponsesAfterKinetic = window.__preparedBenchmarkMetrics.responseTypes.parse_success ?? 0;
        seed = await measure(() => bnglService.simulateCached(prepared.result, { A0: 120 }, options));
        const networkProgressAfterSeed = window.__preparedBenchmarkMetrics.generatedNetworkProgress;
        const parseResponsesAfterSeed = window.__preparedBenchmarkMetrics.responseTypes.parse_success ?? 0;
        network = await measure(() => bnglService.getPreparedNetwork(undefined, undefined, model));
        rich = await measure(() => bnglService.simulateCached(prepared.result, undefined, {
          ...options, includeSpeciesData: true, includeExpandedNetwork: false,
        }));
        kinetic.networkGenerationProgressDelta = networkProgressAfterKinetic - networkProgressAfterFirst;
        kinetic.parseResponseDelta = parseResponsesAfterKinetic - (metricsBefore.responseTypes.parse_success ?? 0);
        seed.networkGenerationProgressDelta = networkProgressAfterSeed - networkProgressAfterKinetic;
        seed.parseResponseDelta = parseResponsesAfterSeed - parseResponsesAfterKinetic;
        network.jsonBytes = new TextEncoder().encode(JSON.stringify(network.result)).byteLength;
        rich.hasSpeciesData = Array.isArray(rich.result.speciesData) || Array.isArray(rich.result.species_data);
      }
      cases.push({
        name: item.name,
        method: item.method,
        parsedModelBytes: new TextEncoder().encode(JSON.stringify(model)).byteLength,
        parseMs: parsed.ms,
        prepareMs: prepared.ms,
        firstRunMs: first.ms,
        firstResultKeys: Object.keys(first.result),
        firstRunLean: !('expandedReactions' in first.result) && !('speciesData' in first.result),
        networkGenerationProgressDelta: window.__preparedBenchmarkMetrics.generatedNetworkProgress - metricsBefore.generatedNetworkProgress,
        workerPoolCostBound: estimateSimulationWorkerCount(model, 8),
        kineticRerun: kinetic && {
          ms: kinetic.ms,
          parseResponseDelta: kinetic.parseResponseDelta,
          networkGenerationProgressDelta: kinetic.networkGenerationProgressDelta,
        },
        seedRerun: seed && {
          ms: seed.ms,
          networkGenerationProgressDelta: seed.networkGenerationProgressDelta,
          parseResponseDelta: seed.parseResponseDelta,
        },
        preparedNetworkRetrievalMs: network?.ms,
        preparedNetworkBytes: network?.jsonBytes,
        richRerun: rich && { ms: rich.ms, hasSpeciesData: rich.hasSpeciesData },
      });
      await bnglService.releaseModel(prepared.result).catch(() => {});
    }

    const model = await bnglService.parse(inputModels[0].code);
    const sweepOverrides = Array.from({ length: 8 }, (_, index) => ({ k: 0.7 + index * 0.1 }));
    const parameterSweeps = [];
    for (const workerLimit of [1, 2, 4, 8]) {
      const pool = new BnglWorkerPool(workerLimit);
      const metricsBefore = window.__preparedBenchmarkMetrics;
      const workersBeforeSweep = metricsBefore.workersCreated;
      const progressBeforeSweep = metricsBefore.generatedNetworkProgress;
      const heapBeforeSweep = performance.memory?.usedJSHeapSize ?? null;
      const sweep = await measure(() => pool.runParameterSweep(model, sweepOverrides, lean));
      const heapAfterSweep = performance.memory?.usedJSHeapSize ?? null;
      parameterSweeps.push({
        workerLimit,
        ms: sweep.ms,
        runs: sweep.result.length,
        workersCreated: window.__preparedBenchmarkMetrics.workersCreated - workersBeforeSweep,
        networkGenerationProgressDelta: window.__preparedBenchmarkMetrics.generatedNetworkProgress - progressBeforeSweep,
        mainThreadHeapBeforeBytes: heapBeforeSweep,
        mainThreadHeapAfterBytes: heapAfterSweep,
      });
      pool.terminate();
    }
    bnglService.terminate();
    return {
      cases,
      parameterSweeps,
      transport: {
        workerCount: window.__preparedBenchmarkMetrics.workersCreated,
        mainToWorkerApproxBytes: window.__preparedBenchmarkMetrics.sentBytes,
        workerToMainApproxBytes: window.__preparedBenchmarkMetrics.receivedBytes,
        compactMatrixResults: window.__preparedBenchmarkMetrics.compactResults,
        responseTypes: window.__preparedBenchmarkMetrics.responseTypes,
      },
      memory: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize } : null,
    };
  }, models);
  process.stdout.write(`${JSON.stringify({ browser: 'Chromium', date: new Date().toISOString(), report }, null, 2)}\n`);
} finally {
  await browser.close();
  await vite.close();
}
