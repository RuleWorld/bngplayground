import { test, expect } from '@playwright/test';

const URL = process.env.URL || 'http://127.0.0.1:3000/bngplayground/';

test('Open-in-VSCode modal should open without hook errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
    // also collect any console.log that indicates a navigation attempt
    if (msg.text().includes('Attempted to set location to')) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  // Try multiple URL candidates in case the dev server is bound to a different interface
  const urlCandidates = [process.env.URL, 'http://127.0.0.1:3001/bngplayground/', 'http://localhost:3001/bngplayground/', 'http://192.168.1.156:3001/bngplayground/', 'http://127.0.0.1:3000/bngplayground/', 'http://localhost:3000/bngplayground/', 'http://192.168.1.156:3000/bngplayground/'].filter(Boolean);
  let opened = false;
  for (const u of urlCandidates) {
    try {
      await page.goto(u!, { waitUntil: 'networkidle', timeout: 5000 });
      opened = true;
      break;
    } catch (e) {
      console.log('Failed to open', u, (e as Error).message);
    }
  }
  if (!opened) throw new Error('Could not open any URL candidate. Start the dev server (npm run dev) or set URL env var.');

  // Ensure header button exists
  const headerBtn = page.locator('button[title="Open model in VS Code"]');
  await expect(headerBtn).toBeVisible({ timeout: 5000 });

  // --- Editor load/export checks ---
  const fileInput = page.getByTestId('editor-load-input');
  // Input is visually hidden; assert the accept attribute nonetheless
  const acceptAttr = await fileInput.getAttribute('accept');
  expect(acceptAttr).toContain('.sbml');
  expect(acceptAttr).toContain('.xml');

  const exportBtn = page.getByRole('button', { name: 'Export SBML' });
  await expect(exportBtn).toBeVisible();
  // Export button present; state (enabled/disabled) depends on whether a model is loaded.

  // Stub navigator.clipboard.writeText to avoid permission issues in headless
  await page.evaluate(() => {
    // @ts-ignore
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      // @ts-ignore
      (navigator as any).clipboard = { writeText: (s: string) => { console.log('clipboard.writeText called'); return Promise.resolve(); } };
    }

    // Prevent protocol navigation by trapping location setter
    try {
      const origLocation = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        enumerable: true,
        get: () => origLocation,
        set: (v) => { console.log('Attempted to set location to ' + v); }
      });
    } catch (e) {
      // ignore if not allowed
      console.warn('Could not redefine location:', e);
    }
  });

  // Click header button to open modal
  await headerBtn.click();

  // Wait for modal title
  await expect(page.locator('text=Open in VS Code')).toBeVisible({ timeout: 3000 });

  // Test header import -> BioModels flow
  const helpBtn = page.getByTitle('Help & Resources');
  await expect(helpBtn).toBeVisible();
  await helpBtn.click();
  // Click Import from BioModels item in dropdown
  const headerBioModels = page.locator('text=Import from BioModels...').first();
  await expect(headerBioModels).toBeVisible();
  await headerBioModels.click();
  await expect(page.locator('text=Import from BioModels')).toBeVisible({ timeout: 2000 });
  // Close the modal
  await page.locator('button', { hasText: 'Cancel' }).click();

  // Test Editor Load dropdown -> BioModels flow
  const modelsBtn = page.getByTestId('editor-panel').getByRole('button', { name: 'Models' });
  await modelsBtn.click();
  // Ensure editor panel exists then click Load dropdown
  const loadTrigger = page.locator('button', { hasText: 'Load' }).first();
  await loadTrigger.click();
  const editorBioModels = page.locator('div', { hasText: 'Import from BioModels...' }).first();
  await editorBioModels.click();
  await expect(page.locator('text=Import from BioModels')).toBeVisible({ timeout: 2000 });
  await page.locator('button', { hasText: 'Cancel' }).click();

  // Ensure BioModels search section is visible and input is present
  await expect(page.getByPlaceholder('Search BioModels (e.g., MAPK)')).toBeVisible();

  // Click the modal's "Open in VS Code" button
  const modalButton = page.locator('div:text("Open in VS Code")').locator('button', { hasText: 'Open in VS Code' }).first();
  if (await modalButton.count() === 0) {
    // fallback: any button with that text
    const btn = page.locator('button', { hasText: 'Open in VS Code' }).nth(1);
    await btn.click();
  } else {
    await modalButton.click();
  }

  // Wait briefly for console messages
  await page.waitForTimeout(1000);

  // Look for React hook error / minified React error #310
  const foundHookError = errors.find(e => e.includes('Rendered more hooks') || e.includes('Minified React error #310') || e.includes('Rendered more hooks than during the previous render'));

  expect(foundHookError).toBeUndefined();

  // --- Additional check for Example gallery totals ---
  // Editor "Models" gallery is already open from earlier; reuse the models button
  // Ensure the gallery modal is visible (it should be open after clicking Models above)
  const galleryDialog = page.getByRole('dialog', { name: 'BNGL Models' });
  await expect(galleryDialog).toBeVisible({ timeout: 3000 });


  const headerPara = await galleryDialog.locator('p').filter({ hasText: 'Browse' }).first().textContent();
  if (!headerPara) throw new Error('Gallery header paragraph not found');

  const shownCountMatch = headerPara.match(/Browse\s+(\d+)\s+models/);
  if (!shownCountMatch) throw new Error('Could not parse model count from header: ' + headerPara);
  const shownCount = Number(shownCountMatch[1]);

  // Sum counts from the category buttons visible in the modal
  const catButtons = await galleryDialog.locator('button').allTextContents();
  let sum = 0;
  const parenRE = /\((\d+)\)/g;
  for (const txt of catButtons) {
    let m: RegExpExecArray | null;
    while ((m = parenRE.exec(txt)) !== null) {
      sum += Number(m[1]);
    }
  }

  // Expect the header count to match the sum of category counts
  expect(shownCount).toBe(sum);
});