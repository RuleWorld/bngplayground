import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const PROJECT_ROOT = process.cwd();
const WEB_OUTPUT_DIR = path.join(PROJECT_ROOT, 'web_output');
const PORT = Number(process.env.WEB_OUTPUT_PORT || 5175);

function readViteBasePath() {
  // Allow explicit override.
  const envBase = process.env.WEB_OUTPUT_BASE;
  if (envBase && envBase.trim()) return envBase.trim();

  // Best-effort: read Vite config for `base:`.
  // This repo commonly uses `/bngplayground/`.
  try {
    const viteConfigTs = path.join(PROJECT_ROOT, 'vite.config.ts');
    if (!fs.existsSync(viteConfigTs)) return '/';
    const content = fs.readFileSync(viteConfigTs, 'utf8');
    const m = content.match(/\bbase\s*:\s*['"]([^'"]+)['"]/);
    if (!m) return '/';
    return m[1];
  } catch {
    return '/';
  }
}

function normalizeBasePath(p) {
  if (!p) return '/';
  let out = p.trim();
  if (!out.startsWith('/')) out = `/${out}`;
  if (!out.endsWith('/')) out = `${out}/`;
  return out;
}

const BASE_PATH = normalizeBasePath(readViteBasePath());
const BASE_URL = `http://localhost:${PORT}${BASE_PATH}`;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanOldOutputs(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath)) {
    if (/^results_.*\.csv$/i.test(entry)) {
      fs.rmSync(path.join(dirPath, entry));
    }
  }
}

async function waitForHttpOk(url, timeoutMs = 60_000) {
  const start = Date.now();
  // Node 18+ has global fetch
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForDownloadsToSettle(getCount, idleMs = 1500, timeoutMs = 120_000) {
  const start = Date.now();
  let lastCount = getCount();
  let lastChange = Date.now();

  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 250));
    const current = getCount();
    if (current !== lastCount) {
      lastCount = current;
      lastChange = Date.now();
      continue;
    }
    if (Date.now() - lastChange >= idleMs) return;
  }

  throw new Error(`Timed out waiting for downloads to settle (count=${getCount()}).`);
}

function isExecutionContextDestroyedError(err) {
  const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
  return (
    msg.includes('Execution context was destroyed') ||
    msg.includes('most likely because of a navigation') ||
    msg.includes('Cannot find context with specified id')
  );
}

async function waitForPageToSettleAfterNavigation(page, timeoutMs = 120_000) {
  // Vite can reload once during optimizeDeps. Waiting for DOMContentLoaded is usually sufficient.
  await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs });
  await new Promise((r) => setTimeout(r, 2000));
}

async function runAllModelsWithRetry(page, maxAttempts = 3) {
  const modelListRaw = String(process.env.WEB_OUTPUT_MODELS || '').trim();
  const modelList = modelListRaw
    ? modelListRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const fnName = modelList ? 'runModels' : 'runAllModels';
      console.log(`[generate:web-output] Waiting for window.${fnName} (attempt ${attempt}/${maxAttempts})`);
      if (modelList) {
        await page.waitForFunction(() => typeof window.runModels === 'function', null, { timeout: 120_000 });
      } else {
        await page.waitForFunction(() => typeof window.runAllModels === 'function', null, { timeout: 120_000 });
      }

      console.log(`[generate:web-output] Running window.${fnName}() (attempt ${attempt}/${maxAttempts})`);
      // Evaluate in-page.
      // If Vite reloads, Playwright throws "Execution context was destroyed" and we'll retry.
      // @ts-ignore
      if (modelList) {
        console.log(`[generate:web-output] WEB_OUTPUT_MODELS=${JSON.stringify(modelList)}`);
        return await page.evaluate(async (names) => await window.runModels(names), modelList);
      }
      return await page.evaluate(async () => await window.runAllModels());
    } catch (err) {
      if (attempt === maxAttempts || !isExecutionContextDestroyedError(err)) throw err;
      console.log('[generate:web-output] Detected Vite reload during evaluate; waiting and retrying...');
      await waitForPageToSettleAfterNavigation(page);
    }
  }
  throw new Error('runAllModelsWithRetry: unreachable');
}

function startViteDevServer() {
  const isWin = process.platform === 'win32';

  // On Windows, spawning npm.cmd directly can throw spawn EINVAL depending on environment.
  // Running through cmd.exe is more robust.
  const command = `npm run dev -- --port ${PORT} --strictPort`;
  const child = isWin
    ? spawn('cmd.exe', ['/d', '/s', '/c', command], {
        cwd: PROJECT_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Avoid noisy browser auto-open behavior in some environments
          BROWSER: 'none',
        },
      })
    : spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
        cwd: PROJECT_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          BROWSER: 'none',
        },
      });

  child.stdout.on('data', (d) => process.stdout.write(String(d)));
  child.stderr.on('data', (d) => process.stderr.write(String(d)));

  return child;
}

