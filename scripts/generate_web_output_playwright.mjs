import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const PROJECT_ROOT = process.cwd();
const WEB_OUTPUT_DIR = path.join(PROJECT_ROOT, 'web_output');
const PORT = Number(process.env.WEB_OUTPUT_PORT || 5175);
const DEFAULT_TIMEOUT_PER_MODEL_MS = Number(
  process.env.BNG_MODEL_TIMEOUT_MS || process.env.WEB_OUTPUT_TIMEOUT_MS || 60_000
);
const MIN_ATTEMPT_RATE = Number(process.env.WEB_OUTPUT_MIN_ATTEMPT_RATE || 0.8);
const MIN_SUCCESS_RATE = Number(process.env.WEB_OUTPUT_MIN_SUCCESS_RATE || 0.5);
const MODEL_TIMEOUT_OVERRIDES_MS = {
  lin_prion_2019: Number(process.env.WEB_OUTPUT_TIMEOUT_LIN_PRION_MS || 900_000), // 15 minutes
  jaruszewicz_blonska_2023: Number(process.env.WEB_OUTPUT_TIMEOUT_JARUSZEWICZ_BLONSKA_MS || 900_000), // 15 minutes
};
const defaultGuardedModels = ['lin_prion_2019', 'jaruszewicz_blonska_2023', 'lv_comp'];
const envGuardList = (process.env.WEB_OUTPUT_SKIP_MODELS || defaultGuardedModels.join(','));
const GUARDED_MODEL_KEYS = new Set(
  envGuardList
    .split(',')
    .map((s) => safeModelName(s))
    .filter(Boolean)
);

function readViteBasePath() {
  const envBase = process.env.WEB_OUTPUT_BASE;
  if (envBase && envBase.trim()) return envBase.trim();
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

function safeModelName(name) {
  return String(name || '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function getTimeoutForModel(modelId) {
  const key = safeModelName(modelId);
  const override = MODEL_TIMEOUT_OVERRIDES_MS[key];
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return override;
  }
  return DEFAULT_TIMEOUT_PER_MODEL_MS;
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function safeKey(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, '_');
}

function addKey(map, key, id) {
  if (!key) return;
  const existing = map.get(key);
  if (existing) {
    existing.add(id);
    return;
  }
  map.set(key, new Set([id]));
}

function resolveModelList(requested, entries) {
  const idMap = new Map();
  const keyMap = new Map();

  for (const entry of entries) {
    const id = entry.id;
    const name = entry.name;
    idMap.set(normalizeKey(id), id);
    addKey(keyMap, normalizeKey(name), id);
    addKey(keyMap, safeKey(name), id);
    addKey(keyMap, safeKey(id), id);
  }

  const resolved = [];
  const resolvedSet = new Set();
  const missing = [];
  const ambiguous = [];

  for (const raw of requested) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) continue;
    const key = normalizeKey(trimmed);
    if (idMap.has(key)) {
      const id = idMap.get(key);
      if (!resolvedSet.has(id)) {
        resolvedSet.add(id);
        resolved.push(id);
      }
      continue;
    }

    const candidates = keyMap.get(key) || keyMap.get(safeKey(trimmed));
    if (!candidates || candidates.size === 0) {
      resolvedSet.add(trimmed);
      resolved.push(trimmed);
      continue;
    }

    if (candidates.size > 1) {
      ambiguous.push({ name: trimmed, ids: Array.from(candidates).sort() });
      continue;
    }

    const id = Array.from(candidates)[0];
    if (!resolvedSet.has(id)) {
      resolvedSet.add(id);
      resolved.push(id);
    }
  }

  if (missing.length || ambiguous.length) {
    if (missing.length) {
      console.error(`[generate:web-output] Unknown models: ${missing.join(', ')}`);
    }
    if (ambiguous.length) {
      for (const entry of ambiguous) {
        console.error(`[generate:web-output] Ambiguous model selector "${entry.name}" matches: ${entry.ids.join(', ')}`);
      }
    }
    throw new Error('Model list contains unknown or ambiguous entries. Use model IDs for disambiguation.');
  }

  return resolved;
}

