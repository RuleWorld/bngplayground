
import { BNGLParser } from '../src/services/graph/core/BNGLParser';
import { GraphCanonicalizer } from '../src/services/graph/core/Canonical';
import { generateExpandedNetwork } from '../services/simulation/NetworkExpansion';
import { BNGLModel } from '../types';

async function testExpansion() {
    const model: BNGLModel = {
        parameters: { k: 1, initA: 100 },
        moleculeTypes: [{ name: 'A', components: [] }],
        species: [
            { name: '@cell:A()', initialConcentration: 100, isConstant: false }
        ],
        observables: [
            { name: 'Atot', type: 'Molecules', pattern: 'A()' }
        ],
        reactionRules: [
            { name: 'R1', reactants: ['A()'], products: ['A()'], rate: 'k', isBidirectional: false }
        ],
        reactions: [],
        functions: [],
        compartments: [{ name: 'cell', dimension: 3, size: 1.0 }]
    };

    console.log('Generating expanded network...');
    const result = await generateExpandedNetwork(model, () => {}, (p) => {
        console.log(`Progress: ${p.species} species, ${p.reactions} reactions`);
    });

    console.log('--- Results ---');
    console.log('Species Count:', result.species.length);
    if (result.species.length > 0) {
        console.log('Species 0 Name:', result.species[0].name);
        console.log('Species 0 Conc:', result.species[0].initialConcentration);
    }

    const obs = (result as any).concreteObservables;
    console.log('Observables Count:', obs?.length);
    if (obs && obs.length > 0) {
        console.log('Observable 0 Name:', obs[0].name);
        console.log('Observable 0 Indices:', Array.from(obs[0].indices));
        console.log('Observable 0 Coefficients:', Array.from(obs[0].coefficients));
    }

    if (result.species[0].initialConcentration === 100 && obs[0].indices.length > 0) {
        console.log('VERIFICATION SUCCESSFUL: Concentration mapping and observables working.');
    } else {
        console.log('VERIFICATION FAILED!');
        if (result.species[0].initialConcentration !== 100) console.log('  Reason: Concentration not mapped (remained 0)');
        if (obs[0].indices.length === 0) console.log('  Reason: Observable indices empty');
    }
}

testExpansion();
