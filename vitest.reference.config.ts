import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
  test: {
    // Mirror BioNetGen's curated validation style:
    // run only reference-comparison suites against known fixtures/tools.
    include: [
      'tests/bng2-comparison.spec.ts',
      'tests/gdat-regression.spec.ts',
      'tests/nauty-canonicalization.spec.ts',
    ],
    exclude: [
      '**/node_modules/**',
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

