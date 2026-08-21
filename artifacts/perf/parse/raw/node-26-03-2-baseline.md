
==============================================================================
 PIPELINE PROFILE   (median of 1 run, warm-up discarded)
 runtime: v26.7.0   platform: linux/x64
 cvode.wasm present: yes   sim methods: ssa
 SSA cases: t_end=1
==============================================================================

model                                     species    rxns    parse       gen      ode      ssa@1   heapMB
---------------------------------------------------------------------------------------------------------
chain_5 (baseline, unimolecular)                5       4      8.2       3.1        -        1.9     -0.0
binding_AB (bimolecular)                        3       2      4.8       1.6        -        1.4      0.2
multisite_5 (2^5 species, combinatorial)       32     160      9.9      27.9        -       26.0      8.3

(all times in ms)

==============================================================================
 SIMULATION SAMPLE SPREAD
==============================================================================
 Raw samples are retained in execution order; hashing occurs outside the timer.

 chain_5 (baseline, unimolecular) | ssa:t_end=1 | median=1.882 min=1.882 max=1.882
   samples_ms=[1.882] trajectory_hash=6715bcce6aeb4b368ef084ce462963403bb1c6264952cdd105a79ca88f8689e8
 binding_AB (bimolecular) | ssa:t_end=1 | median=1.390 min=1.390 max=1.390
   samples_ms=[1.390] trajectory_hash=49372cd10fa64a99128ea74677bda6d972ed8b65f62f6cb984fdf00c75e4293d
 multisite_5 (2^5 species, combinatorial) | ssa:t_end=1 | median=26.018 min=26.018 max=26.018
   samples_ms=[26.018] trajectory_hash=ea7b702ac44ac0a40058a898afa7ad4992124f473b8fb15985278cccbb118b4e
==============================================================================

--- generation breakdown: chain_5 (baseline, unimolecular)  (gen wall 3.1 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation          0.5     17%         4    130.00
  findAllMaps                  0.4     13%         4    102.16
  speciesDedup                 0.1      4%         9     15.52
  canonicalize                 0.0      0%         5      1.37
  matchComponents              0.0      0%         5      1.25
  (instrumented sections account for 35% of gen wall; 626.6 µs/species, 783.2 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: binding_AB (bimolecular)  (gen wall 1.6 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  0.1      9%         5     27.49
  applyTransformation          0.1      7%         2     60.05
  speciesDedup                 0.0      2%         6      4.38
  matchComponents              0.0      0%         6      1.04
  canonicalize                 0.0      0%         3      0.91
  (instrumented sections account for 18% of gen wall; 539.0 µs/species, 808.5 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: multisite_5 (2^5 species, combinatorial)  (gen wall 27.9 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  7.1     25%       160     44.37
  applyTransformation          2.6      9%       160     16.42
  speciesDedup                 1.6      6%       161      9.64
  matchComponents              1.3      5%       176      7.37
  canonicalize                 0.5      2%        32     14.55
  (instrumented sections account for 47% of gen wall; 871.9 µs/species, 174.4 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

==============================================================================
 WHERE THE TIME GOES (totals across all models)
==============================================================================

 phase totals (ms), biggest first:
   gen            32.7  39%
   ssa            29.3  35%
   parse          22.8  27%
   ode             0.0  0%

 within generation, biggest sinks (ms), biggest first:
   findAllMaps                 7.6  23% of gen
   applyTransformation         3.3  10% of gen
   speciesDedup                1.7  5% of gen
   matchComponents             1.3  4% of gen
   canonicalize                0.5  1% of gen

 >>> Biggest phase overall: gen (32.7 ms).
 >>> Biggest generation sink: findAllMaps (23% of generation).
==============================================================================
