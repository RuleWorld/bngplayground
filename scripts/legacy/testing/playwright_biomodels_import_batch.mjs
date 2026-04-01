import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_MODELS = [
  'BIOMD0000000001',
  'BIOMD0000000002',
  'BIOMD0000000003',
  'BIOMD0000000004',
  'BIOMD0000000005',
  'BIOMD0000000006',
  'BIOMD0000000007',
  'BIOMD0000000008',
  'BIOMD0000000009',
  'BIOMD0000000010',
  'BIOMD0000000049',
  'BIOMD0000000059',
  'BIOMD0000000063',
  'BIOMD0000000066',
  'BIOMD0000000145',
  'BIOMD0000000295',
  'BIOMD0000000964',
  'BIOMD0000000968',
  'BIOMD0000000969',
  'BIOMD0000000970',
];

const PORT = Number(process.env.BIOMODELS_PLAYWRIGHT_PORT || '3000');
const BASE_PATH = '/bngplayground/';
const BASE_URL = process.env.APP_URL || `http://127.0.0.1:${PORT}${BASE_PATH}`;
const VERBOSE = (process.env.BIOMODELS_PLAYWRIGHT_VERBOSE || '0') === '1';
const PER_MODEL_TIMEOUT_MS = Number(process.env.BIOMODELS_MODEL_TIMEOUT_MS || '90000');
const MODAL_OPEN_TIMEOUT_MS = Number(process.env.BIOMODELS_MODAL_OPEN_TIMEOUT_MS || '10000');
const FETCH_PHASE_TIMEOUT_MS = Number(process.env.BIOMODELS_FETCH_PHASE_TIMEOUT_MS || '15000');
const ATOMIZE_PHASE_TIMEOUT_MS = Number(process.env.BIOMODELS_ATOMIZE_PHASE_TIMEOUT_MS || '30000');
const CODE_SETTLE_TIMEOUT_MS = Number(process.env.BIOMODELS_CODE_SETTLE_TIMEOUT_MS || '5000');
const MODEL_HEARTBEAT_MS = Number(process.env.BIOMODELS_MODEL_HEARTBEAT_MS || (VERBOSE ? '2000' : '0'));
const STARTUP_TIMEOUT_MS = Number(process.env.BIOMODELS_STARTUP_TIMEOUT_MS || '60000');
const BATCH_MAX_MS = Number(process.env.BIOMODELS_BATCH_MAX_MS || '900000'); // 15 min
const OUTPUT_DIR = path.resolve('artifacts');
const DEBUG_DIR = path.join(OUTPUT_DIR, 'biomodels-playwright-debug');
const MODEL_IDS = (process.env.BIOMODELS_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const TARGET_MODELS = MODEL_IDS.length > 0 ? MODEL_IDS : DEFAULT_MODELS;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowIso = () => new Date().toISOString();

function logPhase(modelId, phase, message) {
  if (!VERBOSE) return;
  console.log(`[biomodels-batch][${modelId}][${phase}][${nowIso()}] ${message}`);
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    });
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stripAnsi(s) {
  return String(s).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

async function isUrlReachable(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    return res.ok || (res.status >= 200 && res.status < 500);
  } catch {
    return false;
  }
}

function startDevServer(port) {
  return new Promise((resolve, reject) => {
    const command = `npm run dev -- --port ${port} --strictPort`;
    const proc = spawn('cmd.exe', ['/d', '/s', '/c', command], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
    });

    let buffer = '';
    const startedRegex = /Local:\s*(https?:\/\/[^\s]+)/i;

    const onData = (chunk) => {
      const raw = String(chunk);
      process.stdout.write(raw);
      buffer += stripAnsi(raw);
      const match = buffer.match(startedRegex);
      if (match) {
        resolve(proc);
      }
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);

    setTimeout(() => {
      reject(new Error(`Timed out waiting for Vite dev server on port ${port}`));
    }, STARTUP_TIMEOUT_MS);
  });
}

async function stopDevServer(proc) {
  if (!proc || proc.killed) return;
  await new Promise((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    killer.on('error', () => resolve());
    killer.on('exit', () => resolve());
  });
}

async function getEditorCode(page) {
  return await page.evaluate(() => {
    const monacoObj = globalThis.monaco;
    const model = monacoObj?.editor?.getModels?.()?.[0];
    if (!model || typeof model.getValue !== 'function') return '';
    return model.getValue();
  });
}

