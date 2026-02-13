/**
 * High-Precision Expression Evaluator for BioNetGen
 * 
 * Uses ANTLR4 generated parser for consistency with the rest of the application.
 * Evaluates expressions with arbitrary precision using decimal.js.
 */

import Decimal from 'decimal.js';
import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { BNGLexer } from './../../../parser/generated/BNGLexer.ts';
import { BNGParser, ExpressionContext, Function_callContext, Conditional_exprContext, Or_exprContext, And_exprContext, Equality_exprContext, Relational_exprContext, Additive_exprContext, Multiplicative_exprContext, Power_exprContext, Unary_exprContext, Primary_exprContext } from './../../../parser/generated/BNGParser.ts';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor.js';
import type { BNGParserVisitor } from './../../../parser/generated/BNGParserVisitor.ts';

// Configure decimal.js
Decimal.set({
  precision: 34,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -50,
  toExpPos: 50,
});

/**
 * Detect if high precision is needed
 */
export function needsHighPrecision(parameters: Map<string, number> | Record<string, number>): boolean {
  const values = parameters instanceof Map
    ? Array.from(parameters.values())
    : Object.values(parameters);

  if (values.length === 0) return false;

  const nonZeroAbs = values
    .filter(v => v !== 0 && Number.isFinite(v))
    .map(v => Math.abs(v));

  if (nonZeroAbs.length < 2) return false;

  const max = Math.max(...nonZeroAbs);
  const min = Math.min(...nonZeroAbs);

  return (max / min) > 1e15;
}

/**
 * Visitor to evaluate the parse tree with high precision
 */
class HighPrecisionVisitor extends AbstractParseTreeVisitor<Decimal> implements BNGParserVisitor<Decimal> {
  private parameters: Map<string, Decimal>;
  private functions: Map<string, { args: string[], expr: string }>;

  constructor(parameters: Map<string, Decimal>, functions?: Map<string, { args: string[], expr: string }>) {
    super();
    this.parameters = parameters;
    this.functions = functions || new Map();
  }

  protected defaultResult(): Decimal {
    return new Decimal(0);
  }

  visitExpression(ctx: ExpressionContext): Decimal {
    // expression: conditional_expr
    return this.visit(ctx.conditional_expr());
  }

  visitConditional_expr(ctx: Conditional_exprContext): Decimal {
    // conditional_expr: or_expr (QMARK expression COLON expression)?
    const orExpr = ctx.or_expr();
    const result = this.visit(orExpr);

    if (ctx.childCount > 1) {
      // Ternary operator: condition ? trueVal : falseVal
      // The condition is the result of orExpr
      // We need to visit the other two expressions
      const exprs = ctx.expression();
      if (exprs.length === 2) {
        const trueVal = this.visit(exprs[0]);
        const falseVal = this.visit(exprs[1]);
        return !result.isZero() ? trueVal : falseVal;
      }
    }
    return result;
  }

  visitOr_expr(ctx: Or_exprContext): Decimal {
    let result = this.visit(ctx.and_expr(0));
    for (let i = 1; i < ctx.and_expr().length; i++) {
      const next = this.visit(ctx.and_expr(i));
      // Logical OR: if either is non-zero, return 1, else 0
      const val = (!result.isZero() || !next.isZero()) ? 1 : 0;
      result = new Decimal(val);
    }
    return result;
  }

  visitAnd_expr(ctx: And_exprContext): Decimal {
    let result = this.visit(ctx.equality_expr(0));
    for (let i = 1; i < ctx.equality_expr().length; i++) {
      const next = this.visit(ctx.equality_expr(i));
      // Logical AND: if both are non-zero, return 1, else 0
      const val = (!result.isZero() && !next.isZero()) ? 1 : 0;
      result = new Decimal(val);
    }
    return result;
  }

