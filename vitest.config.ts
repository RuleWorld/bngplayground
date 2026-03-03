import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
  test: {
    // Fast default suite for day-to-day development.
    // Heavy parity/integration/benchmark suites run via `npm run test:full`
    // or targeted `npx vitest run <file>`.
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],

    // Exclude local debugging / reproduction specs from the default run.
    // (These can be invoked explicitly via `npx vitest run <file>`.)
    exclude: [
      '**/node_modules/**',
      'tests/debug-*.{test,spec}.ts',
      'tests/*isolated*.{test,spec}.ts',
      'tests/*repro*.{test,spec}.ts',
      'tests/*spawnsync*.{test,spec}.ts',
      'tests/*sequential*.{test,spec}.ts',
      'tests/**/*parity*.{test,spec}.ts',
      'tests/**/*comparison*.{test,spec}.ts',
      'tests/**/*benchmark*.{test,spec}.ts',
      'tests/bng2-comparison.spec.ts',
      'tests/gdat-regression.spec.ts',
      'tests/examples.spec.ts',
      'tests/model-repository-validation.spec.ts',
      'tests/massive-parity.spec.ts',
      'tests/polymer-sim.spec.ts',
      'tests/nfsim*.spec.ts',
      'tests/services/NFsim*.spec.ts',
      'tests/atomizer/*.spec.ts',
      'tests/ui/editorpanel.spec.tsx',
      'tests/playwright/**/*.{test,spec}.ts',
      'tests/playwright/**/*.{test,spec}.tsx',
      'tests/*playwright*.spec.ts',
      'tests/validate_biomodels_list.spec.ts',
      'tests/wasm-direct-test.spec.ts',
      'tests/webgpu-solver.spec.ts',
      'tests/regulatoryTab.spec.tsx',
      'tests/constants.spec.ts',
      'tests/services/CompartmentalProcessor.spec.ts',
      'tests/services/XMLValidator.spec.ts',
      // WASM-dependent tests (CVODE doesn't load in Node.js)
      'tests/simulation/SimulationOptions.spec.ts',
      'tests/services/SimulationLoop.spec.ts',
      'tests/services/SparseODESolver.spec.ts',
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
