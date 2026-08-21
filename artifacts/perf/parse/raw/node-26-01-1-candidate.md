
==============================================================================
 PIPELINE PROFILE   (median of 1 run, warm-up discarded)
 runtime: v26.7.0   platform: linux/x64
 cvode.wasm present: yes   sim methods: ssa
 SSA cases: t_end=1
==============================================================================

model                                     species    rxns    parse       gen      ode      ssa@1   heapMB
---------------------------------------------------------------------------------------------------------
chain_5 (baseline, unimolecular)                5       4      5.0       3.1        -        1.9      0.5
binding_AB (bimolecular)                        3       2      2.9       1.6        -        1.3      0.2
multisite_5 (2^5 species, combinatorial)       32     160      6.3      31.7        -       21.8    -17.5

(all times in ms)

==============================================================================
 SIMULATION SAMPLE SPREAD
==============================================================================
 Raw samples are retained in execution order; hashing occurs outside the timer.

 chain_5 (baseline, unimolecular) | ssa:t_end=1 | median=1.858 min=1.858 max=1.858
   samples_ms=[1.858] trajectory_hash=6715bcce6aeb4b368ef084ce462963403bb1c6264952cdd105a79ca88f8689e8
 binding_AB (bimolecular) | ssa:t_end=1 | median=1.324 min=1.324 max=1.324
   samples_ms=[1.324] trajectory_hash=49372cd10fa64a99128ea74677bda6d972ed8b65f62f6cb984fdf00c75e4293d
 multisite_5 (2^5 species, combinatorial) | ssa:t_end=1 | median=21.751 min=21.751 max=21.751
   samples_ms=[21.751] trajectory_hash=ea7b702ac44ac0a40058a898afa7ad4992124f473b8fb15985278cccbb118b4e
==============================================================================

--- generation breakdown: chain_5 (baseline, unimolecular)  (gen wall 3.1 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation          0.6     18%         4    143.14
  findAllMaps                  0.4     13%         4    103.70
  speciesDedup                 0.1      4%         9     14.05
  matchComponents              0.0      0%         5      2.00
  canonicalize                 0.0      0%         5      1.38
  (instrumented sections account for 36% of gen wall; 620.0 µs/species, 775.0 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: binding_AB (bimolecular)  (gen wall 1.6 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation          0.1      7%         2     56.80
  findAllMaps                  0.1      6%         5     18.50
  speciesDedup                 0.0      2%         6      4.33
  matchComponents              0.0      0%         6      1.00
  canonicalize                 0.0      0%         3      1.10
  (instrumented sections account for 15% of gen wall; 521.4 µs/species, 782.0 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: multisite_5 (2^5 species, combinatorial)  (gen wall 31.7 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  6.8     21%       160     42.51
  applyTransformation          2.3      7%       160     14.37
  speciesDedup                 1.5      5%       161      9.44
  matchComponents              1.4      4%       176      7.81
  canonicalize                 0.4      1%        32     13.35
  (instrumented sections account for 39% of gen wall; 989.1 µs/species, 197.8 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

==============================================================================
 WHERE THE TIME GOES (totals across all models)
==============================================================================

 phase totals (ms), biggest first:
   gen            36.3  48%
   ssa            24.9  33%
   parse          14.3  19%
   ode             0.0  0%

 within generation, biggest sinks (ms), biggest first:
   findAllMaps                 7.3  20% of gen
   applyTransformation         3.0  8% of gen
   speciesDedup                1.7  5% of gen
   matchComponents             1.4  4% of gen
   canonicalize                0.4  1% of gen

 >>> Biggest phase overall: gen (36.3 ms).
 >>> Biggest generation sink: findAllMaps (20% of generation).
==============================================================================
