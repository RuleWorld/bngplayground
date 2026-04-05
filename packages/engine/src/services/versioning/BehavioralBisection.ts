/**
 * BehavioralBisection.ts - Behavioral bisection over model version history
 *
 * Binary-searches the version DAG to find the exact model revision where a
 * qualitative behaviour (oscillation, steady state, observable threshold, etc.)
 * first appears or disappears.
 */

import type { SimulationResults } from '../../types';
import type { VersionDAG, ModelVersion } from './ModelVersionTracker';
import { getHistory, computeSemanticDiff } from './ModelVersionTracker';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PropertyType =
    | 'observable_value'
    | 'oscillates'
    | 'steady_state_reached'
    | 'custom';

export interface BehavioralProperty {
    type: PropertyType;
    /** Name of the observable to check (for observable_value) */
    observableName?: string;
    /** Time point to evaluate at (for observable_value) */
    timePoint?: number;
    /** Predicate for observable_value: above / below / between */
    predicate?: 'above' | 'below' | 'between';
    /** Threshold(s) for observable_value */
    threshold?: number;
    thresholdLow?: number;
    thresholdHigh?: number;
    /** Tolerance for steady_state_reached (fraction) */
    tolerance?: number;
    /** Custom test function */
    testFn?: (results: SimulationResults) => boolean;
}

export type Simulator = (code: string) => Promise<SimulationResults>;

export interface BisectionOptions {
    maxSteps?: number;
}

export interface BisectionResult {
    transitionFrom: ModelVersion;
    transitionTo: ModelVersion;
    steps: number;
    history: Array<{ versionId: string; result: boolean }>;
}

export interface ProgressInfo {
    step: number;
    totalEstimated: number;
    currentVersionId: string;
}

export interface DivergenceMetrics {
    maxAbsDifference: number;
    meanAbsDifference: number;
    rmseDifference: number;
    observableDivergences: Record<string, number>;
    diff: ReturnType<typeof computeSemanticDiff>;
}

export interface ComparisonResult {
    results1: SimulationResults;
    results2: SimulationResults;
    divergence: DivergenceMetrics;
}

/* ------------------------------------------------------------------ */
/*  testProperty                                                       */
/* ------------------------------------------------------------------ */

export function testProperty(
    results: SimulationResults,
    property: BehavioralProperty,
): boolean {
    switch (property.type) {
        case 'observable_value':
            return testObservableValue(results, property);
        case 'oscillates':
            return testOscillates(results);
        case 'steady_state_reached':
            return testSteadyState(results, property.tolerance ?? 0.01);
        case 'custom':
            if (property.testFn) return property.testFn(results);
            return false;
        default:
            return false;
    }
}

function testObservableValue(
    results: SimulationResults,
    property: BehavioralProperty,
): boolean {
    const { observableName, timePoint, predicate, threshold, thresholdLow, thresholdHigh } = property;
    if (!observableName || timePoint === undefined) return false;

    // Find the data column matching observableName
    const colIdx = results.headers.indexOf(observableName);
    if (colIdx < 0) return false;

    // Find closest time point
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < results.data.length; i++) {
        const t = results.data[i]['time'] ?? results.data[i][results.headers[0]];
        if (t === undefined) continue;
        const dist = Math.abs(t - timePoint);
        if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
        }
    }

    const value = results.data[bestIdx][observableName];
    if (value === undefined) return false;

    switch (predicate) {
        case 'above':
            return threshold !== undefined && value > threshold;
        case 'below':
            return threshold !== undefined && value < threshold;
        case 'between':
            return (
                thresholdLow !== undefined &&
                thresholdHigh !== undefined &&
                value >= thresholdLow &&
                value <= thresholdHigh
            );
        default:
            return false;
    }
}

function testOscillates(results: SimulationResults): boolean {
    // Check each non-time observable for oscillations via zero-crossings of derivative
    if (results.data.length < 3) return false;

    for (let col = 1; col < results.headers.length; col++) {
        const name = results.headers[col];
        const values: number[] = [];
        for (const row of results.data) {
            const v = row[name];
            if (v !== undefined) values.push(v);
        }
        if (values.length < 3) continue;

        // Compute derivative (finite differences)
        const deriv: number[] = [];
        for (let i = 1; i < values.length; i++) {
            deriv.push(values[i] - values[i - 1]);
        }

        // Count zero-crossings of derivative
        let crossings = 0;
        for (let i = 1; i < deriv.length; i++) {
            if ((deriv[i - 1] > 0 && deriv[i] < 0) || (deriv[i - 1] < 0 && deriv[i] > 0)) {
                crossings++;
            }
        }

        // More than 4 zero-crossings indicates oscillation
        if (crossings > 4) return true;
    }
    return false;
}

