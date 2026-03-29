# Simulation Solvers

BioNetGen Playground provides a comprehensive set of simulation methods for rule-based models.

## Detailed Solvent Overview

The playground features three main classes of solvers, all of which are accelerated using **Web Workers** and **WASM** to ensure high performance and a smooth, zero-latency UI experience.

### 1. **Stiff ODE Solver (CVODE)**
**Primary Choice for Deterministic Systems**

BioNetGen Playground uses the **SUNDIALS CVODE** library, compiled to WebAssembly (WASM), for simulating reaction networks. CVODE's adaptive time-stepping and stiff solver capabilities (using BDF methods) make it the industry standard for biological systems.

- **Stiff Sensitivity**: Automatically detects and solves stiff systems.
- **Precision**: High numerical accuracy for large reaction networks.
- **WASM Acceleration**: Native-speed ODE integration directly in the browser.

### 2. **Network-Free Simulator (NFsim)**
**For Extremely Large or Infinite State Spaces**

For models where network generation is impractical (e.g., due to combinatorial complexity), the playground integrates a WASM-compiled version of **NFsim**.

- **No Network Needed**: Simulates rules directly without expanding the full reaction network.
- **Stochastic Accuracy**: Provides exact stochastic trajectories for models that cannot be modeled as ODEs.
- **WASM Integration**: Full support for `nfsim.wasm` with client-side result streaming.

### 3. **Stochastic Simulation (SSA)**
**For Molecular Noise Analysis**

A native TypeScript implementation of the Gillespie Direct Method (SSA) is available for exact stochastic modeling of smaller systems where discrete effects are important.

- **Discrete Particles**: Tracks individual molecule copies.
- **Exact Stochasticity**: Accounts for molecular noise and fluctuations.

---

## Symmetry Reduction with Nauty

For large reaction networks, the playground uses **Nauty WASM** to perform fast canonical labeling and symmetry reduction. This significantly accelerates both network generation and simulation by mapping identical molecular states to the same canonical form.
