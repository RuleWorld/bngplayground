# START HERE — implementation handoff

You are implementing a set of changes to the **BNG Playground** monorepo
(TypeScript/WASM; `packages/engine`, `packages/mcp-server`; Jules agents driven
by `.github/workflows/*.yml`). This package is self-contained; you do not need
the conversation that produced it.

## Ground rules — read before touching anything

1. **The specs were written against a July-2026 snapshot. The live repo may have
   drifted.** For every edit, `grep` the live repo for the target first. If it's
   not there verbatim, adapt to what IS there — never force a stale string, never
   invent a symbol, file, or API.
2. **Verify, don't recall.** Confirm file paths, script names, and function
   signatures against the actual tree before editing. The repo is truth over this
   doc.
3. **Never weaken correctness to get green.** Do not lower coverage thresholds,
   delete/skip tests, loosen tolerances, or disable the test harness
   (`scripts/run_full_tests.mjs`). If CI fails, fix the cause.
4. **Some values do not exist in this package — they must come from the live repo
   or a local run.** These are marked `⛔ GET FROM LIVE`. Do not fabricate them.
5. **Do one change at a time and keep diffs reviewable.** This is a
   human-in-the-loop, PR-reviewed repo.

## What this package contains

```
START-HERE.md        <- you are here (ordered plan + behavior rules)
reference-plan.md    <- full rationale for every decision (read if a change seems odd)
EDITS.md             <- exact edits to EXISTING files (E1..E6)
DELETE.md            <- files to remove (D1..D2)
add/                 <- new files, drop in at the shown paths
  .github/workflows/performance-improver.yml   (drives the EXISTING tests/profile-everything.spec.ts)
  perf/models/PUT-MODELS-HERE.md               (OPTIONAL — built-in stressors suffice)
optional-later/      <- graduation gates; build only when you get to them
  scripts/check-suppression-budget.mjs
  .github/workflows/suppression-budget.yml
```

## The big picture (so you don't "improve" things wrongly)

The Jules agents are being treated as a **multistart optimization** in three groups:
- **Hill-climbers** (type-strictness): greedy, then graduate to a CI gate.
- **Covering search** (fuzzer, robustness, resilience, worker-protocol, dead-code,
  docstrings, parity, weekly-cleanup): the firehose — always open a PR, human is
  the filter, vary the starting point each run.
- **Genuine multistart** (performance-improver): fan out across subsystems against
  one shared benchmark, keep the best.

The single most important invariant: **`performance-improver` is only meaningful
if there is one trustworthy benchmark to compare its parallel starts against.** No
benchmark → the fan-out is worthless. That's why the benchmark and the test-command
fix (Tier 0) come before everything else.

---

# Do it in this order

## TIER 0 — correctness of the evaluator (nothing is trustworthy until this is done)

**0.1** Apply **EDITS.md E1** (add `test:full:safe` to `package.json`).

**0.2** There is NO new benchmark to add. The yardstick is the EXISTING harness
`tests/profile-everything.spec.ts`, which already times parse/networkgen/SSA,
captures the engine's deterministic PROFILE_DATA op-counts, generates a 2^N
combinatorial netgen stressor, and writes a JSON report. `⛔ GET FROM LIVE`:
- Confirm it runs hang-safe with the perf env, pure-JS (no CVODE):
  `PROFILE_MULTISITE=7,9 PROFILE_SIM=ssa PROFILE_ODE_COMPARE=0 PROFILE_REPEATS=5 \
   PROFILE_OUT=/tmp/p.md node scripts/run_full_tests.mjs tests/profile-everything.spec.ts`
  Check `/tmp/p.json` has nonzero `species`/`reactions` and a populated
  `breakdown` with `calls` per section. Record the run-to-run spread of `genMs`
  and `simMs.ssa` — that variance sets how big a wall-clock delta must be to count.
- `perf/models/` is OPTIONAL — the built-in `multisite_N` stressor is the netgen
  workload. Add real models only for extra representativeness (see the README
  there); the fan-out does not need them.
- No SSA-seed worry here: SSA is measured as median wall-clock over repeats (the
  harness varies the seed across repeats on purpose to average stochastic noise),
  and networkgen op-counts are seed-independent. So no leg needs to be dropped for
  seeding reasons.

**0.3** Apply **EDITS.md E2** (fix test command + scope in the six/seven remaining
agent workflows).

**0.4** Apply **EDITS.md E6** (document `test:fast` / `test:full:safe` in `AGENTS.md`).

## TIER 1 — the perf fan-out (depends on Tier 0)

**1.1** Drop in `add/.github/workflows/performance-improver.yml`, REPLACING the old
one. It's a 3-leg matrix (networkgen, ssa, parse) that DRIVES
`tests/profile-everything.spec.ts` via the hang-safe wrapper — it does not add a
new benchmark. networkgen decides wins on deterministic `breakdown.*.calls`
op-counts; parse and ssa use replicated wall-clock. `jules-action` is pinned to
`@v1.0.0` (see the comment in the file to hard-pin to a SHA).

## TIER 2 — remove / retire (frees the slots the fan-out uses)

**2.1** Apply **DELETE.md** (remove `wasm-bundle-shrinker.yml` and
`coverage-climber.yml`).

## TIER 3 — security (cheap, independent, not covered by CodeQL)

**3.1** Apply **EDITS.md E3a–E3d** (permissions block + concurrency guard on every
remaining Jules workflow; `ci-failure-fix` fork-gating + log-injection note; SHA
pin). Note: Dependabot's `github-actions` ecosystem is ALREADY configured, so it
maintains the pin — you only set the initial SHA.

## TIER 4 — scheduling + firehose behavior

**4.1** Apply **EDITS.md E4** (staggered weekday cron table).
**4.2** Apply **EDITS.md E5** (Group B prompts: vary the start, always-open PR,
surface assumptions, lock the evaluator). Do NOT apply always-open to
type-strictness.

## TIER 5 — graduation gates (optional; build when ready)

**5.1** type-strictness ratchet: use `optional-later/scripts/check-suppression-budget.mjs`
and `optional-later/.github/workflows/suppression-budget.yml`. `⛔ GET FROM LIVE`:
run `node scripts/check-suppression-budget.mjs --write` against the live repo to
create `.suppression-budget.json` (the "~360" figure in the rationale is from a
stale snapshot — do not hardcode it), commit it, then keep the type-strictness
agent running to burn the count DOWN. When it nears zero, replace this gate with
hard eslint rules and retire the agent.
**5.2** dead-code / coverage gates: described in DELETE.md D2 and reference-plan.md;
both have prerequisites (knip/ts-prune; a working vitest coverage provider).
Confirm those exist before building. Not turnkey here.

---

## Definition of done for Tier 0–1 (the part that matters most)

- `npm run test:full:safe` exists and runs the full suite without hanging.
- The profile harness runs pure-JS and emits JSON with nonzero `species`/
  `reactions` and a populated `breakdown` (the netgen op-counts), via:
  `PROFILE_SIM=ssa PROFILE_ODE_COMPARE=0 PROFILE_OUT=/tmp/p.md node scripts/run_full_tests.mjs tests/profile-everything.spec.ts`
- `performance-improver.yml` is the 3-leg matrix that drives that spec, pinned to
  `@v1.0.0` (or a SHA), with `jules_api_key: ${{ secrets.JULES_API_KEY }}` present.
- No workflow calls raw `npm run test:full`.

If you get blocked on a `⛔ GET FROM LIVE` value, STOP and surface it — do not
substitute a guess.
