# Handoff: full BNG2.pl parity

State as of 2026-09-30, at `bc6584d9`. Rewritten twice this session; the first
version was wrong in a way that cost the most time, so it starts there.

---

## 1. Read this first: the gates were passing without comparing anything

The previous handoff reported a network-shape gate failing on five models
(`barua_2007`, `complexdegradation`, `tcr_sens_tofit`, `fit_edited`, `tlr3_dsrna_sensing`)
and listed `egfr` as 3749 vs 4301. **None of that was real.** The gate was
crashing outright (`canonicalReaction is not defined`), and before that it was
green because `canonicalReaction` was applied twice — once when reading each
network, once when comparing — so every reaction set collapsed to a single
degenerate entry and 719/719 models "matched" regardless of content. It was
comparing the reaction *labels* (`#Rule01` versus `_rateLaw1`), not chemistry.

The same class of defect was in the trajectory gate, seven times over: `NaN`
and BNG2's `1.#INF` failure marker scoring as agreement, an empty sweep exiting
0, a thrown error exiting 0, two header-only files comparing as a perfect
match, a web run matching only the reference's first N rows, and a reference
that was found, compared and rejected being relabelled `missing_reference`
— which is green in CI.

**If a gate reports green, first prove it compared something.** Each of these
had a synthetic reproducer.

The first true measurement, from the first run with working gates:

```
net-shape:  567 compared, 562 matched, 5 mismatched, 2 errored
trajectory: 465 models compared, 2 errors
```

Every one of those seven is now fixed. Current expected net-shape result is
**567/567** modulo `igf1r_fit_all_*`'s rate constants, which do not affect the
reaction *set* and therefore do not fail that gate.

## 2. The reference is a fork, not a release

```
export BNGPATH=/Users/akutuva/Documents/BioNetGen/bionetgen/bionetgen/bng2
# akutuva21/bionetgen @ 3513bca7 — upstream master + a reaction-identity fix
```

Three commits ahead of `RuleWorld/bionetgen` master. Use it in CI too:
`.github/workflows/test.yml` clones that fork at the pinned SHA in all three
parity jobs instead of `pip install bionetgen`.

| engine | `egfr` reactions | `tlr3_dsrna_sensing` |
|---|---|---|
| packaged 2.9.3 | 4301 | 161 |
| upstream master | 3749 | 158 |
| fork | 3749 | 158 |

The surplus entries in the release are duplicates, and the cause is
`Perl2/RxnList.pm`: `add()` folded two reactions only when their `RateLaw`
objects were *the same object*. The fork merges on `RateLaw::equivalent`.

Fixtures generated with the fork: `/tmp/parity_v4` (741 pairs). **Do not
regenerate the corpus by hand — CI does it.** Four models were carried over from
the master corpus; the two engines produce byte-identical `.net` content for
every model present in both, so that is sound.

**Do not read behaviour from upstream master.** Master predates both the user's
`RxnList.pm` fix and the fork's `RxnRule.pm` changes to `find_reaction_center`.

## 3. Two defects that share one root cause

Both are **heuristic molecule correspondence where BNG2 guarantees positional
correspondence**: the n-th reactant molecule named `A` is the image of the n-th
product molecule named `A`.

- `matchRespectsProductImpliedFreeConstraints` decided which product constrains
  which reactant by asking whether the molecules shared a bonded component name.
  Every molecule of a cysteine-linked dimer lists `C`, so it answered yes for
  both copies and matches were rejected whenever the other copy held the site —
  losing the entire two-ligand-per-receptor family in the IGF1R fitting models.
- `buildProductGraph` chose which reactant each product molecule maps to by
  greedy similarity score. With a rule that never mentions `DP`, the score cannot
  distinguish two MPF copies, so `kesseler_2013` put the state on the wrong
  monomer: 120 reactions missing, 88 extra.

Both now share `getRuleMoleculeCorrespondence`, which returns both directions
plus per-pattern global-index offsets. Positional correspondence is consulted
*first*; the similarity score survives as a fallback for the cases where
correspondence is genuinely undefined — a product molecule with no reactant
counterpart of equal count, a positional partner already claimed, or a name
mismatch guarding a mis-resolved index. It no longer fires merely because a
score might be higher, which was the bug in both places.

