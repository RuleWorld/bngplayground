import { test } from '@playwright/test';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// Configuration
const BASE_URL = process.env.URL || 'http://localhost:3000/bngplayground/?batch=true';
const MANIFEST_PATH = path.join(process.cwd(), 'artifacts/rulehub-export/manifest.json');
const OUTPUT_PATH = path.join(process.cwd(), 'artifacts/nfsim_compatibility_published.json');
const TIMEOUT_PER_MODEL_MS = 60_000; // 60 seconds per model
const PARALLEL_BROWSERS = 6; // Number of parallel browser instances

// Result categories
type ResultCategory =
  | 'SUCCESS'
  | 'ERROR_XML_GENERATION'
  | 'ERROR_NFSIM_RUNTIME'
  | 'ERROR_VALIDATION'
  | 'TIMEOUT'
  | 'ERROR_PAGE_CRASH'
  | 'SKIPPED';

interface ModelResult {
  id: string;
  name: string;
  status: ResultCategory;
  errorMessage?: string;
  duration?: number;
}

interface ModelEntry {
  id: string;
  name: string;
  path: string;
  category: string;
  bng2_compatible?: boolean;
  compatibility?: { bng2?: boolean; nfsim?: boolean; excluded?: boolean; methods?: string[] };
  origin: string;
  tags: string[];
}

// Load manifest
function loadManifest(): ModelEntry[] {
  const content = fs.readFileSync(MANIFEST_PATH, 'utf-8');
  return JSON.parse(content);
}

// Filter Published models that are bng2_compatible
function getPublishedModels(manifest: ModelEntry[]): ModelEntry[] {
  return manifest.filter(m =>
    m.origin === 'published' &&
    (m.bng2_compatible === true || m.compatibility?.bng2 === true)
  );
}

// Check if model should be skipped (SSA-only, etc.)
function shouldSkipModel(model: ModelEntry): boolean {
  const skipTags = ['ssa-only', 'nfsim-incompatible'];
  return skipTags.some(tag => model.tags?.includes(tag));
}

// Wait for page to be ready with batch mode functions
async function waitForBatchReady(page: Page, timeoutMs = 60000): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs });
  await page.waitForFunction(
    () => typeof (window as any).getModelEntriesAsync === 'function' ||
         typeof (window as any).getModelEntries === 'function',
    null,
    { timeout: timeoutMs }
  );
}

