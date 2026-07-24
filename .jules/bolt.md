## 2026-07-24 - Avoiding chained array allocations in hot comparators

**Learning:** When sorting collections using `Array.prototype.sort`, the comparator function is executed many times (`O(N log N)`). Using chained methods that allocate intermediate arrays (such as `.filter(condition).length > 0`) inside the comparator can significantly degrade performance due to garbage collection and memory allocation overhead. Replacing these with simple `for` loops avoids the allocation entirely.

**Action:** Whenever optimizing hot paths, especially comparator functions or loops executed heavily, avoid methods like `.filter()`, `.map()`, and `.split()` if they can be replaced by direct string indexing (`.indexOf()`, `.substring()`) or simple iteration loops.
