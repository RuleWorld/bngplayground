
==============================================================================
 PIPELINE PROFILE   (median of 1 run, warm-up discarded)
 runtime: v26.7.0   platform: linux/x64
 cvode.wasm present: yes   sim methods: ssa
 SSA cases: t_end=1
==============================================================================

model                                     species    rxns    parse       gen      ode      ssa@1   heapMB
---------------------------------------------------------------------------------------------------------
chain_5 (baseline, unimolecular)                5       4      4.4       3.1        -        1.9      0.5
binding_AB (bimolecular)                        3       2      3.0       1.4        -        1.4      0.2
multisite_5 (2^5 species, combinatorial)       32     160      4.9      25.3        -       28.4      8.4

(all times in ms)

==============================================================================
 SIMULATION SAMPLE SPREAD
==============================================================================
 Raw samples are retained in execution order; hashing occurs outside the timer.

 chain_5 (baseline, unimolecular) | ssa:t_end=1 | median=1.949 min=1.949 max=1.949
   samples_ms=[1.949] trajectory_hash=6715bcce6aeb4b368ef084ce462963403bb1c6264952cdd105a79ca88f8689e8
 binding_AB (bimolecular) | ssa:t_end=1 | median=1.381 min=1.381 max=1.381
   samples_ms=[1.381] trajectory_hash=49372cd10fa64a99128ea74677bda6d972ed8b65f62f6cb984fdf00c75e4293d
 multisite_5 (2^5 species, combinatorial) | ssa:t_end=1 | median=28.392 min=28.392 max=28.392
   samples_ms=[28.392] trajectory_hash=ea7b702ac44ac0a40058a898afa7ad4992124f473b8fb15985278cccbb118b4e
==============================================================================

--- generation breakdown: chain_5 (baseline, unimolecular)  (gen wall 3.1 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation          0.7     21%         4    165.56
  findAllMaps                  0.5     15%         4    115.66
  speciesDedup                 0.1      4%         9     13.25
  matchComponents              0.0      0%         5      1.27
  canonicalize                 0.0      0%         5      1.13
  (instrumented sections account for 40% of gen wall; 621.4 µs/species, 776.8 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: binding_AB (bimolecular)  (gen wall 1.4 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation          0.2     11%         2     79.01
  findAllMaps                  0.1      7%         5     19.60
  speciesDedup                 0.0      1%         6      3.28
  matchComponents              0.0      0%         6      1.02
  canonicalize                 0.0      0%         3      1.02
  (instrumented sections account for 20% of gen wall; 478.6 µs/species, 718.0 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: multisite_5 (2^5 species, combinatorial)  (gen wall 25.3 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  6.5     26%       160     40.70
  applyTransformation          2.3      9%       160     14.29
  speciesDedup                 1.5      6%       161      9.34
  matchComponents              1.3      5%       176      7.34
  canonicalize                 0.5      2%        32     14.51
  (instrumented sections account for 48% of gen wall; 791.6 µs/species, 158.3 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

==============================================================================
 WHERE THE TIME GOES (totals across all models)
==============================================================================

 phase totals (ms), biggest first:
   ssa            31.7  43%
   gen            29.9  40%
   parse          12.4  17%
   ode             0.0  0%

 within generation, biggest sinks (ms), biggest first:
   findAllMaps                 7.1  24% of gen
   applyTransformation         3.1  10% of gen
   speciesDedup                1.6  5% of gen
   matchComponents             1.3  4% of gen
   canonicalize                0.5  2% of gen

 >>> Biggest phase overall: ssa (31.7 ms).
 >>> Biggest generation sink: findAllMaps (24% of generation).
==============================================================================
