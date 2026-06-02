## 2026-05-30 - Monotonically increasing duplicate checks
**Learning:** Checking for duplicates inside O(N^2) inner loops during data initialization (like simulation setup phases mapping dependencies) is a major performance drain when using `Array.prototype.includes()`. In scenarios where the element being pushed is an auto-incremented index (e.g., `i` in an outer loop), the target array naturally becomes sorted and strictly monotonic.
**Action:** Instead of `array.includes(index)`, use a simple `O(1)` check on the last element: `if (array.length === 0 || array[array.length - 1] !== index) { array.push(index); }`. This eliminates the O(N) array scan entirely while achieving identical uniqueness guarantees.

## 2026-05-30 - O(N) array includes vs O(1) Set in reaction simulation loop
**Learning:** During simulation setup (`SimulationLoop.ts`), checking `array.includes()` inside deeply nested loops (like the outer concrete reactions loop and inner products loop) results in `O(N * M)` overhead where N is array size and M is number of product combinations.
**Action:** Convert the array (e.g., `pstatIndices`) to a `Set` once before the loop and use `set.has()` for O(1) lookups to significantly speed up initialization overhead for large models.
