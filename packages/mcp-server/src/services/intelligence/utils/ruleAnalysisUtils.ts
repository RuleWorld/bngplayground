import type { IrreversibleStep } from '../types.js';
import { extractMoleculeNames } from './graphUtils.js';

export function getMoleculeCounts(side: string): Map<string, number> {
    const counts = new Map<string, number>();
    const tokens = side.split('+').map((token) => token.trim()).filter(Boolean);
    for (const token of tokens) {
        const moleculeMatch = token.match(/^([A-Za-z][A-Za-z0-9_]*)\(/);
        if (!moleculeMatch) {
            continue;
        }
        const name = moleculeMatch[1];
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
}

export function inferConservationHints(ruleLines: string[]): string[] {
    const hints: string[] = [];
    for (const line of ruleLines) {
        const normalized = line.replace(/\s+/g, ' ').trim();
        const noLabel = normalized.replace(/^[^:]+:\s*/, '');
        const split = noLabel.split('->');
        if (split.length !== 2 || noLabel.includes('<->')) {
            continue;
        }

        const left = getMoleculeCounts(split[0]);
        const rightSide = split[1].replace(/\s+[A-Za-z0-9_.]+\s*$/, '');
        const right = getMoleculeCounts(rightSide);
        if (left.size === 0 || right.size === 0) {
            continue;
        }

        const allNames = new Set<string>([...left.keys(), ...right.keys()]);
        const conserved = [...allNames].every((name) => (left.get(name) ?? 0) === (right.get(name) ?? 0));
        if (conserved) {
            hints.push(`Potential moiety-conserving transformation: ${normalized}`);
        }
        if (hints.length >= 3) {
            break;
        }
    }
    return hints;
}

export function detectIrreversibleSteps(
    reactionRules: Array<{ name?: string; isBidirectional: boolean; reactants: string[]; products: string[]; rate: string }>
): IrreversibleStep[] {
    const irreversibleSteps: IrreversibleStep[] = [];

    for (const rule of reactionRules) {
        if (rule.isBidirectional) continue;
        const reactantMols = rule.reactants.flatMap(extractMoleculeNames);
        const productMols = rule.products.flatMap(extractMoleculeNames);
        const lost = reactantMols.filter(m => !productMols.includes(m));
        if (lost.length > 0 && irreversibleSteps.length < 5) {
            irreversibleSteps.push({
                rule: rule.name ?? 'unnamed',
                type: 'degradation',
                controllingParameters: [rule.rate],
                note: `Irreversible loss of ${lost.join(', ')}. This is a switch, not a knob.`,
            });
        }
    }

    return irreversibleSteps;
}