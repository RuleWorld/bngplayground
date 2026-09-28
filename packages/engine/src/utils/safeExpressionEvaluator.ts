import jsep from 'jsep';

// Configure jsep for BNGL parity
// Add '^' as power operator with high precedence (above * and /)
jsep.addBinaryOp('^', 12);

// Explicitly remove comma operator to prevent sequence expressions (e.g. "1, 2")
// jsep includes ',' as a binary operator by default.
jsep.removeBinaryOp(',');

// Maximum allowed expression length in characters
const MAX_EXPRESSION_SIZE = 10000;

/**
 * Compute the ratio of Kummer hypergeometric functions M(a+1,b+1,z)/M(a,b,z)
 * using a continued fraction method.
 * Based on BioNetGen's Network3 implementation (misc.cpp::Mratio).
 * Original Fortran code by William Hlavacek (2018), translated to C++ by Leonard A. Harris (2019).
 * 
 * Uses the modified Lentz method: Lentz WJ (1976) Applied Optics 15:668-671
 * Reference: Thompson IJ, Barnett AR (1986) J Comput Phys 64: 490-509
 */
function mratio(a: number, b: number, z: number): number {
  const eps = 1e-16;
  const tiny = 1e-32;

  let f = tiny;
  let C = f;
  let D = 0.0;
  let err = 1.0 + eps;

  let odd = 1;
  let even = 0;
  let iodd = 0;
  let ieven = 0;
  let j = 0;

  while (err > eps && j < 10000) { // Add iteration limit for safety
    j++;

    let p: number;
    if (j === 1) {
      p = 1.0;
    } else {
      const den = (b + (j - 2)) * (b + (j - 1));
      let num: number;
      if (odd === 1) {
        iodd++;
        num = z * (a + iodd);
      } else if (even === 1) {
        ieven++;
        num = z * (a - (b + ieven - 1));
      } else {
        throw new Error(`mratio: invalid state iodd=${iodd}, ieven=${ieven}`);
      }
      p = num / den;
    }

    const q = 1.0;

    D = q + p * D;
    if (Math.abs(D) < tiny) D = tiny;
    C = q + p / C;
    if (Math.abs(C) < tiny) C = tiny;
    D = 1.0 / D;

    const Delta = C * D;
    f = Delta * f;

    err = Math.abs(Delta - 1.0);

    // Swap odd/even for next iteration
    const tmp = odd;
    odd = even;
    even = tmp;
  }

  return f;
}

function relationValue(operator: string, values: number[]): number {
  if (values.length < 2) return 0;
  for (let i = 0; i < values.length - 1; i++) {
    const left = values[i];
    const right = values[i + 1];
    const satisfied = operator === '==' ? left === right
      : operator === '!=' ? left !== right
        : operator === '<' ? left < right
          : operator === '<=' ? left <= right
            : operator === '>' ? left > right
              : left >= right;
    if (!satisfied) return 0;
  }
  return 1;
}

