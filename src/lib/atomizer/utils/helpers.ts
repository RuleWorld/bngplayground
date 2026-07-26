/**
 * Utility Functions for BNG Atomizer
 * Complete TypeScript port of util.py and helper functions
 */

// =============================================================================
// Random Number Generation
// =============================================================================

/**
 * Generate a random integer between min and max (inclusive)
 */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// =============================================================================
// Deep Copy
// =============================================================================

/**
 * Create a deep copy of any value
 */
export function deepCopy<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepCopy(item)) as unknown as T;
  }

  if (obj instanceof Map) {
    return new Map(Array.from(obj.entries()).map(([k, v]) => [deepCopy(k), deepCopy(v)])) as unknown as T;
  }

  if (obj instanceof Set) {
    return new Set(Array.from(obj).map(v => deepCopy(v))) as unknown as T;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  // Check if object has a copy method
  if (typeof (obj as any).copy === 'function') {
    return (obj as any).copy();
  }

  const cloned: any = {};
  for (const key of Object.keys(obj)) {
    cloned[key] = deepCopy((obj as any)[key]);
  }
  return cloned;
}

// =============================================================================
// Counter Class (like Python's collections.Counter)
// =============================================================================

/**
 * Counter class for counting occurrences of elements
 */
export class Counter<T> extends Map<T, number> {
  constructor(items?: Iterable<T>) {
    super();
    if (items) {
      this.update(items);
    }
  }

  /**
   * Update counter with items from an iterable
   */
  update(items: Iterable<T>): void {
    for (const item of items) {
      this.set(item, (this.get(item) || 0) + 1);
    }
  }

  /**
   * Get count for an item (returns 0 if not present)
   */
  getCount(item: T): number {
    return this.get(item) || 0;
  }

  /**
   * Get the n most common elements
   */
  mostCommon(n?: number): Array<[T, number]> {
    const sorted = Array.from(this.entries()).sort((a, b) => b[1] - a[1]);
    return n !== undefined ? sorted.slice(0, n) : sorted;
  }

  /**
   * Get total count of all elements
   */
  total(): number {
    let sum = 0;
    for (const count of this.values()) {
      sum += count;
    }
    return sum;
  }

