# BioNetGen Playground

<img src="public/logo.png" alt="BioNetGen Logo" width="200">

**BioNetGen Playground** is a state-of-the-art web-based modeling and simulation environment for BioNetGen (BNGL).
 models: edit BNGL, parse, generate networks, run simulations, and analyze results through multiple visualization and analysis tabs.

**Live demo:** <https://akutuva21.github.io/bngplayground>

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
    UI["React Frontend"]
    BNGL["BNGL Engine (Services)"]
    Worker["Computational Background (Web Workers)"]
    Solvers["Mathematical Solvers (WASM)"]
    Analysis["Analysis & Visualization"]

    UI --> BNGL
    BNGL --> Worker
    Worker --> Solvers
    BNGL --> Analysis
```

## Directory Structure & Codebase Deep Dive

- **`/services`**: The "brain" of the application. Contains the core logic for:
  - `bnglService.ts` / `bnglWorker.ts`: The main entry points for BNGL processing and worker-based execution.
  - `SimulationLoop.ts` / `ODESolver.ts`: Core simulation engines and WASM solver integrations (CVODE).
  - `parseBNGL.ts`: ANTLR4-based parser implementation.
  - `semanticSearch.ts`: TensorFlow.js-powered natural language model discovery.
  - `nauty_loader.js` / `cvode_loader.js`: Glue code for high-performance WASM binaries.
- **`/components`**: UI modularity and state management.
  - `/tabs`: Implementation of individual analysis tabs (Flux, Parameter Estimation, Steady State).
  - `/charts`: Recharts-based time-series and sensitivity visualization.
  - `EditorPanel.tsx` / `VisualizationPanel.tsx`: Main layout orchestrators.
- **`/src`**: Core domain logic and shared utilities.
  - `/services/graph`: Specialized graph-theory logic for molecule patterns and rule-matching.
- **`/example-models`**: The curated library of 250+ verified models used for search and templates.
- **`/scripts`**: Build-time and developer utilities.
  - `generateEmbeddings.mjs`: Pre-computing vectors for semantic search.
  - `parity_check.ts`: Continuous verification against canonical `BNG2.pl`.
  - `verify_categorization.ts`: ensuring coverage across all model gallery sections.
- **`/published-models`**: Reference models from BioNetGen literature and internal validation suites.

- **Concurrency**: Distributed Web Worker pool for parsing, network generation, and simulation, ensuring 0ms UI lag even during stiff ODE solving.
- **WASM Acceleration**: Native-speed solvers for CVODE, NFsim, and Nauty (canonical labeling).
- **Semantic Search**: Client-side vector embeddings via TensorFlow.js for natural-language model discovery.
- **Parallel Trajectories**: Core Comparison Engine for real-time "What-If" parameter perturbation analysis.

Useful entry points:

- `App.tsx` (app shell)
- `components/EditorPanel.tsx` (editor + run controls)
- `components/VisualizationPanel.tsx` (tabs)
- `services/bnglService.ts` and worker code (parse/simulate)
- `scripts/generateEmbeddings.mjs` (build-time embeddings)

## License

MIT