// Test a single model
async function testModel(
  page: Page,
  modelId: string,
  modelName: string
): Promise<ModelResult> {
  const startTime = Date.now();

  try {
    console.log(`  [${modelId}] Loading model...`);

    // Track console errors
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    // Load the model via batch API
    const loadResult = await page.evaluate(async (id) => {
      try {
        // Check if batch functions are available
        if (typeof (window as any).loadModelById === 'function') {
          await (window as any).loadModelById(id);
          return { success: true };
        } else if (typeof (window as any).setModelId === 'function') {
          await (window as any).setModelId(id);
          return { success: true };
        } else {
          return { success: false, error: 'No batch loading function available' };
        }
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }, modelId);

    if (!loadResult.success) {
      return {
        id: modelId,
        name: modelName,
        status: 'ERROR_VALIDATION',
        errorMessage: `Failed to load model: ${loadResult.error}`,
        duration: Date.now() - startTime
      };
    }

    // Wait a bit for model to parse
    await page.waitForTimeout(500);

    console.log(`  [${modelId}] Setting method to NFsim...`);

    // Set simulation method to NFsim via UI or programmatically
    const methodSetResult = await page.evaluate(() => {
      try {
        // Try to find and click NFsim button in the UI
        const buttons = Array.from(document.querySelectorAll('button'));
        const nfsimButton = buttons.find(b =>
          b.textContent?.includes('NFsim') ||
          b.textContent?.includes('nf') ||
          (b as any).dataset?.method === 'nf'
        );

        if (nfsimButton) {
          nfsimButton.click();
          return { success: true, method: 'clicked_button' };
        }

        // Alternative: try to set method via React state if exposed
        if (typeof (window as any).setSimulationMethod === 'function') {
          (window as any).setSimulationMethod('nf');
          return { success: true, method: 'api_call' };
        }

        return { success: false, error: 'Could not find NFsim button or API' };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    // If we can't set method via UI, try opening options dialog
    if (!methodSetResult.success) {
      console.log(`  [${modelId}] Trying via options dialog...`);

      try {
        // Look for settings/options button
        const settingsButton = await page.locator('button[title*="Configure"], button[title*="options"], button:has-text("Settings")').first();
        if (await settingsButton.isVisible({ timeout: 2000 })) {
          await settingsButton.click();
          await page.waitForTimeout(300);

          // Click NFsim button in the grid
          const nfsimGridButton = await page.locator('button:has-text("NFsim"), button:has-text("nf")').first();
          if (await nfsimGridButton.isVisible({ timeout: 2000 })) {
            await nfsimGridButton.click();
            await page.waitForTimeout(300);
          }
        }
      } catch (e) {
        console.log(`  [${modelId}] Warning: Could not set NFsim via UI: ${e}`);
      }
    }

    console.log(`  [${modelId}] Running simulation...`);

    // Run the simulation
    const runPromise = page.evaluate(async () => {
      try {
        // Try batch run API
        if (typeof (window as any).runCurrentModel === 'function') {
          const result = await (window as any).runCurrentModel({ method: 'nf' });
          return { success: true, result };
        } else {
          // Try clicking Run button
          const buttons = Array.from(document.querySelectorAll('button'));
          const runButton = buttons.find(b =>
            b.textContent?.includes('Run') &&
            !b.hasAttribute('disabled')
          );

          if (runButton) {
            runButton.click();
            return { success: true, method: 'clicked_run' };
          }

          return { success: false, error: 'No run function or button found' };
        }
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    // Wait for simulation to complete or timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_PER_MODEL_MS)
    );

    const runResult = await Promise.race([runPromise, timeoutPromise]);

    if (!runResult.success) {
      // Check if it's an XML generation error
      const xmlError = consoleErrors.find(e =>
        e.includes('XML') ||
        e.includes('BNGXML') ||
        e.includes('generate_network')
      );

      if (xmlError) {
        return {
          id: modelId,
          name: modelName,
          status: 'ERROR_XML_GENERATION',
          errorMessage: xmlError,
          duration: Date.now() - startTime
        };
      }

      return {
        id: modelId,
        name: modelName,
        status: 'ERROR_VALIDATION',
        errorMessage: `Failed to run: ${runResult.error}`,
        duration: Date.now() - startTime
      };
    }

    // Wait for results to appear or error
    await page.waitForTimeout(2000);

    // Check for NFsim runtime errors in console
    const nfsimError = consoleErrors.find(e =>
      e.toLowerCase().includes('nfsim') ||
      e.includes('network-free') ||
      e.includes('WASM') ||
      e.includes('runtime error')
    );

    if (nfsimError) {
      return {
        id: modelId,
        name: modelName,
        status: 'ERROR_NFSIM_RUNTIME',
        errorMessage: nfsimError,
        duration: Date.now() - startTime
      };
    }

    // Check for page errors
    if (pageErrors.length > 0) {
      return {
        id: modelId,
        name: modelName,
        status: 'ERROR_PAGE_CRASH',
        errorMessage: pageErrors.join('; '),
        duration: Date.now() - startTime
      };
    }

    // Check if results exist
    const hasResults = await page.evaluate(() => {
      // Check for chart or results data
      const charts = document.querySelectorAll('canvas, svg');
      if (charts.length > 0) return true;

      // Check for results table/data
      const resultText = document.body.textContent || '';
      return resultText.includes('Time') || resultText.includes('Observable');
    });

    if (hasResults) {
      console.log(`  [${modelId}] SUCCESS`);
      return {
        id: modelId,
        name: modelName,
        status: 'SUCCESS',
        duration: Date.now() - startTime
      };
    }

    // No clear success or error - validation error
    return {
      id: modelId,
      name: modelName,
      status: 'ERROR_VALIDATION',
      errorMessage: 'No results appeared and no clear error',
      duration: Date.now() - startTime
    };

  } catch (err) {
    const duration = Date.now() - startTime;
    const errMessage = err instanceof Error ? err.message : String(err);

    if (errMessage === 'TIMEOUT') {
      console.log(`  [${modelId}] TIMEOUT (${duration}ms)`);
      return {
        id: modelId,
        name: modelName,
        status: 'TIMEOUT',
        errorMessage: `Exceeded ${TIMEOUT_PER_MODEL_MS}ms timeout`,
        duration
      };
    }

    console.log(`  [${modelId}] ERROR: ${errMessage}`);
    return {
      id: modelId,
      name: modelName,
      status: 'ERROR_VALIDATION',
      errorMessage: errMessage,
      duration
    };
  }
}

// Worker function for parallel processing
async function worker(
  browser: Browser,
  models: ModelEntry[],
  workerId: number,
  allResults: ModelResult[]
): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`Worker ${workerId}: Navigating to ${BASE_URL}`);
    await page.goto(BASE_URL, { timeout: 60000 });
    await waitForBatchReady(page);
    console.log(`Worker ${workerId}: Ready`);

    for (const model of models) {
      console.log(`Worker ${workerId}: Testing ${model.id}`);
      const result = await testModel(page, model.id, model.name);
      allResults.push(result);

      // Reload page after each model to reset state
      await page.goto(BASE_URL, { timeout: 60000 });
      await waitForBatchReady(page);
    }
  } catch (err) {
    console.error(`Worker ${workerId} fatal error:`, err);
  } finally {
    await context.close();
  }
}

// Main test
test('NFsim compatibility check for all Published models', async ({}) => {
  test.setTimeout(10 * 60 * 60 * 1000); // 10 hours max

  console.log('Loading manifest...');
  const manifest = loadManifest();
  const publishedModels = getPublishedModels(manifest);

  console.log(`Found ${publishedModels.length} published bng2-compatible models`);

  // Filter out obviously incompatible models
  const modelsToTest = publishedModels.filter(m => !shouldSkipModel(m));
  console.log(`Testing ${modelsToTest.length} models (${publishedModels.length - modelsToTest.length} skipped)`);

  // Start dev server check
  console.log('Checking if dev server is running...');
  try {
    const response = await fetch(BASE_URL);
    if (!response.ok) {
      throw new Error('Dev server not responding');
    }
    console.log('Dev server is ready');
  } catch (err) {
    throw new Error(`Dev server not available at ${BASE_URL}. Start it with: npm run dev`);
  }

  // Launch browser
  const browser = await chromium.launch({
    headless: true,
    timeout: 60000
  });

  // Distribute models across workers
  const allResults: ModelResult[] = [];
  const modelsPerWorker = Math.ceil(modelsToTest.length / PARALLEL_BROWSERS);
  const workers: Promise<void>[] = [];

  for (let i = 0; i < PARALLEL_BROWSERS; i++) {
    const start = i * modelsPerWorker;
    const end = Math.min(start + modelsPerWorker, modelsToTest.length);
    const workerModels = modelsToTest.slice(start, end);

    if (workerModels.length > 0) {
      console.log(`Spawning worker ${i + 1} with ${workerModels.length} models`);
      workers.push(worker(browser, workerModels, i + 1, allResults));
    }
  }

  // Wait for all workers to complete
  console.log(`\nRunning ${workers.length} parallel workers...\n`);
  await Promise.all(workers);

  await browser.close();

  // Compute statistics
  const stats = {
    total: allResults.length,
    success: allResults.filter(r => r.status === 'SUCCESS').length,
    errorXmlGeneration: allResults.filter(r => r.status === 'ERROR_XML_GENERATION').length,
    errorNfsimRuntime: allResults.filter(r => r.status === 'ERROR_NFSIM_RUNTIME').length,
    errorValidation: allResults.filter(r => r.status === 'ERROR_VALIDATION').length,
    errorPageCrash: allResults.filter(r => r.status === 'ERROR_PAGE_CRASH').length,
    timeout: allResults.filter(r => r.status === 'TIMEOUT').length,
  };

  // Sort results by status
  allResults.sort((a, b) => {
    const order: Record<ResultCategory, number> = {
      SUCCESS: 0,
      TIMEOUT: 1,
      ERROR_XML_GENERATION: 2,
      ERROR_NFSIM_RUNTIME: 3,
      ERROR_VALIDATION: 4,
      ERROR_PAGE_CRASH: 5,
      SKIPPED: 6,
    };
    return order[a.status] - order[b.status];
  });

  // Write results to file
  const output = {
    timestamp: new Date().toISOString(),
    stats,
    results: allResults,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n${'='.repeat(60)}`);
  console.log('NFsim Compatibility Test Results');
  console.log('='.repeat(60));
  console.log(`Total models tested: ${stats.total}`);
  console.log(`Success: ${stats.success} (${(stats.success / stats.total * 100).toFixed(1)}%)`);
  console.log(`Timeout: ${stats.timeout}`);
  console.log(`XML Generation Error: ${stats.errorXmlGeneration}`);
  console.log(`NFsim Runtime Error: ${stats.errorNfsimRuntime}`);
  console.log(`Validation Error: ${stats.errorValidation}`);
  console.log(`Page Crash: ${stats.errorPageCrash}`);
  console.log(`\nResults written to: ${OUTPUT_PATH}`);
  console.log('='.repeat(60));

  // Print some examples of each category
  console.log('\n--- Sample Results by Category ---\n');

  const categories: ResultCategory[] = ['SUCCESS', 'ERROR_XML_GENERATION', 'ERROR_NFSIM_RUNTIME', 'TIMEOUT'];
  for (const cat of categories) {
    const samples = allResults.filter(r => r.status === cat).slice(0, 5);
    if (samples.length > 0) {
      console.log(`${cat}:`);
      samples.forEach(s => {
        console.log(`  - ${s.id}: ${s.name}${s.errorMessage ? ` (${s.errorMessage.substring(0, 60)}...)` : ''}`);
      });
      console.log('');
    }
  }
});