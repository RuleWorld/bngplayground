# BioNetGen Playground

<img src="public/logo.png" alt="BioNetGen Logo" width="200">

**BioNetGen Playground** is a state-of-the-art web-based modeling and simulation environment for BioNetGen (BNGL).
 models: edit BNGL, parse, generate networks, run simulations, and analyze results through multiple visualization and analysis tabs.

**Live demo:** <https://ruleworld.github.io/bngplayground>

## Features

- BNGL editor + parser (client-side ANTLR4)
- Network generation and simulation in the browser (Web Worker + WASM)
- **Primary Solver**: CVODE (SUNDIALS) for stiff ODEs, RK4/RK45 for non-stiff systems
- **Large Network Support**: Symmetry reduction using **Nauty** WASM for fast canonical labeling
- **Network-Free Simulation**: Integrated **NFsim** (WASM) for efficient simulation without network generation
  - **Multi-Compartment Support (cBNGL)**: Full support for compartmentalized models with molecule transport in both ODE and stochastic solvers
- **Visual Designer**: Construct models using a structured visual interface
- **What-If Comparison Mode**: Run baseline vs modified-parameter simulations and compare trajectories in real-time
- **Enhanced Example Gallery**: 250+ verified models with semantic-search powered by TensorFlow.js
- Interactive charts (series toggle / isolate, zoom, export)
- Analysis tabs: parameter scan, identifiability (FIM), steady state, parameter estimation, flux analysis, verification, and more

## Quick Start

```bash
npm install
npm run build
npm run dev
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build (also generates semantic-search embeddings) |
| `npm run build:quick` | Production build without embeddings generation |
| `npm run build:full` | Full build including verification |
| `npm run preview` | Preview the production build |
| `npm run test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run generate:gdat` | Regenerate GDAT reference fixtures |
| `npm run generate:embeddings` | Generate `public/model-embeddings.json` for semantic search |

### Rebuilding WASM artifacts

**CVODE (SUNDIALS)** — stiff ODE solver:
```bash
cd wasm-sundials
./build_wasm.sh        # Linux/macOS
build_wasm.bat         # Windows
```

**NFsim** — network-free stochastic simulator:
```bash
# Requires NFSIM_SRC env var pointing to the akutuva21/nfsim C++ source
cd wasm-nfsim
./build_wasm.sh        # Linux/macOS
build_wasm.bat         # Windows

# Or fetch the latest pre-built artifacts from CI (requires GitHub CLI):
./tools/fetch-nfsim-wasm.sh
```
Build outputs land in `public/nfsim.js` and `public/nfsim.wasm` automatically.

## Workflow

1. Pick a model from the Example Gallery (or paste your own BNGL).
2. Edit BNGL in the editor.
3. Click **Parse** to (re)parse the model.
4. Run a simulation (ODE or SSA) and explore results in the tabs.

## Example Gallery + Semantic Search

The Example Gallery features a curated library of **250+ verified BioNetGen models**, organized into biological and technical categories:

- **Cancer Biology**: Oncogenic signaling, tumor suppression, and DNA repair pathways.
- **Immunology**: TCR/BCR signaling, FcεRI degranulation, innate immunity, and cytokine networks.
- **Neuroscience**: Synaptic plasticity, ion channels (CaMKII), and neurotransmitter release.
- **Cell Cycle & Death**: Mitosis, apoptosis, and cell cycle checkpoints.
- **Metabolism**: Metabolic pathways, enzyme kinetics, and glucose homeostasis.
- **Developmental Biology**: Morphogens, differentiation, and tissue patterning.
- **Ecology & Evolution**: Predator-prey dynamics, food webs, infectious disease (Zombies), and spatial niche models.
- **Mathematics & Physics**: Strange attractors (Lorenz), N-body gravity, wave equations, bouncing balls, and quantum-inspired circuits.
- **Computer Science & Algorithms**: Encryption, Huffman coding, Regex engines, PID controllers, and even a BNGL-in-BNGL interpreter.
- **Machine Learning & Signal Processing**: Bio-inspired implementations of K-means, SVMs, Q-learning, Hopfield networks, Fourier synthesizers, and Kalman filters.
- **Synthetic Biology**: Molecular logic gates, pulse generators, counters, and edge detectors.
- **RuleWorld Tutorials**: Official BioNetGen tutorials and comprehensive grammar examples.
- **Example Models**: A complete set of **175 verified baseline models** covering advanced features and edge cases.

### Performance & Parity

We maintain high fidelity with canonical BioNetGen (`BNG2.pl`) and provide high-performance simulation capabilities:

- **High Precision**: Integrated **CVODE (SUNDIALS)** solver handles stiff ODE systems with adaptive time-stepping.
- **Scalability**: Accelerated by **Nauty (WASM)** for fast symmetry reduction and canonical labeling in large reaction networks.
- **Network-Free**: Native **NFsim** support for simulating models that are too large for network expansion.
- **Multi-Compartment**: Full support for **cBNGL** (Compartmental BioNetGen) across both ODE and stochastic solvers.
- **High Fidelity**: Extensively verified against canonical BioNetGen (`BNG2.pl`) with 100+ models achieving perfect numerical agreement.

Search capabilities include:

- **Keyword search**: Fast text matching across model names and descriptions.
- **Semantic search**: Natural-language queries (e.g., "MAPK pathway with feedback") using Vector embeddings.

Semantic search uses a precomputed embeddings index at `public/model-embeddings.json`.

- `npm run build` regenerates embeddings automatically.
- Use `npm run build:quick` to skip embedding generation during rapid iteration.

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

## Architecture

```mermaid
graph TD
    UI["React Frontend (App)"]
    AppSvc["App-level Services\n(services/)"]
    Engine["Engine Package\n(packages/engine — @bngplayground/engine)"]
    Worker["Web Workers"]
    Solvers["WASM Solvers\n(CVODE · NFsim · Nauty)"]
    Analysis["Analysis & Visualization"]

    UI --> AppSvc
    AppSvc --> Engine
    AppSvc --> Worker
    Worker --> Engine
    Worker --> Solvers
    AppSvc --> Analysis
