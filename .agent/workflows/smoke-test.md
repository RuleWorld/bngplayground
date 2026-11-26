---
description: Quick smoke test for simulation accuracy after changes
---

# Smoke Test Workflow

A fast sanity check to verify core simulation functionality after code changes.

## When to Use

Use before committing changes, especially after modifying:

- `services/bnglWorker.ts`
- `packages/engine/src/parser/BNGLVisitor.ts`
- `packages/engine/src/services/graph/NetworkGenerator.ts`
- `packages/engine/src/services/graph/core/Matcher.ts`

## Steps

### 1. Type check (fast)

```bash
npm run type-check
```

Expected: No errors in modified files.

### 2. Run fast unit test gate

```bash
npm run test:fast
```

Expected: All tests pass cleanly without hanging.

### 3. (Optional) Full scientific suite & parity check

For any change that can affect numerical output:

```bash
npm run test:full:safe
npm run test:reference
```

## Quick One-Liner

```bash
npm run type-check && npm run test:fast
```

## If Tests Fail

1. Check git diff to identify recent changes:

   ```bash
   git diff HEAD --stat
   ```

2. Run specific debug workflow:
   - 50% errors → `/homodimer-debug`
   - cBNGL errors → `/cbngl-debug`
   - Build errors → `/code-review`

## Related Workflows

- [`/parity-check`](./parity-check.md) - Full comparison
- [`/code-review`](./code-review.md) - Code quality
