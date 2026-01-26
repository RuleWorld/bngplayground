import { test, expect } from '@playwright/test';

test('Verify Wang2007 (BIOMD0000000145) BNGL Generation', async ({ page }) => {
  test.setTimeout(120000);

  // 1. Navigate to app
  await page.goto('http://localhost:3001/bngplayground/');

  // 2. Open "Load" menu and select "from BioModels"
  await page.getByRole('button', { name: 'Load' }).click();
  await page.getByText('from BioModels').click();

  // 3. Search and Import BIOMD0000000145
  await expect(page.getByText('Search BioModels')).toBeVisible();
  const searchInput = page.getByPlaceholder('e.g. BIOMD0000000001 or "calcium"');
  await searchInput.fill('BIOMD0000000145');
  await page.getByRole('button', { name: 'Search' }).click();
  
  const importButton = page.getByRole('button', { name: 'Import' }).first();
  await expect(importButton).toBeVisible({ timeout: 30000 });
  await importButton.click();

  // 4. Wait for code to be generated
  await expect(page.locator('.monaco-editor')).toBeVisible();
  
  // 5. Get Editor Content
  // Depending on how Monaco is rendered, getting value might be tricky via pure selectors.
  // We can try getting the value from the clipboard (Export -> BNGL) or accessing the window object if exposed.
  // Or checking for specific text elements in the editor DOM.
  
  // Simpler approach: Use the "Export" feature to copy to clipboard or reading the model from window state if possible.
  // Assuming window.bnglState is not easily accessible in this environment without exposing it.
  
  // Let's rely on the DOM text layers of Monaco, or simply use the export function to trigger a "download" or console log.
  // Actually, checking for the presence of specific text strings in the editor's view zone is usually reliable enough for "contains".
  
  // Wait for "begin model" to ensure it's loaded
  await expect(page.getByText('begin model', { exact: false })).toBeVisible({ timeout: 30000 });

  // 6. Verify Critical Fixes in BNGL
  
  // Fix 1: Compartment parameters should be `__compartment_Name__`
  // We expect to see lines like `__compartment_Cytosol__ 1` in parameters
  await expect(page.getByText('__compartment_Cytosol__', { exact: false }).first()).toBeVisible();

  // Fix 2: Assignment Rules should be functions
  // We expect dynamic parameters like Raplc to be defined as functions: `Raplc() = ...`
  // And usage in reaction rules should be `Raplc()`
  
  const editorText = await page.evaluate(() => {
    // Attempt to grab text from the editor model if possible, or fallback to body text
    // This is a bit hacky but if the editor is standard Monaco, we might get it from the DOM lines.
    // Better: let's try to access the global state if we can. 
    // If not, we scan the whole page text.
    return document.body.innerText;
  });

  console.log("Captured Text Snippet:", editorText.substring(0, 500));

  // Assertions on text content
  expect(editorText).toContain('__compartment_Cytosol__');
  
  // Check for function definition of parameter Raplc
  // It used to be `Raplc 0` in parameters. Now it should be logic-based or a function if it was an assignment rule.
  // Wait, if it's an assignment rule, it should NOT be in strict "parameters" block as a constant if we moved it to "functions".
  // OR it might be in both if we didn't filter it out, but the function definition `Raplc() = ...` must exist.
  // The user complained about `Raplc 0` in parameters.
  
  // Check for usage in reaction rules: `k2 * Raplc *` was the old one? 
  // Old: R3: Galpha_GTP()@Cytosol -> 0 __compartment_Cytosol__ * k2 * Raplc * Galpha_GTP
  // New expectation: `... * k2 * Raplc() * ...`
  
  // We can check for `Raplc()` string specifically.
  expect(editorText).toContain('Raplc()');
  
  // Check for the function definition block
  expect(editorText).toContain('begin functions');
  expect(editorText).toContain('Raplc() ='); 

});
