
==============================================================================
 PIPELINE PROFILE   (median of 1 run, warm-up discarded)
 runtime: v22.23.2   platform: linux/x64
 cvode.wasm present: yes   sim methods: ssa
 SSA cases: t_end=1
==============================================================================

model                                     species    rxns    parse       gen      ode      ssa@1   heapMB
---------------------------------------------------------------------------------------------------------
chain_5 (baseline, unimolecular)                5       4      3.9       4.0        -        1.5      0.5
binding_AB (bimolecular)                        3       2      3.4       1.5        -        1.3      0.1
multisite_5 (2^5 species, combinatorial)       32     160     13.1      22.4        -       16.3      8.1

(all times in ms)

==============================================================================
 SIMULATION SAMPLE SPREAD
==============================================================================
 Raw samples are retained in execution order; hashing occurs outside the timer.

 chain_5 (baseline, unimolecular) | ssa:t_end=1 | median=1.523 min=1.523 max=1.523
   samples_ms=[1.523] trajectory_hash=6715bcce6aeb4b368ef084ce462963403bb1c6264952cdd105a79ca88f8689e8
 binding_AB (bimolecular) | ssa:t_end=1 | median=1.264 min=1.264 max=1.264
   samples_ms=[1.264] trajectory_hash=49372cd10fa64a99128ea74677bda6d972ed8b65f62f6cb984fdf00c75e4293d
 multisite_5 (2^5 species, combinatorial) | ssa:t_end=1 | median=16.342 min=16.342 max=16.342
   samples_ms=[16.342] trajectory_hash=ea7b702ac44ac0a40058a898afa7ad4992124f473b8fb15985278cccbb118b4e
==============================================================================

--- generation breakdown: chain_5 (baseline, unimolecular)  (gen wall 4.0 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  0.7     17%         4    175.54
  applyTransformation          0.4     10%         4     98.05
  speciesDedup                 0.3      8%         9     34.96
  matchComponents              0.0      0%         5      1.48
  canonicalize                 0.0      0%         5      1.41
  (instrumented sections account for 35% of gen wall; 806.0 µs/species, 1007.5 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: binding_AB (bimolecular)  (gen wall 1.5 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  0.1      7%         5     21.17
  applyTransformation          0.1      6%         2     46.82
  speciesDedup                 0.0      1%         6      3.32
  matchComponents              0.0      0%         6      1.00
  canonicalize                 0.0      0%         3      0.86
  (instrumented sections account for 16% of gen wall; 484.7 µs/species, 727.1 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: multisite_5 (2^5 species, combinatorial)  (gen wall 22.4 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  6.1     27%       160     38.26
  applyTransformation          1.7      7%       160     10.49
  speciesDedup                 1.6      7%       161     10.13
  matchComponents              1.6      7%       176      9.10
  canonicalize                 0.6      3%        32     17.70
  (instrumented sections account for 52% of gen wall; 700.1 µs/species, 140.0 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

==============================================================================
 WHERE THE TIME GOES (totals across all models)
==============================================================================

 phase totals (ms), biggest first:
   gen            27.9  41%
   parse          20.4  30%
   ssa            19.1  28%
   ode             0.0  0%

 within generation, biggest sinks (ms), biggest first:
   findAllMaps                 6.9  25% of gen
   applyTransformation         2.2  8% of gen
   speciesDedup                2.0  7% of gen
   matchComponents             1.6  6% of gen
   canonicalize                0.6  2% of gen

 >>> Biggest phase overall: gen (27.9 ms).
 >>> Biggest generation sink: findAllMaps (25% of generation).
==============================================================================
