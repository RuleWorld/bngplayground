---
description: Run a senior dev code review cycle (v2.0) - TDD, Parity Checks, and Strict Rubric
---

# Senior Dev Code Review Workflow v2.0

This workflow performs a rigorous, senior-level code review. It emphasizes TDD, strict type safety, and parity with official BioNetGen implementations.

## Phase 1: Context & Analysis

Before generating the review, gather facts.

### 1.1 Automated Health Check

Run the following to understand the current state of the codebase:

```bash
npm run type-check   # or tsc --noEmit
npm run lint         # check for style/quality issues
```

*Note: If the codebase is already broken, acknowledge existing errors so you don't report them as "new" issues unless they are critical blockers.*

### 1.2 Identify Scope

Determine what files to review.

- User specified files?
- Recent git changes? (`git diff HEAD --name-only`)

### 1.3 Reference Check (Parity)

**CRITICAL:** This project mimics BioNetGen. You **MUST** consult the reference implementations to ensure logic parity if you are reviewing core logic (parsing, simulation, graph theory).

- **Python Reference:** `bionetgen_python/` (PyBioNetGen)
- **Perl/Source Reference:** `bionetgen_repo/` (BioNetGen source)

*If logic seems weird, check these folders before marking it as "wrong". It might be weird because it's matching the reference behavior.*

### 1.4 Lens Selection (Optional)

Pick a specific "Lens" for this review if requested:

- **Security:** Injection, ReDoS, XSS, DoS, Safe Evaluation.
- **Performance:** Allocations (GC), Big-O complexity, React renders, Hash collisions.
- **Maintainability:** DRY, SOLID, naming, directory structure.

---

## Phase 2: Review Generation

Create a markdown artifact: `code_review_round_N.md`.

### 2.1 Persona & Rubric

Adopt the persona of a **Principal Software Engineer (15+ YOE)**. You are strict but constructive.

**Severity Rubric:**

| Level | Criteria | Example |
| :--- | :--- | :--- |
| 🔴 **Critical** | Security vuln, Data loss, Crash, Build Break, Logic Error (bad math/physics). | SQL injection, `any` abuse in core types, wrong ODE formula. |
| 🟠 **High** | Broken feature, Memory Leak, significant Performance Regression, Race Condition. | O(N^2) in hot loop, unhandled Promise rejection, incorrect test. |
| 🟡 **Medium** | Edge case bug, "Code Smell", Hard to maintain, Poor Error Message. | Duplicated logic, magic numbers, confusing variable names. |
| 🟢 **Low** | Style, Comment, Refactor suggestion, naming convention. | Typo in comment, unused import. |

### 2.2 Artifact Format

```markdown
# Senior Dev Code Review: Round N

**Date:** [Date]
**Focus:** [Lens, e.g. Performance/Security]
**Reference Check:** [Checked bionetgen_python? Yes/No]

## Critical Issues (Must Fix with TDD)

### 1. [Title]
**File:** `path/to/file.ts:L10-20`
**Severity:** 🔴 Critical
**Problem:** Description...
**Evidence:** Code snippet...
**Recommendation:** Fix...

...

## Summary
[Table of Counts]
```

---

## Phase 3: TDD & Fix (The "Fix Phase")

For each issue (Critical -> High -> Medium -> Low):

### 3.1 Create Reproduction (TDD)

**MANDATORY for Critical/High issues involves logic:**

1. Create a minimal test case (e.g., in `tests/fixtures/` or a new `.spec.ts`) that **reproduces the bug**.
2. Run the test to confirm it **FAILS**.

### 3.2 Implement Fix

1. Modify the code to address the issue.
2. Ensure you handle edge cases.

### 3.3 Verify Fix

1. Run the reproduction test again.
2. Confirm it **PASSES**.
3. Run related regression tests, including running /parity-check to ensure none of the models regressed.

### 3.4 Update Artifact

Update the review artifact to mark the issue as resolved.

- Change header to: `### ~~1. [Issue Title]~~ ✅ FIXED`
- Add: `**Resolution:** Fixed XYZ. Verified with test 'tests/repro_issue_1.spec.ts'.`

---

## Phase 4: Final Verification

1. Run full test suite: `npm run test`
2. Run build check: `npm run build`
3. Update artifact summary with final stats.
4. Notify user.
