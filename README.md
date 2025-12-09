<div align="center">

# BioNetGen Web Simulator

An interactive workspace that lets you explore BioNetGen (BNGL) models, watch molecular networks unfold, and simulate system behavior directly in your browser.

[![Deploy](https://github.com/akutuva21/bngplayground/actions/workflows/deploy.yml/badge.svg)](https://github.com/akutuva21/bngplayground/actions/workflows/deploy.yml)

**[Live Demo](https://akutuva21.github.io/bngplayground/)**

</div>

## Features

- **60+ curated BNGL models** covering signaling cascades, gene regulation, and immune responses
- **Monaco-powered editor** with syntax highlighting and error detection
- **Rule-based network generation** that expands BNGL rules into concrete species and reactions
- **ODE & SSA simulations** running entirely client-side via WebAssembly (CVODE solver)
- **Interactive visualizations**: time-course plots, network graphs, rule cartoons, contact maps
- **Fisher Information Matrix (FIM)** identifiability analysis for parameter sensitivity
- **Dark/light themes** with responsive UI

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:3000/bngplayground/` in your browser.

## Architecture

```
├── App.tsx                    # Main application entry
├── components/                # React UI components
│   ├── EditorPanel.tsx        # Monaco editor wrapper
│   ├── tabs/                  # Visualization tabs (Charts, Graphs, FIM, etc.)
│   └── ui/                    # Reusable UI primitives
├── services/                  # Core logic
│   ├── bnglWorker.ts          # Web Worker for background processing
│   ├── ODESolver.ts           # ODE solvers (RK4, RK45, CVODE via WASM)
│   ├── parseBNGL.ts           # BNGL parsing utilities
│   └── fim.ts                 # Fisher Information Matrix analysis
├── src/
│   └── services/graph/        # Network generation engine
│       ├── NetworkGenerator.ts # Rule application & species expansion
│       ├── core/              # Graph representation (Species, Molecules, Bonds)
│       │   ├── Canonical.ts   # Canonical form generation
│       │   ├── Matcher.ts     # VF2 subgraph matching
│       │   └── NautyService.ts # WASM-based graph automorphism
│       └── ...
├── src/wasm/nauty/            # Nauty library (graph canonicalization)
├── public/
│   ├── cvode.wasm             # SUNDIALS CVODE compiled to WebAssembly
│   └── cvode.js               # CVODE JavaScript loader
├── example-models/            # 60 curated toy BNGL models
├── published-models/          # Real published models from literature
├── scripts/                   # Utility scripts
│   ├── full_ode_benchmark.ts  # Benchmark suite (69 models)
│   ├── generateGdat.mjs       # Generate reference GDAT files
│   └── ...
└── tests/                     # Vitest test suite
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite development server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve production build locally |
| `npm run test` | Run Vitest test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run generate:gdat` | Regenerate BNG2.pl reference fixtures |

## How It Works

### Network Generation

The simulator implements a rule-based modeling engine that:

1. **Parses BNGL** into structured AST (molecules, rules, observables, parameters)
2. **Applies rules iteratively** using VF2 subgraph isomorphism matching
3. **Generates canonical forms** via Nauty WASM for efficient deduplication
4. **Expands to concrete network** of species and reactions

### ODE Solving

Multiple solvers are available:

- **RK4** – Fixed-step 4th order Runge-Kutta
- **RK45** – Adaptive Dormand-Prince with error control
- **Rosenbrock23** – Implicit solver for stiff systems
- **CVODE** – SUNDIALS library compiled to WebAssembly (recommended for stiff ODEs)

All simulations run in a Web Worker to keep the UI responsive.

### Benchmark Results

The network generation engine has been validated against BNG2.pl on 69 models:

- **66 models** pass completely (species count + ODE trajectory match)
- **2 models** hit size limits (expected for large networks like `Barua_2013`, `Model_ZAP`)
- **1 model** has known discrepancy under investigation (`Barua_2007`)

## Testing

```bash
# Run full test suite
npm run test

# Run benchmark against BNG2.pl (requires Perl + BNG2.pl installation)
npx tsx scripts/full_ode_benchmark.ts
```

Set `BNG2_PATH` and `PERL_CMD` environment variables to point to your BNG2 installation, or edit `scripts/bngDefaults.js`.

## Deployment

The app is a static Vite build deployed to GitHub Pages:

```bash
npm run build
# Deploy dist/ to any static host
```

GitHub Actions automatically deploys on push to `main`.

## Identifiability Analysis (FIM)

Built-in Fisher Information Matrix analysis for parameter identifiability:

```typescript
import { computeFIM, exportFIM } from './services/fim';

const result = await computeFIM(
  model,
  selectedParams,
  { method: 'ode', t_end: 50, n_steps: 100 }
);

console.log('Identifiable:', result.identifiableParams);
console.log('Unidentifiable:', result.unidentifiableParams);
```

**Interpretation:**
- Condition number > 10⁴ indicates ill-conditioned FIM
- VIF > 10 indicates strong parameter correlation
- Profile plots show approximate 95% confidence intervals

## Acknowledgements

- Built on the [BioNetGen](https://bionetgen.org/) rule-based modeling paradigm
- Uses [SUNDIALS CVODE](https://computing.llnl.gov/projects/sundials) for stiff ODE solving
- Uses [Nauty](https://pallini.di.uniroma1.it/) for graph automorphism
- UI powered by React, Monaco Editor, Cytoscape, Recharts, and Vite

## License

MIT
</CodeContent>
<parameter name="EmptyFile">false