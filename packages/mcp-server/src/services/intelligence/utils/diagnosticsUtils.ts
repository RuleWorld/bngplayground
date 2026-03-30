export function reachedSteadyState(samples: number[]): boolean {
    if (samples.length < 6) {
        return false;
    }

    const tail = samples.slice(-5);
    const start = tail[0];
    const end = tail[tail.length - 1];
    const delta = Math.abs(end - start);
    const scale = Math.max(1e-9, Math.abs(start), Math.abs(end));
    return delta / scale < 0.01;
}

export function detectOscillation(samples: number[]): boolean {
    if (samples.length < 8) {
        return false;
    }

    const mean = samples.reduce((acc, value) => acc + value, 0) / samples.length;
    const minValue = Math.min(...samples);
    const maxValue = Math.max(...samples);
    const amplitude = maxValue - minValue;
    const scale = Math.max(1e-9, Math.abs(mean));
    if (amplitude / scale < 0.05) {
        return false;
    }

    let signChanges = 0;
    let lastSign = 0;
    for (let i = 1; i < samples.length; i++) {
        const diff = samples[i] - samples[i - 1];
        const sign = diff > 0 ? 1 : diff < 0 ? -1 : 0;
        if (sign !== 0 && lastSign !== 0 && sign !== lastSign) {
            signChanges += 1;
        }
        if (sign !== 0) {
            lastSign = sign;
        }
    }

    return signChanges >= 4;
}

function pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    let cov = 0;
    let varX = 0;
    let varY = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - meanX;
        const dy = y[i] - meanY;
        cov += dx * dy;
        varX += dx * dx;
        varY += dy * dy;
    }
    return varX > 0 && varY > 0 ? cov / Math.sqrt(varX * varY) : 0;
}

export function detectSurprises(
    timeSeries: Array<Record<string, number>>,
    observableNames: string[],
    sobolSummary?: {
        firstOrder: Array<{ name: string; value: number }>;
        totalOrder: Array<{ name: string; value: number }>;
    },
    parameterRuleCounts?: Record<string, number>,
): Array<{ type: 'overshoot' | 'oscillation' | 'decorrelation' | 'insensitive_parameter' | 'unexpected_sensitivity'; description: string; observable?: string; parameter?: string }> {
    const surprises: Array<{ type: 'overshoot' | 'oscillation' | 'decorrelation' | 'insensitive_parameter' | 'unexpected_sensitivity'; description: string; observable?: string; parameter?: string }> = [];

    for (const obs of observableNames) {
        const values = timeSeries.map((row) => Number(row[obs] ?? 0));
        if (values.length < 4) continue;

        const first = values[0];
        const last = values[values.length - 1];
        const max = Math.max(...values);
        const min = Math.min(...values);
        const range = max - min;
        const scale = Math.max(1e-9, Math.abs(first), Math.abs(last));

        const maxIdx = values.indexOf(max);
        if (maxIdx > 0 && maxIdx < values.length - 1 && (max - last) > 0.2 * range && range / scale > 0.05) {
            surprises.push({
                type: 'overshoot',
                description: `Observable ${obs} overshoots at t=${timeSeries[maxIdx]?.time?.toFixed(1) ?? maxIdx} - peak ${max.toPrecision(3)} then settles to ${last.toPrecision(3)}.`,
                observable: obs,
            });
        }

        let signChanges = 0;
        for (let i = 2; i < values.length; i++) {
            const d1 = values[i - 1] - values[i - 2];
            const d2 = values[i] - values[i - 1];
            if (d1 * d2 < 0 && Math.abs(d1) > 0.01 * scale && Math.abs(d2) > 0.01 * scale) {
                signChanges++;
            }
        }
        if (signChanges >= 3 && range / scale > 0.05) {
            surprises.push({
                type: 'oscillation',
                description: `Observable ${obs} oscillates with ${signChanges} direction changes.`,
                observable: obs,
            });
        }

        if (range / scale < 0.001 && Math.abs(first) > 1e-6) {
            surprises.push({
                type: 'insensitive_parameter',
                description: `Observable ${obs} is effectively constant (range ${range.toExponential(1)} vs magnitude ${first.toExponential(1)}) - may not be informative.`,
                observable: obs,
            });
        }
    }

    if (sobolSummary) {
        const totalByName = new Map(sobolSummary.totalOrder.map((entry) => [entry.name, entry.value]));
        const rankedFirstOrder = [...sobolSummary.firstOrder].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

        for (const entry of rankedFirstOrder) {
            if (Math.abs(entry.value) < 0.01) {
                const ruleCount = parameterRuleCounts?.[entry.name] ?? 0;
                surprises.push({
                    type: 'insensitive_parameter',
                    description: ruleCount >= 2
                        ? `Parameter ${entry.name} appears in ${ruleCount} rule rates but contributes <1% variance.`
                        : `Parameter ${entry.name} contributes <1% variance but is included in the model - consider removing or constraining.`,
                    parameter: entry.name,
                });
            }
        }

        const topFirst = rankedFirstOrder[0];
        if (topFirst) {
            const total = totalByName.get(topFirst.name) ?? topFirst.value;
            if (Math.abs(topFirst.value) >= 0.1 && Math.abs(total - topFirst.value) <= 0.05) {
                surprises.push({
                    type: 'unexpected_sensitivity',
                    description: `Parameter ${topFirst.name} dominates variance with a mostly direct effect (S1=${topFirst.value.toFixed(3)}, ST=${total.toFixed(3)}).`,
                    parameter: topFirst.name,
                });
            }
        }
    }

    if (observableNames.length >= 2) {
        const midPoint = Math.floor(timeSeries.length / 2);
        const early = timeSeries.slice(0, midPoint);
        const late = timeSeries.slice(midPoint);

        let changes = 0;
        for (let i = 0; i < observableNames.length; i++) {
            for (let j = i + 1; j < observableNames.length; j++) {
                const obs1 = observableNames[i];
                const obs2 = observableNames[j];

                const earlyV1 = early.map((row) => Number(row[obs1] ?? 0));
                const earlyV2 = early.map((row) => Number(row[obs2] ?? 0));
                const lateV1 = late.map((row) => Number(row[obs1] ?? 0));
                const lateV2 = late.map((row) => Number(row[obs2] ?? 0));

                const earlyCorr = pearsonCorrelation(earlyV1, earlyV2);
                const lateCorr = pearsonCorrelation(lateV1, lateV2);

                if (Math.abs(earlyCorr - lateCorr) > 0.5) {
                    changes++;
                }
            }
        }

        if (changes > 0) {
            surprises.push({
                type: 'decorrelation',
                description: `${changes} observable pair(s) show decorrelation between early and late time phases - dynamics change over time.`,
            });
        }
    }

    return surprises.slice(0, 3);
}
