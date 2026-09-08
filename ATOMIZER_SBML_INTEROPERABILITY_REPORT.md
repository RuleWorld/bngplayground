# Atomizer SBML/BNGL interoperability and simulation-parity report

Date: 2026-09-08
Repository branch: `codex/atomizer-roundtrip-parity`
Target: SBML Level 3 Version 2 Core kinetic models, excluding SBML `qual` and `fbc` by design.

## Executive result

The Playground Atomizer now has a reproducible, numerical bidirectional roundtrip gate for the validated flat kinetic subset:

| Direction | Fixtures | Structural result | Simulation result |
| --- | ---: | ---: | ---: |
| SBML → BNGL → SBML | 13/13 | Atomization, strict BNGL parsing, and executable-structure comparison passed | libRoadRunner trajectories passed 13/13 |
| BNGL → SBML → BNGL | 10/10 | SBML was L3V2; strict BNGL parsing and executable-structure comparison passed 10/10 | Playground-engine trajectories and observable comparisons passed 10/10; libRoadRunner SBML trajectories passed 10/10 |
| BNGL native cross-check | 10 | BNG2 2.9.3 passed 9/10 | The one skipped case is BNG2's inability to simulate functions with arguments, not a Playground or libRoadRunner failure |

For the trajectory gate, both models are simulated on the same 101-point grid from `t=0` to `t=1`. libRoadRunner uses CVODE with relative tolerance `1e-10` and absolute tolerance `1e-12`; the comparison acceptance threshold is `1e-7`. The Playground engine uses CVODE with `1e-10` relative and absolute tolerances and the same `1e-7` comparison threshold. All passing SBML comparisons had `max_abs=0`; the largest Playground-engine roundtrip difference was `1.11e-14`.

This is strong evidence for the tested kinetic subset. It is not evidence that every legal SBML Core document is semantically representable in BNGL.

## What changed

### SBML writer and rate semantics

- Export now targets SBML Level 3 Version 2 Core and emits MathML kinetic laws instead of the legacy Level 2 `formula` attribute.
- Exported kinetic laws are complete reaction fluxes: reactant factors are supplied for ordinary rules, and reversible rules retain distinct forward and reverse fluxes.
- BNGL functional rates are preserved as complete fluxes, including Hill/piecewise-style expressions that depend on a substrate.
- User-defined BNGL functions are emitted as SBML function definitions where representable.
- Zero-argument BNGL helper functions are inlined at the reaction serialization boundary when needed, preventing bare function identifiers from becoming SBML species references.
- Synthetic compartment factors are not multiplied into the SBML flux a second time. The Playground engine already applies the reacting-compartment anchor volume.
- Plain compartmental BNGL seeds are exported as amounts; Atomizer-generated concentration-space seeds retain their amount/concentration distinction.
- Fixed-time BNGL phase changes are reconstructed as SBML events with zero delay, preserving dosing/reset trajectories in both writer directions.

### Parser and evaluator

- BNGL function calls with arguments now expand correctly in the Playground expression evaluator, with a regression test.
- Standard SBML MathML `<piece>` nodes now accept the SBML form with direct value/condition children as well as the older wrapper form.
- Piecewise/relational rate expressions preserve condition references while removing only explicit top-level reactant factors from the complete SBML flux; the BNGL engine supplies the rule reactant factor once.
- SBML piecewise expressions are emitted using standard MathML structure.

## Numerical fixture coverage

The checked-in harness is [`scripts/atomizer/roundtrip_parity.ts`](scripts/atomizer/roundtrip_parity.ts), with the pinned external comparator in [`scripts/atomizer/compare_sbml_trajectories.py`](scripts/atomizer/compare_sbml_trajectories.py). It reports XML executable structure, state trajectories, and observable trajectories separately. Run it with:

```bash
conda run -n atomizer-sbml-roundtrip python --version
npm run test:atomizer-roundtrip
```

The environment used for this report is `atomizer-sbml-roundtrip`, containing Python 3.11, `python-libsbml 5.21.1`, and `libroadrunner 2.10.0`. Native BNGL checks use BioNetGen 2.9.3 from the installed PyBioNetGen distribution.

### SBML → BNGL → SBML

