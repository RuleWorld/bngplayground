---
description: Debug homodimer counting issues in observable matching
---

# Homodimer Debug Workflow

This workflow helps diagnose and fix 50% error mismatches caused by homodimer counting bugs.

## When to Use

Use this workflow when you see:

- Exactly **50% relative error** on dimer/homodimer observables
- Affected models: `blinov_2006`, `egfr_simple`, `fceri_ji`, `fceri_viz`
- Web counts are half or double BNG2 reference counts

## Root Cause

BNG2.pl counts each **complex** containing the pattern as 1 for `Species` observables and adjusts symmetric patterns by their automorphism factor. See `docs/engineering/bng2-stat-factor-derivation.md` and `docs/engineering/stat-factor-finding.md` before altering symmetry factors.

## Diagnosis Steps

### 1. Run parity check on affected model

Use `/parity-check` or `npm run test:reference` to confirm the error pattern.

### 2. Inspect observable patterns

Check whether the model defines `Molecules` or `Species` observables with symmetric patterns like `A().A()` or count constraints.

### 3. Examine pattern matching and symmetry handling

```bash
grep -n "countPatternMatches\|getPatternAutomorphismFactor\|patternAutomorphismFactor" packages/engine/src/services/graph/NetworkGenerator.ts packages/engine/src/services/graph/core/Matcher.ts
```

### 4. Test fix in isolation

Add or run a minimal regression test in `tests/stat-factors.spec.ts`.

## Verification

After fixing, run:

```bash
npm run test:full:safe
npm run test:reference
```

## Related Workflows

- [`/parity-check`](./parity-check.md) - Full model comparison
- [`/code-review`](./code-review.md) - Code quality check
