import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => console.log(`[console][${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => console.log(`[pageerror]`, err));

  const urlCandidates = [process.env.URL, 'http://127.0.0.1:3001/bngplayground/', 'http://localhost:3001/bngplayground/', 'http://192.168.1.156:3001/bngplayground/', 'http://127.0.0.1:3000/bngplayground/', 'http://localhost:3000/bngplayground/', 'http://192.168.1.156:3000/bngplayground/'].filter(Boolean);
  let opened = false;
  for (const url of urlCandidates) {
    console.log('Trying', url);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 5000 });
      console.log('Opened', url);
      opened = true;
      break;
    } catch (err) {
      console.log('Failed to open', url, err.message);
    }
  }
  if (!opened) {
    console.log('Could not open any URL candidates');
    await browser.close();
    process.exit(1);
  }

  // Wait for the header button if present
  const btn = await page.$('button[title="Open model in VS Code"]');
  if (!btn) {
    console.log('Open in VS Code button not found on the page');
    await browser.close();
    process.exit(1);
  }

  // Click it
  console.log('Clicking Open in VS Code button');
  await btn.click();

  // Wait a bit for any errors to surface
  await page.waitForTimeout(2000);

  console.log('Done.');
  await browser.close();
})();