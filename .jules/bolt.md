# Bolt Learnings

- **2026-07-20**: Identified a significant bottleneck in `canPossiblyMatch` during model network generation and matching. Calling `startsWith` and allocating Map iterators inside hot loops was extremely slow. Cached the wildcard-free fingerprint as a flat array of tuples on the SpeciesGraph, reducing string checking and allocation overhead.