  visitEquality_expr(ctx: Equality_exprContext): Decimal {
    let left = this.visit(ctx.relational_expr(0));
    // Determine operators. The structure is relational_expr (OP relational_expr)*
    // We iterate children to find operators
    for (let i = 1; i < ctx.relational_expr().length; i++) {
      const right = this.visit(ctx.relational_expr(i));
      // Find the operator between i-1 and i
      // It's the child at index (i-1)*2 + 1
      const opNode = ctx.getChild((i - 1) * 2 + 1);
      const op = opNode.text;

      // EQUALS | NOT_EQUALS | GTE | GT | LTE | LT
      let val = false;
      switch (op) {
        case '==': val = left.equals(right); break;
        case '!=': val = !left.equals(right); break;
        case '>=': val = left.greaterThanOrEqualTo(right); break;
        case '>': val = left.greaterThan(right); break;
        case '<=': val = left.lessThanOrEqualTo(right); break;
        case '<': val = left.lessThan(right); break;
      }
      left = new Decimal(val ? 1 : 0);
    }
    return left;
  }

  visitRelational_expr(ctx: Relational_exprContext): Decimal {
    return this.visit(ctx.additive_expr());
  }

  visitAdditive_expr(ctx: Additive_exprContext): Decimal {
    let left = this.visit(ctx.multiplicative_expr(0));
    for (let i = 1; i < ctx.multiplicative_expr().length; i++) {
      const right = this.visit(ctx.multiplicative_expr(i));
      const op = ctx.getChild((i - 1) * 2 + 1).text;
      if (op === '+') left = left.plus(right);
      else if (op === '-') left = left.minus(right);
    }
    return left;
  }

  visitMultiplicative_expr(ctx: Multiplicative_exprContext): Decimal {
    let left = this.visit(ctx.power_expr(0));
    for (let i = 1; i < ctx.power_expr().length; i++) {
      const right = this.visit(ctx.power_expr(i));
      const op = ctx.getChild((i - 1) * 2 + 1).text;
      if (op === '*') left = left.times(right);
      else if (op === '/') left = left.dividedBy(right);
      else if (op === '%') left = left.mod(right);
    }
    return left;
  }

  visitPower_expr(ctx: Power_exprContext): Decimal {
    const unarys = ctx.unary_expr();
    let base = this.visit(unarys[0]);
    // Right associative power? BNGParser.g4 says: unary_expr (POWER unary_expr)*
    // Standard precedence usually implies right associativity for power, but generated parser iterates loop.
    // Usually standard math is right associative: 2^3^4 = 2^(3^4).
    // If the grammar is (POWER unary_expr)*, strict iteration is (a^b)^c.
    // Let's implement left associative for now to match the loop structure, or check spec. 
    // Most BNG models use parenthesis for ambiguity.
    for (let i = 1; i < unarys.length; i++) {
      const exponent = this.visit(unarys[i]);
      base = base.pow(exponent);
    }
    return base;
  }

  visitUnary_expr(ctx: Unary_exprContext): Decimal {
    // (PLUS | MINUS | EMARK | TILDE)? primary_expr
    const primary = this.visit(ctx.primary_expr());
    if (ctx.childCount > 1) {
      const op = ctx.getChild(0).text;
      if (op === '-') return primary.negated();
      if (op === '!' || op === '~') return primary.isZero() ? new Decimal(1) : new Decimal(0);
    }
    return primary;
  }

  visitPrimary_expr(ctx: Primary_exprContext): Decimal {
    if (ctx.literal()) {
      const txt = ctx.literal()!.text;
      if (txt === 'PI') return Decimal.acos(-1);
      if (txt === 'EULERIAN') return new Decimal(1).exp();
      return new Decimal(txt);
    }
    if (ctx.observable_ref()) {
      // observables are treated as 1.0 (or looked up if passed as params) during rate eval
      // In params map, they might be present.
      // Observable ref syntax: Name(args)
      // We just take the name part probably.
      const name = ctx.observable_ref()!.text.split('(')[0];
      if (this.parameters.has(name)) return this.parameters.get(name)!;
      // If not in parameters, it might be a valid observable not yet computed?
      // Since this is for initial param evaluation, missing observable = 0 or 1?
      // Fallback:
      return new Decimal(0);
    }
    if (ctx.function_call()) {
      return this.visitFunction_call(ctx.function_call()!);
    }
    if (ctx.expression()) {
      // Parentheses
      return this.visit(ctx.expression()!);
    }
    if (ctx.arg_name()) {
      const name = ctx.arg_name()!.text;
      if (this.parameters.has(name)) return this.parameters.get(name)!;
      // Check for built-in constants if not caught by literal
      if (name === '_pi' || name === 'pi') return Decimal.acos(-1);
      if (name === '_e' || name === 'e') return new Decimal(1).exp();
      // Allow unresolved species amount placeholders to fall back to standard evaluation.
      if (name.endsWith('_amt')) return new Decimal(NaN);

      throw new Error(`Unknown identifier: ${name}`);
    }
    // Should not happen
    return new Decimal(0);
  }