// Allowlist of math functions supported in BNGL-like expressions
const ALLOWED_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  acos: Math.acos,
  arccos: Math.acos,
  asin: Math.asin,
  arcsin: Math.asin,
  atan: Math.atan,
  arctan: Math.atan,
  atan2: Math.atan2,
  ceil: Math.ceil,
  ceiling: Math.ceil,
  cos: Math.cos,
  exp: Math.exp,
  expm1: Math.expm1 ?? ((x: number) => Math.exp(x) - 1),
  floor: Math.floor,
  // BioNetGen if(cond, trueVal, falseVal) function - returns trueVal if cond > 0.5, else falseVal
  // Matches muParser behavior used in BNG2. Original: (cond !== 0 ? trueVal : falseVal)
  if: (cond: number, trueVal: number, falseVal: number) => (cond > 0.5 ? trueVal : falseVal),
  // SBML MathML n-ary arithmetic and relational operators emitted by the Atomizer event projection.
  add: (...values: number[]) => values.reduce((sum, value) => sum + value, 0),
  plus: (...values: number[]) => values.reduce((sum, value) => sum + value, 0),
  subtract: (first: number, ...rest: number[]) => rest.reduce((value, next) => value - next, first),
  minus: (first: number, ...rest: number[]) => rest.reduce((value, next) => value - next, first),
  multiply: (...values: number[]) => values.reduce((product, value) => product * value, 1),
  times: (...values: number[]) => values.reduce((product, value) => product * value, 1),
  divide: (first: number, ...rest: number[]) => rest.reduce((value, next) => value / next, first),
  quotient: (first: number, ...rest: number[]) => rest.reduce((value, next) => value / next, first),
  remainder: (first: number, second: number) => first % second,
  rem: (first: number, second: number) => first % second,
  modulo: (first: number, second: number) => first % second,
  power: (base: number, exponent: number) => Math.pow(base, exponent),
  root: (degreeOrRadicand: number, maybeRadicand?: number) => maybeRadicand === undefined
    ? Math.sqrt(degreeOrRadicand)
    : Math.pow(maybeRadicand, 1 / degreeOrRadicand),
  eq: (...values: number[]) => relationValue('==', values),
  neq: (...values: number[]) => relationValue('!=', values),
  lt: (...values: number[]) => relationValue('<', values),
  leq: (...values: number[]) => relationValue('<=', values),
  gt: (...values: number[]) => relationValue('>', values),
  geq: (...values: number[]) => relationValue('>=', values),
  lessthan: (...values: number[]) => relationValue('<', values),
  greaterthan: (...values: number[]) => relationValue('>', values),
  equal: (...values: number[]) => relationValue('==', values),
  notequal: (...values: number[]) => relationValue('!=', values),
  and: (...values: number[]) => values.every(value => value !== 0) ? 1 : 0,
  or: (...values: number[]) => values.some(value => value !== 0) ? 1 : 0,
  xor: (...values: number[]) => values.reduce((parity, value) => parity ^ (value !== 0 ? 1 : 0), 0),
  not: (value: number) => value === 0 ? 1 : 0,
  // SBML piecewise(value, condition, ..., otherwise) after MathML-to-formula lowering.
  piecewise: (...args: number[]) => {
    for (let i = 0; i + 1 < args.length; i += 2) {
      if (args[i + 1] !== 0) return args[i];
    }
    return args.length % 2 === 1 ? args[args.length - 1] : 0;
  },
  ln: Math.log,
  // MathML log(base, x) is emitted by some libSBML formula printers; the
  // one-argument BNGL form remains natural log.
  log: (value: number, baseOrUndefined?: number) => baseOrUndefined === undefined
    ? Math.log(value)
    : Math.log(baseOrUndefined) / Math.log(value),
  log10: Math.log10 ?? ((x: number) => Math.log(x) / Math.LN10),
  log2: Math.log2 ?? ((x: number) => Math.log(x) / Math.LN2),
  log1p: Math.log1p ?? ((x: number) => Math.log(1 + x)),
  sinh: Math.sinh ?? ((x: number) => (Math.exp(x) - Math.exp(-x)) / 2),
  cosh: Math.cosh ?? ((x: number) => (Math.exp(x) + Math.exp(-x)) / 2),
  tanh: Math.tanh ?? ((x: number) => {
    const epx = Math.exp(x);
    const enx = Math.exp(-x);
    return (epx - enx) / (epx + enx);
  }),
  max: Math.max,
  min: Math.min,
  mratio: mratio, // BioNetGen special function for Kummer hypergeometric ratio
  Sat: (k: number, K: number) => k / (K + k),
  sat: (k: number, K: number) => k / (K + k),
  FunctionProduct: (a: number, b: number) => a * b, // BNG2 compatibility
  functionproduct: (a: number, b: number) => a * b, // case-insensitive fallback
  sign: Math.sign ?? ((x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0)),
  trunc: Math.trunc ?? ((x: number) => (x < 0 ? Math.ceil(x) : Math.floor(x))),
  hypot: Math.hypot ?? ((...xs: number[]) => Math.sqrt(xs.reduce((s, v) => s + v * v, 0))),
  pow: Math.pow,
  round: Math.round,
  rint: Math.round,
  sin: Math.sin,
  sqrt: Math.sqrt,
  signum: Math.sign ?? ((x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0)),
  tan: Math.tan,
  asinh: Math.asinh,
  arcsinh: Math.asinh,
  acosh: Math.acosh,
  arccosh: Math.acosh,
  atanh: Math.atanh,
  arctanh: Math.atanh,
  sec: (x: number) => 1 / Math.cos(x),
  csc: (x: number) => 1 / Math.sin(x),
  cot: (x: number) => 1 / Math.tan(x),
  arcsec: (x: number) => Math.acos(1 / x),
  arccsc: (x: number) => Math.asin(1 / x),
  // SBML inverse-cotangent uses the principal atan(1/x) branch. atan2(1, x)
  // returns an angle in [0, pi], which gives the wrong sign for negative x.
  arccot: (x: number) => Math.atan(1 / x),
  arcsech: (x: number) => Math.acosh(1 / x),
  arccsch: (x: number) => Math.asinh(1 / x),
  arccoth: (x: number) => Math.atanh(1 / x)
};

