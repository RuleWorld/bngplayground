/**
 * BNGL Writer Module
 * Complete TypeScript port of bnglWriter.py
 * 
 * Generates BNGL model files from parsed SBML data
 */

import { Species, Molecule, Component, Rule, Action, Databases, readFromString } from '../core/structures';
import {
  SBMLModel,
  SBMLReaction,
  SBMLParameter,
  SBMLCompartment,
  SBMLSpecies,
  SBMLFunctionDefinition,
  AtomizerOptions,
  SeedSpeciesEntry,
} from '../config/types';
import {
  standardizeName,
  convertMathFunction,
  cleanParameterValue,
  logger,
  TranslationException,
} from '../utils/helpers';
import { SCTEntry, SpeciesCompositionTable } from '../config/types';


/**
 * Detect and extract statistical factors from SBML kinetic law.
 * SBML often includes statistical factors (e.g., "2 * ka * S1 * S2") to account for
 * multiple identical binding sites. When translating to BNGL with explicit species rules,
 * these factors should be removed because BNGL handles them through pattern matching.
 * 
 * @param rate The rate expression from SBML
 * @param reactantSpecies Map of reactant species IDs to their structures
 * @returns The rate with statistical factors removed
 */
function extractStatisticalFactors(
  rate: string,
  reactantSpecies: Map<string, Species>
): string {
  // Pattern to find leading numeric coefficients: ^(number * rest) or ^number * rest
  const leadingCoeffPattern = /^\s*(?:\()?\s*(\d+(?:\.\d+)?)\s*\*\s*(.+)$/;
  const match = rate.match(leadingCoeffPattern);

  if (!match) return rate;

  const coeff = parseFloat(match[1]);
  const rest = match[2];

  // Note: We keep the trailing parenthesis if present, as the finalRate
  // construction expects balanced parentheses

  // Check if coefficient matches statistical factors from reactants
  let expectedStatFactor = 1;
  for (const [speciesId, species] of reactantSpecies) {
    for (const mol of species.molecules) {
      // Count identical components that could serve as binding sites
      const componentCounts = new Map<string, number>();
      for (const comp of mol.components) {
        const count = componentCounts.get(comp.name) || 0;
        componentCounts.set(comp.name, count + 1);
      }

      // For each set of identical components, multiply by count
      for (const [compName, count] of componentCounts) {
        if (count > 1) {
          expectedStatFactor *= count;
        }
      }
    }
  }

  // If coefficient matches expected statistical factor, remove it
  if (Math.abs(coeff - expectedStatFactor) < 0.001 && expectedStatFactor > 1) {
    return rest.trim();
  }

  return rate;
}

/**
 * Helper to generate permutations of an array
 */
function permutate(arr: string[]): string[][] {
  if (arr.length === 0) return [[]];
  const first = arr[0];
  const rest = arr.slice(1);
  const words = permutate(rest);
  const result = [];
  for (const w of words) {
    for (let i = 0; i <= w.length; i++) {
      const start = w.slice(0, i);
      const end = w.slice(i);
      result.push([...start, first, ...end]);
    }
  }
  return result;
}

/**
 * Helper to generate permuted string keys for simple species names
 * e.g. "Mol(A,B)" -> ["Mol(A,B)", "Mol(B,A)"]
 */
function getPermutatedKeys(name: string): string[] {
  const match = name.match(/^(\w+)\(([^)]+)\)$/);
  if (!match) return [];

  const molName = match[1];
  const content = match[2];
  // Don't permute if nested parens (complexes)
  if (content.includes('(')) return [];

  const parts = content.split(',').map(s => s.trim());
  if (parts.length < 2 || parts.length > 5) return []; // Limit complexity

  const perms = permutate(parts);
  return perms.map(p => `${molName}(${p.join(',')})`);
}

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
  reactionDict: Map<string, string> = new Map(),
  assignmentRuleVariables: Set<string> = new Set(),
  observableIds: Set<string> = new Set(),
  speciesToHasOnlySubstanceUnits: Map<string, boolean> = new Map(),
  observableConvertedRules: Set<string> = new Set(),
  speciesWithConcFunctions: Set<string> = new Set(),
  sbmlToBnglId: Map<string, string> = new Map()
): string {
  let result = rule;

  // Check if this is a saturation-style rate law (Sat/MM/Hill)
  // These use amount-based parameters, so we should use amounts, not concentrations
  const isSaturationRate = /\b(Sat|MM|Hill)\s*\(/.test(rule);

  // Replace IDs based on sbmlToBnglId map
  // We extract all alphanumeric tokens and check if they map to a consolidated species ID
  result = result.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g, (match) => {
    // Skip math functions to avoid replacing them if an SBML ID happens to match
    if (/^(Sat|MM|Hill|pow|sqrt|exp|abs|log|ln|log10|piecewise|if|gt|lt|geq|leq|eq|neq|and|or|not)$/i.test(match)) return match;

    const mappedId = sbmlToBnglId.get(match);
    if (!mappedId) return match;

    const bnglName = mappedId;

    if (isSaturationRate && speciesWithConcFunctions.has(bnglName)) {
      return `${bnglName}_amt`;
    } else if (speciesWithConcFunctions.has(bnglName)) {
      return `_c_${bnglName}()`;
    } else {
      // In functions block, species names should generally refer to their amounts (S1_amt)
      // because S1 itself is a pattern and cannot be used in expressions
      return `${bnglName}_amt`;
    }
  });

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

  // Handle assignment rule variables (treat as functions unless converted to observables)
  for (const variable of assignmentRuleVariables) {
    const stdName = standardizeName(variable);
    const regex = new RegExp(`\\b${variable}\\b`, 'g');
    if (observableConvertedRules.has(variable)) {
      result = result.replace(regex, stdName);
    } else if (speciesWithConcFunctions.has(stdName)) {
      result = result.replace(regex, `_c_${stdName}()`);  // Has conc function
    } else {
      result = result.replace(regex, `${stdName}()`);  // Regular function, NO _c_
    }
  }

  // Handle Sat/MM/Hill macros specifically if they are missing the substrate argument
  if (isSaturationRate) {
    result = replaceNestedFunc(result, 'Sat', (args) => {
      // If we have 2 args (k, K), append the first reactant as substrate
      if (args.length === 2 && reactants.length > 0) {
        return `Sat(${args[0]}, ${args[1]}, ${standardizeName(reactants[0])}_amt)`;
      }
      return `Sat(${args.join(', ')})`;
    });
    result = replaceNestedFunc(result, 'MM', (args) => {
      if (args.length === 2 && reactants.length > 0) {
        return `MM(${args[0]}, ${args[1]}, ${standardizeName(reactants[0])}_amt)`;
      }
      return `MM(${args.join(', ')})`;
    });
    result = replaceNestedFunc(result, 'Hill', (args) => {
      if (args.length === 3 && reactants.length > 0) {
        return `Hill(${args[0]}, ${args[1]}, ${standardizeName(reactants[0])}_amt, ${args[2]})`;
      }
      return `Hill(${args.join(', ')})`;
    });
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
    'and': '&&',
    'or': '||',
  };

  let result = expr;
  for (const [func, op] of Object.entries(operators)) {
    // Match func(a, b)
    result = replaceNestedFunc(result, func, (args) => {
      if (args.length === 2) {
        return `(${args[0]} ${op} ${args[1]})`;
      }
      return `${func}(${args.join(',')})`;
    });
  }

  // Handle 'not(a)'
  result = replaceNestedFunc(result, 'not', (args) => {
    if (args.length === 1) {
      return `(!${args[0]})`;
    }
    return `not(${args.join(',')})`;
  });

  return result;
}

/**
 * Helper to replace nested functions correctly
 */
function replaceNestedFunc(expr: string, funcName: string, replacer: (args: string[]) => string): string {
  let result = expr;
  const regexStr = `\\b${funcName}\\s*\\(`;

  while (true) {
    const regex = new RegExp(regexStr);
    const match = result.match(regex);
    if (!match) break;

    const startIndex = match.index!;
    let parenCount = 1;
    let i = startIndex + match[0].length;
    while (parenCount > 0 && i < result.length) {
      if (result[i] === '(') parenCount++;
      else if (result[i] === ')') parenCount--;
      i++;
    }

    if (parenCount === 0) {
      const inner = result.substring(startIndex + match[0].length, i - 1);
      const args = splitArguments(inner);
      const replacement = replacer(args);
      result = result.substring(0, startIndex) + replacement + result.substring(i);
    } else {
      // Unmatched parenthesis, something is wrong with the expression
      break;
    }
  }
  return result;
}

function splitArguments(inner: string): string[] {
  const args: string[] = [];
  let current = '';
  let parenCount = 0;
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char === '(') parenCount++;
    else if (char === ')') parenCount--;

    if (char === ',' && parenCount === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  args.push(current.trim());
  return args;
}

/**
 * Convert mathematical functions (pow, sqrt, exp, log, etc.)
 */
