# What BNG2's statistical factor actually is

Status: **investigation result, no code changed.** Worktree `/tmp/wt-rgstab`,
`git diff --stat` empty. Everything below is measured against akutuva21/bionetgen
@ 3513bca7 with the instrumented fork; `/tmp/sfscratch2/bngdbg` is byte-identical
to the clean fork except for a `BNGDBG` print at `Perl2/RxnRule.pm:2850`.

## 1. The derivation

`RxnRule::find_reaction_center` (`Perl2/RxnRule.pm:2659-2849`) computes, from the
rule's **own patterns only** — never from the network and never from a match:

1. `rg = SpeciesGraph::copymerge(@{$rr->Reactants})` (called from `findMap`,
   `2053`): all reactant patterns merged into one disconnected graph. Molecules
   get a global index; `@aggMapR[i] = "$ipatt.$imol"` (`2058-2065`).
   `pg = copymerge(Products)`, and `$map = $rg->findMaps($pg)` (`2078`) — one
   chosen isomorphism from the merged reactant graph to the merged product graph.

2. `@r_auto = $rg->isomorphicToSubgraph($rg)`, then filtered (`2681-2717`) to
   those mapping each pattern's **whole** molecule set onto a whole pattern's
   molecule set. So `r_auto` = the automorphisms of the merged reactant graph
   that induce a permutation of the reactant *patterns*. This is the point a
   self-apply test on the rule's own patterns cannot reach — see §4.

3. `@p_auto = $pg->isomorphicToSubgraph($pg)`, unfiltered.

4. `@RuleGroup` (`2736-2744`) = `{ α ∈ r_auto : map ∘ α ∘ map⁻¹ ∈ p_auto }`.
   `get_induced_permutation` (`Map.pm:105-179`) defines `permP(p) =
   map(α(map⁻¹(p)))` for `p` in the image of R, and `permP(p) = p` for product
   nodes **created** by the rule. `RG` is therefore the preimage of `p_auto`
   under the homomorphism `α ↦ permP`: a subgroup of `r_auto`. Its meaning is
   that a reactant symmetry is a symmetry *of the reaction* only if relabelling
   the reactants induces a genuine product-graph symmetry. If it does not lift,
   the exchange is a different reaction mechanism and must not be divided away.

5. `@StabRxnCntr` (`2750-2810`) = `{ α ∈ RG : α fixes every reaction centre
   element }`. A centre element `p.m.c` is tested in aggregate coordinates:
   `α->MapF->{"$imolAgg.$icomp"} eq "$imolAgg.$icomp"`; a bare pattern index `i`
   is tested by `patt_map{i} == i`. Pointwise stabilizer of the centre, hence a
   **subgroup of RG**; `|RG|/|Stab|` is the orbit-stabilizer index, i.e. the
   number of distinct realisations of the reaction centre.

6. `crg_permutations` (`2813-2845`) = product of `classSize!` over isomorphism
   classes of **pure-context** reactant patterns (those whose
   `ReactionCenter->[$i]` is empty). Independent of RG/Stab and load-bearing:
   `brusselator_oscillator` nets 0.5 from `|RG|=|Stab|=2` **and** `crg=2`.

7. `multScale = 1 / ((|RG|/|Stab|) · crg_permutations)` (`2847`).

And in rule application:

8. `find_embeddings` (`3073-3124`) collects `isomorphicToSubgraph` matches per
   (pattern, species) and calls `filter_identical_by_rxn_center` (`3117`).
9. `filter_identical_by_rxn_center` (`3513-3591`) keeps **one match per distinct
   image of the reaction centre**: for each match it builds
   `["$iPatt." . $match->MapF->{$iMC}, ...]` over that pattern's centre pointers
   and splices out any match whose image list equals an earlier one. Comparison
   is element-wise in stored order, so a pure reordering is *not* a match. It
   early-returns when there is at most one match.
10. `build_reaction` sets `StatFactor = $rr->MultScale` (`3397`).
11. `RxnList::add` **sums** `StatFactor` when merging into an existing entry with
    the same `stringID` and an equivalent rate law (`RxnList.pm:88`).

> **BNG2's emitted factor for one `.net` entry = (number of surviving rule
> instances) × multScale**, and the surviving count is per-reactant-pattern,
> one per distinct reaction-centre image.

The reaction centre itself is built by `find_reaction_center` (`3416-3504`) from
the rule's **op lists**: `EdgeAdd` (mapped back to reactant space), `EdgeDel`,
`MolDel`, `CompStateChange`, `ChangeCompartment`.

## 2. Check against the data points

