/**
 * SBML Writer Module
 * Generates SBML Level 3 Version 2 model strings from BNGL model structures
 */

import { BNGLModel, BNGLReaction } from '../config/types';
import { logger } from '../utils/helpers';
import { getLibSBMLInstance } from '../parser/sbmlParser';
import jsep from 'jsep';

const ASSIGN_RULE_META_PREFIX = '__assign_rule__';
const RATE_RULE_META_PREFIX = '__rate_rule__';
const AVOGADRO_FALLBACK = 6.02214076e23;
const DIRECT_DESCALE_MIN_CONCENTRATION = 1e-9;
const DIRECT_DESCALE_MAX_CONCENTRATION = 1e12;
const SYNTH_RATE_RULE_SPECIES_PREFIX = '__rate_rule_state__';
const NA_LIKE_SEED_TOKEN_RE = /\b(?:Na|quantity_to_number_factor)\b/;
const NUMERIC_LITERAL_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

// LibSBML type declarations for the writer
declare namespace LibSBML {
  interface SBMLWriter {
    writeSBMLToString(doc: SBMLDocument): string;
    delete?(): void;
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
    setOutside?(outside: string): void;
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
let libsbmlInitPromise: Promise<any> | null = null;
const SBML_WRITER_INIT_TIMEOUT_MS = Number(
  (typeof process !== 'undefined' && process.env?.SBML_WRITER_INIT_TIMEOUT_MS) || '12000'
);
const SBML_WRITER_DEBUG_TIMINGS =
  ((typeof process !== 'undefined' && process.env?.SBML_WRITER_DEBUG_TIMINGS) || '0') === '1';

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
      if (timer && typeof (timer as any).unref === 'function') {
        (timer as any).unref();
      }
    });
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function logWriterTiming(label: string, startedMs: number, extra = ''): void {
  if (!SBML_WRITER_DEBUG_TIMINGS) return;
  const elapsed = Date.now() - startedMs;
  const suffix = extra ? ` ${extra}` : '';
  console.error(`[sbmlWriter][timing] ${label} ${elapsed}ms${suffix}`);
}

function replaceNames(
  formula: string,
  replacementMap: Map<string, string>,
  options: { skipFunctionCalls?: boolean } = {}
): string {
  let result = formula;
  const entries = Array.from(replacementMap.entries()).sort((a, b) => b[0].length - a[0].length);
  const skipFunctionCalls = options.skipFunctionCalls ?? false;

  for (const [name, id] of entries) {
    if (!name || !id || name === id) continue;
    const escaped = escapeRegExp(name);
    const isWord = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
    const pattern = isWord
      ? new RegExp(`\\b${escaped}\\b${skipFunctionCalls ? '(?!\\s*\\()' : ''}`, 'g')
      : new RegExp(escaped, 'g');
    result = result.replace(pattern, id);
  }

  return result;
}

type NameReplacementEntry = {
  id: string;
  name: string;
  pattern: RegExp;
};

function buildNameReplacementEntries(
  replacementMap: Map<string, string>,
  options: { skipFunctionCalls?: boolean } = {}
): NameReplacementEntry[] {
  const skipFunctionCalls = options.skipFunctionCalls ?? false;
  return Array.from(replacementMap.entries())
    .filter(([name, id]) => !!name && !!id && name !== id)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([name, id]) => {
      const escaped = escapeRegExp(name);
      const isWord = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
      const pattern = isWord
        ? new RegExp(`\\b${escaped}\\b${skipFunctionCalls ? '(?!\\s*\\()' : ''}`, 'g')
        : new RegExp(escaped, 'g');
      return { id, name, pattern };
    });
}

function replaceNamesWithEntries(formula: string, entries: NameReplacementEntry[]): string {
  let result = formula;
  for (const entry of entries) {
    // Fast reject avoids expensive RegExp replace when symbol is absent.
    if (!result.includes(entry.name)) continue;
    result = result.replace(entry.pattern, entry.id);
  }
  return result;
}

function createNameReplacer(
  replacementMap: Map<string, string>,
  options: { skipFunctionCalls?: boolean } = {}
): (formula: string) => string {
  const entries = buildNameReplacementEntries(replacementMap, options);
  if (entries.length === 0) return (formula: string) => formula;
  return (formula: string): string => replaceNamesWithEntries(formula, entries);
}

function replaceSpeciesNames(formula: string, speciesIdByName: Map<string, string>): string {
  return replaceNames(formula, speciesIdByName);
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

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function boolAttr(value: boolean): string {
  return value ? 'true' : 'false';
}

function getCompartmentOutside(
  compartment: { name?: string; parent?: string },
  knownCompartmentNames: Set<string>
): string | null {
  const parent = typeof compartment.parent === 'string' ? compartment.parent.trim() : '';
  if (!parent) return null;
  const name = typeof compartment.name === 'string' ? compartment.name.trim() : '';
  if (!name || parent === name) return null;
  if (!knownCompartmentNames.has(parent)) return null;
  return parent;
}

function operatorToMathTag(op: string): string | null {
  switch (op) {
    case '+': return 'plus';
    case '-': return 'minus';
    case '*': return 'times';
    case '/': return 'divide';
    case '^': return 'power';
    case '==': return 'eq';
    case '!=': return 'neq';
    case '>': return 'gt';
    case '>=': return 'geq';
    case '<': return 'lt';
    case '<=': return 'leq';
    case '&&': return 'and';
    case '||': return 'or';
    default: return null;
  }
}

function astToMathML(node: any): string {
  if (!node || typeof node !== 'object') {
    return '<cn>0</cn>';
  }

  const t = String(node.type || '');
  if (t === 'Literal') {
    const raw = node.raw ?? node.value;
    if (typeof node.value === 'number') {
      return `<cn>${xmlEscape(String(raw))}</cn>`;
    }
    return `<ci>${xmlEscape(String(raw))}</ci>`;
  }

  if (t === 'Identifier') {
    const name = String(node.name || '');
    if (name === 'true') return '<true/>';
    if (name === 'false') return '<false/>';
    return `<ci>${xmlEscape(name || '0')}</ci>`;
  }

  if (t === 'UnaryExpression') {
    if (node.operator === '+') {
      return astToMathML(node.argument);
    }
    if (node.operator === '-') {
      return `<apply><minus/>${astToMathML(node.argument)}</apply>`;
    }
  }

  if (t === 'BinaryExpression' || t === 'LogicalExpression') {
    const tag = operatorToMathTag(String(node.operator || ''));
    if (!tag) return '<cn>0</cn>';
    return `<apply><${tag}/>${astToMathML(node.left)}${astToMathML(node.right)}</apply>`;
  }

  if (t === 'CallExpression') {
    const calleeName = node.callee?.type === 'Identifier' ? String(node.callee.name || '') : '';
    const lowerName = calleeName.toLowerCase();
    const args: any[] = Array.isArray(node.arguments) ? node.arguments : [];

    if (lowerName === 'if' && args.length >= 3) {
      return `<piecewise><piece>${astToMathML(args[1])}<condition>${astToMathML(args[0])}</condition></piece><otherwise>${astToMathML(args[2])}</otherwise></piecewise>`;
    }

    if (lowerName === 'pow' && args.length >= 2) {
      return `<apply><power/>${astToMathML(args[0])}${astToMathML(args[1])}</apply>`;
    }

    const fnMap: Record<string, string> = {
      exp: 'exp',
      ln: 'ln',
      log: 'ln',
      sin: 'sin',
      cos: 'cos',
      tan: 'tan',
      abs: 'abs',
      floor: 'floor',
      ceil: 'ceiling',
      sqrt: 'root',
      min: 'min',
      max: 'max',
    };
    const fnTag = fnMap[lowerName];
    if (fnTag) {
      return `<apply><${fnTag}/>${args.map(astToMathML).join('')}</apply>`;
    }

    return `<apply><ci>${xmlEscape(calleeName || 'f')}</ci>${args.map(astToMathML).join('')}</apply>`;
  }

  if (t === 'ConditionalExpression') {
    return `<piecewise><piece>${astToMathML(node.consequent)}<condition>${astToMathML(node.test)}</condition></piece><otherwise>${astToMathML(node.alternate)}</otherwise></piecewise>`;
  }

  return '<cn>0</cn>';
}

function formulaToMathML(formula: string): string {
  const expr = (formula || '').trim() || '0';
  try {
    const ast = jsep(expr) as any;
    return `<math xmlns="http://www.w3.org/1998/Math/MathML">${astToMathML(ast)}</math>`;
  } catch {
    if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(expr)) {
      return `<math xmlns="http://www.w3.org/1998/Math/MathML"><cn>${xmlEscape(expr)}</cn></math>`;
    }
    return `<math xmlns="http://www.w3.org/1998/Math/MathML"><ci>${xmlEscape(expr)}</ci></math>`;
  }
}

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function evaluateNumericAst(node: any, symbols: Map<string, number>): number | null {
  if (!node || typeof node !== 'object') return null;

  const nodeType = String(node.type || '');
  if (nodeType === 'Literal') {
    return toFiniteNumber(node.value);
  }

  if (nodeType === 'Identifier') {
    const name = String(node.name || '').trim();
    if (!name) return null;
    if (symbols.has(name)) return symbols.get(name) ?? null;
    if (name === 'Na') return 1;
    return null;
  }

  if (nodeType === 'UnaryExpression') {
    const arg = evaluateNumericAst(node.argument, symbols);
    if (arg === null) return null;
    if (node.operator === '+') return arg;
    if (node.operator === '-') return -arg;
    return null;
  }

  if (nodeType === 'BinaryExpression') {
    const left = evaluateNumericAst(node.left, symbols);
    const right = evaluateNumericAst(node.right, symbols);
    if (left === null || right === null) return null;

    switch (node.operator) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': return right === 0 ? null : left / right;
      case '^': return Math.pow(left, right);
      default: return null;
    }
  }

  if (nodeType === 'CallExpression') {
    const calleeName =
      node.callee?.type === 'Identifier' ? String(node.callee.name || '').toLowerCase() : '';
    const args = (Array.isArray(node.arguments) ? node.arguments : [])
      .map((arg: any) => evaluateNumericAst(arg, symbols));
    if (args.some((arg) => arg === null)) return null;
    const values = args as number[];
    switch (calleeName) {
      case 'pow': return values.length >= 2 ? Math.pow(values[0], values[1]) : null;
      case 'exp': return values.length >= 1 ? Math.exp(values[0]) : null;
      case 'ln':
      case 'log': return values.length >= 1 ? Math.log(values[0]) : null;
      case 'sqrt': return values.length >= 1 ? Math.sqrt(values[0]) : null;
      case 'abs': return values.length >= 1 ? Math.abs(values[0]) : null;
      case 'min': return values.length > 0 ? Math.min(...values) : null;
      case 'max': return values.length > 0 ? Math.max(...values) : null;
      default: return null;
    }
  }

  return null;
}