  /**
   * Get elements with their counts
   */
  elements(): T[] {
    const result: T[] = [];
    for (const [item, count] of this.entries()) {
      for (let i = 0; i < count; i++) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * Subtract counts from another counter
   */
  subtract(other: Counter<T> | Iterable<T>): void {
    if (other instanceof Counter) {
      for (const [item, count] of other.entries()) {
        this.set(item, (this.get(item) || 0) - count);
      }
    } else {
      for (const item of other) {
        this.set(item, (this.get(item) || 0) - 1);
      }
    }
  }
}

// =============================================================================
// DefaultDict Class (like Python's collections.defaultdict)
// =============================================================================

/**
 * DefaultDict - dictionary with default values for missing keys
 */
export class DefaultDict<K, V> extends Map<K, V> {
  constructor(private defaultFactory: () => V) {
    super();
  }

  get(key: K): V {
    if (!this.has(key)) {
      const value = this.defaultFactory();
      this.set(key, value);
      return value;
    }
    return super.get(key)!;
  }
}

// =============================================================================
// Memoization Decorators
// =============================================================================

/**
 * Memoization cache type
 */
type MemoCache = Map<string, any>;

const globalMemoCache: Map<string, MemoCache> = new Map();

/**
 * Memoize a function (persistent memoization)
 */
export function pmemoize<T extends (...args: any[]) => any>(
  fn: T,
  cacheKey?: string
): T {
  const key = cacheKey || fn.toString();
  if (!globalMemoCache.has(key)) {
    globalMemoCache.set(key, new Map());
  }
  const cache = globalMemoCache.get(key)!;

  return ((...args: Parameters<T>): ReturnType<T> => {
    const argKey = JSON.stringify(args);
    if (cache.has(argKey)) {
      return cache.get(argKey);
    }
    const result = fn(...args);
    cache.set(argKey, result);
    return result;
  }) as T;
}

/**
 * Memoize decorator class
 */
export class Memoize<T extends (...args: any[]) => any> {
  private cache: Map<string, ReturnType<T>> = new Map();

  constructor(private fn: T) { }

  call(...args: Parameters<T>): ReturnType<T> {
    const key = JSON.stringify(args);
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    const result = this.fn(...args);
    this.cache.set(key, result);
    return result;
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Memoize with mapped key function
 */
export class MemoizeMapped<T extends (...args: any[]) => any> {
  private cache: Map<string, ReturnType<T>> = new Map();

  constructor(
    private fn: T,
    private keyFn: (...args: Parameters<T>) => string
  ) { }

  call(...args: Parameters<T>): ReturnType<T> {
    const key = this.keyFn(...args);
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    const result = this.fn(...args);
    this.cache.set(key, result);
    return result;
  }

  clear(): void {
    this.cache.clear();
  }
}

// =============================================================================
// String Utilities
// =============================================================================

/**
 * Levenshtein edit distance between two strings
 */
export const levenshtein = pmemoize((s1: string, s2: string): number => {
  if (s1 === s2) return 0;
  const l1 = s1.length;
  const l2 = s2.length;

  if (l1 === 0) return l2;
  if (l2 === 0) return l1;

  // Use two rows instead of full matrix to save memory
  let prevRow = new Int32Array(l1 + 1);
  let currRow = new Int32Array(l1 + 1);

  for (let j = 0; j <= l1; j++) prevRow[j] = j;

  for (let i = 1; i <= l2; i++) {
    currRow[0] = i;
    for (let j = 1; j <= l1; j++) {
      const cost = s1[j - 1] === s2[i - 1] ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1,      // insertion
        prevRow[j] + 1,          // deletion
        prevRow[j - 1] + cost    // substitution
      );
    }
    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[l1];
}, 'levenshtein');

/**
 * Calculate similarity ratio (0-1)
 */
export function similarity(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(s1, s2) / maxLen;
}

/**
 * Sequence matcher ratio (like Python's difflib.SequenceMatcher)
 */
export function sequenceMatcherRatio(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  let matches = 0;
  const bCopy = [...b];

  for (const item of a) {
    const idx = bCopy.indexOf(item);
    if (idx !== -1) {
      matches++;
      bCopy.splice(idx, 1);
    }
  }

  return (2 * matches) / (a.length + b.length);
}

/**
 * Find longest common substring
 */
export function longestCommonSubstring(s1: string, s2: string): string {
  if (s1.length === 0 || s2.length === 0) return '';

  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  let maxLen = 0;
  let endIndex = 0;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > maxLen) {
          maxLen = dp[i][j];
          endIndex = i;
        }
      }
    }
  }

  return s1.substring(endIndex - maxLen, endIndex);
}

// =============================================================================
// Name Standardization (SBML to BNGL)
// =============================================================================

/**
 * Translation dictionary for SBML to BNGL name conversion
 */