function convertMathFunctions(expr: string): string {
  let result = expr;

  // Power function: pow(a, b) or power(a, b) -> (a)^(b)
  result = replaceNestedFunc(result, 'pow', (args) => `((${args[0]})^(${args[1]}))`);
  result = replaceNestedFunc(result, 'power', (args) => `((${args[0]})^(${args[1]}))`);

  // Square root: sqrt(x) -> (x)^(1/2)
  result = replaceNestedFunc(result, 'sqrt', (args) => `((${args[0]})^(1/2))`);

  // Square: sqr(x) -> (x)^2
  result = replaceNestedFunc(result, 'sqr', (args) => `((${args[0]})^2)`);

  // Exponential: exp(x) -> e^(x)
  result = replaceNestedFunc(result, 'exp', (args) => `(2.71828182845905^(${args[0]}))`);

  // Absolute value: abs(x) -> if(x>=0,x,-x)
  result = replaceNestedFunc(result, 'abs', (args) => `if(${args[0]}>=0,${args[0]},-(${args[0]}))`);

  // Logarithm: log(x) or ln(x) -> ln(x)
  result = result.replace(/\blog\s*\(/g, 'ln(');
  result = result.replace(/\bln\s*\(/g, 'ln(');

  // Log base 10: log10(x) -> (ln(x)/ln(10))
  result = replaceNestedFunc(result, 'log10', (args) => `(ln(${args[0]})/2.302585093)`);

  // Sat and MM: handle 3rd argument (rate constant) if present
  result = replaceNestedFunc(result, 'Sat', (args) => {
    if (args.length === 3) return `((${args[0]}) * Sat(${args[2]}, ${args[1]}))`;
    return `Sat(${args[0]}, ${args[1]})`;
  });
  result = replaceNestedFunc(result, 'MM', (args) => {
    if (args.length === 3) return `((${args[0]}) * MM(${args[2]}, ${args[1]}))`;
    return `MM(${args[0]}, ${args[1]})`;
  });

  // Hill(k, K, sub, n) -> k * sub^n / (K^n + sub^n)
  result = replaceNestedFunc(result, 'Hill', (args) => {
    if (args.length === 4) {
      return `((${args[0]}) * (${args[2]})^(${args[3]}) / ((${args[1]})^(${args[3]}) + (${args[2]})^(${args[3]})))`;
    }
    return `Hill(${args.join(',')})`;
  });

  // Special constants
  result = result.replace(/\bpi\b/g, '3.14159265358979');
  result = result.replace(/\bexponentiale\b/gi, '2.71828182845905');

  // Normalize double negatives (e.g. --ln(x) -> +ln(x))
  result = result.replace(/--/g, '+');

  return result;
}

/**
 * Convert piecewise functions to nested if statements
 */
function convertPiecewise(expr: string): string {
  return replaceNestedFunc(expr, 'piecewise', (args) => {
    if (args.length === 1) return args[0];
    if (args.length === 2) return `if(${args[1]}, ${args[0]}, 0)`; // Default otherwise to 0

    let result = args[args.length - 1]; // Start with the "otherwise" value
    // If odd number of args, the last one is 'otherwise'
    // piecewise(v1, c1, v2, c2, ..., otherwise)
    if (args.length % 2 === 1) {
      for (let i = args.length - 3; i >= 0; i -= 2) {
        result = `if(${args[i + 1]}, ${args[i]}, ${result})`;
      }
    } else {
      // piecewise(v1, c1, v2, c2, ...) -> assume 0 for final otherwise
      result = '0';
      for (let i = args.length - 2; i >= 0; i -= 2) {
        result = `if(${args[i + 1]}, ${args[i]}, ${result})`;
      }
    }
    return result;
  });
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

  // Track which functions have been substituted to avoid issues with nested calls
  const definedFunctions = new Set<string>();

  // Substitute function calls with their definitions
  for (const [funcId, funcDef] of functionDefinitions) {
    const args = funcDef.arguments;
    const body = funcDef.math;

    // Create regex to match function call
    // Handle zero-argument functions differently: match empty parens
    let regex: RegExp;
    if (args.length === 0) {
      // For zero-arg functions like kPlus(), match kPlus() or kPlus( )
      regex = new RegExp(`\\b${funcId}\\s*\\(\\s*\\)`, 'g');
    } else {
      // For functions with arguments, the argument may or may not have () parens
      // Use a pattern that allows (optional) parens after the argument
      const argPattern = args.map(() => '((?:\\w+\\s*(?:\\([^)]*\\))?)+)').join('\\s*,\\s*');
      regex = new RegExp(`\\b${funcId}\\s*\\(\\s*${argPattern}\\s*\\)`, 'g');
    }

    result = result.replace(regex, (...matches) => {
      definedFunctions.add(funcId);
      let expandedBody = body;

      // For zero-arg functions, there's no substitution needed
      if (args.length > 0) {
        for (let i = 0; i < args.length; i++) {
          const argRegex = new RegExp(`\\b${args[i]}\\b`, 'g');
          expandedBody = expandedBody.replace(argRegex, `(${matches[i + 1]})`);
        }
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
  compartments: Map<string, SBMLCompartment>,
  assignmentRuleVariables: Set<string> = new Set()
): string {
  const lines: string[] = [];

  // Add compartment sizes as parameters
  for (const [id, comp] of compartments) {
    const name = standardizeName(id);
    lines.push(`__compartment_${name}__ ${comp.size}`);
  }


  // Add model parameters
  for (const [id, param] of parameters) {
    if (param.scope === 'global') {
      const name = standardizeName(id);

      // Skip parameters that are targets of assignment rules (they become functions)
      if (assignmentRuleVariables.has(name)) {
        continue;
      }

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
 * Helper to build a canonical BNGL pattern string for an atomizer-complex.
 * This ensures isomorphic complexes generate identical strings by sorting molecules.
 */
function getBnglPatternHelper(
  sbmlId: string,
  sct: SpeciesCompositionTable,
  speciesToCompartment: Map<string, string>
): string {
  const entry = sct.entries.get(sbmlId);
  if (!entry || !entry.structure) return standardizeName(sbmlId);

  entry.structure.renumberBonds();
  const spCompId = speciesToCompartment.get(sbmlId);
  const compName = spCompId ? standardizeName(spCompId) : '';
  const compSuffix = compName ? `@${compName}` : '';

  const moleculePatterns = entry.structure.molecules.map(m => {
    // Note: toString(true) for 3D/standard formatting
    const molStr = m.toString(true);
    const withPrefix = molStr.replace(/^(\w+)/, 'M_$1');
    // If the molecule already has a compartment (unlikely in atomization), don't append suffix
    if (withPrefix.includes('@')) return withPrefix;
    return withPrefix + compSuffix;
  }).sort();

  return moleculePatterns.join('.');
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
    // Prefix molecule name with M_ to avoid conflict with scaling functions
    // Strip compartment info from Type definition (only valid on instances)
    const molStr = mol.str2().split('@')[0];
    lines.push(`M_${molStr}`);
  }

  // Sort for consistent output
  lines.sort();

  return sectionTemplate('molecule types', lines, annotations);
}

/**
 * Generate seed species section
 */
export function writeSeedSpecies(
  seedSpecies: SeedSpeciesEntry[],
  compartments: Map<string, SBMLCompartment>,
  sct: SpeciesCompositionTable,
  speciesToCompartment: Map<string, string>,
  isAtomized: boolean = false
): { section: string, patternToId: Map<string, string>, sbmlToBnglId: Map<string, string>, idToPattern: Map<string, string> } {
  const patterns = new Map<string, { concentration: number | string; names: string[] }>();
  const sbmlToBnglId = new Map<string, string>();
  const idToPattern = new Map<string, string>();

  // Use getBnglPattern helper for consistent pattern generation
  for (const s of seedSpecies) {
    const pattern = getBnglPatternHelper(s.sbmlId, sct, speciesToCompartment);
    const concentration = s.concentration;

    if (!patterns.has(pattern)) {
      patterns.set(pattern, { concentration, names: [s.sbmlId] });
    } else {
      patterns.get(pattern)!.names.push(s.sbmlId);
    }
  }

  const patternToId = new Map<string, string>();
  const lines = Array.from(patterns.entries()).map(([pattern, data], index) => {
    const id = `S${index + 1}`;
    patternToId.set(pattern, id);
    idToPattern.set(id, pattern);
    // Link each SBML ID that maps to this pattern to the BNGL ID
    for (const sbmlId of data.names) {
      sbmlToBnglId.set(sbmlId, id);
    }
    return `  ${pattern} ${data.concentration}`;
  });

  return {
    section: sectionTemplate('species', lines),
    patternToId,
    sbmlToBnglId,
    idToPattern
  };
}

/**
 * Generate observables section
 */
export interface WriteObservablesResult {
  lines: string[];
  writtenRules: Set<string>;
  speciesAmts: Set<string>;
  assignmentRuleCompartments: Map<string, string>;
}

export function writeObservables(
  sbmlSpecies: Map<string, SBMLSpecies>,
  sct: SpeciesCompositionTable,
  assignmentRules: Array<{ variable: string; math: string }>,
  speciesToCompartment: Map<string, string>,
  speciesToHasOnlySubstanceUnits: Map<string, boolean> = new Map(),
  options: Partial<AtomizerOptions> = {},
  patternToId: Map<string, string> = new Map(),
  sbmlToBnglId: Map<string, string> = new Map(),
  idToPattern: Map<string, string> = new Map()
): WriteObservablesResult {
  const lines: string[] = [];
  const writtenRules = new Set<string>();
  const speciesAmts = new Set<string>();
  const assignmentRuleCompartments = new Map<string, string>();

  // Issue 7 helper
  const needsStandardization = (name: string): boolean => {
    return !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
  };

  // First pass: Define direct observables for each species
  // These are used for concentration scaling functions (_c_S1) and rates (S1_amt)
  for (const [id, sp] of sbmlSpecies) {
    const entry = sct.entries.get(id);
    if (entry && entry.structure) {
      const name = needsStandardization(id) ? standardizeName(id) : id;
      const bnglId = sbmlToBnglId.get(id);

      if (bnglId) {
        const pattern = idToPattern.get(bnglId);
        if (pattern) {
          // Use the actual pattern instead of the ID label (S1, S2...)
          // This avoids BioNetGen interpreting S1 as a molecule type
          lines.push(`Species ${name}_amt ${pattern}`);
          lines.push(`Species ${name} ${pattern}`);
          speciesAmts.add(name);
          writtenRules.add(id); // Use original ID for tracking rules
        }
      }
    }
  }

  // Second pass: Handle assignment rules mapping back to observables
  for (const rule of assignmentRules) {
    if (!rule.math) continue;
    const name = standardizeName(rule.variable);

    // Only handle simple sums/weighted sums
    if (/[/^()]/.test(rule.math)) continue;

    const terms = rule.math.split('+').map(t => t.trim());
    const patternCounts = new Map<string, number>();
    let ruleCompartment: string | undefined;

    for (const term of terms) {
      if (!term) continue;
      let coef = 1;
      let spId = term;

      if (term.includes('*')) {
        const parts = term.split('*').map(p => p.trim());
        if (/^\d+$/.test(parts[0])) {
          coef = parseInt(parts[0], 10);
          spId = parts[1];
        } else if (/^\d+$/.test(parts[1])) {
          coef = parseInt(parts[1], 10);
          spId = parts[0];
        }
      }

      // Skip numeric constants like "0" - they don't contribute to the pattern
      if (/^\d+$/.test(spId)) {
        continue;
      }

      const bnglId = sbmlToBnglId.get(spId);

      // Skip if this is not a valid species (e.g., it's a parameter)
      if (!bnglId && !sbmlSpecies.has(spId)) {
        patternCounts.clear();
        break;
      }

      // For Molecules observables, always use the actual molecule pattern
      let patternToUse = bnglId ? idToPattern.get(bnglId) : undefined;

      // Fallback to standardized name if no bnglId or pattern found
      if (!patternToUse) {
        patternToUse = bnglId || standardizeName(spId);
      }

      // Use the coefficient. If multiple SBML species map to this same pattern,
      // we assume they have the same coefficient (or we take the max).
      // We don't SUM them, because the BNGL amount of the pattern already
      // represents the sum of the SBML species amounts.
      const currentCoef = patternCounts.get(patternToUse) || 0;
      patternCounts.set(patternToUse, Math.max(currentCoef, coef));

      const comp = speciesToCompartment.get(spId);
      if (comp && !ruleCompartment) ruleCompartment = comp;
    }

    if (patternCounts.size > 0) {
      const finalPatterns: string[] = [];
      for (const [pattern, count] of patternCounts.entries()) {
        for (let i = 0; i < count; i++) {
          finalPatterns.push(pattern);
        }
      }
      lines.push(`Molecules ${name} ${finalPatterns.join(' ')}`);
      writtenRules.add(rule.variable);
      speciesAmts.add(name);
      if (ruleCompartment) assignmentRuleCompartments.set(name, ruleCompartment);
    }
  }

  return { lines, writtenRules, speciesAmts, assignmentRuleCompartments };
}

/**
 * Generate functions section
 */
export function writeFunctions(
  functions: Map<string, SBMLFunctionDefinition>,
  assignmentRules: Array<{ variable: string; math: string }>,
  parameterDict: Map<string, number | string>,
  speciesToCompartment: Map<string, string>,
  speciesToHasOnlySubstanceUnits: Map<string, boolean>,
  skipRules: Set<string>,
  speciesAmts: Set<string>,
  assignmentRuleCompartments: Map<string, string>,
  sbmlToBnglId: Map<string, string> = new Map()
): string {
  const lines: string[] = [];

  // Species scaling functions
  for (const name of speciesAmts) {
    let compId: string | undefined;
    let isAmountOnly = false;

    // First try to find in speciesToCompartment (for species IDs)
    for (const [sbmlId, comp] of speciesToCompartment) {
      if (standardizeName(sbmlId) === name) {
        compId = comp;
        isAmountOnly = speciesToHasOnlySubstanceUnits.get(sbmlId) || false;
        break;
      }
    }

    // If not found, check assignmentRuleCompartments (for A, B, C, etc.)
    if (!compId && assignmentRuleCompartments.has(name)) {
      compId = assignmentRuleCompartments.get(name);
    }

    const bnglName = `_c_${name}`;
    if (!isAmountOnly && compId) {
      const volParam = `__compartment_${standardizeName(compId)}__`;
      lines.push(`${bnglName}() = ${name} / ${volParam}`);
    } else {
      lines.push(`${bnglName}() = ${name}`);
    }
  }

  if (lines.length > 0) lines.push('');

  // Write Function Definitions
  for (const [id, func] of functions) {
    const name = standardizeName(id);
    const args = func.arguments.map(a => standardizeName(a)).join(', ');
    let body = func.math;

    body = convertMathFunctions(body);
    body = convertComparisonOperators(body);
    body = convertPiecewise(body);

    lines.push(`${name}(${args}) = ${body}`);
  }


  // Sort assignment rules by dependency to ensure sub-functions are defined before use
  const sortedRules: Array<{ variable: string; math: string }> = [];
  const visited = new Set<string>();
  const rulesMap = new Map<string, { variable: string; math: string }>();
  for (const rule of assignmentRules) {
    rulesMap.set(rule.variable, rule);
  }

  function visit(ruleId: string, stack: Set<string> = new Set()) {
    if (stack.has(ruleId)) {
      return;
    }
    if (visited.has(ruleId)) return;

    const rule = rulesMap.get(ruleId);
    if (!rule) return;

    stack.add(ruleId);
    for (const otherId of rulesMap.keys()) {
      if (otherId === ruleId) continue;
      const regex = new RegExp(`\\b${otherId}\\b`);
      if (regex.test(rule.math)) {
        visit(otherId, stack);
      }
    }
    stack.delete(ruleId);

    visited.add(ruleId);
    sortedRules.push(rule);
  }

  for (const rule of assignmentRules) {
    visit(rule.variable);
  }

  const assignmentRuleIds = new Set(assignmentRules.map(r => standardizeName(r.variable)));

  // Write Assignment Rules as Functions (variable() = math)
  for (const rule of sortedRules) {
    if (!rule.variable || skipRules.has(rule.variable)) continue;
    const ruleId = rule.variable;
    const name = standardizeName(ruleId);

    // If it's observable-compatible, it was already handled in writeObservables
    if (!/[*/^()]/.test(rule.math) && /\bS\d+\b/.test(rule.math)) continue;

    let inlinedMath = inlineSBMLFunctions(rule.math, functions);
    let body = bnglFunction(
      inlinedMath,
      ruleId,
      [],
      [],
      new Map(Array.from(parameterDict.entries()).map(([k, v]) => [k, Number(v)])),
      new Map(),
      assignmentRuleIds,
      new Set(speciesToCompartment.keys()),
      speciesToHasOnlySubstanceUnits,
      skipRules,
      speciesAmts,
      sbmlToBnglId
    );

    lines.push(`${name}() = ${body}`);
  }

  return sectionTemplate('functions', lines);
}

function areCompartmentsAdjacent(
  compA: string | undefined,
  compB: string | undefined,
  compartments: Map<string, SBMLCompartment>
): boolean {
  if (!compA || !compB) return false;
  const a = compartments.get(compA);
  const b = compartments.get(compB);
  if (!a || !b) return false;
  return a.outside === compB || b.outside === compA;
}

/**
 * Generate reaction rules section (flat translation - no atomization)
 */
export function writeReactionRulesFlat(
  reactions: Map<string, SBMLReaction>,
  sbmlSpecies: Map<string, SBMLSpecies>,
  sct: SpeciesCompositionTable,
  compartments: Map<string, SBMLCompartment>,
  parameterDict: Map<string, number | string>,
  functionDefinitions: Map<string, SBMLFunctionDefinition>,
  speciesToCompartment: Map<string, string>,
  speciesToHasOnlySubstanceUnits: Map<string, boolean>,
  options: AtomizerOptions,
  sbmlToBnglId: Map<string, string> = new Map(),
  idToPattern: Map<string, string> = new Map()
): string {
  const lines: string[] = [];
  const useCompartments = compartments.size > 0;

  const buildFlatPattern = (speciesId: string): string => {
    // Robust mapping first - use actual pattern instead of BNGL ID
    const bnglId = sbmlToBnglId.get(speciesId);
    if (bnglId) {
      const pattern = idToPattern.get(bnglId);
      if (pattern) return pattern;
      return bnglId;
    }

    const entry = sct.entries.get(speciesId);
    const compId = speciesToCompartment.get(speciesId);
    if (entry?.structure) {
      const molecules = entry.structure.molecules;
      const hasMoleculeCompartments = molecules.some(m => m.compartment !== '');

      if (hasMoleculeCompartments) {
        return molecules.map(m => {
          const molStr = m.toString(true);
          return molStr.replace(/^(\w+)/, 'M_$1');
        }).join('.');
      }

      if (useCompartments && compId) {
        const suffix = `@${standardizeName(compId)}`;
        return molecules.map(m => {
          const molStr = m.toString(true);
          return molStr.replace(/^(\w+)/, 'M_$1') + suffix;
        }).join('.');
      }

      return molecules.map(m => {
        const molStr = m.toString(true);
        return molStr.replace(/^(\w+)/, 'M_$1');
      }).join('.');
    }

    const sp = sbmlSpecies.get(speciesId);
    const name = standardizeName(sp?.name || speciesId);
    let pattern = `M_${name}`;
    if (useCompartments && compId) {
      pattern = `${pattern}@${standardizeName(compId)}`;
    }
    return pattern;
  };

  for (const [rxnId, rxn] of reactions) {
    const reactantStrs: string[] = [];
    const productStrs: string[] = [];

    // Build reactants
    for (const ref of rxn.reactants) {
      if (ref.species === 'EmptySet') continue;
      const speciesStr = buildFlatPattern(ref.species);

      for (let i = 0; i < (ref.stoichiometry || 1); i++) {
        reactantStrs.push(speciesStr);
      }
    }

    // Build products
    for (const ref of rxn.products) {
      if (ref.species === 'EmptySet') continue;
      const compId = speciesToCompartment.get(ref.species);
      const speciesStr = buildFlatPattern(ref.species);
      const reactantComp = rxn.reactants.length > 0 ? speciesToCompartment.get(rxn.reactants[0].species) : null;

      if (useCompartments && compId && reactantComp && reactantComp !== compId) {
        if (!areCompartmentsAdjacent(reactantComp, compId, compartments)) {
          logger.info('BNW004',
            `Transport reaction ${rxnId}: ${ref.species} moves from ${reactantComp} to ${compId}`
          );
        }
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
      // Strip compartment volume terms from SBML kinetic law
      // BNG2.pl exports SBML with "* PM" for heterogeneous reactions
      // We strip this because we're using molecule-based rates (not concentration-based)
      if (useCompartments) {
        for (const compId of compartments.keys()) {
          const compPattern = new RegExp(`\\s*\\*\\s*__compartment_${compId}__\\s*`, 'g');
          rate = rate.replace(compPattern, '');
          const compPattern2 = new RegExp(`\\s*\\*\\s*${compId}\\s*`, 'g');
          rate = rate.replace(compPattern2, '');
          // Handle division by volume which appears in 2nd order SBML rates
          const divCompPattern = new RegExp(`\\s*\\/\\s*__compartment_${compId}__\\s*`, 'g');
          rate = rate.replace(divCompPattern, ''); // Remove the division
        }
      }

      rate = bnglFunction(
        rate,
        rxnId,
        rxn.reactants.map(r => r.species),
        Array.from(compartments.keys()),
        new Map(Array.from(parameterDict.entries()).map(([k, v]) => [k, Number(v)])),
        new Map(),
        options.assignmentRuleVariables,
        new Set(sbmlSpecies.keys()),
        speciesToHasOnlySubstanceUnits,
        new Set(),
        options.speciesAmts || new Set(),
        sbmlToBnglId
      );
    }

    const reactantCounts = new Map<string, number>();
    let totalStoichiometry = 0;
    for (const ref of rxn.reactants) {
      if (ref.species === 'EmptySet') continue;
      const stoich = ref.stoichiometry || 1;
      reactantCounts.set(ref.species, (reactantCounts.get(ref.species) || 0) + stoich);
      totalStoichiometry += stoich;
    }

    const ruleCompId = rxn.compartment || (rxn.reactants[0]?.species ? sbmlSpecies.get(rxn.reactants[0].species)?.compartment : rxn.products[0]?.species ? sbmlSpecies.get(rxn.products[0].species)?.compartment : '');
    // Standard scaling: Restore one factor of V that was removed from the rate expression
    const vScale = (useCompartments && ruleCompId && totalStoichiometry > 0) ? `(__compartment_${standardizeName(ruleCompId)}__)` : '1';

    let finalRate: string;

    let denominatorContent = '';
    const divMatch = rate.match(/\/\s*\(/);
    if (divMatch) {
      const divIdx = divMatch.index!;
      let parenDepth = 0;
      for (let i = divIdx; i < rate.length; i++) {
        if (rate[i] === '(') parenDepth++;
        else if (rate[i] === ')') {
          if (--parenDepth === 0) {
            denominatorContent = rate.substring(divIdx + 1, i);
            break;
          }
        }
      }
    }

    let hasDenominator = denominatorContent.includes('+');
    let satSubstrate: string | null = null;
    if (hasDenominator) {
      for (const spId of reactantCounts.keys()) {
        const spName = standardizeName(spId);
        if (denominatorContent.includes(`${spName}_amt`) || denominatorContent.includes(`_c_${spName}()`)) {
          satSubstrate = spId;
          break;
        }
      }
    }

    const divisorParts: string[] = [];
    if (hasDenominator && satSubstrate && reactantCounts.size > 1) {
      for (const [spId, stoich] of reactantCounts) {
        const name = standardizeName(spId);
        if (spId === satSubstrate) divisorParts.push(`${name}_amt`);
        else divisorParts.push(`(${name}_amt * ${name}_amt)`);
      }
    } else {
      for (const [spId, stoich] of reactantCounts) {
        const name = standardizeName(spId);
        divisorParts.push(stoich === 1 ? `${name}_amt` : `((${name}_amt^${stoich})/${getFactorial(stoich)})`);
      }
    }
    const divisor = divisorParts.length > 0 ? '(' + divisorParts.join('*') + ')' : '1';

    // Check if Sat/MM/Hill macro is used
    const isSaturationRateLaw = /\b(Sat|MM|Hill)\s*\(/.test(rate);

    if (isSaturationRateLaw) {
      const satPrefix = (vScale !== '1') ? `(${rate}) * ${vScale}` : rate;
      finalRate = (divisor !== '1') ? `(${satPrefix}) / (${divisor})` : satPrefix;
    } else {
      const reactantIds: string[] = Array.from(reactantCounts.keys());

      let rateAlreadyIncludesReactants = false;
      for (const [spId, stoich] of reactantCounts) {
        const spName = standardizeName(spId);
        const concPattern = new RegExp(`_c_${spName}\\(\\)`, 'i');
        const amtPattern = new RegExp(`${spName}_amt`, 'i');
        if (concPattern.test(rate) || amtPattern.test(rate)) {
          const concMatches = rate.match(new RegExp(`_c_${spName}\\(\\)`, 'gi')) || [];
          const amtMatches = rate.match(new RegExp(`${spName}_amt`, 'gi')) || [];
          if (concMatches.length + amtMatches.length >= stoich) {
            rateAlreadyIncludesReactants = true;
            break;
          }
        }
      }

      // Catalyst/Saturation heuristics
      const catalysts = new Set<string>();
      for (const ref of rxn.reactants) {
        if (ref.species === 'EmptySet') continue;
        for (const prodRef of rxn.products) {
          if (ref.species === prodRef.species) catalysts.add(ref.species);
        }
      }

      let denominatorContent = '';
      const divMatch = rate.match(/\/\s*\(/);
      if (divMatch) {
        const divIdx = divMatch.index!;
        let parenDepth = 0;
        for (let i = divIdx; i < rate.length; i++) {
          if (rate[i] === '(') parenDepth++;
          else if (rate[i] === ')') {
            if (--parenDepth === 0) {
              denominatorContent = rate.substring(divIdx + 1, i);
              break;
            }
          }
        }
      }

      let hasDenominator = denominatorContent.includes('+');
      let satSubstrate: string | null = null;
      if (hasDenominator) {
        for (const spId of reactantCounts.keys()) {
          const spName = standardizeName(spId);
          if (denominatorContent.includes(`${spName}_amt`) || denominatorContent.includes(`_c_${spName}()`)) {
            satSubstrate = spId;
            break;
          }
        }
      }

      let modifiedRate = rate;
      const divisorParts: string[] = [];
      if (hasDenominator && satSubstrate && reactantCounts.size > 1) {
        // Saturation specific divisor logic (from vetoed version)
        for (const [spId, stoich] of reactantCounts) {
          const name = standardizeName(spId);
          if (spId === satSubstrate) divisorParts.push(`${name}_amt`);
          else if (catalysts.has(spId)) {
            // Catalyst in numerator handled here
            const catPattern = new RegExp(`\\s*\\*\\s*(${name}_amt|_c_${name}\\(\\))\\s*`, 'g');
            modifiedRate = modifiedRate.replace(catPattern, ' ');
            totalStoichiometry -= stoich;
          } else {
            divisorParts.push(`(${name}_amt * ${name}_amt)`);
            totalStoichiometry -= stoich;
          }
        }
      } else {
        for (const [spId, stoich] of reactantCounts) {
          const name = standardizeName(spId);
          divisorParts.push(stoich === 1 ? `${name}_amt` : `((${name}_amt^${stoich})/${getFactorial(stoich)})`);
        }
      }

      const divisor = divisorParts.length > 0 ? '(' + divisorParts.join('*') + ')' : '1';
      const reactantSpeciesMap = new Map<string, Species>();
      for (const spId of reactantCounts.keys()) {
        const sp = sbmlSpecies.get(spId);
        if (sp?.name) {
          try {
            const parsed = readFromString(sp.name);
            if (parsed.molecules.length > 0) reactantSpeciesMap.set(spId, parsed);
          } catch { }
        }
      }

      const cleanedRate = extractStatisticalFactors(modifiedRate, reactantSpeciesMap);
      const atomizedRatePrefix = (vScale !== '1') ? `(${cleanedRate}) * ${vScale}` : cleanedRate;

      if (divisor !== '1') finalRate = `(${atomizedRatePrefix}) / (${divisor})`;
      else finalRate = atomizedRatePrefix;

      const massActionK = checkMassAction(modifiedRate, divisor, vScale, parameterDict, compartments, speciesToCompartment, options.assignmentRuleVariables);
      if (massActionK !== null) finalRate = String(massActionK);
    }

    const reactants = reactantStrs.length > 0 ? reactantStrs.join(' + ') : '0';
    const products = productStrs.length > 0 ? productStrs.join(' + ') : '0';
    const arrow = rxn.reversible ? '<->' : '->';
    lines.push(`${standardizeName(rxn.name || rxnId)}: ${reactants} ${arrow} ${products} ${finalRate}`);
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
  speciesToCompartment: Map<string, string>,
  speciesToHasOnlySubstanceUnits: Map<string, boolean>,
  options: AtomizerOptions,
  sbmlToBnglId: Map<string, string> = new Map(),
  idToPattern: Map<string, string> = new Map()
): string {
  const lines: string[] = [];
  const useCompartments = compartments.size > 0;

  for (const [rxnId, rxn] of reactions) {
    const reactantStrs: string[] = [];
    const productStrs: string[] = [];

    // Build reactants using translated structures
    for (const ref of rxn.reactants) {
      if (ref.species === 'EmptySet') continue;

      const translated = translator.get(ref.species);
      const entry = sct.entries.get(ref.species);
      const compId = speciesToCompartment.get(ref.species) || rxn.compartment || '';

      let speciesStr = '';
      if (translated || (entry && entry.structure)) {
        const mol = translated || entry!.structure!;
        mol.renumberBonds();

        const speciesCompSuffix = compId ? `@${standardizeName(compId)}` : '';
        const pattern = mol.molecules.map(m => {
          const molStr = m.toString(true);
          if (molStr.includes('@')) return molStr.replace(/^(\w+)/, 'M_$1');
          return molStr.replace(/^(\w+)/, 'M_$1') + speciesCompSuffix;
        }).join('.');
        speciesStr = pattern;
      }
      if (speciesStr) {
        for (let i = 0; i < (ref.stoichiometry || 1); i++) reactantStrs.push(speciesStr);
      }
    }

    // Build products
    for (const ref of rxn.products) {
      if (ref.species === 'EmptySet') continue;

      const translated = translator.get(ref.species);
      const entry = sct.entries.get(ref.species);
      const speciesCompId = speciesToCompartment.get(ref.species) || rxn.compartment || '';

      let speciesPattern = '';
      if (translated || (entry && entry.structure)) {
        const mol = translated || entry!.structure!;
        const compSuffix = speciesCompId ? `@${standardizeName(speciesCompId)}` : '';
        speciesPattern = mol.molecules.map(m => {
          const molStr = m.toString(true);
          if (molStr.includes('@')) return molStr.replace(/^(\w+)/, 'M_$1');
          return molStr.replace(/^(\w+)/, 'M_$1') + compSuffix;
        }).join('.');
      }
      if (speciesPattern) {
        for (let i = 0; i < (ref.stoichiometry || 1); i++) productStrs.push(speciesPattern);
      }
    }

    // ─── NEW: Unified rate processing ───
    const processed = processReactionRate(
      rxn,
      rxnId,
      functionDefinitions,   // Pass the model's functionDefinitions map
      compartments,
      parameterDict,
      speciesToCompartment,
      speciesToHasOnlySubstanceUnits,
      options,
      sbmlToBnglId,
      bnglFunction,       // Pass reference to existing bnglFunction
      checkMassAction,    // Pass reference to existing checkMassAction
    );

    const finalRate = processed.rateString;

    // If reversible split failed, force to irreversible
    const arrow = (rxn.reversible && !processed.forceIrreversible) ? '<->' : '->';

    const reactants = reactantStrs.length > 0 ? reactantStrs.join(' + ') : '0';
    const products = productStrs.length > 0 ? productStrs.join(' + ') : '0';
    lines.push(`${standardizeName(rxn.name || rxnId)}: ${reactants} ${arrow} ${products} ${finalRate}`);
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
  seedSpecies: SeedSpeciesEntry[],
  options: AtomizerOptions
): BNGLGenerationResult {
  console.error("DEBUG_MARKER: EXECUTING CONSOLIDATED BNGLWRITER VERSION 4.0");
  const warnings: string[] = [];
  const observableMap = new Map<string, string>();

  const sections: string[] = [];

  // Collect assignment rules for processing
  const assignmentRules: Array<{ variable: string; math: string }> = [];
  const assignmentRuleVariables = new Set<string>();

  if (model.rules) {
    for (const rule of model.rules) {
      if (rule.type === 'assignment' && rule.variable) {
        assignmentRules.push({ variable: rule.variable, math: rule.math });
        assignmentRuleVariables.add(standardizeName(rule.variable));
      }
    }
  }

  // Handle Initial Assignments
  if (model.initialAssignments) {
    for (const ia of model.initialAssignments) {
      const name = standardizeName(ia.symbol);
      if (!model.species.has(ia.symbol) && !assignmentRuleVariables.has(name)) {
        assignmentRules.push({ variable: ia.symbol, math: ia.math });
        assignmentRuleVariables.add(name);
      }
    }
  }

  // Build species to compartment map for volume scaling in math
  const speciesToCompartment = new Map<string, string>();
  const speciesToHasOnlySubstanceUnits = new Map<string, boolean>();
  for (const [id, sp] of model.species) {
    speciesToCompartment.set(id, sp.compartment);
    const isActuallyAmount = sp.hasOnlySubstanceUnits;
    speciesToHasOnlySubstanceUnits.set(id, isActuallyAmount);
  }

  // Add assignment variables to options for lower-level writers to use
  options = { ...options, assignmentRuleVariables };

  // Header comment
  sections.push(`# BNGL model generated from SBML`);
  sections.push(`# Model: ${model.name}`);
  sections.push(`# Species: ${model.species.size}, Reactions: ${model.reactions.size}`);
  sections.push('');

  /* REMOVED: setOption("NumberPerQuantityUnit") to avoid unintended scaling with Avogadro's number */

  // Issue 4: Ensure all structures in seedSpecies are canonicalized
  for (const s of seedSpecies) {
    s.species.renumberBonds();
  }

  sections.push('begin model');
  sections.push('');

  // Parameters
  sections.push(writeParameters(model.parameters, model.compartments, assignmentRuleVariables));

  // Compartments
  if (model.compartments.size > 0) {
    sections.push(writeCompartments(model.compartments));
  }

  // Molecule types
  const molTypeAnnotations = new Map<string, string>();
  for (const mol of moleculeTypes) {
    const entry = Array.from(sct.entries.values()).find(
      e => e.isElemental && standardizeName(e.structure.molecules[0]?.name) === standardizeName(mol.name)
    );
    if (entry) {
      molTypeAnnotations.set(`M_${mol.toString()}`, entry.sbmlId);
    }
  }
  sections.push(writeMoleculeTypes(moleculeTypes, molTypeAnnotations));

  // Seed species
  const { section: speciesSection, patternToId, sbmlToBnglId, idToPattern } = writeSeedSpecies(seedSpecies, model.compartments, sct, speciesToCompartment, options.atomize);
  if (speciesSection) sections.push(speciesSection);

  // Observables
  const {
    lines: observableLines,
    writtenRules: observableRules,
    speciesAmts,
    assignmentRuleCompartments,
  } = writeObservables(
    model.species,
    sct,
    assignmentRules,
    speciesToCompartment,
    speciesToHasOnlySubstanceUnits,
    options,
    patternToId,
    sbmlToBnglId,
    idToPattern
  );
  sections.push(sectionTemplate('observables', observableLines));

  // Pass speciesAmts to options so it reaches reaction writers
  options = { ...options, speciesAmts };

  for (const [id, sp] of model.species) {
    const name = standardizeName(id);
    observableMap.set(id, name);
  }

  // Functions (includes assignment rules and concentration scaling)
  const paramDict = new Map<string, number | string>();
  for (const [id, param] of model.parameters) {
    paramDict.set(id, param.value);
  }

  sections.push(writeFunctions(model.functionDefinitions, assignmentRules, paramDict, speciesToCompartment, speciesToHasOnlySubstanceUnits, observableRules, speciesAmts, assignmentRuleCompartments, sbmlToBnglId));

  // Reaction rules
  if (options.atomize) {
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
      speciesToCompartment,
      speciesToHasOnlySubstanceUnits,
      options,
      sbmlToBnglId,
      idToPattern
    ));
  } else {
    sections.push(writeReactionRulesFlat_V2(
      model.reactions,
      model.species,
      sct,
      model.compartments,
      paramDict,
      model.functionDefinitions,
      speciesToCompartment,
      speciesToHasOnlySubstanceUnits,
      options,
      sbmlToBnglId,
      idToPattern
    ));
  }

  sections.push('end model');
  sections.push('');

  // Add simulation commands
  sections.push('# Simulation commands');
  if (options.actions) {
    let actions = options.actions.trim();

    // Filter out problematic action commands
    const filteredLines = actions.split('\n').filter(line => {
      const trimmed = line.trim();
      return !(
        /^writeMfile\s*\(/.test(trimmed) ||
        /^writeMexfile\s*\(/.test(trimmed) ||
        /^writeSBML\s*\(/.test(trimmed) ||
        /^writeXML\s*\(/.test(trimmed) ||
        /^writeNetwork\s*\(/.test(trimmed) ||
        /^writeSSC\s*\(/.test(trimmed) ||
        /^writeFile\s*\(/.test(trimmed) ||
        /^writeModel\s*\(/.test(trimmed) ||
        /^visualize\s*\(/.test(trimmed)
      );
    });
    actions = filteredLines.join('\n');

    // Translate species references in actions to standardized BNGL names
    const translationMap = new Map<string, string>();
    for (const [id, entry] of sct.entries) {
      if (entry.isElemental) {
        const bnglName = standardizeName(entry.sbmlId);
        const compId = speciesToCompartment.get(entry.sbmlId);
        const suffix = compId ? `@${standardizeName(compId)}` : '';
        translationMap.set(id, `M_${bnglName}${suffix}`);
      }
    }
    for (const [id, sp] of model.species) {
      const entry = sct.entries.get(id);
      let bnglPattern = '';

      const compId = speciesToCompartment.get(id);
      const suffix = compId ? `@${standardizeName(compId)}` : '';

      if (entry && entry.structure) {
        const molecules = entry.structure.molecules.map(m => {
          const molStr = m.toString(true);
          const molWithPrefix = molStr.replace(/^(\w+)/, 'M_$1');
          return molWithPrefix;
        }).join('.');

        if (!molecules.includes('@') && compId) {
          const compSuffix = `@${standardizeName(compId)}`;
          bnglPattern = molecules.split('.').map(m => m + compSuffix).join('.');
        } else {
          bnglPattern = molecules;
        }
      } else {
        const bnglName = standardizeName(id);
        const suffix = compId ? `@${standardizeName(compId)}` : '';
        bnglPattern = `M_${bnglName}${suffix}`;
      }

      translationMap.set(id, bnglPattern);
      if (sp.name && sp.name !== id) {
        if (!translationMap.has(sp.name)) {
          translationMap.set(sp.name, bnglPattern);
        }

        if (sp.name.endsWith('()')) {
          const stripped = sp.name.slice(0, -2);
          if (!translationMap.has(stripped)) {
            translationMap.set(stripped, bnglPattern);
          }
        }

        if (sp.name.startsWith('@')) {
          const parts = sp.name.split('::');
          if (parts.length > 1) {
            const stripped = parts.slice(1).join('::');
            if (!translationMap.has(stripped)) {
              translationMap.set(stripped, bnglPattern);
            }
          } else {
            const parts2 = sp.name.split(':');
            if (parts2.length > 1) {
              const stripped = parts2.slice(1).join(':');
              if (!translationMap.has(stripped)) {
                translationMap.set(stripped, bnglPattern);
              }
            }
          }
        }

        const perms = getPermutatedKeys(sp.name);
        for (const p of perms) {
          if (!translationMap.has(p)) {
            translationMap.set(p, bnglPattern);
          }
        }
      }
    }

    const sortedKeys = Array.from(translationMap.keys()).sort((a, b) => b.length - a.length);

    for (const key of sortedKeys) {
      const bnglPattern = translationMap.get(key)!;
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const endBoundary = /\w$/.test(key) ? '\\b' : '';
      const optionalPattern = key.includes('(') ? '' : '(?:\\([^)]*\\))?';
      const regex = new RegExp(`\\b${escaped}${endBoundary}${optionalPattern}`, 'g');

      actions = actions.replace(regex, (match) => {
        if (key.includes('(')) {
          return bnglPattern;
        }

        if (match.includes('(')) {
          const molecules = match.split('(')[1];
          // If bnglPattern already includes sites or a compartment, we need to be careful
          if (bnglPattern.includes('@')) {
            // Pattern@Comp -> Pattern(sites)@Comp
            const [pat, comp] = bnglPattern.split('@');
            if (pat.endsWith(')')) {
              return pat.substring(0, pat.length - 1) + ',' + molecules + '@' + comp;
            } else {
              return pat + '(' + molecules + '@' + comp;
            }
          }
          if (bnglPattern.endsWith('()')) {
            return bnglPattern.replace('()', '(' + molecules);
          } else if (bnglPattern.endsWith(')')) {
            return bnglPattern.substring(0, bnglPattern.length - 1) + ',' + molecules;
          } else {
            return bnglPattern + '(' + molecules;
          }
        }
        return bnglPattern;
      });
    }

    if (actions.toLowerCase().startsWith('begin actions')) {
      const lowerActions = actions.toLowerCase();
      const endIdx = lowerActions.lastIndexOf('end actions');
      if (endIdx !== -1) {
        actions = actions.substring(13, endIdx).trim();
      } else {
        actions = actions.substring(13).trim();
      }
    }

    const actionLines: string[] = [];
    actionLines.push('begin actions');

    if (!actions.includes('generate_network')) {
      actionLines.push('    generate_network({overwrite=>1})');
    } else {
      actions = actions.replace(/generate_network\s*\(\s*\{?\s*\)?\s*\)/g, 'generate_network({overwrite=>1})');
      if (actions.includes('generate_network') && !actions.includes('overwrite')) {
        actions = actions.replace(/generate_network\s*\(\s*\{/g, 'generate_network({overwrite=>1,');
      }
    }

    if (actions) {
      // Ensure mxstep is set for simulate if method is ode
      if (actions.includes('simulate') && actions.includes('"ode"') && !actions.includes('mxstep')) {
        actions = actions.replace(/simulate\s*\(\s*\{/g, 'simulate({mxstep=>1e8,');
        if (!actions.includes('{')) {
          actions = actions.replace(/simulate\s*\(\s*\)/g, 'simulate({mxstep=>1e8})');
        }
      }
      actionLines.push('    ' + actions);
    } else {
      const tEnd = options.tEnd ?? 10;
      const nSteps = options.nSteps ?? 100;
      actionLines.push(`    simulate({method=>"ode",t_end=>${tEnd},n_steps=>${nSteps},mxstep=>1e8})`);
    }
    actionLines.push('end actions');
    sections.push(actionLines.join('\n'));
  } else {
    sections.push('begin actions');
    sections.push('    generate_network({overwrite=>1})');
    const tEnd = options.tEnd ?? 10;
    const nSteps = options.nSteps ?? 100;
    sections.push(`    simulate({method=>"ode",t_end=>${tEnd},n_steps=>${nSteps},mxstep=>1e8})`);
    sections.push('end actions');
  }

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
  // Clean up 0() patterns (zero-order) while avoiding species named like S0()
  finalString = finalString.replace(/(^|\s)0\(\)(?=\s|$)/g, '$1 0');

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
    app = `${species}${tags}`;
  } else {
    const sp = translator.get(species)!;
    sp.addCompartment(tags);
    sp.renumberBonds();
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

/**
 * Combinatorial factor (factorial) for rate law correction
 */
function getFactorial(n: number): number {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

/**
 * Check if the rate law is effectively Mass Action by numerical verification.
 * Returns the effective rate constant if consistent, otherwise null.
 */
function checkMassAction(
  rateExpr: string,
  divisorExpr: string,
  vScaleExpr: string,
  parameterDict: Map<string, number | string>,
  compartments: Map<string, SBMLCompartment>,
  speciesToCompartment: Map<string, string>,
  assignmentRuleVariables: Set<string> = new Set()
): number | null {
  const toJs = (expr: string) => {
    return expr
      .replace(/\^/g, '**')
      .replace(/\bln\b/g, 'Math.log')
      .replace(/\bexp\b/g, 'Math.exp')
      .replace(/\blog\b/g, 'Math.log10')
      .replace(/\bsin\b/g, 'Math.sin')
      .replace(/\bcos\b/g, 'Math.cos')
      .replace(/\btan\b/g, 'Math.tan')
      .replace(/\btime\b/g, '0');
  };

  const context: any = {};
  for (const [key, val] of parameterDict) {
    context[key] = Number(val);
    context[standardizeName(key)] = Number(val);
  }

  for (const [id, comp] of compartments) {
    const sId = standardizeName(id);
    const size = comp.size || 1;
    context[`__compartment_${sId}__`] = size;
    context[sId] = size;
  }

  let jsRate = toJs(rateExpr);
  let jsDiv = toJs(divisorExpr);
  let jsVScale = toJs(vScaleExpr);

  // Unify concentration and amount references: replace _c_NAME() and NAME_amt
  // During check, we want to know if (Rate / (Reactant1 * Reactant2 ...)) is constant.
  // We must be careful about V vs 1. 
  // If BNGL uses amounts, Mass Action is k * (A / V) * (B / V) * V = k * A * B / V.
  // If SBML rate is k * _c_A() * _c_B() * V, then dividing by (A_amt * B_amt) should give k/V.

  const vars = new Set<string>();
  for (const sId of speciesToCompartment.keys()) {
    const name = standardizeName(sId);
    const amtName = `${name}_amt`;
    const concName = `_c_${name}(\\(\\))?`;

    const nameRegex = new RegExp(`\\b${name}\\b`, 'g');
    const amtRegex = new RegExp(`\\b${amtName}\\b`, 'g');
    const concRegex = new RegExp(`\\b${concName}`, 'g');

    // Replace concentration calls with (name / V)
    jsRate = jsRate.replace(concRegex, `(${name} / V)`);
    jsDiv = jsDiv.replace(concRegex, `(${name} / V)`);
    jsVScale = jsVScale.replace(concRegex, `(${name} / V)`);

    // Replace amount references with name
    jsRate = jsRate.replace(amtRegex, name);
    jsDiv = jsDiv.replace(amtRegex, name);
    jsVScale = jsVScale.replace(amtRegex, name);

    // Final pass for plain names
    jsRate = jsRate.replace(nameRegex, name);
    jsDiv = jsDiv.replace(nameRegex, name);
    jsVScale = jsVScale.replace(nameRegex, name);

    if (new RegExp(`\\b${name}\\b`).test(jsRate) ||
      new RegExp(`\\b${name}\\b`).test(jsDiv) ||
      new RegExp(`\\b${name}\\b`).test(jsVScale)) {
      vars.add(name);
    }
  }

  for (const param of parameterDict.keys()) {
    const pName = standardizeName(param);
    if (assignmentRuleVariables.has(pName)) continue;
    const pRegex = new RegExp(`\\b${pName}\\(\\)`, 'g');
    jsRate = jsRate.replace(pRegex, pName);
  }

  const evalExpr = `(${jsRate}) * (${jsVScale}) / (${jsDiv})`;

  // Strip () from variables in vars for JS evaluation
  let jsEvalExpr = evalExpr;
  for (const v of vars) {
    const vRegex = new RegExp(`\\b${v}\\(\\)`, 'g');
    jsEvalExpr = jsEvalExpr.replace(vRegex, v);
  }

  try {

    const keys = Object.keys(context);
    const values = Object.values(context);

    const varList = Array.from(vars);

    const results: number[] = [];

    for (let i = 0; i < 3; i++) {
      const localContext = { ...context };
      localContext['V'] = Math.random() * 10 + 1; // Random Volume

      for (const pId of assignmentRuleVariables) {
        localContext[standardizeName(pId)] = Math.random() * 10 + 1;
      }
      for (const v of varList) {
        localContext[v] = Math.random() * 1000 + 1;
      }

      const allKeys = [...keys, 'V', ...varList];
      const allValues = [...values, localContext['V'], ...varList.map(v => localContext[v])];

      try {
        let evalExprV = jsEvalExpr.replace(/\^/g, '**');
        const f = new Function(...allKeys, `return ${evalExprV};`);
        const result = f(...allValues);

        if (!Number.isFinite(result) || Number.isNaN(result)) return null;
        results.push(result);
      } catch (e) {
        return null;
      }
    }

    const mean = results.reduce((a, b) => a + b, 0) / results.length;
    if (Math.abs(mean) < 1e-12) return 0;

    const variance = results.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / results.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / (Math.abs(mean) + 1e-60);

    if (cv < 0.0001) {
      return mean;
    }

  } catch (e) {
    return null;
  }

  return null;
}


// ─────────────────────────────────────────────────────────────────────────────
// FIX 1 — SBML Function Inlining
// ─────────────────────────────────────────────────────────────────────────────

export function inlineSBMLFunctions(
  rateExpr: string,
  functionDefs: Map<string, SBMLFunctionDefinition>
): string {
  let result = rateExpr;
  let modified = true;
  let iterations = 0;
  const MAX_ITERATIONS = 20; // Guard against infinite recursion in mutually-recursive defs

  while (modified && iterations < MAX_ITERATIONS) {
    modified = false;
    iterations++;

    for (const [funcId, funcDef] of functionDefs) {
      // Check if funcId appears as a function call in the expression
      const callRegex = new RegExp(`\\b${funcId}\\s*\\(`);
      if (!callRegex.test(result)) continue;

      // Use parenthesis-aware replacement
      const expanded = expandFunctionCall(result, funcId, funcDef);
      if (expanded !== result) {
        result = expanded;
        modified = true;
        break; // Restart the loop since new calls may have been introduced
      }
    }
  }

  return result;
}

function expandFunctionCall(
  expr: string,
  funcName: string,
  funcDef: SBMLFunctionDefinition
): string {
  let result = expr;
  const regexStr = `\\b${funcName}\\s*\\(`;

  // Process each occurrence (re-search from start since positions shift)
  while (true) {
    const regex = new RegExp(regexStr);
    const match = result.match(regex);
    if (!match || match.index === undefined) break;

    const startIndex = match.index;
    // Find the matching close paren
    let parenCount = 1;
    let i = startIndex + match[0].length;
    while (parenCount > 0 && i < result.length) {
      if (result[i] === '(') parenCount++;
      else if (result[i] === ')') parenCount--;
      i++;
    }

    if (parenCount !== 0) break; // Unmatched parens, bail

    const inner = result.substring(startIndex + match[0].length, i - 1);
    const actualArgs = splitArguments(inner);

    // Build the substituted body
    let body = funcDef.math;
    const formalArgs = funcDef.arguments;

    // The last "argument" in SBML lambda is actually the body — skip it if
    // the function def already has it separated into .math
    // Substitute each formal parameter with the actual argument
    for (let j = 0; j < Math.min(formalArgs.length, actualArgs.length); j++) {
      const formalName = formalArgs[j].trim();
      const actualValue = actualArgs[j].trim();
      // Word-boundary replacement to avoid partial matches
      const paramRegex = new RegExp(`\\b${formalName}\\b`, 'g');
      body = body.replace(paramRegex, `(${actualValue})`);
    }

    // Replace the function call with the parenthesized body
    result = result.substring(0, startIndex) + `(${body})` + result.substring(i);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 2 — Reversible Reaction Splitting
// ─────────────────────────────────────────────────────────────────────────────

export interface ReversibleRateSplit {
  success: boolean;
  forwardRate: string;
  reverseRate: string;
}

export function splitReversibleRate(rateExpr: string): ReversibleRateSplit {
  const terms = extractTopLevelAdditiveTerms(rateExpr.trim());

  if (terms.length < 2) {
    return { success: false, forwardRate: rateExpr, reverseRate: '0' };
  }

  const positiveTerms: string[] = [];
  const negativeTerms: string[] = [];

  for (const term of terms) {
    const trimmed = term.trim();
    if (trimmed.startsWith('-')) {
      // Negative term — strip the leading minus and flip sign
      const body = trimmed.substring(1).trim();
      if (body.length > 0) {
        negativeTerms.push(body);
      }
    } else if (trimmed.startsWith('+')) {
      const body = trimmed.substring(1).trim();
      if (body.length > 0) {
        positiveTerms.push(body);
      }
    } else {
      positiveTerms.push(trimmed);
    }
  }

  if (positiveTerms.length === 0 || negativeTerms.length === 0) {
    return { success: false, forwardRate: rateExpr, reverseRate: '0' };
  }

  const forwardRate = positiveTerms.length === 1
    ? positiveTerms[0]
    : positiveTerms.map(t => `(${t})`).join(' + ');

  const reverseRate = negativeTerms.length === 1
    ? negativeTerms[0]
    : negativeTerms.map(t => `(${t})`).join(' + ');

  return { success: true, forwardRate, reverseRate };
}

function extractTopLevelAdditiveTerms(expr: string): string[] {
  const terms: string[] = [];
  let depth = 0;
  let currentStart = 0;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && (ch === '+' || ch === '-') && i > 0) {
      // Check it's not inside a number exponent like "1e-5" or a unary minus
      const before = expr[i - 1];
      if (before === 'e' || before === 'E') {
        // Part of scientific notation, skip
        continue;
      }
      // Check it's not a unary operator right after another operator or open paren
      if (before === '*' || before === '/' || before === '^' || before === '(') {
        continue;
      }

      const term = expr.substring(currentStart, i).trim();
      if (term.length > 0) {
        terms.push(term);
      }
      currentStart = i; // Include the sign character in the next term
    }
  }

  // Last term
  const lastTerm = expr.substring(currentStart).trim();
  if (lastTerm.length > 0) {
    terms.push(lastTerm);
  }

  return terms;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 3 — Unified Rate Processing Pipeline with split_rxn Fallback
// ─────────────────────────────────────────────────────────────────────────────

export interface ProcessedRate {
  rateString: string;
  forceIrreversible: boolean;
  isSplitRxn: boolean;
}

export function processReactionRate(
  rxn: SBMLReaction,
  rxnId: string,
  functionDefs: Map<string, SBMLFunctionDefinition>,
  compartments: Map<string, SBMLCompartment>,
  parameterDict: Map<string, number | string>,
  speciesToCompartment: Map<string, string>,
  speciesToHasOnlySubstanceUnits: Map<string, boolean>,
  options: AtomizerOptions,
  sbmlToBnglId: Map<string, string>,
  // Pass these as callbacks so we don't duplicate your existing logic
  bnglFunctionFn: (
    rule: string, functionTitle: string, reactants: string[],
    compartments: string[], parameterDict: Map<string, number>,
    reactionDict: Map<string, string>, assignmentRuleVariables: Set<string>,
    observableIds: Set<string>, speciesToHasOnlySubstanceUnits: Map<string, boolean>,
    observableConvertedRules: Set<string>, speciesWithConcFunctions: Set<string>,
    sbmlToBnglId: Map<string, string>
  ) => string,
  checkMassActionFn: (
    rateExpr: string, divisorExpr: string, vScaleExpr: string,
    parameterDict: Map<string, number | string>, compartments: Map<string, SBMLCompartment>,
    speciesToCompartment: Map<string, string>, assignmentRuleVariables: Set<string>
  ) => number | null,
): ProcessedRate {

  if (!rxn.kineticLaw) {
    return { rateString: '0', forceIrreversible: false, isSplitRxn: false };
  }

  // ── Step 1: Get raw rate and substitute local parameters ──
  let rate = rxn.kineticLaw.math;
  for (const localParam of rxn.kineticLaw.localParameters) {
    const regex = new RegExp(`\\b${localParam.id}\\b`, 'g');
    if (options.replaceLocParams) {
      rate = rate.replace(regex, String(localParam.value));
    } else {
      rate = rate.replace(regex, standardizeName(`${rxnId}_${localParam.id}`));
    }
  }

  // ── Step 2: Inline SBML function definitions (FIX 1) ──
  rate = inlineSBMLFunctions(rate, functionDefs);

  // ── Step 3: Strip compartment volumes from rate expression ──
  const useCompartments = compartments.size > 0;
  if (useCompartments) {
    for (const compId of compartments.keys()) {
      // Strip "* compartment" and "/ compartment" patterns
      const patterns = [
        new RegExp(`\\s*\\*\\s*__compartment_${compId}__\\s*`, 'g'),
        new RegExp(`\\s*\\*\\s*${compId}\\s*`, 'g'),
        new RegExp(`\\s*\\/\\s*__compartment_${compId}__\\s*`, 'g'),
        new RegExp(`\\s*\\/\\s*${compId}\\s*`, 'g'),
      ];
      for (const pat of patterns) {
        rate = rate.replace(pat, ' ');
      }
    }
    rate = rate.trim();
    if (!rate) rate = '1';
  }

  // ── Step 4: Convert to BNGL math ──
  const convertedRate = bnglFunctionFn(
    rate,
    rxnId,
    rxn.reactants.map(r => r.species),
    Array.from(compartments.keys()),
    new Map(Array.from(parameterDict.entries()).map(([k, v]) => [k, Number(v)])),
    new Map(),
    options.assignmentRuleVariables || new Set(),
    new Set(speciesToCompartment.keys()),
    speciesToHasOnlySubstanceUnits,
    options.observableConvertedRules || new Set(),
    options.speciesAmts || new Set(),
    sbmlToBnglId,
  );

  // ── Step 5: Build reactant counts and volume scale ──
  const reactantCounts = new Map<string, number>();
  let totalStoichiometry = 0;
  for (const ref of rxn.reactants) {
    if (ref.species === 'EmptySet') continue;
    const stoich = ref.stoichiometry || 1;
    reactantCounts.set(ref.species, (reactantCounts.get(ref.species) || 0) + stoich);
    totalStoichiometry += stoich;
  }

  const productCounts = new Map<string, number>();
  let totalProductStoichiometry = 0;
  for (const ref of rxn.products) {
    if (ref.species === 'EmptySet') continue;
    const stoich = ref.stoichiometry || 1;
    productCounts.set(ref.species, (productCounts.get(ref.species) || 0) + stoich);
    totalProductStoichiometry += stoich;
  }

  const ruleCompId = rxn.compartment
    || (rxn.reactants[0]?.species
      ? speciesToCompartment.get(rxn.reactants[0].species) || ''
      : rxn.products[0]?.species
        ? speciesToCompartment.get(rxn.products[0].species) || ''
        : '');

  const vScaleName = (useCompartments && ruleCompId)
    ? `__compartment_${standardizeName(ruleCompId)}__`
    : '1';

  // ── Step 6: If reversible, try to split (FIX 2) ──
  if (rxn.reversible) {
    const split = splitReversibleRate(convertedRate);

    if (split.success) {
      // Process forward and reverse independently
      const fwdRate = processOneDirection(
        split.forwardRate, reactantCounts, totalStoichiometry,
        vScaleName, parameterDict, compartments, speciesToCompartment,
        options, checkMassActionFn
      );
      const revRate = processOneDirection(
        split.reverseRate, productCounts, totalProductStoichiometry,
        vScaleName, parameterDict, compartments, speciesToCompartment,
        options, checkMassActionFn
      );

      if (fwdRate.isSplitRxn || revRate.isSplitRxn) {
        // One direction couldn't be decomposed — use split_rxn fallback
        // Output the full rate as a functional rate on a unidirectional rule
        return {
          rateString: convertedRate,
          forceIrreversible: true,
          isSplitRxn: true,
        };
      }

      // Both sides decomposed successfully — output as "kf, kr"
      return {
        rateString: `${fwdRate.rateString}, ${revRate.rateString}`,
        forceIrreversible: false,
        isSplitRxn: false,
      };
    } else {
      // Can't split — fall through to irreversible processing with warning
      // The Python does: "SBML claims reversibility but kinetic law is not
      // easily separated. Assuming irreversible."
      return {
        rateString: processOneDirection(
          convertedRate, reactantCounts, totalStoichiometry,
          vScaleName, parameterDict, compartments, speciesToCompartment,
          options, checkMassActionFn
        ).rateString,
        forceIrreversible: true,
        isSplitRxn: false,
      };
    }
  }

  // ── Step 7: Irreversible — process single direction ──
  const result = processOneDirection(
    convertedRate, reactantCounts, totalStoichiometry,
    vScaleName, parameterDict, compartments, speciesToCompartment,
    options, checkMassActionFn
  );

  return {
    rateString: result.rateString,
    forceIrreversible: false,
    isSplitRxn: result.isSplitRxn,
  };
}

interface DirectionResult {
  rateString: string;
  isSplitRxn: boolean;
}

function processOneDirection(
  rateExpr: string,
  speciesCounts: Map<string, number>,
  totalStoichiometry: number,
  vScaleName: string,
  parameterDict: Map<string, number | string>,
  compartments: Map<string, SBMLCompartment>,
  speciesToCompartment: Map<string, string>,
  options: AtomizerOptions,
  checkMassActionFn: (
    rateExpr: string, divisorExpr: string, vScaleExpr: string,
    parameterDict: Map<string, number | string>, compartments: Map<string, SBMLCompartment>,
    speciesToCompartment: Map<string, string>, assignmentRuleVariables: Set<string>
  ) => number | null,
): DirectionResult {

  // Build divisor expression: product of (speciesName_amt^stoich / stoich!)
  const divisorParts: string[] = [];
  for (const [spId, stoich] of speciesCounts) {
    const name = standardizeName(spId);
    if (stoich === 1) {
      divisorParts.push(`${name}_amt`);
    } else {
      const fact = getFactorial(stoich);
      divisorParts.push(`((${name}_amt^${stoich})/${fact})`);
    }
  }
  const divisorExpr = divisorParts.length > 0 ? divisorParts.join(' * ') : '1';

  // ── Tier 1: Numerical mass-action check ──
  const maConstant = checkMassActionFn(
    rateExpr,
    divisorExpr,
    vScaleName,
    parameterDict,
    compartments,
    speciesToCompartment,
    options.assignmentRuleVariables || new Set(),
  );

  if (maConstant !== null) {
    return { rateString: String(maConstant), isSplitRxn: false };
  }

  // ── Tier 2: Reactant neutralization ──
  let modifiedRate = rateExpr;
  for (const [spId, stoich] of speciesCounts) {
    const name = standardizeName(spId);
    // Replace concentration and amount references with 1
    // Important: replace exactly the right number of occurrences for stoichiometry
    const concPattern = new RegExp(`_c_${name}\\(\\)`, 'gi');
    const amtPattern = new RegExp(`\\b${name}_amt\\b`, 'gi');

    modifiedRate = modifiedRate.replace(concPattern, '1');
    modifiedRate = modifiedRate.replace(amtPattern, '1');
  }

  // Clean up: remove residual "* 1" and "1 *" factors
  modifiedRate = modifiedRate
    .replace(/\b1\b\s*\*\s*/g, '')
    .replace(/\s*\*\s*\b1\b/g, '')
    .trim();

  if (!modifiedRate || modifiedRate === '') modifiedRate = '1';

  // ── Check for singularity (FIX 3) ──
  // If after neutralization the rate still contains species references in a
  // denominator context, this suggests we have a Michaelis-Menten or similar
  // form where the reactant is in both numerator and denominator. In that case,
  // neutralization is wrong — fall back to split_rxn (keep the full rate).
  if (hasDenominatorIssue(modifiedRate, speciesCounts)) {
    // split_rxn fallback: keep the full rate as a functional rate
    // The reaction will use the complete expression; BNG handles it via
    // pattern matching on the reactant patterns.
    const fullRate = (vScaleName !== '1')
      ? `(${rateExpr}) * ${vScaleName}`
      : rateExpr;
    return { rateString: fullRate, isSplitRxn: true };
  }

  // Normal path: apply volume scaling
  let finalRate: string;
  if (vScaleName !== '1') {
    finalRate = (modifiedRate === '1') ? vScaleName : `(${modifiedRate}) * ${vScaleName}`;
  } else {
    finalRate = modifiedRate;
  }

  return { rateString: finalRate, isSplitRxn: false };
}

function hasDenominatorIssue(
  neutralizedRate: string,
  speciesCounts: Map<string, number>
): boolean {
  // Find denominator content (everything after "/" at top level)
  const divIdx = findTopLevelDivision(neutralizedRate);
  if (divIdx === -1) return false;

  const afterDiv = neutralizedRate.substring(divIdx + 1).trim();

  // Check if the denominator contains "+" which indicates a sum (e.g., Km + S)
  // AND has "1" terms that were likely from neutralized reactants
  if (afterDiv.includes('+')) {
    // Check if any of the "1"s in the denominator correspond to neutralized species
    // Simple heuristic: if denominator has pattern like "(something + 1)" or "(1 + something)"
    if (/[\(+]\s*1\s*[+\)]/.test(afterDiv) || /[\(+]\s*1\s*$/.test(afterDiv)) {
      return true;
    }
  }

  return false;
}

function findTopLevelDivision(expr: string): number {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(' || expr[i] === '[') depth++;
    else if (expr[i] === ')' || expr[i] === ']') depth--;
    else if (expr[i] === '/' && depth === 0) return i;
  }
  return -1;
}

// ─── NEW: Patched Reaction Rule Writer ───
export function writeReactionRulesFlat_V2(
  reactions: Map<string, SBMLReaction>,
  sbmlSpecies: Map<string, SBMLSpecies>,
  sct: SpeciesCompositionTable,
  compartments: Map<string, SBMLCompartment>,
  parameterDict: Map<string, number | string>,
  functionDefinitions: Map<string, SBMLFunctionDefinition>,
  speciesToCompartment: Map<string, string>,
  speciesToHasOnlySubstanceUnits: Map<string, boolean>,
  options: AtomizerOptions,
  sbmlToBnglId: Map<string, string> = new Map(),
  idToPattern: Map<string, string> = new Map()
): string {
  const lines: string[] = [];
  const useCompartments = compartments.size > 0;

  const buildFlatPattern = (speciesId: string): string => {
    // Robust mapping first - use actual pattern instead of BNGL ID
    const bnglId = sbmlToBnglId.get(speciesId);
    if (bnglId) {
      const pattern = idToPattern.get(bnglId);
      if (pattern) return pattern;
      return bnglId;
    }

    const entry = sct.entries.get(speciesId);
    const compId = speciesToCompartment.get(speciesId);
    if (entry?.structure) {
      const molecules = entry.structure.molecules;
      const hasMoleculeCompartments = molecules.some(m => m.compartment !== '');

      if (hasMoleculeCompartments) {
        return molecules.map(m => {
          const molStr = m.toString(true);
          return molStr.replace(/^(\w+)/, 'M_$1');
        }).join('.');
      }

      if (useCompartments && compId) {
        const suffix = `@${standardizeName(compId)}`;
        return molecules.map(m => {
          const molStr = m.toString(true);
          return molStr.replace(/^(\w+)/, 'M_$1') + suffix;
        }).join('.');
      }

      return molecules.map(m => {
        const molStr = m.toString(true);
        return molStr.replace(/^(\w+)/, 'M_$1');
      }).join('.');
    }

    const sp = sbmlSpecies.get(speciesId);
    const name = standardizeName(sp?.name || speciesId);
    let pattern = `M_${name}`;
    if (useCompartments && compId) {
      pattern = `${pattern}@${standardizeName(compId)}`;
    }
    return pattern;
  };

  for (const [rxnId, rxn] of reactions) {
    const reactantStrs: string[] = [];
    const productStrs: string[] = [];

    // Build reactants
    for (const ref of rxn.reactants) {
      if (ref.species === 'EmptySet') continue;
      const speciesStr = buildFlatPattern(ref.species);

      for (let i = 0; i < (ref.stoichiometry || 1); i++) {
        reactantStrs.push(speciesStr);
      }
    }

    // Build products
    for (const ref of rxn.products) {
      if (ref.species === 'EmptySet') continue;
      const compId = speciesToCompartment.get(ref.species);
      const speciesStr = buildFlatPattern(ref.species);
      const reactantComp = rxn.reactants.length > 0 ? speciesToCompartment.get(rxn.reactants[0].species) : null;

      if (useCompartments && compId && reactantComp && reactantComp !== compId) {
        if (!areCompartmentsAdjacent(reactantComp, compId, compartments)) {
          logger.info('BNW004',
            `Transport reaction ${rxnId}: ${ref.species} moves from ${reactantComp} to ${compId}`
          );
        }
      }

      for (let i = 0; i < (ref.stoichiometry || 1); i++) {
        productStrs.push(speciesStr);
      }
    }

    // ─── NEW: Unified rate processing ───
    const processed = processReactionRate(
      rxn,
      rxnId,
      functionDefinitions,   // Pass the model's functionDefinitions map
      compartments,
      parameterDict,
      speciesToCompartment,
      speciesToHasOnlySubstanceUnits,
      options,
      sbmlToBnglId,
      bnglFunction,       // Pass reference to existing bnglFunction
      checkMassAction,    // Pass reference to existing checkMassAction
    );

    const finalRate = processed.rateString;

    // If reversible split failed, force to irreversible
    const arrow = (rxn.reversible && !processed.forceIrreversible) ? '<->' : '->';

    const reactants = reactantStrs.length > 0 ? reactantStrs.join(' + ') : '0';
    const products = productStrs.length > 0 ? productStrs.join(' + ') : '0';
    lines.push(`${standardizeName(rxn.name || rxnId)}: ${reactants} ${arrow} ${products} ${finalRate}`);
  }

  return sectionTemplate('reaction rules', lines);
}