function evaluateNumericExpression(expression: string, symbols: Map<string, number>): number | null {
  const text = String(expression || '').trim();
  if (!text) return null;
  const direct = toFiniteNumber(text);
  if (direct !== null) return direct;
  try {
    const ast = jsep(text) as any;
    return evaluateNumericAst(ast, symbols);
  } catch {
    return null;
  }
}

function buildInitialExpressionSymbolMap(
  model: BNGLModel,
  parameterValues: Map<string, number>
): Map<string, number> {
  const symbols = new Map<string, number>(parameterValues);

  for (const [name, value] of Object.entries(model.parameters || {})) {
    const numeric = toFiniteNumber(value);
    if (numeric !== null) symbols.set(name, numeric);
  }

  for (const compartment of model.compartments || []) {
    const compartmentParam = `__compartment_${compartment.name}__`;
    const size = toFiniteNumber(compartment.size);
    if (size !== null && !symbols.has(compartmentParam)) {
      symbols.set(compartmentParam, size);
    }
  }

  // Seed expressions are interpreted as concentrations for SBML export.
  // Neutralize number-conversion symbols to avoid amount double-scaling.
  symbols.set('Na', 1);
  if (symbols.has('quantity_to_number_factor')) {
    symbols.set('quantity_to_number_factor', 1);
  }

  return symbols;
}

function inferSpeciesCompartmentName(speciesName: unknown): string {
  const rawName = typeof speciesName === 'string' ? speciesName : '';
  const prefixedCompartment = rawName.match(/^@([^:]+)::?/);
  if (prefixedCompartment?.[1]) return prefixedCompartment[1];
  const atPrefix = rawName.match(/^@([^:]+):/);
  if (atPrefix?.[1]) return atPrefix[1];
  const atSuffix = rawName.match(/@([^@:\s]+)$/);
  return atSuffix?.[1] || '';
}

function normalizeAmountLikeSeedExpressionValue(
  expression: string,
  evaluated: number,
  speciesName: unknown,
  symbols: Map<string, number>
): number {
  if (!Number.isFinite(evaluated)) return evaluated;
  const compartment = inferSpeciesCompartmentName(speciesName);
  if (!compartment) return evaluated;
  const volumeKey = `__compartment_${compartment}__`;
  const volume = toFiniteNumber(symbols.get(volumeKey));
  if (volume === null || volume <= 0 || Math.abs(volume - 1) < 1e-12) {
    return evaluated;
  }
  const hasNaLikeToken = /\bNa\b/.test(expression) || /\bquantity_to_number_factor\b/.test(expression);
  if (!hasNaLikeToken) return evaluated;
  const compactExpression = expression.replace(/\s+/g, '');
  const hasVolumeToken = compactExpression.includes(volumeKey);
  const hasVolumeInDenominator = compactExpression.includes(`/${volumeKey}`);
  if (!hasVolumeToken || hasVolumeInDenominator) return evaluated;
  const normalized = evaluated / volume;
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : evaluated;
}

function resolveSpeciesInitialConcentration(
  species: { name?: unknown; initialConcentration?: unknown; initialExpression?: unknown },
  symbols: Map<string, number>,
  rawParameters?: Map<string, number>
): number {
  const expression =
    typeof species.initialExpression === 'string' ? species.initialExpression.trim() : '';
  if (expression) {
    // Prefer expression-derived concentration when present. Parsed BNGL seeds
    // often carry amount-scaled numeric caches (e.g., includes Na*V), while
    // the expression can be evaluated with Na=1 to recover concentration.
    const evaluated = evaluateNumericExpression(expression, symbols);
    if (evaluated !== null) {
      return normalizeAmountLikeSeedExpressionValue(expression, evaluated, species.name, symbols);
    }
  }

  const direct = toFiniteNumber(species.initialConcentration);
  if (direct !== null) {
    const naLike = (rawParameters && toFiniteNumber(rawParameters.get('Na'))) ?? AVOGADRO_FALLBACK;

    // Expanded-network models may drop initialExpression and leave amount-scaled
    // numeric caches. Detect obvious amount-scale magnitudes and convert back
    // to concentration using Na*V.
    if (naLike > 1e6 && direct > 1e9) {
      const compartment = inferSpeciesCompartmentName(species.name);
      const volumeKey = compartment ? `__compartment_${compartment}__` : '';
      const volume =
        (volumeKey && rawParameters && toFiniteNumber(rawParameters.get(volumeKey))) ??
        (volumeKey && toFiniteNumber(symbols.get(volumeKey))) ??
        1;
      const denom = naLike * (volume && volume > 0 ? volume : 1);
      if (denom > 0) {
        const normalized = direct / denom;
        if (
          Number.isFinite(normalized) &&
          normalized >= DIRECT_DESCALE_MIN_CONCENTRATION &&
          normalized < direct &&
          normalized <= DIRECT_DESCALE_MAX_CONCENTRATION
        ) {
          return normalized;
        }
      }
    }

    return direct;
  }

  return 0;
}

