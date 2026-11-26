# BioNetGen Playground Documentation

Welcome to the official documentation for the **BioNetGen Playground**, a browser-native modeling and simulation environment for BioNetGen (BNGL).

```{image} ../public/logo.png
:alt: BioNetGen Logo
:width: 200px
:align: center
```

## Introduction

BioNetGen Playground allows you to edit BNGL models, parse them, generate reaction networks, run simulations, and analyze results—all within your browser.

## Core Features

- **BNGL Editor**: Smart editor with real-time parsing (ANTLR4).
- **Simulation Engine**: Powered by Web Workers and WASM.
- **WASM Acceleration**:
  - **CVODE (SUNDIALS)**: Stiff ODE solver.
  - **NFsim**: Network-free stochastic simulator.
  - **Nauty**: High-speed canonical labeling for symmetry reduction.
- **Multicompartment Support**: Modeling transport and reactions in cBNGL.
- **Visualization**: Interactive 2D charts, regulatory graphs, and contact maps.

## Contents

```{toctree}
:maxdepth: 2
:caption: User Guide

quickstart
solvers
mcp-server
```

```{toctree}
:maxdepth: 2
:caption: Engineering Notes

engineering/bng2-reference-behaviours
engineering/bng2-stat-factor-derivation
engineering/stat-factor-finding
engineering/rate-field-and-fixture-integrity
engineering/nfsim-executable-resolution
engineering/results-export-audit
```

---

The BioNetGen Playground is open-source and released under the **MIT License**.
Join us on [GitHub](https://github.com/ruleworld/bngplayground)!
