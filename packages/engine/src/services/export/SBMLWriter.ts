import type { BNGLModel } from '../../types';
import type { ExpandedNetwork } from '../../interfaces/SimulationEngine';
import { inferReactionSBO, inferRateLawSBO, SBO } from './SBOAnnotations';
import { generateMIRIAMBlock, suggestMIRIAMAnnotations } from './MIRIAMAnnotation';

/**
 * Configuration options dictating SBML file generation behavior.
 */
export interface SBMLWriterOptions {
  modelName?: string;
  includeAnnotations?: boolean;
  includeSBO?: boolean;
}

/**
 * Service responsible for exporting a BioNetGen reaction network to SBML Level 3 Version 2 format.
 *
 * Supports optionally enriching the generated SBML XML with standard SBO (Systems Biology Ontology)
 * terms and MIRIAM annotations for better interoperability with other systems biology tools.
 */
export class SBMLWriter {
  /**
   * Generates an SBML XML string representing the model.
   *
   * If an `ExpandedNetwork` is provided, it outputs concrete species and reactions with mass-action kinetics.
   * If only the abstract `BNGLModel` is provided, it outputs skeleton reactions corresponding to the rules.
   *
   * @param model - The abstract BNGL model definition.
   * @param network - (Optional) The expanded reaction network.
   * @param options - Output formatting and annotation options.
   * @returns A valid SBML XML string.
   */
  static write(
    model: BNGLModel,
    network?: ExpandedNetwork,
    options: SBMLWriterOptions = {},
  ): string {
    const id = options.modelName || model.name || 'model';
    const sboAttr = (term: string) => options.includeSBO ? ` sboTerm="${term}"` : '';

    const compartmentsXml = (model.compartments || [])
      .map(c => `      <compartment id="${this.escapeXml(c.name)}" size="${c.size || 1}" constant="true"${sboAttr('SBO:0000290')}/>`)
      .join('\n');

    const speciesList = network ? network.species : model.species || [];
    const speciesXml = speciesList.map(s => {
        const name = s.name;
        // Clean name for ID
        const cleanId = this.toSBMLId(name);
        // Infer SBO based on name/context: defaulting to protein if not small chem
        const sbo = name.toUpperCase().includes('ATP') || name.toUpperCase().includes('CA') ? SBO.SIMPLE_CHEMICAL : SBO.PROTEIN;
        
        const annotations = options.includeAnnotations ? generateMIRIAMBlock(cleanId, suggestMIRIAMAnnotations(name)) : '';
        
        return `      <species id="${cleanId}" name="${this.escapeXml(name)}" compartment="${model.compartments?.[0]?.name || 'default'}" initialConcentration="${s.initialConcentration || 0}" hasOnlySubstanceUnits="false" boundaryCondition="false" constant="false"${sboAttr(sbo)}>\n${annotations}\n      </species>`;
    }).join('\n');

    const parametersXml = Object.entries(model.parameters || {})
      .map(([name, val]) => `      <parameter id="${this.toSBMLId(name)}" name="${this.escapeXml(name)}" value="${val}" constant="true"${sboAttr('SBO:0000002')}/>`)
      .join('\n');

    const reactionsXml = this.generateReactions(model, network, options);

    return `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level3/version2/core" level="3" version="2">
  <model id="${this.toSBMLId(id)}" name="${this.escapeXml(id)}">
    <listOfCompartments>
${compartmentsXml || '      <compartment id="default" size="1" constant="true" sboTerm="SBO:0000290"/>'}
    </listOfCompartments>
    <listOfSpecies>
${speciesXml}
    </listOfSpecies>
    <listOfParameters>
${parametersXml}
    </listOfParameters>
    <listOfReactions>
${reactionsXml}
    </listOfReactions>
  </model>
</sbml>`;
  }

  private static generateReactions(model: BNGLModel, network?: ExpandedNetwork, options: SBMLWriterOptions = {}): string {
    const sboAttr = (term: string) => options.includeSBO ? ` sboTerm="${term}"` : '';
    
    // If we have an expanded network, use the reactions from it
    if (network) {
        return network.reactions.map((r, i) => {
            const id = `R${i + 1}`;
            const sbo = SBO.MASS_ACTION; // Network level reactions are mass action
            
            const reactants = r.reactants.map(name => `          <speciesReference species="${this.toSBMLId(name)}" stoichiometry="1" constant="true"/>`).join('\n');
            const products = r.products.map(name => `          <speciesReference species="${this.toSBMLId(name)}" stoichiometry="1" constant="true"/>`).join('\n');
            
            // Kinetic law: rate * [R1] * [R2] ...
            const rateStr = String(r.rateConstant || r.rate);
            const rNames = r.reactants.map(name => this.toSBMLId(name));
            const formula = [rateStr, ...rNames].join(' * ');

            return `      <reaction id="${id}" reversible="false" fast="false"${sboAttr(sbo)}>
        <listOfReactants>
${reactants}
        </listOfReactants>
        <listOfProducts>
${products}
        </listOfProducts>
        <kineticLaw>
          <math xmlns="http://www.w3.org/1998/Math/MathML">
            <apply>
              <times/>
              ${formula.split(' * ').map(p => this.isNumber(p) ? `<cn>${p}</cn>` : `<ci>${p}</ci>`).join('\n              ')}
            </apply>
          </math>
        </kineticLaw>
      </reaction>`;
        }).join('\n');
    }

    // Otherwise, generate skeleton reactions from rules (simplified)
    return (model.reactionRules || []).map((r, i) => {
        const id = this.toSBMLId(r.name || `RR${i + 1}`);
        const sbo = inferReactionSBO(r);
        return `      <reaction id="${id}" reversible="${r.isBidirectional}" fast="false"${sboAttr(sbo)}/>`;
    }).join('\n');
  }

  private static toSBMLId(name: string): string {
    return name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^([0-9])/, '_$1');
  }

  private static escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private static isNumber(s: string): boolean {
    return !isNaN(parseFloat(s)) && isFinite(Number(s));
  }
}
