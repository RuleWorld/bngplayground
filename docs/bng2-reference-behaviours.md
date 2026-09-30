# BioNetGen 2.9.3 behaviours worth knowing

Findings from comparing this engine against BNG2.pl over the RuleHub corpus.
Each is reproducible with the reference binary. Verified 2026-09-30 against
two distinct BNG installations on macOS arm64:

- **wheel** — BioNetGen 2.9.3 from the `bionetgen` PyPI wheel
  (`~/Library/Python/3.9/lib/python/site-packages/bionetgen/bng-mac`).
  This is the environment all original numbers below were produced in.
- **checkout** — this workspace's repo at `BioNetGen-2.9.3-633-g8726b30b`
  (`bionetgen/bionetgen/bng2`), i.e. latest codebase, 633 commits past the
  2.9.3 tag. Several defects below are **already fixed here**; each finding
  states its status per binary.

Only items verified by direct reproduction are recorded here. A final section
lists things that look like bugs but are not, so they are not re-investigated.

## Reproduction prerequisites (all of section 1 depends on these)

Two non-obvious preconditions that the original version of this doc omitted.
Neither is standard BNGL; both were inherited from the pybionetfit-based
sweep that produced the original audit.

**1. The `__FREE` parameters abort stock BNG2.** The RuleHub models declare
parameters as `b2 b2__FREE #1e-5` (pybionetfit free-parameter convention,
the `*_FREE` symbol carries the fit value). Stock BNG2 does not know this
syntax and stops with `ABORT: Parameter 'c1_L__FREE' is referenced but not
defined`. Every reproduction below therefore patches the model first: define
each `X__FREE` as a real parameter. The patch is mechanical — the default
value is the number in the trailing comment on the same line
(`b2 b2__FREE #1e-5` → add `b2__FREE 1e-5`; for `p2b p2b__FREE*5 #X*p2a`
with `X=5, p2a=1e-6`, use `p2b__FREE 1e-6`; scale factors with no value
comment get `1`). The trailing actions block (`setParameter`, `simulate`)
is stripped and replaced with `generate_network({overwrite=>1});`.

**2. Patch placement decides whether the bug appears at all.** This is the
single most important reproducibility fact in this document:

- **Definitions placed BEFORE the `X X__FREE` use lines** (leading patch):
  each parameter resolves as a plain number, every rate law is typed `Ele`,
  `Rxn->stringID()` sorts the reactant indices for `Ele`, dedup works, and
  **zero duplicates are emitted on either binary**. A leading-patch run of
  MEK WT on the wheel yields 689 lines / 0 surplus and egfr yields
  3749 / 0 — which looks like the doc's bug does not exist.
- **Definitions placed AFTER the use lines** (trailing/forward-ref patch,
  e.g. inserted just before `end parameters`): the forward references make
  BNG register `b2` etc. as zero-arg functions (`begin functions` section
  of the `.net` shows `b2() b2__FREE`), `RateLaw::newRateLaw` classifies
  the rate law as `Type='Function'` (`bng-mac/Perl2/RateLaw.pm:201-207`),
  and the unsorted-`Function` key path in `stringID` is entered. **This is
  the configuration that reproduces every number in section 1**, and it is
  what the original audit must have used — the wheel `.net` it quoted is
  line-for-line identical to a trailing-patch output.

So the defect is real but conditional: stock 2.9.3 + Function-typed rate
laws (forward-referenced parameters, or any model where a rate-law constant
resolves through a function). With numeric `Ele` rate laws the same model
dedups correctly on the same binary.

## 1. Duplicate reaction entries for reversible homodimer rules — confirmed defect (wheel 2.9.3), fixed at checkout HEAD

When a rule binds two copies of the same molecule type, wheel-2.9.3
`generate_network` writes the resulting reaction **twice**, once per ordering
of the two reactant species indices. The entries describe the same chemistry
and carry the same rate law; only the reactant list order differs.

### Reproduction (trailing patch, wheel binary)

```bash
export BNGPATH=~/Library/Python/3.9/lib/python/site-packages/bionetgen/bng-mac
# model patched per "Reproduction prerequisites" above, defs AFTER uses
perl $BNGPATH/BNG2.pl MEK_isoform_optimization_DE_MEK1_WT.bngl
```

