---
description: Run web parity check - generate CSVs from all models and compare against BNG2 reference
---

# Parity Check Workflow

This workflow runs all models through the web simulator and compares the output against BNG2 reference data.

## Prerequisites

- Dev server must be running (`npm run dev`)
- Playwright must be installed (`npx playwright install chromium` if not)
- Reference GDAT files must exist in `bng_test_output/`

## Steps

### 1. Generate web output CSVs

// turbo
Run the batch model runner via Playwright to generate CSV output for all models:

```bash
npm run generate:web-output
```

This will:

- Open the app in a headless Chromium browser
- Execute `window.runAllModels()`
- Save CSV files to `web_output/`

Expected: ~92 CSV files generated, exit code 0

### 2. Compare against pre-generated BNG2 reference

// turbo
Run the comparison script to check web output against reference gdat files:

```bash
npx ts-node scripts/compare_outputs.ts
```

This will:

- Compare each observable across time points
- Report MATCH/MISMATCH for each model
- Write detailed JSON to `artifacts/SESSION_*/compare_results.after_refs.json`

Note: This script uses **pre-generated** reference files in `bng_test_output/` and does NOT call BNG2.pl.

### 3. (Alternative) Generate new BNG2 reference files

Only use this if you need to regenerate reference files from scratch:

```bash
node scripts/compare_gdat_output.mjs
```

⚠️ This calls BNG2.pl and may timeout on complex models.

### 4. Review results

Check the generated reports:

- Summary printed to console
- Detailed JSON: `artifacts/SESSION_*/compare_results.after_refs.json`

## Quick one-liner (after dev server is running)

// turbo-all

```bash
npm run generate:web-output && npx ts-node scripts/compare_outputs.ts
```

## Interpreting Results

| Status | Meaning |
| :--- | :--- |
| `OK` | Web output matches BNG2 reference within tolerance |
| `FAIL` | Significant deviation detected |
| `NOREF` | No reference GDAT file found in `bng_test_output/` |
| `ERROR` | Parsing or comparison error |

## Tolerance Settings (match as given in corresponding bngl file)
