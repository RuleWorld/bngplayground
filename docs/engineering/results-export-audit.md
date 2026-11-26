# Scientific result export audit

This audit records the export decision for every tab identifier in
`src/services/routing/tabIds.ts`. The current UI implementation is in
`components/VisualizationPanel.tsx`; `robustness` is now reachable from the
Analysis menu as index 23. The older identifiers after `pkpd` are retained by
the URL schema but are not mounted by the current visualization panel.

## Export contract

Completed numerical analyses use the shared **Export** control. It offers:

- **Current view**: the selected, filtered, or zoomed data currently being
  examined.
- **Full result**: every successfully computed scientific record retained by
  the analysis, independent of display filters.
- A timestamped single file when one current artifact is selected, or a ZIP
  bundle containing `README.md`, `manifest.json`, data, analysis artifacts,
  figures, and the exact execution-time `model.bngl` snapshot when available.

Exports intentionally omit RNG seeds and software, browser, build, commit,
environment, and fingerprint metadata. Failed or cancelled analyses do not
expose an export control.

## Tab decisions

| Tab ID | Current UI route | Scientific output | Decision and format |
| --- | --- | --- | --- |
| `time-courses` | Time Courses | Observable and optional species trajectories; visible expressions | Shared current/full export; GDAT, CSV, JSON, SVG, ZIP |
| `network` | Network views | Structural graphs and rule/contact maps | Existing PNG/SVG/GraphML actions remain; no duplicate bundle needed |
| `parameter-scan` | Analysis menu | Scan curves, endpoints, and surfaces | Shared current/full export; CSV, JSON, ZIP |
| `steady-state` | Analysis menu | Final concentrations from the completed simulation | Shared current/full export through the standard result; CSV, GDAT, JSON, ZIP |
| `fim` | Analysis menu | FIM, profiles, identifiability, correlations | Shared current/full export plus existing FIM files; CSV, JSON, ZIP |
| `parameter-estimation` | Analysis menu | Fitted parameters, histories, uncertainty, input data | Shared current/full export; CSV, JSON, ZIP |
| `flux-analysis` | Analysis menu | Reaction flux table at the selected time | Shared current/full export; CSV, JSON, ZIP |
| `verification` | Analysis menu | Constraint definitions and pass/fail outcomes | Shared current/full export; CSV, JSON, ZIP |
| `what-if-compare` | Analysis menu | Base/modified trajectories and differences | Shared current/full export; CSV, JSON, ZIP |
| `cartoon` | Analysis menu | Rule cartoon visualization without a numeric result | No new scientific-result export; existing visual interaction is sufficient |
| `model-explorer` | Analysis menu | Model catalog and loading actions | No completed result; no new export |
| `trajectory-explorer` | Analysis menu | All ensemble trajectories and derived embedding | Shared current/full export; one GDAT per run, CSV/JSON embedding, ZIP |
| `jupyter-export` | Analysis menu | Reproducible notebook source | Existing notebook export intentionally unchanged |
| `network-analysis` | Network → Analysis and legacy redirect | Node metrics, communities, graph edges | Shared current/full export plus existing graph PNG; CSV, JSON, ZIP |
| `sobol-sensitivity` | Analysis menu | First/total-order sensitivity and interactions | Shared current/full export; CSV, JSON, ZIP |
| `profile-likelihood` | Analysis menu | Parameter profiles and identifiability summary | Shared current/full export; CSV, JSON, ZIP |
| `abc-smc` | Analysis menu | Posterior particles, populations, correlations, marginals | Shared current/full export; CSV, JSON, ZIP |
| `spatial` | Analysis menu | Particle coordinates and observables across snapshots | Shared current/full linked tables; CSV, JSON, ZIP |
| `bifurcation` | Analysis menu | Continuation branches, points, and nullclines | Shared current/full export; CSV, JSON, ZIP |
| `temporal-analysis` | Analysis menu | Firing log, mutual information, transfer entropy, causal comparison | Shared current/full export; CSV, JSON, ZIP |
| `version-history` | Analysis menu | Model revision history and diffs | Not a completed scientific result; no new result export |
| `multiscale` | Analysis menu | Cell snapshots, lineage, population trajectories | Shared current/full export; CSV, JSON, ZIP |
| `pkpd` | Analysis menu | Concentration trajectories, dosing, and PK metrics | Shared current/full export; CSV, JSON, ZIP |
| `contact-map` | Network → Contact Map | Structural molecule/site graph | Existing PNG/GraphML actions remain; no duplicate bundle needed |
| `debugger` | URL schema only; not mounted | Diagnostic trace when used by its standalone panel | No current reachable route; export should be added with that route |
| `expression-evaluator` | URL schema only; not mounted | Derived expression trajectories | Current time-course export already includes visible expressions; standalone route has no action |
| `parameters` | URL schema only; not mounted | Model-editor parameter values | No completed scientific result; no new export |
| `regulatory` | Network → Regulatory | Structural regulatory graph | Existing PNG/SVG/GraphML actions remain; no duplicate bundle needed |
| `robustness` | Analysis menu (index 23) | Monte Carlo mean, spread, min, and max trajectories | Shared current/full export; CSV, JSON, ZIP |
| `rules` | Network → Rules | Rule-linked views of standard trajectories | Standard time-course export is the authoritative numerical export; no duplicate bundle needed |
| `structure-analysis` | URL schema only; not mounted | Connectivity and approximate conservation laws | Component remains unrouted; export should be added when the route is restored |

## Implementation notes

- The application uses the engine's canonical `gdatFromResults` writer for
  observable trajectories rather than inventing a second GDAT dialect.
- No CDAT writer was added because this repository had no canonical CDAT
  implementation. Species-level results are exported as explicit CSV tables
  linked to the same time rows.
- Spatial snapshots are copied before worker transfer so full exports do not
  depend on detached rendering buffers. Particle rows intentionally use time,
  species, coordinates, and compartment; they do not invent persistent
  particle identities.
- Model snapshots are captured when a run completes. PK/PD passes generated
  BNGL text directly into the simulation call so a synchronous editor update
  cannot replace the execution-time source.