const SBML_TO_BNGL_TRANSLATION: Record<string, string> = {
  '^': '',
  "'": '',
  '*': 'm',
  ' ': '_',
  '#': 'sh',
  ':': '_',
  // Greek-letter transliteration. Keys MUST stay as \u escapes (pure ASCII source):
  // a previous edit round-tripped this literal through a UTF-16LE/mojibake path, which
  // collapsed the Greek unicode keys to '?' and, fatally, to ASCII 'p' and 'f' -- turning
  // 'p'->'pi' and 'f'->'ph' into global substring rewrites that mangled every identifier
  // containing p or f (phos->pihos, alpha->alpiha, influx->inphlux, ...).
  '\u03B1': 'a', '\u03B2': 'b', '\u03B3': 'g', '\u03B4': 'd', '\u03B5': 'e',
  '\u03B6': 'z', '\u03B7': 'h', '\u03B8': 'th', '\u03B9': 'i', '\u03BA': 'k',
  '\u03BB': 'l', '\u03BC': 'u', '\u03BD': 'n', '\u03BE': 'x', '\u03BF': 'o',
  '\u03C0': 'pi', '\u03C1': 'r', '\u03C3': 's', '\u03C2': 's', '\u03C4': 't', '\u03C5': 'u',
  '\u03C6': 'ph', '\u03C7': 'ch', '\u03C8': 'ps', '\u03C9': 'o',
  '\u0391': 'A', '\u0392': 'B', '\u0393': 'G', '\u0394': 'D', '\u0395': 'E',
  '+': 'pl',
  '/': '_',
  '-': '_',
  '.': '_',
  '?': 'unkn',
  ',': '_',
  '(': '',
  ')': '',
  '[': '',
  ']': '',
  '>': '_',
  '<': '_',
  '&': 'and',
  '|': 'or',
  '=': 'eq',
  '%': 'pct',
  '@': 'at',
  '!': '',
  '~': '',
  '`': '',
  '"': '',
  '\\': '_',
};

// Full BNGL lexer keyword set (from packages/engine/src/parser/generated/BNGLexer.ts).
// Any emitted identifier that exactly matches one of these tokens (case-sensitive, as the
// lexer is) must be renamed, or the strict ANTLR reparse tokenizes it as a keyword and fails.
export const BNGL_LEXER_KEYWORDS = new Set<string>([
  '_e', '_pi', 'abs', 'acos', 'acosh', 'actions', 'addConcentration', 'argfile', 'Arrhenius',
  'asin', 'asinh', 'atan', 'atanh', 'atol', 'atomize', 'avg', 'background', 'bdf', 'begin',
  'bifurcate', 'binary_output', 'blocks', 'check_iso', 'collapse', 'compartments', 'complex',
  'continue', 'cos', 'cosh', 'Counter', 'DeleteMolecules', 'end', 'energy', 'equil',
  'evaluate_expressions', 'exclude_products', 'exclude_reactants', 'execute', 'exp', 'false',
  'file', 'format', 'FunctionProduct', 'functions', 'generate_hybrid_model',
  'generate_network', 'get_final_state', 'gml', 'groups', 'Hill', 'if', 'include_model',
  'include_network', 'include_products', 'include_reactants', 'ln', 'log_scale', 'log10',
  'log2', 'maps', 'MatchOnce', 'max', 'max_agg', 'max_conv_fails', 'max_err_test_fails',
  'max_iter', 'max_num_steps', 'max_sim_steps', 'max_step', 'max_stoich', 'maxOrder', 'method',
  'min', 'MM', 'model', 'molecular', 'molecule_types', 'molecules', 'MoveConnected', 'mratio',
  'n_output_steps', 'n_scan_pts', 'n_steps', 'netfile', 'nf', 'nocslf', 'notf', 'observables',
  'ode', 'opts', 'output_step_interval', 'overwrite', 'par_max', 'par_min', 'param',
  'parameter', 'parameter_scan', 'parameters', 'patterns', 'pla', 'pla_config', 'pla_output',
  'population', 'prefix', 'pretty_formatting', 'print_CDAT', 'print_end', 'print_functions',
  'print_iter', 'print_net', 'print_on_stop', 'priority', 'quit', 'reaction', 'reaction_rules',
  'readFile', 'reset_conc', 'resetConcentrations', 'resetParameters', 'rint', 'rtol', 'rules',
  'safe', 'sample_times', 'Sat', 'save_progress', 'saveConcentrations', 'saveParameters',
  'seed', 'setConcentration', 'setModelName', 'setOption', 'setParameter', 'setVolume',
  'simulate', 'simulate_nf', 'simulate_ode', 'simulate_pla', 'simulate_psa', 'simulate_rm',
  'simulate_ssa', 'sin', 'sinh', 'skip_actions', 'sparse', 'species', 'sqrt', 'ssa', 'stats',
  'steady_state', 'stiff', 'stop_if', 'substanceUnits', 'suffix', 'sum', 't_end', 't_start',
  'tan', 'tanh', 'TextReaction', 'TextSpecies', 'TFUN', 'time', 'TotalRate', 'true', 'type',
  'types', 'utl', 'verbose', 'version', 'visualize', 'writeFile', 'writeLatex', 'writeMDL',
  'writeMexfile', 'writeMfile', 'writeModel', 'writeNetwork', 'writeSBML', 'writeSSC',
  'writeSSCcfg', 'writeXML',
]);

