/**
 * Dynamic Observable Computation Utility
 * 
 * Allows defining new observables on-the-fly and computing their values
 * from existing simulation results WITHOUT re-running the simulation.
 */

import { BNGLParser } from '../services/graph/core/BNGLParser';
import { GraphMatcher } from '../services/graph/core/Matcher';
import { SpeciesGraph } from '../services/graph/core/SpeciesGraph';
import { SimulationResults } from '../../types';

export interface DynamicObservableDefinition {
  name: string;
  pattern: string;  // BNGL expression like "2 * A(b!+) + B_total"
  type: 'molecules' | 'species';  // molecules counts with multiplicity, species counts once
}

export interface ComputedObservableResult {
  name: string;
  values: number[];  // one value per time point
  matchingSpeciesCount: number;
}

/**
 * Robust regex for identifying potential BNGL patterns and parameters in an expression.
 * This regex is designed to avoid capturing standalone mathematical operators like '*' as molecules.
 * - Captures identifiers starting with letters or underscores.
 * - Allows molecule wildcards '*' ONLY IF followed by '(', '.', or '@' (to distinguish from multiplication).
 * - Captures complex dot-separated patterns whole.
 * - Captures scientific notation numbers.
 */
const TOKEN_CANDIDATE_REGEX = /(?:[A-Za-z_][A-Za-z0-9_*]*|\*(?=\()|\*(?=\.)|\*(?=@))(?:\([^)]*\))?(?:@[A-Za-z0-9_]+)?(?:\s*\.\s*[A-Za-z_*][A-Za-z0-9_*]*(?:\([^)]*\))?(?:@[A-Za-z0-9_]+)?)*|[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g;

/**
 * Parse and validate a BNGL observable pattern
 * Returns the parsed SpeciesGraph or throws an error
 */
export function parseObservablePattern(pattern: string): SpeciesGraph {
  const trimmed = pattern.trim();
  if (!trimmed) {
    throw new Error('Observable pattern cannot be empty');
  }
  
  try {
    return BNGLParser.parseSpeciesGraph(trimmed);
  } catch (e: any) {
    throw new Error(`Invalid BNGL pattern "${pattern}": ${e.message}`);
  }
}

/**
 * Find species that match the given pattern and compute the observable value
 * 
 * @param pattern - Parsed SpeciesGraph pattern
 * @param speciesNames - Array of species names (canonical strings from simulation)
 * @param speciesGraphs - Map of species name to parsed SpeciesGraph (cached for efficiency)
 * @param concentrations - Array of concentrations at one time point (indexed by species order)
 * @param type - 'molecules' counts matches with multiplicity, 'species' counts each matching species once
 * @returns The observable value (sum of concentrations)
 */
export function computeObservableValue(
  pattern: SpeciesGraph,
  speciesNames: string[],
  speciesGraphs: Map<string, SpeciesGraph>,
  concentrations: number[],
  type: 'molecules' | 'species' = 'molecules'
): { value: number; matchCount: number } {
  let value = 0;
  let matchCount = 0;
  
  for (let i = 0; i < speciesNames.length; i++) {
    const speciesName = speciesNames[i];
    const conc = concentrations[i];
    
    if (conc === 0) continue; 
    
    let speciesGraph = speciesGraphs.get(speciesName);
    if (!speciesGraph) {
      try {
        speciesGraph = BNGLParser.parseSpeciesGraph(speciesName);
        speciesGraphs.set(speciesName, speciesGraph);
      } catch (e: any) {
        console.warn(`[computeObservableValue] Failed to parse species '${speciesName}': ${e.message}`);
        continue;
      }
    }
    
    const matches = GraphMatcher.findAllMaps(pattern, speciesGraph);
    
    if (matches.length > 0) {
      matchCount++;
      if (type === 'molecules') {
        const autoFactor = GraphMatcher.getPatternAutomorphismFactor(pattern);
        value += conc * (matches.length / autoFactor);
      } else {
        value += conc;
      }
    }
  }
  
  return { value, matchCount };
}

/**
 * Compute a dynamic observable across all time points in simulation results
 * Supports mixed math expressions and BNGL patterns
 */
export function computeDynamicObservable(
  definition: DynamicObservableDefinition,
  results: SimulationResults,
  speciesNames: string[],
  parameters: Map<string, number> = new Map()
): ComputedObservableResult {
  const expression = definition.pattern;
  
  interface TokenHit {
    text: string;
    index: number;
    values?: number[];
  }
  
  const hits: TokenHit[] = [];
  let match;
  // Reset regex index for safety
  TOKEN_CANDIDATE_REGEX.lastIndex = 0;
  while ((match = TOKEN_CANDIDATE_REGEX.exec(expression)) !== null) {
      const text = match[0].trim();
      // Only keep hits that are not numbers (parameters or BNGL patterns)
      if (text && isNaN(Number(text))) {
          hits.push({ text: match[0], index: match.index });
      }
  }

  const speciesGraphCache = new Map<string, SpeciesGraph>();
  const mathFuncs = new Set(['exp', 'log', 'log10', 'sqrt', 'abs', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'min', 'max', 'floor', 'ceil']);
  const uniqueTokenValues = new Map<string, number[]>();

  for (const hit of hits) {
    const token = hit.text.trim();
    if (uniqueTokenValues.has(token)) {
        hit.values = uniqueTokenValues.get(token);
        continue;
    }
    
    if (parameters.has(token)) continue;
    if (mathFuncs.has(token.toLowerCase())) continue;
    
    if (results.headers && results.headers.includes(token)) {
      const values = results.data.map(p => (p[token] as number) || 0);
      uniqueTokenValues.set(token, values);
      hit.values = values;
      continue;
    }

    try {
      const pattern = parseObservablePattern(token);
      const values: number[] = new Array(results.data.length).fill(0);
      const speciesData = results.speciesData;
      
      if (speciesData && speciesData.length > 0) {
        for (let t = 0; t < speciesData.length; t++) {
          const concentrations = speciesNames.map(name => (speciesData[t][name] as number) || 0);
          const { value } = computeObservableValue(pattern, speciesNames, speciesGraphCache, concentrations, definition.type);
          values[t] = value;
        }
      }
      
      uniqueTokenValues.set(token, values);
      hit.values = values;
    } catch (e) {
      // Not a valid pattern, let it pass through to evaluateExpression as a possible parameter
    }
  }

  const tCount = results.data.length;
  const finalValues: number[] = new Array(tCount);
  
  for (let t = 0; t < tCount; t++) {
    let evalStr = expression;
    const sortedHits = [...hits].sort((a,b) => b.index - a.index);
    
    for (const hit of sortedHits) {
        if (hit.values) {
            const val = hit.values[t];
            const valStr = val < 0 ? `(${val})` : val.toString();
            evalStr = evalStr.slice(0, hit.index) + valStr + evalStr.slice(hit.index + hit.text.length);
        }
    }

    const result = BNGLParser.evaluateExpression(evalStr, parameters);
    finalValues[t] = isNaN(result) ? 0 : result;
  }

  return {
    name: definition.name,
    values: finalValues,
    matchingSpeciesCount: uniqueTokenValues.size
  };
}

/**
 * Check if a pattern/expression is valid
 * Returns null if valid, error message if invalid
 */
export function validateObservablePattern(pattern: string): string | null {
  if (!pattern || !pattern.trim()) return 'Expression cannot be empty';
  
  try {
    let lastIndex = 0;
    let match;
    const mathFuncs = new Set(['exp', 'log', 'log10', 'sqrt', 'abs', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'min', 'max', 'floor', 'ceil']);

    TOKEN_CANDIDATE_REGEX.lastIndex = 0;
    while ((match = TOKEN_CANDIDATE_REGEX.exec(pattern)) !== null) {
      // Check for undiscovered characters between matches (must be math operators or spaces)
      const skipped = pattern.slice(lastIndex, match.index).trim();
      if (skipped && !/^[+\-*/^(),\s]+$/.test(skipped)) {
          return `Invalid syntax: unexpected characters "${skipped}" between components`;
      }
      lastIndex = match.index + match[0].length;

      const token = match[0].trim();
      if (!token || !isNaN(Number(token))) continue;
      if (mathFuncs.has(token.toLowerCase())) continue;
      
      if (/[().!~@*]/.test(token)) {
        const error = BNGLParser.validatePattern(token);
        if (error) return `Invalid BNGL pattern "${token}": ${error}`;
      }
    }
    
    // Check remainder for trailing invalid syntax
    const remainder = pattern.slice(lastIndex).trim();
    if (remainder && !/^[+\-*/^(),\s]+$/.test(remainder)) {
        return `Invalid syntax: unexpected characters "${remainder}" at end of expression`;
    }

    return null;
  } catch (e: any) {
    return e.message;
  }
}