function resolveSpeciesInitialAmount(
  species: { initialConcentration?: unknown; initialExpression?: unknown },
  symbols: Map<string, number>,
  rawParameters?: Map<string, number>
): number {
  const expression =
    typeof species.initialExpression === 'string' ? species.initialExpression.trim() : '';
  if (expression) {
    const evalSymbols = new Map<string, number>(symbols);
    const rawNa = rawParameters ? toFiniteNumber(rawParameters.get('Na')) : null;
    if (rawNa !== null) {
      evalSymbols.set('Na', rawNa);
    }
    const rawQtnf = rawParameters ? toFiniteNumber(rawParameters.get('quantity_to_number_factor')) : null;
    if (rawQtnf !== null) {
      evalSymbols.set('quantity_to_number_factor', rawQtnf);
    }
    const evaluated = evaluateNumericExpression(expression, evalSymbols);
    if (evaluated !== null) return evaluated;
  }

  const direct = toFiniteNumber(species.initialConcentration);
  if (direct !== null) return direct;
  return 0;
}

function extractSpeciesSymbolFromName(speciesName: unknown): string | null {
  const raw = typeof speciesName === 'string' ? speciesName.trim() : '';
  if (!raw) return null;

  let normalized = raw.replace(/^\$/, '');
  normalized = normalized.replace(/^@[^:]+::?/, '');
  const suffixCompartmentIdx = normalized.lastIndexOf('@');
  if (suffixCompartmentIdx > 0) {
    normalized = normalized.slice(0, suffixCompartmentIdx);
  }
  normalized = normalized.trim();
  if (!normalized) return null;

  const prefixed = normalized.match(/^M_([A-Za-z_][A-Za-z0-9_]*)(?:\(\))?$/);
  if (prefixed?.[1]) return prefixed[1];

  const direct = normalized.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\(\))?$/);
  if (direct?.[1]) return direct[1];

  return null;
}

function normalizeExpressionForMatch(expression: string): string {
  let next = String(expression || '').replace(/\s+/g, '').trim();
  if (!next) return next;

  // Drop harmless wrapper parens for direct symbol comparisons.
  while (next.startsWith('(') && next.endsWith(')')) {
    let depth = 0;
    let balanced = true;
    for (let i = 0; i < next.length; i++) {
      const ch = next[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth < 0) {
          balanced = false;
          break;
        }
      }
      if (depth === 0 && i < next.length - 1) {
        balanced = false;
        break;
      }
    }
    if (!balanced || depth !== 0) break;
    next = next.slice(1, -1).trim();
  }

  return next;
}

function isVolumeNormalizedConcentrationExpression(expression: string, symbol: string): boolean {
  if (!expression || !symbol) return false;
  const escapedSymbol = escapeRegExp(symbol);
  return new RegExp(`^${escapedSymbol}/__compartment_[A-Za-z_][A-Za-z0-9_]*__$`).test(expression);
}

function normalizeSpeciesPatternForLookup(value: string): string {
  let raw = String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/^\$/, '');
  if (!raw) return '';

  let speciesPart = raw;
  let compartmentPart = '';
  const prefixedCompartment = raw.match(/^@([^:]+)::?(.+)$/);
  if (prefixedCompartment) {
    compartmentPart = prefixedCompartment[1] || '';
    speciesPart = prefixedCompartment[2] || '';
  } else {
    const atIdx = raw.lastIndexOf('@');
    if (atIdx > 0 && atIdx < raw.length - 1) {
      speciesPart = raw.slice(0, atIdx);
      compartmentPart = raw.slice(atIdx + 1);
    }
  }

  speciesPart = speciesPart.replace(/\(\)/g, '');
  if (!speciesPart) return '';
  return compartmentPart
    ? `${speciesPart}@${compartmentPart}`.toLowerCase()
    : speciesPart.toLowerCase();
}

function addSpeciesSymbolAlias(
  symbolToSpeciesNames: Map<string, Set<string>>,
  symbol: string,
  speciesName: string
): void {
  const raw = String(symbol || '').trim();
  if (!raw || !speciesName) return;
  for (const key of new Set([raw, raw.toLowerCase()])) {
    if (!key) continue;
    if (!symbolToSpeciesNames.has(key)) {
      symbolToSpeciesNames.set(key, new Set());
    }
    symbolToSpeciesNames.get(key)!.add(speciesName);
  }
}

function buildSpeciesNamesBySeedSymbol(model: BNGLModel): Map<string, Set<string>> {
  const symbolToSpeciesNames = new Map<string, Set<string>>();
  const speciesNameByNormalizedPattern = new Map<string, string>();

  for (const species of model.species || []) {
    const speciesName = String(species?.name || '');
    if (!speciesName) continue;
    const normalized = normalizeSpeciesPatternForLookup(speciesName);
    if (normalized && !speciesNameByNormalizedPattern.has(normalized)) {
      speciesNameByNormalizedPattern.set(normalized, speciesName);
    }
    const symbol = extractSpeciesSymbolFromName(speciesName);
    if (symbol) {
      addSpeciesSymbolAlias(symbolToSpeciesNames, symbol, speciesName);
    }
  }

  for (const observable of model.observables || []) {
    const obsName = String(observable?.name || '').trim();
    if (!obsName) continue;
    const primaryPattern = String(observable?.pattern || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)[0];
    if (!primaryPattern) continue;
    const normalizedPattern = normalizeSpeciesPatternForLookup(primaryPattern);
    if (!normalizedPattern) continue;
    const speciesName = speciesNameByNormalizedPattern.get(normalizedPattern);
    if (!speciesName) continue;

    addSpeciesSymbolAlias(symbolToSpeciesNames, obsName, speciesName);
    if (obsName.toLowerCase().endsWith('_amt')) {
      addSpeciesSymbolAlias(symbolToSpeciesNames, obsName.slice(0, -4), speciesName);
    }
  }

  return symbolToSpeciesNames;
}

function resolveSpeciesNamesForSeedSymbol(
  symbolToSpeciesNames: Map<string, Set<string>>,
  symbol: string
): Set<string> {
  const raw = String(symbol || '').trim();
  if (!raw) return new Set<string>();
  return (
    symbolToSpeciesNames.get(raw) ||
    symbolToSpeciesNames.get(raw.toLowerCase()) ||
    new Set<string>()
  );
}

