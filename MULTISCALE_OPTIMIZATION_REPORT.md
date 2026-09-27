# Multiscale Engine Optimization Report

Date: 2026-09-27
Scope: `packages/engine/src/services/multiscale/`, `services/multiscaleWorker.ts`, `components/tabs/MultiscaleTab.tsx`

All "after" numbers were measured with `npx tsx scripts/benchmark_multiscale.ts`
(deterministic, Node 26, arm64). "Before" numbers were measured by running the
pre-change `ExtracellularGrid` extracted from git HEAD
(`scripts/benchmark_multiscale_baseline.ts`).

## 1. Before

### The catastrophic bug

`MultiscaleSimulation.ts` hard-coded `gridRes = [20, 20, 20]` even for
2D models (`dimensions: 2, size: [50, 50, 1]`). With `dz = 0.05` and
`D = 100`, the 3D explicit stability criterion gave
`dtMax ≈ 3.75e-6`, so a single extracellular step of `dt = 0.5` required
~133,000 substeps × 8,000 voxels ≈ 1.07 billion voxel updates.

Measured with the old implementation (default demo geometry):

| Measurement | Result |
|---|---|
| `grid.step(0.01)` on old `[20,20,20]` grid | **638 ms** (≈2,667 substeps ≈ 0.24 ms/substep) |
| `grid.step(0.5)` (one default-demo extracellular step) | ≈ 32 s (derived from measured per-substep cost) |
| Full default demo (`tEnd=10`, 10 decision steps × `grid.step(1.0)`) | **> 10 min — effective timeout**; the synchronous loop never yielded, so the worker event loop was blocked, Cancel did nothing, and the tab appeared crashed |

### Other baseline defects confirmed by code inspection

- `dtIntracellular` / `dtExtracellular` were parsed but unused; everything
  advanced on `dtStep = dtDecision`.
- Division performed a full O(N) active-cell scan per division and
  `lineage.find(...)` (O(N) lookup) per division/death ⇒ O(N²) population growth.
- `refractoryPeriod` was parsed into the rule but never enforced.
- `moveCell` fell back to `crypto.getRandomValues()` when no RNG was passed
  (it never was), destroying reproducibility, and did an isotropic 3D walk in
  2D models. Cell positions were never bounded by domain BCs.
- Snapshots used `{ ...cell }` — they retained `intracellularState`
  (Float64Array, solver-sized) and **aliased** the live `observables` object,
  so history was silently rewritten by later steps.
- Division reset `ruleCooldowns`, bypassing any refractory period.
- No workload validation: negative D, dt ≤ 0, etc. reached the solver.

## 2. After (measured)

| Benchmark | Before | After | Speedup |
|---|---|---|---|
| A — default demo (5 cells, D=100, tEnd=10, CVODE) | > 10 min (timeout, frozen UI) | **51.5 ms** | > 10,000× |
| B — no intracellular (agent + PDE) | n/a (same PDE blowup) | **1.1 ms** | — |
| C — no extracellular species (cell decisions only) | ~ms scale | **0.2 ms** | — |
| D — 10 initial cells | — | **1.8 ms** | — |
| D — 100 initial cells | — | **3.6 ms** | — |
| D — 1000 initial cells | O(N²) scans, grew unbounded | **22.6 ms** | — |
| E — PDE 2D 20×20 (tEnd=2) | — | **0.4 ms** | — |
| E — PDE 2D 50×50 | — | **0.6 ms** | — |
| E — PDE 2D 100×100 | — | **4.2 ms** | — |
| E — PDE 2D 200×200 | — | **64.6 ms** | — |
| E — PDE 3D 20×20×10 | — | **2.2 ms** | — |
| F — 1 / 4 / 8 extracellular species | — | **0.3 / 0.4 / 0.4 ms** | — |

Correctness spot-check: the default demo's intracellular decay
(`A() -> 0, k=0.01`) integrates to `A_count(10) = 10·e^(-0.1) = 9.048…`
via CVODE — exact.

### Memory

