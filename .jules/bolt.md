## 2024-07-20 - Avoid Chained Array Methods in Hot Paths
**Learning:** Using chained array allocations like `.filter(match => ...).slice(0, 1)` or similar `.filter()` constructs inside deep matching loops (`NetworkGenerator.ts`) produces large amounts of intermediate arrays, creating heavy GC pressure and slowing down performance on hot paths.
**Action:** Replace chaining logic with dedicated loops over the match candidates, exiting early (`break`) once the desired matches (like `isMatchOnce`) are found.