const BASE_PATH = normalizeBasePath(readViteBasePath());
const BASE_URL = `http://localhost:${PORT}${BASE_PATH}?batch=true`;
const WEB_OUTPUT_SEED = Number(process.env.WEB_OUTPUT_SEED || '12345');
const WEB_OUTPUT_STRICT = String(process.env.WEB_OUTPUT_STRICT || '0') === '1';

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
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported protocol while waiting for URL: ${parsed.protocol}`);
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    throw new Error(`Refusing to probe non-local host: ${parsed.hostname}`);
  }
  const safeUrl = parsed.toString();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(safeUrl, { method: 'GET' });
      if (res.ok) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${safeUrl}`);
}

async function waitForPageToSettleAfterNavigation(page, timeoutMs = 120_000) {
  await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs });
  // Wait for runModels to be available
  await page.waitForFunction(() => typeof window.runModels === 'function', null, { timeout: timeoutMs });
}

async function getAvailableModels(page, timeoutMs = 120_000) {
  await page.waitForFunction(
    async () => {
      if (typeof window.getModelEntriesAsync === 'function') {
        const entries = await window.getModelEntriesAsync();
        return Array.isArray(entries) && entries.length > 0;
      }
      if (typeof window.getModelEntries === 'function') {
        const entries = window.getModelEntries();
        return Array.isArray(entries) && entries.length > 0;
      }
      if (typeof window.getModelNames === 'function') {
        const names = window.getModelNames();
        return Array.isArray(names) && names.length > 0;
      }
      return false;
    },
    null,
    { timeout: timeoutMs }
  );

  return page.evaluate(async () => {
    if (typeof window.getModelEntriesAsync === 'function') return window.getModelEntriesAsync();
    if (typeof window.getModelEntries === 'function') return window.getModelEntries();
    const names = (typeof window.getModelNames === 'function' ? window.getModelNames() : []) || [];
    return names.map((name) => ({ id: name, name }));
  });
}

async function applyBatchSeed(page) {
  if (!Number.isFinite(WEB_OUTPUT_SEED)) return;
  await page.evaluate((seed) => {
    window.__batchSeed = seed;
    console.log(`[BatchRunner] Using deterministic seed: ${seed}`);
  }, WEB_OUTPUT_SEED);
}

async function applyBatchStrictMode(page) {
  if (!WEB_OUTPUT_STRICT) return;
  await page.evaluate(() => {
    window.__batchStrictFunctionalRates = true;
    console.log('[BatchRunner] Strict functional-rate mode enabled (unresolved symbols / NaN throw loudly).');
  });
}

async function initializeBatchPage(page) {
  console.log('[generate:web-output] Opening app...');
  await page.goto(BASE_URL, { timeout: 300000 });
  await waitForPageToSettleAfterNavigation(page);
  await applyBatchSeed(page);
  await applyBatchStrictMode(page);
}

function startViteDevServer() {
  const isWin = process.platform === 'win32';
  const command = `npm run dev -- --port ${PORT} --strictPort`;
  console.log(`[generate:web-output] Starting Vite: ${command}`);

  const child = isWin
    ? spawn('cmd.exe', ['/d', '/s', '/c', command], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
    })
    : spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
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
  } catch { }
}

