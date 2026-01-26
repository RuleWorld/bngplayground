
import { test, expect } from '@playwright/test';

test.describe('Zero Plot Reproduction', () => {
    test.beforeEach(async ({ page }) => {
        page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
        page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));
        
        try {
            await page.goto('http://localhost:3000', { timeout: 15000 });
            await page.waitForLoadState('networkidle');
        } catch (e) {
            console.error('Failed to load page:', e.message);
            throw e;
        }
    });

    test('simple AB model should show non-zero plot', async ({ page }) => {
        console.log('Starting test...');
        
        // Wait for editor to be stable
        const editor = page.locator('.monaco-editor textarea, textarea');
        await expect(editor.first()).toBeVisible({ timeout: 15000 });
        
        const editorFirst = editor.first();
        await editorFirst.focus();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        
        const bngl = `
begin parameters
  A0 100
  B0 100
  ka 0.01
  kd 1
end parameters
begin molecule types
  A(b)
  B(a)
end molecule types
begin seed species
  A(b) A0
  B(a) B0
end seed species
begin observables
  Molecules A A(b)
  Molecules B B(a)
  Molecules C A(b!1).B(a!1)
end observables
begin reaction rules
  A(b) + B(a) <-> A(b!1).B(a!1) ka, kd
end reaction rules
`;
        await editorFirst.fill(bngl);
        console.log('BNGL filled into editor');
        
        // Wait for parser to catch up (look for "Parsed" indicator)
        await page.waitForSelector('text=Parsed', { timeout: 15000 });
        console.log('Model parsed');
        
        // Click Run/Simulate
        const runButton = page.locator('button:has-text("Run"), button:has-text("Simulate")').first();
        await runButton.click();
        console.log('Run button clicked');
        
        // Wait for results
        await page.waitForTimeout(10000); 
        
        // Check for the plot
        const plotContainer = page.locator('.plot-container, canvas, svg, .recharts-surface').first();
        await expect(plotContainer).toBeVisible({ timeout: 20000 });
        console.log('Plot container visible');
        
        // Take a screenshot
        await page.screenshot({ path: 'tests/zero-plot-check.png' });
        
        const labels = await page.locator('text').allInnerTexts();
        console.log('Detected labels:', labels);
        
        const nonZeroLabels = labels.filter(l => {
            const val = parseFloat(l);
            return !isNaN(val) && val > 0 && val < 200; // Expected concentrations around 100
        });
        
        console.log('Non-zero labels found:', nonZeroLabels);
        
        // If we found non-zero labels on the chart, it's likely working
        if (nonZeroLabels.length === 0) {
            throw new Error('No non-zero labels found in plot! Points are at zero.');
        }
    });
});
