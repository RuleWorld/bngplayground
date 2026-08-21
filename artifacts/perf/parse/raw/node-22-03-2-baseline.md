
==============================================================================
 PIPELINE PROFILE   (median of 1 run, warm-up discarded)
 runtime: v22.23.2   platform: linux/x64
 cvode.wasm present: yes   sim methods: ssa
 SSA cases: t_end=1
==============================================================================

model                                     species    rxns    parse       gen      ode      ssa@1   heapMB
---------------------------------------------------------------------------------------------------------
chain_5 (baseline, unimolecular)                5       4      8.1       8.3        -        1.7     -9.8
binding_AB (bimolecular)                        3       2      6.2       1.8        -        1.4      0.2
multisite_5 (2^5 species, combinatorial)       32     160     11.3      21.8        -       14.3      8.1

(all times in ms)

==============================================================================
 SIMULATION SAMPLE SPREAD
==============================================================================
 Raw samples are retained in execution order; hashing occurs outside the timer.

 chain_5 (baseline, unimolecular) | ssa:t_end=1 | median=1.688 min=1.688 max=1.688
   samples_ms=[1.688] trajectory_hash=6715bcce6aeb4b368ef084ce462963403bb1c6264952cdd105a79ca88f8689e8
 binding_AB (bimolecular) | ssa:t_end=1 | median=1.363 min=1.363 max=1.363
   samples_ms=[1.363] trajectory_hash=49372cd10fa64a99128ea74677bda6d972ed8b65f62f6cb984fdf00c75e4293d
 multisite_5 (2^5 species, combinatorial) | ssa:t_end=1 | median=14.348 min=14.348 max=14.348
   samples_ms=[14.348] trajectory_hash=ea7b702ac44ac0a40058a898afa7ad4992124f473b8fb15985278cccbb118b4e
==============================================================================

--- generation breakdown: chain_5 (baseline, unimolecular)  (gen wall 8.3 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  0.7      8%         4    171.58
  applyTransformation          0.4      5%         4    100.39
  speciesDedup                 0.4      5%         9     41.61
  canonicalize                 0.0      0%         5      1.70
  matchComponents              0.0      0%         5      1.34
  (instrumented sections account for 18% of gen wall; 1659.7 µs/species, 2074.7 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: binding_AB (bimolecular)  (gen wall 1.8 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  0.2      9%         5     33.01
  applyTransformation          0.1      8%         2     69.48
  speciesDedup                 0.0      1%         6      3.82
  matchComponents              0.0      0%         6      1.23
  canonicalize                 0.0      0%         3      1.18
  (instrumented sections account for 19% of gen wall; 595.1 µs/species, 892.7 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: multisite_5 (2^5 species, combinatorial)  (gen wall 21.8 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  5.7     26%       160     35.67
  applyTransformation          1.6      8%       160     10.25
  speciesDedup                 1.5      7%       161      9.43
  matchComponents              1.4      7%       176      8.24
  canonicalize                 0.5      2%        32     15.32
  (instrumented sections account for 49% of gen wall; 682.4 µs/species, 136.5 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

==============================================================================
 WHERE THE TIME GOES (totals across all models)
==============================================================================

 phase totals (ms), biggest first:
   gen            31.9  43%
   parse          25.5  34%
   ssa            17.4  23%
   ode             0.0  0%

 within generation, biggest sinks (ms), biggest first:
   findAllMaps                 6.6  21% of gen
   applyTransformation         2.2  7% of gen
   speciesDedup                1.9  6% of gen
   matchComponents             1.5  5% of gen
   canonicalize                0.5  2% of gen

 >>> Biggest phase overall: gen (31.9 ms).
 >>> Biggest generation sink: findAllMaps (21% of generation).
==============================================================================
