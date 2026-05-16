## 2024-05-18 - Avoid repeated .find() in optimization loops
**Learning:** O(N) array search inside nested optimization loops (e.g. paramFitter) over simulation datasets causes significant performance degradation. The repeated execution of find mapping rows to timePoints can be pre-computed outside the loop to be O(1) inside.
**Action:** Always extract invariant computations outside nested loops during algorithm evaluations. Interpolations over datasets should map the rows once for given times, instead of repeating search across multiple observables within the loops.
