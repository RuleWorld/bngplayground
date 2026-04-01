import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@bngplayground/engine': resolve(__dirname, 'packages/engine/src'),
    },
  },
  test: {
    // Native parity suites that still invoke BNG2.pl directly or validate WASM loading.
    // Direct web_output-vs-fixture GDAT comparison now lives in `npm run test:reference`.
    include: [
      'tests/bng2-comparison.spec.ts',
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