function buildSeedExportSemantics(model: BNGLModel): {
  amountOnlySpeciesNames: Set<string>;
  preferInitialAmountSpeciesNames: Set<string>;
} {
  const symbolToSpeciesNames = buildSpeciesNamesBySeedSymbol(model);
  const speciesByName = new Map(
    (model.species || []).map((species) => [String(species?.name || ''), species])
  );

  const amountOnlySymbols = new Set<string>();
  const concentrationSymbolsWithVolumeDivision = new Set<string>();
  for (const fn of model.functions || []) {
    const fnName = String(fn?.name || '').trim();
    if (!fnName.startsWith('_c_')) continue;
    const symbol = fnName.slice(3).trim();
    if (!symbol) continue;
    const expression = normalizeExpressionForMatch(fn?.expression || '');
    if (expression === symbol) {
      amountOnlySymbols.add(symbol);
      continue;
    }
    if (isVolumeNormalizedConcentrationExpression(expression, symbol)) {
      concentrationSymbolsWithVolumeDivision.add(symbol);
    }
  }

  const amountOnlySpeciesNames = new Set<string>();
  for (const symbol of amountOnlySymbols) {
    const names = resolveSpeciesNamesForSeedSymbol(symbolToSpeciesNames, symbol);
    for (const speciesName of names) {
      amountOnlySpeciesNames.add(speciesName);
    }
  }

  const preferInitialAmountSpeciesNames = new Set<string>();
  for (const symbol of concentrationSymbolsWithVolumeDivision) {
    const names = resolveSpeciesNamesForSeedSymbol(symbolToSpeciesNames, symbol);
    for (const speciesName of names) {
      if (amountOnlySpeciesNames.has(speciesName)) continue;
      const species = speciesByName.get(speciesName) as
        | { initialConcentration?: unknown; initialExpression?: unknown }
        | undefined;
      if (!species) continue;
    // Preserve amount-style seeds for mixed-unit species where atomizer produced
    // literal numeric seeds and concentration functions divide by compartment.
    // Exporting these as initialConcentration triggers Na inflation on re-parse.
      const expression =
        typeof species.initialExpression === 'string'
          ? normalizeExpressionForMatch(species.initialExpression)
          : '';
      if (!expression) continue;
      if (NA_LIKE_SEED_TOKEN_RE.test(expression)) continue;
      if (!NUMERIC_LITERAL_RE.test(expression)) continue;
      preferInitialAmountSpeciesNames.add(speciesName);
    }
  }

  return { amountOnlySpeciesNames, preferInitialAmountSpeciesNames };
}

type ReconstructedRule = {
  type: 'assignment' | 'rate';
  variable: string;
  formula: string;
};

function buildSpeciesAliasMap(model: BNGLModel, speciesIdByName: Map<string, string>): Map<string, string> {
  const aliasToSpeciesId = new Map<string, string>();
  const speciesResolver = buildSpeciesNameResolver(Array.from(speciesIdByName.keys()));
  const speciesIdByNormalizedPattern = new Map<string, string>();

  for (const [name, id] of speciesIdByName.entries()) {
    aliasToSpeciesId.set(name, id);
    const noDollar = name.replace(/^\$/, '');
    if (noDollar && noDollar !== name) {
      aliasToSpeciesId.set(noDollar, id);
    }
    const normalized = normalizeSpeciesPatternForLookup(name);
    if (normalized && !speciesIdByNormalizedPattern.has(normalized)) {
      speciesIdByNormalizedPattern.set(normalized, id);
    }
    const symbol = extractSpeciesSymbolFromName(noDollar);
    if (symbol && !aliasToSpeciesId.has(symbol)) {
      aliasToSpeciesId.set(symbol, id);
    }
  }

  for (const observable of model.observables || []) {
    const obsName = observable?.name?.trim();
    if (!obsName) continue;
    const primaryPattern = (observable.pattern || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)[0];
    if (!primaryPattern) continue;
    let sid = speciesIdByName.get(primaryPattern);
    if (!sid) {
      const resolvedName =
        speciesResolver.get(primaryPattern) ??
        speciesResolver.get(normalizeSpeciesAlias(primaryPattern)) ??
        (() => {
          const alt = toAltCompartmentNotation(primaryPattern);
          if (!alt) return undefined;
          return speciesResolver.get(alt) ?? speciesResolver.get(normalizeSpeciesAlias(alt));
        })();
      if (resolvedName) {
        sid = speciesIdByName.get(resolvedName);
      }
    }
    if (!sid) {
      const normalizedPattern = normalizeSpeciesPatternForLookup(primaryPattern);
      if (normalizedPattern) {
        sid = speciesIdByNormalizedPattern.get(normalizedPattern);
      }
    }
    if (!sid) continue;
    aliasToSpeciesId.set(obsName, sid);
    if (/_amt$/i.test(obsName)) {
      aliasToSpeciesId.set(obsName.replace(/_amt$/i, ''), sid);
    }
  }

  for (const [speciesName, sid] of speciesIdByName.entries()) {
    const mPattern = speciesName.match(/(?:^|:)M_([A-Za-z_][A-Za-z0-9_]*)(?:@|$)/);
    if (mPattern?.[1] && !aliasToSpeciesId.has(mPattern[1])) {
      aliasToSpeciesId.set(mPattern[1], sid);
    }
    const directPattern = speciesName.match(/^@[^:]+:([A-Za-z_][A-Za-z0-9_]*)$/);
    if (directPattern?.[1] && !aliasToSpeciesId.has(directPattern[1])) {
      aliasToSpeciesId.set(directPattern[1], sid);
    }
  }

  return aliasToSpeciesId;
}

function reconstructRules(model: BNGLModel, speciesIdByName: Map<string, string>): ReconstructedRule[] {
  const functions = model.functions || [];
  if (functions.length === 0) return [];

  const parameterNames = new Set(Object.keys(model.parameters || {}));
  const compartmentNames = new Set((model.compartments || []).map((c) => c.name));
  const speciesAliasMap = buildSpeciesAliasMap(model, speciesIdByName);
  const dedup = new Map<string, ReconstructedRule>();
  const knownRuleSymbols = new Set<string>();

  for (const fn of functions) {
    const fnName = fn?.name?.trim() || '';
    const expr = (fn?.expression || '').trim();
    if (!fnName) continue;

    let type: ReconstructedRule['type'] | null = null;
    let rawVariable = '';
    if (fnName.startsWith(ASSIGN_RULE_META_PREFIX)) {
      type = 'assignment';
      rawVariable = fnName.slice(ASSIGN_RULE_META_PREFIX.length);
    } else if (fnName.startsWith(RATE_RULE_META_PREFIX)) {
      type = 'rate';
      rawVariable = fnName.slice(RATE_RULE_META_PREFIX.length);
    } else {
      continue;
    }

    let variable = rawVariable;
    if (speciesAliasMap.has(rawVariable)) {
      variable = speciesAliasMap.get(rawVariable)!;
    } else if (!parameterNames.has(rawVariable) && !compartmentNames.has(rawVariable)) {
      const noAmt = rawVariable.replace(/_amt$/i, '');
      if (speciesAliasMap.has(noAmt)) {
        variable = speciesAliasMap.get(noAmt)!;
      }
    }
    knownRuleSymbols.add(rawVariable);
    knownRuleSymbols.add(variable);

    let formula = expr || '0';
    formula = replaceNames(formula, speciesAliasMap, { skipFunctionCalls: true });
    formula = formula.replace(/\bS(\d+)_amt\b/g, (_, idxStr: string) => {
      const idx = Number(idxStr) - 1;
      return Number.isFinite(idx) && idx >= 0 ? `s${idx}` : `S${idxStr}_amt`;
    });

    const key = `${type}:${variable}`;
    dedup.set(key, {
      type,
      variable,
      formula,
    });
  }

  const orderedSymbols = Array.from(knownRuleSymbols)
    .filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s))
    .sort((a, b) => b.length - a.length);

  const rules = Array.from(dedup.values());
  for (const rule of rules) {
    let normalizedFormula = rule.formula;
    for (const symbol of orderedSymbols) {
      const re = new RegExp(`\\b${escapeRegExp(symbol)}\\s*\\(\\s*\\)`, 'g');
      normalizedFormula = normalizedFormula.replace(re, symbol);
    }
    rule.formula = normalizedFormula;
  }

  return rules;
}

function ruleRateToFormula(rule: any, reverse: boolean): string {
  const direct = reverse
    ? (rule?.reverseRate ?? rule?.rateExpression ?? rule?.rate)
    : (rule?.rateExpression ?? rule?.rate);
  const text = String(direct ?? '').trim();
  return text || '0';
}

