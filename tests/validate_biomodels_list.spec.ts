import { test, expect } from '@playwright/test';

const MODELS_TO_VALIDATE = [
    { id: 'BIOMD0000000059', name: 'Fridlyand2003_Calcium_flux' },
    { id: 'BIOMD0000000964', name: 'Mwalili2020 - SEIR model of COVID-19' },
    { id: 'BIOMD0000000295', name: 'Akman2008_Circadian_Clock_Model1' },
    { id: 'BIOMD0000000066', name: 'Chassagnole2001_Threonine Synthesis' },
    { id: 'BIOMD0000000968', name: 'Palmer2008 - Negative Feedback' },
    { id: 'BIOMD0000000145', name: 'Wang2007 - ATP induced ... Oscillation' },
    { id: 'BIOMD0000000969', name: 'Cuadros2020 - SIHRD COVID-19 Ohio' },
    { id: 'BIOMD0000000970', name: 'Hou2020 - SEIR COVID-19 Wuhan' },
    { id: 'BIOMD0000000063', name: 'Galazzo1990_FermentationPathwayKinetics' },
    { id: 'BIOMD0000000049', name: 'Sasagawa2005_MAPK' }
];

test.describe('BioModels Validation Suite', () => {

    for (const model of MODELS_TO_VALIDATE) {
        test(`should successfully import ${model.id} (${model.name})`, async ({ page }) => {
            // Increase timeout for large models/downloads
            test.setTimeout(180000);

            // 1. Navigate to app
            await page.goto('http://localhost:3001/bngplayground/');

            // 2. Open "Load" menu and select "from BioModels"
            await page.getByRole('button', { name: 'Load' }).click();
            await page.getByText('from BioModels').click();

            // 3. Wait for modal
            await expect(page.getByText('Search BioModels')).toBeVisible();

            // 4. Input Model ID
            const searchInput = page.getByPlaceholder('e.g. BIOMD0000000001 or "calcium"');
            await searchInput.fill(model.id);
            await page.getByRole('button', { name: 'Search' }).click();

            // 5. Click "Import" on the result
            // The search might return multiple versions or files, usually the first one or exact match is what we want.
            // We look for a button that implies importing the specific result.
            const importButton = page.getByRole('button', { name: 'Import' }).first();
            await expect(importButton).toBeVisible({ timeout: 30000 });
            await importButton.click();

            // 6. Verify Import Success
            // We expect the editor to be populated with BNGL content.
            // "begin model" is a standard BNGL start block.
            // We assume the import navigates or closes the modal and shows the editor.

            // Wait for "Atomization complete" notification or editor content update
            // Checking for the editor content is most robust.
            // The editor is usually a Monaco editor, but we can check for text content in the DOM if available,
            // or check if the 'Code' tab is active and contains text.

            // We can also check for console logs if we could, but UI is better.
            // Let's assume the editor text area or a specific element contains the code.
            // Based on previous tests, we can check for text.

            await expect(page.locator('.monaco-editor')).toBeVisible();

            // Poll for content change from default or empty
            await expect(async () => {
                const editorContent = await page.inputValue('textarea.inputarea');
                // Note: Monaco's textarea might be hidden/used for input. 
                // Better to check the visible lines if possible, or use a specific known string.
                // Wait, previous test checked `page.evaluate(() => window.bnglState?.code)`. 
                // If that's not available, we rely on visible text.

                // Let's check for "begin model" text which should be rendered in the lines
                const content = await page.getByText('begin model').first();
                await expect(content).toBeVisible();
            }).toPass({ timeout: 120000 });

            console.log(`[Test] Successfully imported ${model.id}`);
        });
    }
});