```

The codebase is split into two layers:

| Layer | Location | Purpose |
|-------|----------|---------|
| **App** | `App.tsx`, `components/`, `services/`, `hooks/` | React UI, worker communication, visualization |
| **Engine** | `packages/engine/` (`@bngplayground/engine`) | Core algorithms: parser, graph, solvers, analysis |

Files in `services/` and `src/` that were moved into the engine are kept as thin re-export shims so existing imports continue to work without changes.

## Directory Structure & Codebase Deep Dive

### Top-level layout

```
bionetgen-web-simulator/
├── App.tsx / index.tsx       # React entry points
├── types.ts / constants.ts   # Shared app-level types and constants
├── components/               # React UI components and tabs
├── hooks/                    # Custom React hooks
├── services/                 # App-level services (worker comms, UI helpers)
│   ├── bnglService.ts        # Main worker communication layer
│   ├── parseBNGL.ts          # Parser API wrapper
│   ├── visualization/        # UI visualization helpers
│   ├── grammar/              # Visual Designer grammar parser
│   └── semanticSearch.ts     # TensorFlow.js semantic search
├── src/                      # Thin shims re-exporting from @bngplayground/engine
│   ├── parser/               # BNGLParserWrapper.ts shim
│   ├── services/             # Shims for graph, ODE, analysis, estimation
│   └── utils/                # Shims for utility functions
├── packages/
│   └── engine/               # @bngplayground/engine — all core algorithms
│       └── src/
│           ├── index.ts      # Public barrel export
│           ├── interfaces/   # SimulationEngine interface + EngineRegistry
│           ├── parser/       # ANTLR4 BNGL parser implementation
│           ├── services/
│           │   ├── graph/    # Network generation, matching, canonicalization (Nauty)
│           │   ├── simulation/ # ODE/SSA/NFsim solvers + SimulationLoop
│           │   ├── analysis/ # Network analysis, FIM, steady state
│           │   ├── parity/   # BNG2.pl regression testing utilities
│           │   └── debugger/ # Rule-firing diagnostics
│           └── utils/        # Shared utility functions
├── wasm-nfsim/               # NFsim WASM build scripts (C++ source in akutuva21/nfsim)
│   ├── build_wasm.sh         # Linux/macOS build
│   ├── build_wasm.bat        # Windows build
│   └── build-wasm.github-actions-template.yml
├── wasm-sundials/            # CVODE (SUNDIALS) WASM build scripts + C source
├── tools/
│   └── fetch-nfsim-wasm.sh   # Fetch pre-built NFsim artifacts from CI
├── public/
│   ├── models/               # 250+ BNGL example models
│   ├── model-embeddings.json # Semantic search vector index
│   ├── cvode.wasm            # Pre-built CVODE solver
│   ├── nfsim.js / nfsim.wasm # Pre-built NFsim solver
│   └── nauty.wasm            # Pre-built Nauty canonical labeler
├── scripts/                  # Build-time and developer utilities
│   ├── generateEmbeddings.mjs
│   ├── parity_check.ts
│   └── layered_parity_check.ts
├── tests/                    # Vitest formal test suite (*.spec.ts)
└── example-models/           # Additional curated model library
```

### Key entry points

- `App.tsx` — app shell and routing
- `components/EditorPanel.tsx` — BNGL editor and run controls
- `components/VisualizationPanel.tsx` — analysis tab container
- `services/bnglService.ts` — worker communication (parse / simulate)
- `packages/engine/src/index.ts` — engine public API
- `scripts/generateEmbeddings.mjs` — build-time semantic search embeddings

### Services organization

**App-level (`services/`)** — interface between React and the engine:
- `bnglService.ts` / `bnglWorker.ts`: worker lifecycle, parse/simulate requests
- `semanticSearch.ts`: TensorFlow.js vector search
- `cvode_loader.js` / `nauty_loader.js`: WASM loader glue

**Engine core (`packages/engine/src/services/`)** — pure algorithmic implementations:
- `graph/NetworkGenerator.ts`: rule-based network expansion
- `graph/core/`: Species, Rxn, Matcher, canonical labeling (Nauty)
- `simulation/ODESolver.ts`: CVODE WASM integration (primary stiff solver)
- `simulation/nfsim/`: NFsim adapter and result parsing
- `analysis/`: parameter estimation, FIM, flux analysis, steady-state detection

- **Concurrency**: Distributed Web Worker pool for parsing, network generation, and simulation, ensuring 0 ms UI lag even during stiff ODE solving.
- **WASM Acceleration**: Native-speed solvers for CVODE, NFsim, and Nauty (canonical labeling).
- **Semantic Search**: Client-side vector embeddings via TensorFlow.js for natural-language model discovery.
- **Parallel Trajectories**: Core Comparison Engine for real-time "What-If" parameter perturbation analysis.

## License

MIT
