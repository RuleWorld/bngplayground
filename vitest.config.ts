import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@bngplayground/engine': resolve(__dirname, 'packages/engine/src'),
      '@bngplayground/rulehub': resolve(__dirname, 'packages/rulehub/src'),
    },
  },
  test: {
    // Fast default suite for day-to-day development.
    // Heavy parity/integration/benchmark suites run via `npm run test:full`
    // or targeted `npx vitest run <file>`.
    include: [
      'tests/**/*.{test,spec}.{ts,tsx}',
      'src/**/*.{test,spec}.{ts,tsx}',
      'packages/engine/tests/**/*.{test,spec}.ts',
      'packages/mcp-server/tests/**/*.{test,spec}.ts'
    ],

    // Exclude local debugging / reproduction specs from the default run.
    // (These can be invoked explicitly via `npx vitest run <file>`.)
    exclude: [
      '**/node_modules/**',
      'tests/debug-*.{test,spec}.ts',
      'tests/*debug*.{test,spec}.ts',
      'tests/*Debug*.{test,spec}.ts',
      'tests/**/*debug*.{test,spec}.ts',
      'tests/**/*Debug*.{test,spec}.ts',
      'tests/*isolated*.{test,spec}.ts',
      'tests/*repro*.{test,spec}.ts',
      'tests/*spawnsync*.{test,spec}.ts',
      'tests/*sequential*.{test,spec}.ts',
      'tests/**/*benchmark*.{test,spec}.ts',
      'tests/profile-everything.spec.ts',
      'tests/gdat-regression.spec.ts',
      'tests/examples.spec.ts',
      'tests/examples_copy.spec.ts',
'tests/model-repository-validation.spec.ts',
       'tests/massive-parity.spec.ts',
       'tests/bng2-comparison.spec.ts',
      'tests/parity-polymer-wasm.spec.ts',
      'tests/polymer-sim.spec.ts',
      'tests/nfsim*.spec.ts',
      'tests/services/NFsim*.spec.ts',
      'tests/ui/editorpanel.spec.tsx',
'tests/playwright/**/*.{test,spec}.ts',
       'tests/playwright/**/*.{test,spec}.tsx',
       'tests/*playwright*.spec.ts',
       'tests/a11y/**/*.{test,spec}.ts',
      'tests/validate_biomodels_list.spec.ts',
      'tests/wasm-direct-test.spec.ts',
      'tests/webgpu-solver.spec.ts',
      'tests/regulatoryTab.spec.tsx',
      'tests/constants.spec.ts',
      // diagnostic benchmarks are slow and not part of the fast suite
      'src/*benchmark*.test.ts',
      'src/diagnostic_benchmark.test.ts',
      'tests/diagnostic_feature_flags.spec.ts',
       'tests/functionalRatesSecurity.spec.ts',
       'tests/parser/ExpressionEvaluation.test.ts',
       'tests/parser/RateLawCompatibility.spec.ts',
       'tests/services/paramUtils.spec.ts',
       'tests/services/ConservationLaws.spec.ts',
       'tests/services/projectedNM.spec.ts',
       'tests/services/SparseLUSolver.spec.ts',
       'tests/services/sbplx.spec.ts',
       'tests/services/CompartmentalProcessor.spec.ts',
       'tests/services/XMLValidator.spec.ts',
       'tests/safeExpressionEvaluator.spec.ts',
       // WASM-dependent tests (CVODE doesn't load in Node.js)
       'tests/simulation/SimulationOptions.spec.ts',
       'tests/services/SimulationLoop.spec.ts',
       'tests/services/SparseODESolver.spec.ts',
       // Flaky/non-deterministic integration specs currently under active refactor.
       // Keep them runnable directly, but exclude from the default CI-fast gate.
       'tests/bngl-pattern-validation.spec.ts',
       'tests/functionalRatesSecurity.spec.ts',
       'tests/stat-factors.spec.ts',
       // Tests requiring BNG2.pl / RuleHub models / native dependencies
       'tests/mwc_parity.spec.ts',
       'tests/polymer-compartment-parity.spec.ts',
       'src/parser_regression.test.ts',
       'tests/cbngl-cvode-parity.spec.ts',
       'tests/cbngl-volume-scale.spec.ts',
       'tests/lang_derivative_comparison.spec.ts',
       'tests/native-bytecode-cvode.spec.ts',
       'tests/parity-polymer.spec.ts',
       'tests/analysis/ContactMapRepro.spec.ts',
'tests/diagnostics/stat3_parity.spec.ts',
       'tests/parity-compartment.spec.ts',
       'tests/parity-zap.spec.ts',

       'tests/services/NetworkExpansion.spec.ts',
//      'tests/VerifyJITPhase.spec.ts',
      'tests/diagnostics/stat3_simulation.spec.ts',
      'tests/graph/Canonicalization.spec.ts',
      'tests/services/ComponentCompletion.spec.ts',
      'tests/services/IntramolecularRules.spec.ts',
    ],

    // Increase timeout to handle slow models
    testTimeout: 300_000,  // 5 minutes
    hookTimeout: 60_000,

    // Disable worker threads to avoid async issues
    pool: 'forks',

    // Run tests sequentially
    sequence: {
      concurrent: false,
    },

    // No fake timers - use real timers
    fakeTimers: {
      toFake: [],
    },

    // Handle CJS/ESM interop for cvode_loader
    deps: {
      interopDefault: true,
    },

    setupFiles: ['./tests/setup.ts'],
  },
});