## 4. The measured BNG2 behaviours this work turned up

Full detail in `docs/bng2-reference-behaviours.md` and
`docs/stat-factor-finding.md`. The ones that cost the most to find:

- **`TotalRate` replaces the stat factor only.** `Rxn.pm:273` is
  `my $sf = TotalRate ? 1 : $rxn->StatFactor`, and Network3 has no `totalrate`
  symbol at all, so mass action and the reacting-volume normalisation still
  apply. Six sites in `SimulationLoop.ts` short-circuited it, making every
  `TotalRate` rule an absolute flux. One root cause behind six "structural"
  trajectory mismatches.
- **A stranded bystander voids the rule.** `RxnRule::build_reaction` rejects a
  rule that leaves a bystander attached only to a molecule the rule *deletes*,
  unless it carries `DeleteMolecules` (then it is released as its own product).
  A bystander released because the *product pattern explicitly freed the bond*
  is dropped silently instead — BNG2 accepts that, and conflating the two cases
  breaks `beta_adrenergic_response`.
- **A bare numeric rate law is per rule.** `RateLaw::equivalent` compares
  constants by parameter name, and BNG2 mints `_rateLaw1..N` per rule, so
  `A(b) -> 0 1` and `A() -> 0 1` are two reactions.
- **`max_iter` defaults to 100.** `BNGModel.pm:2517`. We used 5000, which is not
  a slower expansion but a different one — we kept generating species long after
  BNG2 declares the network incomplete.
- **IEEE infinities are results.** BNG2 evaluates with mu::Parser: `ln(0)` is
  `-inf`, `x/0` is `+inf`, and both reach the `.gdat`.
- **antlr4ts's `RuleContext.text` is recursive** — one frame per parse-tree
  level. `nyc` and `phoenix` nest ~3 270 levels inside one parameter
  definition, which exhausts a browser worker's ~1 MB stack.

## 5. Parser

Grammar plus regenerated sources for `!?`, `protocol`, `setOption`,
`parameter_scan`, observable-pattern and compartment-volume forms, the en dash,
`print_functions`, and array literals in function references
(`tfun([0,1,2],[1,2,4],time)` — an array is not an `expression`, so it had
never parsed). Front-end passes that fold loose top-level action commands into
the actions block, wrap them when the file has none, lower-case capitalised
`Begin`/`End`, and fold line continuations *after* stripping comments.

**29 models** that previously failed to parse now expand. All verified by set
diff against the reference, not by count.

Two rules were nearly shipped over-broad and are worth remembering: a trailing
comma on the *shared* `expression_list` makes it legal in every function call in
the language, and `seed_species_note : MOD (~LB)+` lets a seed-species line eat
the rest of the file. Both are scoped now. The general lesson is that a rule
added to fix one construct must be added *where that construct appears*, not to
the shared rule every construct uses.

## 6. Reference pipeline

`scripts/generation/generate_no_ref_gdat.ts`:

- Plants `default.geometry.mdl` next to every model it writes. The reference
  resolves it from the *model file's* directory (`Perl2/BNGOutput.pm:127`) and
  dies without it; because each model is copied into a fresh per-model work
  directory, a copy anywhere else is never read.
- **Skips network-free models** instead of appending `generate_network` to them.
  A model whose only simulate actions are NFsim or SSA has no reaction network,
  and appending one is how a fitting model becomes combinatorially explosive:
  `tcr_iter28p4h2` went 20 → 53 → 203 → 2 659 species in four iterations.
- Expands each model in a killable child (`boundedExpansion.ts`). The
  cancellation callback is polled between iterations and cannot stop an
  expansion wedged inside one rule, so a hang was an unbounded CI stall rather
  than a failure.

## 7. CI

Two things were wrong and both are fixed:

1. **The reference was the packaged release**, not the fork. See §2.
2. **`concurrency: ci-tests-${{ github.ref }}` with no `cancel-in-progress`** meant
   a run queued behind whatever was still running in *any* job. A 40-minute
   reference sweep held every later push's run at `pending` with **zero jobs
   created**, so the commit reported green while its checks had not been
   scheduled. The group is now scoped by `github.job`, so a new push's
   `fast-tests` starts immediately while `reference-tests` still queues behind
   the previous commit's sweep and is never killed mid-run.

