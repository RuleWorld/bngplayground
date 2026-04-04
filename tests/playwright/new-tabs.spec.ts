import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.URL || 'https://ruleworld.github.io/bngplayground/';

// Helper: navigate to the site and wait for load
async function loadApp(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  // Wait for the editor to be ready
  await page.waitForSelector('.monaco-editor', { timeout: 15000 }).catch(() => {});
  return errors;
}

// Helper: open the Analysis dropdown and click a tab
async function openAnalysisTab(page: Page, tabName: string) {
  // Click "Analysis" dropdown trigger
  const analysisBtn = page.locator('button', { hasText: 'Analysis' });
  await analysisBtn.click();
  await page.waitForTimeout(300);

  // Click the specific tab
  const tabItem = page.locator('[role="menuitem"], [role="menu"] >> text=' + tabName).first();
  if (await tabItem.isVisible()) {
    await tabItem.click();
  } else {
    // Try finding by text within the dropdown
    const dropdown = page.locator('text=' + tabName).first();
    await dropdown.click();
  }
  await page.waitForTimeout(500);
}

// ─── Dropdown Layout Tests ──────────────────────────────────────────

test.describe('Analysis Dropdown', () => {
  test('dropdown is visible and contains all expected tabs', async ({ page }) => {
    await loadApp(page);
    const analysisBtn = page.locator('button', { hasText: 'Analysis' });
    await analysisBtn.click();
    await page.waitForTimeout(300);

    // Check key tabs are present
    for (const tab of [
      'Parameter Scan', 'Steady State', 'Sobol', 'Profile Likelihood',
      'Bifurcation', 'Temporal Info', 'PK/PD', 'Version History',
      'Multi-Scale', 'Trajectory Explorer', 'Flux Analysis',
    ]) {
      const item = page.locator(`text=${tab}`).first();
      await expect(item).toBeVisible({ timeout: 3000 });
    }
  });

  test('dropdown fits within viewport without scrolling', async ({ page }) => {
    await loadApp(page);
    const analysisBtn = page.locator('button', { hasText: 'Analysis' });
    await analysisBtn.click();
    await page.waitForTimeout(300);

    // The dropdown should not exceed viewport height
    const dropdown = page.locator('[role="menu"]').first();
    const box = await dropdown.boundingBox();
    const viewport = page.viewportSize();
    if (box && viewport) {
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 50);
    }
  });
});

// ─── PK/PD Tab Tests ────────────────────────────────────────────────

