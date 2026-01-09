---
description: Quick smoke test for simulation accuracy after changes
---

# Smoke Test Workflow

A fast sanity check to verify core simulation functionality after code changes.

## When to Use

Use before committing changes, especially after modifying:

- `services/bnglWorker.ts`
- `src/parser/BNGLVisitor.ts`
- `src/services/graph/NetworkGenerator.ts`
- `src/services/graph/core/Matcher.ts`

## Steps

### 1. Type check (fast)

// turbo

```bash
npm run type-check 2>&1 | Select-Object -Last 30
```

Expected: No errors in modified files.

### 2. Run quick model test

// turbo

```bash
npx vitest run src/filtered_benchmark.test.ts --reporter=verbose 2>&1 | Select-Object -Last 50
```

Expected: All tests pass.

### 3. (Optional) Full parity check

If smoke test passes, run `/parity-check` for full validation:

```bash
npm run generate:web-output && npx ts-node scripts/compare_outputs.ts
```

## Quick One-Liner

// turbo-all

```bash
npm run type-check && npx vitest run src/filtered_benchmark.test.ts --reporter=verbose
```

## If Tests Fail

1. Check git diff to identify recent changes:

   ```bash
   git diff HEAD~1 --stat
   ```

2. Run specific debug workflow:
   - 50% errors → `/homodimer-debug`
   - cBNGL errors → `/cbngl-debug`
   - Build errors → `/code-review`

## Related Workflows

- [`/parity-check`](file:///c:/Users/Achyudhan/OneDrive%20-%20University%20of%20Pittsburgh/Desktop/Achyudhan/School/PhD/Research/BioNetGen/bionetgen-web-simulator/.agent/workflows/parity-check.md) - Full comparison
- [`/code-review`](file:///c:/Users/Achyudhan/OneDrive%20-%20University%20of%20Pittsburgh/Desktop/Achyudhan/School/PhD/Research/BioNetGen/bionetgen-web-simulator/.agent/workflows/code-review.md) - Code quality
