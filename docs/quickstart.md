# Quick Start

Getting started with BioNetGen Playground is quick and easy.

## Live Playground

The easiest way to use the playground is at:
**[ruleworld.github.io/bngplayground](https://ruleworld.github.io/bngplayground)**

## Fast Workflow

1. **Pick a model**: Select one from the **Example Gallery** (top-right).
2. **Edit and Parse**: Modify the BNGL in the editor and click **Parse** or press **Ctrl+S**.
3. **Run Simulation**: Select your simulation method (ODE or SSA) and click **Simulate**.
4. **Explore Results**: Switch between the **Time Courses**, **Parameter Scan**, and **Contact Map** tabs.

## Running Locally

If you'd like to run or build the playground on your local machine:

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Build and Start**:
   ```bash
   npm run build
   npm run dev
   ```
3. **Visit local environment**:
   Open your browser to `http://localhost:3000`.

### Building from Source
For advanced users wanting to modify the core engine:
- The playground uses a monorepo structure with the TypeScript engine in `packages/engine`.
- WASM solvers are located in `wasm-sundials` and `wasm-nfsim`, requiring standard C++ build tools (Emscripten).
