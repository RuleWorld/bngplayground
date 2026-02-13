---
trigger: model_decision
description: When working with the parser
---

# Parsing & Build Configuration Rules

Rules for maintaining the parser logic and build environment.

## Parsing Logic (BNGLParser.ts)

- **Recursive Splitting**: Do NOT use regex `split` for structures with nested delimiters (e.g., `!+` or `max_stoich=>{...}`). Use manual loop-based parsing with depth tracking.
- **Quote Handling**: Ensure all regexes and string handlers support BOTH single (`'`) and double (`"`) quotes.
- **Keyword Resilience**: Support reserved keywords (e.g., `type`, `Species`) as molecule/component names to prevent parsing errors in complex models.
- **Entity List Splitting**: When splitting reaction strings into reactants/products (using `+`), ensure context-awareness for wildcards like `!+` to avoid incorrect splits.

## Build Configuration (Vite)

- **Optimize Dependencies**: Large libraries used in workers (e.g., `jsep`, `antlr4ts`) MUST be explicitly included in `vite.config.ts` under `optimizeDeps.include`.
  - **Reason**: Runtime discovery of these dependencies by Vite triggers a full page reload, which manifests as a "Worker Crash" or timeout during batch processing.

## Validation Strategy

- **Ground Truth**: Always validate parser results against `BNG2.pl` output (species/reaction counts).
- **Iteration Limits**: Default iteration limits (e.g., 20) in `NetworkGenerator` are too low for extensive networks. Increase them or strictly verify against BNG2 if counts are low.

## Expression Compilation

- **Exponentiation**: BNGL `^` MUST be translated to JavaScript `**` or `Math.pow()` in all evaluation contexts (JIT and safe evaluation).
- **Functions**: Map BNGL functions (`exp`, `ln`, `log10`, `sqrt`, `rint`, etc.) to their `Math.xxx` equivalents.

## Simulator Exports (NFsim)

- **Rate Law Mapping**: Export complex or large functional rate laws as evaluated **Parameters** in BNGXML, not as **Functions**, to ensure NFsim compatibility.
