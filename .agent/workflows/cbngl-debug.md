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

Use `/parity-check` to confirm the error pattern.

### 2. Check compartment definitions

```bash
grep -n "begin compartments" public/models/<model>.bngl
```

### 3. Check observable patterns

```bash
grep -n "Observables" -A 20 public/models/<model>.bngl
```

### 4. Debug volume scaling

// turbo

```bash
grep -n "getVolumeScale" services/bnglWorker.ts src/services/graph/NetworkGenerator.ts
```

## Key Functions to Check

1. **`getVolumeScale`** in `NetworkGenerator.ts` - bimolecular rate scaling
2. **Compartment prefix parsing** in `BNGLParser.ts`
3. **Observable matching** in `bnglWorker.ts` for `@comp::Species` syntax

## Verification

After fixing, run:

```bash
npm run generate:web-output && npx ts-node scripts/compare_outputs.ts
```

Expected: `cbngl_simple` should change from FAIL to OK.

## Related Workflows

- [`/parity-check`](file:///c:/Users/Achyudhan/OneDrive%20-%20University%20of%20Pittsburgh/Desktop/Achyudhan/School/PhD/Research/BioNetGen/bionetgen-web-simulator/.agent/workflows/parity-check.md) - Full model comparison
- [`/homodimer-debug`](file:///c:/Users/Achyudhan/OneDrive%20-%20University%20of%20Pittsburgh/Desktop/Achyudhan/School/PhD/Research/BioNetGen/bionetgen-web-simulator/.agent/workflows/homodimer-debug.md) - Homodimer issues
