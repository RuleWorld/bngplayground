# `patternAutomorphismFactor` — parked finding

Status: **not fixed, deliberately.** Do not delete the term. No change to
`NetworkGenerator.ts` was kept from this investigation; the worktree was
restored to exactly the state of the main checkout.

## What the term is

`NetworkGenerator.ts` computes, inside the n-ary reaction path, a
`patternAutomorphismFactor` as the product over reactant patterns of
`GraphMatcher.getMoleculeAutomorphismFactor(pattern)` — which is
`findAllMaps(pattern, pattern).length`, a **molecule-level** self-isomorphism
count — and then divides the per-instance rate and `exprScaleFactor` (which
becomes the `.net` stat factor) by it, guarded by
`patternAutomorphismFactor > 1 && !useEmbeddingDegeneracy && !rule.isMatchOnce && !shouldSkipAutomorphismDivision`.

BNG2 has no such term. `RxnRule::find_reaction_center` computes

```
multScale = 1 / (|RG| / |Stab|) / crg_permutations
```

and the value that reaches the `.net` is the **sum of `multScale` over the rule
instances that fold into one reaction entry**, not a per-pattern quotient.
So the term is our own invention.

It is nonetheless **load-bearing for 17 models / 358 rule instances** in
`/tmp/parity_v4`, and removing it regresses 9 of them. The aggregate mismatch
count improves while previously-exact models break, which is exactly the
arithmetic that would have let a bad change merge.

### At-risk models (live post-`completeMissingComponents` patterns, factor > 1)

`igf1r_fit_all_{gen19ind47,gen20ind12,iter16p0,iter6p1h4}` (R1,R2 ×2) ·
`rafi_{gen0ind36,gen1ind9,gen3ind25,gen7ind22,ground,iter1p15,iter2p0h1,iter2p5h1,iter4p27}` (R3 ×2) ·
`auto_activation_loop` (R5 ×2) ·
`motivating_example` (Rule13/24/25 ×2) ·
`motivating_example_cbngl` (Rule13/24/25 ×2, **114 hits**) ·
`zhang_2021` (12 rules, factors **2, 6 and 24**).

## Measured ground truth (akutuva21/bionetgen @ 3513bca7)

Obtained by instrumenting a **copy** of the fork at `Perl2/RxnRule.pm:2849`
to print `multScale`, `|RG|`, `|Stab|`, `crg_permutations`, `r_auto` and
`p_auto` from `find_reaction_center`. (`write_autos` does not cooperate — its
dump block never fires for these models.)

| rule | multScale | \|RG\| | \|Stab\| | crg | r_auto | p_auto |
|---|---|---|---|---|---|---|
| `ERK(s~P,b) + ERK(s~P,b) -> ERK(s~P,b!1).ERK(s~P,b!1) k` | **0.5** | 2 | 1 | 1 | 2 | 2 |
| `R(r,i)+R(r,i) <-> R(r!1,i).R(r!1,i) kf1,kr1` (rafi) | **0.5** | 2 | 1 | 1 | 2 | 2 |
| `L(ds,hs)+R(S1,C!0).R(S2,C!0) <-> ... a1,d1` (igf1r) | **1** | 1 | 1 | 1 | 1 | 1 |

So in **rafi** the term is *correct*: the two reactant patterns are identical
and the product is symmetric, BNG2 genuinely applies 1/2, and the
molecule-level count of 2 coincides with the real `|RG|/|Stab|`. In **igf1r**
the same count of 2 is spurious and BNG2 applies no division.

The failure mode: `completeMissingComponents` expands igf1r's second pattern to
`IGF1R(C!0,S1,S2!?).IGF1R(C!0,S1!?,S2)`, whose two IGF1R molecules are
indistinguishable **at the molecule level** — the S1/S2 distinction lives on
components, which a molecule-level matcher does not see. So the factor is 2.
Divided per instance, that produces both error shapes at once: a reaction where
two instances fold emits 0.5+0.5 = 1 where BNG2 writes 2, and a reaction where
one instance folds emits 0.5 where BNG2 writes 1. That is the whole of the
24 + 4 mismatch split on the four `igf1r_fit_all_*` models.

