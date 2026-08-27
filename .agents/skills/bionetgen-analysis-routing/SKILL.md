---
name: bionetgen-analysis-routing
description: Use when choosing among BNG Playground analysis tools for sensitivity, fitting, identifiability, experimental design, dose-response, bifurcation, hysteresis, perturbation, stochastic event timing, LNA, or model reduction. Do not use merely to parse, validate, or simulate a model.
---

# Analysis routing

Route by the scientific object being requested, not by the presence of a parameter.

| Question | Prefer | Closest confusion |
| --- | --- | --- |
| Global variance drivers | `sobol_sensitivity` | `compute_fim` is local |
| Local distinguishability near a point | `compute_fim` | practical identifiability is broader |
| Data-constrained parameters | `identifiability_analysis` | FIM is not a profile likelihood |
| Best-fit parameters | `fit_parameters` | inference adds uncertainty |
| PEtab problem | `import_petab` | do not hand-convert first |
| Posterior uncertainty | `bayesian_inference` | fitting returns a point estimate |
| Most informative experiment | `optimal_experiment` | sensitivity ranks parameters |
| Calibrated model reduction | `reduce_model` | QSSA targets a specific approximation |
| Fast/slow QSSA | `qssa_reduction` | generic reduction is broader |
| Finite parameter grid | `parameter_scan` | dose-response is one response curve |
| Steady input/output curve | `dose_response` | continuation tracks branches |
| Branch structure | `bifurcation_analysis` | hysteresis compares history |
| History-dependent bistability | `check_hysteresis` | a scan need not reverse direction |
| Knockout/perturbation screen | `perturbation_screen` | compare_models compares variants |
| Rare-event timing | `first_passage_time` | temporal analysis is event/phase summary |
| Local stochastic fluctuations | `lna_analysis` | SSA ensembles are not LNA |
| Compare variants | `compare_models` | diagnosis explains one model |
| Time-domain phase/event analysis | `temporal_analysis` | simulate returns trajectories |

Each specialized tool must be justified by the question and its assumptions. Use `parse_bngl`, `validate_model`, or `simulate` for structural validity and ordinary execution; do not invoke this routing skill for those alone.
