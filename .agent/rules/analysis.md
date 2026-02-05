---
trigger: model_decision
description: When working with UI
---

# BioNetGen-Web Analysis & UI Rules

Logic and UX standards for the BNG Playground key features.

## Custom Expressions
- **Hybrid Parsing**: Custom observables can mix simple math (`+`, `*`) with complex BNGL patterns (`A(b!+)`).
    - **Rule**: Always use the "Pattern Discovery" engine to identify BNGL patterns first (protecting wildcards like `!+`) before splitting by math operators.
    - **Filtering**: When suggesting parameters for expressions, EXCLUDE rate constants. Only offer global seeds/initial concentrations.

## Dynamics & Trajectory Analysis
- **Model Explorer**:
    - **Locking**: Implement "neighborhood locking" so users can browse a subgraph of models without losing context.
    - **Portals**: Double-click on a node should navigate to that model in the editor.
- **Trajectory Explorer**:
    - **Method**: Use `bnglService.simulateCached` with unique seeds for ensemble runs.
    - **Clustering**: Use UMAP on time-flattened vectors to identify stochastic modes (bi-modality).

## Parser Verification
- **Limit Awareness**: The TypeScript parser (`NetworkGenerator`) has a recursion/iteration limit (default 20).
    - **Parity**: For large models (e.g., `Hat_2016`, `Blinov_2006`), this limit results in undercounting species/reactions vs BNG2.pl.
    - **Fix**: When rigorous parity is needed, increase iteration limits or rely on the `bng-win` executable for ground truth.