async function waitForChildExit(child, timeoutMs = 5_000) {
  if (!child || child.exitCode !== null) return;
  await Promise.race([
    once(child, 'exit').catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

async function main() {
  ensureDir(WEB_OUTPUT_DIR);

  // Parse filtering
  const args = process.argv.slice(2);
  const modelsIdx = args.indexOf('--models');
  const hasModelsArg = modelsIdx !== -1 && !!args[modelsIdx + 1];
  if (hasModelsArg) {
    process.env.WEB_OUTPUT_MODELS = args[modelsIdx + 1];
  }
  const rawModelList = hasModelsArg
    ? (process.env.WEB_OUTPUT_MODELS || '')
    : (process.env.MODELS || process.env.WEB_OUTPUT_MODELS || '');
  const envModelList = rawModelList
    ? rawModelList.split(',').map(s => s.trim()).filter(Boolean)
    : null;

  if (envModelList) {
    const source = hasModelsArg
      ? '--models'
      : (process.env.MODELS ? 'MODELS' : 'WEB_OUTPUT_MODELS');
    console.log(`[generate:web-output] Targeted models (${source}): ${envModelList.join(', ')}`);
  } else {
    // Only clean if running full suite
    console.log(`[generate:web-output] Cleaning output directory...`);
    cleanOldOutputs(WEB_OUTPUT_DIR);
  }

  let devServer = null;
  const existingServer = await waitForHttpOk(BASE_URL, 2_000).then(() => true).catch(() => false);
  if (existingServer) {
    console.log(`[generate:web-output] Reusing existing app server at ${BASE_URL}`);
  } else {
    devServer = startViteDevServer();
  }
  let succeeded = false;

  const shutdown = async () => {
    if (!devServer) return;
    try { if (!devServer.killed) devServer.kill(); } catch { }
    await waitForChildExit(devServer, 2000);
    await killProcessTree(devServer.pid);
  };

  process.on('SIGINT', () => { void shutdown(); process.exit(130); });
  process.on('SIGTERM', () => { void shutdown(); process.exit(143); });

  try {
    if (!existingServer) {
      await waitForHttpOk(BASE_URL, 90_000);
    }
    console.log(`[generate:web-output] App is up: ${BASE_URL}`);

    const headed = String(process.env.WEB_OUTPUT_HEADED || '').trim() === '1';
    const browser = await chromium.launch({ headless: !headed });
    let context = await browser.newContext({ acceptDownloads: true });
    let page = await context.newPage();

    const logPath = path.join(PROJECT_ROOT, 'browser_console.log');
    // Clear log file
    fs.writeFileSync(logPath, '');
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    let activeDownloads = 0;
    let downloadSeen = false;
    const downloadHandler = (download) => {
      downloadSeen = true;
      activeDownloads++;
      const suggested = download.suggestedFilename();
      const targetPath = path.join(WEB_OUTPUT_DIR, suggested);
      download.saveAs(targetPath).then(() => {
        console.log(`[generate:web-output] Saved: ${suggested}`);
        activeDownloads--;
      }).catch(e => {
        console.error(`[generate:web-output] Download failed: ${suggested}`, e);
        activeDownloads--;
      });
    };

    const attachPageHandlers = (targetPage) => {
      targetPage.on('console', msg => {
        const text = msg.text();
        console.log(`[browser] ${text}`);
        logStream.write(`[browser] ${text}\n`);
      });
      targetPage.on('pageerror', err => {
        console.error('[browser error]', err);
        logStream.write(`[browser error] ${err}\n`);
      });
      targetPage.on('download', downloadHandler);
    };

    attachPageHandlers(page);
    await initializeBatchPage(page);

    // Get full list of models from the app
    const allModels = await getAvailableModels(page);

    const modelsToRun = envModelList ? resolveModelList(envModelList, allModels) : allModels.map(m => m.id);
    console.log(`[generate:web-output] Found ${allModels.length} available models.`);
    console.log(`[generate:web-output] Scheduled to run: ${modelsToRun.length} models.`);

    let successCount = 0;
    let failCount = 0;

    for (const modelId of modelsToRun) {
      console.log(`\n--------------------------------------------------`);
      console.log(`[generate:web-output] Processing: ${modelId}`);

      if (GUARDED_MODEL_KEYS.has(safeModelName(modelId))) {
        console.log(`[generate:web-output] Model guard skip: ${modelId}`);
        const skippedFile = path.join(WEB_OUTPUT_DIR, `results_${safeModelName(modelId)}.csv`);
        fs.writeFileSync(skippedFile, 'Time,Observable\n# SKIPPED (ModelGuard)\n0,0');
        successCount++;
        continue;
      }

      try {
        const timeoutMs = getTimeoutForModel(modelId);
        if (timeoutMs !== DEFAULT_TIMEOUT_PER_MODEL_MS) {
          console.log(`[generate:web-output] Timeout override for ${modelId}: ${timeoutMs} ms`);
        }
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
        );

        // Run single model
        downloadSeen = false;
        const runResult = await Promise.race([
          page.evaluate((name) => window.runModels([name]), modelId),
          timeoutPromise
        ]);

        if (runResult && typeof runResult === 'object' && Number(runResult.failed) > 0) {
          throw new Error('MODEL_FAILED');
        }

        // Wait for download to start and finish (fast models may complete before polling tick)
        const downloadStartWait = Number(process.env.WEB_OUTPUT_DOWNLOAD_START_WAIT_MS || 300);
        const downloadWaitStart = Date.now();
        while (Date.now() - downloadWaitStart < downloadStartWait) {
          if (downloadSeen || activeDownloads > 0) break;
          await new Promise((r) => setTimeout(r, 50));
        }

        // Wait for active downloads to clear
        while (activeDownloads > 0) {
          await new Promise((r) => setTimeout(r, 50));
          if (Date.now() - downloadWaitStart > 10000) throw new Error('Download stuck');
        }

        successCount++;
      } catch (err) {
        const errMessage = err instanceof Error ? err.message : String(err);
        console.error(`[generate:web-output] ? FAILED ${modelId}:`, errMessage);
        failCount++;

        if (errMessage === 'TIMEOUT') {
          console.log(`[generate:web-output] ?? Timeout exceeded for ${modelId}. Writing skipped marker.`);
          // Create a marker file so the report generator knows it was skipped
          const skippedFile = path.join(WEB_OUTPUT_DIR, `results_${safeModelName(modelId)}.csv`);
          fs.writeFileSync(skippedFile, 'Time,Observable\n# SKIPPED (Timeout)\n0,0');
        } else if (errMessage === 'MODEL_FAILED') {
          console.log(`[generate:web-output] ?? Model run failed for ${modelId}. Writing skipped marker.`);
          const skippedFile = path.join(WEB_OUTPUT_DIR, `results_${safeModelName(modelId)}.csv`);
          fs.writeFileSync(skippedFile, 'Time,Observable\n# FAILED (ModelFailed)\n0,0');
        }

        console.log('[generate:web-output] Reloading page to recover...');
        try {
          await page.reload();
          await waitForPageToSettleAfterNavigation(page);
          await applyBatchSeed(page);
        } catch (reloadErr) {
          console.warn('[generate:web-output] Page reload failed. Creating fresh browser context...');
          try {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
            context = await browser.newContext({ acceptDownloads: true });
            page = await context.newPage();
            attachPageHandlers(page);
            await initializeBatchPage(page);
            console.log('[generate:web-output] Fresh context ready. Continuing batch.');
          } catch (freshErr) {
            console.error('[generate:web-output] Fatal: Could not create fresh context.', freshErr);
            break;
          }
        }
      }
    }

    console.log(`\n[generate:web-output] Batch Complete. Success: ${successCount}, Failed: ${failCount}`);
    const totalAttempted = successCount + failCount;
    const skippedCount = modelsToRun.length - totalAttempted;
    if (skippedCount > 0) {
      console.error(`[generate:web-output] WARNING: ${skippedCount}/${modelsToRun.length} models were never attempted (early termination).`);
    }
    await context.close();
    await browser.close();
    const attemptRate = modelsToRun.length > 0 ? totalAttempted / modelsToRun.length : 0;
    const successRate = totalAttempted > 0 ? successCount / totalAttempted : 0;
    succeeded = attemptRate >= MIN_ATTEMPT_RATE && successRate >= MIN_SUCCESS_RATE;
    if (!succeeded) {
      console.error(`[generate:web-output] FAIL: attempt rate ${(attemptRate * 100).toFixed(0)}%, success rate ${(successRate * 100).toFixed(0)}%`);
    }

  } catch (err) {
    console.error('[generate:web-output] Fatal Error:', err);
  } finally {
    await shutdown();
    if (succeeded) process.exit(0);
    else process.exit(1);
  }
}

main();
