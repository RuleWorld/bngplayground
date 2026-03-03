# Tests Directory

This directory contains the test suite for the BioNetGen Web Simulator.

## Running Tests

```bash
# Run all tests
npm run test

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
- **`gdat-regression.spec.ts`** - ⭐ **CRITICAL** - Regression tests against stored GDAT fixtures
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

Tests for the Atomizer (natural language → BNGL compiler):

- `atomizer/*.spec.ts` (13 files) - Atomizer validation and conversion tests
- Located in: `tests/atomizer/`
- Validation harness: `tests/atomizer/validation_harness.ts`

### Other Tests

- `examples.spec.ts` - Example models validation
- `model-repository-validation.spec.ts` - Model repository integrity
- `biomodels-import.spec.ts` - BioModels SBML import
- `sbml-*.spec.ts` - SBML import/export tests

## Test File Naming

The test suite uses two naming conventions:

### `*.spec.ts` (Included in `npm run test`)
Standard test files that run as part of the main test suite.

### `*.test.ts` (NOT included in default run)
Additional test files that must be run explicitly. These exist but are not in `vitest.config.ts` include pattern.

**Note**: Files in `src/*.test.ts` are NOT included in the vitest config and must be run manually:
- `src/gdat_benchmark.test.ts`
- `src/diagnostic_benchmark.test.ts`
- `src/published_benchmark.test.ts`
- `src/parser_regression.test.ts`
- `src/normalization_test.test.ts`

## Excluded Test Files

Per `vitest.config.ts`, these patterns are explicitly excluded from `npm run test`:

- `tests/debug-*.spec.ts` - Debug tests (run explicitly when needed)
- `tests/*isolated*.spec.ts` - Isolated reproduction tests
- `tests/*repro*.spec.ts` - Reproduction tests for specific bugs
- `tests/*spawnsync*.spec.ts` - Spawn sync tests

These can be run individually:
```bash
npx vitest run tests/debug-matcher.spec.ts
```

## Test Structure by Directory

```
tests/
├── *.spec.ts              # Main test suite (46 files)
├── *.test.ts              # Additional tests not in config (17 files)
├── analysis/              # Analysis feature tests (8 files)
├── atomizer/              # Atomizer validation (13 files)
│   └── validation_harness.ts
├── diagnostics/           # Diagnostic tests (2 files)
├── fixtures/              # Test fixtures and data
│   └── validation_models.ts
├── graph/                 # Graph algorithm tests (3 files)
├── pac/                   # PAC (Pattern Action Context) tests
├── parser/                # Parser tests (3 files)
├── playwright/            # Playwright E2E tests (1 file)
├── services/              # Service tests (33 files)
├── simulation/            # Simulation tests (4 files)
├── ui/                    # UI component tests (2 files)
└── visualization/         # Visualization tests (5 files)
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

- **`tests/fixtures/`** - Test fixtures and shared data
  - `validation_models.ts` - List of validation models
- **`example-models/`** (root) - 175+ BNGL example models
- **`published-models/`** (root) - 562+ published BNGL models
- **Reference fixtures** (gitignored but preserved):
  - `bng_test_output/` - BNG2.pl outputs for comparison
  - `gdat_comparison_output/` - GDAT comparison data

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
