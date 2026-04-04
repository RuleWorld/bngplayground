import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/bngplayground/';

async function openTab(page, tabName) {
  const btn = page.locator('button', { hasText: 'Analysis' });
  await btn.click();
  await page.waitForTimeout(300);
  const item = page.locator(`text=${tabName}`).first();
  if (await item.isVisible({ timeout: 2000 })) {
    await item.click();
  }
  await page.waitForTimeout(1000);
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Move the editor/visualization slider to give more room to visualization
  // The slider is typically a vertical divider between editor and visualization panels
  const slider = page.locator('[class*="resize"], [class*="divider"], [class*="splitter"], [data-panel-resize-handle-id]').first();

  if (await slider.isVisible({ timeout: 2000 }).catch(() => false)) {
    const box = await slider.boundingBox();
    if (box) {
      // Drag slider to the left to make visualization panel wider
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x - 300, box.y + box.height / 2, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(500);
    }
  } else {
    // Try to find the gutter/handle between panels
    // Often it's a thin element between two major panels
    console.log('No resize handle found, trying to minimize editor...');
    // Try clicking a collapse button if available
    const collapseBtn = page.locator('[aria-label*="collapse"], [title*="collapse"], button:has-text("Hide")').first();
    if (await collapseBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await collapseBtn.click();
      await page.waitForTimeout(500);
    }
  }

  const tabs = [
    { name: 'PK/PD', file: 'pkpd' },
    { name: 'Bifurcation', file: 'bifurcation' },
    { name: 'Temporal Info', file: 'temporal' },
    { name: 'Version History', file: 'version' },
    { name: 'Multi-Scale', file: 'multiscale' },
  ];

  for (const tab of tabs) {
    console.log(`Screenshotting: ${tab.name}`);
    await openTab(page, tab.name);
    await page.waitForTimeout(1500);

    // Screenshot just the right panel (visualization area)
    const vizPanel = page.locator('[class*="flex-1"][class*="min-h-0"]').last();
    if (await vizPanel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await vizPanel.screenshot({ path: `tests/playwright/screenshots/${tab.file}-v2.png` });
    } else {
      await page.screenshot({ path: `tests/playwright/screenshots/${tab.file}-v2.png`, fullPage: false });
    }
  }

  // Screenshot dropdown
  const btn = page.locator('button', { hasText: 'Analysis' });
  await btn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/playwright/screenshots/dropdown-v2.png', fullPage: false });

  console.log('Done! Screenshots saved to tests/playwright/screenshots/');
  await page.waitForTimeout(5000);
  await browser.close();
})();
