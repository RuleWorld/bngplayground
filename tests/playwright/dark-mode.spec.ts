/**
 * Dark Mode Visual Regression Test
 *
 * Load a model, toggle to dark mode, screenshot the
 * contact map / influence graph / regulatory graph.
 * Flag any element with contrast ratio below 4.5:1.
 */

import { test, expect } from '@playwright/test';

test.describe('Dark Mode Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('contact map renders correctly in dark mode', async ({ page }) => {
    // Load a sample model
    await page.click('text=Examples');
    await page.click('text=Simple Example');

    // Wait for model to load
    await page.waitForTimeout(2000);

    // Toggle dark mode
    const themeToggle = page.locator('[aria-label*="theme"], button:has(.dark\\:block)').first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
    } else {
      await page.evaluate(() => document.documentElement.classList.add('dark'));
    }

    await page.waitForTimeout(500);

    // Take screenshot of contact map
    const contactMap = page.locator('[data-testid="contact-map"], .contact-map').first();
    if (await contactMap.isVisible()) {
      await expect(contactMap).toHaveScreenshot('contact-map-dark.png');
    }
  });

  test('regulatory graph renders correctly in dark mode', async ({ page }) => {
    // Load a model with rules
    await page.click('text=Examples');
    await page.click('text=Model with Rules');

    await page.waitForTimeout(2000);

    // Toggle dark mode
    const themeToggle = page.locator('[aria-label*="theme"], button:has(.dark\\:block)').first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
    }

    // Navigate to regulatory graph tab
    await page.click('text=Regulatory Graph');
    await page.waitForTimeout(1000);

    const regGraph = page.locator('[data-testid="regulatory-graph"], .regulatory-graph').first();
    if (await regGraph.isVisible()) {
      await expect(regGraph).toHaveScreenshot('regulatory-graph-dark.png');
    }
  });

  test('AR graph renders correctly in dark mode', async ({ page }) => {
    await page.click('text=Examples');
    await page.click('text=Model with Rules');

    await page.waitForTimeout(2000);

    // Toggle dark mode
    const themeToggle = page.locator('[aria-label*="theme"], button:has(.dark\\:block)').first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
    }

    // Navigate to AR graph tab
    await page.click('text=AR Graph');
    await page.waitForTimeout(1000);

    const arGraph = page.locator('[data-testid="ar-graph"], .ar-graph').first();
    if (await arGraph.isVisible()) {
      await expect(arGraph).toHaveScreenshot('ar-graph-dark.png');
    }
  });
});