## What was tried and rejected

- **Delete the term.** Fixes all four igf1r models (12 → 0 mismatches each) but
  regresses the 9 `rafi_*` models (0 → 1, i.e. from exact to wrong), plus
  `zhang_2021` (10 → 12) and `motivating_example_cbngl` (61 → 65).
  `auto_activation_loop` and `motivating_example` unchanged. Net total
  373 → 340, but 9 previously-exact models break. Rejected.
- **Use the component-aware `getPatternAutomorphismFactor` at the same call
  site.** Reproduces the current behaviour *exactly* (373 mismatches; rafi
  still 0, igf1r still 12). Component-level counting is not the axis either.

## Evidence caveat: some deletion-test numbers came from a defective comparator

The deletion test above was measured with a comparator that resolves neither
BNG2's `_rateLawN` indirections nor plain `# Constant` parameters, and that
aggregates over colliding canonical keys. Three independent follow-ups have since
shown those defects produce large but entirely phantom mismatch counts:

- `fgf_signaling_pathway` reported 264 mismatches and has **zero** per-reaction.
- `motivating_example` reported 252 and has **zero**.
- `motivating_example_cbngl` reported 65 and has **zero**.

So the deletion test must be read as: **the `rafi_*` regressions are real** — those
nine models have zero colliding keys, and went from 0 mismatches to 1 each, which
is what rules deletion out. The `motivating_example`, `motivating_example_cbngl`
and `zhang_2021` numbers in that table are not trustworthy and would need
re-measuring per reaction before they are cited. The conclusion that deletion is
unsafe does not depend on them.

## A minimal reproducer exists: `zhang_2021`, 6 reactions

Re-measured per reaction (the earlier 10-12 figure came from the aggregating
comparator and is superseded — the true count is **6**).

Network identical: 150 species / 496 reactions / 496 keys, none only in ours.
Rates: 494 of 496 identical. The 6 that differ are all *last-binding-site* rules,
and only the last ones are wrong:

| rule | rate | ours | BNG2 |
|---|---|---|---|
| `_R3` / `_R53` (3rd of 4) | `konang1tie2_3` | 2 | 2 ✅ |
| `_R4` / `_R54` (4th of 4) | `konang1tie2_4` | **6** | 1 |
| `_R13` / `_R63` (4th of 4) | `konang2_4tie2_4` | **6** | 1 |
| `_R9` / `_R59` (3rd of 3) | `konang2_3tie2_3` | **2** | 1 |

BNG2's factor for this family is the number of **free binding sites** on the
receptor; ours becomes the number of *already-bound* identical sites factorial'd
in. Per-instance multiplicity is correct (`exprScaleFactor=1 multiplicity=1`);
the canonical-key merge sums six automorphism-equivalent embeddings of the same
physical event.

### Why no local fix exists

A division keyed on `patternAutomorphismFactor` cannot discriminate. That factor
is **2 for both `_R3` and `_R9`** — they merge the same number of times and differ
only in free-site count (2 vs 1). `_R3` is correct at 2 *by coincidence*: 2 free
sites happens to equal 2!. So dividing by `pAuto` fixes `_R9`/`_R59` and breaks
`_R3`/`_R12`/`_R53`/`_R62`. The discriminating quantity is BNG2's free-site
count, which is exactly the product-graph automorphism question below.

This is the clearest statement of what the replacement has to compute, and it is
also a trap for whoever writes it: a fix tuned on this model alone will break its
neighbours.

## The correct fix, and its open questions