// Allowed constants available by name
const ALLOWED_CONSTS: Record<string, number> = {
  pi: Math.PI,
  PI: Math.PI,
  _pi: Math.PI,
  e: Math.E,
  E: Math.E,
  _e: Math.E,
  Infinity: Infinity,
  infinity: Infinity,
  NaN: NaN,
  nan: NaN
};

// Limit nesting depth by parentheses count as a simple guard against pathological AST depth
const MAX_PAREN_DEPTH = 200;

const COMPARISON_OPERATORS = new Set(['==', '!=', '<', '<=', '>', '>=']);

function isComparisonNode(node: JsepNode | undefined): boolean {
  return node?.type === 'BinaryExpression'
    && typeof node.operator === 'string'
    && COMPARISON_OPERATORS.has(node.operator);
}

/** MathML n-ary relations lower to left-associated jsep comparisons. */
function comparisonChain(node: JsepNode): { operands: JsepNode[]; operators: string[] } | undefined {
  if (!isComparisonNode(node) || !node.left || !node.right) return undefined;
  if (isComparisonNode(node.left)) {
    const prefix = comparisonChain(node.left);
    if (prefix) return { operands: [...prefix.operands, node.right], operators: [...prefix.operators, node.operator!] };
  }
  return { operands: [node.left, node.right], operators: [node.operator!] };
}

function maxParenDepth(expr: string): number {
  let depth = 0;
  let max = 0;
  for (const ch of expr) {
    if (ch === '(') {
      depth++;
      if (depth > max) max = depth;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
    }
  }
  return max;
}

function validateExprBasics(expr: string): void {
  if (!expr || typeof expr !== 'string') {
    throw new Error('Expression must be a non-empty string');
  }
  if (expr.length > MAX_EXPRESSION_SIZE) {
    throw new Error(`Expression exceeds maximum size (${expr.length} > ${MAX_EXPRESSION_SIZE} characters)`);
  }
}

/**
 * Replace C-style logical operators with word operators to ensure consistent parsing.
 * This helps keep expression parsing behavior stable across environments.
 */

// Basic interface for jsep AST nodes to avoid 'any' abuse
interface JsepNode {
  type: string;
  name?: string;       // Identifier
  value?: number;      // Literal
  operator?: string;   // Binary/Unary/Logical
  left?: JsepNode;     // Binary/Logical
  right?: JsepNode;    // Binary/Logical
  argument?: JsepNode; // Unary
  callee?: JsepNode;   // Call
  arguments?: JsepNode[]; // Call
  test?: JsepNode;     // Conditional
  consequent?: JsepNode; // Conditional
  alternate?: JsepNode;  // Conditional
}

/**
 * Validates the AST to ensure only supported node types are present.
 */
function validateASTStructure(node: JsepNode): void {
  const supportedTypes = new Set([
    'Literal',
    'Identifier',
    'BinaryExpression',
    'UnaryExpression',
    'LogicalExpression',
    'CallExpression',
    'ConditionalExpression'
  ]);

  if (!supportedTypes.has(node.type)) {
    if (node.type === 'Compound' || node.type === 'SequenceExpression') {
      throw new Error(`Comma operator / multiple statements are not allowed.`);
    }
    throw new Error(`Unsupported expression syntax: ${node.type}`);
  }

  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    if (node.left) validateASTStructure(node.left);
    if (node.right) validateASTStructure(node.right);
  } else if (node.type === 'UnaryExpression') {
    if (node.argument) validateASTStructure(node.argument);
  } else if (node.type === 'CallExpression') {
    if (node.callee?.type !== 'Identifier') {
      throw new Error('Complex function calls (e.g., member calls) are not allowed');
    }
    const funcName = node.callee.name;
    if (!funcName || !(funcName in ALLOWED_FUNCTIONS)) {
      throw new Error(`Unknown function: ${funcName}`);
    }
    node.arguments?.forEach(validateASTStructure);
  } else if (node.type === 'ConditionalExpression') {
    if (node.test) validateASTStructure(node.test);
    if (node.consequent) validateASTStructure(node.consequent);
    if (node.alternate) validateASTStructure(node.alternate);
  }
}

