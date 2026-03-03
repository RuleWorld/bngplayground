import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
  test: {
    include: ['tests/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.tsx'],
    exclude: [
      '**/node_modules/**',
      'tests/debug-*.{test,spec}.ts',
      'tests/*isolated*.{test,spec}.ts',
      'tests/*repro*.{test,spec}.ts',
      'tests/*spawnsync*.{test,spec}.ts',
      'tests/*playwright*.spec.ts',
      'tests/validate_biomodels_list.spec.ts',
      'tests/wasm-direct-test.spec.ts',
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
