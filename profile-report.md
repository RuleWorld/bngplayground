
==============================================================================
 PIPELINE PROFILE   (median of 3 runs, warm-up discarded)
 cvode.wasm present: yes   sim methods: ode, ssa
 dense-vs-sparse ODE comparison: ON (see the DENSE vs SPARSE section below)
==============================================================================

model                                     species    rxns    parse       gen      ode      ssa   heapMB
-------------------------------------------------------------------------------------------------------
chain_5 (baseline, unimolecular)                5       4      8.3       3.9      3.5      2.2      0.4
binding_AB (bimolecular)                        3       2      5.6       1.7      2.4      2.4      0.3
multisite_5 (2^5 species, combinatorial)       32     160     21.3      93.3     10.0     93.4      2.7
multisite_7 (2^7 species, combinatorial)      128     896      9.9     123.2     55.1     93.8      7.0

(all times in ms)

--- generation breakdown: chain_5 (baseline, unimolecular)  (gen wall 3.9 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation          0.3      7%         8     35.92
  findAllMaps                  0.2      5%        20      9.94
  speciesDedup                 0.1      1%         9      5.98
  canonicalize                 0.0      1%        10      2.31
  matchComponents              0.0      0%         5      1.32
  (instrumented sections account for 15% of gen wall; 771.1 µs/species, 963.9 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: binding_AB (bimolecular)  (gen wall 1.7 ms) ---
  section                       ms   % gen     calls   µs/call
  findAllMaps                  0.1      9%        11     13.44
  applyTransformation          0.1      8%         3     43.61
  speciesDedup                 0.0      2%         6      4.62
  canonicalize                 0.0      1%         6      1.96
  matchComponents              0.0      0%         6      0.44
  (instrumented sections account for 19% of gen wall; 566.4 µs/species, 849.7 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: multisite_5 (2^5 species, combinatorial)  (gen wall 93.3 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation         37.2     40%       320    116.23
  findAllMaps                 20.9     22%       320     65.25
  speciesDedup                 7.9      9%       161     49.34
  matchComponents              6.9      7%       176     39.09
  canonicalize                 0.4      0%        64      5.96
  (instrumented sections account for 79% of gen wall; 2914.9 µs/species, 583.0 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

--- generation breakdown: multisite_7 (2^7 species, combinatorial)  (gen wall 123.2 ms) ---
  section                       ms   % gen     calls   µs/call
  applyTransformation         51.7     42%      1792     28.83
  findAllMaps                 28.9     23%      1792     16.12
  matchComponents             10.7      9%       960     11.15
  speciesDedup                 9.1      7%       897     10.14
  canonicalize                 1.1      1%       256      4.48
  (instrumented sections account for 82% of gen wall; 962.3 µs/species, 137.5 µs/reaction; remainder = queue/bookkeeping/uninstrumented)

==============================================================================
 DENSE vs SPARSE ODE   (go/no-go on routing large models to cvode_sparse)
==============================================================================
 dense = engine default (cvode_jac, dense LU) ; sparse = explicit cvode_sparse

model                                     species     dense    sparse   speedup      maxAbs      maxRel  status
---------------------------------------------------------------------------------------------------------------
chain_5 (baseline, unimolecular)                5       3.5       5.2      0.7x      1.8e-7      1.2e-6  OK
binding_AB (bimolecular)                        3       2.4       2.9      0.8x      3.1e-7      3.4e-9  OK
multisite_5 (2^5 species, combinatorial)       32      10.0       8.5      1.2x      1.7e-6      2.5e-9  OK
multisite_7 (2^7 species, combinatorial)      128      55.1      29.1      1.9x      1.8e-6      2.7e-9  OK

 >>> cvode_sparse ran on all models. Worst relative trajectory diff: 1.2e-6 (agrees with dense).
     Best dense/sparse speedup observed: 1.9x.
     => Sparse is correct and faster: routing large mass-action models to cvode_sparse
        is a safe selection change (SimulationLoop.ts ~2636 / ~2618).
==============================================================================

==============================================================================
 WHERE THE TIME GOES (totals across all models)
==============================================================================

 phase totals (ms), biggest first:
   gen           222.0  42%
   ssa           191.7  36%
   ode            71.0  13%
   parse          45.2  9%

 within generation, biggest sinks (ms), biggest first:
   applyTransformation        89.3  40% of gen
   findAllMaps                50.1  23% of gen
   matchComponents            17.6  8% of gen
   speciesDedup               17.1  8% of gen
   canonicalize                1.6  1% of gen

 >>> Biggest phase overall: gen (222.0 ms).
 >>> Biggest generation sink: applyTransformation (40% of generation).
==============================================================================
