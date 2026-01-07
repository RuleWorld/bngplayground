import jsep from 'jsep';

// Configure jsep for BNGL parity
// Add '^' as power operator with high precedence (above * and /)
jsep.addBinaryOp('^', 12);

// Explicitly remove comma operator to prevent sequence expressions (e.g. "1, 2")
// jsep includes ',' as a binary operator by default.
jsep.removeBinaryOp(',');

// Maximum allowed expression length in characters
const MAX_EXPRESSION_SIZE = 10000;

// Allowlist of math functions supported in BNGL-like expressions
const ALLOWED_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  atan2: Math.atan2,
  ceil: Math.ceil,
  cos: Math.cos,
  exp: Math.exp,
  expm1: Math.expm1 ?? ((x: number) => Math.exp(x) - 1),
  floor: Math.floor,
  ln: Math.log,
  log: Math.log,
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
  sign: Math.sign ?? ((x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0)),
  trunc: Math.trunc ?? ((x: number) => (x < 0 ? Math.ceil(x) : Math.floor(x))),
  hypot: Math.hypot ?? ((...xs: number[]) => Math.sqrt(xs.reduce((s, v) => s + v * v, 0))),
  pow: Math.pow,
  round: Math.round,
  sin: Math.sin,
  sqrt: Math.sqrt,
  signum: Math.sign ?? ((x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0)),
  tan: Math.tan
};

// Allowed constants available by name
const ALLOWED_CONSTS: Record<string, number> = {
  pi: Math.PI,
  PI: Math.PI,
  e: Math.E,
  E: Math.E,
  Infinity: Infinity,
  infinity: Infinity,
  NaN: NaN,
  nan: NaN
};

// Limit nesting depth by parentheses count as a simple guard against pathological AST depth
const MAX_PAREN_DEPTH = 200;

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
      if (node.name && node.name in ALLOWED_CONSTS) {
        return ALLOWED_CONSTS[node.name];
      }
      if (node.name && node.name in context) {
        return context[node.name];
      }
      throw new Error(`Unknown variable: ${node.name}`);

    case 'BinaryExpression': {
      if (!node.left || !node.right) throw new Error('Malformed binary expression');
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
      return test !== 0 ? evaluateNode(node.consequent, context, stepRef) : evaluateNode(node.alternate, context, stepRef);
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
      if (n.name && !(n.name in ALLOWED_CONSTS)) {
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
  if (/([+\-*/%^!&|=<>])\1{2,}/.test(expr)) {
    throw new Error('Suspicious pattern detected: Repeated operators');
  }

  let ast: JsepNode;
  try {
    ast = jsep(expr) as unknown as JsepNode;
  } catch (e) {
    throw new Error(
      `Failed to parse expression: "${expr}"\nSyntax error: ${e instanceof Error ? e.message : String(e)}`
    );
  }


  // Validate AST structure and extract variables simultaneously
  const vars = getVariables(ast);
  const allowed = new Set<string>(paramNames);
  const unknown = vars.filter(v => !allowed.has(v));
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

export function evaluateConstant(expr: string): number {
  try {
    validateExprBasics(expr);
    if (maxParenDepth(expr) > MAX_PAREN_DEPTH) {
      throw new Error(`Expression nesting too deep (>${MAX_PAREN_DEPTH}).`);
    }
    const ast = jsep(expr) as unknown as JsepNode;
    const vars = getVariables(ast);
    if (vars.length > 0) {
      throw new Error(`Constant expression contains variables: ${vars.join(', ')}`);
    }
    const val = evaluateNode(ast, {}, { count: 0 });
    return typeof val === 'number' && Number.isFinite(val) ? val : 0;
  } catch (e) {
    console.warn(
      `[SafeExpressionEvaluator] Failed to evaluate constant: ${expr}\nError: ${e instanceof Error ? e.message : String(e)}`
    );
    return 0;
  }
}

export function isSafe(expr: string, paramNames: string[] = []): boolean {
  try {
    validateExprBasics(expr);
    if (maxParenDepth(expr) > MAX_PAREN_DEPTH) return false;
    const ast = jsep(expr) as unknown as JsepNode;
    const vars = getVariables(ast);
    const allowed = new Set<string>(paramNames);
    return vars.every(v => allowed.has(v));
  } catch {
    return false;
  }
}

export function getReferencedVariables(expr: string): string[] {
  validateExprBasics(expr);
  if (maxParenDepth(expr) > MAX_PAREN_DEPTH) throw new Error('Expression too deeply nested');
  const ast = jsep(expr) as unknown as JsepNode;
  return getVariables(ast);
}

// Backward-compatible export shape
export const SafeExpressionEvaluator = { compile, evaluateConstant, isSafe, getReferencedVariables };