// Kept as an alias for existing call sites.
const BNGL_RESERVED_IDENTIFIERS = BNGL_LEXER_KEYWORDS;

/**
 * Standardize a species name for BNGL compatibility
 */
export function standardizeName(name: string): string {
  let result = name;

  for (const [char, replacement] of Object.entries(SBML_TO_BNGL_TRANSLATION)) {
    result = result.split(char).join(replacement);
  }

  // Ensure match with Python logic: re.sub(r'[^a-zA-Z0-9_]', '_', name)
  result = result.replace(/[^a-zA-Z0-9_]/g, '_');

  // Ensure doesn't start with a number
  if (/^\d/.test(result)) {
    result = '_' + result;
  }

  // Handle empty result
  if (result === '') {
    result = 'unnamed';
  }

  // Avoid strict-parser keyword collisions for generated identifiers.
  if (BNGL_RESERVED_IDENTIFIERS.has(result)) {
    result = `${result}_id`;
  }

  return result;
}

/**
 * Check if a name is BNGL-compatible
 */
export function isValidBNGLName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

// =============================================================================
// Math Expression Utilities
// =============================================================================

/**
 * Factorial function
 */
export function factorial(x: number): number {
  if (x <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= x; i++) {
    result *= i;
  }
  return result;
}

/**
 * Combination function (n choose k)
 */
export function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  return factorial(n) / (factorial(k) * factorial(n - k));
}

/**
 * Convert math function names to BNGL equivalents
 */
export function convertMathFunction(mathStr: string): string {
  let result = mathStr;

  // Power function: pow(a, b) -> (a)^(b)
  result = result.replace(/pow\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '(($1)^($2))');

  // Square root: sqrt(x) -> (x)^(1/2)
  result = result.replace(/sqrt\s*\(\s*([^)]+)\s*\)/g, '(($1)^(1/2))');

  // Square: sqr(x) -> (x)^2
  result = result.replace(/sqr\s*\(\s*([^)]+)\s*\)/g, '(($1)^2)');

  // Root: root(n, x) -> (x)^(1/n)
  result = result.replace(/root\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '(($2)^(1/($1)))');

  // Exponential: exp(x) -> e^(x)
  result = result.replace(/exp\s*\(\s*([^)]+)\s*\)/g, '(2.71828182845905^($1))');

  // Natural log: log(x) -> ln(x) in BNGL
  result = result.replace(/\blog\s*\(/g, 'ln(');

  // Log base 10: log10(x) -> (ln(x)/ln(10))
  result = result.replace(/log10\s*\(\s*([^)]+)\s*\)/g, '(ln($1)/2.302585093)');

  // Comparison operators
  result = result.replace(/\bgt\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 > $2)');
  result = result.replace(/\blt\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 < $2)');
  result = result.replace(/\bgeq\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 >= $2)');
  result = result.replace(/\bleq\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 <= $2)');
  result = result.replace(/\beq\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 == $2)');
  result = result.replace(/\bneq\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 != $2)');

  // Logical operators
  result = result.replace(/\band\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 && $2)');
  result = result.replace(/\bor\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)/g, '($1 || $2)');
  result = result.replace(/\bnot\s*\(\s*([^)]+)\s*\)/g, '(!$1)');

  // Ceiling and floor
  result = result.replace(/\bceil\s*\(\s*([^)]+)\s*\)/g, 'min(rint(($1)+0.5),rint(($1)+1))');
  result = result.replace(/\bfloor\s*\(\s*([^)]+)\s*\)/g, 'min(rint(($1)-0.5),rint(($1)+0.5))');

  // Replace infinity
  while (/\binf\b/i.test(result)) {
    result = result.replace(/\binf\b/gi, '1e20');
  }

  // Replace pi
  result = result.replace(/\bpi\b/g, '3.14159265358979');

  // Reserved keyword: e (Euler's number)
  result = result.replace(/\be\b(?!\s*\^)/g, '2.71828182845905');

  // Normalize boolean literals used by some SBML function/rule exports.
  result = result.replace(/\btrue\b/gi, '1');
  result = result.replace(/\bfalse\b/gi, '0');

  return result;
}

