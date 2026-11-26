---
description: Extract recurring patterns and gotchas from past conversations into project rules
---

# Knowledge Extraction Workflow

Extract challenges and patterns from past conversations/walkthroughs into project rules under `.agent/rules/`.

## Prerequisites

- Access to `~/.gemini/antigravity` directory

## Steps

### 1. Find Walkthroughs

```bash
find ~/.gemini/antigravity/brain/ -name "walkthrough.md*" -type f 2>/dev/null
```

### 2. Read Each Walkthrough

Extract:

- **Challenges encountered** (errors, gotchas, blockers)
- **Patterns established** (reusable solutions)
- **Learnings** (verified BNG2.pl behaviors or engine invariants)

### 3. Categorize Findings

Group extracted knowledge by domain:

| Domain | Target Rule File |
| --- | --- |
| UI & Analysis | `.agent/rules/analysis.md` |
| SBML Atomizer | `.agent/rules/atomizer.md` |
| BioNetGen Reference | `.agent/rules/bionetgen-review.md` |
| Build & Parser | `.agent/rules/build_and_parser.md` |
| Core Engine & Matching | `.agent/rules/engine.md` |
| ANTLR Grammar & APIs | `.agent/rules/grammar_and_api.md` |
| Visualization | `.agent/rules/visualization.md` |
| WASM Solvers | `.agent/rules/wasm.md` |

### 4. Check Knowledge Items

```bash
ls ~/.gemini/antigravity/knowledge/
```

### 5. Update Rule Files

For each finding:

1. Check if already documented in the target rule file.
2. Add if new — include concise problem, cause, and verified fix.
3. Never commit changes without explicit user approval.

## Output

- Updated rule files in `.agent/rules/`
- Summary of extracted learnings presented to the user
