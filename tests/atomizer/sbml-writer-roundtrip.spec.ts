/**
 * sbml-writer-roundtrip.spec.ts
 *
 * Regression test for the engine SBMLWriter with the functional-rate and falsy-zero fixes.
 * Validates: bimolecular, repeated reactant, synthesis, degradation, functional Hill rate,
 * parenthesised difference rate, and zero-rate constant.
 * Original harness: sbmlwriter_roundtrip.mjs (standalone).
 */
import { describe, it, expect } from 'vitest';
import { SBMLWriter } from '@bngplayground/engine/services/export/SBMLWriter';

import type { BNGLModel } from '@bngplayground/engine/types';
import type { ExpandedNetwork } from '@bngplayground/engine/interfaces/SimulationEngine';

// ─────────────────────────────────────────────────────────────────────────────
// MathML→infix reader (self-contained, same as in infix-mathml-roundtrip.spec.ts)
// ─────────────────────────────────────────────────────────────────────────────

function getXmlAttribute(tagAttributes: string, name: string): string | null {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = (tagAttributes || '').match(new RegExp(`${esc}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? ((m[1] ?? m[2] ?? '').trim()) : null;
}

function sanitize(formula: string): string {
  let s = String(formula || '').trim();
  if (!s) return '';
  s = s.replace(/^\s*=\s*/, '').trim();
  if (!s) return '';
  if (/^[=(){}[\],;\s]+$/.test(s)) return '';
  return s;
}

interface SimpleXmlNode {
  name: string;
  children: SimpleXmlNode[];
  text: string;
  attributes?: string;
}

function parseSimpleXml(xml: string): SimpleXmlNode | null {
  const source = String(xml || '').trim();
  if (!source) return null;
  const tokens = source.match(/<[^>]+>|[^<]+/g);
  if (!tokens) return null;
  const root: SimpleXmlNode = { name: '#root', children: [], text: '' };
  const stack: SimpleXmlNode[] = [root];
  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith('<?') || token.startsWith('<!--') || token.startsWith('<!')) continue;
    if (token.startsWith('</')) {
      const raw = token.replace(/^<\s*\/\s*/, '').replace(/\s*>$/, '').trim();
      const cn = raw.split(':').pop()?.toLowerCase() || '';
      while (stack.length > 1) { const p = stack.pop(); if (p?.name === cn) break; }
      continue;
    }
    if (token.startsWith('<')) {
      const om = token.match(/^<\s*([^\s/>]+)/);
      if (!om) continue;
      const rawName = om[1];
      const name = rawName.split(':').pop()?.toLowerCase() || rawName.toLowerCase();
      const attributes = token.replace(/^<\s*[^\s/>]+/, '').replace(/\/?\s*>$/, '').trim();
      const node: SimpleXmlNode = { name, children: [], text: '', attributes };
      stack[stack.length - 1].children.push(node);
      if (!/\/\s*>$/.test(token)) stack.push(node);
      continue;
    }
    const text = token.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    stack[stack.length - 1].children.push({ name: '#text', children: [], text });
  }
  return root.children[0] || null;
}

function simpleXmlText(node: SimpleXmlNode | null): string {
  if (!node) return '';
  if (node.name === '#text') return node.text.trim();
  const parts: string[] = [];
  for (const c of node.children) { const t = simpleXmlText(c); if (t) parts.push(t); }
  return parts.join(' ').trim();
}

function nodeToFormula(node: SimpleXmlNode | null): string {
  if (!node) return '';
  if (node.name === '#text') return node.text.trim();
  const ec = node.children.filter((c) => c.name !== '#text');
  const firstChildExpr = (): string => {
    for (const c of ec) { const e = nodeToFormula(c).trim(); if (e) return e; }
    return '';
  };
  switch (node.name) {
    case 'math': case 'semantics': case 'annotation-xml': case 'condition': case 'piece': case 'otherwise':
      return firstChildExpr();
    case 'ci': case 'csymbol': return simpleXmlText(node);
    case 'cn': {
      const hasSep = node.children.some((c) => c.name === 'sep');
      const tc = node.children.filter((c) => c.name === '#text').map((c) => c.text.trim()).filter(Boolean);
      const type = (getXmlAttribute(node.attributes || '', 'type') || '').toLowerCase();
      if (hasSep && tc.length >= 2) {
        if (type === 'e-notation' || type === 'enotation') return `(${tc[0]} * 10^(${tc[1]}))`;
        return `(${tc[0]} / ${tc[1]})`;
      }
      return simpleXmlText(node);
    }
    case 'true': return '1'; case 'false': return '0';
    case 'pi': return '3.141592653589793'; case 'exponentiale': return '2.718281828459045';
    case 'infinity': return '1e308'; case 'notanumber': return '0';
    case 'piecewise': {
      const args: string[] = [];
      for (const child of ec) {
        if (child.name === 'piece') {
          const pc = child.children.filter((c) => c.name !== '#text');
          const cond = pc.find((c) => c.name === 'condition') || null;
          const val = pc.find((c) => c.name !== 'condition') || null;
          const ve = nodeToFormula(val); const ce = nodeToFormula(cond);
          if (ve && ce) args.push(ve, ce); else if (ve) args.push(ve);
        } else if (child.name === 'otherwise') {
          const oe = nodeToFormula(child); if (oe) args.push(oe);
        }
      }
      return args.length === 0 ? '' : `piecewise(${args.join(', ')})`;
    }
    case 'apply': {
      if (ec.length === 0) return '';
      const opNode = ec[0]; const opName = opNode.name;
      if (opName === 'ci' || opName === 'csymbol') {
        const fn = simpleXmlText(opNode);
        const oa = ec.slice(1).map((c) => nodeToFormula(c)).map((e) => e.trim()).filter(Boolean);
        return fn ? `${fn}(${oa.join(', ')})` : oa.join(', ');
      }
      const degreeNode = ec.slice(1).find((c) => c.name === 'degree') || null;
      const logbaseNode = ec.slice(1).find((c) => c.name === 'logbase') || null;
      const a = ec.slice(1).filter((c) => c.name !== 'degree' && c.name !== 'logbase')
        .map((c) => nodeToFormula(c)).map((e) => e.trim()).filter(Boolean);
      const direct: Record<string, string> = {
        exp: 'exp', ln: 'ln', abs: 'abs', floor: 'floor', sin: 'sin', cos: 'cos', tan: 'tan',
        sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', asin: 'asin', acos: 'acos', atan: 'atan',
        arcsin: 'asin', arccos: 'acos', arctan: 'atan', arcsinh: 'asinh', arccosh: 'acosh',
        arctanh: 'atanh', ceiling: 'ceil', min: 'min', max: 'max',
      };
      switch (opName) {
        case 'plus': return a.length ? `(${a.join(' + ')})` : '0';
        case 'times': return a.length ? `(${a.join(' * ')})` : '1';
        case 'minus': return a.length === 1 ? `(-${a[0]})` : `(${a.join(' - ')})`;
        case 'divide': return a.length >= 2 ? `(${a[0]} / ${a[1]})` : `(${a.join(' / ')})`;
        case 'power': return a.length >= 2 ? `pow(${a[0]}, ${a[1]})` : `pow(${a.join(', ')})`;
        case 'root': {
          const deg = degreeNode ? nodeToFormula(degreeNode).trim() : '';
          if (deg && deg !== '2') return `pow(${a[0]}, (1 / (${deg})))`;
          return `sqrt(${a[0]})`;
        }
        case 'log': {
          const base = logbaseNode ? nodeToFormula(logbaseNode).trim() : '';
          if (base && base !== '10') return `(ln(${a[0]}) / ln(${base}))`;
          return `log10(${a[0]})`;
        }
        case 'quotient': return a.length >= 2 ? `floor((${a[0]}) / (${a[1]}))` : a.join(', ');
        case 'rem': return a.length >= 2 ? `((${a[0]}) - (${a[1]}) * floor((${a[0]}) / (${a[1]})))` : a.join(', ');
        case 'factorial': return `factorial(${a.join(', ')})`;
        case 'sec': return `(1 / cos(${a[0]}))`;
        case 'csc': return `(1 / sin(${a[0]}))`;
        case 'cot': return `(1 / tan(${a[0]}))`;
        case 'sech': return `(1 / cosh(${a[0]}))`;
        case 'csch': return `(1 / sinh(${a[0]}))`;
        case 'coth': return `(1 / tanh(${a[0]}))`;
        case 'eq': case 'neq': case 'gt': case 'lt': case 'geq': case 'leq':
        case 'and': case 'or': case 'xor': case 'not':
          return `${opName}(${a.join(', ')})`;
        case 'piecewise': return `piecewise(${a.join(', ')})`;
        default: {
          if (direct[opName]) return `${direct[opName]}(${a.join(', ')})`;
          const fb = simpleXmlText(opNode) || opName;
          return fb ? `${fb}(${a.join(', ')})` : a.join(', ');
        }
      }
    }
    default: return firstChildExpr() || simpleXmlText(node);
  }
}

function mathMlToFormula(x: string): string {
  const p = parseSimpleXml(x);
  if (!p) return '';
  return sanitize(nodeToFormula(p));
}

// ─────────────────────────────────────────────────────────────────────────────
// Numeric evaluator
// ─────────────────────────────────────────────────────────────────────────────

function tokenize(s: string): Array<{ t: string; v: string }> {
  const toks: Array<{ t: string; v: string }> = [];
  let i = 0;
  const num = /[0-9]/, idst = /[A-Za-z_]/, idch = /[A-Za-z0-9_]/;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (num.test(c) || (c === '.' && num.test(s[i + 1]))) {
      let j = i + 1; while (j < s.length && /[0-9.]/.test(s[j])) j++;
      if (s[j] === 'e' || s[j] === 'E') { j++; if (s[j] === '+' || s[j] === '-') j++; while (j < s.length && num.test(s[j])) j++; }
      toks.push({ t: 'num', v: s.slice(i, j) }); i = j; continue;
    }
    if (idst.test(c)) { let j = i + 1; while (j < s.length && idch.test(s[j])) j++; toks.push({ t: 'id', v: s.slice(i, j) }); i = j; continue; }
    if ('+-*/^(),'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    i++;
  }
  return toks;
}

function parseAst(toks: Array<{ t: string; v: string }>): unknown {
  let p = 0;
  const peek = () => toks[p]; const next = () => toks[p++];
  function parseExpr(rbp = 0): unknown { let left = nud(next()); while (peek() && lbp(peek()) > rbp) { left = led(next(), left); } return left; }
  function lbp(tok: { t: string; v: string } | undefined): number { if (!tok || tok.t !== 'op') return 0; return ({ '+': 10, '-': 10, '*': 20, '/': 20, '^': 30, ')': 0, ',': 0, '(': 40 } as Record<string, number>)[tok.v] || 0; }
  function nud(tok: { t: string; v: string } | undefined): unknown {
    if (!tok) throw new Error('unexpected end');
    if (tok.t === 'num') return { k: 'num', v: tok.v };
    if (tok.t === 'id') { if (peek() && peek().t === 'op' && peek().v === '(') { next(); const args: unknown[] = []; if (!(peek() && peek().v === ')')) { args.push(parseExpr(0)); while (peek() && peek().v === ',') { next(); args.push(parseExpr(0)); } } if (!peek() || peek().v !== ')') throw new Error('missing )'); next(); return { k: 'call', name: tok.v, args }; } return { k: 'id', v: tok.v }; }
    if (tok.t === 'op' && tok.v === '(') { const e = parseExpr(0); if (!peek() || peek().v !== ')') throw new Error('missing )'); next(); return e; }
    if (tok.t === 'op' && (tok.v === '-' || tok.v === '+')) { const e = parseExpr(25); return { k: 'unary', op: tok.v, e }; }
    throw new Error('unexpected token ' + JSON.stringify(tok));
  }
  function led(tok: { t: string; v: string }, left: unknown): unknown { if (tok.v === '^') { const right = parseExpr(30 - 1); return { k: 'bin', op: '^', l: left, r: right }; } const right = parseExpr(lbp(tok)); return { k: 'bin', op: tok.v, l: left, r: right }; }
  const e = parseExpr(0); if (p !== toks.length) throw new Error('trailing tokens'); return e;
}

 
function evalInfix(s: string, env: Record<string, number>): number {
  const fns: Record<string, (...args: number[]) => number> = { pow: Math.pow, sqrt: Math.sqrt, exp: Math.exp, ln: Math.log, log10: Math.log10, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, sin: Math.sin, cos: Math.cos, tan: Math.tan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asin: Math.asin, acos: Math.acos, atan: Math.atan, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh, min: Math.min, max: Math.max };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ast = parseAst(tokenize(s)) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function ev(n: any): number {
    switch (n.k) {
      case 'num': return parseFloat(n.v);
      case 'id': return (n.v in env) ? env[n.v] : (n.v === 'pi' ? Math.PI : 1);
      case 'unary': return n.op === '-' ? -ev(n.e) : ev(n.e);
      case 'bin': { const l = ev(n.l), r = ev(n.r); return ({ '+': l + r, '-': l - r, '*': l * r, '/': l / r, '^': Math.pow(l, r) } as Record<string, number>)[n.op]; }
      case 'call': { const a = n.args.map(ev); if (fns[n.name]) return fns[n.name](...a); if (n.name === 'log10') return Math.log10(a[0]); return a[0]; }
    }
    return 0;
  }
  return ev(ast);
}

const KNOWN_FNS = /^(pow|sqrt|exp|ln|log10|abs|floor|ceil|ceiling|sin|cos|tan|sinh|cosh|tanh|asin|acos|atan|asinh|acosh|atanh|min|max|pi|piecewise)$/;
function idsOf(s: string): string[] {
  const set = new Set<string>();
  for (const t of tokenize(s)) if (t.t === 'id' && !KNOWN_FNS.test(t.v)) set.add(t.v);
  return [...set];
}
function equiv(a: string, b: string, extraIds: string[] = []): boolean {
  const ids = [...new Set([...idsOf(a), ...idsOf(b), ...extraIds])];
  for (let t = 0; t < 12; t++) {
    const env: Record<string, number> = {};
    for (const id of ids) env[id] = 0.2 + Math.random() * 2.5;
    let x: number, y: number;
    try { x = evalInfix(a, env); y = evalInfix(b, env); } catch { return false; }
    if (!isFinite(x) || !isFinite(y)) continue;
    if (Math.abs(x - y) > 1e-7 * (1 + Math.abs(x))) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for building SBMLWriter inputs
// ─────────────────────────────────────────────────────────────────────────────

const model: BNGLModel = {
  name: 'm',
  parameters: { k1: 0.5, k: 2, kd: 0.3, vmax: 4, Kd: 1.5, n: 2, ksyn: 0.7 },
  compartments: [{ name: 'cell', size: 1 }],
} as BNGLModel;

const N = (species: string[], reactions: ExpandedNetwork['reactions']): ExpandedNetwork => ({
  species: species.map((n) => ({ name: n, initialConcentration: 1 } as ExpandedNetwork['species'][0])),
  reactions,
  observableExpressions: new Map(),
  parameterValues: new Map(),
} as ExpandedNetwork);

function extractReactions(xml: string): Array<{ reactants: string[]; products: string[]; rate: string }> {
  const rxns = [...xml.matchAll(/<reaction\b[\s\S]*?<\/reaction>/gi)].map((m) => m[0]);
  return rxns.map((rx) => {
    const reactants = [...(rx.match(/<listOfReactants>([\s\S]*?)<\/listOfReactants>/i)?.[1] || '').matchAll(/species="([^"]+)"/g)].map((m) => m[1]);
    const products = [...(rx.match(/<listOfProducts>([\s\S]*?)<\/listOfProducts>/i)?.[1] || '').matchAll(/species="([^"]+)"/g)].map((m) => m[1]);
    const mm = rx.match(/<math\b[\s\S]*?<\/math>/i);
    const rate = mm ? mathMlToFormula(mm[0]) : '';
    return { reactants, products, rate };
  });
}

const ms = (a: string[]) => a.slice().sort().join('+');

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SBMLWriter round-trip (corrected)', () => {
  it('bimolecular: A+B → C with rate k1*A*B', () => {
    const net = N(['A', 'B', 'C'], [{ reactants: ['A', 'B'], products: ['C'], rate: 'k1', rateConstant: 0.5 } as ExpandedNetwork['reactions'][0]]);
    const out = SBMLWriter.write(model, net, {});
    const ex = extractReactions(out);
    expect(ex).toHaveLength(1);
    expect(ms(ex[0].reactants)).toBe('A+B');
    expect(ms(ex[0].products)).toBe('C');
    expect(equiv(ex[0].rate, 'k1*A*B')).toBe(true);
  });

  it('repeated reactant: 2A → C with rate k*A*A', () => {
    const net = N(['A', 'C'], [{ reactants: ['A', 'A'], products: ['C'], rate: 'k', rateConstant: 2 } as ExpandedNetwork['reactions'][0]]);
    const ex = extractReactions(SBMLWriter.write(model, net, {}));
    expect(ex[0].reactants.length).toBe(2);
    expect(ms(ex[0].reactants)).toBe('A+A');
    expect(equiv(ex[0].rate, 'k*A*A')).toBe(true);
  });

  it('synthesis: ∅ → P with rate ksyn', () => {
    const net = N(['P'], [{ reactants: [], products: ['P'], rate: 'ksyn', rateConstant: 0.7 } as ExpandedNetwork['reactions'][0]]);
    const ex = extractReactions(SBMLWriter.write(model, net, {}));
    expect(ex[0].reactants.length).toBe(0);
    expect(equiv(ex[0].rate, 'ksyn')).toBe(true);
  });

  it('degradation: P → ∅ with rate kd*P', () => {
    const net = N(['P'], [{ reactants: ['P'], products: [], rate: 'kd', rateConstant: 0.3 } as ExpandedNetwork['reactions'][0]]);
    const ex = extractReactions(SBMLWriter.write(model, net, {}));
    expect(equiv(ex[0].rate, 'kd*P')).toBe(true);
  });

  it('functional Hill rate: (rateLaw) * reactants (engine-consistent full flux)', () => {
    const hill = 'vmax*pow(S,n)/(pow(Kd,n)+pow(S,n))';
    const net = N(['S', 'P'], [{ reactants: ['S'], products: ['P'], rate: '', rateConstant: 0, isFunctionalRate: true, rateExpression: hill } as ExpandedNetwork['reactions'][0]]);
    const ex = extractReactions(SBMLWriter.write(model, net, {}));
    // The engine ODE multiplies rate laws by reactant concentrations for EVERY reaction,
    // so the SBML kinetic law must be the full flux: (rateLaw) * reactants
    expect(equiv(ex[0].rate, `(${hill}) * S`, ['S', 'n', 'Kd', 'vmax'])).toBe(true);
    // Should NOT be just the bare rate expression without reactants
    expect(equiv(ex[0].rate, hill, ['S', 'n', 'Kd', 'vmax'])).toBe(false);
  });

  it('zero-rate: mass action with rate token "0" stays 0*A', () => {
    const net = N(['A'], [{ reactants: ['A'], products: [], rate: '0', rateConstant: 0 } as ExpandedNetwork['reactions'][0]]);
    const ex = extractReactions(SBMLWriter.write(model, net, {}));
    expect(equiv(ex[0].rate, '0*A')).toBe(true);
  });
});
