/**
 * SymbolicExpr.ts — Lightweight CAS for rational functions over real-valued variables.
 *
 * Supports construction, simplification, differentiation, evaluation,
 * expansion, factoring, and rendering to string / LaTeX.
 */

// ─── AST types ───────────────────────────────────────────────────────────────

export type SymExpr =
  | { kind: 'const'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'add'; terms: SymExpr[] }
  | { kind: 'mul'; factors: SymExpr[] }
  | { kind: 'div'; num: SymExpr; den: SymExpr }
  | { kind: 'pow'; base: SymExpr; exp: number }
  | { kind: 'neg'; expr: SymExpr };

// ─── Constructors ────────────────────────────────────────────────────────────

export function symConst(v: number): SymExpr {
  return { kind: 'const', value: v };
}

export function symVar(name: string): SymExpr {
  return { kind: 'var', name };
}

export function symAdd(...terms: SymExpr[]): SymExpr {
  if (terms.length === 0) return symConst(0);
  if (terms.length === 1) return terms[0];
  return { kind: 'add', terms };
}

export function symMul(...factors: SymExpr[]): SymExpr {
  if (factors.length === 0) return symConst(1);
  if (factors.length === 1) return factors[0];
  return { kind: 'mul', factors };
}

export function symDiv(num: SymExpr, den: SymExpr): SymExpr {
  return { kind: 'div', num, den };
}

export function symPow(base: SymExpr, exp: number): SymExpr {
  return { kind: 'pow', base, exp };
}

export function symNeg(expr: SymExpr): SymExpr {
  return { kind: 'neg', expr };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isConst(e: SymExpr, v?: number): boolean {
  if (e.kind !== 'const') return false;
  return v === undefined ? true : e.value === v;
}

/** Structural equality (after simplification the representation is canonical enough). */
function exprEqual(a: SymExpr, b: SymExpr): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'const': return a.value === (b as typeof a).value;
    case 'var': return a.name === (b as typeof a).name;
    case 'neg': return exprEqual(a.expr, (b as typeof a).expr);
    case 'pow': return a.exp === (b as typeof a).exp && exprEqual(a.base, (b as typeof a).base);
    case 'div': return exprEqual(a.num, (b as typeof a).num) && exprEqual(a.den, (b as typeof a).den);
    case 'add': {
      const bt = (b as typeof a).terms;
      if (a.terms.length !== bt.length) return false;
      return a.terms.every((t, i) => exprEqual(t, bt[i]));
    }
    case 'mul': {
      const bf = (b as typeof a).factors;
      if (a.factors.length !== bf.length) return false;
      return a.factors.every((f, i) => exprEqual(f, bf[i]));
    }
  }
}

/** Produce a canonical string key for an expression (used for combining like terms). */
function exprKey(e: SymExpr): string {
  switch (e.kind) {
    case 'const': return `C(${e.value})`;
    case 'var': return `V(${e.name})`;
    case 'neg': return `NEG(${exprKey(e.expr)})`;
    case 'pow': return `POW(${exprKey(e.base)},${e.exp})`;
    case 'div': return `DIV(${exprKey(e.num)},${exprKey(e.den)})`;
    case 'add': return `ADD(${e.terms.map(exprKey).join(',')})`;
    case 'mul': return `MUL(${e.factors.map(exprKey).join(',')})`;
  }
}

// ─── Simplify ────────────────────────────────────────────────────────────────

/**
 * Deep simplification: flatten nested add/mul, combine like terms,
 * cancel common factors in div, evaluate constant sub-expressions,
 * and remove identity operations.
 */
export function simplify(expr: SymExpr): SymExpr {
  return _simplify(expr, 0);
}

