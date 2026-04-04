export interface NumberFormatOptions {
  /** Threshold above which scientific notation is used (default: 1e6) */
  sciUpperThreshold?: number;
  /** Threshold below which scientific notation is used (default: 1e-3) */
  sciLowerThreshold?: number;
  /** Decimal places for scientific notation (default: undefined = full precision) */
  sciPrecision?: number;
  /** Decimal places for fixed notation (default: undefined = toString) */
  fixedPrecision?: number;
  /** Value to return for non-finite numbers (default: '0') */
  nonFiniteValue?: string;
}

/**
 * Format a number with configurable thresholds and precision.
 */
export function formatNumber(value: number, opts: NumberFormatOptions = {}): string {
  if (!Number.isFinite(value)) return opts.nonFiniteValue ?? '0';

  const upper = opts.sciUpperThreshold ?? 1e6;
  const lower = opts.sciLowerThreshold ?? 1e-3;

  if (Math.abs(value) > upper || (Math.abs(value) < lower && value !== 0)) {
    return opts.sciPrecision !== undefined
      ? value.toExponential(opts.sciPrecision)
      : value.toExponential();
  }

  if (opts.fixedPrecision !== undefined) {
    return value.toFixed(opts.fixedPrecision);
  }

  // For normal-sized numbers, use fixed notation
  const str = String(value);
  // Remove unnecessary trailing zeros after decimal point
  return str.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

/** Preset: BNGL file output (full precision, wide thresholds) */
export const formatNumberBNGL = (v: number) => formatNumber(v, {
  sciUpperThreshold: 1e6,
  sciLowerThreshold: 1e-3,
});

/** Preset: UI display (2 sci decimals, 3 fixed decimals, tighter thresholds) */
export const formatNumberDisplay = (v: number) => formatNumber(v, {
  sciUpperThreshold: 1000,
  sciLowerThreshold: 1,
  sciPrecision: 2,
  fixedPrecision: 3,
});
