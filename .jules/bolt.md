## YYYY-MM-DD - O(N) Array Looks in Hot SSA Loop
**What:** Replaced an `indexOf` call on an array mapping safe observable names back to their index in the `SimulationLoop.ts` `getCurrentObsForPropensity` loop.
**Why:** Calling an O(N) array method like `indexOf` inside the highly-frequent SSA inner loop introduces significant overhead, causing execution to be potentially slower than the original non-lazy logic for models with large amounts of observables.
**Impact:** Eliminates a performance bottleneck ensuring the newly implemented lazy-evaluation flag provides tangible speedups in the SSA step simulation pipeline.
**Measurement:** Replaced O(N) array search inside a loop evaluated hundreds-of-thousands of times with O(1) direct-array lookup.