Each input is parsed by Atomizer, strictly reparsed as BNGL, exported through the Playground SBML writer, and simulated against the original input with libRoadRunner:

| Fixture | Coverage | Result |
| --- | --- | --- |
| `mass_action` | First-order reaction and ordinary parameters | Exact |
| `bimolecular` | Two-reactant mass action | Exact |
| `reversible` | Forward/reverse laws and net flux | Exact |
| `custom_function` | SBML lambda function definition called by a kinetic law | Exact |
| `zero_order` | Synthesis with no reactants | Exact |
| `local_parameter` | Reaction-local parameter | Exact |
| `non_unit_compartment` | Concentration species in a compartment of size 2 | Exact |
| `assignment_rule` | Parameter assignment rule used by a reaction | Exact |
| `piecewise` | Relational/piecewise kinetic law crossing its threshold | Exact |
| `fixed_time_event` | Fixed-time event with a zero-delay concentration assignment | Exact |
| `rate_rule` | Constant rate rule driving a species | Exact |
| `initial_assignment` | Initial assignment used to seed a reacting species | Exact |
| `state_assignment_rule` | State-dependent assignment rule used by a kinetic law | Exact |

### BNGL → SBML → BNGL

Each BNGL fixture is exported to SBML, re-imported by Atomizer, strictly reparsed, and compared with the original using both the Playground engine and libRoadRunner on the generated SBML documents. The fixtures cover ten representative BNGL cases. The harness now performs three independent checks: executable structure (species/initial values, parameter names, reaction topology, and identifier remapping), all shared observable trajectories, and full state trajectories in libRoadRunner. The structural comparator uses shared `*_amt` observable patterns to map source names such as `A()` to SBML-generated names such as `s0`; it falls back to explicit order only when names cannot establish a mapping. The roundtrip preserves executable trajectories even when SBML cannot preserve BNGL-only observable names: generated species/observable ids can be `s0`, `s1`, etc., while the source may use `A`, `s0_amt`, and similar names. Missing and extra observable labels are reported explicitly rather than hidden.

The custom argument-taking-function fixture is numerically exact in the Playground engine and libRoadRunner. BNG2 native execution is skipped only because `run_network` from BNG2 2.9.3 aborts with `Functions cannot contain arguments`; that is an external native-tool limitation.

## Existing broad Core baseline

The companion [`ATOMIZER_SBML_COVERAGE_AUDIT.md`](ATOMIZER_SBML_COVERAGE_AUDIT.md) records the broader SBML Test Suite audit. Its pinned SBML Level 3 Version 2 Core baseline contained 1,692/1,692 successful Atomizer conversions with strict BNGL parsing and no strict-output failures. That baseline is a structural/translation gate, not a trajectory-equivalence claim. It also recorded 200 event-bearing cases, of which 2 translated and 198 remained untranslated, plus 13 missing-Math diagnostics.

The new harness is intentionally smaller and semantic: it compares trajectories, not only parseability. Both artifacts must be used together.

## Feature coverage and limits

### Validated as executable and trajectory-equivalent in this pass

- Flat SBML L3V2 Core models.
- Constant compartments, including non-unit volume, ordinary species compartment membership, and amount/concentration seed conversion.
- Ordinary species initial amounts and concentrations.
- Global and reaction-local parameters.
- First-order, bimolecular, zero-order, and reversible reactions.
- Complete kinetic-law MathML for the tested arithmetic, relational, and piecewise forms.
- User-defined functions with and without arguments in the Playground evaluator and SBML writer path.
- Constant parameter assignment rules used by kinetic laws.
- Fixed-time, zero-delay events with constant species/parameter assignments and phase-boundary trajectories.
- BNGL ordinary reaction rules, generated-network simulation, executable species/reaction topology, amount and named observables, and roundtrip SBML export.

### Partial or diagnostic-only semantics

These are legal SBML concepts but are not covered by the exact thirteen-fixture claim:

