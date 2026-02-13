---
trigger: always_on
---

# BioNetGen Source of Truth

Defer all final decisions about BNGL syntax, semantics, and behavior to the official BioNetGen implementation. **Never guess about BNG2 behavior.**

## How to Check

1. **First choice:** Read `bionetgen_repo/` and `bionetgen_python/` in the workspace
2. **If too large:** Use the GitHub MCP server for `RuleWorld/bionetgen`
3. **If MCP unavailable:** Search the web for the specific BNG2 behavior

## What This Means in Practice

- If you're about to say "BNG2 doesn't support X" → **check first**
- If a model fails and you think the BNGL syntax is wrong → **run it through BNG2.pl before changing it**
- If you want to skip or disable a keyword (e.g., `MoveConnected`, `if()`, `max_stoich`) → **read the Perl source for that keyword first**
- If you're unsure whether a rate law, function, or action is valid → **test it with BNG2.pl**

## BNG2.pl Path

```
perl "C:\Users\Achyudhan\anaconda3\envs\Research\Lib\site-packages\bionetgen\bng-win\BNG2.pl" <model.bngl>
```

## Common False Assumptions (Do Not Repeat)

- ❌ "BNG2 doesn't support `if()` in network generation" → It does
- ❌ "`An_2009` is an example model" → It's in `public/models/`, not `example-models/`
- ❌ "NFSim models can use ODE" → They cannot; they hang or produce wrong output
- ❌ "`MoveConnected` should be disabled" → Read the Perl source; it's often a no-op, not a bug

## Numerical Sensitivity

- **Hill Functions**: Small errors in binding observables are squared or cubed by Hill exponents, leading to significant output mismatches (3-5%). Precision is critical in precursor species.

## Debugging Workflow

- **Function Unrolling**: If BNG2 fails to parse a model with deep function nesting or argument-heavy functions, try **inlining** the logic directly into the rate laws as a workaround.