export function detectDiminishingReturns(
    sobolValues: Array<{ name: string; value: number }>,
    threshold: number = 0.01,
): { detected: boolean; message: string } | null {
    if (!sobolValues || sobolValues.length < 3) return null;

    const sorted = [...sobolValues].sort((a, b) => b.value - a.value);
    const top3 = sorted.slice(0, 3);
    
    if (top3.length < 2) return null;

    const first = top3[0].value;
    const second = top3[1].value;

    if (first < threshold) {
        return {
            detected: true,
            message: `All parameters have negligible sensitivity (<${threshold}). Model may be over-parameterized or observables insensitive.`,
        };
    }

    if (second / first < 0.05) {
        return {
            detected: true,
            message: `Diminishing returns: ${top3[0].name} dominates (S=${first.toFixed(3)}). Second parameter ${top3[1].name} contributes only ${(second/first*100).toFixed(1)}% of top sensitivity.`,
        };
    }

    return null;
}

function classifySensitiveParameters(
    firstOrder: Array<{ name: string; value: number }>,
    totalOrder: Array<{ name: string; value: number }>,
    threshold: number = 0.01,
): string[] {
    const sensitivityByParameter = new Map<string, number>();

    for (const entry of [...firstOrder, ...totalOrder]) {
        const current = sensitivityByParameter.get(entry.name) ?? 0;
        sensitivityByParameter.set(entry.name, Math.max(current, Math.abs(entry.value)));
    }

    return [...sensitivityByParameter.entries()]
        .filter(([, value]) => value >= threshold)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([name]) => name);
}

export function assessSensitivityConvergence(
    baseline: { firstOrder: Array<{ name: string; value: number }>; totalOrder: Array<{ name: string; value: number }> },
    followUp: { firstOrder: Array<{ name: string; value: number }>; totalOrder: Array<{ name: string; value: number }> },
    threshold: number = 0.01,
): {
    insightSaturated: boolean;
    baselineSensitive: string[];
    followUpSensitive: string[];
    changedParameters: string[];
} {
    const baselineSensitive = classifySensitiveParameters(baseline.firstOrder, baseline.totalOrder, threshold);
    const followUpSensitive = classifySensitiveParameters(followUp.firstOrder, followUp.totalOrder, threshold);
    const baselineSet = new Set(baselineSensitive);
    const followUpSet = new Set(followUpSensitive);

    const changedParameters = Array.from(new Set([...baselineSensitive, ...followUpSensitive]))
        .filter((name) => baselineSet.has(name) !== followUpSet.has(name))
        .sort((a, b) => a.localeCompare(b));

    return {
        insightSaturated: changedParameters.length === 0,
        baselineSensitive,
        followUpSensitive,
        changedParameters,
    };
}

export function detectCrosstalk(
    reactionRules: Array<{ reactants: string[]; products: string[]; name?: string }>,
    moleculeTypes: Array<{ name: string }>,
): Array<{ molecule: string; pathways: number; rules: string[]; warning: string }> {
    const moleculePathways: Record<string, { pathways: number; rules: Set<string> }> = {};
    
    for (const mol of moleculeTypes) {
        moleculePathways[mol.name] = { pathways: 0, rules: new Set() };
    }
    
    for (const rule of reactionRules) {
        const allMols = [...rule.reactants, ...rule.products];
        for (const molExpr of allMols) {
            const molName = molExpr.split('(')[0];
            if (moleculePathways[molName]) {
                moleculePathways[molName].pathways++;
                if (rule.name) {
                    moleculePathways[molName].rules.add(rule.name);
                }
            }
        }
    }
    
    const warnings: Array<{ molecule: string; pathways: number; rules: string[]; warning: string }> = [];
    
    for (const [mol, data] of Object.entries(moleculePathways)) {
        if (data.pathways >= 3) {
            warnings.push({
                molecule: mol,
                pathways: data.pathways,
                rules: Array.from(data.rules),
                warning: `${mol} participates in ${data.pathways} rules — potential crosstalk. Consider modularizing or adding compartment isolation.`,
            });
        }
    }
    
    return warnings.sort((a, b) => b.pathways - a.pathways).slice(0, 5);
}
