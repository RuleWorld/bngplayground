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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceSpeciesNames(formula: string, speciesIdByName: Map<string, string>): string {
  let result = formula;
  const entries = Array.from(speciesIdByName.entries()).sort((a, b) => b[0].length - a[0].length);

  for (const [name, id] of entries) {
    const escaped = escapeRegExp(name);
    const isWord = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
    const pattern = isWord ? new RegExp(`\\b${escaped}\\b`, 'g') : new RegExp(escaped, 'g');
    result = result.replace(pattern, id);
  }

  return result;
}

function expandRateMacroForSBML(rate: string, substrateId: string | null): string {
  if (!substrateId) return rate;
  const match = rate.match(/\b(Sat|MM|Hill)\s*\(([^)]*)\)/);
  if (!match) return rate;

  const macro = match[1];
  const args = match[2].split(',').map(arg => arg.trim()).filter(Boolean);
  if (args.length < 2) return rate;

  const vmax = args[0];
  const km = args[1];

  if (macro === 'Hill') {
    const n = args[2] || '1';
    return `((${vmax} * pow(${substrateId}, ${n})) / (pow(${km}, ${n}) + pow(${substrateId}, ${n})))`;
  }

  return `((${vmax} * ${substrateId}) / (${km} + ${substrateId}))`;
}

/**
 * Initialize libsbml for the writer
 */
async function ensureLibSBML() {
  if (!libsbml) {
    // @ts-ignore - Dynamic WASM import
    const libsbmlModule = await import('libsbmljs_stable');
    const factory = libsbmlModule.default || libsbmlModule.libsbml || libsbmlModule;
    const config: Record<string, unknown> = {
      locateFile: (file: string) => {
        if (file.endsWith('.wasm')) {
          if (typeof process !== 'undefined' && process.versions && process.versions.node) {
            return (config.__wasmPath as string) || file;
          }
          return '/bngplayground/libsbml.wasm';
        }
        if (file.endsWith('.wast') || file.endsWith('.asm.js')) {
          return 'data:application/octet-stream;base64,';
        }
        return file;
      }
    };
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const wasmPath = path.resolve(process.cwd(), 'public', 'libsbml.wasm');
        (config as any).__wasmPath = wasmPath;
        config.wasmBinary = new Uint8Array(fs.readFileSync(wasmPath));
      } catch (e) {
        console.warn('[sbmlWriter] Failed to preload libsbml.wasm:', e);
      }
    }

    libsbml = await factory(config);
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
  const speciesIdByName = new Map<string, string>();
  speciesList.forEach((s, i) => {
    const spec = sbmlModel.createSpecies();
    const sid = `s${i}`;
    spec.setId(sid);
    spec.setName(s.name);
    speciesIdByName.set(s.name, sid);
    
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

      const reactantCounts = new Map<string, number>();
      const productCounts = new Map<string, number>();
      for (const reactName of r.reactants) {
        reactantCounts.set(reactName, (reactantCounts.get(reactName) || 0) + 1);
      }
      for (const prodName of r.products) {
        productCounts.set(prodName, (productCounts.get(prodName) || 0) + 1);
      }

      const catalysts = new Set<string>();
      for (const [name, count] of reactantCounts) {
        if (productCounts.get(name) === count) {
          catalysts.add(name);
        }
      }

      const substrateName = r.reactants.find(name => !catalysts.has(name)) || r.reactants[0] || null;
      const substrateId = substrateName ? (speciesIdByName.get(substrateName) || null) : null;

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
      formula = replaceSpeciesNames(formula, speciesIdByName);
      formula = expandRateMacroForSBML(formula, substrateId);
      formula = replaceSpeciesNames(formula, speciesIdByName);
      // If the rate is a parameter name, it's fine. If it's a number, it's fine.
      // For more complex expressions, we should use MathML, but libsbml.setFormula handles infix.
      kl.setFormula(formula);
    });
  }

  const result = lib.writeSBMLToString(doc);
  doc.delete();
  
  return result;
}
