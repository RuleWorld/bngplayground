import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const PROJECT_ROOT = process.cwd();
const WEB_OUTPUT_DIR = path.join(PROJECT_ROOT, 'web_output');
const PORT = Number(process.env.WEB_OUTPUT_PORT || 5175);
const TIMEOUT_PER_MODEL_MS = 120_000; // 120 seconds timeout per model to accommodate large networks

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
      missing.push(trimmed);
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

async function waitForPageToSettleAfterNavigation(page, timeoutMs = 120_000) {
  await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs });
  // Wait for runModels to be available
  await page.waitForFunction(() => typeof window.runModels === 'function', null, { timeout: timeoutMs });
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
  if (modelsIdx !== -1 && args[modelsIdx + 1]) {
    process.env.WEB_OUTPUT_MODELS = args[modelsIdx + 1];
  }
  const envModelList = process.env.WEB_OUTPUT_MODELS ? process.env.WEB_OUTPUT_MODELS.split(',').map(s => s.trim()).filter(Boolean) : null;

  if (envModelList) {
    console.log(`[generate:web-output] Targeted models: ${envModelList.join(', ')}`);
  } else {
    // Only clean if running full suite
    console.log(`[generate:web-output] Cleaning output directory...`);
    cleanOldOutputs(WEB_OUTPUT_DIR);
  }

  const devServer = startViteDevServer();
  let succeeded = false;

  const shutdown = async () => {
    try { if (!devServer.killed) devServer.kill(); } catch { }
    await waitForChildExit(devServer, 2000);
    await killProcessTree(devServer.pid);
  };

  process.on('SIGINT', () => { void shutdown(); process.exit(130); });
  process.on('SIGTERM', () => { void shutdown(); process.exit(143); });

  try {
    await waitForHttpOk(BASE_URL, 90_000);
    console.log(`[generate:web-output] App is up: ${BASE_URL}`);

    const headed = String(process.env.WEB_OUTPUT_HEADED || '').trim() === '1';
    const browser = await chromium.launch({ headless: !headed });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    const logPath = path.join(PROJECT_ROOT, 'browser_console.log');
    // Clear log file
    fs.writeFileSync(logPath, '');
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    page.on('console', msg => {
      const text = msg.text();
      console.log(`[browser] ${text}`);
      logStream.write(`[browser] ${text}\n`);
    });
    page.on('pageerror', err => {
      console.error('[browser error]', err);
      logStream.write(`[browser error] ${err}\n`);
    });

    let activeDownloads = 0;
    page.on('download', (download) => {
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
    });

    console.log('[generate:web-output] Opening app...');
    await page.goto(BASE_URL, { timeout: 300000 });
    await waitForPageToSettleAfterNavigation(page);

    if (Number.isFinite(WEB_OUTPUT_SEED)) {
      await page.evaluate((seed) => {
        window.__batchSeed = seed;
        console.log(`[BatchRunner] Using deterministic seed: ${seed}`);
      }, WEB_OUTPUT_SEED);
    }

    // Get full list of models from the app
    const allModels = await page.evaluate(() => {
      if (typeof window.getModelEntries === 'function') return window.getModelEntries();
      const names = (typeof window.getModelNames === 'function' ? window.getModelNames() : []) || [];
      return names.map((name) => ({ id: name, name }));
    });

    const modelsToRun = envModelList ? resolveModelList(envModelList, allModels) : allModels.map(m => m.id);
    console.log(`[generate:web-output] Found ${allModels.length} available models.`);
    console.log(`[generate:web-output] Scheduled to run: ${modelsToRun.length} models.`);

    let successCount = 0;
    let failCount = 0;

    for (const modelId of modelsToRun) {
      console.log(`\n--------------------------------------------------`);
      console.log(`[generate:web-output] Processing: ${modelId}`);

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_PER_MODEL_MS)
        );

        // Run single model
        await Promise.race([
          page.evaluate((name) => window.runModels([name]), modelId),
          timeoutPromise
        ]);

        // Wait for download to start and finish (simple heuristic: wait short time for activeDownloads to go up, then wait for 0)
        // runModels resolves AFTER downloadCsv is called, but FileSystem IO might take a moment
        const downloadStartWait = 2000;
        const downloadWaitStart = Date.now();
        while (Date.now() - downloadWaitStart < downloadStartWait) {
          if (activeDownloads > 0) break;
          await new Promise(r => setTimeout(r, 100));
        }

        // Wait for active downloads to clear
        while (activeDownloads > 0) {
          await new Promise(r => setTimeout(r, 100));
          if (Date.now() - downloadWaitStart > 10000) throw new Error("Download stuck");
        }

        successCount++;
      } catch (err) {
        console.error(`[generate:web-output] ❌ FAILED ${modelId}:`, err.message);
        failCount++;

        if (err.message === 'TIMEOUT') {
          console.log(`[generate:web-output] ⚠️ Timeout exceeded for ${modelId}. Writing skipped marker.`);
          // Create a marker file so the report generator knows it was skipped
          const skippedFile = path.join(WEB_OUTPUT_DIR, `results_${safeModelName(modelId)}.csv`);
          fs.writeFileSync(skippedFile, 'Time,Observable\n# SKIPPED (Timeout)\n0,0');
        }

        console.log('[generate:web-output] Reloading page to recover...');
        try {
          await page.reload();
          await waitForPageToSettleAfterNavigation(page);
        } catch (reloadErr) {
          console.error('[generate:web-output] Fatal: Could not reload page.', reloadErr);
          break;
        }
      }
    }

    console.log(`\n[generate:web-output] Batch Complete. Success: ${successCount}, Failed: ${failCount}`);
    await context.close();
    await browser.close();
    succeeded = true;

  } catch (err) {
    console.error('[generate:web-output] Fatal Error:', err);
  } finally {
    await shutdown();
    if (succeeded) process.exit(0);
    else process.exit(1);
  }
}

main();
