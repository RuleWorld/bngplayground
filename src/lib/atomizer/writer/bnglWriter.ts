/**
 * BNGL Writer Module
 * Complete TypeScript port of bnglWriter.py
 * 
 * Generates BNGL model files from parsed SBML data
 */

import { Species, Molecule, Component, Rule, Action, Databases } from '../core/structures';
import {
  SBMLModel,
  SBMLReaction,
  SBMLParameter,
  SBMLCompartment,
  SBMLSpecies,
  SBMLFunctionDefinition,
  AtomizerOptions,
} from '../config/types';
import {
  standardizeName,
  convertMathFunction,
  cleanParameterValue,
  logger,
  TranslationException,
} from '../utils/helpers';
import { SCTEntry, SpeciesCompositionTable } from '../config/types';

// =============================================================================
// Math Expression Conversion
// =============================================================================

/**
 * Parse and convert a math expression to BNGL format
 */
export function bnglFunction(
  rule: string,
  functionTitle: string,
  reactants: string[],
  compartments: string[] = [],
  parameterDict: Map<string, number> = new Map(),
  reactionDict: Map<string, string> = new Map()
): string {
  let result = rule;

  // Convert comparison operators
  result = convertComparisonOperators(result);

  // Convert mathematical functions
  result = convertMathFunctions(result);

  // Handle piecewise functions
  result = convertPiecewise(result);

  // Handle lambda functions
  result = convertLambda(result);

  // Replace compartment references
  for (const comp of compartments) {
    const regex = new RegExp(`\\b${comp}\\b`, 'g');
    result = result.replace(regex, `__compartment_${comp}__`);
  }

  // Replace reaction references
  for (const [rxnId, rxnName] of reactionDict) {
    const regex = new RegExp(`\\b${rxnId}\\b`, 'g');
    result = result.replace(regex, `netflux_${rxnName}`);
  }

  // Clean up infinity and special values
  result = cleanParameterValue(result);

  return result;
}

/**
 * Convert comparison operators (gt, lt, geq, leq, eq, neq)
 */
function convertComparisonOperators(expr: string): string {
  const operators: Record<string, string> = {
    'gt': '>',
    'lt': '<',
    'geq': '>=',
    'leq': '<=',
    'eq': '==',
    'neq': '!=',
  };

  let result = expr;
  for (const [func, op] of Object.entries(operators)) {
    const regex = new RegExp(`${func}\\s*\\(\\s*([^,]+)\\s*,\\s*([^)]+)\\s*\\)`, 'g');
    result = result.replace(regex, `($1 ${op} $2)`);
  }

  return result;
}

/**
 * Convert mathematical functions (pow, sqrt, exp, log, etc.)
 */
function convertMathFunctions(expr: string): string {
  let result = expr;

  // Power function: pow(a, b) -> (a)^(b)
  result = result.replace(/pow\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '(($1)^($2))');

  // Square root: sqrt(x) -> (x)^(1/2)
  result = result.replace(/sqrt\s*\(\s*([^)]+)\s*\)/g, '(($1)^(1/2))');

  // Square: sqr(x) -> (x)^2
  result = result.replace(/sqr\s*\(\s*([^)]+)\s*\)/g, '(($1)^2)');

  // Root: root(n, x) -> (x)^(1/n)
  result = result.replace(/root\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '(($2)^(1/($1)))');

  // Exponential: exp(x) -> e^(x)
  result = result.replace(/\bexp\s*\(\s*([^)]+)\s*\)/g, '(2.71828182845905^($1))');

  // Ceiling and floor
  result = result.replace(
    /\bceil\s*\(\s*([^)]+)\s*\)/g,
    'min(rint(($1)+0.5),rint(($1)+1))'
  );
  result = result.replace(
    /\bfloor\s*\(\s*([^)]+)\s*\)/g,
    'min(rint(($1)-0.5),rint(($1)+0.5))'
  );

  // Logarithm: log(x) -> ln(x)
  result = result.replace(/\blog\s*\(/g, 'ln(');

  // Log base 10: log10(x) -> (ln(x)/ln(10))
  result = result.replace(/log10\s*\(\s*([^)]+)\s*\)/g, '(ln($1)/2.302585093)');

  // Absolute value
  result = result.replace(/\babs\s*\(\s*([^)]+)\s*\)/g, 'if($1>=0,$1,-($1))');

  // Boolean operators
  result = result.replace(/\band\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 && $2)');
  result = result.replace(/\bor\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 || $2)');
  result = result.replace(/\bnot\s*\(\s*([^)]+)\s*\)/g, '(!$1)');

  // Replace special constants
  result = result.replace(/\bpi\b/g, '3.14159265358979');
  result = result.replace(/\bexponentiale\b/gi, '2.71828182845905');

  // Handle infinity
  while (/\binf\b/i.test(result)) {
    result = result.replace(/\binf\b/gi, '1e20');
  }

  return result;
}

