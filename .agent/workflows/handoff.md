---
description: Generate a handoff document to carry state into a fresh conversation. Use when a conversation is getting long, the agent is referencing stale paths, or before starting a new session on an ongoing task.
---

# Handoff Workflow (`/handoff`)

This workflow generates a concise state document that can be pasted into a new conversation to continue work without losing context. Use this instead of continuing a degraded conversation.

## When to Use

- Conversation has exceeded ~50 turns
- Agent is referencing old file paths or stale artifact versions
- You've corrected the same mistake twice in the current session
- You're about to stop for the day and want to pick up tomorrow
- You're switching from one agent to another

## Steps

### 1. Gather Current State

```bash
# What tests are passing/failing right now?
npm run test:fast

# What files were recently modified?
git status --short
git diff HEAD --stat
```

### 2. Generate Handoff Document

Create a concise markdown artifact (target ≤ 40 lines):

```markdown
# Handoff: [Task Name]
Date: [YYYY-MM-DD]

## Current State
- Tests passing: [summary]
- Tests failing: [list specific tests or models]
- Last command run: [command]
- Last result: [1-line summary]

## What's Done
- [completed item 1]
- [completed item 2]

## What's Broken
- [model_or_test]: [error type - parse/divergence/timeout/missing GDAT]

## Key Files Modified This Session
- [path]: [what changed]

## DO NOT (mistakes made this session)
- [mistake 1 — e.g., "Do not use method=>'ode' for nfsim models"]

## Next Step
[One clear, actionable sentence]
```

### 3. Save (Local Only — `handoffs/` is gitignored)

Save to `handoffs/handoff_YYYY-MM-DD_v<N>.md` if persisting locally.

### 4. Start Fresh

In the new conversation, paste the handoff document as your first message:

> "Here is the state from my last session. Continue from the Next Step."

## Rules for the Agent Generating the Handoff

1. **Maximum 40 lines.** Keep it dense and actionable.
2. **No artifact history.** Don't paste old plan versions.
3. **Model names, not categories.** Say `genetic_bistability_energy`, not "some energy models."
4. **Commands, not descriptions.** Give exact reproducible commands.
5. **Include the DO NOT section.** Prevent the next session from repeating mistakes.

## Related Workflows

- [`/parity-check`](./parity-check.md) - Full model comparison
- [`/knowledge-extraction`](./knowledge-extraction.md) - Extract learnings into rules
- [`/smoke-test`](./smoke-test.md) - Quick validation after changes