async function openBioModelsModal(page) {
  const editorPanel = page.getByTestId('editor-panel');
  const loadButton = editorPanel.getByRole('button', { name: 'Load' }).first();
  await loadButton.click({ timeout: MODAL_OPEN_TIMEOUT_MS });
  await page.getByText('Import from BioModels...').first().click({ timeout: MODAL_OPEN_TIMEOUT_MS });
  const dialog = page.getByRole('dialog').filter({ hasText: 'Import from BioModels' }).first();
  await dialog.waitFor({ state: 'visible', timeout: MODAL_OPEN_TIMEOUT_MS });
  return dialog;
}

async function waitForModalOutcome(page, dialog, timeoutMs) {
  const modalError = dialog.locator('.text-red-600').first();
  const closePromise = dialog.waitFor({ state: 'hidden', timeout: timeoutMs }).then(() => ({ kind: 'closed' }));
  const modalErrorPromise = modalError.waitFor({ state: 'visible', timeout: timeoutMs }).then(async () => ({
    kind: 'modal_error',
    message: (await modalError.textContent())?.trim() || 'Unknown BioModels modal error',
  }));

  return await Promise.race([closePromise, modalErrorPromise]);
}

async function waitForAtomizeOutcome(page, timeoutMs) {
  const successLocator = page.getByText('SBML imported successfully!').first();
  const errorLocator = page
    .locator('p.text-sm.font-medium')
    .filter({ hasText: /Import failed:|Failed to read SBML file\./ })
    .first();

  const successPromise = successLocator.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => ({
    kind: 'success',
  }));
  const errorPromise = errorLocator.waitFor({ state: 'visible', timeout: timeoutMs }).then(async () => ({
    kind: 'status_error',
    message: (await errorLocator.textContent())?.trim() || 'Unknown atomization error',
  }));

  return await Promise.race([successPromise, errorPromise]);
}

