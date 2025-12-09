import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
  },
});
