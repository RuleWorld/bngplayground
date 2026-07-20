import { BNGLModel } from '../../types';
import { extractMoleculeNames } from '../patterns/patternTokens';

function buildInitialMoleculeSet(model: BNGLModel): Set<string> {
    const molecules = new Set<string>();

    model.species.forEach((species) => {
        extractMoleculeNames(species.name).forEach((name) => molecules.add(name));
    });

    return molecules;
}

/**
 * Finds reaction rules that may never trigger because their reactants are not
 * reachable from the initial seed species.
 *
 * @param model - The BNGLModel to analyze.
 * @returns An array of labels (or names) of the unreachable rules.
 */
export function findUnreachableRules(model: BNGLModel): string[] {
    const knownMolecules = buildInitialMoleculeSet(model);
    const reachable = new Set<string>();
    const reactionRules = model.reactionRules ?? [];

    const ruleDescriptors = reactionRules.map((rule, index) => {
        const reactants = rule.reactants.flatMap(extractMoleculeNames);
        const products = rule.products.flatMap(extractMoleculeNames);
        const label = rule.name ?? `Rule ${index + 1}`;
        const id = rule.name ?? `rule_${index + 1}`;
        return { id, label, reactants, products };
    });

    let progress = true;
    while (progress) {
        progress = false;
        ruleDescriptors.forEach((descriptor) => {
            if (reachable.has(descriptor.id)) {
                return;
            }
            if (descriptor.reactants.length === 0 || descriptor.reactants.every((name) => knownMolecules.has(name))) {
                descriptor.products.forEach((name) => knownMolecules.add(name));
                reachable.add(descriptor.id);
                progress = true;
            }
        });
    }

    return ruleDescriptors
        .filter((descriptor) => !reachable.has(descriptor.id))
        .map((descriptor) => descriptor.label);
}
