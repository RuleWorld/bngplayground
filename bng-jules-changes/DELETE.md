# DELETE — files to remove

Grep-verify each exists first; if already gone, skip.

## D1. `.github/workflows/wasm-bundle-shrinker.yml`
Remove. Bundle size (download bytes) is not the goal — runtime speed is, and
that's `performance-improver`'s job. Bundle is "mostly done" and de-prioritized.
Frees one agent slot. (Optional future: a static bundle-size budget CI check, not
an agent — not included here.)

## D2. `.github/workflows/coverage-climber.yml`
Remove. Coverage % is gameable (tests that assert nothing still raise it), so it's
a weak metric to hand an autonomous agent. Retiring the agent frees the second
slot needed to fund the 3-way perf fan-out.

Optional replacement (NOT included as turnkey — has a prerequisite): a coverage
FLOOR gate that fails CI if coverage drops below today's number. Only build it
after confirming a vitest coverage provider (c8/istanbul) is actually installed
and a `--coverage` run works; then set the floor from a live run. Until then,
just removing the agent is fine.

---

### Slot math after deletions
~12 scheduled agents − bundle − coverage = 10, then perf goes 1 → 3 (matrix) =
12 scheduled, well under the 15/day ceiling with headroom. `ci-failure-fix` is
event-driven, not a scheduled slot.
