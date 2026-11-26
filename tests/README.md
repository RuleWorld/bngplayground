# Tests Directory

This directory contains the test suite for the BioNetGen Web Simulator.

## Running Tests

```bash
# Hang-safe fast unit gate (recommended for day-to-day / structural changes)
npm run test:fast

# Hang-safe full scientific suite (parity vs BNG2, CVODE, simulation)
npm run test:full:safe

# Run tests in watch mode
npm run test:watch

# Run specific test file
npx vitest run tests/network.spec.ts

# Run tests matching pattern
npx vitest run tests/*parity*.spec.ts
```

## Test Organization

### Core Validation Tests (Critical)

These tests validate correctness against BioNetGen reference implementation:

- **`bng2-comparison.spec.ts`** - ⭐ **CRITICAL** - Compares 62+ models against BNG2.pl GDAT outputs
- **`nauty-canonicalization.spec.ts`** - ⭐ **CRITICAL** - Validates Nauty graph canonicalization

### Parser Tests

- `parser-comprehensive.spec.ts` - Comprehensive ANTLR parser tests
- `bngl-pattern-validation.spec.ts` - BNGL pattern syntax validation
- `bngl-writer-strict-compat.spec.ts` - BNGL writer compatibility with BNG2.pl
- `parser/ExpressionEvaluation.test.ts` - Expression evaluation
- `parser/ExpressionPermutations.spec.ts` - Expression permutation handling
- `parser/GrammarStress.spec.ts` - Grammar stress tests

### Network & Graph Tests

- `network.spec.ts` - Network generation from reaction rules
- `integration_network_expansion.spec.ts` - Network expansion integration tests
- `graph/Canonicalization.spec.ts` - Graph canonicalization algorithms
- `graph/GraphPermutations.spec.ts` - Graph isomorphism and permutations
- `graph/PatternMatching.spec.ts` - Pattern matching algorithms

### Simulation Tests

- `simulation-comprehensive.spec.ts` - Comprehensive ODE/SSA simulation tests
- `polymer-sim.spec.ts` - Polymer model simulation
- `simulation/NetworkExpansionErrors.test.ts` - Network expansion error handling
- `simulation/SimulationOptions.spec.ts` - Simulation option parsing

### NFsim Tests

- `nfsim.spec.ts` - Basic NFsim integration
- `nfsim-parity.spec.ts` - NFsim output parity with reference
- `nfsim-compartment-e2e.spec.ts` - NFsim compartment support
- `services/NFsim*.spec.ts` (16 files) - Extensive NFsim service tests

### Parity Tests

Compare web simulator outputs against BioNetGen for specific model classes:

- `parity-compartment.spec.ts` - Compartment model parity
- `parity-polymer.spec.ts` - Polymer model parity
- `parity-polymer-wasm.spec.ts` - WASM polymer parity
- `parity-zap.spec.ts` - ZAP model parity
- `massive-parity.spec.ts` - Massive parity check across example models
- `mwc_parity.spec.ts` - MWC (Monod-Wyman-Changeux) model parity
- `compartment-transport-parity.spec.ts` - Compartment transport parity

### Analysis Feature Tests

- `analysis/ContactMap.spec.ts` - Contact map generation
- `analysis/ContactMapRepro.spec.ts` - Contact map reproduction tests
- `analysis/FIM.spec.ts` - Fisher Information Matrix (FIM) calculation
- `analysis/ParameterScan*.spec.ts` - Parameter scan analysis
- `analysis/RegulatoryGraph.spec.ts` - Regulatory graph generation

### Atomizer Tests

Tests for the Atomizer (SBML → BNGL compiler):

- `tests/atomizer/*.spec.ts` (15 files) - Atomizer validation and conversion tests
- Validation harness: `tests/atomizer/validation_harness.ts`

### Other Tests

- `examples.spec.ts` - Example models validation
- `model-repository-validation.spec.ts` - Model repository integrity
- `biomodels-import.spec.ts` - BioModels SBML import
- `sbml-*.spec.ts` - SBML import/export tests

## Test File Inclusion & Exclusions

`vitest.config.ts` includes:
- `tests/**/*.{test,spec}.{ts,tsx}`
- `src/**/*.{test,spec}.{ts,tsx}`
- `packages/engine/tests/**/*.{test,spec}.ts`
- `packages/mcp-server/tests/**/*.{test,spec}.ts`

Slow benchmark suites (`src/*benchmark*.test.ts`, `tests/profile-everything.spec.ts`), Playwright/a11y suites, debug/repro specs (`tests/debug-*.spec.ts`, `tests/*isolated*.spec.ts`, `tests/*repro*.spec.ts`, `tests/*spawnsync*.spec.ts`), and heavy BNG2/WASM parity specs are excluded from the fast default gate and run via `npm run test:full:safe`, `npm run test:reference`, or targeted `npx vitest run <file>`.