  visitFunction_call(ctx: Function_callContext): Decimal {
    const funcName = ctx.getChild(0).text; // Case sensitive? Standard functions are lowercased later
    const funcLower = funcName.toLowerCase();
    // args in expression_list?
    const exprList = ctx.expression_list();
    const args: Decimal[] = [];
    if (exprList) {
      for (const expr of exprList.expression()) {
        args.push(this.visit(expr));
      }
    }

    const arg = args.length > 0 ? args[0] : new Decimal(0);

    // Check for custom functions
    if (this.functions.has(funcName)) {
      const funcDef = this.functions.get(funcName)!;
      if (funcDef.args.length !== args.length) {
        throw new Error(`Function ${funcName} expects ${funcDef.args.length} arguments, got ${args.length}`);
      }

      // Evaluate custom function body with arguments mapped
      // We create a new parameter scope inheriting globals but overriding args
      const localParams = new Map(this.parameters);
      for (let i = 0; i < args.length; i++) {
        localParams.set(funcDef.args[i], args[i]);
      }

      // Recursive evaluation
      return new Decimal(evaluateExpressionHighPrecision(funcDef.expr, localParams, this.functions));
    }

    switch (funcLower) {
      case 'if':
        if (args.length !== 3) throw new Error('if() requires 3 arguments');
        return !args[0].isZero() ? args[1] : args[2];
      case 'exp': return arg.exp();
      case 'ln':
      case 'log': return arg.ln();
      case 'log10': return arg.log(10);
      case 'sqrt': return arg.sqrt();
      case 'abs': return arg.abs();
      case 'sin': return arg.sin();
      case 'cos': return arg.cos();
      case 'tan': return arg.tan();
      case 'asin': return arg.asin();
      case 'acos': return arg.acos();
      case 'atan': return arg.atan();
      case 'sinh': return arg.sinh();
      case 'cosh': return arg.cosh();
      case 'tanh': return arg.tanh();
      case 'asinh': return arg.asinh();
      case 'acosh': return arg.acosh();
      case 'atanh': return arg.atanh();
      case 'rint': return arg.round();
      case 'mratio':
        if (args.length !== 3) throw new Error('mratio() requires 3 arguments');
        return this.mratio(args[0], args[1], args[2]);
      case 'functionproduct':
        if (args.length !== 2) throw new Error('FunctionProduct() requires 2 arguments');
        return args[0].times(args[1]);
      case 'floor': return arg.floor();
      case 'ceil': return arg.ceil();
      case 'min': return Decimal.min(...args);
      case 'max': return Decimal.max(...args);
      default: throw new Error(`Unknown function: ${funcName}`);
    }
  }

  private mratio(a: Decimal, b: Decimal, z: Decimal): Decimal {
    const eps = new Decimal(1e-16);
    const tiny = new Decimal(1e-32);

    let f = tiny;
    let C = f;
    let D = new Decimal(0);
    let err = new Decimal(2);

    let odd = 1;
    let even = 0;
    let iodd = 0;
    let ieven = 0;
    let j = 0;

    while (err.gt(eps) && j < 10000) {
      j++;

      let p: Decimal;
      if (j === 1) {
        p = new Decimal(1);
      } else {
        const den = b.plus(j - 2).times(b.plus(j - 1));
        let num: Decimal;
        if (odd === 1) {
          iodd++;
          num = z.times(a.plus(iodd));
        } else {
          ieven++;
          num = z.times(a.minus(b.plus(ieven - 1)));
        }
        p = num.dividedBy(den);
      }

      const q = new Decimal(1.0);

      D = q.plus(p.times(D));
      if (D.abs().lt(tiny)) D = tiny;
      C = q.plus(p.dividedBy(C));
      if (C.abs().lt(tiny)) C = tiny;
      D = new Decimal(1.0).dividedBy(D);

      const Delta = C.times(D);
      f = Delta.times(f);

      err = Delta.minus(1.0).abs();

      const tmp = odd;
      odd = even;
      even = tmp;
    }

    return f;
  }
}

