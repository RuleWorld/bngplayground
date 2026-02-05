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
- **Steady-State Detection**: Use L2 Norm of all species derivatives for termination logic.

## Performance

- **Bitsets**: Use bitsets for fast adjacency checks in `SpeciesGraph`.
- **Avoid Object Churn**: Reuse `Int32Array` or pre-allocated maps inside the recursive `vf2Search`.

## Compartments & cBNGL
- **Notation Support**: Parser must handle BOTH prefix (\@PM:Species\) and suffix (\Species@PM\) notations for compartments.
- **Heterogeneous Scaling**: When reacting 3D (cytoplasm) and 2D (membrane) species, scale the rate by the 3D compartment volume (Highest Dimension Rule).
- **Product Inheritance**: Products of heterogeneous reactions should inherit the compartment of the lower-dimension reactant (e.g., L@EC + R@PM -> LR@PM).
