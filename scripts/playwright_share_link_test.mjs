import { chromium } from 'playwright';
import { spawn } from 'child_process';

// Self-contained: spawn `npm run preview`, wait for the local URL line, then run test
const DEFAULT_BASE = '/bngplayground/';

function stripAnsi(s) {
  // Basic ANSI escape removal (colors, cursor moves, etc)
  return s.replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, '');
}

async function isUrlReachable(url) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(t);
    return res.ok || (res.status >= 200 && res.status < 500);
  } catch {
    return false;
  }
}

function startPreview() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['run', 'preview'], { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
    let appUrl = null;
    let buffer = '';

    const onData = (chunk) => {
      const raw = String(chunk);
      process.stdout.write(raw);

      buffer += stripAnsi(raw);
      // Find the first occurrence of an http(s) URL. Output may be chunked.
      const m = buffer.match(/https?:\/\/[^\s\n\r]+/);
      if (m) {
        const rest = m[0];
        try {
          const u = new URL(rest);
          // Ensure base path is present (dev/preview in this repo uses /bngplayground/)
          if (!u.pathname.includes(DEFAULT_BASE.replace(/\/$/, ''))) {
            u.pathname = DEFAULT_BASE;
          }
          if (!u.pathname.endsWith('/')) u.pathname += '/';
          appUrl = u.toString();
          resolve({ proc, appUrl });
        } catch (e) {
          // ignore parse errors and keep waiting
        }
      }
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);

    proc.on('error', (err) => reject(err));

    // Safety timeout
    setTimeout(() => {
      if (!appUrl) {
        reject(new Error('Preview server did not start in time'));
      }
    }, 60_000);

  });
}

(async () => {
  const explicitUrl = process.env.APP_URL;
  let useExternal = typeof explicitUrl === 'string' && explicitUrl.length > 0;

  console.log(useExternal
    ? `[playwright] Using APP_URL=${explicitUrl}`
    : '[playwright] Spawning preview server...');

  let preview = null;
  let baseUrl = explicitUrl;
  try {
    if (useExternal) {
      const ok = await isUrlReachable(baseUrl);
      if (!ok) {
        console.warn('[playwright] APP_URL not reachable; falling back to spawning preview');
        useExternal = false;
        baseUrl = null;
      }
    }

    if (!useExternal) {
      preview = await startPreview();
      baseUrl = preview.appUrl;
      console.log('[playwright] Preview up at', baseUrl);
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(baseUrl, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => !!window.monaco, null, { timeout: 30_000 });

    const sampleCode = `# Playwright test model\nA+B -> C k1\nparam k1 1.0`;

    await page.evaluate((code) => {
      const monaco = window.monaco;
      if (!monaco) throw new Error('monaco not available');
      const models = monaco.editor.getModels();
      if (!models || !models[0]) throw new Error('no monaco model');
      models[0].setValue(code);
    }, sampleCode);

    await page.click('button:has-text("Share")');
    const modalTitle = page.locator('text=Share Model').first();
    await modalTitle.waitFor({ state: 'visible', timeout: 10_000 });

    const shareInput = page.locator('input[readonly]').first();
    await shareInput.waitFor({ state: 'visible', timeout: 10_000 });
    const shareUrl = await shareInput.inputValue();
    if (!shareUrl.includes('#model=')) throw new Error('share url missing model hash');

    const embedTextarea = page.locator('textarea[readonly]').first();
    await embedTextarea.waitFor({ state: 'visible', timeout: 10_000 });
    const embedCode = await embedTextarea.inputValue();
    const embedMatch = embedCode.match(/src="([^"]+)"/);
    if (!embedMatch?.[1]) throw new Error('embed iframe src not found');
    console.log('[playwright] Generated share URL:', shareUrl.slice(0, 120));

    const newPage = await context.newPage();
    await newPage.goto(shareUrl, { waitUntil: 'load', timeout: 30_000 });
    await newPage.waitForFunction(() => !!window.monaco, null, { timeout: 30_000 });

    // App loads the shared model via a React effect after mount; wait until Monaco reflects it.
    await newPage.waitForFunction(
      (expected) => {
        const monaco = window.monaco;
        const models = monaco?.editor?.getModels?.() ?? [];
        return typeof models[0]?.getValue === 'function' && models[0].getValue() === expected;
      },
      sampleCode,
      { timeout: 30_000 }
    );

    const loaded = await newPage.evaluate(() => {
      const monaco = window.monaco;
      return monaco.editor.getModels()[0].getValue();
    });

    if (loaded !== sampleCode) {
      console.error('[playwright] FAIL: loaded content did not match');
      console.error('Expected:', sampleCode);
      console.error('Got:', loaded);
      process.exitCode = 2;
    } else {
      console.log('[playwright] PASS: Shared model loaded correctly');
    }

    // Verify embed iframe works by loading HTML with the iframe and checking the model inside the frame
    const embedPage = await context.newPage();
    await embedPage.setContent(`<!DOCTYPE html><html><body>${embedCode}</body></html>`, { waitUntil: 'load' });
    await embedPage.waitForSelector('iframe', { timeout: 10_000 });

    const frame = embedPage.frame({ url: /bngplayground/ });
    if (!frame) throw new Error('embed iframe not attached');

    await frame.waitForFunction(() => !!window.monaco, null, { timeout: 30_000 });
    const embedLoaded = await frame.evaluate(() => {
      const monaco = window.monaco;
      return monaco.editor.getModels()[0].getValue();
    });

    if (embedLoaded !== sampleCode) {
      console.error('[playwright] FAIL: embed iframe did not load shared model');
      console.error('Expected:', sampleCode);
      console.error('Got:', embedLoaded);
      process.exitCode = 2;
    } else {
      console.log('[playwright] PASS: Embed iframe loaded shared model');
    }

    await embedPage.close();

    await browser.close();
  } catch (err) {
    console.error('[playwright] ERROR:', err);
    process.exitCode = 1;
  } finally {
    if (preview?.proc && !preview.proc.killed) {
      preview.proc.kill();
      console.log('[playwright] Stopped preview server');
    }
    process.exit(process.exitCode ?? 0);
  }
})();
