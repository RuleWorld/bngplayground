import { test, expect } from '@playwright/test';

test('reproduce sbml import timeout', async ({ page }) => {
    // Capture page console logs
    page.on('console', msg => {
        process.stdout.write(`[Browser Console] ${msg.type()}: ${msg.text()}\n`);
    });

    // Capture worker console logs (Atomic SBML import happens here)
    page.on('worker', worker => {
        process.stdout.write(`[Worker Started] ${worker.url()}\n`);
        worker.on('console', msg => {
            process.stdout.write(`[Worker Console] ${msg.type()}: ${msg.text()}\n`);
        });
    });

    // Navigate to app
    await page.goto('http://localhost:3000/bngplayground/');

    // Wait for app to load
    await page.waitForTimeout(2000);

    // Open "Import from BioModels" modal
    try {
        process.stdout.write('[Test] Clicking Help & Resources icon...\n');
        await page.locator('button[title="Help & Resources"]').click();
        
        process.stdout.write('[Test] Clicking Import from BioModels menu item...\n');
        await page.waitForTimeout(500); // Give dropdown a moment to animate
        await page.getByRole('menuitem', { name: /import from biomodels/i }).click();

        process.stdout.write('[Test] Waiting for modal...\n');
        await expect(page.getByText('Enter a BioModels model ID')).toBeVisible({ timeout: 15000 });

        const modelId = 'BIOMD0000000964';
        process.stdout.write(`[Test] Filling model ID: ${modelId}\n`);
        await page.getByPlaceholder('BioModels ID').fill(modelId);

        process.stdout.write('[Test] Clicking Fetch & Import...\n');
        await page.getByRole('button', { name: 'Fetch & Import' }).click();

        process.stdout.write('[Test] Waiting for success message (this may take a while)....\n');
        await expect(page.getByText('SBML imported successfully!')).toBeVisible({ timeout: 120000 });
        process.stdout.write('[Test] Success! Import complete.\n');
    } catch (e) {
        process.stdout.write(`[Test] FAILED: ${e}\n`);
        await page.screenshot({ path: 'tests/failure_import.png' });
        process.stdout.write('[Test] Screenshot saved to tests/failure_import.png\n');
        throw e;
    }
});