/**
 * Custom evaluator that traverses the jsep AST and evaluates it safely.
 * No property access, no constructor calls, only allowlisted functions and constants.
 *
 * @param node - The AST node to evaluate (typed as JsepNode)
 * @param context - A map of variable names to values
 * @param stepRef - Mutable object to track execution steps (DoS protection)
 * @returns The numerical result of the evaluation
 */
function evaluateNode(node: JsepNode, context: Record<string, number>, stepRef: { count: number }): number {
  // 3. Timeout/Step-Limit (DoS Protection)
  const MAX_STEPS = 50000;
  if (++stepRef.count > MAX_STEPS) {
    throw new Error('Expression execution exceeded maximum step limit (DoS protection).');
  }

  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'number' ? node.value : NaN;

    case 'Identifier':
      if (node.name && node.name in context) {
        return context[node.name];
      }
      if (node.name && node.name in ALLOWED_CONSTS) {
        return ALLOWED_CONSTS[node.name];
      }
      throw new Error(`Unknown variable: ${node.name}`);

    case 'BinaryExpression': {
      if (!node.left || !node.right) throw new Error('Malformed binary expression');
      if (isComparisonNode(node) && isComparisonNode(node.left)) {
        const chain = comparisonChain(node);
        if (!chain) throw new Error('Malformed comparison chain');
        const values = chain.operands.map(operand => evaluateNode(operand, context, stepRef));
        for (let i = 0; i < chain.operators.length; i++) {
          const left = values[i];
          const right = values[i + 1];
          const operator = chain.operators[i];
          const satisfied = operator === '==' ? left === right
            : operator === '!=' ? left !== right
              : operator === '<' ? left < right
                : operator === '<=' ? left <= right
                  : operator === '>' ? left > right
                    : left >= right;
          if (!satisfied) return 0;
        }
        return 1;
      }
      const left = evaluateNode(node.left, context, stepRef);
      const right = evaluateNode(node.right, context, stepRef);
      switch (node.operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '%': return left % right;
        // 4. Document Pow/Carat: Both pow() and ^ are supported for parity
        case '^': return Math.pow(left, right);
        case '==': return left === right ? 1 : 0;
        case '!=': return left !== right ? 1 : 0;
        case '<': return left < right ? 1 : 0;
        case '<=': return left <= right ? 1 : 0;
        case '>': return left > right ? 1 : 0;
        case '>=': return left >= right ? 1 : 0;
        // Some versions of jsep parse &&/|| as BinaryExpression rather than LogicalExpression
        case '&&': return left !== 0 ? (right !== 0 ? 1 : 0) : 0;
        case '||': return left !== 0 ? 1 : (right !== 0 ? 1 : 0);
        default: throw new Error(`Unsupported binary operator: ${node.operator}`);
      }
    }

    case 'UnaryExpression': {
      if (!node.argument) throw new Error('Malformed unary expression');
      const arg = evaluateNode(node.argument, context, stepRef);
      switch (node.operator) {
        case '-': return -arg;
        case '+': return +arg;
        case '!': return arg === 0 ? 1 : 0;
        default: throw new Error(`Unsupported unary operator: ${node.operator}`);
      }
    }

    case 'LogicalExpression': {
      if (!node.left || !node.right) throw new Error('Malformed logical expression');
      const left = evaluateNode(node.left, context, stepRef);
      if (node.operator === '&&') {
        return left !== 0 ? (evaluateNode(node.right, context, stepRef) !== 0 ? 1 : 0) : 0;
      }
      if (node.operator === '||') {
        return left !== 0 ? 1 : (evaluateNode(node.right, context, stepRef) !== 0 ? 1 : 0);
      }
      throw new Error(`Unsupported logical operator: ${node.operator}`);
    }

    case 'CallExpression': {
      // Identifier validation is already done by validateASTStructure during compile/getVariables
      const funcName = node.callee?.name;
      if (!funcName) throw new Error('Invalid function call');
      const fn = ALLOWED_FUNCTIONS[funcName];
      if (!fn) throw new Error(`Unknown function: ${funcName}`); // specific check at runtime
      const args = (node.arguments ?? []).map((a) => evaluateNode(a, context, stepRef));
      return fn(...args);
    }

    case 'ConditionalExpression': {
      if (!node.test || !node.consequent || !node.alternate) throw new Error('Malformed conditional expression');
      const test = evaluateNode(node.test, context, stepRef);
      // Use 0.5 threshold for parity with BNG2/muParser
      return test > 0.5 ? evaluateNode(node.consequent, context, stepRef) : evaluateNode(node.alternate, context, stepRef);
    }

    default:
      throw new Error(`Unsupported node type: ${node.type}`);
  }
}