async function killProcessTree(pid) {
  if (!pid) return;

  const isWin = process.platform === 'win32';
  if (isWin) {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // ignore
  }
}

async function waitForChildExit(child, timeoutMs = 5_000) {
  if (!child || child.exitCode !== null) return;

  await Promise.race([
    once(child, 'exit').catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function destroyChildStreams(child) {
  try {
    child?.stdout?.destroy?.();
  } catch {
    // ignore
  }
  try {
    child?.stderr?.destroy?.();
  } catch {
    // ignore
  }
}

async function main() {
  ensureDir(WEB_OUTPUT_DIR);
  
  // Parse CLI args for --models
  const args = process.argv.slice(2);
  const modelsIdx = args.indexOf('--models');
  if (modelsIdx !== -1 && args[modelsIdx + 1]) {
    process.env.WEB_OUTPUT_MODELS = args[modelsIdx + 1];
  }

  const modelListRaw = String(process.env.WEB_OUTPUT_MODELS || '').trim();
  if (modelListRaw) {
    console.log(`[generate:web-output] WEB_OUTPUT_MODELS is set; preserving existing CSVs in ${WEB_OUTPUT_DIR}`);
  } else {
    cleanOldOutputs(WEB_OUTPUT_DIR);
  }

  console.log(`\n[generate:web-output] Starting Vite dev server for ${BASE_URL}`);
  const devServer = startViteDevServer();

  let succeeded = false;

  const shutdown = async () => {
    try {
      if (!devServer.killed) devServer.kill();
    } catch {
      // ignore
    }

    await waitForChildExit(devServer, 2_000);
    await killProcessTree(devServer.pid);
    await waitForChildExit(devServer, 3_000);
    destroyChildStreams(devServer);
  };

  process.on('SIGINT', () => {
    void shutdown();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    void shutdown();
    process.exit(143);
  });

  try {
    await waitForHttpOk(BASE_URL, 90_000);
    console.log(`[generate:web-output] App is up: ${BASE_URL}`);

    const headed = String(process.env.WEB_OUTPUT_HEADED || '').trim() === '1';
    console.log(`[generate:web-output] Launching Chromium (${headed ? 'headed' : 'headless'})`);
    const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 50 : 0 });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    page.setDefaultNavigationTimeout(120_000);

    page.on('console', (msg) => {
      const text = msg.text();
      if (text && text.trim()) console.log(`[browser console] ${text}`);
    });
    page.on('pageerror', (err) => {
      console.log('[browser pageerror]', err);
    });
    page.on('requestfailed', (req) => {
      const failure = req.failure();
      console.log(`[browser requestfailed] ${req.url()} ${failure ? failure.errorText : ''}`);
    });

    const downloadSaves = [];
    let downloadCount = 0;

    page.on('download', (download) => {
      const suggested = download.suggestedFilename();
      const targetPath = path.join(WEB_OUTPUT_DIR, suggested);
      downloadCount += 1;
      const p = download.saveAs(targetPath).then(() => {
        console.log(`[generate:web-output] Saved (${downloadCount}): ${suggested}`);
      });
      downloadSaves.push(p);
    });

    console.log('[generate:web-output] Opening app');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Vite may trigger a one-time reload during dependency optimization.
    await waitForPageToSettleAfterNavigation(page);

    const result = await runAllModelsWithRetry(page);

    console.log('[generate:web-output] Batch runner returned:', result);

    await waitForDownloadsToSettle(() => downloadCount);

    // Ensure all downloads have been flushed to disk.
    await Promise.all(downloadSaves);

    await context.close();
    await browser.close();

    const csvFiles = fs.readdirSync(WEB_OUTPUT_DIR).filter((f) => f.toLowerCase().endsWith('.csv'));
    console.log(`\n[generate:web-output] Done. CSVs in web_output/: ${csvFiles.length}`);

    succeeded = true;
  } finally {
    await shutdown();

    // On Windows, child-process handles can sometimes keep Node alive.
    // If we've succeeded, force a clean exit shortly after shutdown.
    if (succeeded) {
      process.exitCode = 0;
      setTimeout(() => process.exit(0), 50).unref();
    }
  }
}

main().catch((err) => {
  console.error('\n[generate:web-output] Failed:', err);
  process.exitCode = 1;
});
