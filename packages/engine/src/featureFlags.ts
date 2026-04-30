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

  /**
   * Enable audited dynamic-code fast path for functional-rate expressions.
   *
   * SECURITY: when false (default), no dynamic code generation is used and
   * expression evaluation stays on the safe AST-evaluator path.
   * PERFORMANCE: when true, eligible expressions may use a validated
   * `new Function` fast path for hot-loop performance experiments.
   *
   * To enable at build/runtime, set `VITE_ENABLE_JIT_FAST_PATH=true`
   * (browser) or `ENABLE_JIT_FAST_PATH=true` (Node).
   */
  enableJitFastPath: boolean;

  /**
   * Enable conservation law ODE reduction.
   * When true, SimulationLoop computes conserved moieties after network
   * expansion, creates a reduced ODE system, solves it, then expands back
   * to full state. Reduces solver dimensionality for models with linear
   * conservation relations (common in signalling/enzymatic models).
   *
   * Default: false — SparseODESolver already uses this internally;
   * enabling it for the CVODE path requires careful integration testing.
   *
   * Enable with: setFeatureFlags({ conservationLawReduction: true })
   */
  conservationLawReduction: boolean;
}

function parseBooleanEnv(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === null) return undefined;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return undefined;
}

function resolveFlag(viteName: string, nodeName: string, defaultValue: boolean): boolean {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const viteValue = parseBooleanEnv(viteEnv?.[viteName]);
  if (viteValue !== undefined) return viteValue;

  const nodeValue = typeof process !== 'undefined'
    ? parseBooleanEnv(process.env?.[nodeName])
    : undefined;
  if (nodeValue !== undefined) return nodeValue;

  return defaultValue;
}

// Initialize from build-time environment (Vite). Default true after security hardening.
let FEATURE_FLAGS: FeatureFlags = {
  functionalRatesEnabled: resolveFlag('VITE_ENABLE_FUNCTIONAL_RATES', 'ENABLE_FUNCTIONAL_RATES', true),
  enableJitFastPath: resolveFlag('VITE_ENABLE_JIT_FAST_PATH', 'ENABLE_JIT_FAST_PATH', false),
  conservationLawReduction: false,
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
  if (typeof flags.enableJitFastPath !== 'undefined' && typeof flags.enableJitFastPath !== 'boolean') {
    throw new Error(`Invalid value for enableJitFastPath: ${flags.enableJitFastPath}. Must be a boolean.`);
  }

  const old = { ...FEATURE_FLAGS };
  FEATURE_FLAGS = { ...FEATURE_FLAGS, ...flags };
  if (
    old.functionalRatesEnabled !== FEATURE_FLAGS.functionalRatesEnabled ||
    old.enableJitFastPath !== FEATURE_FLAGS.enableJitFastPath
  ) {
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