/**
 * Extracts all unique variable names referenced in the expression.
 */
function getVariables(node: JsepNode): string[] {
  // Validate once at top level (Issue #9 fix - avoid O(n²) re-validation)
  validateASTStructure(node);

  const vars = new Set<string>();
  function traverse(n: JsepNode) {
    if (!n) return;
    // Skip validation here - already done at top level
    if (n.type === 'Identifier') {
      if (n.name) {
        vars.add(n.name);
      }
    } else if (n.type === 'BinaryExpression' || n.type === 'LogicalExpression') {
      if (n.left) traverse(n.left);
      if (n.right) traverse(n.right);
    } else if (n.type === 'UnaryExpression') {
      if (n.argument) traverse(n.argument);
    } else if (n.type === 'CallExpression') {
      // Callee is already validated as Identifier by validateASTStructure
      // but we don't count function names as variables
      n.arguments?.forEach(traverse);
    } else if (n.type === 'ConditionalExpression') {
      if (n.test) traverse(n.test);
      if (n.consequent) traverse(n.consequent);
      if (n.alternate) traverse(n.alternate);
    }
  }
  traverse(node);
  return Array.from(vars);
}

/**
 * Compiles a mathematical or logical expression into a safe executable function.
 *
 * Validates the expression's syntax and checks it against security constraints
 * to prevent DoS attacks and code injection (e.g., limits parenthesis depth,
 * validates AST structure, and blocks property/constructor access). Variables
 * found in the expression must either be present in the `paramNames` list or
 * exist in the predefined `ALLOWED_CONSTS` map.
 *
 * **Engine invariant:** To prevent code injection vulnerabilities, expressions
 * must be evaluated through this module rather than using `new Function(...)` or `eval()`.
 *
 * @param expr - The mathematical or logical string expression to compile.
 * @param paramNames - Optional list of allowed variable names that the expression may reference.
 * @returns A callable function that takes a `context` record (mapping variable names to their values)
 *          and returns the numerical evaluation of the expression. Returns `NaN` on evaluation errors
 *          (such as division by zero or non-finite results).
 * @throws {Error} If parsing fails, suspicious patterns are detected, paren depth is exceeded,
 *                 or if the expression references variables not found in `paramNames` or `ALLOWED_CONSTS`.
 */
export function compile(
  expr: string,
  paramNames: string[] = []
): (context: Record<string, number>) => number {
  validateExprBasics(expr);
  if (maxParenDepth(expr) > MAX_PAREN_DEPTH) {
    throw new Error(`Expression nesting too deep (>${MAX_PAREN_DEPTH}).`);
  }

  // 1. Input Sanitization: Reject suspicious patterns (pre-check)
  // Rejects repeated operators like +++ or ... or /// which might cause parser issues
  // Allow valid double-operator tokens (&&, ||, ==), but reject sequences like &&& or |||.
  if (/([+\-*/%^!&|=<>])\1{2,}/.test(expr)) {
    throw new Error('Suspicious pattern detected: Repeated operators');
  }

  let ast: JsepNode;
  try {
    ast = jsep(expr) as unknown as JsepNode;
  } catch (e) {
    throw new Error(
      `Failed to parse expression: "${expr}"\nSyntax error: ${e instanceof Error ? e.message : String(e)}`,
      { cause: e }
    );
  }


  // Validate AST structure and extract variables simultaneously
  const vars = getVariables(ast);
  const allowed = new Set<string>(paramNames);
  const unknown = vars.filter(v => !allowed.has(v) && !(v in ALLOWED_CONSTS));
  if (unknown.length > 0) {
    throw new Error(`Expression references unknown variables: ${unknown.join(', ')}`);
  }

  return (context: Record<string, number>) => {
    try {
      const stepRef = { count: 0 };
      const val = evaluateNode(ast, context, stepRef);
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        console.warn(`[SafeExpressionEvaluator] Expression evaluated to non-finite: ${expr} => ${String(val)}`);
        return NaN; // Return NaN so callers can detect the problem (Issue #6 fix)
      }
      return val;
    } catch (e) {
      console.error(
        `[SafeExpressionEvaluator] Evaluation error for: ${expr}\nError: ${e instanceof Error ? e.message : String(e)}`
      );
      return NaN; // Return NaN so callers can detect the problem (Issue #6 fix)
    }
  };
}

