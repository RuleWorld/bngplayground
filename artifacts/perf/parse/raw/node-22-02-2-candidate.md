
==============================================================================
 PIPELINE PROFILE   (median of 1 run, warm-up discarded)
 runtime: v22.23.2   platform: linux/x64
 cvode.wasm present: yes   sim methods: ssa
 SSA cases: t_end=1
==============================================================================

model                                     species    rxns    parse       gen      ode      ssa@1   heapMB
---------------------------------------------------------------------------------------------------------
chain_5 (baseline, unimolecular)                5       4      4.0       3.5        -        1.6      0.5
binding_AB (bimolecular)                        3       2      3.7       1.4        -        1.5      0.1
multisite_5 (2^5 species, combinatorial)       32     160     13.7      22.5        -       16.4      8.1

(all times in ms)

==============================================================================
 SIMULATION SAMPLE SPREAD
==============================================================================
 Raw samples are retained in execution order; hashing occurs outside the timer.

 chain_5 (baseline, unimolecular) | ssa:t_end=1 | median=1.622 min=1.622 max=1.622
   samples_ms=[1.622] trajectory_hash=6715bcce6aeb4b368ef084ce462963403bb1c6264952cdd105a79ca88f8689e8
 binding_AB (bimolecular) | ssa:t_end=1 | median=1.461 min=1.461 max=1.461
   samples_ms=[1.461] trajectory_hash=49372cd10fa64a99128ea74677bda6d972ed8b65f62f6cb984fdf00c75e4293d
 multisite_5 (2^5 species, combinatorial) | ssa:t_end=1 | median=16.375 min=16.375 max=16.375
   samples_ms=[16.375] trajectory_hash=ea7b702ac44ac0a40058a898afa7ad4992124f473b8fb15985278cccbb118b4e
==============================================================================

--- generation breakdown: chain_5 (baseline, unimolecular)  (gen wall 3.5 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  0.7     21%         4    184.40
  applyTransformation          0.3      9%         4     77.29
  speciesDedup                 0.2      6%         9     22.85
  canonicalize                 0.0      0%         5      1.36
  matchComponents              0.0      0%         5      1.27
  (instrumented sections account for 36% of gen wall; 707.1 µs/species, 883.9 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: binding_AB (bimolecular)  (gen wall 1.4 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  0.1      9%         5     26.06
  applyTransformation          0.1      6%         2     44.22
  speciesDedup                 0.0      1%         6      3.15
  matchComponents              0.0      0%         6      1.05
  canonicalize                 0.0      0%         3      0.91
  (instrumented sections account for 18% of gen wall; 457.8 µs/species, 686.7 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: multisite_5 (2^5 species, combinatorial)  (gen wall 22.5 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  6.1     27%       160     38.29
  applyTransformation          1.8      8%       160     11.07
  speciesDedup                 1.8      8%       161     10.96
  matchComponents              1.6      7%       176      9.33
  canonicalize                 0.6      3%        32     18.27
  (instrumented sections account for 53% of gen wall; 703.5 µs/species, 140.7 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

==============================================================================
 WHERE THE TIME GOES (totals across all models)
==============================================================================

 phase totals (ms), biggest first:
   gen            27.4  40%
   parse          21.4  31%
   ssa            19.5  29%
   ode             0.0  0%

 within generation, biggest sinks (ms), biggest first:
   findAllMaps                 7.0  26% of gen
   applyTransformation         2.2  8% of gen
   speciesDedup                2.0  7% of gen
   matchComponents             1.7  6% of gen
   canonicalize                0.6  2% of gen

 >>> Biggest phase overall: gen (27.4 ms).
 >>> Biggest generation sink: findAllMaps (26% of generation).
==============================================================================
