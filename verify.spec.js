import { test, chromium } from '@playwright/test';
test('hover tooltip', async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ recordVideo: { dir: 'videos/' } });
  const page = await context.newPage();
  await page.goto('http://localhost:3000/bngplayground/umap.html');
  await page.waitForTimeout(3000);
  await page.mouse.move(500, 500);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'tooltip_hover.png' });
  await context.close();
  await browser.close();
});
