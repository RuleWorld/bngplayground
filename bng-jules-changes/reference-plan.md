# Jules Workflow Change Plan (rev 2)

**Source:** the uploaded `julesplayground-main.zip` snapshot. It may lag your live repo — verify each item against the actual tree before acting. Where this doc and the repo disagree, the repo wins. Counts below (e.g. the `any` tally) are from the snapshot and are order-of-magnitude, not exact-as-of-today.

**Scope:** 12 scheduled Jules workflows + `ci-failure-fix.yml` (event-triggered), `AGENTS.md`, and the interaction with the existing `codeql` workflow.

**What changed since rev 1:** reframed around multistart optimization instead of autoresearch; corrected the bundle-vs-perf mixup; folded in the graduation decisions, the real `any` count, the revised slot math, the coverage explanation, and a CodeQL redundancy section.

---

## The governing frame: this is multistart, not autoresearch

Autoresearch is one trajectory with memory (ratchet on a locked metric). Multistart is many independent trajectories, no shared memory, keep the best. Your parallel PRs are the second thing — and independence, which looked like a defect against autoresearch, is the whole point of multistart. It also retroactively justifies the "no rejected-approaches list" call: in multistart you *want* uncorrelated starts, so seeding them with history would hurt.

But the agents aren't one shape. They're three, and each is run differently:

### Group A — Monotone hill-climbers (greedy descent, then graduate)
`type-strictness-tightener`, `coverage-climber` (weak member), and formerly `wasm-bundle-shrinker`.
One global number, one direction of "better." Not multistart — there's no multimodal landscape to restart across; every win is a strictly better base for the next run. "Pick the single worst and fix it" is *correct* here. **Never** make these "always open a PR with no win" — a hill-climber with nothing left to improve manufactures a useless diff to satisfy the rule. Let them no-op or emit a status line. These have a hard limit (a fixed objective on a moving codebase re-accumulates), so the end-state is **graduation to a CI gate** — see the Graduation section.

### Group B — Covering search (the real firehose)
`model-roundtrip-fuzzer`, `mcp-robustness-validator`, `error-resilience-auditor`, `worker-protocol-auditor`, `dead-code-pruner`, `docstring-coverage`, `engine-mcp-parity-auditor`, `weekly-cleanup`.
Goal isn't "find the optimum," it's "cover the space of defects and keep all of them." Your keep-everything / I'm-the-selector stance is right for these. **The bug to fix:** several prompts say "pick the single worst," which is a *deterministic* start — every run begins from the same point and re-searches the same neighborhood. That's the multistart failure mode: clustered restarts, low effective sample size, redundant PRs of the useless kind. Replace "pick the single worst" with "pick a target below threshold, varied across runs" — rotate regions, partition the tree across agents, or randomize target selection. Diversity of starts is the entire lever in a covering search and it's currently suppressed.

### Group C — Genuine multistart (`performance-improver` only)
Speeding up the engine is multimodal: many possible optimizations, some mutually exclusive, and a single local search gets stuck in a basin. Try many approaches from diverse starts, keep the best. This is the textbook case, and it's the one place a fan-out earns its cost. See the Perf Fan-out section.