A main push produces 5 workflows, not 17: `Autoresearch` is schedule-only,
`CI Failure Fix` is `workflow_run`-only, `CI Autofix` and `Suppression Budget`
are `pull_request`-only. `CI Tests` contributes 10 checks (the 3-way shards
expand 6 job definitions).

## 8. Open, with owners and evidence

- **`patternAutomorphismFactor`** — 17 models / 358 rule instances depend on it.
  Deleting it fixes all four `igf1r_fit_all_*` models and regresses nine `rafi_*`
  models that currently match exactly. The replacement has to compute BNG2's
  `|RG|/|Stab|` — whether exchanging equivalent reactant molecules induces a
  product-graph automorphism outside the reaction-centre stabilizer — and the
  component-aware variant was tried and does not work. Full analysis, the
  measured ground truth, and the at-risk model list are in
  `docs/stat-factor-finding.md`. **Deleting it is not safe on this corpus.**
- **`maxAgg` 500 vs BNG2's `1e9`** — a real divergence, deliberately not
  changed: it interacts with our `maxSpecies` cap and widening an unbounded
  aggregation knob without evidence is how one model becomes a multi-minute
  expansion. Needs to know which models actually hit an aggregation depth of 500.
- **Trajectory accuracy** — network shape is exact across the corpus and the ODE
  was measured exact (1 649 state comparisons, zero deviations above 1e-6), so
  what remains is observable projection and rate constants. Two models were
  classified as artefacts rather than defects and should not be chased:
  `dallas_Dallas`/`houston_Houston` (only 3 of 65 columns differ, they cross
  zero, and their mean absolute differences are *smaller* than a column reading
  0.002% — the relative and absolute optima occur at different times, the
  signature of near-zero crossing), and `ml_q_learning` (BNG2's own answer flips
  with its own tolerance: Position at t=51.7 is 10.4339 at atol/rtol 1e-8 and
  10.0000 at 1e-12).
- **Four models BNG2 itself cannot terminate** — `egfr_ode`,
  `egfr_nf_iter5p12h10`, `jobs_tofit_gen48ind13`, `tlbr_iter7p5`. Unbounded
  oligomerization with no `max_species`/`max_iter`; 1 800 s, no `.net`. Recorded
  in `netShapeUnsupported.ts` with that reason, which is the only way to make
  them green.

## 9. Process rules that exist because they caused damage

1. **Never edit the main checkout** while agents are running. Use
   `git worktree add /tmp/<name>`.
2. **Never run `git checkout` / `reset --hard` / `git clean`** on a shared tree.
3. **Never create a `node_modules` symlink** in the repo.
4. **Do not run whole-corpus sweeps locally.** CI runs them; locally verify the
   models you changed. A full sweep is ~15 minutes and tells you nothing the
   gate will not tell you faster.
5. **Verify model text with a second reader.** A ranged read once returned
   fabricated content and sent an agent chasing a model typo that did not exist.
6. **Re-measure other agents' results yourself** before reporting them.
7. **Fixture generators need isolated per-shard temp directories.** Two
   overlapping runs racing on the same directories produced a `.net` belonging to
   a different model than the `.bngl` beside it, which read as an 86-vs-7 species
   engine mismatch. That was an artefact.
8. **A test that pins the old, wrong behaviour gets rewritten, not deleted** —
   but it gets rewritten *with a stated reason*, and the fixture is made
   well-posed rather than the expectation bent.
9. **When an agent falsifies a hypothesis of yours, check the measurement before
   you accept it.** A reported reproducer here used a dangling bond BNG2 itself
   rejects; the underlying bug was real, the example was not.
10. **Watch the aggregate.** Deleting `patternAutomorphismFactor` improved the
    total mismatch count while breaking nine models that matched exactly. The
    sum is not the thing; the regressions are.
11. **Agents lie by omission under budget pressure.** Two reported "reverted"
    states still contained the edit. Ask for `git diff` evidence, not a claim.