/**
 * Convert piecewise functions to if statements
 */
function convertPiecewise(expr: string): string {
  let result = expr;
  
  // Simple piecewise: piecewise(value1, condition1, otherwise)
  const piecewiseRegex = /piecewise\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g;
  
  let match;
  while ((match = piecewiseRegex.exec(result)) !== null) {
    const value1 = match[1].trim();
    const condition = match[2].trim();
    const otherwise = match[3].trim();
    
    const replacement = `if(${condition}, ${value1}, ${otherwise})`;
    result = result.replace(match[0], replacement);
  }
  
  return result;
}

/**
 * Convert lambda functions
 */
function convertLambda(expr: string): string {
  // Lambda functions in SBML are typically used in function definitions
  // They need special handling based on context
  return expr;
}

/**
 * Extend a function by substituting parameters
 */
export function extendFunction(
  functionStr: string,
  parameterDict: Map<string, number | string>,
  functionDefinitions: Map<string, SBMLFunctionDefinition>
): string {
  let result = functionStr;

  // Substitute function calls with their definitions
  for (const [funcId, funcDef] of functionDefinitions) {
    const args = funcDef.arguments;
    const body = funcDef.math;
    
    // Create regex to match function call
    const argPattern = args.map(() => '([^,)]+)').join('\\s*,\\s*');
    const regex = new RegExp(`\\b${funcId}\\s*\\(\\s*${argPattern}\\s*\\)`, 'g');
    
    result = result.replace(regex, (...matches) => {
      let expandedBody = body;
      for (let i = 0; i < args.length; i++) {
        const argRegex = new RegExp(`\\b${args[i]}\\b`, 'g');
        expandedBody = expandedBody.replace(argRegex, `(${matches[i + 1]})`);
      }
      return `(${expandedBody})`;
    });
  }

  // Substitute parameter values
  for (const [paramId, value] of parameterDict) {
    const regex = new RegExp(`\\b${paramId}\\b`, 'g');
    result = result.replace(regex, String(value));
  }

  return result;
}

/**
 * Clean parameters by removing problematic values
 */
export function curateParameters(
  parameters: Map<string, SBMLParameter>
): Map<string, string> {
  const curated = new Map<string, string>();

  for (const [id, param] of parameters) {
    let value = String(param.value);
    
    // Handle infinity
    if (/inf/i.test(value)) {
      value = value.replace(/inf/gi, '1e20');
    }
    
    // Handle NaN
    if (/nan/i.test(value)) {
      logger.warning('BNW001', `Parameter ${id} has NaN value, setting to 0`);
      value = '0';
    }

    // Standardize name
    const name = standardizeName(id);
    curated.set(name, value);
  }

  return curated;
}

// =============================================================================
// BNGL Section Writers
// =============================================================================

/**
 * Generate a BNGL section with proper formatting
 */