## Test Structure by Directory

```
tests/
├── *.spec.ts              # Root-level test suites (101 files)
├── a11y/                  # Accessibility tests (1 file)
├── analysis/              # Analysis feature tests (11 files)
├── atomizer/              # SBML Atomizer validation (15 files)
├── bionetgen-repo/        # BioNetGen corpus tests (1 file)
├── diagnostics/           # Diagnostic tests (2 files)
├── figure/                # Figure export tests (1 file)
├── fixtures/              # Test fixtures and shared data
├── graph/                 # Graph algorithm tests (4 files)
├── hooks/                 # React hook tests (2 files)
├── indra/                 # INDRA integration tests (1 file)
├── parser/                # Parser tests (4 files)
├── playwright/            # Playwright E2E tests (4 files)
├── services/              # Service tests (49 files)
├── simulation/            # Simulation tests (3 files)
├── ui/                    # UI component tests (8 files)
├── utils/                 # Utility tests (3 files)
├── validation/            # Validation helper tests (1 file)
└── visualization/         # Visualization tests (6 files)
```

## Import Paths

**Important**: Due to monorepo migration, tests should import from `packages/engine/src/`:

```typescript
// Core engine imports
import { BNGLParser } from '../packages/engine/src/services/graph/core/BNGLParser.ts';
import { NetworkGenerator } from '../packages/engine/src/services/graph/NetworkGenerator.ts';

// Root-level imports
import type { BNGLModel } from '../types.ts';
import { parseBNGL } from '../services/parseBNGL.ts';
```

## Test Configuration

Test configuration is in `vitest.config.ts`:

- **Timeout**: 5 minutes per test (300,000ms) for slow models
- **Hook timeout**: 60 seconds
- **Pool**: `forks` (avoid worker thread issues)
- **Sequence**: Sequential (no parallel execution)
- **Timers**: Real timers (no fakes)
- **Setup**: `tests/setup.ts` runs before all tests

## Writing New Tests

### Basic Test Structure

```typescript
import { describe, it, expect } from 'vitest';
import { parseBNGL } from '../services/parseBNGL';

describe('Feature Name', () => {
  it('should do something', async () => {
    const model = await parseBNGL('begin model ... end model');
    expect(model).toBeDefined();
  });
});
```

### Parity Test Pattern

```typescript
import { describe, it, expect } from 'vitest';
import { parseBNGL } from '../services/parseBNGL';
import { simulate } from '../services/simulation/SimulationLoop';
import * as fs from 'fs';

describe('Model Parity', () => {
  it('should match BNG2.pl output', async () => {
    const bnglText = fs.readFileSync('path/to/model.bngl', 'utf8');
    const model = await parseBNGL(bnglText);
    const result = await simulate(model);
    
    // Compare with reference GDAT
    const referenceGdat = fs.readFileSync('path/to/reference.gdat', 'utf8');
    // ... comparison logic
  });
});
```

## Continuous Integration

Tests run on every commit via GitHub Actions. Critical validation tests (`bng2-comparison`, `gdat-regression`, `nauty-canonicalization`) must pass for merges.

## Debugging Tests

### Run single test file
```bash
npx vitest run tests/network.spec.ts
```

### Run with debugging output
```bash
DEBUG=* npx vitest run tests/network.spec.ts
```

### Run specific test by name
```bash
npx vitest run -t "should generate correct network"
```

### Run excluded debug tests
```bash
npx vitest run tests/debug-matcher.spec.ts
```

## Test Data & Fixtures

- **`tests/fixtures/`** - Test fixtures and shared data (SBML cases, MCP routing intents, RuleHub search cases)
- **[RuleHub](https://github.com/ruleworld/rulehub)** - External canonical repository of published, tutorial, and example BNGL models (synced via `npm run sync-gallery`)
- **Local reference cache** (gitignored):
  - `bng_test_output/` - Precomputed `BNG2.pl` outputs for parity comparison (`npm run test:reference`)

## Common Test Patterns

### Testing Parser
```typescript
const model = await parseBNGL(bnglText);
expect(model.parameters).toHaveLength(expectedCount);
```

### Testing Network Generation
```typescript
const network = await generateExpandedNetwork(model);
expect(network.species).toHaveLength(expectedSpeciesCount);
```

### Testing Simulation
```typescript
const result = await simulate(model, { method: 'cvode', t_end: 100 });
expect(result.trajectories).toBeDefined();
```

### Comparing with BNG2.pl
```typescript
const webGdat = await generateWebGdat(model);
const bngGdat = fs.readFileSync('reference.gdat', 'utf8');
const tolerance = 1e-6;
compareGdatOutputs(webGdat, bngGdat, tolerance);
```
