# Playground Atomizer versus SBML

**Audit date:** 2026-09-08
**Audited component:** `src/lib/atomizer` in `julesplayground`
**Baseline repository commit:** `d9226a164df335ab5ece8c3b091c0c1a235e1b98`
**Assessment status:** baseline audit plus post-fix validation recorded from the pinned suite snapshot; the checked-in runner is `scripts/atomizer/sbml_suite_audit.ts`.

## Executive conclusion

The Atomizer is a useful importer for a substantial **kinetic, flat SBML subset**: compartments, species, parameters, reactions, common kinetic-law MathML, many rules, initial assignments, unit scaling, annotations, and a small class of fixed-time events. This explains its strong performance on curated BioModels-style models.

It is not a general SBML importer. The correct product claim is:

> **SBML Level 3 Version 2 Core kinetic-subset importer to BNGL, with explicit loss/approximation diagnostics.**

It should not currently claim complete SBML coverage or semantic round-trip fidelity. The baseline audit found these highest-risk findings; the first two have now been fixed or made fail-closed on this branch:

1. **Baseline: twelve of 1,692 official L3V2 semantic cases generated invalid BNGL.** Empty MathML operands and rules with missing MathML were the cause. The current pinned-suite rerun on this branch fixes these cases: 0 strict-output failures.
2. **Events are not native BNGL constructs:** the baseline translated 3 of 200 event-bearing suite models, including an unsafe mutable-parameter fold. The branch now translates only compile-time-constant fixed-time events and preserves every event-bearing model losslessly in an `@sbml-event` BNGL metadata record. Post-fix results are 2 executable conversions and 198 diagnostic/non-executable event models; the 198 are no longer silently dropped, but they still require a runtime event executor for trajectory parity.
3. **Algebraic rules are dropped**, not solved as implicit DAE constraints: 101 suite files carried them in the fresh rerun.
4. **Variable or non-integer stoichiometry is approximated as fixed integer stoichiometry:** 98 suite files carried a stoichiometry warning, with 810 warning records in the fresh rerun.
5. **Model-changing Level 3 packages are not imported:** `comp`, `multi`, `fbc`, `qual`, `spatial`, `arrays`, `distrib`, and `dyn`. Some are intentionally outside the requested kinetic scope, but the resulting output must be treated as incomplete.
6. **`multi` has a useful structural prototype, but its reconstructed molecule types and complexes are emitted only as comments and are not connected to the simulated network.**

The importer usually returns `success: true` while reporting dropped or approximated content. Consumers must inspect `importWarnings`; success means “the import pipeline returned,” not “the SBML model was preserved.”

### Post-fix validation on this branch

The same pinned 1,692-file semantic harness was rerun after the earlier fixes. The result is retained below as an auditable snapshot record; the current repository now provides `npm run test:atomizer-sbml-suite` to reproduce it when the external suite checkout is supplied.

Fresh reproduction on 2026-09-08 at 13:50 UTC, using suite commit `473e119dd57226c3a7a729d598f9007f06f781c3`, produced 1,692 successful conversions, 1,692 strict parses, 0 strict failures, 200 event-bearing models, 2 executable event conversions, 200 event metadata preservations, 0 silently untranslated event outputs, and warning-record totals of algebraicRule 101, constraint 1, event 200, mathml 392, missingMath 13, package:comp 125, package:fbc 34, and stoichiometry 810. Of the 200 preserved event models, 198 remain diagnostic/non-executable because their trigger, delay, or assignment semantics cannot be represented by native BNGL phase actions.

| Gate | Baseline | Post-fix |
| --- | ---: | ---: |
| Atomizer returned success | 1,692 / 1,692 | 1,692 / 1,692 |
| Generated BNGL passed strict parser | 1,680 / 1,692 | **1,692 / 1,692** |
| Strict-output failures | 12 | **0** |
| Event models converted to executable actions | 3 | 2 (safe constant-only subset) |
| Event models with lossless `@sbml-event` metadata | not measured | **200 / 200** |
| Event models silently untranslated | 197 | **0** |
| Event models preserved but still non-executable | not measured | **198** |