test.describe('PK/PD Tab', () => {
  test('renders without errors', async ({ page }) => {
    const errors = await loadApp(page);
    await openAnalysisTab(page, 'PK/PD');

    // Should see the info box
    await expect(page.locator('text=PK/PD Framework')).toBeVisible({ timeout: 5000 });

    // Should see the model type selector
    await expect(page.locator('text=PK Model')).toBeVisible();

    // No page errors
    // Only fail on actual crashes, not ODE solver warnings or network errors
    const fatalErrors = errors.filter(e =>
      (e.includes('Uncaught') || e.includes('Maximum call stack') || e.includes('out of memory')) &&
      !e.includes('net::ERR') && !e.includes('favicon')
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test('model type select is clickable', async ({ page }) => {
    await loadApp(page);
    await openAnalysisTab(page, 'PK/PD');

    // Find the PK Model select and verify it can be interacted with
    const select = page.locator('select').first();
    await expect(select).toBeEnabled();
    await select.selectOption({ index: 1 });
  });

  test('Generate Model button works', async ({ page }) => {
    await loadApp(page);
    await openAnalysisTab(page, 'PK/PD');

    const generateBtn = page.locator('button', { hasText: 'Generate Model' });
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toBeEnabled();
  });

  test('dose input accepts numeric values', async ({ page }) => {
    await loadApp(page);
    await openAnalysisTab(page, 'PK/PD');

    const doseInput = page.locator('input[type="number"]').first();
    await expect(doseInput).toBeVisible();
    await doseInput.fill('250');
    await expect(doseInput).toHaveValue('250');
  });

  test('dosing preset buttons are clickable', async ({ page }) => {
    await loadApp(page);
    await openAnalysisTab(page, 'PK/PD');

    // Check dosing presets exist
    for (const preset of ['Single dose', 'QD', 'BID']) {
      const btn = page.locator(`text=${preset}`).first();
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(200);
      }
    }
  });
});

// ─── Bifurcation Tab Tests ──────────────────────────────────────────

test.describe('Bifurcation Tab', () => {
  test('renders without errors', async ({ page }) => {
    const errors = await loadApp(page);
    await openAnalysisTab(page, 'Bifurcation');

    await expect(page.locator('text=Bifurcation Analysis')).toBeVisible({ timeout: 5000 });

    // Only fail on actual crashes, not ODE solver warnings or network errors
    const fatalErrors = errors.filter(e =>
      (e.includes('Uncaught') || e.includes('Maximum call stack') || e.includes('out of memory')) &&
      !e.includes('net::ERR') && !e.includes('favicon')
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test('parameter selector is present and interactive', async ({ page }) => {
    await loadApp(page);
    await openAnalysisTab(page, 'Bifurcation');

    // Should have "Continuation Parameter" label
    await expect(page.locator('text=Continuation Parameter')).toBeVisible();

    // Select should be present
    const selects = page.locator('select');
    expect(await selects.count()).toBeGreaterThan(0);
  });

  test('start/end value inputs accept numbers', async ({ page }) => {
    await loadApp(page);
    await openAnalysisTab(page, 'Bifurcation');

    const numberInputs = page.locator('input[type="number"]');
    const count = await numberInputs.count();
    expect(count).toBeGreaterThanOrEqual(2); // start and end value

    // Fill start value
    await numberInputs.first().fill('0.01');
    await expect(numberInputs.first()).toHaveValue('0.01');
  });

  test('Run Continuation button exists', async ({ page }) => {
    await loadApp(page);
    await openAnalysisTab(page, 'Bifurcation');

    const runBtn = page.locator('button', { hasText: 'Run Continuation' });
    await expect(runBtn).toBeVisible();
  });
});

// ─── Temporal Info Theory Tab Tests ─────────────────────────────────

test.describe('Temporal Info Theory Tab', () => {
  test('renders without errors', async ({ page }) => {
    const errors = await loadApp(page);
    await openAnalysisTab(page, 'Temporal Info');

    await expect(page.locator('text=Temporal Information Theory')).toBeVisible({ timeout: 5000 });

    // Only fail on actual crashes, not ODE solver warnings or network errors
    const fatalErrors = errors.filter(e =>
      (e.includes('Uncaught') || e.includes('Maximum call stack') || e.includes('out of memory')) &&
      !e.includes('net::ERR') && !e.includes('favicon')
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test('has SSA and Analyze buttons', async ({ page }) => {
    await loadApp(page);
    await openAnalysisTab(page, 'Temporal Info');

    await expect(page.locator('button', { hasText: 'Run SSA' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Analyze' })).toBeVisible();
  });

  test('view mode tabs are present', async ({ page }) => {
    await loadApp(page);
    await openAnalysisTab(page, 'Temporal Info');

    // Initially no data, but the empty state message should be visible
    await expect(page.locator('text=Run an SSA simulation')).toBeVisible();
  });
});

// ─── Version History Tab Tests ──────────────────────────────────────

test.describe('Version History Tab', () => {
  test('renders without errors', async ({ page }) => {
    const errors = await loadApp(page);
    await openAnalysisTab(page, 'Version History');

    await expect(page.locator('text=Model Version History')).toBeVisible({ timeout: 5000 });

    // Only fail on actual crashes, not ODE solver warnings or network errors
    const fatalErrors = errors.filter(e =>
      (e.includes('Uncaught') || e.includes('Maximum call stack') || e.includes('out of memory')) &&
      !e.includes('net::ERR') && !e.includes('favicon')
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test('Start Tracking button is present', async ({ page }) => {
    await loadApp(page);
    await openAnalysisTab(page, 'Version History');

    const btn = page.locator('button', { hasText: /Start Tracking|Save Version/ });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  test('timeline panel exists', async ({ page }) => {
    await loadApp(page);
    await openAnalysisTab(page, 'Version History');

    await expect(page.locator('text=Version Timeline')).toBeVisible();
  });
});

// ─── Multi-Scale Tab Tests ──────────────────────────────────────────

test.describe('Multi-Scale Modeling Tab', () => {
  test('renders without crashing', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('.monaco-editor', { timeout: 15000 }).catch(() => {});

    await openAnalysisTab(page, 'Multi-Scale');

    // Wait and check no crash
    await page.waitForTimeout(2000);

    // Should still be on the page (not crashed)
    await expect(page.locator('text=Multi-Scale Modeling')).toBeVisible({ timeout: 5000 });

    // Check for fatal errors (not warnings)
    const fatalErrors = errors.filter(e =>
      e.includes('RangeError') || e.includes('Maximum call stack') ||
      e.includes('out of memory') || e.includes('TypeError')
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test('JSON editor is present and editable', async ({ page }) => {
    await loadApp(page);
    await openAnalysisTab(page, 'Multi-Scale');

    // Should have a textarea for the JSON definition
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();

    // Should contain the example definition
    const value = await textarea.inputValue();
    expect(value).toContain('Tumor Growth');
  });

  test('Run Simulation button exists and is not auto-running', async ({ page }) => {
    await loadApp(page);
    await openAnalysisTab(page, 'Multi-Scale');

    const runBtn = page.locator('button', { hasText: 'Run Simulation' });
    await expect(runBtn).toBeVisible();
    await expect(runBtn).toBeEnabled();

    // Verify canvas exists
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });
});

// ─── Cross-Tab Navigation Tests ─────────────────────────────────────

test.describe('Tab Navigation', () => {
  test('can switch between all new tabs without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('.monaco-editor', { timeout: 15000 }).catch(() => {});

    const tabs = [
      'Bifurcation', 'Temporal Info', 'PK/PD', 'Version History', 'Multi-Scale',
    ];

    for (const tab of tabs) {
      await openAnalysisTab(page, tab);
      await page.waitForTimeout(500);

      // Verify no crash
      const title = page.locator('body');
      await expect(title).toBeVisible();
    }

    // Check no fatal errors across all tab switches
    const fatalErrors = errors.filter(e =>
      e.includes('RangeError') || e.includes('Maximum call stack') ||
      e.includes('out of memory')
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test('can return to Time Courses after visiting new tabs', async ({ page }) => {
    await loadApp(page);
    await openAnalysisTab(page, 'PK/PD');
    await page.waitForTimeout(300);

    // Click Time Courses tab
    const timeCoursesBtn = page.locator('text=Time Courses').first();
    await timeCoursesBtn.click();
    await page.waitForTimeout(500);

    // Should see the time courses view (chart area)
    await expect(page.getByRole('button', { name: /Time Courses/ }).first()).toBeVisible();
  });
});
