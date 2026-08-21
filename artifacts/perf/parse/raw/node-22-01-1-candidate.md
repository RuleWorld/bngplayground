
==============================================================================
 PIPELINE PROFILE   (median of 1 run, warm-up discarded)
 runtime: v22.23.2   platform: linux/x64
 cvode.wasm present: yes   sim methods: ssa
 SSA cases: t_end=1
==============================================================================

model                                     species    rxns    parse       gen      ode      ssa@1   heapMB
---------------------------------------------------------------------------------------------------------
chain_5 (baseline, unimolecular)                5       4      4.3       4.2        -        1.6      0.5
binding_AB (bimolecular)                        3       2      3.8       1.6        -        1.6      0.1
multisite_5 (2^5 species, combinatorial)       32     160     12.7      24.1        -       17.0      8.1

(all times in ms)

==============================================================================
 SIMULATION SAMPLE SPREAD
==============================================================================
 Raw samples are retained in execution order; hashing occurs outside the timer.

 chain_5 (baseline, unimolecular) | ssa:t_end=1 | median=1.577 min=1.577 max=1.577
   samples_ms=[1.577] trajectory_hash=6715bcce6aeb4b368ef084ce462963403bb1c6264952cdd105a79ca88f8689e8
 binding_AB (bimolecular) | ssa:t_end=1 | median=1.583 min=1.583 max=1.583
   samples_ms=[1.583] trajectory_hash=49372cd10fa64a99128ea74677bda6d972ed8b65f62f6cb984fdf00c75e4293d
 multisite_5 (2^5 species, combinatorial) | ssa:t_end=1 | median=16.983 min=16.983 max=16.983
   samples_ms=[16.983] trajectory_hash=ea7b702ac44ac0a40058a898afa7ad4992124f473b8fb15985278cccbb118b4e
==============================================================================

--- generation breakdown: chain_5 (baseline, unimolecular)  (gen wall 4.2 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  0.8     18%         4    192.36
  applyTransformation          0.4      9%         4     98.54
  speciesDedup                 0.2      5%         9     23.03
  matchComponents              0.0      1%         5      8.33
  canonicalize                 0.0      0%         5      1.23
  (instrumented sections account for 34% of gen wall; 833.8 µs/species, 1042.3 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: binding_AB (bimolecular)  (gen wall 1.6 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation          0.2     12%         2     93.02
  findAllMaps                  0.1      6%         5     18.59
  speciesDedup                 0.0      1%         6      3.51
  matchComponents              0.0      0%         6      0.99
  canonicalize                 0.0      0%         3      1.04
  (instrumented sections account for 20% of gen wall; 522.7 µs/species, 784.0 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: multisite_5 (2^5 species, combinatorial)  (gen wall 24.1 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  6.2     26%       160     38.81
  applyTransformation          2.0      8%       160     12.36
  speciesDedup                 1.7      7%       161     10.74
  matchComponents              1.6      7%       176      9.20
  canonicalize                 0.6      2%        32     18.07
  (instrumented sections account for 50% of gen wall; 753.0 µs/species, 150.6 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

==============================================================================
 WHERE THE TIME GOES (totals across all models)
==============================================================================

 phase totals (ms), biggest first:
   gen            29.8  42%
   parse          20.8  29%
   ssa            20.1  28%
   ode             0.0  0%

 within generation, biggest sinks (ms), biggest first:
   findAllMaps                 7.1  24% of gen
   applyTransformation         2.6  9% of gen
   speciesDedup                2.0  7% of gen
   matchComponents             1.7  6% of gen
   canonicalize                0.6  2% of gen

 >>> Biggest phase overall: gen (29.8 ms).
 >>> Biggest generation sink: findAllMaps (24% of generation).
==============================================================================