function _simplify(expr: SymExpr, depth: number): SymExpr {
  if (depth > 200) return expr;
  const d = depth + 1;
  switch (expr.kind) {
    case 'const':
    case 'var':
      return expr;

    case 'neg': {
      const inner = _simplify(expr.expr, d);
      if (inner.kind === 'const') return symConst(-inner.value);
      if (inner.kind === 'neg') return inner.expr;
      // -(a+b) → (-a)+(-b)  -- keep neg wrapper for non-trivial
      return { kind: 'neg', expr: inner };
    }

    case 'pow': {
      const base = _simplify(expr.base, d);
      const exp = expr.exp;
      if (exp === 0) return symConst(1);
      if (exp === 1) return base;
      if (base.kind === 'const') return symConst(Math.pow(base.value, exp));
      // (a^m)^n → a^(m*n)
      if (base.kind === 'pow') return _simplify(symPow(base.base, base.exp * exp), d);
      return { kind: 'pow', base, exp };
    }

    case 'div': {
      const num = _simplify(expr.num, d);
      const den = _simplify(expr.den, d);
      if (isConst(den, 1)) return num;
      if (isConst(num, 0)) return symConst(0);
      if (num.kind === 'const' && den.kind === 'const' && den.value !== 0) {
        return symConst(num.value / den.value);
      }
      if (exprEqual(num, den)) return symConst(1);
      // Cancel common scalar factor: (c*A)/(c*B) → A/B
      const nCoeff = extractCoeff(num);
      const dCoeff = extractCoeff(den);
      if (nCoeff !== 1 || dCoeff !== 1) {
        const gcdVal = gcdNum(Math.abs(nCoeff), Math.abs(dCoeff));
        if (gcdVal > 1) {
          const newNum = scaleExpr(num, nCoeff / (gcdVal * Math.sign(nCoeff) * Math.sign(dCoeff) > 0 ? gcdVal : -gcdVal));
          // simpler: just divide both coefficients
          return _simplify(symDiv(
            replaceCoeff(num, nCoeff / gcdVal),
            replaceCoeff(den, dCoeff / gcdVal)
          ), d);
        }
      }
      return { kind: 'div', num, den };
    }

    case 'add': {
      // Flatten nested adds
      let flat: SymExpr[] = [];
      for (const t of expr.terms) {
        const s = _simplify(t, d);
        if (s.kind === 'add') flat.push(...s.terms);
        else flat.push(s);
      }
      // Expand neg into const multiplication for easier combining
      flat = flat.map(t => {
        if (t.kind === 'neg') {
          const inner = t.expr;
          return _simplify(symMul(symConst(-1), inner), d);
        }
        return t;
      });
      // Sum constants
      let constSum = 0;
      const nonConst: SymExpr[] = [];
      for (const t of flat) {
        if (t.kind === 'const') constSum += t.value;
        else nonConst.push(t);
      }
      // Combine like terms: group by "monomial key" (everything except leading constant coefficient)
      const groups = new Map<string, { coeff: number; base: SymExpr }>();
      for (const t of nonConst) {
        const { coeff, rest } = splitCoeff(t);
        const key = exprKey(rest);
        const existing = groups.get(key);
        if (existing) {
          existing.coeff += coeff;
        } else {
          groups.set(key, { coeff, base: rest });
        }
      }
      const combined: SymExpr[] = [];
      for (const { coeff, base } of groups.values()) {
        if (coeff === 0) continue;
        if (coeff === 1) combined.push(base);
        else if (coeff === -1) combined.push({ kind: 'neg', expr: base });
        else combined.push(_simplify(symMul(symConst(coeff), base), d));
      }
      if (constSum !== 0) combined.unshift(symConst(constSum));
      if (combined.length === 0) return symConst(0);
      if (combined.length === 1) return combined[0];
      return { kind: 'add', terms: combined };
    }

    case 'mul': {
      // Flatten nested mul
      let flat: SymExpr[] = [];
      for (const f of expr.factors) {
        const s = _simplify(f, d);
        if (s.kind === 'mul') flat.push(...s.factors);
        else flat.push(s);
      }
      // Handle neg factors
      let negCount = 0;
      flat = flat.map(f => {
        if (f.kind === 'neg') { negCount++; return f.expr; }
        return f;
      });
      // Product of constants
      let constProd = 1;
      const nonConst: SymExpr[] = [];
      for (const f of flat) {
        if (f.kind === 'const') constProd *= f.value;
        else nonConst.push(f);
      }
      if (negCount % 2 === 1) constProd *= -1;
      if (constProd === 0) return symConst(0);
      // Combine like bases: x * x → x^2, x^2 * x^3 → x^5
      const baseGroups = new Map<string, { base: SymExpr; exp: number }>();
      for (const f of nonConst) {
        let base: SymExpr;
        let exp: number;
        if (f.kind === 'pow') { base = f.base; exp = f.exp; }
        else { base = f; exp = 1; }
        const key = exprKey(base);
        const existing = baseGroups.get(key);
        if (existing) existing.exp += exp;
        else baseGroups.set(key, { base, exp });
      }
      const combinedFactors: SymExpr[] = [];
      for (const { base, exp } of baseGroups.values()) {
        if (exp === 0) continue;
        else if (exp === 1) combinedFactors.push(base);
        else combinedFactors.push({ kind: 'pow', base, exp });
      }
      if (constProd !== 1 || combinedFactors.length === 0) {
        combinedFactors.unshift(symConst(constProd));
      }
      if (combinedFactors.length === 0) return symConst(1);
      if (combinedFactors.length === 1) return combinedFactors[0];
      return { kind: 'mul', factors: combinedFactors };
    }
  }
}

