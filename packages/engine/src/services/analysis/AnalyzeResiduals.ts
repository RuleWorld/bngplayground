import type { SimulationResults } from '../../types.js';

export interface ExperimentalDataPoint {
    time: number;
    observables: Record<string, number>;
}

export interface ResidualAnalysisResult {
    by_observable: Record<string, {
        times: number[];
        observed: number[];
        simulated: number[];
        residuals: number[];
        statistics: {
            sse: number;
            mse: number;
            rmse: number;
            r_squared: number;
        };
    }>;
    overall: {
        sse: number;
        rmse: number;
        n_points: number;
    };
    diagnostics: {
        residual_mean: number;
        residual_std: number;
        skewness: number;
        normality_hint: string;
    };
    interpretation: string;
}

export function analyzeResiduals(
    simResult: SimulationResults,
    experimentalData: ExperimentalDataPoint[],
    tEnd: number
): ResidualAnalysisResult {
    const timePoints = experimentalData.map(d => d.time);

    const residualsByObservable: ResidualAnalysisResult['by_observable'] = {};

    const observableNames = Object.keys(experimentalData[0]?.observables ?? {});

    for (const obsName of observableNames) {
        const observed: number[] = [];
        const simulated: number[] = [];
        const residuals: number[] = [];

        for (const expPoint of experimentalData) {
            const obsValue = expPoint.observables[obsName] ?? 0;
            observed.push(obsValue);

            // Linear interpolation of simulation
            const simData = simResult.data;
            let simValue = 0;

            for (let i = 0; i < simData.length - 1; i++) {
                const t1 = i * (tEnd / (simData.length - 1));
                const t2 = (i + 1) * (tEnd / (simData.length - 1));
                if (expPoint.time >= t1 && expPoint.time <= t2) {
                    const v1 = Number(simData[i][obsName] ?? 0);
                    const v2 = Number(simData[i + 1][obsName] ?? 0);
                    const frac = (expPoint.time - t1) / (t2 - t1);
                    simValue = v1 + frac * (v2 - v1);
                    break;
                }
            }

            simulated.push(simValue);
            residuals.push(obsValue - simValue);
        }

        const sse = residuals.reduce((sum, r) => sum + r * r, 0);
        const mse = sse / residuals.length;
        const rmse = Math.sqrt(mse);

        // R-squared calculation
        const meanObs = observed.reduce((a, b) => a + b, 0) / observed.length;
        const ssTot = observed.reduce((sum, v) => sum + Math.pow(v - meanObs, 2), 0);
        const rSquared = ssTot > 0 ? 1 - sse / ssTot : 0;

        residualsByObservable[obsName] = {
            times: timePoints,
            observed,
            simulated,
            residuals,
            statistics: {
                sse,
                mse,
                rmse,
                r_squared: rSquared,
            },
        };
    }

    // Overall statistics
    const allResiduals = Object.values(residualsByObservable).flatMap(r => r.residuals);
    const overallSSE = allResiduals.reduce((sum, r) => sum + r * r, 0);
    const overallRMSE = Math.sqrt(overallSSE / allResiduals.length);

    // Normality check (simple skewness)
    const mean = allResiduals.reduce((a, b) => a + b, 0) / allResiduals.length;
    const std = Math.sqrt(allResiduals.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / allResiduals.length);
    const skewness = std > 0
        ? allResiduals.reduce((sum, r) => sum + Math.pow((r - mean) / std, 3), 0) / allResiduals.length
        : 0;

    const interpretation = overallRMSE < 0.1 * Math.max(...Object.values(residualsByObservable).flatMap(r => r.observed))
            ? 'Good fit - model captures experimental data well'
            : overallRMSE < 0.5 * Math.max(...Object.values(residualsByObservable).flatMap(r => r.observed))
            ? 'Moderate fit - some model mismatch observed'
            : 'Poor fit - model may be missing key mechanisms or have structural issues';

    return {
        by_observable: residualsByObservable,
        overall: {
            sse: overallSSE,
            rmse: overallRMSE,
            n_points: allResiduals.length,
        },
        diagnostics: {
            residual_mean: mean,
            residual_std: std,
            skewness,
            normality_hint: Math.abs(skewness) < 0.5
                ? 'Residuals appear approximately symmetric'
                : Math.abs(skewness) > 1
                ? 'Residuals are highly skewed - consider model structure issues'
                : 'Residuals show moderate asymmetry',
        },
        interpretation,
    };
}
