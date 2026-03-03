# AGENTS.md

⚠️ **DO NOT GIT COMMIT ANYTHING WITHOUT EXPLICIT USER APPROVAL** ⚠️

## Development Commands

### Build & Development
- `npm run dev` - Start Vite dev server (port 3000, host 0.0.0.0)
- `npm run build` - Production build with semantic search embeddings
- `npm run build:quick` - Production build without embeddings (faster iteration)
- `npm run preview` - Preview production build locally

### Testing
- `npm run test` - Run Vitest once (formal suite in `tests/` directory)
- `npm run test:watch` - Run Vitest in watch mode
- `npx vitest run <filename>` - Run single test file (e.g., `npx vitest run tests/constants.spec.ts`)
- Test files in `tests/*.spec.ts` and `tests/*.test.ts` (run by `npm run test`)
- Debug/repro specs (`tests/debug-*.ts`, `tests/*isolated*.ts`, `tests/*repro*.ts`, `tests/*spawnsync*.ts`) are **excluded** from the default run; invoke explicitly with `npx vitest run <file>`
- Additional test files in `src/*.test.ts` exist but are not in Vitest config; run manually with `npx vitest run`

### Utilities
- `npm run generate:gdat` - Regenerate GDAT reference fixtures
- `npm run generate:embeddings` - Generate `public/model-embeddings.json` for semantic search
- `npm run generate:web-output` - Generate web output with Playwright

### WASM (CVODE)
- Rebuild CVODE WASM (Windows): `cd wasm-sundials` then `./build_wasm.bat`
- Rebuild CVODE WASM (bash): `cd wasm-sundials` then `./build_wasm.sh`

Notes:
- If you change `wasm-sundials/cvode_wrapper.c` or `wasm-sundials/library_cvode.js`, you must rebuild.
- Build outputs are installed automatically to:
  - `services/cvode_loader.js`
  - `public/cvode.wasm`

### WASM (NFsim)
- Pre-built artifacts are checked in at `public/nfsim.js` and `public/nfsim.wasm`.
- C++ source lives in the `akutuva21/nfsim` fork (not in this repo).
- Rebuild NFsim WASM (Windows): `cd wasm-nfsim` then `build_wasm.bat` (requires `NFSIM_SRC` env var pointing to `akutuva21/nfsim`)
- Rebuild NFsim WASM (bash): `cd wasm-nfsim` then `./build_wasm.sh` (requires `NFSIM_SRC` env var)
- Fetch latest pre-built artifacts from CI: `./tools/fetch-nfsim-wasm.sh` (requires GitHub CLI)
- CI template for `akutuva21/nfsim`: `wasm-nfsim/build-wasm.github-actions-template.yml`

## Code Style Guidelines

### TypeScript Configuration
- Target: ES2022, Module: ESNext
- Strict mode enabled: noUnusedLocals, noUnusedParameters, noFallthroughCasesInSwitch
- Module resolution: bundler
- Path alias: `@/*` maps to root directory
- Allow importing TypeScript extensions: yes

