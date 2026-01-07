/**
 * Feature flags for the BioNetGen web simulator.
 * Controls experimental or security-sensitive features at runtime.
 */
export interface FeatureFlags {
  /**
   * Enable/disable evaluation of functional rate expressions.
   * This involves executing arbitrary mathematical expressions via a
   * hardened jsep-based AST evaluator with strict function/constant allowlists.
   * Default: true (security hardening completed in Round 8/9).
   *
   * To disable at build time, set `VITE_ENABLE_FUNCTIONAL_RATES=false`.
   */
  functionalRatesEnabled: boolean;
}

// Initialize from build-time environment (Vite). Default true after security hardening.
let FEATURE_FLAGS: FeatureFlags = {
  functionalRatesEnabled: (typeof (import.meta as any).env !== 'undefined' &&
    String((import.meta as any).env.VITE_ENABLE_FUNCTIONAL_RATES) === 'false') ? false : true,
};

const cacheClearCallbacks: Array<() => void> = [];

/**
 * Returns a immutable snapshot of the current feature flags.
 */
export function getFeatureFlags(): FeatureFlags {
  return { ...FEATURE_FLAGS };
}

/**
 * Sets one or more feature flags at runtime.
 * Automatically triggers cache clearing if a security-sensitive flag is toggled.
 */
export function setFeatureFlags(flags: Partial<FeatureFlags>) {
  if (typeof flags.functionalRatesEnabled !== 'undefined' && typeof flags.functionalRatesEnabled !== 'boolean') {
    throw new Error(`Invalid value for functionalRatesEnabled: ${flags.functionalRatesEnabled}. Must be a boolean.`);
  }

  const old = { ...FEATURE_FLAGS };
  FEATURE_FLAGS = { ...FEATURE_FLAGS, ...flags };
  if (old.functionalRatesEnabled !== FEATURE_FLAGS.functionalRatesEnabled) {
    // If the state changes (enabled->disabled OR disabled->enabled), clear caches to be safe.
    // Spec says: "triggers cache clearing if a security-sensitive flag is toggled."
    for (const cb of cacheClearCallbacks) cb();
  }
}

/**
 * Registers a callback to be executed whenever security-sensitive flags are changed.
 * Used by the worker to invalidate potentially contaminated caches.
 * @returns Unsubscribe function to remove the callback (Issue #14 fix)
 */
export function registerCacheClearCallback(cb: () => void): () => void {
  cacheClearCallbacks.push(cb);
  return () => {
    const index = cacheClearCallbacks.indexOf(cb);
    if (index >= 0) cacheClearCallbacks.splice(index, 1);
  };
}
