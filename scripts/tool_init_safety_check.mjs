import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';

const PORT = Number(process.env.TOOL_INIT_PORT || 3000);
const BASE_PATH = '/bngplayground/';
const BASE_URL = `http://localhost:${PORT}${BASE_PATH}?batch=true`;

async function waitForHttpOk(url, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function killProcessTree(pid) {
  if (!pid) return;
  const isWin = process.platform === 'win32';
  if (isWin) {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }
  try { process.kill(pid, 'SIGTERM'); } catch { }
}

async function waitForChildExit(child, timeoutMs = 5_000) {
  if (!child || child.exitCode !== null) return;
  await Promise.race([
    once(child, 'exit').catch(() => undefined),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
}

async function main() {
  let devServer = null;
  const existing = await waitForHttpOk(BASE_URL, 2_000).then(() => true).catch(() => false);

  if (!existing) {
    console.log('[tool-init] Starting Vite dev server...');
    devServer = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
    });
    devServer.stdout.on('data', (d) => process.stdout.write(d));
    devServer.stderr.on('data', (d) => process.stderr.write(d));
    await waitForHttpOk(BASE_URL, 90_000);
    console.log('[tool-init] Dev server ready.');
  } else {
    console.log('[tool-init] Reusing existing dev server.');
  }

  let exitCode = 0;
  try {
    const browser = await chromium.launch({ headless: true });

    const allErrors = [];
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') allErrors.push(`[console.error] ${msg.text()}`);
    });
    page.on('pageerror', (err) => allErrors.push(`[page error] ${err.message}`));

    console.log('[tool-init] Loading app...');
    await page.goto(BASE_URL, { timeout: 60_000 });
    await page.waitForFunction(
      () => typeof window.runToolSafetyCheck === 'function',
      null,
      { timeout: 30_000 },
    );
    console.log('[tool-init] App loaded, running safety check...');

    const results = await page.evaluate(() => window.runToolSafetyCheck());

    console.log('\n========== Tool Initialization Safety Check ==========\n');
    for (const [tool, result] of Object.entries(results)) {
      if (result.success) {
        console.log(`  ✅ ${tool}: OK`);
      } else {
        console.error(`  ❌ ${tool}: FAILED - ${result.error}`);
      }
    }
    console.log('');

    const runtimeErrors = allErrors.filter((e) =>
      /import|runtime|WASM|nfsim|module|importScripts|worker.error/i.test(e),
    );
    if (runtimeErrors.length > 0) {
      console.error('Runtime/import errors detected in console:');
      for (const err of runtimeErrors) console.error(`  - ${err}`);
      console.log('');
    }

    const failed = Object.entries(results).filter(([, r]) => !r.success);
    if (failed.length > 0 || runtimeErrors.length > 0) {
      const reasons = [];
      if (failed.length > 0) reasons.push(`${failed.length} tool(s) failed`);
      if (runtimeErrors.length > 0) reasons.push(`${runtimeErrors.length} runtime error(s)`);
      console.error(`❌ Tool safety check FAILED: ${reasons.join(', ')}`);
      exitCode = 1;
    } else {
      console.log('✅ All tools initialized successfully - no import or runtime errors.');
    }

    await browser.close();
  } catch (err) {
    console.error('[tool-init] Fatal error:', err);
    exitCode = 1;
  } finally {
    if (devServer) {
      try { devServer.kill(); } catch { }
      await waitForChildExit(devServer);
      await killProcessTree(devServer.pid);
    }
  }

  process.exit(exitCode);
}

main();
