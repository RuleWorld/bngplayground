import { describe, it, expect } from 'vitest';
import { convertBNGXmlToBNGL } from '../../src/lib/atomizer/parser/bngXmlParser';

describe('BNG-XML Rate Law Parity', () => {
  it('should parse MM rate law from XML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level3/version1/core" level="3" version="1">
  <model id="test_model">
    <ListOfCompartments>
      <Compartment id="Nuc" size="10"/>
    </ListOfCompartments>
    <ListOfSpecies>
      <Species id="S1" name="A" compartment="Nuc" initialConcentration="100"/>
      <Species id="S2" name="B" compartment="Nuc" initialConcentration="10"/>
    </ListOfSpecies>
    <ListOfReactionRules>
      <ReactionRule name="R1">
        <ListOfReactantPatterns>
          <ReactantPattern id="RP1">
            <Molecule name="A" compartment="Nuc"/>
          </ReactantPattern>
          <ReactantPattern id="RP2">
            <Molecule name="B" compartment="Nuc"/>
          </ReactantPattern>
        </ListOfReactantPatterns>
        <ListOfProductPatterns>
           <ProductPattern id="PP1">
             <Molecule name="C" compartment="Nuc"/>
           </ProductPattern>
        </ListOfProductPatterns>
        <RateLaw type="MM">
          <RateConstant value="10"/> <!-- kcat -->
          <RateConstant value="5"/>  <!-- Km -->
        </RateLaw>
      </ReactionRule>
    </ListOfReactionRules>
  </model>
</sbml>`;

    const bngl = convertBNGXmlToBNGL(xml);
    console.log(bngl);

    // With fix, we expect scaling by compartment: MM(10, (5 * Nuc))
    // Note: NA is missing in parameters, so only Nuc is applied.
    expect(bngl).toContain('A()@Nuc + B()@Nuc -> C()@Nuc   MM(10,(5 * Nuc))');
  });

  it('should parse MM rate law with NA scaling from XML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level3/version1/core" level="3" version="1">
  <model id="test_model_na">
    <ListOfParameters>
      <Parameter id="NA" value="6.022e23"/>
    </ListOfParameters>
    <ListOfCompartments>
      <Compartment id="Nuc" size="10"/>
    </ListOfCompartments>
    <ListOfSpecies>
      <Species id="S1" name="A" compartment="Nuc"/>
    </ListOfSpecies>
    <ListOfReactionRules>
      <ReactionRule name="R1">
        <ListOfReactantPatterns>
          <ReactantPattern id="RP1">
            <Molecule name="A" compartment="Nuc"/>
          </ReactantPattern>
        </ListOfReactantPatterns>
        <ListOfProductPatterns>
           <ProductPattern id="PP1">
             <Molecule name="C" compartment="Nuc"/>
           </ProductPattern>
        </ListOfProductPatterns>
        <RateLaw type="MM">
          <RateConstant value="10"/> <!-- kcat -->
          <RateConstant value="5"/>  <!-- Km -->
        </RateLaw>
      </ReactionRule>
    </ListOfReactionRules>
  </model>
</sbml>`;

    const bngl = convertBNGXmlToBNGL(xml);

    // Expect scaling by compartment AND NA: MM(10, (5 * Nuc * NA))
    expect(bngl).toContain('A()@Nuc -> C()@Nuc   MM(10,(5 * Nuc * NA))');
  });
});
