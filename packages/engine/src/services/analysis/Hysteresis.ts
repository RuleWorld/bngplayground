import type { BNGLModel } from '../../types.js';
import { simulate } from '../simulation/SimulationLoop.js';

export interface HysteresisConfig {
    model: BNGLModel;
    expandedModel: BNGLModel;
    parameter: string;
    sweepRange: [number, number];
    steps: number;
    observable: string;
    method: 'ode' | 'ssa';
    tEnd: number;
    cloneExpandedModel: (m: BNGLModel) => BNGLModel;
    updateMassActionRates: (m: BNGLModel) => void;
}

export interface HysteresisResult {
    has_hysteresis: boolean;
    hysteresis_magnitude: number;
    hysteresis_region: { param: number; diff: number } | null;
    forward_curve: Array<{ param: number; value: number }>;
    backward_curve: Array<{ param: number; value: number }>;
    interpretation: string;
}

/**
 * Perform a parameter sweep forward and backward to detect and analyze hysteresis.
 */
export async function analyzeHysteresis(config: HysteresisConfig): Promise<HysteresisResult> {
    const {
        model,
        expandedModel,
        parameter,
        sweepRange: [minVal, maxVal],
        steps,
        observable,
        method,
        tEnd,
        cloneExpandedModel,
        updateMassActionRates,
    } = config;

    const forwardValues: number[] = [];
    const backwardValues: number[] = [];
    const paramValues: number[] = [];

    const stepSize = (maxVal - minVal) / (steps - 1);
    const obsName = observable || model.observables[0]?.name || '';
    if (!obsName) {
        throw new Error('No observables available in the model to analyze.');
    }

    // Forward sweep - carry state between parameter changes
    let currentState: Record<string, number> | null = null;
    let finalForwardState: Record<string, number> = {};

    for (let i = 0; i < steps; i++) {
        const paramValue = minVal + i * stepSize;
        paramValues.push(paramValue);

        const runModel = cloneExpandedModel(expandedModel);
        runModel.parameters[parameter] = paramValue;
        updateMassActionRates(runModel);

        // Carry state from previous step
        if (currentState) {
            for (const sp of runModel.species) {
                if (currentState[sp.name] !== undefined) {
                    sp.initialConcentration = currentState[sp.name];
                }
            }
        }

        const result = await simulate(0, runModel, {
            method,
            t_end: tEnd,
            n_steps: 50,
        }, {
            checkCancelled: () => {},
            postMessage: () => {},
        });

        const lastPoint = result.data[result.data.length - 1];

        // Save endpoint state for next step
        currentState = {};
        for (const key of Object.keys(lastPoint)) {
            if (key !== 'time') currentState[key] = Number(lastPoint[key]);
        }

        // Save final state for backward sweep initialization
        if (i === steps - 1) {
            finalForwardState = { ...currentState };
        }

        forwardValues.push(Number(lastPoint[obsName] ?? 0));
    }

    // Backward sweep - start from LAST forward state (not seed)
    currentState = finalForwardState;

    for (let i = 0; i < steps; i++) {
        const paramValue = minVal + (steps - 1 - i) * stepSize;

        const runModel = cloneExpandedModel(expandedModel);
        runModel.parameters[parameter] = paramValue;
        updateMassActionRates(runModel);

        // Use carried state from previous step (or final forward state for first step)
        for (const sp of runModel.species) {
            if (currentState[sp.name] !== undefined) {
                sp.initialConcentration = currentState[sp.name];
            }
        }

        const result = await simulate(0, runModel, {
            method,
            t_end: tEnd,
            n_steps: 50,
        }, {
            checkCancelled: () => {},
            postMessage: () => {},
        });

        const lastPoint = result.data[result.data.length - 1];

        // Save endpoint state for next step
        currentState = {};
        for (const key of Object.keys(lastPoint)) {
            if (key !== 'time') currentState[key] = Number(lastPoint[key]);
        }

        backwardValues.push(Number(lastPoint[obsName] ?? 0));
    }

    // Calculate hysteresis: max difference between forward and backward
    let maxDiff = 0;
    let hysteresisRegion: { param: number; diff: number } | null = null;

    for (let i = 0; i < forwardValues.length; i++) {
        const diff = Math.abs(forwardValues[i] - backwardValues[i]);
        if (diff > maxDiff) {
            maxDiff = diff;
            hysteresisRegion = { param: paramValues[i], diff };
        }
    }

    const scale = Math.max(...forwardValues.map(Math.abs), 1e-9);
    const normalizedDiff = maxDiff / scale;

    const hasHysteresis = normalizedDiff > 0.05;

    return {
        has_hysteresis: hasHysteresis,
        hysteresis_magnitude: normalizedDiff,
        hysteresis_region: hysteresisRegion,
        forward_curve: paramValues.map((p, i) => ({ param: p, value: forwardValues[i] })),
        backward_curve: paramValues.map((p, i) => ({ param: p, value: backwardValues[i] })),
        interpretation: hasHysteresis
            ? `Detected hysteresis (${(normalizedDiff * 100).toFixed(1)}% difference). The system shows history-dependent behavior - parameter changes produce different steady-states depending on sweep direction.`
            : 'No significant hysteresis detected - system behaves reversibly in parameter range.',
    };
}
