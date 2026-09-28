import type { BNGLModel } from '../../types';
import { analyzePreparedModelUpdate, updatePreparedModel } from '@bngplayground/engine';

/** Whole-token check retained for callers that need identifier matching. */
export function expressionReferencesAny(expr: string, names: Set<string>): boolean {
  if (names.size === 0) return false;
  const tokens = expr.match(/[A-Za-z_][A-Za-z0-9_]*/g);
  return !!tokens?.some((token) => names.has(token));
}

/** Whether numeric updates can reuse the currently expanded topology. */
export function canReuseExpandedNetworkForOverrides(
  model: BNGLModel,
  overrides: Record<string, number>,
): boolean {
  return !analyzePreparedModelUpdate(model, overrides).topologyMayChange;
}

/** Compatibility wrapper; parameter update semantics live in the engine. */
export function applyParameterOverrides(
  cached: BNGLModel,
  overrides: Record<string, number>,
): BNGLModel {
  if (!overrides || Object.keys(overrides).length === 0) return cached;
  return updatePreparedModel(cached, overrides).model;
}
