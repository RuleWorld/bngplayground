export type TrajectoryNormalization = 'robust' | 'zscore' | 'raw';

export interface TrajectoryRun {
    observables: Readonly<Record<string, readonly number[]>>;
}

export interface TrajectoryFeatureMatrixOptions {
    observableNames: readonly string[];
    observableWeights?: Readonly<Record<string, number>>;
    normalization?: TrajectoryNormalization;
    maxTimePoints?: number;
}

export interface TrajectoryFeatureMatrixResult {
    matrix: number[][];
    selectedObservableNames: string[];
    droppedObservableNames: string[];
    sampledTimePointCount: number;
}

const DEFAULT_MAX_TIME_POINTS = 128;
const EPSILON = 1e-12;

const mean = (values: readonly number[]): number => {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const standardDeviation = (values: readonly number[], center: number): number => {
    if (values.length === 0) return 1;
    const variance = values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length;
    return Math.sqrt(variance);
};

const quantile = (sortedValues: readonly number[], probability: number): number => {
    if (sortedValues.length === 0) return 0;
    const position = (sortedValues.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sortedValues[lower];
    const fraction = position - lower;
    return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * fraction;
};

const median = (values: readonly number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    return quantile(sorted, 0.5);
};

const robustCenterAndScale = (values: readonly number[]): { center: number; scale: number } => {
    const sorted = [...values].sort((a, b) => a - b);
    const center = quantile(sorted, 0.5);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;

    if (iqr > EPSILON) return { center, scale: iqr };

    const deviations = sorted.map(value => Math.abs(value - center));
    const mad = median(deviations);
    if (mad > EPSILON) return { center, scale: mad * 1.4826 };

    const standardScale = standardDeviation(values, center);
    return { center, scale: standardScale > EPSILON ? standardScale : 1 };
};

const centerAndScale = (
    values: readonly number[],
    normalization: TrajectoryNormalization
): { center: number; scale: number } => {
    if (normalization === 'raw') return { center: 0, scale: 1 };

    const center = normalization === 'zscore' ? mean(values) : median(values);
    const scale = normalization === 'zscore'
        ? standardDeviation(values, center)
        : robustCenterAndScale(values).scale;

    return { center, scale: scale > EPSILON ? scale : 1 };
};

const selectTimeIndices = (timePointCount: number, maxTimePoints: number): number[] => {
    if (timePointCount <= 0) return [];
    if (timePointCount <= maxTimePoints) {
        return Array.from({ length: timePointCount }, (_, index) => index);
    }

    const indices: number[] = [];
    for (let i = 0; i < maxTimePoints; i++) {
        const index = Math.round((i * (timePointCount - 1)) / (maxTimePoints - 1));
        if (indices[indices.length - 1] !== index) indices.push(index);
    }
    return indices;
};

const getTimePointCount = (
    runs: readonly TrajectoryRun[],
    observableNames: readonly string[]
): number => {
    for (const run of runs) {
        for (const name of observableNames) {
            const series = run.observables[name];
            if (series && series.length > 0) return series.length;
        }
    }
    return 0;
};

/**
 * Build a trajectory feature matrix for UMAP.
 *
 * Each observable is treated as a feature block. By default, robust scaling
 * removes count-unit dominance and the block is normalized by the number of
 * sampled time points so every selected observable has equal total weight.
 */
export const buildTrajectoryFeatureMatrix = (
    runs: readonly TrajectoryRun[],
    options: TrajectoryFeatureMatrixOptions
): TrajectoryFeatureMatrixResult => {
    const normalization = options.normalization ?? 'robust';
    const maxTimePoints = Math.max(2, Math.floor(options.maxTimePoints ?? DEFAULT_MAX_TIME_POINTS));
    const requestedNames = [...new Set(options.observableNames)];
    const timePointCount = getTimePointCount(runs, requestedNames);
    const timeIndices = selectTimeIndices(timePointCount, maxTimePoints);

    const selectedObservableNames: string[] = [];
    const droppedObservableNames: string[] = [];
    const statistics = new Map<string, { center: number; scale: number; weight: number }>();

    for (const name of requestedNames) {
        const values: number[] = [];
        for (const run of runs) {
            const series = run.observables[name] ?? [];
            for (const timeIndex of timeIndices) {
                const value = series[timeIndex];
                if (Number.isFinite(value)) values.push(value);
            }
        }

        const configuredWeight = Number(options.observableWeights?.[name] ?? 1);
        const weight = Number.isFinite(configuredWeight) ? Math.max(0, configuredWeight) : 0;
        if (values.length === 0 || weight <= 0) {
            droppedObservableNames.push(name);
            continue;
        }

        const { center, scale } = centerAndScale(values, normalization);
        selectedObservableNames.push(name);
        statistics.set(name, { center, scale, weight });
    }

    if (runs.length === 0 || selectedObservableNames.length === 0 || timeIndices.length === 0) {
        return {
            matrix: runs.map(() => []),
            selectedObservableNames,
            droppedObservableNames,
            sampledTimePointCount: timeIndices.length,
        };
    }

    const timeNormalization = Math.sqrt(1 / timeIndices.length);
    const matrix = runs.map(run => {
        const features: number[] = [];
        for (const name of selectedObservableNames) {
            const { center, scale, weight } = statistics.get(name)!;
            const featureWeight = Math.sqrt(weight) * timeNormalization;
            const series = run.observables[name] ?? [];
            for (const timeIndex of timeIndices) {
                const value = series[timeIndex];
                const normalized = Number.isFinite(value) ? (value - center) / scale : 0;
                features.push(normalized * featureWeight);
            }
        }
        return features;
    });

    return {
        matrix,
        selectedObservableNames,
        droppedObservableNames,
        sampledTimePointCount: timeIndices.length,
    };
};
