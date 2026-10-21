import { test, expect } from '@playwright/test';

test('Header resources and editor import/export flows work without hook errors', async ({ page }) => {
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

  await page.setViewportSize({ width: 390, height: 844 });
  for (const label of ['BNGL Syntax Guide', 'About BNG Playground', 'Contact Us', 'Help & Resources']) {
    const control = page.getByRole(label === 'Help & Resources' ? 'link' : 'button', { name: label });
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  await expect(page.getByText('Open In VS Code', { exact: true })).toHaveCount(0);

  // --- Editor load/export checks ---
  const fileInput = page.getByTestId('editor-load-input');
  // Input is visually hidden; assert the accept attribute nonetheless
  const acceptAttr = await fileInput.getAttribute('accept');
  expect(acceptAttr).toContain('.sbml');
  expect(acceptAttr).toContain('.xml');

  const exportMenu = page.getByRole('button', { name: 'Export options' });
  await expect(exportMenu).toBeVisible();
  await exportMenu.click();
  await expect(page.getByText('Export SBML', { exact: true })).toBeVisible();
  await expect(page.getByText('Export BNGL', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Parse BNGL code' }).click();

  // Help resources and BioModels-by-ID are exposed in their dedicated locations.
  for (const label of ['BNGL Syntax Guide', 'About BNG Playground', 'Contact Us']) {
    await expect(page.getByRole('button', { name: label })).toBeVisible();
  }
  const helpLink = page.getByRole('link', { name: 'Help & Resources' });
  await expect(helpLink).toHaveAttribute('href', 'https://bionetgen.org');
  await expect(page.getByRole('button', { name: 'Visualization Key' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Analysis options' }).click();
  await page.getByText('🎨 Rule Cartoons', { exact: true }).click();
  await expect(page.getByText('Rule Cartoon key', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open In VS Code' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Visualization Key' })).toHaveCount(0);

  // BioModels-by-ID is available from the Editor Load menu.
  await page.getByRole('button', { name: 'Load model' }).click();
  await page.getByRole('menuitem', { name: 'Import from BioModels...', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Import from BioModels' })).toBeVisible({ timeout: 2000 });
  await expect(page.getByPlaceholder('BioModels ID')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Look for React hook error / minified React error #310 after other interactions
  const foundHookError = errors.find(e => e.includes('Rendered more hooks') || e.includes('Minified React error #310') || e.includes('Rendered more hooks than during the previous render'));

  expect(foundHookError).toBeUndefined();

});

test('Example gallery category totals match the header count', async ({ page }) => {
  await page.goto(process.env.URL || 'http://localhost:3000/bngplayground/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Browse example models' }).click();

  const galleryDialog = page.getByRole('dialog', { name: 'BNGL Models' });
  await expect(galleryDialog).toBeVisible({ timeout: 3000 });
  const headerPara = await galleryDialog.locator('p').filter({ hasText: 'Browse' }).first().textContent();
  if (!headerPara) throw new Error('Gallery header paragraph not found');

  const shownCountMatch = headerPara.match(/Browse\s+(\d+)\s+models/);
  if (!shownCountMatch) throw new Error('Could not parse model count from header: ' + headerPara);
  const shownCount = Number(shownCountMatch[1]);

  const catButtons = await galleryDialog.locator('button').allTextContents();
  let sum = 0;
  const parenRE = /\((\d+)\)/g;
  for (const txt of catButtons) {
    let match: RegExpExecArray | null;
    while ((match = parenRE.exec(txt)) !== null) sum += Number(match[1]);
  }
  expect(shownCount).toBe(sum);
});