`begin reactions` contains, among others:

```
    2 5,6 11 0.5*b2 #_R1
    3 6,5 11 0.5*b2 #_R1
   11 5,17 18 0.5*b2 #_R1
   13 17,5 18 0.5*b2 #_R1
```

All four lines verified verbatim on the wheel binary (767 total lines).

### Counts depend on the key — three keys, all used in this repo's docs

| key | reactants | products | rate | MEK WT (wheel) | egfr (wheel) |
|---|---|---|---|---|---|
| raw lines | — | — | — | 767 | 4301 |
| **audit key** (this doc's §Reproducing) | sorted | as-written | kept | 725 distinct → **42 surplus** | 4025 → **276 surplus** |
| **canonical key** (`compare_networks.ts:85` `canonicalReaction`, sorts both sides, drops rate) | sorted | **sorted** | dropped | 636 distinct → 131 surplus | 3749 distinct → 552 surplus |

The table in §Scale below uses the **audit key**. The narrative "636
distinct" and "3749 emitted" figures (here and in `handoff-ci-parity.md`'s
"3749 vs 4301" row) are the **canonical key**. Both are individually correct;
the original text silently mixed them. Cross-check: handoff's "552 short"
equals exactly 4301 − 3749, i.e. the engine's egfr count equals BNG2's
canonical-key distinct set — that entire apparent gap is duplicate artifact,
same as the MEK 636-vs-636 zero-difference result.

The 276-vs-552 difference on egfr is itself informative: the canonical key
sorts the **product** side too, and the same homodimer defect appears again
on dissociation lines (`11 -> 5,6` vs `11 -> 6,5`). The audit key's 276
counts reactant-side swaps only; the extra 276 are product-side swaps.

### Scale, across the whole corpus (audit key, trailing patch, wheel binary)

Auditing every `.net` produced for the original RuleHub sweep (748 models at
the time; the corpus has since grown to 918 `.bngl` files — see §Corpus
drift), 7 models contain repeated reaction entries — 453 surplus lines in
total:

| model | surplus reaction lines | re-verified 2026-09-30 |
|---|---|---|
| `egfr` | 276 | ✓ (276 of 4301 raw) |
| `mek_isoform_optimization_de_mek1_ko` | 42 | ✓ |
| `mek_isoform_optimization_de_mek1_t292a` | 42 | ✓ |
| `mek_isoform_optimization_de_mek1_t292d` | 42 | ✓ |
| `mek_isoform_optimization_de_mek1_wt` | 42 | ✓ |
| `mek_isoform_optimization_de_mek1_n78g` | 6 | ✓ (731 raw / 725 distinct) |
| (1 further model, 3 lines) | 3 | pending re-identification in full-corpus sweep |

For `egfr` that is 276 duplicate lines against 3749 canonical-distinct
(4301 raw) — roughly 7%. The aMCMC MEK variants (5 files) correctly show 0
and are not in the table; `Tutorials/egfrnet` (3749 raw, no `__FREE` params)
also shows 0.

### Why it matters here

A consumer that *counts* reactions sees a network larger than the real one.
Our engine generates 636 distinct reactions for the MEK model (canonical
key), matching BNG2's own distinct set exactly — zero difference in either
direction — but BNG2's raw `.net` count of 767 made an identical network look
like ours was short by 131. For egfr the analogous raw gap is 552
(4301 vs 3749) of which the engine shares no actual set difference: the
engine's 3749 IS BNG2's canonical distinct count.

This is why `tools/validation/compare_networks.ts` compares the **set** of
distinct reactions rather than the raw total. That is a deliberate, measured
decision, not a tolerance: a model whose unique reaction set differs still fails.