function replaceIndexedAmountRefsWithSpeciesIds(formula: string): string {
  return String(formula || '').replace(/\bS(\d+)_amt\b/g, (_match, idxStr: string) => {
    const idx = Number(idxStr) - 1;
    return Number.isFinite(idx) && idx >= 0 ? `s${idx}` : `S${idxStr}_amt`;
  });
}

function normalizeSpeciesAlias(name: string): string {
  return name.replace(/\s+/g, '').replace(/\(\)/g, '');
}

function toAltCompartmentNotation(name: string): string | null {
  const suffix = name.match(/^(.+)@([^@]+)$/);
  if (suffix?.[1] && suffix?.[2]) {
    return `@${suffix[2]}:${suffix[1]}`;
  }
  const prefix = name.match(/^@([^:]+):(.+)$/);
  if (prefix?.[1] && prefix?.[2]) {
    return `${prefix[2]}@${prefix[1]}`;
  }
  return null;
}

function addSpeciesAlias(
  map: Map<string, string>,
  alias: string,
  canonical: string
): void {
  const normalized = alias.trim();
  if (!normalized) return;
  if (!map.has(normalized)) {
    map.set(normalized, canonical);
  }
}

function buildSpeciesNameResolver(speciesNames: string[]): Map<string, string> {
  const resolver = new Map<string, string>();
  for (const name of speciesNames) {
    addSpeciesAlias(resolver, name, name);
    const noEmptyParens = normalizeSpeciesAlias(name);
    addSpeciesAlias(resolver, noEmptyParens, name);
    const alt = toAltCompartmentNotation(name);
    if (alt) {
      addSpeciesAlias(resolver, alt, name);
      addSpeciesAlias(resolver, normalizeSpeciesAlias(alt), name);
    }
  }
  return resolver;
}

function buildSpeciesIdLookup(speciesList: Array<{ name: string }>): Map<string, string> {
  const byName = new Map<string, string>();
  speciesList.forEach((s, i) => {
    byName.set(s.name, `s${i}`);
  });

  const resolver = buildSpeciesNameResolver(speciesList.map((s) => s.name));
  const byAlias = new Map<string, string>();
  for (const [alias, canonicalName] of resolver.entries()) {
    const sid = byName.get(canonicalName);
    if (!sid) continue;
    if (!byAlias.has(alias)) byAlias.set(alias, sid);
  }
  return byAlias;
}

function buildExportableReactions(model: BNGLModel): BNGLReaction[] {
  const speciesResolver = buildSpeciesNameResolver((model.species || []).map((s: any) => String(s.name)));
  const resolveTerms = (terms: string[]): string[] | null => {
    const resolved: string[] = [];
    for (const raw of terms) {
      const token = String(raw ?? '').trim();
      if (!token || token === '0' || token.toLowerCase() === 'null') continue;
      const match =
        speciesResolver.get(token) ??
        speciesResolver.get(normalizeSpeciesAlias(token)) ??
        (() => {
          const alt = toAltCompartmentNotation(token);
          if (!alt) return undefined;
          return speciesResolver.get(alt) ?? speciesResolver.get(normalizeSpeciesAlias(alt));
        })();
      if (!match) return null;
      resolved.push(match);
    }
    return resolved;
  };

  const explicitReactions = Array.isArray(model.reactions) ? model.reactions : [];
  if (explicitReactions.length > 0) {
    let unresolvedExplicit = 0;
    const normalizedExplicit: BNGLReaction[] = [];
    for (const rxn of explicitReactions) {
      if (isSyntheticRateRuleReaction(rxn as unknown as Record<string, unknown>)) {
        continue;
      }
      const reactantsRaw = (rxn.reactants || []).map((x) => String(x));
      const productsRaw = (rxn.products || []).map((x) => String(x));
      if (
        reactantsRaw.some((name) => isSyntheticRateRuleSpeciesName(String(name))) ||
        productsRaw.some((name) => isSyntheticRateRuleSpeciesName(String(name)))
      ) {
        continue;
      }
      const reactants = resolveTerms(reactantsRaw);
      const products = resolveTerms(productsRaw);
      if (!reactants || !products) {
        unresolvedExplicit += 1;
        continue;
      }
      normalizedExplicit.push({
        ...rxn,
        reactants,
        products,
        reversible: Boolean((rxn as any)?.reversible),
        reverseRate: typeof (rxn as any)?.reverseRate === 'string' ? String((rxn as any).reverseRate) : undefined,
      });
    }
    if (unresolvedExplicit > 0) {
      logger.warning(
        'SBMW016E',
        `Skipped ${unresolvedExplicit} explicit reactions with unresolved species terms`
      );
    }
    return normalizedExplicit;
  }

  const rules: any[] = Array.isArray((model as any).reactionRules) ? (model as any).reactionRules : [];
  if (rules.length === 0) return [];

  const derived: BNGLReaction[] = [];
  let unresolvedDerived = 0;
  for (const rule of rules) {
    if (isSyntheticRateRuleReaction(rule as Record<string, unknown>)) continue;
    const reactants = Array.isArray(rule?.reactants) ? rule.reactants.map((x: any) => String(x)) : [];
    const products = Array.isArray(rule?.products) ? rule.products.map((x: any) => String(x)) : [];
    if (reactants.some((name) => isSyntheticRateRuleSpeciesName(name))) continue;
    if (products.some((name) => isSyntheticRateRuleSpeciesName(name))) continue;
    const resolvedReactants = resolveTerms(reactants);
    const resolvedProducts = resolveTerms(products);
    if (!resolvedReactants || !resolvedProducts) {
      unresolvedDerived += 1;
      continue;
    }

    const forwardRate = ruleRateToFormula(rule, false);
    const reverseRate = ruleRateToFormula(rule, true);
    const netRate = rule?.isBidirectional
      ? `((${forwardRate || '0'}) - (${reverseRate || '0'}))`
      : (forwardRate || '0');

    derived.push({
      reactants: [...resolvedReactants],
      products: [...resolvedProducts],
      rate: netRate,
      rateConstant: 0,
      reversible: Boolean(rule?.isBidirectional),
      reverseRate: rule?.isBidirectional ? reverseRate : undefined,
    });
  }
  if (unresolvedDerived > 0) {
    logger.warning(
      'SBMW016E',
      `Skipped ${unresolvedDerived} derived reactions with unresolved rule terms`
    );
  }

  return derived;
}

function isSyntheticCompartmentParameter(name: string): boolean {
  return /^__compartment_[A-Za-z0-9_]+__$/.test(name);
}

function isSyntheticRateRuleSpeciesName(name: string): boolean {
  return (name || '').toLowerCase().includes(SYNTH_RATE_RULE_SPECIES_PREFIX.toLowerCase());
}

function isSyntheticRateRuleReaction(reaction: Record<string, unknown>): boolean {
  const candidates: unknown[] = [
    reaction.rate,
    reaction.rateExpression,
    reaction.reverseRate,
    reaction.name,
    reaction.label,
    reaction.id,
  ];
  return candidates.some(
    (value) => typeof value === 'string' && /__rate_rule_/i.test(value)
  );
}

function isSymbolReferenced(expressionText: string, symbol: string): boolean {
  if (!symbol) return false;
  const escaped = escapeRegExp(symbol);
  return new RegExp(`\\b${escaped}\\b`).test(expressionText);
}

