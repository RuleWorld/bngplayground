# Search policy

1. Search RuleHub before inventing an unfamiliar mechanism when a precedent is likely to exist.
2. Apply filters before ranking.
3. Prefer exact ID/name/tag matches only as a bounded lexical boost over semantic relevance.
4. Return metadata and resource links, not full BNGL files.
5. Read the exact resource before using code.
6. If semantic search is unavailable, report lexical fallback rather than implying equivalent ranking quality.
