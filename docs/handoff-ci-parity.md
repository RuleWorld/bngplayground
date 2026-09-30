# Handoff: full BNG2.pl parity (rewritten 2026-09-30)

Supersedes the previous version of this file. The headline finding from that
version was wrong in an important way: the network-shape gate was **vacuously
green**, so its "mismatch" list described label formatting, not chemistry. Fix
the gate first; every number before that is noise.

---

## 1. The reference is a fork, not a release

The parity target is:

```
export BNGPATH=/Users/akutuva/Documents/BioNetGen/bionetgen/bionetgen/bng2
# akutuva21/bionetgen @ 3513bca7 "fix: fold byte-identical reactions across rules in RxnList::add"
```

Three commits ahead of `RuleWorld/bionetgen` master (`9601746`). Use it in CI too:
`.github/workflows/test.yml` clones the fork at that pinned SHA in all three
parity jobs instead of `pip install bionetgen`.

Why, measured:

| engine | `egfr` reactions | `tlr3_dsrna_sensing` |
|---|---|---|
| packaged 2.9.3 | 4301 | 161 |
| upstream master | 3749 | 158 |
| fork | 3749 | 158 |

The surplus entries in the release are duplicates. The cause is
`Perl2/RxnList.pm`: `add()` folded two reactions only when their `RateLaw`
objects were *the same object* (`$rxn->RateLaw == $rxn2->RateLaw`). The fork
merges on `RateLaw::equivalent(...)`, which is what `RateLaw.pm` exists for.

Reference fixtures generated with the fork: `/tmp/parity_v4` (741 pairs).
Do not regenerate the corpus by hand — CI regenerates it. Four models
(`energy_example1`, `fit_edited`, `motivating_example_cbngl`, `tcr_sens_tofit`)
were missing from the fork run and were carried over from the master corpus;
the two engines produce byte-identical `.net` content for every model present
in both, so that is sound.

## 2. Gates that could pass without comparing anything

Both parity gates had this class of defect. All fixed.

**`tools/validation/compare_networks.ts`** — `canonicalReaction` was applied
twice: once when reading each `.net`/network into `NetworkShape.reactions` and
again at comparison time, so every reaction set collapsed to a single
degenerate entry and 719/719 models "matched" regardless of content. It also
referenced an undefined `canonicalReaction` and crashed on the first model.
Reactions are now compared as canonical `reactants->products` sets
(participants species-canonicalised and sorted, participant `0` dropped).

**`tools/validation/compare_outputs.ts`** — six ways to pass vacuously:

1. `parseGDAT` used `parseFloat`, so BNG2's `1.#INF` failure marker parsed as
   the number `1`; and a non-numeric cell became `NaN`, which fails every
   tolerance comparison and so scored as agreement. Now `Number()`, and a
   non-finite value in a *compared* column is a recorded discrepancy.
2. `matches.length === 0 && results.length > 0` let an entirely empty sweep
   exit 0.
3. `main().catch(console.error)` printed a stack trace and exited 0.
4. With no aligned row pair, `timeMatch` reduced to `0 === 0 && 0 === 0` —
   two header-only files compared as a perfect match.
5. The overlap relaxation accepted any row-count difference on the overlap
   alone, so a web run matching only the reference's first N rows passed and
   the divergent tail was never checked. Now the aligned rows must span the
   whole reference; `PARTIAL_MATCH_TIME` is the one declared exception.
6. `hasInsufficientColumnOverlap` / `hasExtremeRowMismatch` discarded every
   candidate reference and the model was then reported `missing_reference`,
   which does not fail CI.

## 3. Engine fixes landed

- **Stranded bystanders.** `RxnRule::build_reaction` rejects a rule that leaves
  a bystander attached only to a molecule the rule *deletes*, unless the rule
  carries `DeleteMolecules` (then it is released as its own product).
  `complexdegradation` is the minimal case: `A(b!1).B(a!1) -> A(b)` must not
  fire on `A(b!1).B(a!1,c!2).C(b!2)`, and with `DeleteMolecules` it must give
  **two** products, `A(b)+C(b)`. A bystander released because the *product
  pattern explicitly freed the bond* is dropped silently instead — BNG2 accepts
  that, and conflating the two cases breaks `beta_adrenergic_response`.
- **Constant rate laws are per rule.** `RateLaw::equivalent` compares a rate
  law's constants by parameter name, and BNG2 mints `_rateLaw1..N` per rule,
  so `A(b) -> 0 1` and `A() -> 0 1` are two reactions even though both have
  rate 1. A numeric rate is scoped to its rule; a rate naming a parameter is
  not.
- **`TotalRate` replaces the stat factor only.** BNG2's `Rxn.pm:273` is
  `my $sf = TotalRate ? 1 : $rxn->StatFactor`, and Network3 has no `totalrate`
  symbol at all, so the mass-action reactant product and the reacting-volume
  normalisation still apply. Six sites in `SimulationLoop.ts` were short-
  circuiting it, which made every `TotalRate` rule an absolute flux. One root
  cause behind six "structural" trajectory mismatches
  (chemotaxis_signal_transduction, rho_gtpase_actin_cytoskeleton,
  endosomal_sorting_rab, no_cgmp_signaling, nfkb_feedback, cd40_signaling).
- **IEEE infinities are results, not failures.** BNG2 evaluates with
  mu::Parser, so `ln(0)` is `-inf` and `x/0` is `+inf`. `safeExpressionEvaluator`
  collapsed both to `NaN`/0; `src/utils/download.ts` wrote them as empty CSV
  cells, which the gate cannot parse back.