- **Rate rules:** a constant rate rule and a species-driven state rule are now trajectory-tested, but this is not a general SBML DAE implementation and needs dedicated numerical fixtures for every unit/state combination.
- **Assignment rules:** constant and one state-dependent assignment used by a kinetic law are covered above; assignment cycles, coupled rule systems, algebraic dependencies, and general ordering semantics require separate validation.
- **Initial assignments:** a constant species seed is covered above, but dependency ordering, simultaneous initialization, and dynamic dependencies are not a universal equivalence guarantee.
- **Events:** fixed-time, zero-delay events with constant assignments are executable and roundtrip-tested when they map to BNGL phase-boundary `set` actions. State-dependent triggers, mutable assignment values, non-constant delays, repeated firing semantics, and general SBML event scheduling remain diagnostic/untranslated. The current reconstruction intentionally emits zero-delay time thresholds; arbitrary event attributes are not preserved byte-for-byte.
- **Algebraic rules:** detected and reported; not solved as implicit constraints.
- **Constraints:** reported as metadata; not enforced during BNGL/Playground simulation.
- **Variable, non-integer, or StoichiometryMath stoichiometry:** BNGL cannot represent it generally; current fallback treats it as fixed stoichiometry and emits a diagnostic. This can change dynamics.
- **Dynamic compartment sizes:** constant flat compartments are covered; dynamic volume rules require a separate parity design.
- **`delay`, `rateOf`, and unfamiliar `csymbol` forms:** may be diagnosed, approximated, or left untranslated; no general delay/derivative semantics are claimed.
- **Units and conversion factors:** common scaling paths are implemented, but there is no complete dimensional-analysis proof for every SBML unit combination.
- **BNGL-only observables and action metadata:** SBML Core has no direct equivalent for all BNGL observable/action names. State trajectories are compared on shared executable quantities; document metadata is not promised to be byte-for-byte preserved.

### Explicitly outside this kinetic importer

- SBML `qual`: qualitative logical transitions are not continuous BNGL kinetic rates.
- SBML `fbc`: flux-balance/linear-program models are not kinetic ODE/SSA models.
- SBML `comp`: hierarchical submodels and external model definitions are not flattened into executable BNGL.
- SBML `multi`: only shallow/reference reconstruction exists; it is not a general executable multistate reconstruction.
- SBML `spatial`: spatial geometry, fields, diffusion, and spatial semantics are not imported.
- SBML `arrays`, `distrib`, and `dyn`: array expansion, distributions/uncertainty, and dynamic object creation are not imported.
- `layout`, `render`, `groups`, and similar metadata packages do not affect kinetic translation and are not treated as executable model content.

## Repository verification

Commands run on the final working tree:

| Command | Result |
| --- | --- |
| `npm run type-check -- --pretty false` | Passed |
| Focused Atomizer/expression suite (5 files) | 58 passed |
| `npm run test:atomizer-roundtrip` | Passed: 13/13 SBML trajectories; 10/10 BNGL structural, state-trajectory, observable, and SBML-trajectory comparisons; BNG2 native 9/10 |
| `npm run test:fast` | 274 files passed, 6 skipped; 6,346 tests passed, 56 skipped |
| `npm run build:quick` | Passed; existing bundler/externalization/chunk-size warnings only |
| `npm run test:full:safe` | 133 files passed, 8 skipped; 4,587 tests passed, 73 skipped; 3 unrelated failures |
| `git diff --check` | Passed |

The three full-safe failures are the known RuleHub lookup failures in `tests/parity-polymer.spec.ts` and `tests/parity-zap.spec.ts`; both fail before model loading because the RuleHub path resolver returns `null`. No Atomizer-specific test failed in that run.

## Reproduction and interpretation

For a new model, passing strict BNGL parsing is only the first gate. The recommended sequence is:

1. Atomize SBML and inspect diagnostics for dropped/approximated semantics.
2. Strictly parse the BNGL output.
3. Compare executable structure, including species/reaction topology, initial values, parameters, and event counts, while reviewing any identifier mapping or deferred initial-assignment checks.
4. Simulate the original SBML and the exported/re-imported SBML with matched solver settings.
5. Simulate the original and re-imported BNGL with the same Playground method and grid.
6. Compare all shared executable observables, while reviewing any reported name remapping or ignored extras.

The defensible public claim is therefore: **the Playground Atomizer supports a broad flat SBML Core kinetic subset with demonstrated bidirectional numerical parity for the covered forms; unsupported packages and partial Core semantics must be reviewed from diagnostics.**
