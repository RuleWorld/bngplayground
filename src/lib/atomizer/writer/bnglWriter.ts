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
  speciesToCompartment: Map<string, string> = new Map(),
  speciesToHasOnlySubstanceUnits: Map<string, boolean> = new Map(),
  observableConvertedRules: Set<string> = new Set(),
  speciesWithConcFunctions: Set<string> = new Set()
): string {
  let result = rule;

  // Check if this is a saturation-style rate law (Sat/MM/Hill)
  // These use amount-based parameters, so we should use amounts, not concentrations
  const isSaturationRate = /\b(Sat|MM|Hill)\s*\(/.test(rule);

  // Replace species IDs
  for (const obsId of observableIds) {
    const regex = new RegExp(`\\b${obsId}\\b`, 'g');
    const bnglName = standardizeName(obsId);

    if (isSaturationRate && speciesWithConcFunctions.has(bnglName)) {
      // For saturation kinetics, use amounts directly to avoid unit mismatch
      // (K4 is in molecules, so substrate must also be in molecules)
      result = result.replace(regex, `${bnglName}_amt`);
    } else if (speciesWithConcFunctions.has(bnglName)) {
      // Normal rate laws: use concentration functions
      result = result.replace(regex, `_c_${bnglName}()`);
    }
    // Otherwise, leave it as-is (it's a parameter or constant)
  }

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

  // NOTE: We do NOT scale Sat/MM Km by volume here anymore.
  // The saturation kinetics now use amounts directly (X_amt instead of _c_X()),
  // so the parameters (K4, K6, etc.) are already in the correct units (molecules).

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
  // Protect against log(0) by adding small epsilon
  const epsilon = '1e-9';
  result = result.replace(/\blog\s*\(/g, `ln(${epsilon}+`);
  result = result.replace(/\bln\s*\(/g, `ln(${epsilon}+`);

  // Log base 10: log10(x) -> (ln(x)/ln(10))
  result = replaceNestedFunc(result, 'log10', (args) => `(ln(${epsilon}+${args[0]})/2.302585093)`);

  // Sat and MM are kept as-is (BNGL native functions)
  result = replaceNestedFunc(result, 'Sat', (args) => {
    return `Sat(${args[0]}, ${args[1]})`;
  });
  result = replaceNestedFunc(result, 'MM', (args) => {
    return `MM(${args[0]}, ${args[1]})`;
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
  model: SBMLModel
): string {
  const patterns = new Map<string, { concentration: number | string, isBoundary: boolean }>();

  for (const { species, concentration, compartment, sbmlId } of seedSpecies) {
    // Canonical string representation
    // Sort molecules by name to handle isomorphisms (A!1.B!1 vs B!1.A!1)
    const sortedMolecules = [...species.molecules].sort((a, b) => a.name.localeCompare(b.name));

    const compName = compartment ? standardizeName(compartment) : '';
    const compSuffix = compName ? `@${compName}` : '';

    const speciesStr = sortedMolecules.map(m => {
      const molStr = m.toString(true);
      return molStr.replace(/^(\w+)/, 'M_$1') + compSuffix;
    }).join('.');

    const isBoundary = sbmlId ? model.species.get(sbmlId)?.boundaryCondition : false;

    let fullPattern = speciesStr;

    if (isBoundary) {
      fullPattern = `$${fullPattern}`;
    }

    if (patterns.has(fullPattern)) {
      const existing = patterns.get(fullPattern)!;
      const val1 = parseFloat(String(existing.concentration));
      const val2 = parseFloat(String(concentration));
      if (!isNaN(val1) && !isNaN(val2)) {
        existing.concentration = val1 + val2;
      } else {
        existing.concentration = `(${existing.concentration}) + (${concentration})`;
      }
    } else {
      patterns.set(fullPattern, { concentration, isBoundary });
    }
  }

  const lines = Array.from(patterns.entries()).map(([pattern, data]) => {
    return `${pattern} ${data.concentration}`;
  });

  return sectionTemplate('seed species', lines);
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
  assignmentRules: Array<{ variable: string; math: string }> = [],
  speciesToCompartment: Map<string, string> = new Map()
): WriteObservablesResult {
  const lines: string[] = [];
  const writtenRules = new Set<string>();
  const speciesAmts = new Set<string>();
  const assignmentRuleCompartments = new Map<string, string>();

  for (const [id, sp] of sbmlSpecies) {
    const entry = sct.entries.get(id);
    if (entry && entry.structure) {
      const name = needsStandardization(id) ? standardizeName(id) : id;
      const compPrefix = sp.compartment ? `@${standardizeName(sp.compartment)}:` : '';

      // Use actual structure if available to capture bonds/states
      const pattern = entry.structure.molecules.map(m => {
        const molStr = m.toString(true);  // Include components to match only specific state
        // Add M_ prefix to molecule name
        return molStr.replace(/^(\w+)/, 'M_$1');
      }).join('.');

      // Species observable
      lines.push(`Molecules ${name}_amt ${compPrefix}${pattern}`);  // For rate calculations (need molecule count)
      lines.push(`Species ${name} ${compPrefix}${pattern}`);        // For GDAT output (need complex count)
      speciesAmts.add(name);
      writtenRules.add(name);
    }
  }

  // Issue 7 helper
  function needsStandardization(name: string): boolean {
    return !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
  }

  // Handle assignment rules mapping back to observables
  for (const rule of assignmentRules) {
    const name = standardizeName(rule.variable);

    // Filter out complex math that isn't a simple weighted sum
    if (/[/^()]/.test(rule.math)) continue;
    // Allow '*' only if it's a number multiplied by a species
    if (rule.math.includes('*')) {
      const parts = rule.math.split('+').map(p => p.trim());
      let valid = true;
      for (const p of parts) {
        if (p.includes('*')) {
          const subParts = p.split('*').map(sp => sp.trim());
          if (subParts.length !== 2 || !(/^\d+$/.test(subParts[0]) || /^\d+$/.test(subParts[1]))) {
            valid = false;
            break;
          }
        }
      }
      if (!valid) continue;
    }

    // Find all species identifiers (S1, S2, etc.) and their coefficients
    const terms = rule.math.split('+').map(t => t.trim());
    const finalPatterns: string[] = [];
    let ruleCompartment: string | undefined;

    for (const term of terms) {
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

      const entry = sct.entries.get(spId);
      if (entry && entry.structure) {
        const compId = speciesToCompartment.get(spId);
        if (compId && !ruleCompartment) {
          ruleCompartment = compId;
        }
        const compSuffix = compId ? `@${standardizeName(compId)}` : '';

        const pattern = entry.structure.molecules.map(m => {
          const molStr = m.toString(true);
          return molStr.replace(/^(\w+)/, 'M_$1') + compSuffix;
        }).join('.');

        for (let i = 0; i < coef; i++) {
          finalPatterns.push(pattern);
        }
      } else if (spId.match(/^S\d+$/)) {
        // Fallback for non-atomized species (if any)
        const pattern = `M_${spId}`;
        for (let i = 0; i < coef; i++) {
          finalPatterns.push(pattern);
        }
      }
    }

    if (finalPatterns.length > 0) {
      lines.push(`Molecules ${name}_amt ${finalPatterns.join(' ')}`);
      lines.push(`Species ${name} ${finalPatterns.join(' ')}`);
      writtenRules.add(rule.variable);
      speciesAmts.add(name);
      if (ruleCompartment) {
        assignmentRuleCompartments.set(name, ruleCompartment);
      }
    }
  }

  return { lines, writtenRules, speciesAmts, assignmentRuleCompartments };
}

/**
 * Generate functions section
 */
export function writeFunctions(
  functions: Map<string, SBMLFunctionDefinition>,
  assignmentRules: Array<{ variable: string; math: string }> = [],
  parameterDict: Map<string, number | string>,
  speciesToCompartment: Map<string, string> = new Map(),
  speciesToHasOnlySubstanceUnits: Map<string, boolean> = new Map(),
  skipRules: Set<string> = new Set(),
  speciesAmts: Set<string> = new Set(),
  assignmentRuleCompartments: Map<string, string> = new Map()
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

    const bnglName = `_c_${name}`;  // Prefix with _c_ to avoid conflict with observable
    if (!isAmountOnly && compId) {
      lines.push(`${bnglName}() = ${name}_amt / __compartment_${standardizeName(compId)}__`);
    } else {
      lines.push(`${bnglName}() = ${name}_amt`);
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

    let body = bnglFunction(
      rule.math,
      ruleId,
      [],
      [],
      new Map(Array.from(parameterDict.entries()).map(([k, v]) => [k, Number(v)])),
      new Map(),
      assignmentRuleIds,
      new Set(speciesToCompartment.keys()),
      speciesToCompartment,
      speciesToHasOnlySubstanceUnits,
      skipRules,
      speciesAmts
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
  compartments: Map<string, SBMLCompartment>,
  parameterDict: Map<string, number | string>,
  functionDefinitions: Map<string, SBMLFunctionDefinition>,
  speciesToCompartment: Map<string, string>,
  speciesToHasOnlySubstanceUnits: Map<string, boolean>,
  options: AtomizerOptions
): string {
  const lines: string[] = [];
  const useCompartments = compartments.size > 0;

  for (const [rxnId, rxn] of reactions) {
    const reactantStrs: string[] = [];
    const productStrs: string[] = [];

    // Build reactants
    for (const ref of rxn.reactants) {
      if (ref.species === 'EmptySet') continue;
      const sp = sbmlSpecies.get(ref.species);
      const name = options.useId ? standardizeName(ref.species) : standardizeName(sp?.name || ref.species);
      let speciesStr = `M_${name}`;
      const compId = speciesToCompartment.get(ref.species);
      if (useCompartments && compId) {
        speciesStr = `${speciesStr}@${standardizeName(compId)}`;
      }

      for (let i = 0; i < (ref.stoichiometry || 1); i++) {
        reactantStrs.push(speciesStr);
      }
    }

    // Build products
    for (const ref of rxn.products) {
      if (ref.species === 'EmptySet') continue;
      const sp = sbmlSpecies.get(ref.species);
      const name = options.useId ? standardizeName(ref.species) : standardizeName(sp?.name || ref.species);
      let speciesStr = `M_${name}`;
      const compId = speciesToCompartment.get(ref.species);
      const reactantComp = rxn.reactants.length > 0 ? speciesToCompartment.get(rxn.reactants[0].species) : null;

      if (useCompartments && compId) {
        speciesStr = `${speciesStr}@${standardizeName(compId)}`;
        
        if (reactantComp && reactantComp !== compId) {
          if (!areCompartmentsAdjacent(reactantComp, compId, compartments)) {
            logger.info('BNW004',
              `Transport reaction ${rxnId}: ${ref.species} moves from ${reactantComp} to ${compId}`
            );
          }
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
      rate = bnglFunction(
        rate,
        rxnId,
        rxn.reactants.map(r => r.species),
        Array.from(compartments.keys()),
        new Map(Array.from(parameterDict.entries()).map(([k, v]) => [k, Number(v)])),
        new Map(),
        options.assignmentRuleVariables,
        new Set(sbmlSpecies.keys()),
        speciesToCompartment,
        speciesToHasOnlySubstanceUnits,
        new Set(),
        options.speciesAmts || new Set()
      );
    }

    // Check if this is a saturation rate law (Sat, MM, Hill)
    const isSaturationRateLaw = /\b(Sat|MM|Hill)\s*\(/.test(rate);

    let finalRate: string;
    
    if (isSaturationRateLaw) {
      // Saturation kinetics: the rate expression already uses amounts (X_amt)
      // and BNG's Sat/MM macros handle the kinetics correctly.
      // We just need volume scaling for bimolecular reactions.
      let vScale = '1';
      if (useCompartments) {
        const ruleCompId = rxn.compartment || (rxn.reactants[0]?.species ? sbmlSpecies.get(rxn.reactants[0].species)?.compartment : rxn.products[0]?.species ? sbmlSpecies.get(rxn.products[0].species)?.compartment : '');
        const totalStoichiometry = rxn.reactants.reduce((sum, ref) => sum + (ref.stoichiometry || 1), 0);
        const n = totalStoichiometry;
        if (n !== 1 && ruleCompId) {
          vScale = `(__compartment_${ruleCompId}__^${n - 1})`;
        }
      }
      finalRate = vScale === '1' ? rate : `((${rate}) * ${vScale})`;
    } else {
      // Normal mass-action kinetics: divide by reactant concentrations
      const productCounts = new Map<string, number>();
      for (const ref of rxn.products) {
        if (ref.species === 'EmptySet') continue;
        const stoich = ref.stoichiometry || 1;
        productCounts.set(ref.species, (productCounts.get(ref.species) || 0) + stoich);
      }

      const reactantCounts = new Map<string, number>();
      let totalStoichiometry = 0;
      for (const ref of rxn.reactants) {
        if (ref.species === 'EmptySet') continue;
        const stoich = ref.stoichiometry || 1;
        reactantCounts.set(ref.species, (reactantCounts.get(ref.species) || 0) + stoich);
        totalStoichiometry += stoich;
      }

      const divisorParts: string[] = [];
      const numReactants = Array.from(reactantCounts.keys()).length;
      const reactantIds = Array.from(reactantCounts.keys());

      // For saturation-style kinetics in the SBML expression (not using Sat macro),
      // identify which species is the substrate by looking at the denominator (K + substrate)
      let satSubstrate: string | null = null;
      for (const spId of reactantIds) {
        const substratePattern = new RegExp(`/\\s*\\([^)]*\\+[^)]*${standardizeName(spId)}_amt`, 'i');
        if (substratePattern.test(rate)) {
          satSubstrate = spId;
          break;
        }
      }

      if (satSubstrate && numReactants > 1) {
        // Saturation kinetics: divide by substrate once, other reactants twice
        for (const [spId, totalStoich] of reactantCounts) {
          const name = standardizeName(spId);
          if (spId === satSubstrate) {
            // Substrate (in Sat denominator): divide once
            divisorParts.push(`${name}_amt`);
          } else {
            // Other reactant (erroneously added by SBML): divide TWICE
            divisorParts.push(`(${name}_amt * ${name}_amt)`);
            totalStoichiometry -= totalStoich;  // Adjust volume scaling
          }
        }
      } else {
        // Normal mass-action: divide by all reactants once
        for (const [spId, totalStoich] of reactantCounts) {
          const name = standardizeName(spId);
          if (totalStoich === 1) {
            divisorParts.push(`${name}_amt`);
          } else {
            divisorParts.push(`((${name}_amt^${totalStoich})/${getFactorial(totalStoich)})`);
          }
        }
      }
      const divisor = divisorParts.length > 0 ? divisorParts.join('*') : '1';
      const ruleCompId = rxn.compartment || (rxn.reactants[0]?.species ? sbmlSpecies.get(rxn.reactants[0].species)?.compartment : rxn.products[0]?.species ? sbmlSpecies.get(rxn.products[0].species)?.compartment : '');

      let vScale = '1';
      if (useCompartments && ruleCompId) {
        const n = totalStoichiometry;
        if (n !== 1) {
          vScale = `(__compartment_${ruleCompId}__^${n - 1})`;
        }
      }

      finalRate = `(((${rate}) * ${vScale}) / (${divisor} + 1e-60))`;
    }

    const reactants = reactantStrs.length > 0 ? reactantStrs.join(' + ') : '0';
    const products = productStrs.length > 0 ? productStrs.join(' + ') : '0';
    const arrow = rxn.reversible ? '<->' : '->';

    const ruleName = standardizeName(rxn.name || rxnId);
    lines.push(`${ruleName}: ${reactants} ${arrow} ${products} ${finalRate}`);
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
  options: AtomizerOptions
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
        const compSuffix = compId ? `@${standardizeName(compId)}` : '';
        const pattern = mol.molecules.map(m => {
          const molStr = m.toString(true);
          return molStr.replace(/^(\w+)/, 'M_$1') + compSuffix;
        }).join('.');
        speciesStr = pattern;
      }

      if (speciesStr) {
        for (let i = 0; i < (ref.stoichiometry || 1); i++) {
          reactantStrs.push(speciesStr);
        }
      }
    }

    // Build products using translated structures
    for (const ref of rxn.products) {
      if (ref.species === 'EmptySet') continue;

      const translated = translator.get(ref.species);
      const entry = sct.entries.get(ref.species);
      const compId = speciesToCompartment.get(ref.species) || rxn.compartment || '';

      let speciesPattern = '';
      if (translated || (entry && entry.structure)) {
        const mol = translated || entry!.structure!;
        const cId = compId || rxn.compartment || '';
        const compSuffix = cId ? `@${standardizeName(cId)}` : '';

        speciesPattern = mol.molecules.map(m => {
          const molStr = m.toString(true);
          return molStr.replace(/^(\w+)/, 'M_$1') + compSuffix;
        }).join('.');
      }

      if (speciesPattern) {
        for (let i = 0; i < (ref.stoichiometry || 1); i++) {
          productStrs.push(speciesPattern);
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
        new Map(),
        options.assignmentRuleVariables || new Set(),
        new Set(sct.entries.keys()),
        speciesToCompartment,
        speciesToHasOnlySubstanceUnits,
        options.observableConvertedRules || new Set(),
        options.speciesAmts || new Set()
      );
    }

    // Check if this is a saturation rate law (Sat, MM, Hill)
    const isSaturationRateLaw = /\b(Sat|MM|Hill)\s*\(/.test(rate);

    let finalRate: string;

    if (isSaturationRateLaw) {
      // Saturation kinetics: the rate expression already uses amounts (X_amt)
      // and BNG's Sat/MM macros handle the kinetics correctly.
      let vScale = '1';
      if (useCompartments) {
        const ruleCompId = rxn.compartment || (rxn.reactants[0]?.species ? speciesToCompartment.get(rxn.reactants[0].species) : rxn.products[0]?.species ? speciesToCompartment.get(rxn.products[0].species) : '');
        const totalStoichiometry = rxn.reactants.reduce((sum, ref) => sum + (ref.stoichiometry || 1), 0);
        const n = totalStoichiometry;
        if (n !== 1 && ruleCompId) {
          vScale = `(__compartment_${ruleCompId}__^${n - 1})`;
        }
      }
      finalRate = vScale === '1' ? rate : `((${rate}) * ${vScale})`;
    } else {
      // Normal kinetics: build divisor
      const productCounts = new Map<string, number>();
      for (const ref of rxn.products) {
        if (ref.species === 'EmptySet') continue;
        const stoich = ref.stoichiometry || 1;
        productCounts.set(ref.species, (productCounts.get(ref.species) || 0) + stoich);
      }

      const reactantCounts = new Map<string, number>();
      let totalStoichiometry = 0;
      for (const ref of rxn.reactants) {
        if (ref.species === 'EmptySet') continue;
        const stoich = ref.stoichiometry || 1;
        reactantCounts.set(ref.species, (reactantCounts.get(ref.species) || 0) + stoich);
        totalStoichiometry += stoich;
      }

      const divisorParts: string[] = [];
      const numReactants = Array.from(reactantCounts.keys()).length;
      const reactantIds = Array.from(reactantCounts.keys());

      // For saturation-style kinetics in the SBML expression,
      // identify which species is the substrate by looking at the denominator
      let satSubstrate: string | null = null;
      for (const spId of reactantIds) {
        const substratePattern = new RegExp(`/\\s*\\([^)]*\\+[^)]*${standardizeName(spId)}_amt`, 'i');
        if (substratePattern.test(rate)) {
          satSubstrate = spId;
          break;
        }
      }

      if (satSubstrate && numReactants > 1) {
        // Saturation kinetics: divide by substrate once, other reactants twice
        for (const [spId, totalStoich] of reactantCounts) {
          const name = standardizeName(spId);
          if (spId === satSubstrate) {
            divisorParts.push(`${name}_amt`);
          } else {
            divisorParts.push(`(${name}_amt * ${name}_amt)`);
            totalStoichiometry -= totalStoich;
          }
        }
      } else {
        // Normal mass-action: divide by all reactants once
        for (const [spId, totalStoich] of reactantCounts) {
          const name = standardizeName(spId);
          if (totalStoich === 1) {
            divisorParts.push(`${name}_amt`);
          } else {
            divisorParts.push(`((${name}_amt^${totalStoich})/${getFactorial(totalStoich)})`);
          }
        }
      }
      const divisor = divisorParts.length > 0 ? divisorParts.join('*') : '1';
      const ruleCompId = rxn.compartment || (rxn.reactants[0]?.species ? speciesToCompartment.get(rxn.reactants[0].species) : rxn.products[0]?.species ? speciesToCompartment.get(rxn.products[0].species) : '');

      let vScale = '1';
      if (useCompartments && ruleCompId) {
        const n = totalStoichiometry;
        if (n !== 1) {
          vScale = `(__compartment_${ruleCompId}__^${n - 1})`;
        }
      }

      finalRate = `(((${rate}) * ${vScale}) / (${divisor} + 1e-60))`;

      // Attempt to detect Mass Action to simplify
      const massActionK = checkMassAction(
        rate,
        divisor,
        vScale,
        parameterDict,
        compartments,
        new Map(),
        options.assignmentRuleVariables
      );

      if (massActionK !== null) {
        finalRate = String(massActionK);
      }
    }

    const reactants = reactantStrs.length > 0 ? reactantStrs.join(' + ') : '0';
    const products = productStrs.length > 0 ? productStrs.join(' + ') : '0';
    const arrow = rxn.reversible ? '<->' : '->';

    const ruleName = standardizeName(rxn.name || rxnId);
    lines.push(`${ruleName}: ${reactants} ${arrow} ${products} ${finalRate}`);
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
  sections.push(writeSeedSpecies(seedSpecies, model.compartments, sct, model));

  const { lines: observableLines, writtenRules: observableRules, speciesAmts, assignmentRuleCompartments } = writeObservables(model.species, sct, assignmentRules, speciesToCompartment);
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

  sections.push(writeFunctions(model.functionDefinitions, assignmentRules, paramDict, speciesToCompartment, speciesToHasOnlySubstanceUnits, observableRules, speciesAmts, assignmentRuleCompartments));

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
      options
    ));
  } else {
    sections.push(writeReactionRulesFlat(
      model.reactions,
      model.species,
      model.compartments,
      paramDict,
      model.functionDefinitions,
      speciesToCompartment,
      speciesToHasOnlySubstanceUnits,
      options
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
        const prefix = compId ? `@${standardizeName(compId)}:` : '';
        translationMap.set(id, `${prefix}M_${bnglName}`);
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
          bnglPattern = `@${standardizeName(compId)}:${molecules}`;
        } else {
          bnglPattern = molecules;
        }
      } else {
        const bnglName = standardizeName(id);
        const prefix = compId ? `@${standardizeName(compId)}:` : '';
        bnglPattern = `${prefix}M_${bnglName}`;
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
      actionLines.push('    ' + actions);
    } else {
      const tEnd = options.tEnd ?? 10;
      const nSteps = options.nSteps ?? 100;
      actionLines.push(`    simulate({method=>"ode",t_end=>${tEnd},n_steps=>${nSteps}})`);
    }
    actionLines.push('end actions');
    sections.push(actionLines.join('\n'));
  } else {
    sections.push('begin actions');
    sections.push('    generate_network({overwrite=>1})');
    const tEnd = options.tEnd ?? 10;
    const nSteps = options.nSteps ?? 100;
    sections.push(`    simulate({method=>"ode",t_end=>${tEnd},n_steps=>${nSteps}})`);
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

  const vars = new Set<string>();
  for (const [spId, _] of speciesToCompartment) {
    const name = standardizeName(spId);
    const regex = new RegExp(`\\b${name}\\b`, 'g');
    if (regex.test(jsRate) || regex.test(jsDiv) || regex.test(jsVScale)) {
      vars.add(name);
    }
  }

  for (const param of parameterDict.keys()) {
    const pName = standardizeName(param);
    if (assignmentRuleVariables.has(pName)) continue;
    const pRegex = new RegExp(`\\b${pName}\\(\\)`, 'g');
    jsRate = jsRate.replace(pRegex, pName);
  }

  try {
    const evalExpr = `(${jsRate}) * (${jsVScale}) / (${jsDiv})`;

    const keys = Object.keys(context);
    const values = Object.values(context);

    const varList = Array.from(vars);

    const results: number[] = [];

    for (let i = 0; i < 3; i++) {
      const localContext = { ...context };
      for (const v of varList) {
        localContext[v] = Math.random() * 1000 + 1;
      }

      const allKeys = [...keys, ...varList];
      const allValues = [...values, ...varList.map(v => localContext[v])];

      const f = new Function(...allKeys, `return ${evalExpr};`);
      const result = f(...allValues);

      if (!Number.isFinite(result) || Number.isNaN(result)) return null;
      results.push(result);
    }

    const mean = results.reduce((a, b) => a + b, 0) / results.length;
    if (Math.abs(mean) < 1e-12) return 0;

    const variance = results.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / results.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / Math.abs(mean);

    if (cv < 1e-5) {
      return mean;
    }

  } catch (e) {
    return null;
  }

  return null;
}