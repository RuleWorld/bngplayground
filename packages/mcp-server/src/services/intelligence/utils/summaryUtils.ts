import type {
    SobolSummary,
    FIMSummary,
    ProfileLikelihoodResult,
    StiffnessResult,
    DynamicsResult,
    CausalTraceEntry,
    DiagnosticSummary,
    UnreachableAnalysis,
} from '../types.js';

export function generateThreeRegisters(args: {
    sobol?: SobolSummary;
    fim?: FIMSummary;
    profileLikelihood?: ProfileLikelihoodResult;
    stiffness: StiffnessResult;
    dynamics: DynamicsResult;
    structure: { species: number; reactionRules: number; observables: number; parameters: number };
    mechanisticCausalTrace?: CausalTraceEntry[];
    unreachableAnalysis?: UnreachableAnalysis;
}): DiagnosticSummary {
    const parts = { technical: [] as string[], biological: [] as string[], strategic: [] as string[] };

    if (args.unreachableAnalysis && args.unreachableAnalysis.unreachableRules.length > 0) {
        parts.technical.push(`${args.unreachableAnalysis.unreachableRules.length} rules are unreachable from seed species: ${args.unreachableAnalysis.unreachableRules.join(', ')}.`);
        parts.strategic.push(`Consider adding seed species for unreachable rules, or remove dead rules to simplify the model.`);
    }

    if (args.stiffness.category !== 'benign') {
        parts.technical.push(`Stiffness ratio ${args.stiffness.ratio.toExponential(1)}, category: ${args.stiffness.category}.`);
        parts.biological.push(`Rate constants span ${Math.round(Math.log10(args.stiffness.ratio))} orders of magnitude — some reactions are much faster than others.`);
        parts.strategic.push(`Use an implicit solver (CVODE) for reliable integration.`);
    }

    if (args.sobol) {
        const topParam = args.sobol.topFirstOrder[0];
        if (topParam) {
            parts.technical.push(`Sobol S1(${topParam.name}) = ${topParam.value.toFixed(3)} on ${args.sobol.observable}.`);
            const trace = args.mechanisticCausalTrace?.find(t => t.parameter === topParam.name);
            const ruleMention = trace?.implicatedRules[0] ? ` via ${trace.implicatedRules[0]}` : '';
            parts.biological.push(`${topParam.name}${ruleMention} dominates the response of ${args.sobol.observable} — get this parameter right first.`);
            parts.strategic.push(`Prioritize measuring ${topParam.name}. It accounts for ${(topParam.value * 100).toFixed(0)}% of output variance.`);
        }
    }

    if (args.fim) {
        parts.technical.push(`FIM condition number ${args.fim.conditionNumber.toExponential(1)}.`);
        if (args.fim.unidentifiableParams.length > 0) {
            parts.technical.push(`Practically non-identifiable: ${args.fim.unidentifiableParams.join(', ')}.`);
            parts.biological.push(`Your data cannot distinguish different values of ${args.fim.unidentifiableParams.join(' and ')} — they trade off against each other.`);
            parts.strategic.push(`To resolve: measure a different observable, or fix one parameter from literature and fit the other.`);
        }
    }

    if (args.profileLikelihood) {
        const unidentifiableParams = Object.entries(args.profileLikelihood.profiles)
            .filter(([, profile]) => profile.identifiability !== 'identifiable')
            .map(([name]) => name);
        
        if (unidentifiableParams.length > 0) {
            parts.technical.push(`Profile likelihood identifies ${unidentifiableParams.length} unidentifiable parameters.`);
            parts.biological.push(`Your data fundamentally cannot distinguish different values of ${unidentifiableParams.join(' and ')} — no amount of refinement will resolve this.`);
            parts.strategic.push(`Consider fixing these parameters or designing new experiments targeting different observables.`);
        }
    }

    if (args.dynamics.likely_oscillatory) {
        parts.biological.push(`The model exhibits oscillatory behavior.`);
    }

    return {
        technical: parts.technical.join(' ') || 'No diagnostic issues detected.',
        biological: parts.biological.join(' ') || 'Model behavior appears straightforward.',
        strategic: parts.strategic.join(' ') || 'No specific action items.',
    };
}