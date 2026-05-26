import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('WCAG 2.1 AA Accessibility Audit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('[data-testid="editor-panel"], .monaco-editor', { timeout: 30000 });
  });

  test('should pass accessibility audit in light mode', async ({ page }) => {
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should pass accessibility audit in dark mode', async ({ page }) => {
    // Toggle dark mode
    const themeToggle = page.locator('[aria-label*="theme"], [aria-label*="dark"], button:has(.dark\\:block)').first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
    } else {
      // Fallback: set dark class on document
      await page.evaluate(() => document.documentElement.classList.add('dark'));
    }

    await page.waitForTimeout(500); // Wait for theme transition

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('tab navigation should work correctly', async ({ page }) => {
    // Focus the first interactive element
    await page.keyboard.press('Tab');

    // Check that focus is visible
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();

    // Tab through several elements
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const tagName = await page.evaluate(() => document.activeElement?.tagName);
      expect(['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'A'].includes(tagName || '')).toBeTruthy();
    }
  });

  test('modal focus trap works correctly', async ({ page }) => {
    // Open a modal (e.g., click help or about)
    const helpButton = page.locator('button:has-text("Help"), button:has-text("About"), [aria-label*="help"]').first();
    if (await helpButton.isVisible()) {
      await helpButton.click();

      // Check that focus is trapped inside modal
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible();

      // Tab to the last element and press Tab again - should wrap to first
      await modal.press('Tab');
      // Focus should still be within modal
      const focusedInModal = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        return modal?.contains(document.activeElement);
      });
      expect(focusedInModal).toBeTruthy();
    }
  });
});
