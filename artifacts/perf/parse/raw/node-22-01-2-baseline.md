
==============================================================================
 PIPELINE PROFILE   (median of 1 run, warm-up discarded)
 runtime: v22.23.2   platform: linux/x64
 cvode.wasm present: yes   sim methods: ssa
 SSA cases: t_end=1
==============================================================================

model                                     species    rxns    parse       gen      ode      ssa@1   heapMB
---------------------------------------------------------------------------------------------------------
chain_5 (baseline, unimolecular)                5       4      8.2       8.2        -        1.8    -10.2
binding_AB (bimolecular)                        3       2      6.5       1.7        -        1.3      0.2
multisite_5 (2^5 species, combinatorial)       32     160     11.5      23.4        -       14.7      8.1

(all times in ms)

==============================================================================
 SIMULATION SAMPLE SPREAD
==============================================================================
 Raw samples are retained in execution order; hashing occurs outside the timer.

 chain_5 (baseline, unimolecular) | ssa:t_end=1 | median=1.755 min=1.755 max=1.755
   samples_ms=[1.755] trajectory_hash=6715bcce6aeb4b368ef084ce462963403bb1c6264952cdd105a79ca88f8689e8
 binding_AB (bimolecular) | ssa:t_end=1 | median=1.345 min=1.345 max=1.345
   samples_ms=[1.345] trajectory_hash=49372cd10fa64a99128ea74677bda6d972ed8b65f62f6cb984fdf00c75e4293d
 multisite_5 (2^5 species, combinatorial) | ssa:t_end=1 | median=14.707 min=14.707 max=14.707
   samples_ms=[14.707] trajectory_hash=ea7b702ac44ac0a40058a898afa7ad4992124f473b8fb15985278cccbb118b4e
==============================================================================

--- generation breakdown: chain_5 (baseline, unimolecular)  (gen wall 8.2 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation          4.3     53%         4   1084.06
  findAllMaps                  0.6      8%         4    158.25
  speciesDedup                 0.2      3%         9     24.24
  canonicalize                 0.0      0%         5      2.99
  matchComponents              0.0      0%         5      1.38
  (instrumented sections account for 63% of gen wall; 1645.1 µs/species, 2056.4 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: binding_AB (bimolecular)  (gen wall 1.7 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation          0.1      9%         2     74.13
  findAllMaps                  0.1      6%         5     21.03
  speciesDedup                 0.0      2%         6      4.37
  matchComponents              0.0      0%         6      1.12
  canonicalize                 0.0      0%         3      1.05
  (instrumented sections account for 17% of gen wall; 558.8 µs/species, 838.2 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: multisite_5 (2^5 species, combinatorial)  (gen wall 23.4 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  6.3     27%       160     39.42
  applyTransformation          1.7      7%       160     10.85
  matchComponents              1.6      7%       176      9.33
  speciesDedup                 1.6      7%       161      9.84
  canonicalize                 0.5      2%        32     15.98
  (instrumented sections account for 50% of gen wall; 730.7 µs/species, 146.1 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

==============================================================================
 WHERE THE TIME GOES (totals across all models)
==============================================================================

 phase totals (ms), biggest first:
   gen            33.3  43%
   parse          26.1  34%
   ssa            17.8  23%
   ode             0.0  0%

 within generation, biggest sinks (ms), biggest first:
   findAllMaps                 7.0  21% of gen
   applyTransformation         6.2  19% of gen
   speciesDedup                1.8  5% of gen
   matchComponents             1.7  5% of gen
   canonicalize                0.5  2% of gen

 >>> Biggest phase overall: gen (33.3 ms).
 >>> Biggest generation sink: findAllMaps (21% of generation).
==============================================================================