/**
 * Evaluates a constant mathematical or logical string expression that contains no variable dependencies.
 *
 * Validates the expression's syntax, checks against DoS constraints (max length, paren depth),
 * and computes its numerical value using only allowlisted mathematical functions and constants (`ALLOWED_CONSTS`).
 * If non-constant variables are referenced or evaluation fails, returns either `NaN` (if `fallbackNaN` is true)
 * or `0`.
 *
 * **Engine invariant:** Operates purely in memory using sandboxed AST evaluation without relying on browser APIs
 * or unsafe `eval`/`Function` constructors.
 *
 * @param expr - The constant string expression to evaluate (e.g. `"100 * 2.5"` or `"sin(PI / 2)"`).
 * @param fallbackNaN - When true, returns `NaN` on evaluation errors or variable detection instead of `0`. Default is `false`.
 * @param silent - When true, suppresses warning logs on evaluation failure. Default is `false`.
 * @returns The resulting finite numerical value, or `0`/`NaN` on error.
 */
export function evaluateConstant(expr: string, fallbackNaN: boolean = false, silent: boolean = false): number {
  try {
    validateExprBasics(expr);
    if (maxParenDepth(expr) > MAX_PAREN_DEPTH) {
      throw new Error(`Expression nesting too deep (>${MAX_PAREN_DEPTH}).`);
    }
    const ast = jsep(expr) as unknown as JsepNode;
    const vars = getVariables(ast).filter(v => !(v in ALLOWED_CONSTS));
    if (vars.length > 0) {
      throw new Error(`Constant expression contains variables: ${vars.join(', ')}`);
    }
    const val = evaluateNode(ast, {}, { count: 0 });
    return typeof val === 'number' && Number.isFinite(val) ? val : (fallbackNaN ? NaN : 0);
  } catch (e) {
    if (!silent) {
      console.warn(
        `[SafeExpressionEvaluator] Failed to evaluate constant: ${expr}\nError: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    return fallbackNaN ? NaN : 0;
  }
}

/**
 * Checks whether a mathematical or logical string expression is syntactically valid and safe to evaluate.
 *
 * Validates the expression against basic string constraints, parenthesis nesting depth limits,
 * AST structure allowlists, and variable references. An expression is considered safe if all
 * referenced identifiers are either present in the `paramNames` list or in `ALLOWED_CONSTS`.
 *
 * **Engine invariant:** Operates purely in memory using AST parsing without DOM or browser dependencies,
 * ensuring safe execution across both browser and Node.js environments.
 *
 * @param expr - The mathematical or logical string expression to validate.
 * @param paramNames - Optional array of parameter or variable names allowed within the expression. Default is `[]`.
 * @returns `true` if the expression is syntactically valid and contains only allowed variables/constants; otherwise `false`.
 */
export function isSafe(expr: string, paramNames: string[] = []): boolean {
  try {
    validateExprBasics(expr);
    if (maxParenDepth(expr) > MAX_PAREN_DEPTH) return false;
    const ast = jsep(expr) as unknown as JsepNode;
    const vars = getVariables(ast);
    const allowed = new Set<string>(paramNames);
    return vars.every(v => allowed.has(v) || v in ALLOWED_CONSTS);
  } catch {
    return false;
  }
}

/**
 * Extracts all unique variable and identifier names referenced within a mathematical or logical expression.
 *
 * Parses the expression into an AST, validates its structure against security limits, and traverses all node
 * branches to collect variable names. Function names (e.g. `sin`, `abs`) and operators are excluded.
 *
 * **Engine invariant:** Operates purely in memory using AST parsing without DOM or browser dependencies.
 *
 * @param expr - The string expression from which to extract referenced variable names.
 * @returns An array of unique variable names referenced in the expression.
 * @throws {Error} If the expression is empty, non-string, exceeds size or nesting limits, or contains invalid syntax.
 */
export function getReferencedVariables(expr: string): string[] {
  validateExprBasics(expr);
  if (maxParenDepth(expr) > MAX_PAREN_DEPTH) throw new Error('Expression too deeply nested');
  const ast = jsep(expr) as unknown as JsepNode;
  return getVariables(ast);
}

// Backward-compatible export shape
export const SafeExpressionEvaluator = { compile, evaluateConstant, isSafe, getReferencedVariables };
