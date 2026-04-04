
/**
 * Pure logic for Parameter Scan functionality.
 * Extracted from ParameterScanTab.tsx for testing.
 */

export const roundForInput = (value: number): string => {
    if (!Number.isFinite(value)) return '';
    const rounded = Math.round(value * 1e6) / 1e6;
    return rounded.toString();
};

export const DEFAULT_ZERO_DELTA = 0.1;

// Formatting helper shared with UI components. Uses scientific notation for
// magnitudes <1 or >1000, otherwise prints three decimal places.
export const formatNumber = (value: number): string => {
    if (!Number.isFinite(value)) return '0';
    if (Math.abs(value) > 1000 || (Math.abs(value) < 1 && value !== 0)) {
        return value.toExponential(2);
    }
    return value.toFixed(3);
};

// Returns a reasonable default scan range centered around `value`.
// Historically we simply used a ±10% window with a fixed delta for zero.
// Although it might be tempting to special‑case species, the UI already
// provides explicit start/end editable by the user, so keeping the logic
// uniform avoids unexpected surprises if we tweak it later.
export const computeDefaultBounds = (value: number): [number, number] => {
    if (!Number.isFinite(value) || value < 0) return [0, 0];

    if (value === 0) {
        return [0, DEFAULT_ZERO_DELTA];
    }
    const lower = Math.max(0, value * 0.9);  // p1 - 10%
    const upper = value * 1.1;               // p1 + 10%
    return [lower, upper];
};

export const generateRange = (start: number, end: number, steps: number, isLog = false): number[] => {
    // Edge case: Steps < 1 usually meaningless, return empty or start?
    // Original code returned [start] if steps <= 1
    if (steps <= 1) return [start];

    if (isLog) {
        // Log scale requires positive start/end; fall back to linear if invalid
        if (start <= 0 || end <= 0) {
            console.warn('Log scale requires positive start/end values. Falling back to linear.');
            // Fallthrough to linear
        } else {
            const logStart = Math.log10(start);
            const logEnd = Math.log10(end);
            const delta = (logEnd - logStart) / (steps - 1);
            return Array.from({ length: steps }, (_, index) => Number(Math.pow(10, logStart + index * delta).toPrecision(12)));
        }
    }

    const delta = (end - start) / (steps - 1);
    return Array.from({ length: steps }, (_, index) => Number((start + index * delta).toPrecision(12)));
};

export const validateScanSettings = (
    parameter: string,
    start: string,
    end: string,
    steps: string,
    isLog: boolean
): boolean => {
    if (!parameter) return false;
    const s = Number(start);
    const e = Number(end);
    const st = Number(steps);

    if (start === '' || end === '' || steps === '') return false;
    if (!Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(st)) return false;
    if (st < 1) return false;
    if (isLog && (s <= 0 || e <= 0)) return false;
    return true;
};
