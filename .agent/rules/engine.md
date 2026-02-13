---
trigger: model_decision
description: When working with pattern matching and network generation
---

# Core Engine & Matching Rules

Engineering standards for graph matching and network generation.

## Pattern Matcher (VF2 & BNG Parity)

- **Bond Suffix `(b)`**: A site specified as `A(b)` (no bond label) MUST match an **unbound** site.
- **Disconnected Patterns**: VF2 must explicitly handle patterns with multiple connected components (joined by `.` in BNGL). Match each component independently.
- **Wildcard Suffixes**:
  - `!+`: Match one or more bonds.
  - `!?`: Match zero or more bonds (Don't Care).

## Network Generator

- **Transport Logic**: Force-update a molecule's compartment if the rule pattern specifies a location (e.g., `A()@Nuc`).
- **Bond Preservation**: Bonds on sites **not mentioned** in the product pattern MUST be preserved.
- **Molecule Identity**: Track molecule mappings from Reactant to Product using persistent markers (e.g., reactant index) to avoid swapping symmetric molecules.
- **Symmetry Factors**:
  - For ODE simulations, if the `NetworkGenerator` incorporates multiplicity into the `effectiveRate`, set `degeneracy: 1` to prevent double-counting in the solver.
  - SSA simulations ignore `degeneracy` and rely on individual embeddings; ensure rate scaling is handled accordingly.
- **MoveConnected**: This keyword is NOT yet implemented. Connected complexes currently transport one molecule at a time.
- **Steady-State Detection**: Use L2 Norm of all species derivatives for termination logic.

## Performance

- **Bitsets**: Use bitsets for fast adjacency checks in `SpeciesGraph`.
- **Avoid Object Churn**: Reuse `Int32Array` or pre-allocated maps inside the recursive `vf2Search`.

## Compartments & cBNGL

- **Notation Support**: Parser must handle BOTH prefix (\@PM:Species\) and suffix (\Species@PM\) notations for compartments.
- **Heterogeneous Scaling**: When reacting 3D (cytoplasm) and 2D (membrane) species, scale the rate by the 3D compartment volume (Highest Dimension Rule).
- **Product Inheritance**: Products of heterogeneous reactions should inherit the compartment of the lower-dimension reactant (e.g., L@EC + R@PM -> LR@PM).

## Stochastic Simulation (SSA)

- **Reproducibility**: ALWAYS use the seeded `SeededRandom` (Mulberry32) instead of `Math.random()` for stochastic steps.
- **Zeroth-Order Reactions**: Ensure propensity for `0 -> A` is scaled by the reactant volume to avoid `NaN` or incorrect rates.
- **Exploding Models**: Implement a `maxEvents` safeguard (default 100M) to prevent infinite loops in unstable models.