/**
 * Clean parameter values for BNGL
 */
export function cleanParameterValue(value: string): string {
  let result = value;

  // Non-finite literals are not valid BNGL numbers; BNG2 otherwise reads the token (e.g.
  // "Infinity", "NaN") as an undefined parameter name and aborts. JS stringifies these as
  // "Infinity"/"-Infinity"/"NaN", so the old \binf\b pattern missed them. Map infinities to a
  // large finite value and NaN to 0.
  result = result.replace(/\b(?:infinity|inf)\b/gi, '1e20');
  result = result.replace(/\bnan\b/gi, '0');

  // Standardize scientific notation, but ONLY for standalone numeric literals. The digit-E-digit
  // pattern also occurs inside identifiers (e.g. Vmax_2E1_APAP, the CYP2E1 enzyme), and lowercasing
  // the E there desynchronizes the rate-law reference from the parameter definition, which keeps its
  // original case -> BNG2 aborts "Parameter 'Vmax_2e1_APAP' referenced but not defined" (BIOMD624).
  // The lookbehind/lookahead reject an adjacent identifier char so only genuine numbers are touched.
  result = result.replace(/(?<![A-Za-z_])(\d+)[eE]([+-]?\d+)(?![A-Za-z_])/g, '$1e$2');

  return result;
}

// =============================================================================
// Logging
// =============================================================================

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface LogMessage {
  level: LogLevel;
  code: string;
  message: string;
  context?: string;
  timestamp: Date;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
  CRITICAL: 4,
};

const resolveDefaultLogLevel = (): LogLevel => {
  const raw =
    (typeof process !== 'undefined' && process?.env?.ATOMIZER_LOG_LEVEL) ||
    ((globalThis as any)?.ATOMIZER_LOG_LEVEL as string | undefined) ||
    '';
  const normalized = String(raw).trim().toUpperCase();
  if (normalized === 'DEBUG' || normalized === 'INFO' || normalized === 'WARNING' || normalized === 'ERROR' || normalized === 'CRITICAL') {
    return normalized as LogLevel;
  }
  return 'WARNING';
};

const resolveQuietModeDefault = (): boolean => {
  const raw =
    (typeof process !== 'undefined' && process?.env?.ATOMIZER_QUIET) ||
    ((globalThis as any)?.ATOMIZER_QUIET as string | undefined);
  return String(raw ?? '').trim() === '1';
};

class Logger {
  private messages: LogMessage[] = [];
  private level: LogLevel = resolveDefaultLogLevel();
  private quietMode: boolean = resolveQuietModeDefault();

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setQuietMode(quiet: boolean): void {
    this.quietMode = quiet;
  }