function generateSBMLPureXml(model: BNGLModel): string {
  const modelStarted = Date.now();
  const modelId = (model.name?.replace(/\W/g, '_') || 'bngl_model').slice(0, 256);
  const modelName = xmlEscape(model.name || 'BioNetGen Export');

  const compartments = model.compartments && model.compartments.length > 0
    ? model.compartments
    : [{ name: 'default', dimension: 3, size: 1 } as any];
  const compartmentNames = new Set(compartments.map((c) => String(c.name || '')));

  const speciesList = (model.species || []).filter(
    (species) => !isSyntheticRateRuleSpeciesName(species.name)
  );
  const speciesIdByName = buildSpeciesIdLookup(speciesList as Array<{ name: string }>);
  const replaceSpeciesInFormula = createNameReplacer(speciesIdByName);
  const reconstructedRules = reconstructRules(model, speciesIdByName);
  const exportableReactions = buildExportableReactions(model);
  const referenceText = [
    ...exportableReactions.map((r) => r.rate || ''),
    ...reconstructedRules.map((r) => r.formula || ''),
  ].join('\n');
  const speciesIds = new Set(Array.from(speciesIdByName.values()));
  const effectiveParameters = new Map<string, number>();
  for (const [name, value] of Object.entries(model.parameters || {})) {
    if (isSyntheticCompartmentParameter(name) && !isSymbolReferenced(referenceText, name)) {
      continue;
    }
    effectiveParameters.set(name, Number.isFinite(Number(value)) ? Number(value) : 0);
  }
  for (const rule of reconstructedRules) {
    const variable = rule.variable;
    if (!variable) continue;
    if (speciesIds.has(variable)) continue;
    if (compartments.some((c) => c.name === variable)) continue;
    if (!effectiveParameters.has(variable)) {
      // Assignment/rate rules may target symbols omitted from BNGL parameters.
      effectiveParameters.set(variable, 0);
    }
  }
  const parameterRuleTargets = new Set(
    reconstructedRules
      .filter((r) => effectiveParameters.has(r.variable))
      .map((r) => r.variable)
  );
  const speciesRuleTargets = new Set(
    reconstructedRules
      .filter((r) => speciesIds.has(r.variable))
      .map((r) => r.variable)
  );
  const compartmentRuleTargets = new Set(
    reconstructedRules
      .filter((r) => compartments.some((c) => c.name === r.variable))
      .map((r) => r.variable)
  );
  const initialExpressionSymbols = buildInitialExpressionSymbolMap(model, effectiveParameters);
  const seedExportSemantics = buildSeedExportSemantics(model);
  const amountOnlySpeciesNames = seedExportSemantics.amountOnlySpeciesNames;
  const preferInitialAmountSpeciesNames = seedExportSemantics.preferInitialAmountSpeciesNames;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<sbml xmlns="http://www.sbml.org/sbml/level2/version4" level="2" version="4">');
  lines.push(`  <model id="${xmlEscape(modelId)}" name="${modelName}">`);

  const compartmentsStarted = Date.now();
  lines.push('    <listOfCompartments>');
  for (const c of compartments) {
    const outside = getCompartmentOutside(c as any, compartmentNames);
    const outsideAttr = outside ? ` outside="${xmlEscape(outside)}"` : '';
    lines.push(
      `      <compartment id="${xmlEscape(c.name)}" name="${xmlEscape(c.name)}" spatialDimensions="${Number.isFinite(c.dimension) ? c.dimension : 3}" size="${Number.isFinite(c.size) ? c.size : 1}" constant="${boolAttr(!compartmentRuleTargets.has(c.name))}"${outsideAttr}/>`
    );
  }
  lines.push('    </listOfCompartments>');
  logWriterTiming('pureXml.compartments', compartmentsStarted, `count=${compartments.length}`);

  const parametersStarted = Date.now();
  const params = Array.from(effectiveParameters.entries());
  if (params.length > 0) {
    lines.push('    <listOfParameters>');
    for (const [id, rawVal] of params) {
      const val = Number.isFinite(Number(rawVal)) ? Number(rawVal) : 0;
      lines.push(
        `      <parameter id="${xmlEscape(id)}" name="${xmlEscape(id)}" value="${val}" constant="${boolAttr(!parameterRuleTargets.has(id))}"/>`
      );
    }
    lines.push('    </listOfParameters>');
  }
  logWriterTiming('pureXml.parameters', parametersStarted, `count=${params.length}`);

  const speciesStarted = Date.now();
  lines.push('    <listOfSpecies>');
  speciesList.forEach((s, i) => {
    const sid = `s${i}`;
    const speciesName = String(s.name || '');
    let compId = inferSpeciesCompartmentName(s.name);
    if (!compId || !compartmentNames.has(compId)) {
      compId = compartments[0].name || 'default';
    }
    const isBoundarySpecies = !!s.isConstant;
    const isConstantSpecies = isBoundarySpecies && !speciesRuleTargets.has(sid);
    const amountOnly = amountOnlySpeciesNames.has(speciesName);
    const preferInitialAmount = !amountOnly && preferInitialAmountSpeciesNames.has(speciesName);
    if (amountOnly) {
      const initAmount = resolveSpeciesInitialAmount(
        s as unknown as { initialConcentration?: unknown; initialExpression?: unknown },
        initialExpressionSymbols,
        effectiveParameters
      );
      lines.push(
        `      <species id="${xmlEscape(sid)}" name="${xmlEscape(speciesName)}" compartment="${xmlEscape(compId)}" initialAmount="${initAmount}" hasOnlySubstanceUnits="true" boundaryCondition="${boolAttr(isBoundarySpecies)}" constant="${boolAttr(isConstantSpecies)}"/>`
      );
    } else if (preferInitialAmount) {
      const initAmount = resolveSpeciesInitialConcentration(
        s as unknown as { name?: unknown; initialConcentration?: unknown; initialExpression?: unknown },
        initialExpressionSymbols,
        effectiveParameters
      );
      lines.push(
        `      <species id="${xmlEscape(sid)}" name="${xmlEscape(speciesName)}" compartment="${xmlEscape(compId)}" initialAmount="${initAmount}" hasOnlySubstanceUnits="false" boundaryCondition="${boolAttr(isBoundarySpecies)}" constant="${boolAttr(isConstantSpecies)}"/>`
      );
    } else {
      const initConcentration = resolveSpeciesInitialConcentration(
        s as unknown as { name?: unknown; initialConcentration?: unknown; initialExpression?: unknown },
        initialExpressionSymbols,
        effectiveParameters
      );
      lines.push(
        `      <species id="${xmlEscape(sid)}" name="${xmlEscape(speciesName)}" compartment="${xmlEscape(compId)}" initialConcentration="${initConcentration}" hasOnlySubstanceUnits="false" boundaryCondition="${boolAttr(isBoundarySpecies)}" constant="${boolAttr(isConstantSpecies)}"/>`
      );
    }
  });
  lines.push('    </listOfSpecies>');
  logWriterTiming('pureXml.species', speciesStarted, `count=${speciesList.length}`);

  const reactions = exportableReactions;
  if (reactions.length > 0) {
    const reactionsStarted = Date.now();
    lines.push('    <listOfReactions>');
    for (let i = 0; i < reactions.length; i++) {
      const r = reactions[i];
      lines.push(`      <reaction id="r${i}" reversible="${boolAttr(!!(r as any).reversible)}">`);

      lines.push('        <listOfReactants>');
      r.reactants.forEach((name) => {
        const sid = speciesIdByName.get(name);
        if (!sid) return;
        lines.push(`          <speciesReference species="${xmlEscape(sid)}" stoichiometry="1" constant="true"/>`);
      });
      lines.push('        </listOfReactants>');

      lines.push('        <listOfProducts>');
      r.products.forEach((name) => {
        const sid = speciesIdByName.get(name);
        if (!sid) return;
        lines.push(`          <speciesReference species="${xmlEscape(sid)}" stoichiometry="1" constant="true"/>`);
      });
      lines.push('        </listOfProducts>');

      let formula = r.rate || '0';
      formula = replaceIndexedAmountRefsWithSpeciesIds(formula);
      formula = replaceSpeciesInFormula(formula);
      formula = expandRateMacroForSBML(formula, null);
      formula = replaceSpeciesInFormula(formula);
      lines.push(`        <kineticLaw formula="${xmlEscape(formula)}"/>`);
      lines.push('      </reaction>');
      if (SBML_WRITER_DEBUG_TIMINGS && i > 0 && i % 500 === 0) {
        logWriterTiming('pureXml.reactions.progress', reactionsStarted, `processed=${i}/${reactions.length}`);
      }
    }
    lines.push('    </listOfReactions>');
    logWriterTiming('pureXml.reactions', reactionsStarted, `count=${reactions.length}`);
  }

  if (reconstructedRules.length > 0) {
    const rulesStarted = Date.now();
    lines.push('    <listOfRules>');
    for (const rule of reconstructedRules) {
      if (!rule.variable) continue;
      if (rule.type === 'assignment') {
        lines.push(`      <assignmentRule variable="${xmlEscape(rule.variable)}">`);
        lines.push(`        ${formulaToMathML(rule.formula || '0')}`);
        lines.push('      </assignmentRule>');
      } else {
        lines.push(`      <rateRule variable="${xmlEscape(rule.variable)}">`);
        lines.push(`        ${formulaToMathML(rule.formula || '0')}`);
        lines.push('      </rateRule>');
      }
    }
    lines.push('    </listOfRules>');
    logWriterTiming('pureXml.rules', rulesStarted, `count=${reconstructedRules.length}`);
  }

  lines.push('  </model>');
  lines.push('</sbml>');
  const xml = lines.join('\n');
  logWriterTiming('pureXml.total', modelStarted, `species=${speciesList.length} reactions=${reactions.length}`);
  return xml;
}