**Where the metaphor breaks (don't over-apply):** real multistart samples *one* objective's domain. Your agents optimize different objectives (bytes vs crashes vs coverage), so "keep the global best" is nonsense *across* agents — keep-best-per-basin only works within one agent's output, or within a group chasing the same number.

---

## Correction: bundle-shrinker was the wrong target for your goal

You said the payoff you want is faster parsing, network generation, and simulation. **Bundle-shrinker does not do that.** It shrinks the download (bytes over the wire) → faster first *load*. Once WASM is in memory it has zero effect on runtime speed. The agent that makes parse/netgen/sim faster is **`performance-improver`**, which profiles the runtime hot paths.

**Decisions:**
- **Remove `wasm-bundle-shrinker`.** Load time isn't your priority and it's mostly done. Delete `.github/workflows/wasm-bundle-shrinker.yml`. (Optional: leave behind a static bundle-size budget check in CI so it can't silently regress — that's the graduation form of this agent.)
- **Move the multistart fan-out onto `performance-improver`**, which is the actual multimodal, runtime-affecting case.

---

## Perf fan-out (Group C, the multistart core)

**Decided: build A (Node harness over the pure-JS subsystems), defer B (browser/WASM harness).**

The fan-out is `performance-improver` split into parallel starts, each seeded to a
different subsystem so the restarts are diverse instead of clustered. Original
intent was 5 seeds, but two of them can't be measured in a Node benchmark and so
have no yardstick — and "no yardstick, no multistart" is the rule. Split:

**A — measurable now (this is the fan-out):** pure-JS subsystems that run in Node
and have deterministic correctness guards.
1. NetworkGenerator / matcher — `NetworkGenerator.ts`, `Matcher.ts`, `NetworkExpansion.ts`
2. SSA / simulation loop — `SimulationLoop.ts` + SSA solver (fixed seed required)
3. Parser — `parser/` hand-written internals (never `parser/generated/`)

**B — deferred (needs a browser/Playwright harness):** WASM paths — CVODE glue,
NFsim, Nauty canonicalization, and the worker↔WASM boundary. Skipped for now:
CVODE/NFsim internals live where the agent mostly can't reach (Emscripten C in
`wasm-sundials`; NFsim in the `akutuva21` fork), so measuring them buys a
dashboard, not a lever. The one genuinely agent-editable WASM target is the
worker↔WASM marshaling (redundant copies / re-serialization) — worth a browser
harness *only if* you specifically want that hunted. Big tool-build, narrow
payoff; parked deliberately.

Caveat on A's netgen seed: in Node, canonical labeling uses the JS
Weisfeiler-Lehman fallback because Nauty (WASM) doesn't load, so netgen wins may
not fully transfer to the browser's Nauty path. Still worth it — netgen is mostly
JS regardless.

Selection stays manual (you keep the best of the three, close the rest).

**Metric (P0.2, resolved): op-count primary + two-run-replicated wall-clock
fallback — and for networkgen the op-count already exists.** CORRECTION to an
earlier version of this plan: the engine DOES export deterministic work counters.
NetworkGenerator exposes `enableProfiling` / `disableProfiling` /
`resetProfileData` / `PROFILE_DATA`, broken down per phase (canonicalize,
findAllMaps, matchComponents, applyTransformation, isDuplicateReaction,
degeneracy, speciesDedup) with call counts. So:
- **networkgen** decides wins on those `breakdown.<section>.calls` — deterministic,
  no replication needed. species/reactions are correctness guards (must not change).
- **parse / ssa** have no exposed op-count → replicated wall-clock, with two-run
  agreement required.
There is no "export a counter" first task for networkgen; that was based on not
having found the existing profiling instrumentation.

**Harness (delivered):** NOT a new script. The yardstick is the EXISTING
`tests/profile-everything.spec.ts` — a 629-line benchmark harness that already
times parse/networkgen/ODE/SSA (median of repeats after warm-up), reads the
PROFILE_DATA breakdown, reports species/reactions/heap, ships a `multisite_N`
2^N combinatorial netgen stressor (and a `chainModel` baseline), supports real
models via `PROFILE_MODELS_DIR`, and writes `profile-report.md` + `.json`. An
earlier draft of this package shipped a redundant standalone `perf-benchmark.ts`;
it was deleted in favor of driving this spec.

**Delivered artifact:** `performance-improver.yml` — a 3-leg matrix
(networkgen/ssa/parse) that runs the profile spec hang-safe
(`node scripts/run_full_tests.mjs tests/profile-everything.spec.ts`) with
per-leg `PROFILE_*` env, reads the emitted JSON, decides via op-count →
replicated-wall-clock, opens always-open artifact PRs, locks the spec/models/
thresholds/tests, and validates via `test:full:safe`.

