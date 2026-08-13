import { collapseWhitespace } from './stringUtils';
import { stripInlineComment } from './stringUtils';
import { BNGLParser } from '../services/graph/core/BNGLParser';
import type { BNGLModel } from '../types';

/**
 * Re-evaluates seed species' initial concentrations based on their initial expressions
 * and the model's updated parameter values and custom functions.
 *
 * This function is widely used in high-frequency param scan flows where parameters are altered
 * and initial concentrations need to be recomputed before starting new simulations.
 * It resolves initial expressions against the parsed parameter maps and custom functions
 * using the safe engine parser and evaluator.
 *
 * @invariant Must remain free of browser APIs (browser-API-free).
 *
 * @param model - The parsed model object containing parameters, species, and functions.
 * @param seedExpressions - A Map containing original string expressions for each species.
 */
export function reevaluateSeedSpecies(model: BNGLModel, seedExpressions: Map<string, string>): void {
  const paramMap = new Map<string, number>(Object.entries(model.parameters ?? {}));
  const functionMap = new Map<string, { args: string[]; expr: string }>(
    (model.functions ?? []).map((fn) => [fn.name, { args: fn.args ?? [], expr: fn.expression ?? '' }]),
  );

  for (const species of model.species ?? []) {
    const fallbackExpression = seedExpressions.get(species.name);
    const expr = typeof species.initialExpression === 'string'
      ? species.initialExpression.trim()
      : typeof fallbackExpression === 'string'
        ? fallbackExpression.trim()
        : '';
    if (!expr) continue;
    const evaluated = BNGLParser.evaluateExpression(expr, paramMap, undefined, functionMap);
    if (Number.isFinite(evaluated)) {
      species.initialConcentration = evaluated;
    }
  }
}

function unwrapOuterParens(expr: string): string {
  let start = 0;
  let end = expr.length;

  while (start < end && expr[start] === '(') start++;
  while (end > start && expr[end - 1] === ')') end--;

  return expr.slice(start, end).trim();
}

function isNumericLiteralBody(expr: string): boolean {
  if (expr.length === 0) return false;

  let i = 0;
  if (expr[i] === '+' || expr[i] === '-') i++;

  let sawDigit = false;
  let sawDot = false;
  let sawExponent = false;
  let sawExponentDigit = false;

  for (; i < expr.length; i++) {
    const ch = expr[i];
    if (ch >= '0' && ch <= '9') {
      sawDigit = true;
      if (sawExponent) sawExponentDigit = true;
      continue;
    }
    if (ch === '.' && !sawDot && !sawExponent) {
      sawDot = true;
      continue;
    }
    if ((ch === 'e' || ch === 'E') && !sawExponent && sawDigit) {
      sawExponent = true;
      sawExponentDigit = false;
      if (i + 1 < expr.length && (expr[i + 1] === '+' || expr[i + 1] === '-')) {
        i++;
      }
      continue;
    }
    return false;
  }

  return sawDigit && (!sawExponent || sawExponentDigit);
}

/**
 * Parses parameter declarations from raw BNGL code and maps parameter names
 * to their corresponding string expressions.
 *
 * It scans the code line by line, identifies the `begin parameters` and `end parameters`
 * blocks (case-insensitive), strips inline comments, collapses duplicate whitespace,
 * and extracts name-expression pairs.
 *
 * @invariant Must remain free of browser APIs (browser-API-free).
 *
 * @param src - The raw BNGL source code string.
 * @returns A Map mapping parameter names to their declared expression/value strings.
 */
export function parseParametersFromCode(src: string): Map<string,string> {
  const paramMap = new Map<string,string>();
  const lines = src.split('\n');
  let inParams = false;

  for (const rawLine of lines) {
    const line = stripInlineComment(rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine);
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower === 'begin parameters') { inParams = true; continue; }
    if (lower === 'end parameters') { inParams = false; continue; }
    if (!inParams) continue;

    const parts = collapseWhitespace(line).split(' ');
    if (parts.length >= 2) {
      const name = parts[0];
      const expr = parts.slice(1).join(' ');
      paramMap.set(name, expr);
    }
  }

  return paramMap;
}

/**
 * Checks if a given string expression represents a valid numeric literal.
 *
 * This function unwraps outer parentheses and matches scientific, decimal,
 * and integer notation formats (with optional positive/negative signs).
 * Examples of valid numeric literals: "1.0", "+3.2", "-0.5e2", "(1.0)".
 * Examples of invalid numeric literals: "k_total", "1+2".
 *
 * @invariant Must remain free of browser APIs (browser-API-free).
 *
 * @param expr - The string expression to evaluate.
 * @returns True if the expression is a numeric literal, false otherwise.
 */
export function isNumericLiteral(expr: string): boolean {
  if (!expr) return false;
  const trimmed = unwrapOuterParens(expr.trim());
  return isNumericLiteralBody(trimmed);
}

/**
 * Strips out the `begin parameters` and `end parameters` block from the given BNGL source.
 *
 * It filters out any lines between `begin parameters` and `end parameters` (inclusive),
 * keeping all other lines (such as species, reaction rules, observables, and actions).
 * It skips empty lines and carriage returns.
 *
 * @invariant Must remain free of browser APIs (browser-API-free).
 *
 * @param src - The raw BNGL source code string.
 * @returns The BNGL source code without the parameters block.
 */
export function stripParametersBlock(src: string): string {
  const lines = src.split('\n');
  const out: string[] = [];
  let inParams = false;

  for (const rawLine of lines) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (lower === 'begin parameters') { inParams = true; continue; }
    if (lower === 'end parameters') { inParams = false; continue; }
    if (!inParams) out.push(line);
  }

  return out.join('\n').trimEnd().trim();
}