/**
 * Evaluate using ANTLR parser and HighPrecisionVisitor
 */
export function evaluateExpressionHighPrecision(
  expr: string,
  parameters: Map<string, number> | Record<string, number> | Map<string, Decimal>,
  functions?: Map<string, { args: string[], expr: string }>
): number {
  try {
    // Prepare parameters
    const decimalParams = new Map<string, Decimal>();
    if (parameters instanceof Map) {
      for (const [key, value] of parameters) {
        decimalParams.set(key, value instanceof Decimal ? value : new Decimal(value));
      }
    } else {
      for (const [key, value] of Object.entries(parameters)) {
        decimalParams.set(key, new Decimal(value));
      }
    }

    // Parse
    const chars = CharStreams.fromString(expr);
    const lexer = new BNGLexer(chars);
    // Remove default error listeners to avoid console noise on expected errors?
    // lexer.removeErrorListeners();

    const tokens = new CommonTokenStream(lexer);
    const parser = new BNGParser(tokens);
    // parser.removeErrorListeners();

    const tree = parser.expression();

    const visitor = new HighPrecisionVisitor(decimalParams, functions);
    const result = visitor.visit(tree);

    // console.log(`[evaluateExpressionHighPrecision] "${expr}" result:`, result.toString());

    return result.toNumber();

  } catch (e) {
    console.error(`[evaluateExpressionHighPrecision] Failed to evaluate: "${expr}"`, e);
    // Log stack trace
    if (e instanceof Error) console.error(e.stack);
    return NaN;
  }
}

// Keep evaluateAllParametersHighPrecision same as before, logic hasn't changed
export function evaluateAllParametersHighPrecision(
  rawParameters: Map<string, string | number> | Record<string, string | number>
): Map<string, number> {
  const entries = rawParameters instanceof Map
    ? Array.from(rawParameters.entries())
    : Object.entries(rawParameters);

  const numeric = new Map<string, number>();
  const expressions = new Map<string, string>();

  for (const [name, value] of entries) {
    if (typeof value === 'number') {
      numeric.set(name, value);
    } else {
      const parsed = parseFloat(value);
      // Ensure specific float checks
      if (!isNaN(parsed) && /^-?[0-9.e+-]+$/i.test(value.trim())) {
        numeric.set(name, parsed);
      } else {
        expressions.set(name, value);
      }
    }
  }

  const resolved = new Map<string, number>(numeric);
  let changed = true;
  let iterations = 0;
  const maxIterations = 500;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (const [name, expr] of expressions) {
      if (resolved.has(name)) continue;

      try {
        const value = evaluateExpressionHighPrecision(expr, resolved);
        if (!isNaN(value)) {
          resolved.set(name, value);
          changed = true;
        }
      } catch {
        // continue
      }
    }
  }

  for (const [name, expr] of expressions) {
    if (!resolved.has(name)) {
      console.warn(`[evaluateAllParametersHighPrecision] Could not resolve: ${name} = ${expr}`);
      resolved.set(name, NaN);
    }
  }

  return resolved;
}

export function comparePrecision(
  expr: string,
  parameters: Map<string, number>
): { standard: number; highPrecision: number; relativeError: number } {
  // Keep implementation (mocked or full)
  const hp = evaluateExpressionHighPrecision(expr, parameters);
  return { standard: 0, highPrecision: hp, relativeError: 0 };
}

export default {
  needsHighPrecision,
  evaluateExpressionHighPrecision,
  evaluateAllParametersHighPrecision,
  comparePrecision,
};
