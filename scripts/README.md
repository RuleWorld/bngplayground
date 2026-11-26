# Scripts Directory

This directory contains utility scripts for building, testing, benchmarking, and analyzing BioNetGen Playground.

## Organization

### Root (`scripts/`)
Primary runners, parity harnesses, benchmarks, and CI helpers:
- **Test & CI Runners**:
  - `run_full_tests.mjs` - Hang-safe Vitest wrapper used by `npm run test:fast` and `npm run test:full:safe`
  - `run_deterministic_parity_ci.mjs` - Deterministic CI parity gate (`npm run test:deterministic:parity`)
  - `check-suppression-budget.mjs` - Lint/type suppression budget checker
  - `tool_init_safety_check.mjs` - Tool initialization check (`npm run test:tool-init`)
  - `sync-gallery.ts` - Syncs gallery metadata from RuleHub (`npm run sync-gallery`)
- **Parity & Network Export**:
  - `layered_parity_check.ts` - Multi-layer validation (parse, network, GDAT)
  - `run_parity_cycle2.mjs` / `run_parity_targeted.mjs` - Cycle 2 and targeted parity workflows
  - `export_net.ts` - Exports `.net` files from BNGL models
  - `contact_map_parity.ts` / `influence_graph_parity.ts` - Structural graph parity checks
  - `generate_web_output_playwright.mjs` - Generates web simulation outputs via Playwright (`npm run generate:web-output`)
  - `clean_web_output_artifacts.mjs` - Cleans web output artifacts (`npm run clean:web-output:artifacts`)
- **MCP Conformance**:
  - `run-mcp-conformance.mjs` / `mcp-conformance-server.mjs` / `conformance-fixtures.mjs` / `mcp-inspector-smoke.mjs`
- **Benchmarks**:
  - `benchmark_functional_rate_fast_path.ts`, `benchmark_multiscale.ts`, `benchmark_multiscale_baseline.ts`, `benchmark-parameter-panel.ts`, `benchmark-browser-worker-transport.mjs`, `benchmark-browser-prepared-lifecycle.mjs`, `compare_profile_runs.mjs`

### `build/`
- `check_dist.js` - Verifies build output integrity (`npm run build:verify`)

### `atomizer/`
- `roundtrip_parity.ts` - SBML/BNGL bidirectional roundtrip parity (`npm run test:atomizer-roundtrip`)
- `sbml_suite_audit.ts` - SBML Test Suite structural audit (`npm run test:atomizer-sbml-suite`)
- `sbml_event_runtime_audit.ts` - SBML event runtime audit (`npm run test:atomizer-sbml-events`)
- `compare_sbml_trajectories.py` - Python libRoadRunner trajectory comparator

### `autoresearch/`
Automated optimization campaign orchestration (`controller.ts`, `evaluate.ts`, `promote.ts`, `campaigns/`, `evaluators/`).

### `testing/`
Fuzzing, example parity, and WebGPU benchmarks:
- `bngl_fuzzer.ts` - BNGL property/fuzz harness
- `compare_outputs.ts` - Output comparison helper
- `run_example_parity.mjs` - Example models parity check
- `webgpu_benchmark.ts` / `webgpu_correctness_sweep.ts` - WebGPU solver validation

### `analysis/`
Diagnostic, failure analysis, and paper figure scripts (`analyze_failures.mjs`, `compare_net_files.ts`, `compare_with_bng2.mjs`, `diagnose_mismatch_artifacts.ts`, `generate_paper_figures.py`, etc.).

### `generation/`
Reference and report generation scripts (`generate_no_ref_gdat.ts`, `generate_missing_refs.ts`, `generate_nf_gdat_refs.mjs`, `generate_layered_parity_report_doc.ts`, `generate_mcp_docs.ts`, `generate_tab_docs.ts`, etc.).

### `utils/`
Maintenance and verification helpers (`audit_example_models.ts`, `benchmark_runner.mjs`, `check_failing_models.ts`, `verify_round_trip.ts`, `verify_public_atomizer.ts`, etc.).

### `research/`
Exploratory demos (`lint_demo.ts`, `phase2_demo.ts`).

## Active npm Scripts

```bash
npm run sync-gallery               # scripts/sync-gallery.ts
npm run build:verify               # scripts/build/check_dist.js
npm run test:fast                  # scripts/run_full_tests.mjs --config vitest.config.ts
npm run test:full:safe             # scripts/run_full_tests.mjs --config vitest.full.config.ts
npm run test:deterministic:parity  # scripts/run_deterministic_parity_ci.mjs
npm run test:atomizer-roundtrip    # scripts/atomizer/roundtrip_parity.ts
npm run test:atomizer-sbml-suite   # scripts/atomizer/sbml_suite_audit.ts
npm run test:atomizer-sbml-events  # scripts/atomizer/sbml_event_runtime_audit.ts
npm run test:mcp-conformance       # scripts/run-mcp-conformance.mjs
npm run test:mcp-inspector         # scripts/mcp-inspector-smoke.mjs
npm run generate:web-output        # scripts/generate_web_output_playwright.mjs
npm run clean:web-output:artifacts # scripts/clean_web_output_artifacts.mjs
npm run test:share-link            # scripts/playwright_share_link_test.mjs
npm run test:tool-init             # scripts/tool_init_safety_check.mjs
```

## Import Paths

Import core engine modules directly from `@bngplayground/engine` (or `../packages/engine/src/` when running standalone scripts with `tsx`):

```typescript
import { BNGLParser, NetworkGenerator } from '@bngplayground/engine';
import type { BNGLModel } from '../types.ts';
import { parseBNGL } from '../services/parseBNGL.ts';
```

## Local Reference Cache

`bng_test_output/` (gitignored) stores precomputed `BNG2.pl` reference outputs used locally by `npm run test:reference` and `tools/validation/` scripts.
