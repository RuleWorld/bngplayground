# Simulation Solvers

BioNetGen Playground provides a comprehensive set of simulation methods for rule-based models.

## Detailed Solver Overview

The playground features deterministic, stochastic, hybrid, network-free, and spatial solvers accelerated via **Web Workers**, **WASM**, and optional **WebGPU** to keep the UI responsive.

### 1. **Stiff & Non-Stiff ODE Solvers (CVODE, Rosenbrock23, RK4/RK45)**
**Primary Choice for Deterministic Systems**

BioNetGen Playground uses **SUNDIALS CVODE** compiled to WebAssembly (`public/cvode.wasm`) for simulating reaction networks. CVODE's adaptive time-stepping and BDF methods handle stiff biological systems reliably, with Rosenbrock23 and explicit RK4/RK45 available as fallbacks.

- **Stiff Sensitivity**: Automatically detects and solves stiff systems (`cvode`, `cvode_sparse`, `cvode_auto`).
- **Precision**: High numerical accuracy for large reaction networks.
- **WASM Acceleration**: Native-speed ODE integration directly in the browser.

Functional-rate bytecode is validated before the native WASM network is loaded.
Invalid operands, indices, opcodes, or stack depth reject the native binding,
log the reason, and leave the JavaScript RHS active. Sparse analytical Jacobians
are used only for mass-action networks; functional-rate networks use dense
CVODE's internal difference-quotient Jacobian.

### 2. **Network-Free Simulator (NFsim)**
**For Extremely Large or Infinite State Spaces**

For models where network generation is impractical (e.g., due to combinatorial complexity), the playground integrates a WASM-compiled version of **NFsim** (`public/nfsim.wasm`).

- **No Network Needed**: Simulates rules directly without expanding the full reaction network.
- **Stochastic Accuracy**: Provides exact stochastic trajectories for models that cannot be modeled as ODEs.
- **WASM Integration**: Full support for `nfsim.wasm` with client-side result streaming.

### 3. **Stochastic & Hybrid Solvers (SSA, PLA, PSA)**
**For Molecular Noise & Multi-Scale Copy Numbers**

- **SSA (Gillespie Direct Method)**: Exact discrete stochastic trajectories tracking individual molecule copies.
- **PLA (Partitioned Leaping Algorithm)**: Accelerated stochastic simulation classifying reactions by firing regime.
- **PSA (Partitioned Stochastic Algorithm)**: Hybrid ODE/SSA solver using Haseltine-Rawlings adaptive scaling between high- and low-copy species.

### 4. **Spatial & GPU Acceleration**
- **Spatial WASM (`public/spatial.wasm`)**: Particle-based spatial reaction-diffusion simulation.
- **WebGPU Solvers**: Optional GPU-accelerated ODE and SSA simulation with automatic CPU fallback.

---

## Symmetry Reduction with Nauty

For large reaction networks, the playground uses **Nauty WASM** to perform fast canonical labeling and symmetry reduction. This significantly accelerates both network generation and simulation by mapping identical molecular states to the same canonical form.
