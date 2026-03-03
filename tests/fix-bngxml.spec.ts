
import { describe, it, expect } from 'vitest';
import { BNGXMLWriter } from '../services/simulation/BNGXMLWriter';
import { BNGLParser } from '../packages/engine/src/services/graph/core/BNGLParser';
import * as fs from 'fs';

describe('BNGXMLWriter Fixes', () => {
    it('should generate valid XML for degradation rules with dead molecule', () => {
        const simpleModel = {
            name: "Model_ZAP_Simple",
            moleculeTypes: [
                { name: "Zeta", components: ["ITAM1~U~PP", "receptor"] },
                { name: "A", components: ["State~uSYK~pSYK", "CBL"] },
                { name: "CBL", components: ["site"] },
                { name: "dead", components: [] }
            ],
            parameters: { kdl: 0.01 },
            observables: [
                { name: "tot_bound_SHP", pattern: "A(CBL!+)" },
                { name: "junk", pattern: "A(), B()" }
            ],
            species: [
                { name: "Zeta(ITAM1~U,receptor)", initialConcentration: 100 },
                { name: "A(State~uSYK,CBL)", initialConcentration: 100 },
                { name: "CBL(site)", initialConcentration: 100 }
            ],
            reactionRules: [
                {
                    name: "CBL_degrade_ITAM1",
                    reactants: ["Zeta(ITAM1!1).A(State!1,CBL!2).CBL(site!2)"],
                    products: ["dead()"],
                    rate: "kdl",
                    deleteMolecules: false
                }
            ],
            compartments: []
        };

        const xml = BNGXMLWriter.write(simpleModel as any);
        fs.writeFileSync('debug_model_zap_fixed.xml', xml);
        
        // Check for self-closing tags
        expect(xml).toContain('<MoleculeType id="dead"/>');
        expect(xml).toContain('<Molecule id="RR1_PP1_M1" name="dead">');
        
        // Check that junk molecule type is NOT added
        expect(xml).not.toContain('id="A(), B()"');
        // Check that A and B are added as separate types
        expect(xml).toContain('<MoleculeType id="A">');
        expect(xml).toContain('<MoleculeType id="B"/>');

        fs.writeFileSync("debug_model_zap_fixed.xml", xml);
    });
});
