
==============================================================================
 PIPELINE PROFILE   (median of 1 run, warm-up discarded)
 runtime: v22.23.2   platform: linux/x64
 cvode.wasm present: yes   sim methods: ssa
 SSA cases: t_end=1
==============================================================================

model                                     species    rxns    parse       gen      ode      ssa@1   heapMB
---------------------------------------------------------------------------------------------------------
chain_5 (baseline, unimolecular)                5       4     12.5       4.0        -        1.7      0.5
binding_AB (bimolecular)                        3       2      6.1       1.6        -        1.1      0.2
multisite_5 (2^5 species, combinatorial)       32     160     10.8      23.5        -       14.6      8.1

(all times in ms)

==============================================================================
 SIMULATION SAMPLE SPREAD
==============================================================================
 Raw samples are retained in execution order; hashing occurs outside the timer.

 chain_5 (baseline, unimolecular) | ssa:t_end=1 | median=1.699 min=1.699 max=1.699
   samples_ms=[1.699] trajectory_hash=6715bcce6aeb4b368ef084ce462963403bb1c6264952cdd105a79ca88f8689e8
 binding_AB (bimolecular) | ssa:t_end=1 | median=1.097 min=1.097 max=1.097
   samples_ms=[1.097] trajectory_hash=49372cd10fa64a99128ea74677bda6d972ed8b65f62f6cb984fdf00c75e4293d
 multisite_5 (2^5 species, combinatorial) | ssa:t_end=1 | median=14.642 min=14.642 max=14.642
   samples_ms=[14.642] trajectory_hash=ea7b702ac44ac0a40058a898afa7ad4992124f473b8fb15985278cccbb118b4e
==============================================================================

--- generation breakdown: chain_5 (baseline, unimolecular)  (gen wall 4.0 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  0.6     15%         4    152.83
  applyTransformation          0.4     10%         4    101.90
  speciesDedup                 0.2      5%         9     21.24
  canonicalize                 0.0      0%         5      1.30
  matchComponents              0.0      0%         5      1.25
  (instrumented sections account for 31% of gen wall; 794.4 µs/species, 993.0 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: binding_AB (bimolecular)  (gen wall 1.6 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation          0.1      8%         2     61.73
  findAllMaps                  0.1      6%         5     20.40
  speciesDedup                 0.0      1%         6      3.28
  matchComponents              0.0      0%         6      1.15
  canonicalize                 0.0      0%         3      0.94
  (instrumented sections account for 16% of gen wall; 545.5 µs/species, 818.3 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: multisite_5 (2^5 species, combinatorial)  (gen wall 23.5 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  6.2     26%       160     38.72
  speciesDedup                 1.8      8%       161     11.14
  applyTransformation          1.8      7%       160     10.94
  matchComponents              1.7      7%       176      9.45
  canonicalize                 0.6      2%        32     17.91
  (instrumented sections account for 51% of gen wall; 734.7 µs/species, 146.9 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

==============================================================================
 WHERE THE TIME GOES (totals across all models)
==============================================================================

 phase totals (ms), biggest first:
   parse          29.5  39%
   gen            29.1  38%
   ssa            17.4  23%
   ode             0.0  0%

 within generation, biggest sinks (ms), biggest first:
   findAllMaps                 6.9  24% of gen
   applyTransformation         2.3  8% of gen
   speciesDedup                2.0  7% of gen
   matchComponents             1.7  6% of gen
   canonicalize                0.6  2% of gen

 >>> Biggest phase overall: parse (29.5 ms).
 >>> Biggest generation sink: findAllMaps (24% of generation).
==============================================================================
