## 2025-05-28 - Optimize Array FindIndex Inside Loops
**Learning:** Using `findIndex()` coupled with a `Set` tracking used indices inside a loop results in an O(N²) worst-case bottleneck that scales poorly, especially in structural mappings like BioNetGen XML AST traversal.
**Action:** Replace `findIndex` and the tracking `Set` with a precomputed `Map<string, number[]>` grouping item indices by signatures. During iteration over the target arrays, use `list.shift()` or index offsets to retrieve values in O(1) time to keep overall time complexity at O(N).
