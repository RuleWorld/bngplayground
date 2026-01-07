---
description: Run a senior dev code review cycle - generates critical feedback and addresses issues
---

# Senior Dev Code Review Workflow

This workflow simulates a senior developer code review process. It runs in two phases:

1. **Review Phase**: Generate a harsh, critical review artifact with 25+ issues
2. **Fix Phase**: Systematically address each issue from the review

## How to Invoke

Use the slash command: `/code-review`

Or say: "Run the code review workflow" or "Do a senior dev review"

---

## Phase 1: Generate Review Artifact

### Step 1.1: Identify Scope

First, determine what files to review. Ask the user or use recent git changes:

```bash
git diff HEAD --name-only | grep -E '\.(ts|tsx|js|jsx)$'
```

Or review specific directories the user mentions.

### Step 1.2: Create the Review Artifact

Create a new markdown artifact at the artifacts directory with name `code_review_round_N.md` where N is the next round number.

### Step 1.3: Review Mindset

When generating the review, adopt this persona:

> You are a senior software engineer with 15+ years of experience. You are doing a code review for a junior developer. You are HARSH but FAIR. You do NOT like this implementation and will find every possible issue. Your job is to make the code production-ready.

Focus areas:

- **Security vulnerabilities** (injection, XSS, DoS, privilege escalation)
- **Performance bottlenecks** (O(n²) loops, excessive allocations, missing caches)
- **Error handling gaps** (missing try/catch, unhandled promises, silent failures)
- **Type safety issues** (`any` abuse, missing null checks, unsafe casts)
- **Edge cases** (empty inputs, NaN, Infinity, negative values, unicode)
- **API design flaws** (inconsistent naming, poor ergonomics, tight coupling)
- **Test coverage gaps** (missing unit tests, no integration tests, no fuzz tests)
- **Documentation** (missing JSDoc, unclear comments, outdated README)
- **Maintainability** (dead code, duplicated logic, magic numbers)
- **Concurrency** (race conditions, deadlocks, stale closures)
- anything else that generally goes against user experience

### Step 1.4: Review Artifact Format

Structure the artifact like this:

```markdown
# Senior Dev Code Review: Round N

**Date:** [current date]
**Files Reviewed:** [list of files]
**Verdict:** ❌ NOT READY / ⚠️ NEEDS WORK / ✅ APPROVED

---

## Critical Issues (Must Fix)

### 1. [Issue Title]

**File:** `path/to/file.ts`
**Line:** 123-145
**Severity:** 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low

**Problem:**
[Description of the issue]

**Evidence:**
```typescript
// code snippet showing the problem
```

**Recommendation:**
[How to fix it]

---

[Repeat for all 25+ issues]

---

## Summary

| Severity | Count |
| --- | --- |
| 🔴 Critical | X |
| 🟠 High | X |
| 🟡 Medium | X |
| 🟢 Low | X |

**Next Steps:**

1. Fix all Critical issues before proceeding
2. Address High issues in this sprint
3. Medium/Low issues can be tracked as tech debt

```

---

## Phase 2: Fix Issues

### Step 2.1: Prioritize by Severity

Process issues in order:

1. 🔴 Critical (blocks deployment)
2. 🟠 High (should fix before merge)
3. 🟡 Medium (nice to have)
4. 🟢 Low (tech debt)

### Step 2.2: For Each Issue

1. Read the issue description and recommendation
2. View the relevant file and line range
3. Implement the fix
4. Update the review artifact to mark the issue as resolved:
   - Change `### 1. [Issue Title]` to `### ~~1. [Issue Title]~~ ✅ FIXED`
   - Add a note: `**Resolution:** [brief description of fix]`

### Step 2.3: Verify Fixes

After addressing issues:

// turbo

```bash
npm run test
```

// turbo

```bash
npm run build
```

### Step 2.4: Create Summary

Update the review artifact's Summary section to show:

- How many issues were fixed
- Any issues deferred (and why)
- Recommendation for next round

---

## Automation Notes

- The reviewer phase should NOT auto-proceed (user should approve the artifact)
- The fix phase CAN auto-proceed for routine changes
- Always run tests after fixes
- Create a new round number for each invocation

---

## Example Invocation

User: "/code-review on services/safeExpressionEvaluator.ts"

1. Agent reads the file
2. Agent creates `code_review_round_N.md` with 25+ issues
3. Agent notifies user to review the artifact
4. User approves
5. Agent fixes issues one by one
6. Agent runs tests
7. Agent updates artifact with resolutions
8. Agent notifies user of completion