Filed upstream: <https://github.com/RuleWorld/bionetgen/issues/344>
(open; states 767/725/42 with "39 from the swapped ordering, 3
byte-identical repeats" — matches independent re-measurement).

### Mechanism (verified against wheel sources, file:line)

Chain of three causes:

1. **Rate laws become Function-typed** (precondition from §Reproduction
   prerequisites): forward-referenced `*_FREE` params → `b2` registered as
   zero-arg function → `RateLaw::newRateLaw` sets `Type='Function'`
   (`bng-mac/Perl2/RateLaw.pm:201-207`). ~816/817 reactions in the MEK run
   are Function-typed; the one `Ele` is the literal `c1 0`.

2. **The dedup key is not normalised for Function laws:**
   `Rxn->stringID()` (`bng-mac/Perl2/Rxn.pm:376`) builds the hash key from
   the reactant index list **in storage order** and sorts it only
   `if ( $type eq "Ele" )` (`bng-mac/Perl2/Rxn.pm:403`) — the in-code
   comment literally reads `# TODO: sort Function ratelaws?`. For Function
   laws the (5,6) match keys `'5,6 11'` and the (6,5) match keys
   `'6,5 11'`: different buckets.

3. **Add never compares across buckets:** `RxnList::add`
   (`bng-mac/Perl2/RxnList.pm:59`) merges only when
   `exists $rlist->Hash->{$rstring}` (`:78`); different keys → both pushed
   to the array, both written to `.net`. Callers are `RxnRule.pm:3015` and
   `RxnRule.pm:3043` during rule expansion. A symmetric rule (`A + A`)
   enumerates both ordered matches, each carrying rule-level
   `StatFactor = MultScale = 0.5` (`RxnRule.pm:3383`), hence both lines
   print `0.5*b2`. Non-symmetric rules (`MEK2 + MEK1`) never enumerate the
   swap — which is why only same-molecule-type reactant pairs duplicate
   (39 of the 42 MEK duplicates; verified against the `begin species` table:
   MEK1_wt×MEK1_wt or MEK2_wt×MEK2_wt).

**Not all duplicates are ordered pairs.** 3 of the 42 MEK lines are a
*separate* phenomenon: byte-identical **single**-reactant lines from two
different rules —
`233 44 20 u5 #_R33` vs `237 44 20 u5 #_R35` (rule 25's PHP-bound MEK1
Yp→Y dephosphorylation and rule 26's MEK1-dimer Yp→Y dephosphorylation both
match the same doubly-PHP-bound MEK1 homodimer species). Here the key
(`'44 20'`) IS identical, so the merge fails one level down:
`RateLaw::equivalent` (`RateLaw.pm:564`) delegates Function laws to
`Function::equivalent` (`:586-592`), and `Function.pm:165` contains an
**inverted identity check**:

```perl
# check if this is the same function object!
return 0 if ( $fcn1 == $fcn2 );
```

Identical function objects report NOT-equivalent, while content-equal
distinct objects return 1 (`Function.pm:170-182`). Both rules' `u5` rate
laws resolve to the same `u5` function object → 0 → never merged.
Instrumented `RxnList::add` confirmed: `DBGCHK key=44 20 eq=0 c1=u5 c2=u5`.

So the original doc's claim that surviving duplicates "ALL have two reactants
drawn from the same molecule type" was an overstatement: 39/42 do, 3/42 are
cross-rule byte-identical singles with a different root cause. The same 3
lines are the *entire* residual duplicate set at checkout HEAD (next
subsection).

### Status at latest codebase (checkout `8726b30b`)

**The ordered-pair class is fixed; the cross-rule class is not.**

| | wheel 2.9.3 | checkout HEAD |
|---|---|---|
| MEK WT raw lines | 767 | 692 |
| audit-key surplus | 42 | **3** (only the cross-rule singles above) |
| canonical-key distinct | 636 | 636 (same set) |
| quoted lines `2 5,6 11` / `3 6,5 11` | present verbatim | absent — one merged line `2 5,6 11 b2` |
| egfr surplus | 276 | **0** |

Two commits did this:

- **`331b7cb0` "fix: sort Function ratelaws (#27)"** — the actual fix for
  the ordered-pair class. Added `or $type eq "Function"` to `stringID`'s
  sort condition: checkout `bng2/Perl2/Rxn.pm:416`
  (`if ( $type eq "Ele" or $type eq "Function" )`, comment: "Function
  ratelaws are sorted after local context evaluation"). Both orderings now
  key `'5,6 11'`, merge, and StatFactors add (0.5+0.5=1 — which is why the
  surviving HEAD line reads `b2`, not `0.5*b2`). The commit message says it
  resolves the in-code TODO; it does **not** reference upstream issue #344
  (`git log --all --grep '#344'` is empty).

- **`a3e3b1ca` "Refactor: remove obsolete RateLaw equivalence checks…" (#138)**
  — incidental, not a fix for this bug. Replaced
  `RateLaw::equivalent($rxn->RateLaw, $rxn2->RateLaw, $plist)` with **pointer
  identity** `$rxn->RateLaw == $rxn2->RateLaw` (checkout
  `bng2/Perl2/RxnList.pm:86`) and deleted `RateLaw::equivalent` /
  `Function::equivalent` entirely (so the doc's old `RateLaw.pm:564-604`
  citation no longer resolves at HEAD). It works for ordered pairs because
  same-rule reactions share one RateLaw object (both come from
  `$rr->RateLaw->evaluate_local(...)`, `RxnRule.pm:3382-3388`, which returns
  the same object absent local context), but **it never merges across
  rules** — distinct rules hold distinct objects. That is why HEAD still
  emits the 3 byte-identical cross-rule pairs: the inverted
  `Function::equivalent` check was removed rather than corrected, and its
  failure mode (cross-rule non-merge) survives in pointer-identity form.

**Residual defect at HEAD (was current, now fixed — see below):** any two
different rules that generate byte-identical reactions (same reactants,
products, and rate-law expression) were written twice, because
`RxnList::add:86` compared rate laws by object identity instead of
structure. At HEAD this cost MEK 3 of 692 lines (0.4%); invisible to
set-comparison consumers, still wrong for counters. It was also a mild
regression versus 2.9.3: wheel + leading patch on MEK = 689 lines / 0
surplus, HEAD (pre-fix) + same patch = 692 / 3. The deleted
`Function::equivalent` inverted check had been removed rather than
corrected, so its failure mode survived in pointer-identity form.

### Fix applied (working tree, uncommitted, 2026-09-30)

Restored structural rate-law comparison at the merge site, with the old
identity-check bug corrected:

- `bng2/Perl2/RxnList.pm:86` — merge condition back to
  `RateLaw::equivalent($rxn->RateLaw, $rxn2->RateLaw, $plist)`; the
  existing-but-unused `$plist` parameter of `add()` is consumed again
  (call sites `RxnRule.pm:3015`/`:3043` and `RxnList::readString` already
  pass it — no signature change).
- `bng2/Perl2/RateLaw.pm:669-721` — restored `RateLaw::equivalent`
  (type dispatch, object-identity fast path, Type/#Constants/Factor/
  TotalRate check, Function branch via `Function::equivalent`, else
  Constants string compare). `FunctionProduct` left conservatively
  no-merge — same as 2.9.3.
- `bng2/Perl2/Function.pm:117-155` — restored `Function::equivalent` with
  the identity check **fixed**: `return 1 if ($fcn1 == $fcn2)` (the
  deleted 2.9.3 code had the inverted `return 0` — see Mechanism above).
- `tests/fixtures/cross_rule_duplicate_rxn.bngl` +
  `tests/test_bng2_cross_rule_merge.cmake` + registration in
  `tests/CMakeLists.txt` — regression test asserting exactly one reaction
  entry, `#_R1,_R2` refs, and summed factor `2*k`.

Validation (all re-run independently after the agent reported):

| check | result |
|---|---|
| new test on unmodified HEAD | FAILED first ("found 2") — genuine failing-before |
| `ctest -R bng2` after fix | 7/7 passed |
| MEK WT HEAD after fix | 689 lines / 0 surplus (was 692/3) |
| fixed HEAD reaction block vs wheel 2.9.3 | **byte-identical** |
| pre vs post diff | exactly 6 lines removed (the 3 known pairs), 3 added (`44 20 2*u5 #_R33,_R35`, `56 44 4*u5 #_R33,_R35,_R35`, `89 74 2*u5 #_R33,_R35`), all others unchanged modulo index renumbering |
| 5 existing fixture models (issue_090/217/234/295/312) HEAD-versions vs fixed | artifacts byte-identical |

Behavioral notes: StatFactors sum on fold (flux unchanged: `u5+u5→2*u5`
matches the 2.9.3 wheel exactly); cross-rule merges now print the existing
`Duplicate of rxn N detected...` console WARNING (4 on MEK, same as wheel —
tests asserting warning-free output could notice); models with such
duplicate pairs see `.net` line counts/indexes shift from the first merge
point. Approach note: chose localized structural compare over extending
`LocalRatelawsHash` cross-rule (per-rule object cache — sharing it would
change object identity model-wide); the unreachable deleted `deleteParam`
cleanup block was intentionally not restored.

### Original line-citation corrections

The first version of this section cited `stringID` at `Perl2/Rxn.pm:75-87`
and `RateLaw::equivalent` at `Perl2/RateLaw.pm:564-604`. Verified positions:

| symbol | wheel 2.9.3 | checkout HEAD |
|---|---|---|
| `Rxn::stringID` | `Rxn.pm:376` (sort-if at `:403`) | `Rxn.pm:389` (sort-if at `:416`) |
| `RxnList::add` | `RxnList.pm:59` (hash-exists at `:78`) | `RxnList.pm` (merge check at `:86`) |
| `RateLaw::equivalent` | `RateLaw.pm:564-604` ✓ | **deleted** by `a3e3b1ca` |
| `Function::equivalent` inverted check | `Function.pm:165` | **deleted** by `a3e3b1ca` |

## Corpus drift

The original audit ran 748 models. The RuleHub corpus on disk today contains
**918 `.bngl` files** (Published 656, Examples 175, Tutorials 87; 871 unique
basenames; `manifest.json` lists 482). Any count comparison against the
"748 models" figure must account for growth — model counts in this document
are as-of-audit, not as-of-today.

## Looked at and ruled out

Not bugs, despite appearances — do not spend time on these again.

**Species index `0` is not a dangling reference.** Reactions such as
`1 0 5 _rateLaw1` use index 0 to mean "no reactant". 520 of the 748 models
contain such lines; an audit that treats 0 as a species index will report all
of them as broken.

**A seed species made of two disjoint components is rejected.** `R(a!1).S(p!1).R(a!2).S(p!2)`
draws two separate dimers, and BNG2 stops with
`ABORT: Species ... is not connected` (`SpeciesGraph.pm:313-315`). A matching
engine should reject it too.

**A bidirectional type-changing rule is fine, provided both rate laws are
given.** `A(t,t,t) <-> B(t,t) kf,kr` is accepted and expands correctly; writing
it with a single rate law fails with
`ERROR: Expecting--but did not find--second ratelaw for reversible rule`, which is
the accurate complaint. The same rule unidirectionally is also fine.

**Bond labels are labelling, not chemistry.** BNG2 keeps bond labels in the
`.net` (`StringExact`), so two species that differ only in bond numbering are
written differently. Comparison has to canonicalise before concluding they
differ — see `canonicalSpecies` in `tools/validation/compare_networks.ts`.

## Reproducing the audit

Corpus-wide surplus counts come from parsing `.net` files and grouping
reactions by the **audit key**: (sorted reactant indices, products
as-written, rate expression), ignoring the trailing `#_Rule` label. Under
this key the doc's table numbers (276 / 42×4 / 6) reproduce exactly on the
wheel binary with a trailing `*_FREE` patch.

Two other keys appear in this repo's documentation and must not be confused
with the audit key:

- **canonical key** — `canonicalReaction` in
  `tools/validation/compare_networks.ts:85-94`: sorts reactants AND
  products (after `canonicalSpecies`), drops the rate expression. Source of
  the "636 distinct" (MEK) and "3749" (egfr) figures. This is also how
  `Rxn->stringID()` keys `Ele` rate laws, which is why canonical-key
  distinct counts match between BNG2 and our engine.
- **raw line count** — what a naive `grep -c` on `begin reactions` returns
  (767 / 4301 on the wheel); inflated by the duplicates this document
  describes.

Environment matrix for every number in section 1 (re-verified 2026-09-30):

| condition | MEK WT | egfr |
|---|---|---|
| wheel + trailing patch | 767 / 42 surplus | 4301 / 276 |
| wheel + leading patch | 689 / 0 | 3749 / 0 |
| checkout + trailing patch | 692 / 3 | 3749 / 0 |
| checkout + leading patch | 692 / 3 | 3749 / 0 |
| stock BNG2, unpatched model | `ABORT: Parameter 'c1_L__FREE' is referenced but not defined` | same abort (`kp1__FREE`) |