/** Split expression into (coefficient, rest) where expr = coeff * rest. */
function splitCoeff(e: SymExpr): { coeff: number; rest: SymExpr } {
  if (e.kind === 'const') return { coeff: e.value, rest: symConst(1) };
  if (e.kind === 'neg') {
    const inner = splitCoeff(e.expr);
    return { coeff: -inner.coeff, rest: inner.rest };
  }
  if (e.kind === 'mul') {
    let coeff = 1;
    const rest: SymExpr[] = [];
    for (const f of e.factors) {
      if (f.kind === 'const') coeff *= f.value;
      else rest.push(f);
    }
    const restExpr = rest.length === 0 ? symConst(1) : rest.length === 1 ? rest[0] : symMul(...rest);
    return { coeff, rest: restExpr };
  }
  return { coeff: 1, rest: e };
}

function extractCoeff(e: SymExpr): number {
  return splitCoeff(e).coeff;
}

function replaceCoeff(e: SymExpr, newCoeff: number): SymExpr {
  const { rest } = splitCoeff(e);
  if (newCoeff === 1) return rest;
  if (newCoeff === 0) return symConst(0);
  if (rest.kind === 'const' && rest.value === 1) return symConst(newCoeff);
  return symMul(symConst(newCoeff), rest);
}

function scaleExpr(_e: SymExpr, _s: number): SymExpr {
  // Not used anymore — replaceCoeff is preferred.
  return _e;
}