The replacement has to compute BNG2's `|RG| / |Stab|` at that one call site:
whether exchanging the equivalent reactant molecules induces a **product-graph
automorphism** that lies outside the reaction-centre stabilizer. The
distinction genuinely lives in the product graph. An earlier attempt at this
(`isRuleSymmetricInGroup`, probing the rule's own patterns) failed to
discriminate and was reverted — do not assume a self-apply permutation test
works; the product pattern is textually unchanged when identical patterns are
swapped, so the test needs concrete distinguishable reactants.

Open questions for whoever picks it up:

- `zhang_2021` has factors up to **24** across 12 rules. Either the same
  over-count compounds, or something else is entangled. Uninvestigated.
- `motivating_example_cbngl` has **114** hits. Same question, larger.
- A product-graph automorphism test is a real design decision (cost, caching,
  interaction with `useEmbeddingDegeneracy`), and should get its own session
  with a clear baseline rather than a slot between other agents' fixes.

## Not blocking

Network shape is exact across the corpus. Only the four `igf1r_fit_all_*`
models have wrong rate constants, which is a trajectory-accuracy issue rather
than a gate failure.

## Appendix: `max_agg` — evidence that 500 is not truncating this corpus

Separate open item, measured the same way (741 models, live expansion, max
molecules in any single species; exported species carry a name so the count is
parsed from it — compartments and bond labels stripped, `.` inside parentheses
ignored).

**Global maximum across the whole corpus: 32 molecules in a single species**
(`nfsim_ring_closure_polymer`). Next highest: `an_2009` 18, `blinov_2006` 14,
the whole `egfr*` family 14, `fceri_viz` and `zhang_2021` 9.

Our maximum and BNG2's maximum agree exactly on every one of the top 15
models, and **0 of 741 models exceed 500 on either side**.

Consequences:

- `maxAgg = 500` is not binding anywhere in this corpus. Raising it toward
  BNG2's `max_agg => 1e9` would change no current result, so there is no
  evidence-driven reason to touch it and no regression risk either.
- The other risk Main flagged — the knob interacting with the `maxSpecies`
  cap — is real in principle but unexercised here, because nothing gets near
  500 molecules.
- If parity on this knob is wanted for its own sake, it is safe to align, but
  it should be justified as matching BNG2's documented default rather than as
  a fix, and it should be re-checked against any future model with genuinely
  large aggregates (the `max_stoich` models like `rule_based_egfr_tutorial` set
  their own limits anyway and were not binding here either).

Caveat on method: an earlier run of this scan reported 0 for *every* model
because it read `species.graph.molecules`, which the exported network does not
populate. The numbers above are from the corrected name-parsing version, spot
checked against `zhang_2021` (9), `egfr` (14) and `barua_2013` (5) where the
count is visibly non-zero.
### Under-count scan: resolved, and currently harmless

Running the instrumented fork over all 741 models, **234 rule instances across
62 models** apply a BNG2 divisor > 1. Cross-referencing our live
`patternAutomorphismFactor` × `ruleSymmetryFactor`, **60 of the 62 already
divide correctly** via `ruleSymmetryFactor` (identical reactant patterns — the
legitimate ERK/rafi path).

Two models apply no division at all: `egfr_signaling_pathway` and
`fgf_signaling_pathway`, both BNG2 divisor 2 / ours 1. **Neither emits a wrong
rate** — checked per reaction against the shape-exact networks, 0 mismatches
each. The under-count is real in the factor and harmless in the output.

So the under-count direction is **not** a second bug to fix. But note:
`brusselator_oscillator` is `|RG|=2 |Stab|=2 crg=2` → net 0.5, so
`|RG|/|Stab|` alone is not always the whole divisor — `crg_permutations`
contributes independently.

**Validation warning.** A correct `|RG|/|Stab|` will change the *factor* on
`egfr_signaling_pathway` and `fgf_signaling_pathway` while leaving their
*output* identical. Validate the replacement against BNG2's measured numbers,
not emitted rates, or these two will look like the fix did nothing.

**Comparison-harness warning.** Aggregating reactions by canonical
`reactants->products` silently sums over colliding keys — `fgf_signaling_pathway`
has 484 reactions collapsing to 325 keys on *both* sides, and summing them
produced 264 phantom mismatches. Where a model has colliding keys, mismatch
counts from any aggregating comparator are unreliable. Per-reaction comparison
on the shape-exact network is the trustworthy method.
