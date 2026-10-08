
/**
 * Utility for translating BNGL mathematical expressions into JavaScript-compatible strings.
 * Handles operators like '^' (power), constants like '_pi', and common math functions.
 */
const functionMappings: Record<string, string> = {
  'exp': 'Math.exp',
  'ln': 'Math.log',
  'log10': 'Math.log10',
  'sqrt': 'Math.sqrt',
  'abs': 'Math.abs',
  'sin': 'Math.sin',
  'cos': 'Math.cos',
  'tan': 'Math.tan',
  'asin': 'Math.asin',
  'acos': 'Math.acos',
  'atan': 'Math.atan',
  'asinh': 'Math.asinh',
  'acosh': 'Math.acosh',
  'atanh': 'Math.atanh',
  'atan2': 'Math.atan2',
  'pow': 'Math.pow',
  'min': 'Math.min',
  'max': 'Math.max',
  'floor': 'Math.floor',
  'ceil': 'Math.ceil'
};

const FUNCTION_REGEXES = Object.entries(functionMappings).map(([bnglName, jsName]) => ({
  regex: new RegExp(`(?<!\\.)\\b${bnglName}\\s*\\(`, 'g'),
  jsName: `${jsName}(`
}));

function translateRoundCalls(expr: string): string {
  const match = /(?<!\.)\b(?:rint|round)\s*\(/g;
  let result = '';
  let cursor = 0;
  let found: RegExpExecArray | null;
  while ((found = match.exec(expr)) !== null) {
    const start = found.index;
    const open = start + found[0].lastIndexOf('(');
    let depth = 1;
    let close = open + 1;
    for (; close < expr.length && depth > 0; close++) {
      if (expr[close] === '(') depth++;
      else if (expr[close] === ')') depth--;
    }
    if (depth !== 0) break;
    const argument = translateRoundCalls(expr.slice(open + 1, close - 1));
    result += expr.slice(cursor, start) + `Math.floor((${argument}) + 0.5)`;
    cursor = close;
    match.lastIndex = close;
  }
  return cursor === 0 ? expr : result + expr.slice(cursor);
}

const POWER_REGEX = /\^/g;
const PI_REGEX = /\b_pi\b/g;
const E_REGEX = /\b_e\b/g;

export class ExpressionTranslator {
  /**
   * Translate a BNGL expression string to a JavaScript-compatible string.
   * Example: "k * (A/K)^2" -> "k * Math.pow((A/K), 2)" or "k * (A/K)**2"
   */
  static translate(expr: string): string {
    if (!expr) return expr;

    let jsExpr = expr;
    jsExpr = translateRoundCalls(jsExpr);

    // 1. Convert BNGL power operator '^' to JavaScript '**'
    // Note: This needs careful handling for precedence if using Math.pow, 
    // but '**' in modern JS has similar precedence to BNG's ^.
    jsExpr = jsExpr.replace(POWER_REGEX, '**');

    // 2. Replace BNGL math constants with their numeric equivalents
    jsExpr = jsExpr.replace(PI_REGEX, String(Math.PI));
    jsExpr = jsExpr.replace(E_REGEX, String(Math.E));

    // 3. Translate BNGL math functions to Math.xxx equivalents
    for (const { regex, jsName } of FUNCTION_REGEXES) {
      jsExpr = jsExpr.replace(regex, jsName);
    }

    return jsExpr;
  }
}
