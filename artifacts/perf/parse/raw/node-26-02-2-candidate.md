
==============================================================================
 PIPELINE PROFILE   (median of 1 run, warm-up discarded)
 runtime: v26.7.0   platform: linux/x64
 cvode.wasm present: yes   sim methods: ssa
 SSA cases: t_end=1
==============================================================================

model                                     species    rxns    parse       gen      ode      ssa@1   heapMB
---------------------------------------------------------------------------------------------------------
chain_5 (baseline, unimolecular)                5       4      4.9       3.2        -        1.9      0.5
binding_AB (bimolecular)                        3       2      3.1       1.6        -        1.4      0.2
multisite_5 (2^5 species, combinatorial)       32     160      6.0      27.9        -       33.4      8.4

(all times in ms)

==============================================================================
 SIMULATION SAMPLE SPREAD
==============================================================================
 Raw samples are retained in execution order; hashing occurs outside the timer.

 chain_5 (baseline, unimolecular) | ssa:t_end=1 | median=1.877 min=1.877 max=1.877
   samples_ms=[1.877] trajectory_hash=6715bcce6aeb4b368ef084ce462963403bb1c6264952cdd105a79ca88f8689e8
 binding_AB (bimolecular) | ssa:t_end=1 | median=1.404 min=1.404 max=1.404
   samples_ms=[1.404] trajectory_hash=49372cd10fa64a99128ea74677bda6d972ed8b65f62f6cb984fdf00c75e4293d
 multisite_5 (2^5 species, combinatorial) | ssa:t_end=1 | median=33.405 min=33.405 max=33.405
   samples_ms=[33.405] trajectory_hash=ea7b702ac44ac0a40058a898afa7ad4992124f473b8fb15985278cccbb118b4e
==============================================================================

--- generation breakdown: chain_5 (baseline, unimolecular)  (gen wall 3.2 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation          0.6     19%         4    156.41
  findAllMaps                  0.4     12%         4     95.29
  speciesDedup                 0.1      4%         9     14.61
  canonicalize                 0.0      0%         5      1.39
  matchComponents              0.0      0%         5      1.26
  (instrumented sections account for 35% of gen wall; 649.7 µs/species, 812.1 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: binding_AB (bimolecular)  (gen wall 1.6 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation          0.1      8%         2     64.71
  findAllMaps                  0.1      7%         5     21.62
  speciesDedup                 0.0      1%         6      3.36
  matchComponents              0.0      0%         6      1.08
  canonicalize                 0.0      0%         3      0.96
  (instrumented sections account for 17% of gen wall; 517.8 µs/species, 776.7 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: multisite_5 (2^5 species, combinatorial)  (gen wall 27.9 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  6.8     24%       160     42.25
  applyTransformation          2.8     10%       160     17.38
  speciesDedup                 1.7      6%       161     10.56
  matchComponents              1.5      5%       176      8.24
  canonicalize                 0.4      1%        32     12.49
  (instrumented sections account for 47% of gen wall; 873.4 µs/species, 174.7 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

==============================================================================
 WHERE THE TIME GOES (totals across all models)
==============================================================================

 phase totals (ms), biggest first:
   ssa            36.7  44%
   gen            32.8  39%
   parse          14.0  17%
   ode             0.0  0%

 within generation, biggest sinks (ms), biggest first:
   findAllMaps                 7.2  22% of gen
   applyTransformation         3.5  11% of gen
   speciesDedup                1.9  6% of gen
   matchComponents             1.5  4% of gen
   canonicalize                0.4  1% of gen

 >>> Biggest phase overall: ssa (36.7 ms).
 >>> Biggest generation sink: findAllMaps (22% of generation).
==============================================================================