function gcdNum(a: number, b: number): number {
  a = Math.round(Math.abs(a));
  b = Math.round(Math.abs(b));
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

// ─── Evaluate ────────────────────────────────────────────────────────────────

/** Substitute variable values and evaluate to a number. Throws if a variable is unbound. */
export function evaluate(expr: SymExpr, bindings: Record<string, number>): number {
  switch (expr.kind) {
    case 'const': return expr.value;
    case 'var': {
      const v = bindings[expr.name];
      if (v === undefined) throw new Error(`Unbound variable: ${expr.name}`);
      return v;
    }
    case 'neg': return -evaluate(expr.expr, bindings);
    case 'add': return expr.terms.reduce((s, t) => s + evaluate(t, bindings), 0);
    case 'mul': return expr.factors.reduce((p, f) => p * evaluate(f, bindings), 1);
    case 'div': return evaluate(expr.num, bindings) / evaluate(expr.den, bindings);
    case 'pow': return Math.pow(evaluate(expr.base, bindings), expr.exp);
  }
}

// ─── Differentiate ───────────────────────────────────────────────────────────

/** Symbolic partial derivative ∂expr/∂varName. Returns a simplified expression. */
export function differentiate(expr: SymExpr, varName: string): SymExpr {
  const raw = _diff(expr, varName);
  return simplify(raw);
}

function _diff(expr: SymExpr, v: string): SymExpr {
  switch (expr.kind) {
    case 'const': return symConst(0);
    case 'var': return expr.name === v ? symConst(1) : symConst(0);
    case 'neg': return symNeg(_diff(expr.expr, v));
    case 'add': return symAdd(...expr.terms.map(t => _diff(t, v)));
    case 'mul': {
      // Product rule: d(f1*f2*...*fn)/dv = sum_i (fi' * prod_{j!=i} fj)
      const n = expr.factors.length;
      const terms: SymExpr[] = [];
      for (let i = 0; i < n; i++) {
        const factors = expr.factors.map((f, j) => j === i ? _diff(f, v) : f);
        terms.push(symMul(...factors));
      }
      return symAdd(...terms);
    }
    case 'div': {
      // Quotient rule: (num'*den - num*den') / den^2
      const numD = _diff(expr.num, v);
      const denD = _diff(expr.den, v);
      return symDiv(
        symAdd(symMul(numD, expr.den), symNeg(symMul(expr.num, denD))),
        symPow(expr.den, 2)
      );
    }
    case 'pow': {
      // d(base^n)/dv = n * base^(n-1) * base'
      const n = expr.exp;
      if (n === 0) return symConst(0);
      return symMul(symConst(n), symPow(expr.base, n - 1), _diff(expr.base, v));
    }
  }
}

// ─── Expand ──────────────────────────────────────────────────────────────────

/** Expand all products and integer powers into sums of monomials. */
export function expand(expr: SymExpr): SymExpr {
  const expanded = _expand(expr);
  return simplify(expanded);
}

function _expand(expr: SymExpr): SymExpr {
  switch (expr.kind) {
    case 'const':
    case 'var':
      return expr;
    case 'neg':
      return symNeg(_expand(expr.expr));
    case 'div':
      return symDiv(_expand(expr.num), _expand(expr.den));
    case 'pow': {
      const base = _expand(expr.base);
      const n = expr.exp;
      if (n <= 0 || !Number.isInteger(n)) return symPow(base, n);
      // Expand base^n by repeated multiplication
      let result: SymExpr = base;
      for (let i = 1; i < n; i++) {
        result = _expandMul([result, base]);
      }
      return result;
    }
    case 'add':
      return symAdd(...expr.terms.map(t => _expand(t)));
    case 'mul': {
      const expanded = expr.factors.map(f => _expand(f));
      return _expandMul(expanded);
    }
  }
}

/** Distribute a product of (possibly sum) expressions into a single sum. */
function _expandMul(factors: SymExpr[]): SymExpr {
  if (factors.length === 0) return symConst(1);
  if (factors.length === 1) return factors[0];

  let result: SymExpr = factors[0];
  for (let i = 1; i < factors.length; i++) {
    result = _distribute(result, factors[i]);
  }
  return result;
}

/** Distribute (a1 + a2 + ...) * (b1 + b2 + ...). */
function _distribute(a: SymExpr, b: SymExpr): SymExpr {
  const aTerms = a.kind === 'add' ? a.terms : [a];
  const bTerms = b.kind === 'add' ? b.terms : [b];
  const products: SymExpr[] = [];
  for (const at of aTerms) {
    for (const bt of bTerms) {
      products.push(symMul(at, bt));
    }
  }
  return symAdd(...products);
}

// ─── exprToString ────────────────────────────────────────────────────────────

/** Human-readable infix representation. */
export function exprToString(expr: SymExpr): string {
  return _str(expr, false);
}

function _str(expr: SymExpr, needsParens: boolean): string {
  switch (expr.kind) {
    case 'const': {
      const s = Number.isInteger(expr.value) ? String(expr.value) : expr.value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
      return expr.value < 0 && needsParens ? `(${s})` : s;
    }
    case 'var': return expr.name;
    case 'neg': {
      const inner = _str(expr.expr, true);
      return needsParens ? `(-${inner})` : `-${inner}`;
    }
    case 'add': {
      const s = expr.terms.map((t, i) => {
        if (i === 0) return _str(t, false);
        // Check for negation
        if (t.kind === 'neg') return ` - ${_str(t.expr, true)}`;
        if (t.kind === 'const' && t.value < 0) return ` - ${_str(symConst(-t.value), true)}`;
        if (t.kind === 'mul' && t.factors.length > 0 && t.factors[0].kind === 'const' && t.factors[0].value < 0) {
          const rest = t.factors.length === 2 ? t.factors[1] : symMul(...t.factors.slice(1));
          const absCoeff = Math.abs(t.factors[0].value);
          const restStr = absCoeff === 1 ? _str(rest, true) : `${absCoeff}*${_str(rest, true)}`;
          return ` - ${restStr}`;
        }
        return ` + ${_str(t, false)}`;
      }).join('');
      return needsParens ? `(${s})` : s;
    }
    case 'mul': {
      const s = expr.factors.map(f => _str(f, true)).join('*');
      return needsParens ? `(${s})` : s;
    }
    case 'div': {
      const n = _str(expr.num, true);
      const d = _str(expr.den, true);
      return needsParens ? `(${n}/${d})` : `${n}/${d}`;
    }
    case 'pow': {
      const b = _str(expr.base, true);
      return `${b}^${expr.exp}`;
    }
  }
}

// ─── exprToLatex ─────────────────────────────────────────────────────────────

/** LaTeX representation. */
export function exprToLatex(expr: SymExpr): string {
  return _latex(expr, false);
}

function _latex(expr: SymExpr, needsParens: boolean): string {
  switch (expr.kind) {
    case 'const': {
      const s = Number.isInteger(expr.value) ? String(expr.value) : expr.value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
      return expr.value < 0 && needsParens ? `\\left(${s}\\right)` : s;
    }
    case 'var': return expr.name.length > 1 ? `\\mathrm{${expr.name}}` : expr.name;
    case 'neg': {
      const inner = _latex(expr.expr, true);
      return needsParens ? `\\left(-${inner}\\right)` : `-${inner}`;
    }
    case 'add': {
      const s = expr.terms.map((t, i) => {
        if (i === 0) return _latex(t, false);
        if (t.kind === 'neg') return ` - ${_latex(t.expr, true)}`;
        if (t.kind === 'const' && t.value < 0) return ` - ${_latex(symConst(-t.value), true)}`;
        return ` + ${_latex(t, false)}`;
      }).join('');
      return needsParens ? `\\left(${s}\\right)` : s;
    }
    case 'mul': {
      const parts = expr.factors.map(f => _latex(f, true));
      return needsParens ? `\\left(${parts.join(' \\cdot ')}\\right)` : parts.join(' \\cdot ');
    }
    case 'div': {
      return `\\frac{${_latex(expr.num, false)}}{${_latex(expr.den, false)}}`;
    }
    case 'pow': {
      const b = _latex(expr.base, true);
      return `${b}^{${expr.exp}}`;
    }
  }
}

// ─── collectTerms ────────────────────────────────────────────────────────────

/**
 * Express `expr` as a polynomial in `varName`:
 *   c_0 + c_1 * x + c_2 * x^2 + ...
 * Returns coefficient expressions and the degree.
 */
export function collectTerms(
  expr: SymExpr,
  varName: string
): { coefficients: SymExpr[]; degree: number } {
  const expanded = expand(expr);
  const terms = expanded.kind === 'add' ? expanded.terms : [expanded];

  const coeffMap = new Map<number, SymExpr[]>();

  for (const term of terms) {
    const { deg, coeff } = _extractDegreeAndCoeff(term, varName);
    const existing = coeffMap.get(deg) || [];
    existing.push(coeff);
    coeffMap.set(deg, existing);
  }

  const maxDeg = Math.max(0, ...coeffMap.keys());
  const coefficients: SymExpr[] = [];
  for (let i = 0; i <= maxDeg; i++) {
    const parts = coeffMap.get(i);
    if (!parts || parts.length === 0) {
      coefficients.push(symConst(0));
    } else {
      coefficients.push(simplify(symAdd(...parts)));
    }
  }
  return { coefficients, degree: maxDeg };
}

function _extractDegreeAndCoeff(term: SymExpr, varName: string): { deg: number; coeff: SymExpr } {
  if (term.kind === 'var' && term.name === varName) {
    return { deg: 1, coeff: symConst(1) };
  }
  if (term.kind === 'pow' && term.base.kind === 'var' && term.base.name === varName) {
    return { deg: term.exp, coeff: symConst(1) };
  }
  if (term.kind === 'mul') {
    let deg = 0;
    const rest: SymExpr[] = [];
    for (const f of term.factors) {
      if (f.kind === 'var' && f.name === varName) {
        deg += 1;
      } else if (f.kind === 'pow' && f.base.kind === 'var' && f.base.name === varName) {
        deg += f.exp;
      } else {
        rest.push(f);
      }
    }
    const coeff = rest.length === 0 ? symConst(1) : rest.length === 1 ? rest[0] : symMul(...rest);
    return { deg, coeff };
  }
  if (term.kind === 'neg') {
    const inner = _extractDegreeAndCoeff(term.expr, varName);
    return { deg: inner.deg, coeff: simplify(symNeg(inner.coeff)) };
  }
  // No occurrence of the variable
  if (!_containsVar(term, varName)) {
    return { deg: 0, coeff: term };
  }
  // Fallback: treat as degree-0
  return { deg: 0, coeff: term };
}

function _containsVar(expr: SymExpr, varName: string): boolean {
  switch (expr.kind) {
    case 'const': return false;
    case 'var': return expr.name === varName;
    case 'neg': return _containsVar(expr.expr, varName);
    case 'add': return expr.terms.some(t => _containsVar(t, varName));
    case 'mul': return expr.factors.some(f => _containsVar(f, varName));
    case 'div': return _containsVar(expr.num, varName) || _containsVar(expr.den, varName);
    case 'pow': return _containsVar(expr.base, varName);
  }
}

// ─── factor ──────────────────────────────────────────────────────────────────

/**
 * Factor out common sub-expressions from sums.
 * For a sum a*X + b*X → (a+b)*X.
 * For products, recursively factor each factor.
 */
export function factor(expr: SymExpr): SymExpr {
  const s = simplify(expr);
  return _factor(s);
}

function _factor(expr: SymExpr): SymExpr {
  if (expr.kind !== 'add') return expr;
  const terms = expr.terms;
  if (terms.length < 2) return expr;

  // Collect factors of each term
  const termFactors: SymExpr[][] = terms.map(t => {
    if (t.kind === 'mul') return [...t.factors];
    return [t];
  });

  // Find common factors (by exprKey)
  const commonKeys = new Map<string, SymExpr>();
  if (termFactors[0]) {
    for (const f of termFactors[0]) {
      if (f.kind === 'const') continue;
      commonKeys.set(exprKey(f), f);
    }
  }
  for (let i = 1; i < termFactors.length; i++) {
    const thisKeys = new Set(termFactors[i].filter(f => f.kind !== 'const').map(f => exprKey(f)));
    for (const key of commonKeys.keys()) {
      if (!thisKeys.has(key)) commonKeys.delete(key);
    }
  }

  if (commonKeys.size === 0) return expr;

  // Pull out first common factor
  const [commonKey, commonExpr] = commonKeys.entries().next().value!;
  const remainders: SymExpr[] = terms.map(t => {
    const factors = t.kind === 'mul' ? [...t.factors] : [t];
    const idx = factors.findIndex(f => exprKey(f) === commonKey);
    if (idx >= 0) {
      factors.splice(idx, 1);
      return factors.length === 0 ? symConst(1) : factors.length === 1 ? factors[0] : symMul(...factors);
    }
    return t;
  });

  const inner = simplify(symAdd(...remainders));
  return simplify(symMul(commonExpr, _factor(inner)));
}

// ─── isPolynomial ────────────────────────────────────────────────────────────

/** Check if `expr` is a polynomial in the given `vars`. */
export function isPolynomial(expr: SymExpr, vars: string[]): boolean {
  const expanded = expand(expr);
  return _isPoly(expanded, new Set(vars));
}

function _isPoly(e: SymExpr, vars: Set<string>): boolean {
  switch (e.kind) {
    case 'const': return true;
    case 'var': return true; // any variable is polynomial
    case 'neg': return _isPoly(e.expr, vars);
    case 'add': return e.terms.every(t => _isPoly(t, vars));
    case 'mul': return e.factors.every(f => _isPoly(f, vars));
    case 'pow': {
      if (!_isPoly(e.base, vars)) return false;
      return Number.isInteger(e.exp) && e.exp >= 0;
    }
    case 'div': {
      // Polynomial if denominator doesn't contain any of the vars
      if (!_isPoly(e.num, vars)) return false;
      return !_containsAnyVar(e.den, vars);
    }
  }
}

function _containsAnyVar(e: SymExpr, vars: Set<string>): boolean {
  switch (e.kind) {
    case 'const': return false;
    case 'var': return vars.has(e.name);
    case 'neg': return _containsAnyVar(e.expr, vars);
    case 'add': return e.terms.some(t => _containsAnyVar(t, vars));
    case 'mul': return e.factors.some(f => _containsAnyVar(f, vars));
    case 'div': return _containsAnyVar(e.num, vars) || _containsAnyVar(e.den, vars);
    case 'pow': return _containsAnyVar(e.base, vars);
  }
}

// ─── degree ──────────────────────────────────────────────────────────────────

/** Degree of `expr` as a polynomial in `varName`. Returns 0 if variable absent. */
export function degree(expr: SymExpr, varName: string): number {
  const { degree: d } = collectTerms(expr, varName);
  // Trim trailing zero coefficients
  return d;
}

// ─── freeVariables ───────────────────────────────────────────────────────────

/** Collect all variable names appearing in the expression. */
export function freeVariables(expr: SymExpr): Set<string> {
  const vars = new Set<string>();
  _collectVars(expr, vars);
  return vars;
}

function _collectVars(e: SymExpr, out: Set<string>): void {
  switch (e.kind) {
    case 'const': break;
    case 'var': out.add(e.name); break;
    case 'neg': _collectVars(e.expr, out); break;
    case 'add': e.terms.forEach(t => _collectVars(t, out)); break;
    case 'mul': e.factors.forEach(f => _collectVars(f, out)); break;
    case 'div': _collectVars(e.num, out); _collectVars(e.den, out); break;
    case 'pow': _collectVars(e.base, out); break;
  }
}

/** Substitute a variable with another expression. */
export function substitute(expr: SymExpr, varName: string, replacement: SymExpr): SymExpr {
  return _subst(expr, varName, replacement);
}

function _subst(e: SymExpr, v: string, r: SymExpr): SymExpr {
  switch (e.kind) {
    case 'const': return e;
    case 'var': return e.name === v ? r : e;
    case 'neg': return symNeg(_subst(e.expr, v, r));
    case 'add': return symAdd(...e.terms.map(t => _subst(t, v, r)));
    case 'mul': return symMul(...e.factors.map(f => _subst(f, v, r)));
    case 'div': return symDiv(_subst(e.num, v, r), _subst(e.den, v, r));
    case 'pow': return symPow(_subst(e.base, v, r), e.exp);
  }
}