| rule | \|RG\| | \|Stab\| | crg | multScale | BNG2 factor | ours |
|---|---|---|---|---|---|---|
| `ERK(s~P,b)+ERK(s~P,b)→dimer` | 2 | 1 | 1 | 0.5 | 0.5 | 0.5 ✓ |
| rafi `R(r,i)+R(r,i)↔dimer` | 2 | 1 | 1 | 0.5 | 0.5 | 0.5 ✓ |
| igf1r `L(ds,hs)+R(S1,C!0).R(S2,C!0)` | 1 | 1 | 1 | **1** | 1 | 1 ✓ |
| brusselator `X+X+Y→3X` | 2 | 2 | 2 | 0.5 | 0.5 | 0.5 ✓ |

igf1r = 1 is reproduced (the derivation agrees on all four required points).

**`zhang_2021`: `multScale = 1` for all 26 rule instances — `|RG| == |Stab|`
everywhere.** So the entire emitted factor is the surviving-instance count. It
equals `|Emb(pattern, S)| / |{α ∈ Aut(pattern) : α fixes the centre}|`, which I
verified as arithmetic against the `.net`:

| rule | \|Emb\| | centre | \|Stab(pattern)\| | BNG2 | ours |
|---|---|---|---|---|---|
| `_R1` | 24 | `{c0}` (receptor site that binds) | 3! = 6 | 4 | 4 ✓ |
| `_R2` | 6 | `{c1}` | 2! = 2 | 3 | 3 ✓ |
| `_R3` | 4 | `{c2}` | 2 | 2 | 2 ✓ |
| `_R4` | 6 | `{c3}` | 3! = 6 | 1 | **6 ✗** |
| `_R9` | 2 | `{c2}` | 2 | 1 | **2 ✗** |
| `_R13` | 6 | `{c3}` | 6 | 1 | **6 ✗** |

That is the "free binding site count" `docs/stat-factor-finding.md` observed,
derived rather than fitted.

## 3. Why replacing `patternAutomorphismFactor` cannot work at that call site

**(A) The term is already inert for every zhang rule.** `pAuto` is 2 for
`_R3/_R9/_R12/_R53/_R59/_R62` and 6 for `_R4/_R13/_R54/_R63`, yet the emitted
statFactor equals the raw instance count exactly. Deleting the division outright
(`getMoleculeAutomorphismFactor → 1`; the patch is proven effective because
rafi `_R3` moves 2 → 4) leaves **every** zhang statFactor unchanged. BNG2's
divisor for those rules is 1, so substituting 1 for 6 is a no-op by
construction: the term is not in the causal path.

**(B) Applying BNG2's divisor additively there double-divides.**
`ruleSymmetryFactor` already carries the `|RG|/|Stab|` term wherever it is > 1.
Aligned measurement (BNG2 `D = (|RG|/|Stab|)·crg` vs our `ruleSymmetryFactor`):

| | BNG2 D | our ruleSym |
|---|---|---|
| rafi `_R1` | 2 | 2 |
| erk `_R2` | 2 | 2 |
| brusselator `_R3` | 2 | 2 (but via `crg=2`, `|RG|=|Stab|`) |
| igf1r, all 12 instances | 1 | 1 |

Dividing again emits `0.25*kf1` where BNG2 writes `0.5*kf1` — the rafi hard
constraint breaks immediately.

BNG2 does apply `D=2` where we apply 1 on rafi `_R1_rev`, `_R6`, `_R6_rev` and
erk `_R2_rev`; all four still emit **correct** rates because instance folding
compensates. That is the `egfr_signaling_pathway` / `fgf_signaling_pathway`
under-count the finding doc describes — a real factor defect, but one whose fix
will not move output.

## 4. Ruled out — do not re-try these