- **Visitor recursion.** antlr4ts's `RuleContext.text` getter is
  `builder += this.getChild(i).text` — one frame per parse-tree level. `nyc`
  and `phoenix` nest ~3 270 levels inside a single parameter definition, which
  exhausts a browser worker's ~1 MB stack. `nodeText()` in `BNGLVisitor.ts`
  does the same walk with an explicit stack; 15 call sites converted.

## 4. Parser front end

`packages/engine/src/parser/BNGLParserWrapper.ts` gained four normalisation
passes (plus `actionCommandPreprocessor.ts`), all following the existing
pre-parse style:

1. loose top-level action commands outside the actions block are folded into it
   — the grammar's entry rule admits one trailing actions block and nothing
   else, which is what actually broke the 12 `rafi_*` / `innate_immunity` /
   `korwek_2023` / `190127_cho_egfr_sensitivity` models. **17 models** fixed,
   719 → 736 parsing, zero regressions.
2. U+2013 en dash → ASCII hyphen.
3. Capitalised `Begin`/`End` block keywords lowercased, whitelist-restricted
   (`End` is also a legal molecule and compartment name).
4. Literal tabs → spaces outside quoted strings and `#` comments.

Remaining grammar gaps are recorded in `tools/validation/netShapeUnsupported.ts`
(`!?` state modifier, `protocol`, `setOption` in actions, `parameter_scan`
argument forms, an observable pattern form, a compartment-volume variant,
`tricky`'s backslash-glued-to-tabs inside a line continuation). That file is a
ratchet: an unlisted model that fails to parse fails the gate.

## 5. Reference pipeline

`scripts/generation/generate_no_ref_gdat.ts`:

- Plants `default.geometry.mdl` next to every model it writes. The reference
  resolves it from the *model file's* directory (`Perl2/BNGOutput.pm:127`) and
  dies without it; because each model is copied into a fresh per-model work
  directory, a copy anywhere else is never read. Without this the three
  `writeMDL()` models abort before `simulate()` and produce no `.gdat`.
- **Skips network-free models.** A model whose only simulate actions are NFsim
  or SSA has no reaction network, and appending `generate_network` to it is how
  a fitting model becomes a combinatorially explosive one: `tcr_iter28p4h2`
  (129 rules, TCRtot=88223) went 20 → 53 → 203 → 2659 species in four
  iterations. It is now reported as `network_free` rather than burning the
  per-model timeout to find out.

Do not read behaviour from `/tmp/bngsrc` (upstream master) any more.

## 6. Open, with owners

- **Grammar constructs** — an agent is on it; see the ratchet list above.
- **`erk_nuclear_translocation`** — our heterodimerisation emits stat factor 2
  where BNG2 emits 1, worth ~2.5% on the trajectory. Our per-instance n-ary
  symmetry factor is the reciprocal of BNG2's
  `$multScale = 1 / (@RuleGroup/@StabRxnCntr) / $crg_permutations`; BNG2's 0.5
  per ordering summed over the two orderings gives 1. An agent is on it. The
  trap is the EGFR-style rule where the two orderings give genuinely different
  products and BNG2 emits both.
- **Monotone solver drift** — `tlr3_dsrna_sensing`, `ire1a_xbp1_er_stress`,
  `vegf_angiogenesis`, `circadianoscillator`, `blinov_2006`, the egfr family,
  `ph_lorenz_attractor`. Agent in flight.
- **Transient / conditional** — `erk` is above. `dallas_Dallas` and
  `houston_Houston` are a conditioning artefact (only 3 of 65 columns differ;
  they cross zero, and their mean absolute differences are *smaller* than a
  column reading 0.002%, so only the denominator collapses — max relative
  occurs late where the column is near zero, max absolute early, which is the
  signature of near-zero crossing). `ml_q_learning` is a chaotic threshold
  crossing: BNG2's own answer flips with its own tolerance
  (Position at t=51.7: 10.43390139273 at atol/rtol 1e-8, 10.00000000011 at
  1e-12). `pt403`/`pt409` `Vdat` is a knife edge: the model declares
  `Molecules t counter()`, which shadows time inside functions, so
  `Vdat()=if(t<=36,3.42,0)` tests an integrated species and BNG2's own `t` at
  t=36 is 36+1.4e-14. All four need a gate policy, not engine work.
- **Expander hangs** — being characterised. Note that several of the apparent
  hangs were the fixture pipeline's own injected `generate_network`, now fixed.

## 7. Process rules that exist because they caused damage

1. **Never edit the main checkout** while agents are running. Use
   `git worktree add /tmp/<name>`.
2. **Never run `git checkout`/`reset --hard`/`git clean`** on a shared tree.
3. **Never create a `node_modules` symlink** in the repo.
4. **Do not merge or push while a reference run is in flight.**
5. **Do not run whole-corpus sweeps locally.** CI runs them; locally, verify
   the specific models you changed.
6. **Verify model text with a second reader.** A ranged read once returned
   fabricated content and sent an agent chasing a model typo that did not
   exist.
7. **Fixture generators need isolated per-shard temp directories.** Two
   overlapping runs racing on the same directories produced a `.net` belonging
   to a different model than the `.bngl` beside it, which read as a
   86-species-vs-7-species engine mismatch. That was an artefact, not a bug.

## 8. What "done" looks like

`npm run test:fast`, `npm run test:full:safe`, and both `tsc --noEmit` projects
green locally — currently 6510 and 4684 tests passing respectively. The two
parity gates are the remaining gate on CI: `reference-tests` runs
`npm run test:reference:net-shape` and `npm run test:reference`. Report only
what you measured.