  log(level: LogLevel, code: string, message: string, context?: string): void {
    if (LOG_LEVELS[level] >= LOG_LEVELS[this.level]) {
      const logMsg: LogMessage = {
        level,
        code,
        message,
        context,
        timestamp: new Date()
      };
      this.messages.push(logMsg);

      if (!this.quietMode) {
        const prefix = `[${level}] ${code}:`;
        const fullMessage = context ? `${message} (${context})` : message;

        if (level === 'ERROR' || level === 'CRITICAL') {
          console.error(prefix, fullMessage);
        } else if (level === 'WARNING') {
          console.warn(prefix, fullMessage);
        } else if (level === 'DEBUG') {
          console.debug(prefix, fullMessage);
        } else {
          console.info(prefix, fullMessage);
        }
      }
    }
  }

  debug(code: string, message: string, context?: string): void {
    this.log('DEBUG', code, message, context);
  }

  info(code: string, message: string, context?: string): void {
    this.log('INFO', code, message, context);
  }

  warning(code: string, message: string, context?: string): void {
    this.log('WARNING', code, message, context);
  }

  error(code: string, message: string, context?: string): void {
    this.log('ERROR', code, message, context);
  }

  critical(code: string, message: string, context?: string): void {
    this.log('CRITICAL', code, message, context);
  }

  getMessages(): LogMessage[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
  }

  getMessagesByLevel(level: LogLevel): LogMessage[] {
    return this.messages.filter(m => m.level === level);
  }

  hasErrors(): boolean {
    return this.messages.some(m => m.level === 'ERROR' || m.level === 'CRITICAL');
  }
}

// Global logger instance
export const logger = new Logger();

/**
 * Convenience function for logging
 */
export function logMess(codeAndLevel: string, message: string): void {
  const match = codeAndLevel.match(/^(DEBUG|INFO|WARNING|ERROR|CRITICAL):(.+)$/);
  if (match) {
    const level = match[1] as LogLevel;
    const code = match[2];
    logger.log(level, code, message);
  } else {
    // Assume format like "INFO:ABC001" or just log as info
    const parts = codeAndLevel.split(':');
    if (parts.length >= 2) {
      const level = parts[0] as LogLevel;
      const code = parts.slice(1).join(':');
      logger.log(level, code, message);
    } else {
      logger.info(codeAndLevel, message);
    }
  }
}

// =============================================================================
// File System Utilities (for Node.js environment)
// =============================================================================

/**
 * Check if running in Node.js environment
 */
export function isNode(): boolean {
  return typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null;
}

// =============================================================================
// Comparison Utilities
// =============================================================================

/**
 * Compare two lists for equality (order-independent)
 */
export function compareLists<T>(list1: T[], list2: T[]): boolean {
  if (list1.length !== list2.length) return false;
  const counter1 = new Counter(list1.map(String));
  const counter2 = new Counter(list2.map(String));

  if (counter1.size !== counter2.size) return false;

  for (const [key, count] of counter1) {
    if (counter2.get(key) !== count) return false;
  }

  return true;
}

/**
 * Get intersection of two sets
 */
export function setIntersection<T>(set1: Set<T>, set2: Set<T>): Set<T> {
  return new Set([...set1].filter(x => set2.has(x)));
}

/**
 * Get difference of two sets (set1 - set2)
 */
export function setDifference<T>(set1: Set<T>, set2: Set<T>): Set<T> {
  return new Set([...set1].filter(x => !set2.has(x)));
}

/**
 * Get union of two sets
 */
export function setUnion<T>(set1: Set<T>, set2: Set<T>): Set<T> {
  return new Set([...set1, ...set2]);
}

// =============================================================================
// Exceptions
// =============================================================================

/**
 * Translation exception for atomizer errors
 */
export class TranslationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationException';
  }
}

/**
 * Cycle error for dependency graph cycles
 */
export class CycleError extends Error {
  memory: any;

  constructor(memory: any) {
    super('Cycle detected in dependency graph');
    this.name = 'CycleError';
    this.memory = memory;
  }
}

/**
 * Binding exception for atomization
 */
export class BindingException extends Error {
  value: any;
  combinations: any;

  constructor(value: any, combinations: any) {
    super(String(value));
    this.name = 'BindingException';
    this.value = value;
    this.combinations = combinations;
  }
}