/**
 * Initialize libsbml for the writer
 */
async function ensureLibSBML() {
  const isNode = typeof process !== 'undefined' && !!process.versions?.node;
  const allowParserReuse = !isNode || process.env?.SBML_WRITER_REUSE_PARSER_LIB === '1';

  const parserLib = getLibSBMLInstance();
  if (
    allowParserReuse &&
    parserLib &&
    typeof parserLib.SBMLDocument === 'function' &&
    (typeof parserLib.writeSBMLToString === 'function' || typeof parserLib.SBMLWriter === 'function')
  ) {
    libsbml = parserLib;
    logger.info('SBMW000', 'Reusing libsbml instance from SBML parser');
    return libsbml;
  }

  const globalCandidate: any =
    (typeof self !== 'undefined' ? (self as any) : undefined) ||
    (typeof globalThis !== 'undefined' ? (globalThis as any) : undefined);

  if (
    allowParserReuse &&
    !libsbml &&
    globalCandidate &&
    typeof globalCandidate.SBMLDocument === 'function' &&
    (typeof globalCandidate.writeSBMLToString === 'function' || typeof globalCandidate.SBMLWriter === 'function')
  ) {
    libsbml = globalCandidate;
    logger.info('SBMW000', 'Reusing globally initialized libsbml instance');
    return libsbml;
  }

  if (libsbml) return libsbml;
  if (libsbmlInitPromise) return libsbmlInitPromise;

  libsbmlInitPromise = (async () => {
    logger.info('SBMW001', 'Initializing libsbml for SBML writer');
    // @ts-ignore - Dynamic WASM import
    const libsbmlModule = await import('libsbmljs_stable');
    const factory = libsbmlModule.default || libsbmlModule.libsbml || libsbmlModule;

    const config: Record<string, unknown> = {
      onAbort: (reason: unknown) => {
        console.error('[sbmlWriter] libsbml abort:', reason);
      },
      TOTAL_MEMORY: 128 * 1024 * 1024,
      noInitialRun: true,
      print: (text: string) => console.log(`[sbmlWriter] ${text}`),
      printErr: (text: string) => console.warn(`[sbmlWriter:err] ${text}`),
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
      const fs = await import('node:fs');
      const path = await import('node:path');
      const wasmPath = path.resolve(process.cwd(), 'public', 'libsbml.wasm');
      if (!fs.existsSync(wasmPath)) {
        throw new Error(`libsbml.wasm not found at expected path: ${wasmPath}`);
      }
      (config as any).__wasmPath = wasmPath;
      config.wasmBinary = new Uint8Array(fs.readFileSync(wasmPath));
      logger.info('SBMW002', `Using libsbml wasm at ${wasmPath}`);
    }

    const initialized = await withTimeout(
      Promise.resolve(factory.call(globalCandidate ?? undefined, config)),
      SBML_WRITER_INIT_TIMEOUT_MS,
      'SBML writer libsbml initialization'
    );

    if (!initialized || typeof initialized.SBMLDocument !== 'function') {
      throw new Error('libsbml writer initialization returned an invalid module instance');
    }

    libsbml = initialized;
    logger.info('SBMW003', 'libsbml writer initialized');
    return libsbml;
  })()
    .catch((error) => {
      libsbml = null;
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('SBMW004', `Failed to initialize libsbml writer: ${msg}`);
      throw error;
    })
    .finally(() => {
      libsbmlInitPromise = null;
    });

  return libsbmlInitPromise;
}

/**
 * Generate SBML L3V2 string from a BNGL model
 */
