# perf/models/  (OPTIONAL)

You probably don't need this directory. The benchmark harness
(`tests/profile-everything.spec.ts`) already ships built-in models:
- `chain_5` — unimolecular baseline (fixed overhead)
- `binding_AB` — bimolecular
- `multisite_N` — one molecule with N sites, expands to **2^N species**. This is
  the combinatorial networkgen stressor; the perf workflow drives it at N=7,9
  (128 and 512 species), which is where NetworkGenerator cost actually shows up.

So the "netgen needs a big model" problem is already solved, synthetically and
controllably — no need to vendor or hand-author models just to make the fan-out
meaningful.

**Add real models here only if you want representativeness on top of the
stressors.** If you do:
- vendor a **pinned, frozen** subset (copies, not a live pointer) so the yardstick
  doesn't drift over time;
- pick ones that parse + expand (+ SSA) in **pure JS** — no models that need
  CVODE/NFsim/native BNG2 to be meaningful;
- point the harness at them with `PROFILE_MODELS_DIR=perf/models` (and
  `PROFILE_ONLY_EXTERNAL=1` if you want ONLY these, not the built-ins).

Good real picks are the ones your existing `benchmark_functional_rate_fast_path.ts`
already trusts (e.g. an EGFR variant — a real combinatorial-expansion model).

Delete this file if you leave the directory empty; the built-in stressors are
enough for the fan-out.
