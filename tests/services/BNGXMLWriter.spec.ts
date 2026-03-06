import { describe, it, expect } from 'vitest';
import { BNGXMLWriter } from '@bngplayground/engine';
import { parseBNGL } from '../../services/parseBNGL';

describe('BNGXMLWriter', () => {
    it('should generate XML matching test_model.xml structure', () => {
        const bngl = `
begin parameters
    k1 100
end parameters
begin molecule types
    X(y, p~0~1)
end molecule types
begin seed species
    X(y, p~0) 5000
end seed species
begin reaction rules
    RR1: X(y, p~0) -> X(y, p~1) k1
end reaction rules
begin observables
    Molecules X0 X(p~0)
    Molecules X1 X(p~1)
end observables
        `;

        const model = parseBNGL(bngl);
        const xml = BNGXMLWriter.write(model);

        // Verify key structural elements from test_model.xml
        expect(xml).toContain('<model id="model">');
        
        // Parameters
        expect(xml).toContain('<ListOfParameters>');
        expect(xml).toContain('<Parameter id="k1" type="Constant" value="100" expr="100"/>');
        
        // Molecule Types
        expect(xml).toContain('<MoleculeType id="X">');
        expect(xml).toContain('<ComponentType id="p">');
        
        // Species
        expect(xml).toContain('<Species id="S1" concentration="5000" name="X(y,p~0)">');
        
        // Observables
        expect(xml).toContain('<Observable id="O1" name="X0" type="Molecules">');
        
        // Reaction Rules
        expect(xml).toContain('<ReactionRule id="RR1" name="RR1" symmetry_factor="1">');
        
        // RateLaw - Critical for NFsim crash fix verification
        // test_model.xml has: <RateLaw id="RR1_RateLaw" type="Ele" totalrate="0">
        expect(xml).toContain('totalrate="0"');
        expect(xml).toContain('type="Ele"');
        expect(xml).toContain('<RateConstant value="k1"/>');
        
        // Operations
        // test_model.xml has specific operations for state change? 
        // Wait, test_model.xml used Add/Delete for a state change rule?
        // "RR1: X(y, p~0) -> X(y, p~1) k1"
        // This is a state change. It should produce `StateChange`, NOT `Add`/`Delete` unless configured otherwise.
        // Let's check what BNGXMLWriter produces for this.
        // If it produces Add/Delete, that's mimicking BNGL behavior for "different templates".
        // But ideally it should produce StateChange.
        
        // In test_model.xml:
        /*
        <ListOfOperations>
          <Delete id="RP1_M1" DeleteMolecules="1"/>
          <Add id="PP1_M1"/>
        </ListOfOperations>
        */
        // This suggests the test_model.xml implemented it as Delete/Add? 
        // Or maybe my reading of test_model.xml was wrong?
        
    });
});
