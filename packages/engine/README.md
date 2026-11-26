# @bngplayground/engine

Pure TypeScript BioNetGen Language (BNGL) simulation engine. Zero browser dependencies.

## Features

- ANTLR4-based BNGL parser, validator, and BNGXML/SBML/SED-ML/OMEX writers
- Graph-based network generation with Nauty WASM canonicalization and cBNGL compartment support
- Deterministic ODE simulation (CVODE WASM, Rosenbrock23, RK4, RK45)
- Stochastic & hybrid simulation (Gillespie SSA, PLA, PSA)
- Network-free simulation (NFsim WASM) and spatial/multiscale simulation
- Sensitivity & identifiability analysis (Sobol, Fisher Information Matrix, profile likelihood, dose-response, bifurcation, LNA, perturbation screening)
- Bayesian inference (ABC-SMC) and parameter estimation
- Contact map generation, regulatory graphs, and rule-level attribution

## Usage

This is a private workspace package inside the BNG Playground monorepo (`packages/engine`):

```bash
npm run build -w @bngplayground/engine
```

Import directly from `@bngplayground/engine` inside workspace packages and app code.

## License

MIT