---
trigger: model_decision
description: When working with WASM
---

# WASM & Simulation Services Rules

Rules for maintaining and optimizing WASM-based simulators (NFsim, ODESolver).

## Memory Safety
- **Initialization**: Every variable used in a loop (especially counters and indices) MUST be initialized to `0` or a valid value. Uninitialized variables in WASM take random memory junk and cause erratic traps.
- **Pointers**: Initialize all pointers (e.g., to compartments or species types) to `nullptr` or equivalent to prevent immediate traps on access.

## Optimization
- **NFsim Disjoint Matching**: 
    - Use `std::unordered_set` for failed-match caches ($O(1)$ lookup).
    - Pre-filter matches by `MoleculeType` to avoid $O(N)$ scans of the entire system.
- **CVODE Stiffness**: 
    - Automatically detect stiffness (rate ratios $>10^9$) and apply robust solver settings (`stabLimDet`, `maxOrd`).
    - Use arbitrary-precision math (`decimal.js`) for parameter evaluation if parameter ranges span more than 15 orders of magnitude.

## Debugging
- **Diagnostic Stack**: Build WASM modules with `-fsanitize=undefined` and `SAFE_HEAP=1` for debugging.
- **Trace Flushed Logs**: Ensure `cerr` is flushed after every high-level simulation step to capture logs before a potential crash.
- **Interpretation**: Map Emscripten exit codes to human-readable hints in `nfsim_post.js`.