function testSteadyState(
    results: SimulationResults,
    tolerance: number,
): boolean {
    if (results.data.length < 2) return false;

    // Check that all observables' final values are within tolerance of a window average
    const n = results.data.length;
    const windowSize = Math.max(1, Math.floor(n * 0.1)); // last 10%

    for (let col = 1; col < results.headers.length; col++) {
        const name = results.headers[col];
        const values: number[] = [];
        for (const row of results.data) {
            const v = row[name];
            if (v !== undefined) values.push(v);
        }
        if (values.length < 2) continue;

        // Compute mean and max deviation in the final window
        const windowStart = values.length - windowSize;
        let sum = 0;
        for (let i = windowStart; i < values.length; i++) sum += values[i];
        const mean = sum / windowSize;

        if (Math.abs(mean) < 1e-15) continue; // skip near-zero observables

        let maxDev = 0;
        for (let i = windowStart; i < values.length; i++) {
            const dev = Math.abs(values[i] - mean) / Math.abs(mean);
            if (dev > maxDev) maxDev = dev;
        }

        if (maxDev > tolerance) return false;
    }
    return true;
}

/* ------------------------------------------------------------------ */
/*  bisectBehavior                                                     */
/* ------------------------------------------------------------------ */

export async function bisectBehavior(
    dag: VersionDAG,
    property: BehavioralProperty,
    simulator: Simulator,
    options?: BisectionOptions,
    onProgress?: (info: ProgressInfo) => void,
): Promise<BisectionResult> {
    const history = getHistory(dag);
    if (history.length < 2) {
        throw new Error('Version history must contain at least 2 versions for bisection.');
    }

    const maxSteps = options?.maxSteps ?? 50;
    const tested = new Map<string, boolean>();
    const testLog: Array<{ versionId: string; result: boolean }> = [];

    async function test(version: ModelVersion): Promise<boolean> {
        if (tested.has(version.id)) return tested.get(version.id)!;
        const results = await simulator(version.code);
        const pass = testProperty(results, property);
        tested.set(version.id, pass);
        testLog.push({ versionId: version.id, result: pass });
        return pass;
    }

    const totalEstimated = Math.ceil(Math.log2(history.length)) + 2;
    let stepCount = 0;

    function reportProgress(versionId: string): void {
        stepCount++;
        if (onProgress) {
            onProgress({ step: stepCount, totalEstimated, currentVersionId: versionId });
        }
    }

    // Test root and head
    reportProgress(history[0].id);
    const rootResult = await test(history[0]);

    reportProgress(history[history.length - 1].id);
    const headResult = await test(history[history.length - 1]);

    if (rootResult === headResult) {
        // No transition detected; return root->head as the "transition" with a note
        return {
            transitionFrom: history[0],
            transitionTo: history[history.length - 1],
            steps: stepCount,
            history: testLog,
        };
    }

    // Binary search
    let lo = 0;
    let hi = history.length - 1;

    while (hi - lo > 1 && stepCount < maxSteps) {
        const mid = Math.floor((lo + hi) / 2);
        reportProgress(history[mid].id);
        const midResult = await test(history[mid]);

        if (midResult === rootResult) {
            lo = mid;
        } else {
            hi = mid;
        }
    }

    return {
        transitionFrom: history[lo],
        transitionTo: history[hi],
        steps: stepCount,
        history: testLog,
    };
}

/* ------------------------------------------------------------------ */
/*  compareVersions                                                    */
/* ------------------------------------------------------------------ */

export async function compareVersions(
    dag: VersionDAG,
    id1: string,
    id2: string,
    simulator: Simulator,
    _options?: BisectionOptions,
): Promise<ComparisonResult> {
    const v1 = dag.versions.get(id1);
    const v2 = dag.versions.get(id2);
    if (!v1 || !v2) {
        throw new Error(`Version not found: ${!v1 ? id1 : id2}`);
    }

    const [results1, results2] = await Promise.all([
        simulator(v1.code),
        simulator(v2.code),
    ]);

    const diff = computeSemanticDiff(v1.code, v2.code);
    const divergence = computeDivergence(results1, results2, diff);

    return { results1, results2, divergence };
}

function computeDivergence(
    r1: SimulationResults,
    r2: SimulationResults,
    diff: ReturnType<typeof computeSemanticDiff>,
): DivergenceMetrics {
    // Align on common headers (excluding time)
    const commonHeaders = r1.headers.filter(
        h => h !== 'time' && r2.headers.includes(h),
    );

    let maxAbsDiff = 0;
    let sumAbsDiff = 0;
    let sumSqDiff = 0;
    let count = 0;
    const perObs: Record<string, number> = {};

    const len = Math.min(r1.data.length, r2.data.length);

    for (const hdr of commonHeaders) {
        let obsMax = 0;
        for (let i = 0; i < len; i++) {
            const v1 = r1.data[i][hdr];
            const v2 = r2.data[i][hdr];
            if (v1 === undefined || v2 === undefined) continue;
            const d = Math.abs(v1 - v2);
            if (d > maxAbsDiff) maxAbsDiff = d;
            if (d > obsMax) obsMax = d;
            sumAbsDiff += d;
            sumSqDiff += d * d;
            count++;
        }
        perObs[hdr] = obsMax;
    }

    const meanAbsDiff = count > 0 ? sumAbsDiff / count : 0;
    const rmse = count > 0 ? Math.sqrt(sumSqDiff / count) : 0;

    return {
        maxAbsDifference: maxAbsDiff,
        meanAbsDifference: meanAbsDiff,
        rmseDifference: rmse,
        observableDivergences: perObs,
        diff,
    };
}