function sectionTemplate(
  sectionName: string,
  content: string[],
  annotations: Map<string, string> = new Map()
): string {
  const lines: string[] = [];
  
  lines.push(`begin ${sectionName}`);
  
  for (const line of content) {
    if (annotations.has(line)) {
      lines.push(`  ${line}  # ${annotations.get(line)}`);
    } else {
      lines.push(`  ${line}`);
    }
  }
  
  lines.push(`end ${sectionName}`);
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Generate parameters section
 */
export function writeParameters(
  parameters: Map<string, SBMLParameter>,
  compartments: Map<string, SBMLCompartment>
): string {
  const lines: string[] = [];

  // Add compartment sizes as parameters
  for (const [id, comp] of compartments) {
    const name = standardizeName(id);
    lines.push(`${name} ${comp.size}`);
  }

  // Add model parameters
  for (const [id, param] of parameters) {
    if (param.scope === 'global') {
      const name = standardizeName(id);
      let value = String(param.value);
      value = cleanParameterValue(value);
      lines.push(`${name} ${value}`);
    }
  }

  return sectionTemplate('parameters', lines);
}

/**
 * Generate compartments section
 */
export function writeCompartments(
  compartments: Map<string, SBMLCompartment>
): string {
  if (compartments.size === 0) {
    return '';
  }

  const lines: string[] = [];

  for (const [id, comp] of compartments) {
    const name = standardizeName(id);
    const dim = comp.spatialDimensions;
    const size = comp.size;
    
    if (comp.outside) {
      const outside = standardizeName(comp.outside);
      lines.push(`${name} ${dim} ${size} ${outside}`);
    } else {
      lines.push(`${name} ${dim} ${size}`);
    }
  }

  return sectionTemplate('compartments', lines);
}

/**
 * Generate molecule types section
 */
export function writeMoleculeTypes(
  moleculeTypes: Molecule[],
  annotations: Map<string, string> = new Map()
): string {
  const lines: string[] = [];

  for (const mol of moleculeTypes) {
    lines.push(mol.str2());
  }

  // Sort for consistent output
  lines.sort();

  return sectionTemplate('molecule types', lines, annotations);
}

/**
 * Generate seed species section
 */
export function writeSeedSpecies(
  seedSpecies: Array<{ species: Species; concentration: string; compartment: string }>,
  compartments: Map<string, SBMLCompartment>
): string {
  const lines: string[] = [];
  const useCompartments = compartments.size > 1;

  for (const { species, concentration, compartment } of seedSpecies) {
    let speciesStr = species.toString();
    
    if (useCompartments && compartment) {
      speciesStr += `@${standardizeName(compartment)}`;
    }
    
    lines.push(`${speciesStr} ${concentration}`);
  }

  return sectionTemplate('seed species', lines);
}

/**
 * Generate observables section
 */
export function writeObservables(
  sbmlSpecies: Map<string, SBMLSpecies>,
  sct: SpeciesCompositionTable
): string {
  const lines: string[] = [];

  for (const [id, sp] of sbmlSpecies) {
    const entry = sct.entries.get(id);
    if (entry && entry.structure) {
      const name = standardizeName(sp.name || id);
      const pattern = entry.structure.toString();
      lines.push(`Molecules ${name} ${pattern}`);
    }
  }

  return sectionTemplate('observables', lines);
}

/**
 * Generate functions section
 */
export function writeFunctions(
  functions: Map<string, SBMLFunctionDefinition>,
  parameterDict: Map<string, number | string>
): string {
  if (functions.size === 0) {
    return '';
  }

  const lines: string[] = [];

  for (const [id, func] of functions) {
    const name = standardizeName(id);
    const args = func.arguments.map(a => standardizeName(a)).join(', ');
    let body = func.math;
    
    body = convertMathFunctions(body);
    body = convertComparisonOperators(body);
    
    lines.push(`${name}(${args}) = ${body}`);
  }

  return sectionTemplate('functions', lines);
}

/**
 * Generate reaction rules section (flat translation - no atomization)
 */
export function writeReactionRulesFlat(
  reactions: Map<string, SBMLReaction>,
  sbmlSpecies: Map<string, SBMLSpecies>,
  compartments: Map<string, SBMLCompartment>,
  parameterDict: Map<string, number | string>,
  functionDefinitions: Map<string, SBMLFunctionDefinition>,
  options: AtomizerOptions
): string {
  const lines: string[] = [];
  const useCompartments = compartments.size > 1;

  for (const [rxnId, rxn] of reactions) {
    const reactantStrs: string[] = [];
    const productStrs: string[] = [];

    // Build reactants
    for (const ref of rxn.reactants) {
      if (ref.species === 'EmptySet') continue;
      const sp = sbmlSpecies.get(ref.species);
      const name = standardizeName(sp?.name || ref.species);
      let speciesStr = `${name}()`;
      
      if (useCompartments && sp?.compartment) {
        speciesStr += `@${standardizeName(sp.compartment)}`;
      }
      
      for (let i = 0; i < (ref.stoichiometry || 1); i++) {
        reactantStrs.push(speciesStr);
      }
    }

    // Build products
    for (const ref of rxn.products) {
      if (ref.species === 'EmptySet') continue;
      const sp = sbmlSpecies.get(ref.species);
      const name = standardizeName(sp?.name || ref.species);
      let speciesStr = `${name}()`;
      
      if (useCompartments && sp?.compartment) {
        speciesStr += `@${standardizeName(sp.compartment)}`;
      }
      
      for (let i = 0; i < (ref.stoichiometry || 1); i++) {
        productStrs.push(speciesStr);
      }
    }

    // Get rate law
    let rate = '0';
    if (rxn.kineticLaw) {
      rate = rxn.kineticLaw.math;
      
      // Substitute local parameters
      for (const localParam of rxn.kineticLaw.localParameters) {
        const regex = new RegExp(`\\b${localParam.id}\\b`, 'g');
        if (options.replaceLocParams) {
          rate = rate.replace(regex, String(localParam.value));
        } else {
          rate = rate.replace(regex, standardizeName(`${rxnId}_${localParam.id}`));
        }
      }
      
      // Convert math functions
      rate = bnglFunction(
        rate,
        rxnId,
        rxn.reactants.map(r => r.species),
        Array.from(compartments.keys()),
        new Map(Array.from(parameterDict.entries()).map(([k, v]) => [k, Number(v)])),
        new Map()
      );
    }

    // Build rule string
    const reactants = reactantStrs.length > 0 ? reactantStrs.join(' + ') : '0';
    const products = productStrs.length > 0 ? productStrs.join(' + ') : '0';
    const arrow = rxn.reversible ? '<->' : '->';
    
    const ruleName = standardizeName(rxn.name || rxnId);
    lines.push(`${ruleName}: ${reactants} ${arrow} ${products} ${rate}`);
  }

  return sectionTemplate('reaction rules', lines);
}

/**
 * Generate reaction rules section (with atomization)
 */
export function writeReactionRulesAtomized(
  reactions: Map<string, SBMLReaction>,
  sct: SpeciesCompositionTable,
  translator: Map<string, Species>,
  compartments: Map<string, SBMLCompartment>,
  parameterDict: Map<string, number | string>,
  functionDefinitions: Map<string, SBMLFunctionDefinition>,
  options: AtomizerOptions
): string {
  const lines: string[] = [];
  const useCompartments = compartments.size > 1;

  for (const [rxnId, rxn] of reactions) {
    const reactantStrs: string[] = [];
    const productStrs: string[] = [];

    // Build reactants using translated structures
    for (const ref of rxn.reactants) {
      if (ref.species === 'EmptySet') continue;
      
      const translated = translator.get(ref.species);
      if (translated) {
        let speciesStr = translated.toString();
        
        if (useCompartments) {
          const entry = sct.entries.get(ref.species);
          // Add compartment if needed
        }
        
        for (let i = 0; i < (ref.stoichiometry || 1); i++) {
          reactantStrs.push(speciesStr);
        }
      } else {
        // Fall back to flat species
        const entry = sct.entries.get(ref.species);
        if (entry && entry.structure) {
          for (let i = 0; i < (ref.stoichiometry || 1); i++) {
            reactantStrs.push(entry.structure.toString());
          }
        }
      }
    }

    // Build products using translated structures
    for (const ref of rxn.products) {
      if (ref.species === 'EmptySet') continue;
      
      const translated = translator.get(ref.species);
      if (translated) {
        let speciesStr = translated.toString();
        
        for (let i = 0; i < (ref.stoichiometry || 1); i++) {
          productStrs.push(speciesStr);
        }
      } else {
        const entry = sct.entries.get(ref.species);
        if (entry && entry.structure) {
          for (let i = 0; i < (ref.stoichiometry || 1); i++) {
            productStrs.push(entry.structure.toString());
          }
        }
      }
    }

    // Get rate law
    let rate = '0';
    if (rxn.kineticLaw) {
      rate = rxn.kineticLaw.math;
      
      for (const localParam of rxn.kineticLaw.localParameters) {
        const regex = new RegExp(`\\b${localParam.id}\\b`, 'g');
        if (options.replaceLocParams) {
          rate = rate.replace(regex, String(localParam.value));
        } else {
          rate = rate.replace(regex, standardizeName(`${rxnId}_${localParam.id}`));
        }
      }
      
      rate = bnglFunction(
        rate,
        rxnId,
        rxn.reactants.map(r => r.species),
        Array.from(compartments.keys()),
        new Map(Array.from(parameterDict.entries()).map(([k, v]) => [k, Number(v)])),
        new Map()
      );
    }

    // Build rule string
    const reactants = reactantStrs.length > 0 ? reactantStrs.join(' + ') : '0';
    const products = productStrs.length > 0 ? productStrs.join(' + ') : '0';
    const arrow = rxn.reversible ? '<->' : '->';
    
    const ruleName = standardizeName(rxn.name || rxnId);
    lines.push(`${ruleName}: ${reactants} ${arrow} ${products} ${rate}`);
  }

  return sectionTemplate('reaction rules', lines);
}

// =============================================================================
// Main BNGL Generation
// =============================================================================

export interface BNGLGenerationResult {
  bngl: string;
  observableMap: Map<string, string>;
  warnings: string[];
}

/**
 * Generate complete BNGL model from SBML model and SCT
 */
export function generateBNGL(
  model: SBMLModel,
  sct: SpeciesCompositionTable,
  moleculeTypes: Molecule[],
  seedSpecies: Array<{ species: Species; concentration: string; compartment: string }>,
  options: AtomizerOptions
): BNGLGenerationResult {
  const warnings: string[] = [];
  const observableMap = new Map<string, string>();
  
  const sections: string[] = [];

  // Header comment
  sections.push(`# BNGL model generated from SBML`);
  sections.push(`# Model: ${model.name}`);
  sections.push(`# Species: ${model.species.size}, Reactions: ${model.reactions.size}`);
  sections.push('');
  sections.push('begin model');
  sections.push('');

  // Parameters
  sections.push(writeParameters(model.parameters, model.compartments));

  // Compartments (if more than one)
  if (model.compartments.size > 1) {
    sections.push(writeCompartments(model.compartments));
  }

  // Molecule types
  const molTypeAnnotations = new Map<string, string>();
  for (const mol of moleculeTypes) {
    const entry = Array.from(sct.entries.values()).find(
      e => e.isElemental && e.structure.molecules[0]?.name === mol.name
    );
    if (entry) {
      molTypeAnnotations.set(mol.str2(), entry.sbmlId);
    }
  }
  sections.push(writeMoleculeTypes(moleculeTypes, molTypeAnnotations));

  // Seed species
  sections.push(writeSeedSpecies(seedSpecies, model.compartments));

  // Observables
  sections.push(writeObservables(model.species, sct));

  // Build observable map
  for (const [id, sp] of model.species) {
    const name = standardizeName(sp.name || id);
    observableMap.set(id, name);
  }

  // Functions (if any)
  if (model.functionDefinitions.size > 0) {
    const paramDict = new Map<string, number | string>();
    for (const [id, param] of model.parameters) {
      paramDict.set(id, param.value);
    }
    sections.push(writeFunctions(model.functionDefinitions, paramDict));
  }

  // Reaction rules
  const paramDict = new Map<string, number | string>();
  for (const [id, param] of model.parameters) {
    paramDict.set(id, param.value);
  }
  
  if (options.atomize) {
    // Use atomized translation
    const translator = new Map<string, Species>();
    for (const [id, entry] of sct.entries) {
      translator.set(id, entry.structure);
    }
    sections.push(writeReactionRulesAtomized(
      model.reactions,
      sct,
      translator,
      model.compartments,
      paramDict,
      model.functionDefinitions,
      options
    ));
  } else {
    // Flat translation
    sections.push(writeReactionRulesFlat(
      model.reactions,
      model.species,
      model.compartments,
      paramDict,
      model.functionDefinitions,
      options
    ));
  }

  sections.push('end model');
  sections.push('');

  // Add simulation commands
  sections.push('# Simulation commands');
  sections.push('generate_network({overwrite=>1})');
  sections.push('simulate({method=>"ode",t_end=>100,n_steps=>1000})');

  const bngl = sections.join('\n');

  return { bngl, observableMap, warnings };
}

/**
 * Print a reaction in BNGL format
 */
export function bnglReaction(
  reactants: Array<[string, number, string]>,
  products: Array<[string, number, string]>,
  rate: string,
  tags: Map<string, string>,
  translator: Map<string, Species> = new Map(),
  isCompartments: boolean = false,
  reversible: boolean = true,
  comment: string = '',
  reactionName?: string
): string {
  let finalString = '';

  // Reactants
  if (reactants.length === 0 || (reactants.length === 1 && reactants[0][1] === 0)) {
    finalString += '0 ';
  } else {
    const reactantStrs: string[] = [];
    for (const [species, stoich, compartment] of reactants) {
      const tag = isCompartments && tags.has(compartment) ? tags.get(compartment)! : '';
      const translated = printTranslate([species, stoich, compartment], tag, translator);
      reactantStrs.push(translated);
    }
    finalString += reactantStrs.join(' + ');
  }

  // Arrow
  finalString += reversible ? ' <-> ' : ' -> ';

  // Products
  if (products.length === 0) {
    finalString += '0 ';
  } else {
    const productStrs: string[] = [];
    for (const [species, stoich, compartment] of products) {
      const tag = isCompartments && tags.has(compartment) ? tags.get(compartment)! : '';
      const translated = printTranslate([species, stoich, compartment], tag, translator);
      productStrs.push(translated);
    }
    finalString += productStrs.join(' + ');
  }

  // Rate
  finalString += ' ' + rate;

  // Comment
  if (comment) {
    finalString += ' ' + comment;
  }

  // Clean up
  finalString = finalString.replace(/(\W|^)0\(\)/g, '0');

  // Add reaction name
  if (reactionName) {
    finalString = `${reactionName}: ${finalString}`;
  }

  return finalString;
}

/**
 * Translate a chemical species for BNGL output
 */
function printTranslate(
  chemical: [string, number, string],
  tags: string,
  translator: Map<string, Species>
): string {
  const [species, stoich, compartment] = chemical;
  const tmp: string[] = [];

  let app: string;
  if (!translator.has(species)) {
    app = `${species}()${tags}`;
  } else {
    const sp = translator.get(species)!;
    sp.addCompartment(tags);
    app = sp.toString();
  }

  const intStoich = Math.floor(stoich);
  if (intStoich === stoich) {
    for (let i = 0; i < intStoich; i++) {
      tmp.push(app);
    }
  } else {
    logger.error('BNW002', `Non-integer stoichiometry: ${stoich} * ${species}`);
    tmp.push(app);
  }

  return tmp.join(' + ');
}