export async function generateSBML(model: BNGLModel): Promise<string> {
  const isNode = typeof process !== 'undefined' && !!process.versions?.node;
  const forceLibSBML = typeof process !== 'undefined' && process.env?.SBML_WRITER_FORCE_LIBSBML === '1';
  if (isNode && !forceLibSBML) {
    logger.info('SBMW009', 'Using pure XML SBML writer (Node mode)');
    return generateSBMLPureXml(model);
  }

  logger.info('SBMW010', 'generateSBML start');
  const lib = await ensureLibSBML();
  logger.info('SBMW011', 'generateSBML libsbml ready');
  
  // Create SBML L3V2 document
  logger.info('SBMW012', 'generateSBML create document/model');
  const doc = new lib.SBMLDocument(3, 2);
  const sbmlModel = doc.createModel();
  sbmlModel.setId(model.name?.replace(/\W/g, '_') || 'bngl_model');
  sbmlModel.setName(model.name || 'BioNetGen Export');
  const sbmlModelAny = sbmlModel as any;
  const speciesList = (model.species || []).filter(
    (species) => !isSyntheticRateRuleSpeciesName(species.name)
  );
  const speciesIdByName = buildSpeciesIdLookup(speciesList as Array<{ name: string }>);
  const replaceSpeciesInFormula = createNameReplacer(speciesIdByName);
  const reconstructedRules = reconstructRules(model, speciesIdByName);
  const exportableReactions = buildExportableReactions(model);
  const referenceText = [
    ...exportableReactions.map((r) => r.rate || ''),
    ...reconstructedRules.map((r) => r.formula || ''),
  ].join('\n');
  const speciesIds = new Set(Array.from(speciesIdByName.values()));
  const effectiveParameters = new Map<string, number>();
  for (const [name, value] of Object.entries(model.parameters || {})) {
    if (isSyntheticCompartmentParameter(name) && !isSymbolReferenced(referenceText, name)) {
      continue;
    }
    effectiveParameters.set(name, Number.isFinite(Number(value)) ? Number(value) : 0);
  }
  for (const rule of reconstructedRules) {
    const variable = rule.variable;
    if (!variable) continue;
    if (speciesIds.has(variable)) continue;
    if ((model.compartments || []).some((c) => c.name === variable)) continue;
    if (!effectiveParameters.has(variable)) {
      effectiveParameters.set(variable, 0);
    }
  }
  const parameterRuleTargets = new Set(
    reconstructedRules
      .filter((r) => effectiveParameters.has(r.variable))
      .map((r) => r.variable)
  );
  const speciesRuleTargets = new Set(
    reconstructedRules
      .filter((r) => speciesIds.has(r.variable))
      .map((r) => r.variable)
  );
  const compartmentRuleTargets = new Set(
    reconstructedRules
      .filter((r) => (model.compartments || []).some((c) => c.name === r.variable))
      .map((r) => r.variable)
  );
  const initialExpressionSymbols = buildInitialExpressionSymbolMap(model, effectiveParameters);
  const seedExportSemantics = buildSeedExportSemantics(model);
  const amountOnlySpeciesNames = seedExportSemantics.amountOnlySpeciesNames;
  const preferInitialAmountSpeciesNames = seedExportSemantics.preferInitialAmountSpeciesNames;
  const availableCompartmentNames = new Set(
    (model.compartments || []).map((c) => String(c.name || '')).filter(Boolean)
  );
  if (availableCompartmentNames.size === 0) {
    availableCompartmentNames.add('default');
  }

  // 1. Compartments
  logger.info('SBMW013', `generateSBML compartments count=${model.compartments?.length ?? 0}`);
  if (model.compartments && model.compartments.length > 0) {
    const compartmentNames = new Set(model.compartments.map((c) => String(c.name || '')));
    for (const c of model.compartments) {
      const comp = sbmlModel.createCompartment();
      comp.setId(c.name);
      comp.setName(c.name);
      comp.setSpatialDimensions(c.dimension);
      comp.setSize(c.size);
      comp.setConstant(!compartmentRuleTargets.has(c.name));
      const outside = getCompartmentOutside(c as any, compartmentNames);
      if (outside && typeof comp.setOutside === 'function') {
        comp.setOutside(outside);
      }
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
  logger.info('SBMW014', `generateSBML parameters count=${effectiveParameters.size}`);
  if (effectiveParameters.size > 0) {
    for (const [id, val] of effectiveParameters.entries()) {
      const param = sbmlModel.createParameter();
      param.setId(id);
      param.setValue(val);
      param.setConstant(!parameterRuleTargets.has(id));
    }
  }

  // 3. Species
  logger.info('SBMW015', `generateSBML species count=${speciesList.length}`);
  speciesList.forEach((s, i) => {
    const spec = sbmlModel.createSpecies();
    const sid = `s${i}`;
    const speciesName = String(s.name || '');
    spec.setId(sid);
    spec.setName(speciesName);
    speciesIdByName.set(speciesName, sid);
    
    // Determine compartment from species naming, then validate against declared compartments.
    let compId = inferSpeciesCompartmentName(s.name);
    if (!compId || !availableCompartmentNames.has(compId)) {
      compId = 'default';
    }
    if ((compId === 'default' || !availableCompartmentNames.has(compId)) && model.compartments && model.compartments.length > 0) {
      compId = model.compartments[0].name;
    }
    
    const isBoundarySpecies = !!s.isConstant;
    const isConstantSpecies = isBoundarySpecies && !speciesRuleTargets.has(sid);
    const amountOnly = amountOnlySpeciesNames.has(speciesName);
    const preferInitialAmount = !amountOnly && preferInitialAmountSpeciesNames.has(speciesName);
    spec.setCompartment(compId);
    if (amountOnly) {
      spec.setInitialAmount(
        resolveSpeciesInitialAmount(
          s as unknown as { initialConcentration?: unknown; initialExpression?: unknown },
          initialExpressionSymbols,
          effectiveParameters
        )
      );
      spec.setHasOnlySubstanceUnits(true);
    } else if (preferInitialAmount) {
      spec.setInitialAmount(
        resolveSpeciesInitialConcentration(
          s as unknown as { name?: unknown; initialConcentration?: unknown; initialExpression?: unknown },
          initialExpressionSymbols,
          effectiveParameters
        )
      );
      spec.setHasOnlySubstanceUnits(false);
    } else {
      spec.setInitialConcentration(
        resolveSpeciesInitialConcentration(
          s as unknown as { name?: unknown; initialConcentration?: unknown; initialExpression?: unknown },
          initialExpressionSymbols,
          effectiveParameters
        )
      );
      spec.setHasOnlySubstanceUnits(false);
    }
    spec.setBoundaryCondition(isBoundarySpecies);
    spec.setConstant(isConstantSpecies);
  });

  // 4. Reactions
  logger.info('SBMW016', `generateSBML reactions count=${exportableReactions.length}`);
  if (exportableReactions.length > 0) {
    exportableReactions.forEach((r, i) => {
      const rxn = sbmlModel.createReaction();
      const rid = `r${i}`;
      rxn.setId(rid);
      rxn.setReversible(!!(r as any).reversible);

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
        const sid = speciesIdByName.get(reactName);
        if (!sid) return;
        const ref = rxn.createReactant();
        ref.setSpecies(sid);
        ref.setStoichiometry(1);
        ref.setConstant(true);
      });

      // Map products
      r.products.forEach(prodName => {
        const sid = speciesIdByName.get(prodName);
        if (!sid) return;
        const ref = rxn.createProduct();
        ref.setSpecies(sid);
        ref.setStoichiometry(1);
        ref.setConstant(true);
      });

      // Kinetic Law
      const kl = rxn.createKineticLaw();
      // Simple mass action formula for now
      let formula = r.rate || '0';
      formula = replaceIndexedAmountRefsWithSpeciesIds(formula);
      formula = replaceSpeciesInFormula(formula);
      formula = expandRateMacroForSBML(formula, substrateId);
      formula = replaceSpeciesInFormula(formula);
      // If the rate is a parameter name, it's fine. If it's a number, it's fine.
      // For more complex expressions, we should use MathML, but libsbml.setFormula handles infix.
      kl.setFormula(formula);
    });
  }

  // 5. Reconstructed rules from atomizer metadata functions
  logger.info('SBMW016R', `generateSBML reconstructed rules count=${reconstructedRules.length}`);
  for (const rule of reconstructedRules) {
    if (!rule.variable) continue;
    let sbmlRule: any = null;
    if (rule.type === 'assignment' && typeof sbmlModelAny.createAssignmentRule === 'function') {
      sbmlRule = sbmlModelAny.createAssignmentRule();
    } else if (rule.type === 'rate' && typeof sbmlModelAny.createRateRule === 'function') {
      sbmlRule = sbmlModelAny.createRateRule();
    }
    if (!sbmlRule) {
      logger.warning('SBMW016R', `Skipping ${rule.type} rule ${rule.variable}: SBML API missing rule constructors`);
      continue;
    }
    if (typeof sbmlRule.setVariable === 'function') {
      sbmlRule.setVariable(rule.variable);
    }
    if (typeof sbmlRule.setFormula === 'function') {
      sbmlRule.setFormula(rule.formula || '0');
    } else if (typeof sbmlRule.setMath === 'function' && typeof (lib as any).parseL3Formula === 'function') {
      const math = (lib as any).parseL3Formula(rule.formula || '0');
      if (math) sbmlRule.setMath(math);
    } else {
      logger.warning('SBMW016R', `Rule ${rule.variable} has no supported formula setter; leaving empty math`);
    }
  }

  logger.info('SBMW017', 'generateSBML writing XML string');
  let result = '';
  if (typeof lib.writeSBMLToString === 'function') {
    result = lib.writeSBMLToString(doc);
  } else if (typeof lib.SBMLWriter === 'function') {
    const writer = new lib.SBMLWriter();
    try {
      result = writer.writeSBMLToString(doc);
    } finally {
      if (typeof writer.delete === 'function') {
        writer.delete();
      }
    }
  } else {
    throw new Error('libsbml instance does not provide SBML serialization APIs');
  }
  logger.info('SBMW018', `generateSBML complete len=${result?.length ?? 0}`);
  doc.delete();
  
  return result;
}
