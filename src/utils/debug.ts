/**
 * Conditional debug logger that only logs when enabled.
 * Enable in browser console: localStorage.setItem('BNG_DEBUG', '1')
 * Or set window.__BNG_DEBUG = true
 */
const isDebugEnabled = (): boolean => {
  try {
    return (
      (globalThis as any).__BNG_DEBUG === true ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('BNG_DEBUG') === '1')
    );
  } catch {
    return false;
  }
};

export function createDebugLogger(prefix: string) {
  return (...args: unknown[]) => {
    if (isDebugEnabled()) {
      console.log(`[${prefix}]`, ...args);
    }
  };
}