- Snapshots are compact (`id, cellType, position, radius, phase, observables`);
  the solver-sized `intracellularState` Float64Array is no longer retained per
  snapshot cell (was O(outputs × cells × stateSize) before).
- Observables/position are deep-copied per snapshot — history is immutable and
  never aliases live state (verified by test).
- Worker sends one final compact result; UI keeps only visualization-ready
  snapshots. Export serialization is lazy (`build: () => …` artifacts).

### Cancellation

- Old: `cancel` could not be processed at all during a run (no yield).
- New: the simulation yields to the worker event loop every ≥50 ms of wall
  time; the worker answers `cancel` with `{ type: 'cancelled' }`, and the UI
  force-terminates the worker after a 500 ms fallback. Typical cancellation
  latency ≤ 50–100 ms.

## 3. Changes by file

### `packages/engine/src/services/multiscale/ExtracellularGrid.ts`
- True 2D/3D representation: explicit `dimensions`; 2D uses Nx×Ny voxels,
  5-point stencil, no z-terms; 3D uses 7-point stencil. Dimension inferred
  from resolution when not given.
- Correct stability criteria: 2D `dt < 0.9 / (2D(1/dx²+1/dy²))`,
  3D adds `1/dz²`; substeps capped at 10,000 with a warning.
- Specialized interior/boundary loops per BC (neumann/periodic/dirichlet)
  with no per-voxel `getVal`/`bc` calls; grid swap by pointer, zero-copy.
- Source/sink accumulation into flat Float64Array fields with active-index
  lists: O(1) accumulation per cell, O(active voxels) application per substep,
  instead of per-cell `{ix,iy,iz,rate}` object arrays iterated every substep.
- Non-negativity clamp; validation of resolution/domain/D/decay.
- Bilinear interpolation + zero-z gradient in 2D; trilinear in 3D;
  BC-aware `exportSlice` (full-plane in 2D).

### `packages/engine/src/services/multiscale/MultiscaleSimulation.ts`
- **Multirate event scheduler**: independent clocks for intracellular,
  extracellular, decisions, and outputs; integer step counters avoid
  long-term float drift; non-commensurate intervals verified by test
  (dtIntra=0.07, dtExtra=0.13, dtDecision=0.5, outputs every 0.5).
- **Cooperative cancellation**: yields every ≥50 ms; `options.isCancelled()`
  checked per outer event.
- O(1) bookkeeping: `activeCellCount` counter (no per-division O(N) scan),
  `lineageByCellId: Map` for O(1) lineage lookup; `maxCells` enforced
  against the counter with a one-time diagnostic (divisions suppressed,
  deterministic).
- Refractory periods enforced via per-cell `ruleCooldowns[ruleName]`
  deadlines; work for every action type.
- Compact immutable snapshots (`CompactCellSnapshot`); deep-copied
  position/observables; no intracellular runtime state in history.
- Dead-cell pruning only when dead fraction is significant; dense active
  population otherwise.
- try/finally disposes every CVODE engine on all exit paths.
- 2D movement stays planar; `applyCellBoundary` enforces reflective /
  periodic / absorbing domain BCs for cells; change_type rebuilds
  intracellular state from the new type's engine.
- Uptake/secretion coupling and decisions occur on the decision clock;
  PDE steps on the extracellular clock; sources/sinks refreshed from cell
  rates each decision.

### `packages/engine/src/services/multiscale/CellAgent.ts`
- `moveCell` is dimension-aware: 2D walks use a single angle and keep z=0;
  chemotaxis uses only in-plane gradient in 2D; always uses the supplied
  seeded `SimpleRNG` (no `crypto.getRandomValues` fallback).
- `divideCell` conserves mass exactly: exact binomial for small integer
  counts, Gaussian-sampled but strictly mass-conserving split for continuous
  concentrations; 2D daughters stay in-plane; parent keeps its refractory
  cooldowns (bug fix — division previously reset them).
- New `applyCellBoundary` (reflective/periodic/absorbing).

### `packages/engine/src/services/multiscale/MultiscaleParser.ts`
- Full validation: definition shape, dimensions ∈ {2,3}, positive domain
  size, positive tEnd/dtIntra/dtExtra/dtDecision/outputs, non-negative D,
  refractory passthrough, `absorbing` boundary now accepted, optional
  `domain.resolution`, `maxCells`, `seed`.

