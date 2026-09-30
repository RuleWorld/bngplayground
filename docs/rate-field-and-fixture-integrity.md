# Rate fields, compartment conversion, and fixture integrity

Three findings from comparing `motivating_example_cbngl` against the reference.
None is a parity defect; all three are traps for whoever looks next.

## 1. `net.reactions[i].rate` is not the rate of record

The expanded model's `reactions[i].rate` string is built in
`packages/engine/src/services/simulation/NetworkExpansion.ts` by
`foldedRateExpression` (`:723-726`) as `` `(${effectiveStatFactor})*(${rateExpression})` ``,
assigned at `:734`. It never receives a compartment conversion factor.

BioNetGen folds one in at `.net` write time — `Rxn.pm:66` passes `$conv_expr` into
`RateLaw::toString`, which multiplies it into the single numeric prefix
(`RateLaw.pm:752-762`). **BNG2 holds no equivalent in memory either**: `conv_expr`
exists only during serialisation.

The consequence is that the same reaction reports `kp_LR` in memory and
`0.05*kp_LR` in the `.net` written from it. That inconsistency is ours, and it is a
trap:

- **`exportODE.ts:349-353` applies `volConst` while reading that same field.** Any
  "fix" that folds the conversion into `reactions[i].rate` would double-count the
  ODE. Do not do that.
- The other numeric consumers are consistent and correct: `NetworkExporter.ts:356-369`
  re-derives the factor as `1/scalingVolume^(reactantOrder-1)`, and
  `services/analysis/JITCompiler.ts:627-671` uses it as the RHS anchor. All three
  agree with BNG2's `conv_expr` form, verified by hand on `dS1/dt`.
- **`getVolumeScalingInfo`'s `scale` field (`NetworkGenerator.ts:761`) is dead
  code.** It looks like BNG2's `conv_expr` and is not: every caller takes only
  `scalingVolume` (`:1046`, `:2039`, `:3168`), and `:757-759` returns `scale: 1`
  for mixed 2D/3D — exactly where BNG2 would divide by the volume. A future reader
  will reasonably assume it is live.

## 2. Why 114 "mismatches" were not a defect

A rate comparator that reads `net.reactions[i].rate` against BNG2's *serialised*
rate law reports 114 divergences on this model. Run through the UI's real export
path and fed back to the same comparator, **354/354 are exact**.

The 114 are exactly `1/PROD(all-but-one reactant compartment size)` under BNG2's
documented rule (`Rxn.pm:99-226`, table at `:107-118`), computed independently
from the model's compartment block — 114/114, every one a numeric-prefix
difference and nothing else.

This is a **comparator scope error**, not an engine bug: the two sides were
reading different quantities. It is a different failure from the three aggregation
artefacts earlier in this work (`fgf_signaling_pathway` 264, `motivating_example`
252, `igf1r_fit_all_*` 12 each, all zero in fact), where the fault was in the
shared comparison. Here the comparison is sound and the inputs differ.

**Generalisable rule: when comparing rates, compare like with like.** Our `.net`
is a serialised artifact and BNG2's `.net` is too; comparing a serialised artifact
against an in-memory field measures the difference between the two representations,
not between the engines.

## 3. Two reasons this model cannot be gated on trajectories

**BNG2 aborts during network generation** on `motivating_example_cbngl`:

```
ABORT: Molecule Compartments of TF(d~pY!1,dna,im!2,r)@CP.TF(d~pY!1,dna,im!3,r)@CP.Im(cargo!2!3,fg!4)@NU.NP(fg!4)@NM
       define invalid Species Compartment.
RxnRule>Rule25:  TF(im,dna,r).TF(im,dna,r) + Im(cargo)@NU -> ...
```

Reproduced twice on the pinned parity target, including with the `simulate` action
stripped. The control `motivating_example` completes on the same build and produces
both `.net` and `.gdat`. So **no BNG2 `.gdat` exists** for the `_cbngl` variant,
and there is no reference trajectory to fail against.

**The fixture is not reproducible.** `/tmp/parity_v4/motivating_example_cbngl.net`
carries `unit_conversion=` annotations that the pinned target will not re-emit.
Any future net-vs-net check against that fixture compares against something the
target cannot produce. Treat it as unverified ground truth.

Note this did not affect the gate: the networks agree on species and reactions, and
only the rate annotations differ, which is why `motivating_example_cbngl` passes
the network-shape gate at 354/354.
