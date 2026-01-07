# BioNetGen Web Simulator

An interactive, browser-based workspace for exploring BioNetGen (BNGL) models: edit BNGL, parse, generate networks, run simulations, and analyze results through multiple visualization and analysis tabs.

**Live demo:** <https://akutuva21.github.io/bngplayground>

## Features

- BNGL editor + parser (client-side)
- Network generation and simulation in the browser (Web Worker + WASM)
- Example gallery with keyword + semantic search
- Interactive charts (series toggle / isolate, zoom, export)
- Analysis tabs: parameter scan, identifiability (FIM), steady state, parameter estimation, flux analysis, verification, and more

## Quick Start

```bash
npm install
npm run dev
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build (also generates semantic-search embeddings) |
| `npm run build:quick` | Production build without embeddings generation |
| `npm run preview` | Preview the production build |
| `npm run test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run generate:gdat` | Regenerate GDAT reference fixtures |
| `npm run generate:embeddings` | Generate `public/model-embeddings.json` for semantic search |

## Workflow

1. Pick a model from the Example Gallery (or paste your own BNGL).
2. Edit BNGL in the editor.
3. Click **Parse** to (re)parse the model.
4. Run a simulation (ODE or SSA) and explore results in the tabs.

## Example Gallery + Semantic Search

The Example Gallery supports:

- **Keyword search** (fast text match)
- **Semantic search** (natural-language queries like “MAPK pathway with feedback”)

Semantic search uses a precomputed embeddings index at `public/model-embeddings.json`.

- `npm run build` regenerates embeddings automatically.
- If you’re iterating quickly, use `npm run build:quick` to skip that step.

## Tabs

The UI exposes a small set of core tabs by default, with additional analysis tabs behind **More →**.

### Core tabs (always visible)

- **Time Courses**
  - Plots observables vs time.
  - Interactive legend: click to toggle series, double-click to isolate/restore.
  - Drag-to-zoom and double-click to reset view.
  - Optional custom expressions (derived observables) via the Expression panel.

- **Parameter Scan**
  - **1D scan**: sweep a parameter range and plot an observable vs parameter value (drag-to-zoom supported).
  - **2D scan**: heatmap of an observable across two parameters (hover tooltip, click-to-pin, and it scales to fill the panel).
  - Optional surrogate training for fast sweeps on large parameter spaces.

- **Regulatory Graph**
  - Graph view of how rules influence molecular states.
  - Supports time-course overlay for selected influences.

### Advanced tabs (shown via **More →**)

- **What-If Compare**: run a baseline vs modified-parameter simulation and compare trajectories (interactive legend).
- **Contact Map**: molecule-type interaction map; click edges to jump to representative rules.
- **Rule Cartoons**: compact visualizations of reaction rules (cartoon + compact view).
- **Identifiability (FIM)**: Fisher Information Matrix analysis, eigen/sensitivity views, and heatmaps.
- **Steady State**: run an extended ODE sweep and detect steady state (result appears as the final point in Time Courses).
- **Parameter Estimation**: fit parameters to experimental time-series data (includes priors and convergence diagnostics).
- **Flux Analysis**: compute and visualize reaction flux contributions from the expanded reaction network.
- **Verification**: define constraints over observables (inequalities, equality, conservation) and check against simulation results.

### Additional tabs in the codebase

The repository also contains additional tab implementations that may not be currently wired into the main tab strip:

- **Debugger**: developer tooling to trace rule firing and network generation.
- **Robustness Analysis**: Monte Carlo parameter-noise sensitivity with a confidence “cloud” chart.
- **Structure Analysis**: connectivity + conservation-law style summaries based on the expanded reaction network.
- **Expression Evaluator**: define custom expressions over observables and plot expression results.
- **Parameters**: edit parameter values in a table and apply them back to the model.

## Architecture (high-level)

- React + TypeScript + Vite + Tailwind UI
- Web Worker for parsing / simulation so the UI stays responsive
- WASM-backed solvers (including CVODE) and network-generation utilities

Useful entry points:

- `App.tsx` (app shell)
- `components/EditorPanel.tsx` (editor + run controls)
- `components/VisualizationPanel.tsx` (tabs)
- `services/bnglService.ts` and worker code (parse/simulate)
- `scripts/generateEmbeddings.mjs` (build-time embeddings)

## Security & Feature Flags

### Functional Rates (Disabled by Default)

Support for functional rates (rate laws defined as arbitrary mathematical expressions) is **disabled by default** for security reasons, as it effectively requires a sandboxed expression evaluator in the browser.

We use a custom AST-based evaluator (via `jsep`) with a strict allowlist of functions and constants. However, to enable this feature in a build, you must set the following environment variable:

```bash
VITE_ENABLE_FUNCTIONAL_RATES=true npm run build
```

The application detects this flag at runtime. If disabled, any model attempting to use functional rates will throw a clear error message.

## License

MIT
