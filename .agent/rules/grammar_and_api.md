---
trigger: model_decision
description: When working with the ANTLR4 parser
---

# Grammar & API Rules

Rules for the ANTLR grammar updates and external API integration.

## ANTLR Grammar

- **Loose Models**: Support BNGL files without explicit `begin model`/`end model` blocks if they contain valid action blocks.
- **Prefixes**: Allow `@compartment:Species` syntax in addition to standard species definitions.
- **States**: Support integer states like `st~0` without requiring strings.
- **Ambiguity**: Distinguish between molecule tags (`%1`) and dot operators (`.`).

## External APIs (BioModels)

- **CORS**: Always route BioModels requests through a local proxy (`/api/biomodels`) in `vite.config.ts` to bypass CORS restrictions.
- **Archives**: Zip archives returned by the API (like OMEX) must be identified by content inspection, not just Content-Type, and extracted properly.

## Performance

- **Heavy Computation**: CPU-intensive tasks like SBML atomization or Nauty canonicalization MUST run in a Web Worker to keep the UI responsive.