The post-fix run also recorded 13 `missingMath` diagnostics rather than emitting blank executable functions. Explicit `useValuesFromTriggerTime="false"` is now preserved, and mutable event assignments are left annotated rather than folded to initial parameter values.

An executable round-trip was validated in the separate conda environment `atomizer-sbml-roundtrip` using Python 3.11, libSBML 5.21.1, and libRoadRunner 2.10.0. Atomizer BNGL was processed by BNG2 2.9.3 to SBML; libSBML reported zero errors, libRoadRunner simulated 11 rows through `t=1` with finite values, and Atomizer re-imported the resulting SBML with strict BNGL parsing succeeding. This is a representative interoperability gate, not proof of all-model trajectory equivalence.

## Standards baseline

At audit time, the SBML project identifies [SBML Level 3 Version 2 Core Release 2](https://sbml.org/documents/specifications/level-3/version-2/) as the current stable Core specification. The [SBML specification index](https://sbml.org/documents/specifications/level-3/) lists released Level 3 packages including `comp`, `distrib`, `fbc`, `groups`, `layout`, `multi`, `qual`, `render`, and `spatial`; `arrays` and `dyn` are listed as draft packages, while the mathematical-extensions package is not started. This audit therefore distinguishes:

- **Core L3V2 coverage:** tested against the official SBML Test Suite semantic cases.
- **Package behavior:** tested against official libSBML examples where available plus small namespace fixtures for package detection.
- **Unsupported model classes:** `qual` and `fbc` are recorded as explicit non-goals, per request. Their package detection and failure behavior are still assessed.

The official [SBML Test Suite documentation](https://sbml.org/software/sbml-test-suite/docs/test-case-details/) separates syntactic, semantic, and stochastic cases. This audit used the semantic L3V2 files because they exercise model interpretation rather than XML acceptance alone.

## What was fetched and tested

To avoid changing the user's dirty working tree, the audit fetched a fresh isolated shallow clone of the user's repository from:

`https://github.com/akutuva21/julesplayground.git`

The isolated clone resolved to the audited commit above. The authoritative checkout's pre-existing edits were not staged, committed, reset, or overwritten.

Additional read-only source snapshots:

| Source | Snapshot | Use |
| --- | --- | --- |
| `julesplayground` | `d9226a1` | Atomizer implementation and local tests |
| [SBML Test Suite](https://github.com/sbmlteam/sbml-test-suite) | `473e119dd57226c3a7a729d598f9007f06f781c3`, `VERSION.txt = 3.3.0` | 1,692 `*-sbml-l3v2.xml` semantic cases |
| [libSBML](https://github.com/sbmlteam/libsbml) | `6d26cef5f2557f13f59c9e2d6ef063a3de300d75` | Official package sample models |

The suite harness ran every one of the 1,692 L3V2 semantic XML files through Atomizer, then passed generated BNGL through the playground's strict BNGL parser. It also recorded warnings, model counts, package namespaces, executable event conversion, event metadata preservation, and silent-untranslation status. Package samples were checked in the same way. The suite checkout is external and is not committed into this application repository; use the checked-in runner with `SBML_TEST_SUITE_DIR` to reproduce the snapshot.

This is a structural and translation audit. It is not a claim that every accepted output reproduces the SBML trajectory. Full trajectory equivalence needs a model-by-model oracle and careful handling of solver tolerances, events, units, and rule semantics.

## Measured results

### Official L3V2 semantic suite

| Gate | Result | Interpretation |
| --- | ---: | --- |
| XML files exercised | 1,692 | All available L3V2 semantic cases in the fetched suite snapshot |
| Atomizer returned success | 1,692 / 1,692 | Pipeline did not throw on these cases |
| Generated BNGL passed strict parser | 1,680 / 1,692 (99.29%) | Useful syntax gate, not semantic equivalence |
| Generated BNGL failed strict parser | 12 / 1,692 (0.71%) | Concrete correctness failures; listed below |
| Files with event diagnostics | 200 | Event behavior is common enough to require first-class support |
| Events converted to scheduled actions | 2 / 200 models | Only simple fixed-time, constant-foldable cases are executable |
| Events preserved as `@sbml-event` metadata | 200 / 200 models | Original trigger/delay/assignment formulas survive BNGL parse and SBML export |
| Events silently untranslated | 0 / 200 models | The audit treats metadata-preserved events as translated structurally, not executable |
| Events preserved but non-executable | 198 / 200 models | State triggers, dynamic assignments, or dynamic delays still need runtime event support |
| Files with algebraic-rule diagnostics | 101 | Algebraic rules are not represented as DAE constraints |
| Files with stoichiometry diagnostics | 98 | Variable/non-integer stoichiometry is approximated |
| Stoichiometry warning records | 810 | Variable/StoichiometryMath and non-integer records are approximated |
| Files with constraints | 1 | Constraint is counted/diagnosed, not enforced |
| Files with `comp` namespace | 125 | Detected and dropped in this bundled build |
| Files with `fbc` namespace | 34 | Detected and dropped; outside kinetic scope |

Warning records in the suite were:

| Warning category | Records | Severity |
| --- | ---: | --- |
| `algebraicRule` | 101 | dropped |
| `constraint` | 1 | info |
| `event` | 200 | dropped |
| `mathml` | 392 | info/approximated |
| `package:comp` | 125 | dropped |
| `package:fbc` | 34 | dropped |
| `missingMath` | 13 | dropped/diagnostic |
| `stoichiometry` | 810 | approximated |

### The 12 baseline strict-output failures (now fixed)

| Case | Exercised feature | Failure |
| --- | --- | --- |
| 01112 | Zero-child `plus`, `times`, `and`, `or`, `xor` MathML | Empty operands emitted as `()` or malformed logical expressions |
| 01114 | Nested zero-child MathML | Same empty-operand problem through nested expressions |
| 01464 | Rate rule with no MathML on a species reference | Blank rate-rule function emitted |
| 01465 | Assignment rule with no MathML on a species reference | Blank assignment-rule function emitted |
| 01489 | Zero-child function-definition MathML | Empty function bodies emitted |
| 01491 | Nested zero-child function-definition MathML | Empty/malformed function expressions emitted |
| 01552 | Assignment rule with no MathML on stoichiometry | Blank assignment-rule function emitted |
| 01553 | Rate rule with no MathML on stoichiometry | Blank rate-rule function emitted |
| 01556 | Boundary species with rate rule lacking MathML | Blank rate-rule function emitted |
| 01561 | Uncommon MathML assigned to stoichiometries | Generated stoichiometry-rule output is not strictly parseable |
| 01630 | FBC model with a blank generated function | FBC is intentionally dropped, but output also contains an invalid blank function |
| 01657 | Initial assignment referencing a species with a missing rule MathML | Blank rule function and malformed expression emitted |

These were not merely unsupported-feature warnings: the output itself was invalid BNGL. The branch now routes empty n-ary MathML through the raw MathML reader, applies SBML identities, omits missing rule bodies with diagnostics, and emits a safe zero body for missing function-definition expressions. The pinned post-fix suite produced no strict-output failures.

### Event behavior

The baseline converted suite models were `00980`, `01119`, and `01287`. After the safety fix, only the two constant-only cases remain executable; the mutable assignment-time case `00980` is preserved but correctly remains non-executable. All 200 event-bearing outputs now carry the source event in a structured `# @sbml-event` comment that the BNGL parser restores into `BNGLModel.events`. The supported executable coverage is narrow:

- trigger must reduce to a simple time threshold;
- delay must be constant;
- assignment right-hand sides must fold to constants;
- targets must be recognized species or parameters;
- event priority is folded to a constant and used to order same-time writes.

This can be useful for fixed calibration pulses, but it is not general SBML event execution. State-triggered events, species-dependent assignments, function-dependent assignments, non-constant delays, repeated firing semantics, and general event scheduling remain non-executable. They are preserved for roundtrip/export and reported with diagnostics rather than being approximated as incorrect phase actions. The metadata is a Playground extension and is ignored by native BNG2 unless a caller supplies a separate event executor.

The branch fixes the parser defect in [`sbmlParser.ts`](src/lib/atomizer/parser/sbmlParser.ts): explicit `useValuesFromTriggerTime="false"` is preserved. The event translator also refuses to fold mutable parameters, rules, initial-assignment targets, or event-assignment targets. In case `00980`, the generated BNGL now keeps the event in the diagnostic block instead of producing incorrect constant writes such as `p = 3` and `q = 1`.

### Local test gates

Focused Atomizer tests passed:

```text
Test Files  4 passed (4); Tests 49 passed (49)
Test Files  6 passed | 1 skipped (7); Tests 36 passed (36)
```

The repository's hang-safe narrow suite passed on the baseline before these changes:

```text
npm run test:fast
Test Files  274 passed | 5 skipped (279)
Tests       6339 passed | 55 skipped (6394)
```

The full scientific suite was run with the required safe harness at the final working tree. It completed with 133 files passing, 8 skipped, and 2 failing files (3 tests). The remaining failures were `parity-polymer` and `parity-zap`, both failing before simulation because their RuleHub model lookup returned a null path; none were Atomizer-specific suite failures. Because the run did not produce a clean terminal pass, it is not evidence for a globally green repository.

The post-fix branch-specific gates are the focused Atomizer suite, `tests/atomizer/sbml-core-parity.spec.ts`, the full `npm run test:fast` gate, and the checked-in `npm run test:atomizer-sbml-suite` runner against the pinned 1,692-case snapshot. The full scientific suite remains a separate repository baseline gate; its final result is recorded above.

## Core SBML coverage matrix

Status meanings:

- **Strong:** extracted and represented for ordinary kinetic models, with the caveats listed.
- **Partial:** common forms work, but important legal forms are dropped, approximated, or not semantically equivalent.
- **Diagnostic only:** recognized and reported but not represented in the simulation.
- **Dropped:** the input structure is not imported.

| SBML Core feature | Status | Observed behavior and limitation |
| --- | --- | --- |
| XML/model parsing | Strong for tested L3V2 semantic cases | All 1,692 cases returned from Atomizer; this does not imply preserved meaning. |
| Compartments | Partial/strong for flat kinetic models | Dimensions, sizes, units, constants, outside relationships, and species compartment membership are extracted. Hierarchical `comp` submodels are not flattened. Dynamic compartment size semantics need separate validation. |
| Species | Strong for ordinary core models | Initial amount/concentration, units, boundary/constant flags, charge, SBO term, species type, conversion factor, and compartment are captured where exposed by the bundled libSBML build or raw XML fallback. |
| Parameters | Strong for ordinary core models | Global/local parameters and aliases are extracted. Event translation now folds only parameters and compartments that are declared constant and are not later mutated. |
| Reactions | Strong for ordinary kinetic models | Reactants, products, modifiers, reversibility, kinetic laws, and local parameters are translated to BNGL. Variable and non-integer stoichiometry is not faithfully representable. |
| Kinetic-law MathML | Partial/strong for common operators | Arithmetic, powers, roots, logs, min/max, trigonometric/hyperbolic functions, comparisons, logic, piecewise, and common `csymbol` forms are handled. Unsupported or lossy forms can become BNGL expressions, comments, or approximations. |
| Assignment rules | Partial | Ordinary rules are converted to BNGL observables/functions or initialization structures. Rules with missing MathML are omitted with a `missingMath` diagnostic; stateful semantic equivalence is not guaranteed. |
| Rate rules | Partial | Ordinary rate rules are represented with auxiliary BNGL species/reactions. Missing MathML is omitted with a `missingMath` diagnostic. This is a translation strategy, not a general DAE solver. |
| Algebraic rules | Diagnostic only | Counted and reported; not solved as implicit constraints. |
| Initial assignments | Partial | Common constant expressions are imported. Empty/missing MathML is omitted with a diagnostic. Ordering and dependency semantics need explicit validation. |
| Function definitions | Partial | Common functions are emitted. Empty bodies now become a diagnostic zero function, and empty n-ary operators follow SBML identities; full SBML function-definition semantics are not established. |
| Events | Partial, lossless structural preservation; narrow execution | Two fixed-time constant cases are executable as BNGL phase actions. All 200 audited event models preserve trigger/delay/priority/assignment metadata through BNGL comments and SBML export; 198 remain non-executable because native BNGL has no general event syntax or trigger scheduler. |
| Constraints | Diagnostic only | Constraint presence is recorded; constraint math is not enforced during BNGL simulation. |
| Unit definitions and conversion factors | Partial/strong | Unit definitions and SI-scale factors are extracted and applied in several paths. No complete dimensional-analysis proof or universal unit-equivalence guarantee was established. |
| Annotations and SBO terms | Metadata only | Read where available; do not change kinetic translation or guarantee semantic interpretation of annotations. |
| Notes/history/CV terms | Metadata only | Not an executable model feature. Preserve/round-trip behavior was not audited as a document-fidelity requirement. |
| Avogadro/time `csymbol` | Partial | Common symbols are recognized; unknown symbols fall back with diagnostics. |
| Piecewise and logical math | Partial | Many forms translate to BNGL `if`; unusual and empty forms expose correctness gaps. |
| Non-finite values | Approximation risk | Infinity/NaN are normalized or approximated because BNGL cannot represent them generally. These cases require an explicit policy before simulation. |

## Level 3 package matrix

Package status is based on the official [Level 3 package index](https://sbml.org/documents/specifications/level-3/) and the source behavior in [`sbmlParser.ts`](src/lib/atomizer/parser/sbmlParser.ts#L812).

| Package | Status in Atomizer | Evidence and limitation |
| --- | --- | --- |
| `comp` | **Dropped; high risk** | The bundled libSBML API cannot perform the required flatten/serialization conversion. Submodels and external model definitions are not expanded. Official comp cases returned, but the output can contain none of the submodel dynamics. |
| `multi` | **Partial prototype; not simulated** | Canonical shallow `multi` structures can produce BNGL molecule-type and complex-pattern text. Deep Simmune-style hierarchy is detected but not reconstructed. All reconstructed output is commented reference text; it is not fed to the simulated network. |
| `fbc` | **Explicit non-goal; dropped** | The package is detected and explained as a steady-state flux-balance/linear-program model, not a kinetic ODE/SSA model. No faithful BNGL kinetic translation is attempted. |
| `qual` | **Explicit non-goal; dropped or rejected** | Qualitative logical transitions are not continuous kinetic rates. A qual-only model with no kinetic reactions is rejected with an explicit unsupported-model error; a mixed model gets a dropped-package warning. |
| `spatial` | **Dropped; high risk for spatial models** | Geometry, spatial fields, diffusion, and spatial semantics are not imported. Namespace detection works in the audit fixture. |
| `arrays` | **Dropped** | Array dimensions and indexed expansion are not imported. `arrays2.xml` returned parseable BNGL with zero species/reactions, demonstrating why success alone is insufficient. |
| `distrib` | **Dropped** | Distribution and uncertainty metadata are not imported; no sampling or uncertainty semantics. |
| `dyn` | **Dropped** | Dynamic/agent creation and destruction behavior is not imported. |
| `groups` | **Ignored as non-mathematical metadata** | Group membership is not imported. Safe only when groups are presentation or annotation metadata. |
| `layout` | **Ignored as non-mathematical metadata** | Diagram coordinates are not imported; mathematical content can remain intact. |
| `render` | **Ignored as non-mathematical metadata** | Rendering styles are not imported; mathematical content can remain intact. |
| `req` | **Diagnosed; ignored as metadata** | The retired requirements package is now reported as informational metadata and does not affect the mathematical model. Requirements are not enforced. |
| `math` extensions | **No explicit support** | The official package index lists the math package as not started. Unknown MathML constructs can be dropped, approximated, or emitted in a form that BNGL cannot parse. |

### Package sample observations

Official libSBML samples and the package fixtures gave these concrete results:

- `arrays1.xml`: Atomizer and strict BNGL parsing succeeded, but array content was dropped and variable stoichiometry was approximated.
- `arrays2.xml`: Atomizer and strict BNGL parsing succeeded while producing zero species/reactions; this is a successful pipeline result with missing model content.
- `dyn_example1.xml`: ordinary core content was emitted, while `dyn` content was dropped.
- `dyn_example2.xml`: `comp` and `dyn` content were dropped; the output contained zero species/reactions.
- `fbc_example1.xml`: output was parseable, but the FBC objective and flux constraints were dropped by design.
- `multi/Ecad.xml`: output was parseable, but the model's variable stoichiometry and multi structure were not a faithful simulated complex model.
- `multi/YeastMAPK.xml`: deep Simmune-style multi hierarchy was detected and explicitly not reconstructed.
- `multi/multi_example1.xml`: one molecule type and two bonded complex patterns were reconstructed as commented reference text only.
- comp suite samples `01124`, `01153`, `01344`, and `01361`: output was parseable, but hierarchical composition was not flattened.
- synthetic namespace fixtures for `layout`, `render`, `groups`, and `req` generated informational warnings; `spatial` and `distrib` generated dropped-package warnings.

## MathML and expression coverage

The converter covers a broad practical subset: identifiers, rational and scientific numbers, Boolean constants, `pi`, `e`, arithmetic, power, root, log, quotient, remainder, factorial, trigonometric/hyperbolic/inverse functions, min/max, relational operators, logical operators, and piecewise expressions.

Important limits:

- Empty `plus`, `times`, `and`, `or`, and `xor` nodes are normalized to SBML identities by the branch's raw MathML fallback. Other unusual empty or unsupported operators still need explicit policy.
- Missing MathML on legal SBML rule constructs is handled fail-closed by omitting the executable rule and recording a `missingMath` diagnostic; this preserves parseability but not the missing semantics.
- Factorial is flagged as approximated because BNGL does not provide the same general integer-domain contract.
- Unknown `csymbol` and unsupported MathML constructs can fall through into identifiers or diagnostic output.
- Piecewise, comparisons, and logic can be syntactically translated while still having different domain or Boolean coercion behavior in BNGL.
- There is no complete expression-level dimensional analysis, domain analysis, or proof that every accepted MathML expression has equivalent BNGL evaluation.

## Main limitations by priority

### P0: output correctness — branch status

- **Fixed for the audited Core suite:** blank rule bodies are omitted with diagnostics, empty n-ary MathML identities are normalized, and the pinned post-fix run has 0 strict-output failures.
- **Still open:** unsupported package-only models can return `success: true` with warnings and parseable but empty/incomplete BNGL. A machine-readable `incomplete` status would make this safer for callers.

### P1: semantic correctness — remaining gaps

- Add a runtime event executor for the preserved `BNGLModel.events` representation: state-trigger root detection, trigger persistence, delayed/simultaneous assignments, priority ordering, and `useValuesFromTriggerTime` snapshots. Until then, keep the metadata-preserving fail-closed path and do not claim trajectory parity for the 198 non-executable cases.
- Preserve `useValuesFromTriggerTime`, `initialValue`, `persistent`, priorities, simultaneous assignment semantics, delayed assignments, and repeated firing.
- Decide whether assignment/rate rules are supported semantically or are only a convenient approximation for a BNGL-compatible subset.
- Reject or explicitly mark variable and non-integer stoichiometry instead of silently treating it as fixed integer stoichiometry when the result can change dynamics.
- Add a real constraint policy; currently constraints are metadata only.

### P1: package completeness

- Either expose a full libSBML conversion API for `comp` or fail clearly before emitting incomplete output.
- Wire canonical `multi` reconstruction into the actual engine only after end-to-end molecule, bond, seed, and rule validation. Until then, keep it diagnostic/reference-only.
- Keep `qual` and `fbc` out of the kinetic importer, but make their unsupported status machine-readable and test it as a contract.
- Extend explicit detection to future Level 3 namespaces rather than silently ignoring unknown packages. The retired `req` namespace is now diagnosed as informational.

### P2: breadth and reproducibility

- Add package-specific fixtures for `spatial`, `arrays`, `distrib`, `dyn`, `layout`, `render`, `groups`, and `req`.
- Add a CI gate over the pinned SBML Test Suite snapshot: Atomizer success, warning classification, strict BNGL parseability, and an allowlist for intentionally unsupported cases.
- Add trajectory comparisons for a representative Core subset, including units, rate rules, assignment rules, piecewise math, compartments, and fixed-time events.
- Record source suite version and package versions in every audit artifact.

## Recommended public documentation claim

Use wording close to:

> The Playground Atomizer imports a broad subset of SBML Level 3 Core kinetic models into BNGL. It supports common flat models with compartments, species, parameters, reactions, kinetic laws, rules, initial assignments, unit conversions, and selected fixed-time events. It reports dropped and approximated content. It does not provide general support for hierarchical composition, qualitative models, flux-balance models, spatial models, array/distribution/dynamic packages, or fully general SBML event/algebraic/variable-stoichiometry semantics.

Avoid “SBML supported” without the words **kinetic subset**, **warnings must be reviewed**, and **package limitations**.

## Reproduction commands

The following commands were used in the isolated audit clone. The temporary suite harness and generated evidence stayed outside the user's repository.

```bash
git clone --depth 1 https://github.com/akutuva21/julesplayground.git /private/tmp/julesplayground-atomizer-audit-20260908
git clone --depth 1 https://github.com/sbmlteam/sbml-test-suite.git /private/tmp/sbml-test-suite-audit-20260908
git clone --depth 1 https://github.com/sbmlteam/libsbml.git /private/tmp/libsbml-audit-20260908

npx vitest run --config vitest.config.ts \
  tests/lib/atomizer/parser/sbmlParser.spec.ts \
  tests/lib/atomizer/atomization/core.spec.ts \
  tests/lib/atomizer/writer/bnglWriter.spec.ts \
  tests/atomizer/regression.spec.ts

npm run test:fast
npm run test:full:safe
```

The exhaustive suite pass used the Atomizer API with `quietMode: true`, `useId: true`, and `atomize: false`, followed by `parseBNGLStrict` on the generated BNGL. That mode tests the default flat translation path; it does not claim that `atomize: true` solves the unsupported SBML package semantics.

## Bottom line

The Atomizer is already credible for a common BioModels-like kinetic subset. The audit also found clear, reproducible boundaries outside that subset. The most important engineering result is a safer boundary: unsupported and approximate translations are easier to detect, the 12 invalid-output cases are fixed, argument-taking custom functions no longer block the native BNG2 oracle, and all audited SBML events survive structurally without being falsely advertised as executable. Package-by-package and runtime-event expansion can now proceed without weakening correctness claims.
