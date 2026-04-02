import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const PROJECT_ROOT = process.cwd();
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output', 'playwright', 'contact-map');
const PORT = Number(process.env.CONTACT_MAP_PORT || 5176);
const DEFAULT_TIMEOUT_MS = Number(process.env.CONTACT_MAP_TIMEOUT_MS || 120_000);

function readViteBasePath() {
  const envBase = process.env.CONTACT_MAP_BASE;
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
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

function startViteDevServer() {
  const isWin = process.platform === 'win32';
  const command = `npm run dev -- --port ${PORT} --strictPort`;
  console.log(`[contact-map-check] Starting Vite: ${command}`);

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

function parseModelArgs() {
  const args = process.argv.slice(2);
  const modelsIdx = args.indexOf('--models');
  if (modelsIdx !== -1 && args[modelsIdx + 1]) {
    return args[modelsIdx + 1].split(',').map(s => s.trim()).filter(Boolean);
  }
  const env = process.env.CONTACT_MAP_MODELS || process.env.MODELS || '';
  if (!env) return null;
  return env.split(',').map(s => s.trim()).filter(Boolean);
}

async function waitForContactMapReady(page, timeoutMs = DEFAULT_TIMEOUT_MS) {
  await page.getByRole('button', { name: /Network/i }).click();
  await page.getByRole('button', { name: /^Contact Map$/i }).click();
  await page.waitForFunction(() => {
    const w = window;
    const cy = w.__contactMapCy;
    return cy && cy.nodes && cy.nodes().length > 0;
  }, null, { timeout: timeoutMs });

  const loading = page.getByText('Computing Layout...');
  try {
    await loading.waitFor({ state: 'detached', timeout: timeoutMs });
  } catch {
    // If the overlay never appeared, continue
  }
}

async function analyzeContactMap(page) {
  return page.evaluate(() => {
    const cy = window.__contactMapCy;
    if (!cy) return { error: 'contact-map-not-ready' };

    const threshold = 3;
    const outside = [];
    const overlaps = [];

    const getBBox = (node, includeLabels) => {
      try {
        return node.boundingBox({ includeLabels, includeOverlays: false });
      } catch {
        return node.boundingBox();
      }
    };

    const intersects = (a, b) => {
      if (!a || !b) return false;
      return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
    };

    const nodes = cy.nodes().filter(n => {
      const type = n.data('type');
      return type === 'molecule' || type === 'component';
    });

    nodes.forEach(node => {
      const base = getBBox(node, false);
      const withLabel = getBBox(node, true);
      if (!base || !withLabel) return;

      const overflow = {
        left: base.x1 - withLabel.x1,
        top: base.y1 - withLabel.y1,
        right: withLabel.x2 - base.x2,
        bottom: withLabel.y2 - base.y2,
      };

      if (overflow.left > threshold || overflow.top > threshold || overflow.right > threshold || overflow.bottom > threshold) {
        outside.push({
          id: node.id(),
          label: node.data('label'),
          type: node.data('type'),
          overflow,
        });
      }

      if (node.children && node.children().length > 0) {
        const labelBox = withLabel;
        node.children().forEach(child => {
          const childBox = getBBox(child, false);
          if (intersects(labelBox, childBox)) {
            overlaps.push({
              parentId: node.id(),
              parentLabel: node.data('label'),
              childId: child.id(),
              childLabel: child.data('label'),
            });
          }
        });
      }
    });

    return { outside, overlaps, nodeCount: nodes.length };
  });
}

async function main() {
  ensureDir(OUTPUT_DIR);

  const basePath = normalizeBasePath(readViteBasePath());
  const baseUrl = `http://localhost:${PORT}${basePath}`;

  const requestedModels = parseModelArgs();

  let devServer = null;
  const existingServer = await waitForHttpOk(baseUrl, 2_000).then(() => true).catch(() => false);
  if (existingServer) {
    console.log(`[contact-map-check] Reusing existing app server at ${baseUrl}`);
  } else {
    devServer = startViteDevServer();
  }

  const shutdown = async () => {
    if (!devServer) return;
    try { if (!devServer.killed) devServer.kill(); } catch { }
    await waitForChildExit(devServer, 2000);
    await killProcessTree(devServer.pid);
  };

  process.on('SIGINT', () => { void shutdown(); process.exit(130); });
  process.on('SIGTERM', () => { void shutdown(); process.exit(143); });

  let succeeded = false;

  try {
    if (!existingServer) {
      await waitForHttpOk(baseUrl, 90_000);
    }

    const headed = String(process.env.CONTACT_MAP_HEADED || '').trim() === '1';
    const browser = await chromium.launch({ headless: !headed });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(baseUrl, { timeout: 300_000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof window.getModelEntries === 'function', null, { timeout: 120_000 });

    let models = requestedModels;
    if (!models || models.length === 0) {
      models = await page.evaluate(() => {
        const entries = window.getModelEntries?.() || [];
        return entries.slice(0, 3).map((m) => m.id || m.name).filter(Boolean);
      });
      console.log(`[contact-map-check] No models specified; defaulting to: ${models.join(', ')}`);
    }

    const failures = [];

    for (const modelId of models) {
      console.log(`\n[contact-map-check] Model: ${modelId}`);
      const modelUrl = `${baseUrl}?model=${encodeURIComponent(modelId)}`;
      await page.goto(modelUrl, { timeout: 300_000 });
      await page.waitForLoadState('domcontentloaded');

      await waitForContactMapReady(page, DEFAULT_TIMEOUT_MS);

      const analysis = await analyzeContactMap(page);
      const safeName = String(modelId).replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const screenshotPath = path.join(OUTPUT_DIR, `${safeName}.png`);
      await page.locator('[data-testid="contact-map-panel"]').screenshot({ path: screenshotPath });
      console.log(`[contact-map-check] Saved screenshot: ${screenshotPath}`);

      if (analysis.error) {
        failures.push({ modelId, error: analysis.error });
        console.error(`[contact-map-check] ERROR: ${analysis.error}`);
        continue;
      }

      const outsideCount = analysis.outside.length;
      const overlapCount = analysis.overlaps.length;
      console.log(`[contact-map-check] Nodes: ${analysis.nodeCount} | label overflow: ${outsideCount} | label overlap: ${overlapCount}`);

      if (outsideCount > 0 || overlapCount > 0) {
        failures.push({ modelId, outsideCount, overlapCount, sample: { outside: analysis.outside.slice(0, 5), overlaps: analysis.overlaps.slice(0, 5) } });
      }
    }

    await context.close();
    await browser.close();

    if (failures.length > 0) {
      console.error(`\n[contact-map-check] FAILURES: ${failures.length}`);
      for (const failure of failures) {
        console.error(JSON.stringify(failure, null, 2));
      }
      succeeded = false;
    } else {
      console.log('\n[contact-map-check] All models passed label checks.');
      succeeded = true;
    }
  } catch (err) {
    console.error('[contact-map-check] Fatal Error:', err);
  } finally {
    await shutdown();
    process.exit(succeeded ? 0 : 1);
  }
}

main();
