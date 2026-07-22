import type { BNGLModel } from '../../types';
import type { ExpandedNetwork } from '../../interfaces/SimulationEngine';
import { inferReactionSBO, SBO } from './SBOAnnotations';
import { generateMIRIAMBlock, suggestMIRIAMAnnotations } from './MIRIAMAnnotation';
import { escapeXml } from '../../utils/xmlUtils';
import { infixToContentMathML } from '../../utils/infixToMathML';

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
      .map(c => `      <compartment id="${escapeXml(c.name)}" size="${c.size !== undefined && c.size !== null ? c.size : 1}" constant="true"${sboAttr('SBO:0000290')}/>`)
      .join('\n');

    const speciesList = network ? network.species : model.species || [];
    const speciesXml = speciesList.map(s => {
        const name = s.name;
        // Clean name for ID
        const cleanId = this.toSBMLId(name);
        // Infer SBO based on name/context: defaulting to protein if not small chem
        const sbo = name.toUpperCase().includes('ATP') || name.toUpperCase().includes('CA') ? SBO.SIMPLE_CHEMICAL : SBO.PROTEIN;
        
        const annotations = options.includeAnnotations ? generateMIRIAMBlock(cleanId, suggestMIRIAMAnnotations(name)) : '';
        
        return `      <species id="${cleanId}" name="${escapeXml(name)}" compartment="${model.compartments?.[0]?.name || 'default'}" initialConcentration="${s.initialConcentration || 0}" hasOnlySubstanceUnits="false" boundaryCondition="false" constant="false"${sboAttr(sbo)}>\n${annotations}\n      </species>`;
    }).join('\n');

    const parametersXml = Object.entries(model.parameters || {})
      .map(([name, val]) => `      <parameter id="${this.toSBMLId(name)}" name="${escapeXml(name)}" value="${val}" constant="true"${sboAttr('SBO:0000002')}/>`)
      .join('\n');

    const reactionsXml = this.generateReactions(model, network, options);

    return `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level3/version2/core" level="3" version="2">
  <model id="${this.toSBMLId(id)}" name="${escapeXml(id)}">
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

            // Kinetic law. A functional rate expression (Hill, saturable, TotalRate, …) is the FULL
            // propensity and must be emitted verbatim — NOT re-multiplied by reactant concentrations,
            // and NOT collapsed to mass-action (which silently changes the dynamics). For plain
            // mass-action, the SBML law is rate * [R1] * [R2] … . Prefer the string rate token
            // (usually a parameter name, preserving the reference) over the resolved constant; fall
            // back to the numeric constant only when no token is present. Note `|| ` on rateConstant
            // is unsafe because a legitimate 0 is falsy, so it is handled explicitly.
            // Kinetic law = (rate law) * [R1] * [R2] … . The engine's ODE RHS multiplies the rate
            // law (constant OR functional expression) by reactant concentrations for EVERY reaction
            // — TotalRate is folded upstream, not by skipping this product — so the SBML law, which
            // must be the full flux, does the same. The rate law is parenthesized so an expression
            // like `a - b` or `V/(K+S)` composes correctly with the reactant factors, and the whole
            // formula goes through the infix→MathML converter (the old split-on-'*' path produced an
            // invalid single <ci> for any operator-bearing functional rate). `rateConstant || rate`
            // is avoided because a legitimate 0 constant is falsy.
            // Functional rate: the rateExpression is the full functional form (e.g. Hill, Michaelis-Menten).
            // For functional rates, the expression IS the rate token; for mass-action, prefer the string
            // rate token (preserving a parameter-name reference like `k1`) over the numeric constant.
            const functional = r.isFunctionalRate === true
                && typeof r.rateExpression === 'string' && r.rateExpression.trim().length > 0;
            const rateToken = functional
                ? r.rateExpression!.trim()
                : (r.rate !== undefined && r.rate !== null && String(r.rate).trim().length > 0)
                    ? String(r.rate).trim()
                    : String(r.rateConstant ?? 0);
            const rNames = r.reactants.map(name => this.toSBMLId(name));
            const fullFlux = [`(${rateToken})`, ...rNames].join(' * ');
            let mathBody = this.exprToMathML(fullFlux);
            if (mathBody === null) mathBody = `<cn>${String(r.rateConstant ?? 0)}</cn>`; // last resort: valid MathML

            return `      <reaction id="${id}" reversible="false" fast="false"${sboAttr(sbo)}>
        <listOfReactants>
${reactants}
        </listOfReactants>
        <listOfProducts>
${products}
        </listOfProducts>
        <kineticLaw>
          <math xmlns="http://www.w3.org/1998/Math/MathML">
            ${mathBody}
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

  /** Content-MathML for an infix rate expression, or null if it cannot be parsed (never throws). */
  private static exprToMathML(expr: string): string | null {
    try {
      const body = infixToContentMathML(expr);
      return body && body.length > 0 ? body : null;
    } catch {
      return null;
    }
  }
}
