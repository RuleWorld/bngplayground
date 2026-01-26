/**
 * SBML Writer Module
 * Generates SBML Level 3 Version 2 model strings from BNGL model structures
 */

import { BNGLModel } from '../config/types';
import { logger } from '../utils/helpers';

// LibSBML type declarations for the writer
declare namespace LibSBML {
  interface SBMLWriter {
    writeSBMLToString(doc: SBMLDocument): string;
  }
  
  interface SBMLDocument {
    createModel(): Model;
    delete(): void;
  }
  
  interface Model {
    setId(id: string): void;
    setName(name: string): void;
    createCompartment(): Compartment;
    createSpecies(): Species;
    createParameter(): Parameter;
    createReaction(): Reaction;
    createFunctionDefinition(): FunctionDefinition;
  }
  
  interface Compartment {
    setId(id: string): void;
    setName(name: string): void;
    setSize(size: number): void;
    setConstant(constant: boolean): void;
    setSpatialDimensions(dims: number): void;
  }
  
  interface Species {
    setId(id: string): void;
    setName(name: string): void;
    setCompartment(compartment: string): void;
    setInitialConcentration(value: number): void;
    setInitialAmount(value: number): void;
    setHasOnlySubstanceUnits(value: boolean): void;
    setBoundaryCondition(value: boolean): void;
    setConstant(constant: boolean): void;
  }
  
  interface Parameter {
    setId(id: string): void;
    setName(name: string): void;
    setValue(value: number): void;
    setConstant(constant: boolean): void;
  }
  
  interface Reaction {
    setId(id: string): void;
    setName(name: string): void;
    setReversible(reversible: boolean): void;
    createReactant(): SpeciesReference;
    createProduct(): SpeciesReference;
    createKineticLaw(): KineticLaw;
  }
  
  interface SpeciesReference {
    setSpecies(species: string): void;
    setStoichiometry(stoichiometry: number): void;
    setConstant(constant: boolean): void;
  }
  
  interface KineticLaw {
    setFormula(formula: string): void;
  }
  
  interface FunctionDefinition {
    setId(id: string): void;
    setMath(math: any): void;
  }

  function writeSBMLToString(doc: SBMLDocument): string;
}

let libsbml: any = null;

/**
 * Initialize libsbml for the writer
 */
async function ensureLibSBML() {
  if (!libsbml) {
    // @ts-ignore - Dynamic WASM import
    const libsbmlModule = await import('libsbmljs_stable');
    libsbml = await libsbmlModule.default();
  }
  return libsbml;
}

/**
 * Generate SBML L3V2 string from a BNGL model
 */
export async function generateSBML(model: BNGLModel): Promise<string> {
  const lib = await ensureLibSBML();
  
  // Create SBML L3V2 document
  const doc = new lib.SBMLDocument(3, 2);
  const sbmlModel = doc.createModel();
  sbmlModel.setId(model.name?.replace(/\W/g, '_') || 'bngl_model');
  sbmlModel.setName(model.name || 'BioNetGen Export');

  // 1. Compartments
  if (model.compartments && model.compartments.length > 0) {
    for (const c of model.compartments) {
      const comp = sbmlModel.createCompartment();
      comp.setId(c.name);
      comp.setSpatialDimensions(c.dimension);
      comp.setSize(c.size);
      comp.setConstant(true);
    }
  } else {
    // Default compartment
    const comp = sbmlModel.createCompartment();
    comp.setId('default');
    comp.setSpatialDimensions(3);
    comp.setSize(1.0);
    comp.setConstant(true);
  }

  // 2. Parameters
  if (model.parameters) {
    for (const [id, val] of Object.entries(model.parameters)) {
      const param = sbmlModel.createParameter();
      param.setId(id);
      param.setValue(val);
      param.setConstant(true);
    }
  }

  // 3. Species
  const speciesList = model.species || [];
  speciesList.forEach((s, i) => {
    const spec = sbmlModel.createSpecies();
    const sid = `s${i}`;
    spec.setId(sid);
    spec.setName(s.name);
    
    // Determine compartment from name (e.g., @c0:A) or use first available/default
    let compId = 'default';
    if (s.name.startsWith('@')) {
      const match = s.name.match(/^@([^:]+):/);
      if (match) {
        compId = match[1];
      }
    } else if (model.compartments && model.compartments.length > 0) {
      compId = model.compartments[0].name;
    }
    
    spec.setCompartment(compId);
    spec.setInitialConcentration(s.initialConcentration || 0);
    spec.setBoundaryCondition(!!s.isConstant);
    spec.setConstant(false);
    spec.setHasOnlySubstanceUnits(false);
  });

  // 4. Reactions
  if (model.reactions) {
    model.reactions.forEach((r, i) => {
      const rxn = sbmlModel.createReaction();
      const rid = `r${i}`;
      rxn.setId(rid);
      rxn.setReversible(false);

      // Map reactants
      r.reactants.forEach(reactName => {
        const sIdx = speciesList.findIndex(s => s.name === reactName);
        if (sIdx >= 0) {
          const ref = rxn.createReactant();
          ref.setSpecies(`s${sIdx}`);
          ref.setStoichiometry(1);
          ref.setConstant(true);
        }
      });

      // Map products
      r.products.forEach(prodName => {
        const sIdx = speciesList.findIndex(s => s.name === prodName);
        if (sIdx >= 0) {
          const ref = rxn.createProduct();
          ref.setSpecies(`s${sIdx}`);
          ref.setStoichiometry(1);
          ref.setConstant(true);
        }
      });

      // Kinetic Law
      const kl = rxn.createKineticLaw();
      // Simple mass action formula for now
      let formula = r.rate || '0';
      // If the rate is a parameter name, it's fine. If it's a number, it's fine.
      // For more complex expressions, we should use MathML, but libsbml.setFormula handles infix.
      kl.setFormula(formula);
    });
  }

  const result = lib.writeSBMLToString(doc);
  doc.delete();
  
  return result;
}