async function runOneImport(page, modelId) {
  const startTs = Date.now();
  const result = {
    modelId,
    ok: false,
    durationMs: 0,
    timedOut: false,
    phase: 'init',
    error: null,
    codeLength: 0,
    events: [],
    screenshotPath: null,
  };
  const pushEvent = (phase, message) => {
    const line = `${nowIso()} ${phase}: ${message}`;
    result.events.push(line);
    logPhase(modelId, phase, message);
  };

  const heartbeatStart = Date.now();
  const heartbeat =
    MODEL_HEARTBEAT_MS > 0
      ? setInterval(() => {
          pushEvent(result.phase, `heartbeat elapsedMs=${Date.now() - heartbeatStart}`);
        }, MODEL_HEARTBEAT_MS)
      : null;

  try {
    pushEvent('init', 'starting model import');
    const codeBefore = await getEditorCode(page);
    pushEvent('open_modal', 'opening BioModels modal');
    const dialog = await withTimeout(openBioModelsModal(page), MODAL_OPEN_TIMEOUT_MS, `${modelId} open modal`);
    result.phase = 'fetch';

    const input = dialog.getByPlaceholder('BioModels ID');
    pushEvent('fetch', `submitting model id ${modelId}`);
    await input.fill(modelId, { timeout: MODAL_OPEN_TIMEOUT_MS });
    await dialog.getByRole('button', { name: 'Fetch & Import' }).click({ timeout: MODAL_OPEN_TIMEOUT_MS });

    const modalOutcome = await withTimeout(
      waitForModalOutcome(page, dialog, FETCH_PHASE_TIMEOUT_MS),
      FETCH_PHASE_TIMEOUT_MS + 1000,
      `${modelId} modal fetch outcome`
    );
    if (modalOutcome.kind === 'modal_error') {
      result.phase = 'fetch';
      result.error = modalOutcome.message;
      pushEvent('fetch', `modal error: ${modalOutcome.message}`);
      try {
        await dialog.getByRole('button', { name: 'Cancel' }).click({ timeout: 1000 });
      } catch {
        // ignore
      }
      return result;
    }

    result.phase = 'atomize';
    pushEvent('atomize', 'modal closed, waiting for atomization status');
    const atomizeOutcome = await withTimeout(
      waitForAtomizeOutcome(page, ATOMIZE_PHASE_TIMEOUT_MS),
      ATOMIZE_PHASE_TIMEOUT_MS + 1000,
      `${modelId} atomize outcome`
    );
    if (atomizeOutcome.kind === 'status_error') {
      result.error = atomizeOutcome.message;
      pushEvent('atomize', `status error: ${atomizeOutcome.message}`);
      return result;
    }

    result.phase = 'validate';
    pushEvent('validate', 'success status observed; validating editor content');
    await withTimeout(delay(250), CODE_SETTLE_TIMEOUT_MS, `${modelId} code settle`);
    const codeAfter = await getEditorCode(page);
    result.codeLength = codeAfter.length;

    if (!/begin\s+model/i.test(codeAfter)) {
      result.error = 'BNGL editor content missing "begin model" after reported success.';
      pushEvent('validate', result.error);
      return result;
    }

    // Guard against stale no-op success.
    if (codeAfter === codeBefore) {
      result.error = 'Editor code did not change after import.';
      pushEvent('validate', result.error);
      return result;
    }

    result.ok = true;
    result.phase = 'done';
    pushEvent('done', `import succeeded with codeLength=${result.codeLength}`);
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.timedOut = /timed out/i.test(result.error);
    pushEvent(result.phase, `exception: ${result.error}`);
    return result;
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
    result.durationMs = Date.now() - startTs;
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const reportPath = path.join(
    OUTPUT_DIR,
    `biomodels_playwright_batch_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );

  let devServer = null;
  const results = [];
  let watchdog = null;
  let timedOut = false;

  try {
    watchdog = setTimeout(() => {
      timedOut = true;
      console.error(`[biomodels-batch] Kill switch reached after ${BATCH_MAX_MS}ms. Exiting.`);
      process.exitCode = 124;
      // Force exit to avoid hanging terminal sessions.
      process.exit(124);
    }, BATCH_MAX_MS);

    const reachable = await isUrlReachable(BASE_URL);
    if (!reachable) {
      console.log(`[biomodels-batch] Starting dev server (target ${BASE_URL})`);
      devServer = await startDevServer(PORT);
      const ok = await isUrlReachable(BASE_URL);
      if (!ok) {
        throw new Error(`Dev server started but URL still unreachable: ${BASE_URL}`);
      }
    } else {
      console.log(`[biomodels-batch] Reusing existing server at ${BASE_URL}`);
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[console.error] ${msg.text()}`);
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !!globalThis.monaco, null, { timeout: 60000 });
    await page.getByTestId('editor-panel').waitFor({ state: 'visible', timeout: 10000 });

    for (const modelId of TARGET_MODELS) {
      console.log(`[biomodels-batch] Importing ${modelId} ...`);
      let res;
      try {
        res = await withTimeout(
          runOneImport(page, modelId),
          PER_MODEL_TIMEOUT_MS,
          `${modelId} overall import`
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res = {
          modelId,
          ok: false,
          durationMs: PER_MODEL_TIMEOUT_MS,
          timedOut: /timed out/i.test(msg),
          phase: 'overall_timeout',
          error: msg,
          codeLength: 0,
          events: [`${nowIso()} overall_timeout: ${msg}`],
          screenshotPath: null,
        };
      }

      if (!res.ok) {
        const shotPath = path.join(DEBUG_DIR, `${modelId}_${Date.now()}.png`);
        try {
          await page.screenshot({ path: shotPath, fullPage: true });
          res.screenshotPath = shotPath;
          console.log(`[biomodels-batch] Debug screenshot saved: ${shotPath}`);
        } catch (e) {
          console.warn(`[biomodels-batch] Failed to capture screenshot for ${modelId}:`, e);
        }
        try {
          await page.goto(BASE_URL, { waitUntil: 'load', timeout: 30000 });
          await page.waitForFunction(() => !!globalThis.monaco, null, { timeout: 30000 });
          await page.getByTestId('editor-panel').waitFor({ state: 'visible', timeout: 10000 });
          console.log(`[biomodels-batch] Page reset complete after failure for ${modelId}`);
        } catch (resetErr) {
          console.warn(`[biomodels-batch] Page reset failed after ${modelId}:`, resetErr);
        }
      }

      results.push(res);
      if (res.ok) {
        console.log(`[biomodels-batch] PASS ${modelId} (${res.durationMs} ms)`);
      } else {
        console.log(`[biomodels-batch] FAIL ${modelId} (${res.durationMs} ms): ${res.error}`);
      }
    }

    await browser.close();

    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    const report = {
      baseUrl: BASE_URL,
      perModelTimeoutMs: PER_MODEL_TIMEOUT_MS,
      startedAt: new Date(Date.now() - results.reduce((sum, r) => sum + (r.durationMs || 0), 0)).toISOString(),
      finishedAt: new Date().toISOString(),
      totals: {
        total: results.length,
        passed,
        failed,
      },
      results,
      consoleErrors,
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(`[biomodels-batch] Report written to ${reportPath}`);
    console.log(`[biomodels-batch] Summary: ${passed}/${results.length} passed`);
    if (failed > 0 && !timedOut) process.exitCode = 1;
  } catch (error) {
    console.error('[biomodels-batch] Fatal error:', error);
    process.exitCode = 1;
  } finally {
    if (watchdog) clearTimeout(watchdog);
    await stopDevServer(devServer);
  }
}

main();
