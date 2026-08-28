---
name: bionetgen-authoring
description: Use when writing, editing, explaining, or reviewing BNGL model code. Use rulehub-model-search when real model precedent is needed; use bionetgen-nfsim for NFsim-specific behavior. Do not route ordinary model construction through Designer NLP.
---

# BioNetGen authoring

1. Identify molecular states, bonds, rules, observables, units, and intended simulator semantics.
2. Search RuleHub when an unfamiliar construct has useful precedent.
3. Write or edit BNGL directly.
4. Run `validate_model` before normal simulation; use `parse_bngl` for structure inspection and `generate_network` when expansion matters.
5. Treat official BioNetGen behavior as authoritative over chemical intuition.

Keep molecule types, component names, states, bonds, and top-level pattern connectivity explicit. Check rule molecularity, functional rates, observable semantics, compartment/volume units, parameter scope, action ordering, and network-based versus network-free consequences. Designer/INDRA composition is a compatibility/full-profile helper, not the default authoring route.

Important functional-rate trap: when BioNetGen uses a function as a rule rate, it treats the function as the rate constant and multiplies by reactant abundance. A function intended for `L() -> 0 f()` should not redundantly multiply by `L`.

See `SOURCES.md` and the references for the adapted expert material and detailed checks.
