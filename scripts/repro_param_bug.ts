
import { parseBNGLStrict } from '../src/parser/BNGLParserWrapper';

const bngl = `
begin molecule types
  A(b)
end molecule types
begin seed species
  A(b) A0
end seed species
begin observables
  Molecules A A(b)
end observables
begin reaction rules
  A(b) -> 0 0.1
end reaction rules
begin parameters
  A0 100
end parameters
`;

try {
    const model = parseBNGLStrict(bngl);
    console.log('Parameters:', model.parameters);
    console.log('Seed Species:', model.species);
    if (model.species[0].initialConcentration === 100) {
        console.log('SUCCESS: Parameter A0 resolved to 100');
    } else {
        console.log('FAILURE: Parameter A0 resolved to', model.species[0].initialConcentration);
    }
} catch (e) {
    console.error('Error:', e);
}
