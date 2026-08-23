import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Dedicated config for the performance benchmark harness
// (tests/profile-everything.spec.ts).
//
// Why this file exists: the harness must NOT run in the normal gates
// (npm run test / test:fast / test:full:safe) — it is slow and, because it
// defaults to running ODE, it pulls CVODE/WASM into the otherwise-narrow fast
// suite and can reintroduce the shutdown hang. So it is added to the `exclude`
// lists in vitest.config.ts and vitest.full.config.ts. But vitest applies
// `exclude` even to explicitly-named files, so once excluded there it can only
// be run through a config that DOES include it — this one.
//
// Run it (hang-safe) via:
//   node scripts/run_full_tests.mjs --config vitest.profile.config.ts
// with the usual PROFILE_* env vars.

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      '@bngplayground/engine': resolve(__dirname, 'packages/engine/src'),
    },
  },
  test: {
    include: ['tests/profile-everything.spec.ts'],
    testTimeout: 900_000,
    hookTimeout: 120_000,
    pool: 'forks',
    sequence: { concurrent: false },
    fakeTimers: { toFake: [] },
    deps: { interopDefault: true },
    setupFiles: ['./tests/setup.ts'],
  },
});