- **Self-apply permutation test on the rule's own patterns.** Confirmed dead
  from the dumps: swapping identical patterns leaves the product pattern
  textually unchanged, and BNG2's `r_auto` is defined on the *merged* graph with
  the pattern partition respected (`zhang` DBG#1: `rg = Ang1_4 + Tie2`,
  `r_auto = S4` on Ang1_4's four `tie2bs` = 24).
- **`patternAutomorphismFactor` as the lever.** Inert for zhang (A);
  double-divides rafi (B).
- **Component-aware `getPatternAutomorphismFactor`.** Already in the doc; I did
  not re-test it.
- **Deleting the term.** Measured on the corrected comparator: rafi `_R3`
  2 → 4 (wrong; BNG2 writes 2), `_R1_rev/_R5_rev/_R6` shift; zhang entirely
  unaffected.
- **Component-signature heuristic for the centre** (a reactant component is
  "written" iff no component of the same name/state/bond-count exists in the
  products). **Measured wrong on rafi `_R3`**: BNG2's centre is `0.0.1` — the
  `i` of the first `R` molecule — even though the product also contains an
  unbound `i`. The centre comes from the op lists (`!2` is *added* at
  `0.0.1 ↔ 1.0.0`), so a signature comparison cannot reproduce it.
- **`GraphMatcher.findAllMaps(reactantPattern, productPattern)`** for the
  correspondence: **0 maps**, with and without `allowExtraTargetBonds: true`
  (measured on zhang `_R4` reactant[0], zhang `_R1` reactant[0], rafi `_R1`,
  rafi `_R3`). The matcher demands equal bond structure; the product's new bond
  makes the map impossible.
- **The `RxnRule` op arrays.** `addBonds`, `deleteBonds`, `changeStates`,
  `deleteMolecules`, `molecularMap` are **empty for every rule of every model
  tested**. `grep` over `packages/engine/src` finds only the constructor
  initialisers — nothing ever writes them. So the centre cannot be derived from
  them, and the guards next to `patternAutomorphismFactor` that test
  `rule.addBonds.length > 0` (`NetworkGenerator.ts:1838-1852`, `2740-2742`) read
  permanently-empty arrays.
- **Self-application with identity matches**
  (`applyRuleTransformation(rule, rule.reactants, rule.reactants, identity)`):
  builds the product, but picks a **non-canonical** correspondence among
  interchangeable molecules — for zhang `_R2` it assigns the new bond to
  `tie2bs!2/!3` instead of `!1/!2`, for `_R4` to `!4/!5/!6/!7` instead of
  `!1/!2/!3/!4`. A centre derived from it is wrong.

## 5. Where the real fix goes

`NetworkGenerator.applyNaryRule`, in the two places where `profiledFindAllMaps`
results become `matches` — after the loop at `2434-2446` (the anchor pattern `i`
against `currentSpecies.graph`) and after `2592` (the recursion's partner
patterns). Our scope there is already per (pattern, species), which is exactly
BNG2's `find_embeddings` scope, and BNG2 filters for **every** pattern index, so
both sites need it.

The filter is a no-op except where it should bite, which is why it is a small and
safe change:

- zhang `_R1`, `_R2`: our matcher already returns **1** map (the free-site choice
  is folded into `multiplicity`), and BNG2's filter early-returns on ≤1 match.
- zhang `_R3`: 2 maps with **distinct** centre images → keeps 2 (already right).
- zhang `_R4`, `_R9`, `_R13`: 6/2/6 maps with **identical** centre images → keeps 1. This is the fix.
- rafi `_R3`: centre is `{m0's i}`; the 2 maps give images `{s0.i}` vs `{s1.i}`,
  distinct → keeps 2 (stays exact).

The one missing prerequisite is **a rule-level reaction centre**. Nothing in our
tree identifies one. The faithful source is BNG2's: the rule's add/delete-bond,
state-change, compartment-change and delete-molecule op lists — which we declare
on `RxnRule` but never populate. Two viable routes:

- populate the op arrays in `BNGLParser.parseRxnRule` (`BNGLParser.ts:556`), so
  `find_reaction_center` becomes a direct transcription; or
- lift the mapping `buildProductGraph` already computes
  (`NetworkGenerator.ts:4302+`, via `productPatternToReactant` /
  `componentIndexMap`) into a cacheable per-rule form that runs on patterns
  rather than concrete graphs — and canonicalise it, since the current
  preference order picks an arbitrary representative among interchangeable
  molecules.

Both are real design work, which is what `docs/stat-factor-finding.md` already
flagged as needing its own session.

## 6. Baseline (unchanged tree)

Throwaway per-reaction `.net` comparator at `/tmp/rgstab/cmp.mts`: parses both
`.net` files, canonicalises species with the repo's own `GraphCanonicalizer`,
resolves BNG2 parameters and `_rateLawN` indirection, compares per reaction on
(canonical reactants, canonical products) with a **multiset** of numeric rates —
never a sum, never an aggregate over colliding keys. It reproduces the finding
doc's `zhang_2021` numbers exactly and confirms its `motivating_example_cbngl`
= 114 while `motivating_example` = 0.

- `zhang_2021`: 150/150 species, 496/496 reactions, 496/496 keys, onlyRef 0,
  onlyOur 0, **RATE-MISMATCH=6** (2 functional rates unevaluated).
- 9 × `rafi_*`: 6/6, 12/12, 12/12 keys, **0** each. Hard constraint holds.
- 4 × `igf1r_fit_all_*`: 27/27, 96/96, **0** each. The doc's "12 mismatches each"
  does **not** reproduce — that was the aggregating comparator.
- `auto_activation_loop`, `brusselator_oscillator`,
  `erk_nuclear_translocation`, `beta_adrenergic_response`,
  `egfr_signaling_pathway`, `fgf_signaling_pathway`, `complexdegradation`,
  `barua_2013`, `kesseler_2013`: **0**.
- `egfr`: 356/3749 shape-exact; **all 3749 rates unevaluated** (functional), so
  shape only.
- `motivating_example`: 0 rate mismatches, 13 unmatched keys each side
  (pre-existing, orthogonal).
- `motivating_example_cbngl`: **114** rate mismatches — a real model-level gap,
  not investigated.