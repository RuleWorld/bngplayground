
import { readFileSync, writeFileSync } from 'fs';
import { parseBNGL } from '../services/parseBNGL';
import { generateExpandedNetwork } from '../services/simulation/NetworkExpansion';

async function main() {
    const bnglText = readFileSync('example-models/complement-activation-cascade.bngl', 'utf8');
    let model = parseBNGL(bnglText);
    model = await generateExpandedNetwork(model, () => {}, (p) => {});
    
    const output = {
        species: model.species.map(s => s.name),
        reactions: model.reactions.map(r => ({
            reactants: r.reactants,
            products: r.products,
            rate: r.rateConstant,
            isFunc: r.isFunctionalRate,
            expr: r.rateExpression
        }))
    };
    
    writeFileSync('artifacts/diagnostics/complement_network_dump.json', JSON.stringify(output, null, 2));
    console.log('Dumped network to artifacts/diagnostics/complement_network_dump.json');
}

main().catch(console.error);
