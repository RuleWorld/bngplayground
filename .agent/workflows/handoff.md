---
description: Generate a handoff document to carry state into a fresh conversation. Use when a conversation is getting long, the agent is referencing stale paths, or before starting a new session on an ongoing task.
---

# Handoff Workflow (`/handoff`)

This workflow generates a concise state document that can be pasted into a new conversation to continue work without losing context. Use this instead of continuing a degraded conversation.

## When to Use

- Conversation has exceeded ~50 turns
- Agent is referencing old file paths or stale artifact versions
- You've corrected the same mistake twice in the current session
- `task.md` has more than 10 `.resolved.N` versions
- You're about to stop for the day and want to pick up tomorrow
- You're switching from one agent to another (e.g., Editor → Manager View)

## Steps

### 1. Gather Current State

// turbo-all

```powershell
# What tests are passing/failing right now?
npx vitest run src/gdat_benchmark.test.ts --reporter verbose 2>&1 | Select-String -Pattern "✓|✗|FAIL|PASS|Tests" | Select-Object -Last 30

# What files were recently modified?
git diff HEAD --name-only

# What's the current model count?
Examples:
(Get-ChildItem example-models/*.bngl).Count
(Get-Content src/gdat_models.json | ConvertFrom-Json).Count
```

### 2. Generate Handoff Document

Create a markdown artifact with this structure. Be **brutally concise** — this replaces 100K+ tokens of conversation history with ~500 tokens of state.

```markdown
# Handoff: [Task Name]
Date: [YYYY-MM-DD]

## Current State
- Tests passing: [N]/[number of models]
- Tests failing: [list specific model names]
- Last command run: [command]
- Last result: [1-line summary]

## What's Done
- [completed item 1]
- [completed item 2]

## What's Broken
- [model_name]: [error type - parse/divergence/timeout/missing GDAT]
- [model_name]: [error type]

## Key Files Modified This Session
- [path]: [what changed]

## DO NOT (mistakes made this session)
- [mistake 1 — e.g., "Do not use method=>'ode' for nfsim models"]
- [mistake 2]

## Next Step
[One clear, actionable sentence]
```

### 3. Save and Exit

Save the handoff document to the project root:

```powershell
# CRITICAL: Filename MUST include version suffix.
# Check for existing files (e.g. handoff_2024-01-01_v1.md) and increment.
# Default to v1 if no previous handoff exists for today.
# Format: handoffs/handoff_YYYY-MM-DD_v<N>.md
```

### 4. Start Fresh

In the new conversation, paste the handoff document as your first message. Prefix it with:

> "Here is the state from my last session. Continue from the Next Step."

## Rules for the Agent Generating the Handoff

1. **Maximum 40 lines.** If it's longer, you're including too much.
2. **No artifact history.** Don't paste old `task.md` versions or implementation plans.
3. **Model names, not categories.** Say `genetic_bistability_energy` not "some energy models."
4. **Commands, not descriptions.** Say `npx vitest run src/gdat_benchmark.test.ts -t "model_name"` not "run the test suite on the relevant model."
5. **Include the DO NOT section.** This is the most valuable part — it prevents the next session from repeating this session's mistakes.

## Related Workflows

- [`/parity-check`](.agent/workflows/parity-check.md) - Full model comparison
- [`/knowledge-extraction`](.agent/workflows/knowledge-extraction.md) - Extract learnings into rules
- [`/smoke-test`](.agent/workflows/smoke-test.md) - Quick validation after changes