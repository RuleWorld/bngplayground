
==============================================================================
 PIPELINE PROFILE   (median of 1 run, warm-up discarded)
 runtime: v26.7.0   platform: linux/x64
 cvode.wasm present: yes   sim methods: ssa
 SSA cases: t_end=1
==============================================================================

model                                     species    rxns    parse       gen      ode      ssa@1   heapMB
---------------------------------------------------------------------------------------------------------
chain_5 (baseline, unimolecular)                5       4      8.2       3.2        -        1.8      0.5
binding_AB (bimolecular)                        3       2      4.8       1.5        -        1.4      0.2
multisite_5 (2^5 species, combinatorial)       32     160      9.9      28.6        -       27.7      8.3

(all times in ms)

==============================================================================
 SIMULATION SAMPLE SPREAD
==============================================================================
 Raw samples are retained in execution order; hashing occurs outside the timer.

 chain_5 (baseline, unimolecular) | ssa:t_end=1 | median=1.805 min=1.805 max=1.805
   samples_ms=[1.805] trajectory_hash=6715bcce6aeb4b368ef084ce462963403bb1c6264952cdd105a79ca88f8689e8
 binding_AB (bimolecular) | ssa:t_end=1 | median=1.364 min=1.364 max=1.364
   samples_ms=[1.364] trajectory_hash=49372cd10fa64a99128ea74677bda6d972ed8b65f62f6cb984fdf00c75e4293d
 multisite_5 (2^5 species, combinatorial) | ssa:t_end=1 | median=27.734 min=27.734 max=27.734
   samples_ms=[27.734] trajectory_hash=ea7b702ac44ac0a40058a898afa7ad4992124f473b8fb15985278cccbb118b4e
==============================================================================

--- generation breakdown: chain_5 (baseline, unimolecular)  (gen wall 3.2 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  0.5     16%         4    125.97
  applyTransformation          0.4     14%         4    111.82
  speciesDedup                 0.2      7%         9     26.38
  matchComponents              0.0      0%         5      1.46
  canonicalize                 0.0      0%         5      1.32
  (instrumented sections account for 38% of gen wall; 638.6 µs/species, 798.2 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: binding_AB (bimolecular)  (gen wall 1.5 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation          0.1      8%         2     63.86
  findAllMaps                  0.1      7%         5     21.85
  speciesDedup                 0.0      2%         6      4.23
  matchComponents              0.0      0%         6      1.08
  canonicalize                 0.0      0%         3      2.10
  (instrumented sections account for 18% of gen wall; 502.2 µs/species, 753.3 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: multisite_5 (2^5 species, combinatorial)  (gen wall 28.6 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  6.7     23%       160     41.91
  applyTransformation          2.9     10%       160     17.91
  speciesDedup                 1.7      6%       161     10.57
  matchComponents              1.5      5%       176      8.40
  canonicalize                 0.5      2%        32     14.51
  (instrumented sections account for 46% of gen wall; 895.3 µs/species, 179.1 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

==============================================================================
 WHERE THE TIME GOES (totals across all models)
==============================================================================

 phase totals (ms), biggest first:
   gen            33.3  38%
   ssa            30.9  35%
   parse          22.9  26%
   ode             0.0  0%

 within generation, biggest sinks (ms), biggest first:
   findAllMaps                 7.3  22% of gen
   applyTransformation         3.4  10% of gen
   speciesDedup                2.0  6% of gen
   matchComponents             1.5  4% of gen
   canonicalize                0.5  1% of gen

 >>> Biggest phase overall: gen (33.3 ms).
 >>> Biggest generation sink: findAllMaps (22% of generation).
==============================================================================
