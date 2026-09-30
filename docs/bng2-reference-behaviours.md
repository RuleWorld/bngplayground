# BioNetGen 2.9.3 behaviours worth knowing

Findings from comparing this engine against BNG2.pl over the RuleHub corpus.
Each is reproducible with the reference binary; the environment used was
BioNetGen 2.9.3 from the `bionetgen` wheel on macOS arm64.

Only items verified by direct reproduction are recorded here. A final section
lists things that look like bugs but are not, so they are not re-investigated.

## 1. Duplicate reaction entries for reversible homodimer rules — confirmed defect

When a rule binds two copies of the same molecule type, `generate_network`
writes the resulting reaction **twice**, once per ordering of the two reactant
species indices. The entries describe the same chemistry and carry the same
rate law; only the reactant list order differs.

### Reproduction

```bash
export BNGPATH=/path/to/bionetgen/bng-linux
perl $BNGPATH/BNG2.pl MEK_isoform_optimization_DE_MEK1_WT.bngl
```

`begin reactions` contains, among others:

```
    2 5,6 11 0.5*b2 #_R1
    3 6,5 11 0.5*b2 #_R1
   11 5,17 18 0.5*b2 #_R1
   13 17,5 18 0.5*b2 #_R1
```

### Scale, across the whole corpus

Auditing every `.net` produced for the RuleHub sweep (748 models), 7 models
contain repeated reaction entries — 453 surplus lines in total:

| model | surplus reaction lines |
|---|---|
| `egfr` | 276 |
| `mek_isoform_optimization_de_mek1_ko` | 42 |
| `mek_isoform_optimization_de_mek1_t292a` | 42 |
| `mek_isoform_optimization_de_mek1_t292d` | 42 |
| `mek_isoform_optimization_de_mek1_wt` | 42 |
| `mek_isoform_optimization_de_mek1_n78g` | 6 |
| (1 further model, 3 lines) | 3 |

For `egfr` that is 276 duplicate lines against 3749 emitted — roughly 7%.

### Why it matters here

A consumer that *counts* reactions sees a network larger than the real one. Our
engine generates 636 distinct reactions for the MEK model, matching BNG2's own
distinct set exactly — zero difference in either direction — but BNG2's raw
`.net` count of 767 made an identical network look like ours was short by 131.

This is why `tools/validation/compare_networks.ts` compares the **set** of
distinct reactions rather than the raw total. That is a deliberate, measured
decision, not a tolerance: a model whose unique reaction set differs still fails.

Filed upstream: <https://github.com/RuleWorld/bionetgen/issues/344>

### Likely mechanism

`RxnList::add` appears intended to fold a reaction into an existing entry when
the species indices and an equivalent rate law match — `Rxn->stringID()`
(`Perl2/Rxn.pm:75-87`) and `RateLaw::equivalent` (`Perl2/RateLaw.pm:564-604`)
exist for that purpose, and single-reactant and non-symmetric cases do dedup. The
surviving duplicates all have two reactants drawn from the same molecule type,
which suggests the multi-reactant index list is not normalised before comparison.

## Looked at and ruled out

Not bugs, despite appearances — do not spend time on these again.

**Species index `0` is not a dangling reference.** Reactions such as
`1 0 5 _rateLaw1` use index 0 to mean "no reactant". 520 of the 748 models
contain such lines; an audit that treats 0 as a species index will report all of
them as broken.

**A seed species made of two disjoint components is rejected.** `R(a!1).S(p!1).R(a!2).S(p!2)`
draws two separate dimers, and BNG2 stops with
`ABORT: Species ... is not connected` (`SpeciesGraph.pm:313-315`). A matching
engine should reject it too.

**A bidirectional type-changing rule is fine, provided both rate laws are
given.** `A(t,t,t) <-> B(t,t) kf,kr` is accepted and expands correctly; writing
it with a single rate law fails with
`ERROR: Expecting--but did not find--second ratelaw for reversible rule`, which
is the accurate complaint. The same rule unidirectionally is also fine.

**Bond labels are labelling, not chemistry.** BNG2 keeps bond labels in the
`.net` (`StringExact`), so two species that differ only in bond numbering are
written differently. Comparison has to canonicalise before concluding they
differ — see `canonicalSpecies` in `tools/validation/compare_networks.ts`.

## Reproducing the audit

The corpus-wide duplicate count came from parsing the `.net` files the reference
sweep produces and grouping reactions by (sorted reactant indices, products,
rate), ignoring the trailing `#_Rule` label. Same convention as
`canonicalReaction` in the network-shape gate.
