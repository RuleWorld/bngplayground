---
description: Triple Gate code healer - sequentially verify lint, type-check, and tests
---

# Code Healer Workflow (`/healer`)

This workflow runs a "Triple Gate" check: linting, type checking, and unit tests.

## When to Use

Use this workflow to quickly validate and clean up lint, type, or test failures.

## Triple Gate Process

### Gate 1: Linting

```bash
npm run lint
```

Fix reported issues and re-run `npm run lint`.

### Gate 2: Type Checking

```bash
npm run type-check
```

Fix reported TypeScript errors and re-run `npm run type-check`.

### Gate 3: Unit Testing

```bash
npm run test:fast
```

For number-affecting engine changes, run `npm run test:full:safe` instead.

## Master Command

```bash
npm run lint && npm run type-check && npm run test:fast
```
