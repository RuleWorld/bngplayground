import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    exclude: [
      '**/node_modules/**',
      'tests/debug-*.{test,spec}.ts',
      'tests/*debug*.{test,spec}.ts',
      'tests/*Debug*.{test,spec}.ts',
      'tests/**/*debug*.{test,spec}.ts',
      'tests/**/*Debug*.{test,spec}.ts',
      'tests/**/*benchmark*.{test,spec}.ts',
      'tests/*isolated*.{test,spec}.ts',
      'tests/*repro*.{test,spec}.ts',
      'tests/*spawnsync*.{test,spec}.ts',
      'tests/examples_copy.spec.ts',
      'tests/polymer-sim.spec.ts',
      'tests/playwright/**/*.{test,spec}.ts',
      'tests/playwright/**/*.{test,spec}.tsx',
      'tests/*playwright*.spec.ts',
      'tests/validate_biomodels_list.spec.ts',
      'tests/wasm-direct-test.spec.ts',
      // Mirror the default CI gate exclusions for unstable suites under refactor.
      'tests/bngl-pattern-validation.spec.ts',
      'tests/functionalRatesSecurity.spec.ts',
      'tests/stat-factors.spec.ts',
      'tests/analysis/ContactMap.spec.ts',
      'tests/services/NetworkExpansion.spec.ts',
      'tests/VerifyJITPhase.spec.ts',
      'tests/diagnostics/stat3_simulation.spec.ts',
      'tests/graph/Canonicalization.spec.ts',
      'tests/services/ComponentCompletion.spec.ts',
      'tests/services/IntramolecularRules.spec.ts',
      'tests/constants.spec.ts',
      'tests/examples.spec.ts',
      'tests/ui/*.spec.tsx',
      'tests/services/XMLValidator.spec.ts',
      'tests/nfsim*.spec.ts',
      'tests/services/NFsim*.spec.ts',
    ],
    testTimeout: 300_000,
    hookTimeout: 60_000,
    pool: 'forks',
    sequence: {
      concurrent: false,
    },
    fakeTimers: {
      toFake: [],
    },
    deps: {
      interopDefault: true,
    },
    setupFiles: ['./tests/setup.ts'],
  },
});
