# Scripts Directory

This directory contains utility scripts for building, testing, and analyzing the BioNetGen Web Simulator.

## Organization

Scripts are organized into subdirectories by purpose:

### `build/`
Build tools and distribution checks
- `check_dist.js` - Verifies build output integrity

### `testing/`
Parity checks, comparison testing, and validation scripts
- **Parity scripts**: Compare web simulator outputs against BioNetGen reference
  - `layered_parity_check.ts` - **Primary parity tool** - Multi-layer validation (parse, network, GDAT)
  - `run_parity_cycle2.mjs` - Cycle 2 parity workflow
  - `run_parity_targeted.mjs` - Targeted model validation
  - `run_example_parity.mjs` - Example models only
- **Comparison scripts**: Compare outputs between implementations
  - `compare_outputs.ts` - Web CSV vs BNG2.pl GDAT comparison
  - `compare_net_files.ts` - Network file comparison
  - `compare_with_bng2.mjs` - Parser output vs BNG2.pl
  - `compare_graphml.ts` - GraphML comparison
- **Generation**: Generate test outputs
  - `generate_web_output_playwright.mjs` - **Used by `npm run generate:web-output`** - Generates web simulation outputs via Playwright
  - `generate_web_nfsim_output.ts` - NFsim outputs
  - `generate_web_ssa_output.ts` - SSA outputs
  - `generate_no_ref_gdat.ts` - GDAT for models without references
- **Verification**: Verify models against BNG2.pl
  - `verify_all_public_models.cjs` - All public models
  - `verify_published_models_with_bng2.cjs` - Published models
  - `verify_targeted_models.mjs` - Specific models
  - `verify_round_trip.ts` - Round-trip parsing
  - `verify_public_atomizer.ts` - Atomizer verification

### `analysis/`
Reporting, extraction, and diagnostic scripts
- **Analysis**: Analyze simulation outputs and failures
  - `analyze_failures.mjs` - Failure pattern analysis
  - `analyze_models.mjs` - Model metadata analysis
  - `analyze_atomizer_report.ts` - Atomizer report analysis
  - `analyze_published_failures.mjs` - Published model failures
- **Diagnostics**: Debug specific issues
  - `diagnose_mismatch_artifacts.ts` - Debug mismatches
  - `check_failing_models.ts` - Check all failing models with ANTLR parser
  - `check_web_species_duplicates.ts` - Check for duplicate species
- **Extraction**: Extract data from models
  - `extract_parser_errors.mjs` - Extract parser errors
  - `extract_validation_models.cjs` - Extract validation models
- **Discovery**: Find models with specific features
  - `find_duplicate_observables.ts` - Duplicate observables in single model
  - `find_duplicate_observables_files.mjs` - Duplicate observables across files
  - `find_intramolecular.ts` - Intramolecular bonds
  - `find_mixed_solvers.ts` - Mixed solver types
  - `find_ode_models.mjs` - ODE-based models
  - `find_true_extras.ts` - True extra species

### `generation/`
Output generation scripts (reference data, reports, etc.)
- `generate_missing_refs.ts` - Generate missing reference files
- `generate_nf_gdat_refs.mjs` - NFsim GDAT references
- `generate_refs_noref.ts` - References for models without them
- `generate_layered_parity_report_doc.ts` - Parity report documentation
- `generate_report_artifact.ts` - Report artifacts
- `generate_constants_additions.mjs` - Constants additions

### `utils/`
Utility scripts for maintenance and data manipulation
- `clean_web_output_artifacts.mjs` - **Used by `npm run clean:web-output:artifacts`** - Cleans web output artifacts
- `normalize.js` - Normalize model files
- `optimize_durations.ts` - Optimize simulation durations
- `remove_duplicates.js` - Remove duplicate entries
- `trim_validation_models.js` - Trim validation models list
- `unify_models.mjs` - Unify model sets

### `legacy/`
Deprecated scripts kept for reference only
- `benchmark_parsers.ts` - Benchmarks legacy regex parser vs ANTLR (references missing `temp_tutorial/`)
- `biomodels_roundtrip_compare.ts` - Uses deprecated `parseBNGLRegexDeprecated`
- Python scripts for external tool integration (archived)

### `research/`
One-off exploratory and demo scripts
- `phase2_demo.ts` - Phase 2 demo (variational parameter estimation, neural ODE surrogate)
- `lint_demo.ts` - Linter demo
- Demo and extraction scripts for specific research tasks

## Active npm Scripts

These scripts are registered in `package.json` and actively used:

```bash
npm run build:verify           # Check dist output (scripts/build/check_dist.js)
npm run generate:web-output    # Generate web outputs (scripts/generate_web_output_playwright.mjs)
npm run clean:web-output:artifacts  # Clean artifacts (scripts/clean_web_output_artifacts.mjs)
npm run test:share-link        # Test share links (scripts/playwright_share_link_test.mjs)
npm run parity:cycle2:full     # Full cycle 2 parity (scripts/run_parity_cycle2.mjs)
npm run parity:all:freshregen  # Full parity with regen (scripts/layered_parity_check.ts)
npm run parity:targeted:*      # Targeted parity checks (scripts/run_parity_targeted.mjs)
```

## Import Paths

**Important**: Due to the monorepo migration, scripts should import from `packages/engine/src/` for core engine code:

```typescript
// Core engine imports
import { BNGLParser } from '../packages/engine/src/services/graph/core/BNGLParser.ts';
import { NetworkGenerator } from '../packages/engine/src/services/graph/NetworkGenerator.ts';

// Root-level imports (types, app services)
import type { BNGLModel } from '../types.ts';
import { parseBNGL } from '../services/parseBNGL.ts';
```

## Running Scripts

Most scripts can be run directly with `tsx` or `node`:

```bash
# TypeScript scripts
npx tsx scripts/testing/layered_parity_check.ts --all

# JavaScript/MJS scripts
node scripts/analysis/analyze_failures.mjs

# With arguments
npx tsx scripts/testing/compare_outputs.ts --model example_model
```

## Common Workflows

### Running Parity Checks
```bash
# Full parity check on all models
npm run parity:all:freshregen

# Targeted parity on specific models
npx tsx scripts/testing/run_parity_targeted.mjs model1 model2 model3 --out artifacts/report.json

# Example models only
node scripts/testing/run_example_parity.mjs
```

### Generating Reference Data
```bash
# Generate web outputs via Playwright
npm run generate:web-output

# Generate GDAT references
npm run generate:gdat

# Generate missing references
npx tsx scripts/generation/generate_missing_refs.ts
```

### Analysis & Debugging
```bash
# Analyze failures from comparison
node scripts/analysis/analyze_failures.mjs

# Check for duplicate species in web output
npx tsx scripts/analysis/check_web_species_duplicates.ts

# Diagnose mismatch artifacts
npx tsx scripts/analysis/diagnose_mismatch_artifacts.ts
```

## Reference Fixtures

Per AGENTS.md, the following directories contain reference data for validation and should NOT be deleted:
- `bng_test_output/` - BNG2.pl test outputs
- `bng_compare_output/` - BNG comparison outputs
- `gdat_comparison_output/` - GDAT comparison outputs
- `species_comparison_output/` - Species comparison analysis
- `temp_bench/` - Benchmark temp outputs
- `temp_bng_output/` - BNG temp outputs

These compare web simulator outputs against official BioNetGen source to ensure correctness.