### Imports
- Components in root (`App.tsx`, `index.tsx`): Use `./` for same-level imports
- Components in `components/`: Use `../` for root services, `../../packages/engine/src/` for engine modules
- Services in `services/`: Use `../packages/engine/src/` for engine modules`n- Scripts in `scripts/`: Use `../packages/engine/src/` for engine modules
- Examples:
  ```typescript
  // From root App.tsx:
  import { bnglService } from './services/bnglService';         // root/services
  import { getModelFromUrl } from './src/utils/shareUrl';         // src/utils (legacy)
  import { types } from './types';                               // root

  // From components/ directory:
  import { bnglService } from '../services/bnglService';         // root/services
  import { types } from '../../types';                          // root
  import { NetworkGenerator } from '../../packages/engine/src/services/graph/NetworkGenerator'; // engine package`n`n  // From scripts/ directory:`n  import type { BNGLModel } from '../types.ts';                // root`n  import { parseBNGL } from '../services/parseBNGL.ts';         // root/services`n  import { BNGLParser } from '../packages/engine/src/services/graph/core/BNGLParser.ts'; // engine package
  ```
- Group imports: React/core first, third-party libraries, local modules
- ES module syntax only (type: "module" in package.json)

### React Components
- Functional components with hooks preferred
- TypeScript interfaces for props: `interface Props { ... }`
- Export as named exports: `export const Component: React.FC<Props> = ({ prop }) => { ... }`
- Use `React.FC<T>` for typed components
- Prefer `useState` for state, `useEffect` for side effects, `useCallback` for memoization

### Naming Conventions
- Components: PascalCase (e.g., `VisualizationPanel`, `Header`)
- Functions/variables: camelCase (e.g., `parseBNGL`, `setTheme`)
- Constants: UPPER_SNAKE_CASE (e.g., `DEFAULT_TIMEOUT_MS`)
- Types/interfaces: PascalCase (e.g., `BNGLModel`, `SimulationOptions`)
- Private members: prefix with underscore (optional)

### Error Handling
- Use try/catch for async operations
- AbortControllers for cancellable operations (refs: `parseAbortRef`, `simulateAbortRef`)
- Custom error types: `DOMException('message', 'AbortError')`, `Error` with `.name`
- Error extraction helpers for worker responses
- Type guards for runtime type checking

### Styling
- Tailwind CSS for all styling
- Dark mode support with `dark:` prefix classes
- Custom colors: primary (#21808D) with 50-950 scale
- Responsive breakpoints: `sm:`, `md:`, `lg:` prefixes
- Components in `components/ui/` for reusable UI elements

### Type Definitions
- Central types in `types.ts` or `src/types/`
- Use `interface` for object shapes, `type` for unions/primitives
- Export types used across modules
- Avoid `any`; use `unknown` with type guards when needed

### Worker Communication
- Worker requests/messages use `WorkerRequest`, `WorkerResponse` types
- Timeout support with `RequestOptions` and `AbortSignal`
- Error serialization: `SerializedWorkerError` type
- Service layer handles worker lifecycle (terminate on unmount)

### Documentation
- JSDoc comments for public methods (e.g., `/** * BioNetGen: Species::toString() */`)
- Descriptive function names over comments
- README.md for module-level documentation
- Inline comments for complex logic only

### Performance
- Web Workers for heavy computation (parsing, simulation)
- Lazy loading with React.lazy where appropriate
- Memoization: useMemo, useCallback for expensive operations
- Virtualization for long lists (when applicable)
- Debounce user input where appropriate

### Git Commit Guidelines
- Commit when explicitly requested by user
- Run tests before committing
- Include relevant files, skip secrets (.env, credentials.json)
- Follow existing commit message style from git log

### Testing Patterns
- Vitest with Node environment
- Test files: `*.spec.ts` or `*.test.ts`
- Import `describe`, `it`, `expect` from 'vitest'
- Helper functions for common test operations
- Timeout constants for long-running tests
- Conditional tests based on environment (e.g., `bngAvailable`)
- **Note**: `npm run test` only runs files in `tests/` directory. Test files in `src/*.test.ts` are not included in Vitest config.

## Repository Structure

### Root vs `src/` Split
The codebase uses a **monorepo structure** with core engine code in `packages/engine/`:

**Root Directory (app-level code):**
- `App.tsx`, `index.tsx` - Application entry point
- `types.ts` - Central type definitions used across the app
- `constants.ts` - App-wide constants
- `components/` - React components (UI layer)
- `hooks/` - Custom React hooks
- `services/` - **App-level services** (worker communication, parsing APIs, UI helpers)
- `public/` - Static assets, model gallery, WASM files

**packages/engine/ (core BioNetGen engine):**
- `packages/engine/src/parser/` - ANTLR-based BNGL parser implementation
- `packages/engine/src/services/` - **Core algorithmic services** (graph generation, solvers, analysis)
  - `simulation/` - ODE/SSA/NFsim solvers, network expansion
  - `graph/` - Graph algorithms (network generation, matching, canonicalization)
  - `parity/` - Parity checking utilities
- `packages/engine/src/utils/` - Utility functions for core algorithms
- `packages/engine/src/interfaces/` - Engine interfaces
- `packages/engine/src/types.ts` - Engine-specific types

**src/ Directory (legacy - being migrated):**
- Some files remain in root `src/` directories:

**Root Directory (app-level code):**
- `App.tsx`, `index.tsx` - Application entry point
- `types.ts` - Central type definitions used across the app
- `constants.ts` - App-wide constants
- `components/` - React components (UI layer)
- `hooks/` - Custom React hooks
- `services/` - **App-level services** (worker communication, parsing APIs, UI helpers)
- `public/` - Static assets, model gallery, WASM files

**src/ Directory (core algorithms):**
- `src/services/` - **Core algorithmic services** (graph generation, solvers, analysis, estimation)
- `src/parser/` - ANTLR-based BNGL parser implementation
- `src/services/graph/` - Graph theory algorithms (network generation, matching, canonicalization)
- `src/utils/` - Utility functions for core algorithms

### Services Organization

**App-level services (`services/`)** - Interface between React UI and core algorithms:
- `bnglService.ts` - Worker communication layer, handles parse/simulate requests
- `parseBNGL.ts` - Parser API wrapper used by app
- `visualization/` - UI visualization helpers (color utilities, graph formatters)
- `grammar/` - Designer panel grammar parser and generator
- `semanticSearch.ts` - Semantic search for example gallery
- `modelValidation.ts` - BNGL model validation logic

**Core algorithm services (`src/services/`)** - Mathematical and algorithmic implementations:
- `graph/NetworkGenerator.ts` - Network generation from reaction rules
- `graph/core/` - Core data structures (Species, Rxn, Matcher, Canonical)
- `ODESolver.ts` - ODE solver implementations
- `ParameterEstimation.ts` - Parameter estimation algorithms
- `NetworkAnalysis.ts` - Network analysis utilities
- `WorkerPool.ts` - Worker pool management
- Note: Many services in `src/services/` are imported from `services/` to expose to app

### File Structure Overview
```
bionetgen-web-simulator/
├── App.tsx                          # Main app component (root)
├── index.tsx                        # React entry point (root)
├── types.ts                         # Central type definitions (root)
├── constants.ts                     # App constants (root)
├── components/                       # React UI components
│   ├── EditorPanel.tsx              # BNGL editor
│   ├── VisualizationPanel.tsx       # Analysis tabs container
│   ├── Header.tsx                   # App header
│   └── ui/                        # Reusable UI elements
├── hooks/                          # Custom React hooks
│   └── useTheme.ts                 # Theme management
├── services/                        # App-level services (UI-facing)
│   ├── bnglService.ts              # Worker comms layer
│   ├── parseBNGL.ts                # Parser API
│   ├── visualization/               # UI viz helpers
│   ├── grammar/                     # Designer panel grammar
│   └── semanticSearch.ts            # Example search
├── src/
│   ├── parser/                     # ANTLR parser implementation
│   │   ├── BNGLParserWrapper.ts
│   │   ├── BNGLVisitor.ts
│   │   └── generated/             # ANTLR-generated files
│   ├── services/                   # Core algorithms (computation)
│   │   ├── graph/
│   │   │   ├── NetworkGenerator.ts
│   │   │   └── core/             # Data structures
│   │   ├── ODESolver.ts           # ODE solvers
│   │   ├── ParameterEstimation.ts   # Parameter estimation
│   │   └── NetworkAnalysis.ts      # Analysis utilities
│   └── utils/                     # Core utilities
│       └── shareUrl.ts             # URL sharing
├── tests/                          # Vitest test files
│   └── *.spec.ts                  # Formal test suite
├── scripts/                        # Build-time and utility scripts
│   ├── generateEmbeddings.mjs       # Semantic search embeddings
│   └── generateGdat.mjs           # GDAT reference fixtures
├── public/                         # Static assets
│   ├── models/                     # BNGL example models
│   ├── model-embeddings.json        # Semantic search index
│   └── *.wasm, *.js             # WASM solver files
└── docs/                          # Documentation (optional)
```

### Test File Locations
- **`tests/*.spec.ts`** - Formal Vitest tests (run by `npm run test`)
- **`src/*.test.ts`** - Additional test files (not in Vitest config, run manually with `npx vitest run`)
- **Root `debug_*.ts`** - One-off debugging scripts (gitignored, not part of test suite)

### Gitignored Files
The following are gitignored and should be considered temporary/debug:
- `debug_*.ts`, `test_*.ts`, `profile_*.ts` in root
- `*.net`, `*.gdat`, `*.cdat`, `*.log` files in root (BNGL simulation outputs)
- `*_benchmark_results.json`, `*_comparison*.json` (benchmark outputs)
- `*_report.json`, `*_comparison_results.json` (comparison outputs)

**Important**: Some directories containing .net/.gdat/.cdat files are **reference fixtures** for regression testing:
- `bng_test_output/`, `bng_compare_output/`, `gdat_comparison_output/` - Reference outputs from BioNetGen for parser/solver validation
- `species_comparison_output/`, `temp_bench/`, `temp_bng_output/` - Comparison analysis outputs
- These compare web simulator outputs against BioNetGen source to ensure robustness

### BioNetGen Reference
- `bionetgen_repo/` and `bionetgen_python/` directories contain official BioNetGen source code
- Used for regression testing and validation of parser/ODE solver accuracy
- Reference outputs are generated from BioNetGen and compared against web simulator outputs

## Known Limitations & Design Decisions

### Canonicalization
- **Nauty WASM is integrated** and used for canonical labeling when `NautyService` is initialized
- Nauty input uses an expanded graph encoding (molecule + component + bond vertices) to preserve component-level connectivity and multi-bonds
- Fallback uses Weisfeiler-Lehman refinement + BFS-based canonical ordering when Nauty is unavailable
- **Validation**: Species counts are verified against BNG2.pl in `tests/bng2-comparison.spec.ts`
- Targeted regression: `tests/nauty-canonicalization.spec.ts`

### ODE Solver
- **CVODE WASM (SUNDIALS)** is the primary solver for stiff systems - NOT RK4
- Loader: `services/cvode_loader.js`, WASM: `public/cvode.wasm`
- Supports dense and sparse Jacobian modes via `cvode`, `cvode_sparse`, `cvode_auto`
- Explicit methods (RK4/RK45) exist for non-stiff fallback only

### Features NOT Implemented
- Local functions (`%x` syntax)
- Hybrid SSA/ODE (PLA)

### Automated Validation
- `tests/bng2-comparison.spec.ts` - Compares GDAT output vs BNG2.pl for 62 models
- `tests/gdat-regression.spec.ts` - Regression tests against stored fixtures
- Model-specific tolerance overrides for known numerical divergence (e.g., `An_2009` at 25% rel tol)

## Architecture Notes

- React 19 + Vite 6 + TypeScript 5.8
- Web Worker + WASM for browser-based simulation
- ANTLR4 for BNGL parsing
- Cytoscape for network visualization
- TensorFlow.js for ML-based features
- Recharts for plotting

## Important Paths
- Entry point: `App.tsx` (root)
- Main panels: `components/EditorPanel.tsx`, `components/VisualizationPanel.tsx` (root)
- App services (UI-facing): `services/bnglService.ts`, `services/parseBNGL.ts`
- Core algorithms: `src/services/graph/NetworkGenerator.ts`, `src/services/ODESolver.ts`
- Worker communication: `services/bnglService.ts` (root)
- Parser implementation: `src/parser/BNGLParserWrapper.ts`, `src/parser/BNGLVisitor.ts`
- Types: `types.ts` (root)
- Build config: `vite.config.ts`, `tsconfig.json` (root)
- Test config: `vitest.config.ts` (root) - Note: only includes `tests/` directory

