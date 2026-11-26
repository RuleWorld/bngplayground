---
description: Debug compartment (cBNGL) parity issues
---

# cBNGL Debug Workflow

This workflow helps diagnose compartment-related mismatches for cBNGL models.

## When to Use

Use this workflow when you see:

- 100% or large errors on compartment-specific observables
- Affected models: `cbngl_simple`, `organelle_transport`, `organelle_transport_struct`
- Observables with `@compartment` prefixes showing discrepancies

## Root Cause

cBNGL (compartmental BNGL) adds:

1. Volume scaling for bimolecular reactions
2. Compartment-prefixed species names (e.g., `@PM::R(l,tf~Y)`)
3. Compartment-specific observable matching

## Diagnosis Steps

### 1. Run parity check

Use `/parity-check` (or `npm run test:reference`) to confirm the error pattern.

### 2. Inspect compartment definitions and observables

Locate the model in your local RuleHub checkout (`../RuleHub` or via `tools/rulehubLocal.ts`) and check its `begin compartments` and `begin observables` blocks.

### 3. Debug volume scaling

```bash
grep -n "getVolumeScalingInfo\|scalingVolume" packages/engine/src/services/graph/NetworkGenerator.ts packages/engine/src/services/simulation/NetworkExpansion.ts
```

## Key Functions to Check

1. **Volume scaling** in `packages/engine/src/services/graph/NetworkGenerator.ts` and `packages/engine/src/services/simulation/NetworkExpansion.ts`
2. **Compartment prefix parsing** in `packages/engine/src/services/graph/core/BNGLParser.ts`
3. **Observable matching** in `packages/engine/src/services/simulation/SimulationLoop.ts` for `@comp::Species` syntax

## Verification

After fixing, run:

```bash
npm run test:full:safe
npm run test:reference
```

## Related Workflows

- [`/parity-check`](./parity-check.md) - Full model comparison
- [`/homodimer-debug`](./homodimer-debug.md) - Homodimer issues
