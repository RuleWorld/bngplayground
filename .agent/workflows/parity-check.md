---
description: Run web parity check - compare simulator outputs against BNG2 reference
---

# Parity Check Workflow

This workflow compares simulator outputs against BNG2.pl reference data.

## Prerequisites

- Reference `.gdat`/`.net` files in `bng_test_output/` (or `BNG2.pl` installed via `pip install bionetgen`)
- For browser-level Playwright runs: dev server running (`npm run dev`) and Playwright Chromium installed (`npx playwright install chromium`)

## Steps

### 1. Compare against pre-generated BNG2 references

Run the reference output and network-shape checks:

```bash
npm run test:reference
npm run test:reference:net-shape
```

Note: These scripts use pre-generated reference files in `bng_test_output/` and do not invoke `BNG2.pl`.

### 2. (Optional) Generate fresh web CSV outputs via Playwright

```bash
npm run generate:web-output
```

### 3. (Optional) Regenerate BNG2 reference files

Only use this if you need to regenerate reference files from scratch:

```bash
npx tsx tools/validation/generate_bng_references.ts
```

Note: This calls `BNG2.pl` and may take time or timeout on complex models.

## Interpreting Results

| Status | Meaning |
| :--- | :--- |
| `OK` | Web output matches BNG2 reference within tolerance |
| `FAIL` | Significant deviation detected |
| `NOREF` | No reference GDAT file found in `bng_test_output/` |
| `ERROR` | Parsing or comparison error |
