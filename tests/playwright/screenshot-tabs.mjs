// Quick script to screenshot each new tab for visual inspection
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/bngplayground/';

async function openTab(page, tabName) {
  // Click Analysis dropdown
  const btn = page.locator('button', { hasText: 'Analysis' });
  await btn.click();
  await page.waitForTimeout(300);
  // Click tab
  const item = page.locator(`text=${tabName}`).first();
  if (await item.isVisible({ timeout: 2000 })) {
    await item.click();
  }
  await page.waitForTimeout(1000);
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

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
    await page.screenshot({ path: `tests/playwright/screenshots/${tab.file}.png`, fullPage: false });
  }

  // Also screenshot the dropdown itself
  const btn = page.locator('button', { hasText: 'Analysis' });
  await btn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/playwright/screenshots/dropdown.png', fullPage: false });

  console.log('Done! Screenshots saved to tests/playwright/screenshots/');

  // Keep browser open for 30 seconds for manual inspection
  console.log('Browser will stay open for 30s...');
  await page.waitForTimeout(30000);
  await browser.close();
})();
