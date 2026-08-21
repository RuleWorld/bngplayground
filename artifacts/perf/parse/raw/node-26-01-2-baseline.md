
==============================================================================
 PIPELINE PROFILE   (median of 1 run, warm-up discarded)
 runtime: v26.7.0   platform: linux/x64
 cvode.wasm present: yes   sim methods: ssa
 SSA cases: t_end=1
==============================================================================

model                                     species    rxns    parse       gen      ode      ssa@1   heapMB
---------------------------------------------------------------------------------------------------------
chain_5 (baseline, unimolecular)                5       4      8.1       3.2        -        1.8     -0.0
binding_AB (bimolecular)                        3       2      5.4       1.7        -        1.5      0.2
multisite_5 (2^5 species, combinatorial)       32     160      9.8      27.9        -       16.8      8.3

(all times in ms)

==============================================================================
 SIMULATION SAMPLE SPREAD
==============================================================================
 Raw samples are retained in execution order; hashing occurs outside the timer.

 chain_5 (baseline, unimolecular) | ssa:t_end=1 | median=1.828 min=1.828 max=1.828
   samples_ms=[1.828] trajectory_hash=6715bcce6aeb4b368ef084ce462963403bb1c6264952cdd105a79ca88f8689e8
 binding_AB (bimolecular) | ssa:t_end=1 | median=1.459 min=1.459 max=1.459
   samples_ms=[1.459] trajectory_hash=49372cd10fa64a99128ea74677bda6d972ed8b65f62f6cb984fdf00c75e4293d
 multisite_5 (2^5 species, combinatorial) | ssa:t_end=1 | median=16.789 min=16.789 max=16.789
   samples_ms=[16.789] trajectory_hash=ea7b702ac44ac0a40058a898afa7ad4992124f473b8fb15985278cccbb118b4e
==============================================================================

--- generation breakdown: chain_5 (baseline, unimolecular)  (gen wall 3.2 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation          0.6     17%         4    137.62
  findAllMaps                  0.4     14%         4    109.98
  speciesDedup                 0.2      6%         9     20.48
  canonicalize                 0.0      0%         5      1.43
  matchComponents              0.0      0%         5      1.28
  (instrumented sections account for 37% of gen wall; 638.9 µs/species, 798.7 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: binding_AB (bimolecular)  (gen wall 1.7 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation          0.1      7%         2     62.97
  findAllMaps                  0.1      7%         5     22.26
  speciesDedup                 0.0      1%         6      3.86
  matchComponents              0.0      0%         6      1.04
  canonicalize                 0.0      0%         3      0.95
  (instrumented sections account for 16% of gen wall; 561.2 µs/species, 841.8 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: multisite_5 (2^5 species, combinatorial)  (gen wall 27.9 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  6.5     23%       160     40.66
  applyTransformation          2.7     10%       160     16.84
  speciesDedup                 1.7      6%       161     10.74
  matchComponents              1.4      5%       176      7.77
  canonicalize                 0.5      2%        32     16.85
  (instrumented sections account for 46% of gen wall; 870.7 µs/species, 174.1 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

==============================================================================
 WHERE THE TIME GOES (totals across all models)
==============================================================================

 phase totals (ms), biggest first:
   gen            32.7  43%
   parse          23.3  31%
   ssa            20.1  26%
   ode             0.0  0%

 within generation, biggest sinks (ms), biggest first:
   findAllMaps                 7.1  22% of gen
   applyTransformation         3.4  10% of gen
   speciesDedup                1.9  6% of gen
   matchComponents             1.4  4% of gen
   canonicalize                0.5  2% of gen

 >>> Biggest phase overall: gen (32.7 ms).
 >>> Biggest generation sink: findAllMaps (22% of generation).
==============================================================================
