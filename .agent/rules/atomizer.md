---
trigger: model_decision
description: When working with the atomizer
---

# Atomizer & BNGL Logic Rules

Rules for converting SBML to BNGL and maintaining BioNetGen compatibility.

## Molecule Type Definitions

- **Rule**: Declaring molecule types MUST include all possible states for every component.
- **Problem**: `M( phosphorylation~0 )` only declares state `0`.
- **Solution**: Use `M( phosphorylation~0~P )` to define the full state space.
- **Implementation**: Call `mol.str2()` instead of `mol.toString()` in `writeMoleculeTypes`.

## Reaction Rule Suffixes

- **Rule**: Every species in a rule pattern MUST include its `@compartment` suffix if the model has compartments.
- **Exception**: Fixed species must follow the order `@comp:$Molecule`.
- **Solution**: Use `standardizeName(spId)` + `@compId` consistently.

## Seed Species Consolidation

- **Rule**: Sum initial amounts/concentrations for isomorphic species mapping to the same BNGL pattern.
- **Reason**: BNG 2.9.3+ errors if multiple seed species describe the same pattern.

## Saturation Kinetics Scaling

- **Rule**: Use amount-based observables (`${Name}_amt`) for all saturation rate laws (Sat/MM/Hill).
- **Scaling**: Sat/MM parameters ($V_{max}$, $K_m$) must be in molecule units ($N_A \cdot V \cdot \text{conc}$).
- **Pro-tip**: If propensities use amounts, do NOT apply $(1/V)$ scaling in the propensity function.

## N-ary Complex Connectivity

- **Rule**: Atomized complexes with $N > 2$ molecules must be connected in a chain using predecessor/successor sites.
- **Problem**: $A.B.C$ (unbound) is not a single species in BNG.
- **Solution**: $A(b!1).B(f!1,b!2).C(f!2)$.

## Molecule Types
- **State Definitions**: Use \mol.str2()\ instead of \mol.toString()\ when generating molecule types to include all possible states (e.g., \P~0~P\), not just the current state.

## Fixed Species & Seeds
- **Prefix Order**: Fixed species with compartments MUST use the format \@compartment:\\.
    - **Incorrect**: \\$@compartment:Species\ (Parser error).
- **Isomorphism**: Consolidate isomorphic seed species by summing their concentrations if they map to the same atomized pattern.
