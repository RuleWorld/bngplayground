// services/featureFlags.ts — backward-compatible re-export shim
// Singleton state now lives in @bngplayground/engine
export { getFeatureFlags, setFeatureFlags, registerCacheClearCallback } from '@bngplayground/engine';
// `FeatureFlags` type is exported by engine index now too; re-export for backward compatibility
export type { FeatureFlags } from '@bngplayground/engine';
