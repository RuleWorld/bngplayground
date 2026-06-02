## 2023-10-27 - Parallelize parameter estimation candidate evaluations
**Learning:** Sequential `await` calls inside iterative loops (like variational inference loops) introduce severe latency, especially when invoking asynchronous mock/real simulation functions.
**Action:** Replaced a sequential `for` loop that evaluates parameter candidates with a 3-phase concurrent approach using `Promise.all`. This allows candidate parameter objectives to be computed concurrently, dropping execution time from ~3.3 seconds to ~175 milliseconds for batches of 32.

## 2026-05-30 - Monotonically increasing duplicate checks
**Learning:** Checking for duplicates inside O(N^2) inner loops during data initialization (like simulation setup phases mapping dependencies) is a major performance drain when using `Array.prototype.includes()`. In scenarios where the element being pushed is an auto-incremented index (e.g., `i` in an outer loop), the target array naturally becomes sorted and strictly monotonic.
**Action:** Instead of `array.includes(index)`, use a simple `O(1)` check on the last element: `if (array.length === 0 || array[array.length - 1] !== index) { array.push(index); }`. This eliminates the O(N) array scan entirely while achieving identical uniqueness guarantees.

## 2026-06-02 - Optimize find/findIndex with manual for loops
**Learning:** Using higher-order array methods like `.find()` or `.findIndex()` inside nested O(N^2) or O(N*M) hot loops incurs significant callback allocation and iteration overhead. Replacing them with manual `for` loops enables early loop termination and eliminates function calls.
**Action:** Replaced `Array.prototype.find()` and `Array.prototype.findIndex()` calls with manual `for` loops in performance-critical paths like `NetworkGenerator.ts` map symmetry groups and `SimulationLoop.ts` setup logic to reduce constant factor overhead.

## 2026-06-02 - Eliminate array .find() in hot loops
**Learning:** `Array.prototype.find()` introduces substantial overhead due to function allocation and implicit parameter passing when repeatedly executed millions of times (e.g. inside `SimulationLoop` step updates or `NetworkGenerator` pattern matching loops). Microbenchmarks show that replacing `.find()` with a manual O(N) `for` loop provides up to a ~15x performance improvement on local variables and properties inside inner loops.
**Action:** When working in hot simulation loops (like evaluating ODE RHS functions, matching BNGL patterns, or exporting BNGXML over thousands of states), manually iterate arrays with `for` loops instead of using `.map().find()`, `.filter()`, or `.find()`.
