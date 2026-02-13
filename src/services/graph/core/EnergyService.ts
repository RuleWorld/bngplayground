import { SpeciesGraph } from './SpeciesGraph.ts';
import { GraphMatcher } from './Matcher.ts';
import { BNGLParser } from './BNGLParser.ts';
import type { BNGLEnergyPattern } from '../../../../types.ts';

/**
 * EnergyService handles calculation of species energies by matching
 * them against defined energy patterns.
 */
export class EnergyService {
    private patterns: { graph: SpeciesGraph; value: number; symmetry: number }[] = [];

    constructor(energyPatterns: BNGLEnergyPattern[]) {
        for (const ep of energyPatterns) {
            if (!ep.pattern || ep.value === undefined || isNaN(ep.value)) continue;
            try {
                const graph = BNGLParser.parseSpeciesGraph(ep.pattern);
                const symmetry = this.calculateSymmetryFactor(graph);
                this.patterns.push({ graph, value: ep.value, symmetry });
            } catch (e) {
                console.warn(`[EnergyService] Failed to parse pattern "${ep.pattern}":`, e);
            }
        }
    }

    /**
     * Calculate the total energy of a species graph based on energy patterns.
     */
    public calculateEnergy(species: SpeciesGraph): number {
        let totalEnergy = 0;
        for (const p of this.patterns) {
            const matches = GraphMatcher.findAllMaps(p.graph, species, { symmetryBreaking: false });
            if (matches.length > 0) {
                // Contribution = (n_embeddings / n_automorphisms) * energy_per_embedding
                totalEnergy += (matches.length / p.symmetry) * p.value;
            }
        }
        return totalEnergy;
    }

    /**
     * Calculate Delta G of a reaction (Sum G_products - Sum G_reactants)
     */
    public calculateDeltaG(reactants: SpeciesGraph | SpeciesGraph[], products: SpeciesGraph[]): number {
        const reactantList = Array.isArray(reactants) ? reactants : [reactants];
        const gReactants = reactantList.reduce((sum, g) => sum + this.calculateEnergy(g), 0);
        const gProducts = products.reduce((sum, g) => sum + this.calculateEnergy(g), 0);
        return gProducts - gReactants;
    }

    /**
     * Calculate the symmetry factor (number of automorphisms) of a graph.
     */
    private calculateSymmetryFactor(graph: SpeciesGraph): number {
        const selfMatches = GraphMatcher.findAllMaps(graph, graph, { symmetryBreaking: false });
        return selfMatches.length || 1;
    }
}