**Still on you (I can't run WASM or build here):**
- Run the profile spec once locally with the perf env (`PROFILE_SIM=ssa
  PROFILE_ODE_COMPARE=0`) to confirm it runs pure-JS and to record the run-to-run
  spread of `genMs`/`simMs.ssa` — that variance sets the wall-clock win threshold.
- `perf/models/` is OPTIONAL; the built-in `multisite_N` stressor is the netgen
  workload. Add pinned real models only for extra representativeness.
- No SSA-seed action needed: SSA is median wall-clock over repeats (seed varied on
  purpose to average stochastic noise); netgen op-counts are seed-independent.

**This makes P0 the most load-bearing item.** Without one consistent yardstick you
can't compare the starts, and "keep the best" is meaningless.

---

## P0 — Fix the eval first (unchanged priority, now doubly important)

### P0.1 — Test validation is broken along *two* tangled axes (not just a wrong name)

There are two independent dimensions and the scripts mix them up:
- **Scope** — which tests run. `vitest.config.ts` (the "fast"/default) **excludes almost all scientific validation**: parity-vs-BNG2 (`bng2-comparison`, `massive-parity`, `mwc_parity`, `parity-compartment`, `parity-zap`, …), the CVODE simulation specs (its own comment: "CVODE doesn't load in Node.js"), polymer/compartment, `model-repository-validation`. `vitest.full.config.ts` runs those. So "full" is not "fast + more time" — it's *the suite that actually checks the numbers*. Full also has a `globalSetup` the fast one lacks.
- **Hang-safety** — raw `vitest` on `pool: 'forks'` never cleanly exits after CVODE loads. `scripts/run_full_tests.mjs` wraps vitest with an idle-kill + pass/fail detector and guarantees exit. **The wrapper is config-agnostic** — it forwards args straight to `vitest run`, so `node scripts/run_full_tests.mjs --config <any>` works.

How the current workflows get it wrong — both groups are broken, differently:
- **`npm run test:full`** (`coverage-climber`, `dead-code-pruner`, `mcp-robustness-validator`, `type-strictness-tightener`, `engine-mcp-parity-auditor`): correct broad scope, but **raw vitest → hangs**. The prompt's claim that it "wraps the harness via run_full_tests.mjs" is **false** — `test:full` is plain vitest.
- **`node scripts/run_full_tests.mjs`** with no `--config` (`weekly-cleanup`, `performance-improver`, `worker-protocol-auditor`, `error-resilience-auditor`): hang-safe, but with no `--config` it **falls back to `vitest.config.ts` = the narrow suite**. So these validate against a suite with parity and simulation stripped out.

**The actual danger** (worse than a naming bug): `performance-improver` (touches the ODE solver + simulation loop) and `error-resilience-auditor` (WASM glue) sit in the group that either hangs or validates against the narrow suite. An agent could land a numerical regression and the suite it ran would never catch it — exactly the agents most able to break correctness are the ones not running the correctness tests.

**Resolution (decided):**
1. Add the canonical thorough command: `"test:full:safe": "node scripts/run_full_tests.mjs --config vitest.full.config.ts"` (wrapper + full scope). Verified feasible from the wrapper source.
2. Assign scope **by blast radius**, route everything through the wrapper, kill all raw `test:full` calls and the false "wraps the harness" parenthetical:
   - **Full scope (`test:full:safe`)** — agents that can move numbers: `performance-improver`, `engine-mcp-parity-auditor`, `error-resilience-auditor`, `worker-protocol-auditor`, `model-roundtrip-fuzzer`, `mcp-robustness-validator`, **and `dead-code-pruner`** (deletion can break behavior even though it looks structural).
   - **Fast scope (`test:fast`, i.e. wrapper + default config)** — agents that structurally can't affect numerics: `type-strictness-tightener`, `docstring-coverage`, `coverage-climber`.
3. Accept the tradeoff: the full suite is heavy (5-min timeouts, parity, sims), so full-scope agents run slower and cost more CI minutes — notably the 5-way perf fan-out. By-blast-radius is the deliberate middle vs "full everywhere" (safest, slowest) / "fast everywhere" (fastest, correctness hole).

**Prerequisite — establish a green baseline once, by hand.** Before pointing any agent at `test:full:safe`, confirm the full suite goes **green on untouched `main` in the Jules runner environment**. Reason: the full config does *not* exclude the CVODE/WASM sim specs that fast calls out as "doesn't load in Node," so it may be environmentally red for reasons unrelated to any agent. If so, (a) every full-scope agent can't tell its own regression from the pre-existing red, and (b) `ci-failure-fix` fires on the environmental red and its cheapest "fix" is to *exclude the failing specs* — silently reopening the correctness hole. `ci-failure-fix` is the right fallback for a real regression, the wrong one for an environmental failure. Also: the wrapper's pass/fail is a stdout heuristic (greps for the summary line / ✓✗ markers), so if the suite dies before printing a summary it can misread — another reason to see it pass cleanly once. Do the baseline check first; don't let discovery-by-failure be first contact with the full suite.

### P0.2 — Perf benchmark doesn't exist
- `benchmarks/perf_benchmark.mjs` — **does not exist.**
- `bionetgen_repo/` fixtures — **does not exist.**
- Real scripts present: `scripts/benchmark_functional_rate_fast_path.ts`, `scripts/benchmark-parameter-panel.ts`.

Do two things:
1. Commit one real benchmark: fixed model set, fixed seed, fixed iteration count, machine-readable JSON (wall-clock + peak RSS). This is now the yardstick for the 5-way fan-out, not just a gate for one agent.
2. **Runner noise.** A 5% wall-clock delta on shared `ubuntu-latest` is often inside the noise band — the methodological hole that Karpathy's fixed-budget-on-own-H100 avoids. Mitigate ≥1 of: prefer op-count/instruction-count over wall-clock; require a win to replicate across two runs; or set the threshold well above measured run-to-run variance. Until done, perf PRs are suggestions, never auto-merged.

### P0.3 — `AGENTS.md` doesn't document the harness
Testing section stops at `npm run test`. Never mentions `test:full`, `test:fast`, `run_full_tests.mjs`, or the hang. Add a "Running tests without the hang" subsection documenting: the forks-pool/CVODE hang and why the wrapper exists; `test:fast` = fast/narrow scope (hang-safe); `test:full:safe` = full scientific scope (hang-safe); that raw `npm run test:full` hangs and must not be used by agents; and which scope each agent group uses (per P0.1).

---

## Graduation (you chose: graduate the agents)

Not all agents graduate to the same thing, and Group B can't graduate at all. Be clear-eyed about that.

### Group A → CI gates
- **`type-strictness-tightener`** — **staged, because of the count.** Snapshot suppression tally (verify live):
  - engine (188 files): ~73 `: any`, ~98 `as any`, ~27 `<any>`/`any[]`, ~18 `@ts-ignore` → **~216**
  - mcp-server (75 files): ~62, ~28, ~51, 0 → **~141**
  - **~360 total.** That's real runway, not near zero — so you can't swap straight to a hard lint rule (it'd fail on 360 existing). Graduate in two stages: (1) **ratchet-gate now** — a CI check that fails if the suppression count rises above today's committed baseline (blocks all new `any`, grandfathers existing); (2) keep the agent running to burn the 360 down; (3) when near zero, flip the gate to hard-error (`@typescript-eslint/no-explicit-any`, ban `@ts-ignore`) and retire the agent. **Keeps its slot for now.**
- **`coverage-climber`** — set a **floor-gate** (fail CI if coverage drops below today's number) and **retire the agent** (see coverage note; you're not invested in actively climbing it). **Frees a slot.**
- **`wasm-bundle-shrinker`** — removed; optional graduation is a static bundle-size budget check.

### Group B → mostly can't graduate
There's no gate form for "some handler could be more robust" or "this fuzz space might hide a crash." These are covering searches; they either keep running or you stop them. Two partial exceptions:
- **`dead-code-pruner`** → a `knip`/`ts-prune` CI check can gate *new* unused exports (a ratchet), after which the agent is optional. Honor the protect-list (see below).
- Everything else in B (fuzzer, robustness, parity, worker-protocol, error-resilience, docstring) stays generative.

---

## What "coverage %" is (you asked)

The percentage of your code that actually executes when the test suite runs. Line coverage = fraction of lines that ran; branch coverage = fraction of if/else paths taken; function coverage = fraction of functions called at least once. 80% line coverage = a fifth of your lines never run under test.

**Why it's a weak metric to automate:** it only measures whether a line *ran*, not whether anything *checked the result*. A test that calls a function and asserts nothing still counts as covering those lines — so an agent maximizing coverage% can raise the number with tests that verify nothing. That's why it shouldn't be auto-merged, and why the honest version of this metric is mutation testing (does the test fail when you break the code) — a bigger build. Given you're not invested here: floor-gate it at today's number, retire the climber, reclaim the slot.

---

## Slot math (funds the fan-out)

Ceiling: 15/day. Current scheduled: ~12 (+ `ci-failure-fix`, event-driven, not a daily slot).

- Remove `wasm-bundle-shrinker`: **−1**
- Retire `coverage-climber` (→ floor-gate): **−1**
- `performance-improver` 1 → 5 (fan-out): **+4**
- `type-strictness-tightener`: unchanged (keeps burning down the 360)

Net scheduled ≈ 12 − 1 − 1 + 4 = **14/15**, one spare. Your instinct ("bundle + one more removed funds it") was exactly right. If you want a second spare later, `weekly-cleanup` is the next cut (most redundant — see CodeQL).

---

## CodeQL redundancy

**Key fact:** CodeQL only *detects and files alerts*; it never fixes or opens a PR. So even at max detection overlap, the Jules agent still owns remediation.

- **Real detection overlap:** `dead-code-pruner`, `error-resilience-auditor` (empty catch, floating promises), `weekly-cleanup` (dead code) overlap CodeQL's `security-and-quality` quality queries.
- **No overlap (different technique / project-specific):** `model-roundtrip-fuzzer` + `performance-improver` (dynamic; CodeQL is static), `worker-protocol-auditor` (cross-worker message shape — CodeQL can't model), `engine-mcp-parity-auditor` (custom invariant), `type-strictness` (that's `tsc`, not CodeQL), `coverage-climber` + `docstring-coverage` (out of scope), `mcp-robustness-validator` (behavioral).
- **Security lane:** CodeQL owns app-vuln scanning; no Jules agent competes. And P2 (workflow permissions, fork gating, log injection) is Actions-supply-chain security, which stock CodeQL on `build-mode: none` does **not** audit. So P2 is not redundant with CodeQL.

**The move:** turn the overlap into a pipeline. Point `dead-code-pruner` and `error-resilience-auditor` at CodeQL's existing alerts (Security tab / SARIF) as their work queue instead of re-detecting from scratch. CodeQL is the better detector; Jules is the only fixer. Caveat: CodeQL's dead-code alerts false-positive on dynamic imports and the intentionally-unwired handlers, so the protect-list and judgment still apply.

**Most redundant agent:** `weekly-cleanup` — overlaps both CodeQL *and* `dead-code-pruner` on dead code. First candidate to cut or narrow if you want another slot.

---

## P1 — Firehose behavior (Group B only)

- **Always open a PR, never manufacture a diff.** Don't say "always change code" — a stuck agent will rename a variable to satisfy it. Instead the empty-handed run commits its *work product*:
  - `model-roundtrip-fuzzer`: today "if all 50 pass, surface no PR" → always open a PR committing the 50 generated models as regression fixtures + timings. "Nothing broke" becomes a growing corpus.
  - covering agents with nothing in the top slot → PR with the ranked list of what was considered and why each was skipped.
- **Every Group B prompt:** "In the PR body, state the assumptions and either/or decisions you made that you'd otherwise have asked about." This is the direct fix for your original invisible-questions problem, and the highest-throughput change for you as the selector.
- **Every prompt (all groups):** "Never edit the metric, threshold, benchmark, or test in the same PR that claims to satisfy it." (Locked-evaluation rule — without it an agent can rewrite the scorer to fake a win.)
- **Kill "pick the single worst" in Group B** → "pick a below-threshold target, varied across runs." (The multistart diversity fix.)
- **Do NOT** apply "always open a PR" to Group A hill-climbers.

---

## P2 — Security (~20 min, orthogonal; not covered by CodeQL)

- **P2.1 — No `permissions:` block on any Jules workflow.** The repo already uses least-privilege on `autofix`, `codeql`, `deploy`, `test`, `atomizer-ci`. Add to each Jules workflow (Jules acts via `JULES_API_KEY`, not the workflow token):
  ```yaml
  permissions:
    contents: read
  ```
- **P2.2 — `ci-failure-fix.yml`, two problems:**
  1. **Fork exposure** — triggers on any CI failure, runs Jules on `head_branch` with `include_last_commit: true`. A fork PR that intentionally fails points an autonomous agent holding your key at attacker-controlled content. Gate it:
     ```yaml
     if: >
       github.event.workflow_run.conclusion == 'failure' &&
       github.event.workflow_run.head_repository.full_name == github.repository
     ```
  2. **Prompt injection via logs** — this workflow feeds CI *failure logs* to Jules. Any text an attacker gets into those logs (crafted test name, error string) is text the agent reads and may act on. Same-repo gating mitigates the main vector; consider truncating/sanitizing the log slice handed to the agent.
- **P2.3 — Pin the action to a commit SHA**, not `@v1.0.0` (tags are mutable).
- **P2.4 — If you enable any auto-merge**, confirm the full correctness suite is a *required* status check on the target branch, or "green" can mean "checks didn't run."

---

## P3 — Scheduling hygiene (one-line edits)

- **P3.1 — Two collisions on the same minute:** `06:00` weekdays = `coverage-climber` + `worker-protocol-auditor`; `07:00` weekdays = `wasm-bundle-shrinker` + `mcp-robustness-validator`. (Both partly resolved by removing bundle and retiring coverage — but stagger any remaining same-minute starts.) Also spread the 5 perf fan-out runs across different hours so they don't all contend at once.
- **P3.2 — No `concurrency:` guard.** Add per-workflow:
  ```yaml
  concurrency:
    group: jules-${{ github.workflow }}
    cancel-in-progress: false
  ```
- **P3.3 — Weekends:** Group B firehose agents stay `1-5` (only the days you read). Perf fan-out: only run weekend slots if you'll review Monday — otherwise they pile up unread. (`performance-improver` is currently `* * *`; decide per the human-in-loop stance.)

---

## Things NOT to change (decided across the conversation)

- Don't slow any agent's cadence or add "stop if metric past X" throttles. You want volume.
- Don't split `error-resilience-auditor` / `worker-protocol-auditor` into non-overlapping scopes — parallel search on the same problem is intended. (Collisions handled by P3.1.)
- Don't add a "rejected approaches" list — it prunes the search; multistart wants uncorrelated starts.
- Don't merge overlapping Group B agents. (But `weekly-cleanup` is a legitimate *removal* candidate on redundancy grounds — different from merging.)

---

## Verify, don't blindly change

Both `weekly-cleanup` and `dead-code-pruner` hardcode the same 11-handler "do-not-delete, known-unwired" list (`analyzeResiduals`, `assessModelMaturity`, `checkHysteresis`, `checkPhaseHandoff`, `computeFim`, `diagnose`, `exportOmex`, `exportSbml`, `exportSedml`, `suggestAnnotations`, `suggestFix`). (1) Duplicated → will drift; move to one place (`AGENTS.md` or `docs/protected-handlers.md`) and reference from both. (2) Possibly stale — if orphan-wiring is now complete, the list is obsolete and may tell the pruner to skip genuinely-removable code. Grep the live tree and confirm before touching.

---

## Execution order
1. **P0** — eval correctness. Nothing is trustworthy until this is done; the perf fan-out depends on it entirely.
2. **Remove bundle, retire coverage** (→ floor-gate). Frees the slots.
3. **P1** — Group B always-open + assumptions-in-body + locked-eval + varied-starts.
4. **Perf fan-out** (5 seeded starts) — depends on P0's benchmark.
5. **Type-strictness ratchet-gate** — baseline the ~360, block increases, keep agent running.
6. **P2** security, **P3** scheduling.
7. **CodeQL pipeline** — repoint dead-code + error-resilience at CodeQL alerts (optional, do after the above settles).

## Open decisions needed before I can write exact diffs
1. ~~**P0.1 test scope**~~ — **RESOLVED.** Add `test:full:safe` (wrapper + full config); scope by blast radius (full for number-movers + dead-code, fast for type/docstring/coverage); route all through the wrapper; establish a green baseline on `main` in the Jules env before pointing agents at full.
2. ~~**P0.2 perf metric**~~ — **RESOLVED.** Op-count primary (networkgen uses the engine's already-exported PROFILE_DATA `breakdown.calls`, deterministic) + two-run-replicated wall-clock for parse/ssa; species/reactions are correctness guards.
3. ~~**Perf fan-out count / seeds**~~ — **RESOLVED.** Built A (3-way: parse, networkgen, ssa). B (WASM/browser harness) deferred. Harness + workflow delivered.
4. **`weekly-cleanup`:** keep as-is, narrow, or cut for a second spare slot?
5. **CodeQL pipeline:** repoint dead-code + error-resilience at CodeQL alerts now, or leave independent for later?
