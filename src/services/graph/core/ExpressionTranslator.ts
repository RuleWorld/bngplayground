
/**
 * Utility for translating BNGL mathematical expressions into JavaScript-compatible strings.
 * Handles operators like '^' (power), constants like '_pi', and common math functions.
 */
export class ExpressionTranslator {
  /**
   * Translate a BNGL expression string to a JavaScript-compatible string.
   * Example: "k * (A/K)^2" -> "k * Math.pow((A/K), 2)" or "k * (A/K)**2"
   */
  static translate(expr: string): string {
    if (!expr) return expr;

    let jsExpr = expr;

    // 1. Convert BNGL power operator '^' to JavaScript '**'
    // Note: This needs careful handling for precedence if using Math.pow, 
    // but '**' in modern JS has similar precedence to BNG's ^.
    jsExpr = jsExpr.replace(/\^/g, '**');

    // 2. Replace BNGL math constants with their numeric equivalents
    jsExpr = jsExpr.replace(/\b_pi\b/g, String(Math.PI));
    jsExpr = jsExpr.replace(/\b_e\b/g, String(Math.E));

    // 3. Translate BNGL math functions to Math.xxx equivalents
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
      'rint': 'Math.round',
      'atan2': 'Math.atan2',
      'pow': 'Math.pow',
      'min': 'Math.min',
      'max': 'Math.max',
      'floor': 'Math.floor',
      'ceil': 'Math.ceil'
    };

    for (const [bnglName, jsName] of Object.entries(functionMappings)) {
      const regex = new RegExp(`\\b${bnglName}\\s*\\(`, 'g');
      jsExpr = jsExpr.replace(regex, `${jsName}(`);
    }

    return jsExpr;
  }
}