### `packages/engine/src/services/multiscale/IntracellularEngine.ts`
- Explicit `await CVODESolver.init()` after `buildOdeSystem` so the WASM
  module is guaranteed loaded before the first cell integrates (fixes
  "CVODE WASM not loaded" fallback that silently held all cell states).

### `services/multiscaleWorker.ts`
- Cooperative cancellation with run IDs: `cancel` posts `{type:'cancelled'}`
  and invalidates the in-flight run; stale runs cannot post results.
- Progress throttled to ≥60 ms between messages, clamped to [0,1].
- Global error / unhandledrejection / messageerror handlers post structured
  errors; cancellation is never reported as failure.

### `components/tabs/MultiscaleTab.tsx`
- Run-ID guard: messages from superseded runs are ignored; worker terminated
  before each new run and on unmount; completed workers released.
- `cancelled` response handled distinctly from `error` (no red banner on
  user cancellation), with a 500 ms force-terminate fallback.
- Observable headers derived from the current snapshot only (was
  O(snapshots × cells) per render); redundant row duplication memo removed;
  export artifacts build lazily.

## 4. Tests

`npx vitest run packages/engine/tests/multiscale/ tests/services/multiscaleWorker.spec.ts`

- **45 passed, 0 failed, 0 skipped** (3 files):
  - `multiscale.spec.ts` — 8 passed (existing, unchanged semantics)
  - `multiscale-optimization.spec.ts` — 35 passed (new): dimensionality
    (2D grid is Nx×Ny; 3D is Nx×Ny×Nz), mass conservation under Neumann
    (2D & 3D), uniform-field invariance, symmetric point-source spreading,
    degradation decay, zero-z gradient in 2D, periodic wrapping,
    seeded-RNG determinism, planar 2D movement, chemotaxis in-plane,
    reflective/periodic/absorbing cell BCs, exact division conservation
    (integer & continuous), non-commensurate clocks, refractory enforcement
    (division at t=1 and t=6, none between), maxCells under simultaneous
    divisions, lineage parent/birth/division/death records, snapshot
    compactness & immutability, seed reproducibility, monotonic progress,
    early cancellation, invalid-config rejection, parser validation,
    boundary-respecting migration in 2D.
  - `multiscaleWorker.spec.ts` — 2 passed.

`npm run test:fast`: **6,415 passed, 6 skipped; 3 test files fail** — all
three (`tests/mcp-server.spec.ts`, `packages/mcp-server/tests/protocol-v2.spec.ts`,
`packages/mcp-server/tests/registry.spec.ts`) fail on the **clean tree too**
with `Cannot find package '@modelcontextprotocol/server/stdio'` — a
pre-existing missing-dependency issue unrelated to this change (verified via
`git stash`).

## 5. Remaining bottlenecks

- **CVODE per-cell integration** dominates for large populations with rich
  intracellular models (one solver per cell type, one `integrate` call per
  cell per intracellular step). Batching cells by type into grouped solves
  or reducing JS↔WASM crossings is the next lever.
- **200×200 2D grid** already costs 65 ms for a 2 s run; ≥500×500 CPU
  stencils will dominate. A WebGPU diffusion backend is the natural next
  optimization (regular stencil, semantically separable).
- The 10,000-substep cap on explicit diffusion protects against hangs but
  silently under-resolves extremely stiff configurations (warns loudly);
  an implicit/ADI solver would remove the cap but is deferred until
  profiling justifies it.
- Snapshot arrays still hold one entry per output per cell; very long runs
  may want ring-buffer/decimated history (not yet implemented).

## Reproducing

```bash
npx tsx scripts/benchmark_multiscale.ts          # after (full harness)
npx tsx scripts/benchmark_multiscale_baseline.ts # before (needs /tmp/msbench/OldExtracellularGrid.ts from git HEAD)
npx vitest run packages/engine/tests/multiscale/ tests/services/multiscaleWorker.spec.ts
```
