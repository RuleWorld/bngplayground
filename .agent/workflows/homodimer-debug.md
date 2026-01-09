---
description: Debug homodimer counting issues in observable matching
---

# Homodimer Debug Workflow

This workflow helps diagnose and fix 50% error mismatches caused by homodimer counting bugs.

## When to Use

Use this workflow when you see:

- Exactly **50% relative error** on dimer/homodimer observables
- Affected models: `blinov_2006`, `egfr_simple`, `fceri_ji`, `fceri_viz`
- Web counts are exactly half of BNG2 reference counts

## Root Cause

BNG2.pl counts each **complex** containing the pattern as 1, while the web simulator may count individual molecule instances. For dimers like `A.A`, BNG2 counts 1 (one complex), but web might count 2 (two A molecules).

## Diagnosis Steps

### 1. Run parity check on affected model

Use `/parity-check` first to confirm the 50% error pattern.

### 2. Check observable type

```bash
grep -n "Dimers\|homodimer" public/models/<model>.bngl
```

Look for observables with patterns like `A().A()` or count constraints.

### 3. Examine countPatternMatches function

// turbo

```bash
grep -n "countPatternMatches" services/bnglWorker.ts
```

### 4. Test fix in isolation

Create a minimal test case in `tests/stat-factors.spec.ts` with:

- A homodimer species: `A().A()`
- An observable counting dimers
- Verify count is 1, not 2

## Fix Pattern

For `Molecules` observables on symmetric complexes, the count should be:

- `count = number of matching subgraphs / symmetry factor`

## Verification

After fixing, run:

```bash
npm run generate:web-output && npx ts-node scripts/compare_outputs.ts
```

Expected: `blinov_2006`, `egfr_simple`, `fceri_ji`, `fceri_viz` should change from FAIL to OK.

## Related Workflows

- [`/parity-check`](file:///c:/Users/Achyudhan/OneDrive%20-%20University%20of%20Pittsburgh/Desktop/Achyudhan/School/PhD/Research/BioNetGen/bionetgen-web-simulator/.agent/workflows/parity-check.md) - Full model comparison
- [`/code-review`](file:///c:/Users/Achyudhan/OneDrive%20-%20University%20of%20Pittsburgh/Desktop/Achyudhan/School/PhD/Research/BioNetGen/bionetgen-web-simulator/.agent/workflows/code-review.md) - Code quality check
