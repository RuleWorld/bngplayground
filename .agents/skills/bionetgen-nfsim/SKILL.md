---
name: bionetgen-nfsim
description: Use for NFsim/network-free modeling, NFsim compatibility, molecularity or complex bookkeeping, large complexes, traversal/global molecule limits, DeleteMolecules, or NFsim-specific discrepancies. Do not use for ordinary network-based BNGL authoring when NFsim semantics are irrelevant.
---

# NFsim guidance

Use this skill when network-free semantics are part of the question. First validate BNGL and identify whether the issue is parser, rule semantics, NFsim adapter, native NFsim, or stochastic sampling. Compare ensembles/reference outputs when the claim is statistical.

Check complex bookkeeping flags and their distinct meanings, especially `-bscb`; distinguish `+` from `.` and connected from disconnected patterns. Treat traversal/UTL limits and global molecule limits as explicit failure modes. Review `DeleteMolecules`, function/chaining behavior, and state representation before changing a rule. Do not assume a bundled legacy NFsim binary is the reference of record; use repository native-parity guidance.

Detailed traps and cross-engine checks are in `references/`.
