/**
 * mathml_converter_corpus_roundtrip.mjs
 *
 * Reads kinetic-law MathML from BioModels XML → infix (reader),
 * converts infix → MathML → infix (converter round-trip),
 * and checks numeric equivalence.
 *
 * Self-contained — no external imports beyond Node builtins.
 *
 * Usage:
 *   node tests/mathml_converter_corpus_roundtrip.mjs              # all models
 *   node tests/mathml_converter_corpus_roundtrip.mjs 0 6          # shard 0 of 6
 *   BIOMODELS_DIR=/path node tests/mathml_converter_corpus_roundtrip.mjs
 */
import fs from 'fs';

const BIOMODELS_DIR = process.env.BIOMODELS_DIR
  || 'C:\\Users\\Achyudhan\\OneDrive - University of Pittsburgh\\Desktop\\Achyudhan\\School\\PhD\\Research\\BioNetGen\\Biomodels';
const SHARD = parseInt(process.argv[2] || process.env.SLURM_ARRAY_TASK_ID || '0', 10);
const NSHARD = parseInt(process.argv[3] || process.env.NSHARD || '1', 10);

const UNSUPPORTED = /\b(piecewise|eq|neq|gt|lt|geq|leq|and|or|xor|not|factorial|gcd|lcm|quotient|rem|delay|rateOf)\s*\(/;

// ═══════════════════════════════════════════════════════════════════════
// MathML → infix reader (self-contained)
// ═══════════════════════════════════════════════════════════════════════
function getXmlAttribute(a, n) { const e = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const m = (a || '').match(new RegExp(`${e}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')); return m ? ((m[1] ?? m[2] ?? '').trim()) : null; }
function sanitize(f) { let s = String(f || '').trim(); if (!s) return ''; s = s.replace(/^\s*=\s*/, '').trim(); if (!s) return ''; if (/^[=(){}[\],;\s]+$/.test(s)) return ''; return s; }
function parseXml(x) { const s = String(x||'').trim(); if(!s) return null; const t=s.match(/<[^>]+>|[^<]+/g); if(!t) return null; const r={n:'#root',c:[],t:''}; const stk=[r]; for(const tk of t){if(!tk)continue;if(tk.startsWith('<?')||tk.startsWith('<!--')||tk.startsWith('<!'))continue;if(tk.startsWith('</')){const rw=tk.replace(/^<\s*\/\s*/,'').replace(/\s*>$/,'').trim();const cn=rw.split(':').pop()?.toLowerCase()||'';while(stk.length>1){const p=stk.pop();if(p?.n===cn)break;}continue;}if(tk.startsWith('<')){const om=tk.match(/^<\s*([^\s/>]+)/);if(!om)continue;const raw=om[1];const nm=raw.split(':').pop()?.toLowerCase()||raw.toLowerCase();const at=tk.replace(/^<\s*[^\s/>]+/,'').replace(/\/?\s*>$/,'').trim();const nd={n:nm,c:[],t:'',a:at};stk[stk.length-1].c.push(nd);if(!/\/\s*>$/.test(tk))stk.push(nd);continue;}const tx=tk.replace(/\s+/g,' ').trim();if(!tx)continue;stk[stk.length-1].c.push({n:'#text',c:[],t:tx});} return r.c[0]||null; }
function xmlTxt(nd) { if(!nd) return ''; if(nd.n==='#text') return nd.t.trim(); const p=[]; for(const c of nd.c){const v=xmlTxt(c);if(v)p.push(v);} return p.join(' ').trim(); }
function ndFormula(nd) {
  if(!nd) return ''; if(nd.n==='#text') return nd.t.trim();
  const ec=nd.c.filter(c=>c.n!=='#text');
  const fc=()=>{for(const c of ec){const e=ndFormula(c).trim();if(e)return e;}return '';};
  switch(nd.n){
    case 'math':case 'semantics':case 'annotation-xml':case 'condition':case 'piece':case 'otherwise':return fc();
    case 'ci':case 'csymbol':return xmlTxt(nd);
    case 'cn':{const hs=nd.c.some(c=>c.n==='sep');const tc=nd.c.filter(c=>c.n==='#text').map(c=>c.t.trim()).filter(Boolean);const ty=(getXmlAttribute(nd.a||'','type')||'').toLowerCase();if(hs&&tc.length>=2){if(ty==='e-notation'||ty==='enotation')return `(${tc[0]} * 10^(${tc[1]}))`;return `(${tc[0]} / ${tc[1]})`;}return xmlTxt(nd);}
    case 'true':return '1';case 'false':return '0';case 'pi':return '3.141592653589793';case 'exponentiale':return '2.718281828459045';case 'infinity':return '1e308';case 'notanumber':return '0';
    case 'piecewise':{const a=[];for(const ch of ec){if(ch.n==='piece'){const pc=ch.c.filter(c=>c.n!=='#text');const co=pc.find(c=>c.n==='condition')||null;const va=pc.find(c=>c.n!=='condition')||null;const ve=ndFormula(va);const ce=ndFormula(co);if(ve&&ce)a.push(ve,ce);else if(ve)a.push(ve);}else if(ch.n==='otherwise'){const oe=ndFormula(ch);if(oe)a.push(oe);}}return a.length===0?'':`piecewise(${a.join(', ')})`;}
    case 'apply':{if(ec.length===0)return '';const op=ec[0];const on=op.n;if(on==='ci'||on==='csymbol'){const fn=xmlTxt(op);const oa=ec.slice(1).map(c=>ndFormula(c)).map(e=>e.trim()).filter(Boolean);return fn?`${fn}(${oa.join(', ')})`:oa.join(', ');}const dn=ec.slice(1).find(c=>c.n==='degree')||null;const lb=ec.slice(1).find(c=>c.n==='logbase')||null;const a=ec.slice(1).filter(c=>c.n!=='degree'&&c.n!=='logbase').map(c=>ndFormula(c)).map(e=>e.trim()).filter(Boolean);const d={exp:'exp',ln:'ln',abs:'abs',floor:'floor',sin:'sin',cos:'cos',tan:'tan',sinh:'sinh',cosh:'cosh',tanh:'tanh',asin:'asin',acos:'acos',atan:'atan',arcsin:'asin',arccos:'acos',arctan:'atan',arcsinh:'asinh',arccosh:'acosh',arctanh:'atanh',ceiling:'ceil',min:'min',max:'max'};switch(on){case 'plus':return a.length?`(${a.join(' + ')})`:'0';case 'times':return a.length?`(${a.join(' * ')})`:'1';case 'minus':return a.length===1?`(-${a[0]})`:`(${a.join(' - ')})`;case 'divide':return a.length>=2?`(${a[0]} / ${a[1]})`:`(${a.join(' / ')})`;case 'power':return a.length>=2?`pow(${a[0]}, ${a[1]})`:`pow(${a.join(', ')})`;case 'root':{const dg=dn?ndFormula(dn).trim():'';if(dg&&dg!=='2')return `pow(${a[0]}, (1 / (${dg})))`;return `sqrt(${a[0]})`;}case 'log':{const bs=lb?ndFormula(lb).trim():'';if(bs&&bs!=='10')return `(ln(${a[0]}) / ln(${bs}))`;return `log10(${a[0]})`;}case 'quotient':return a.length>=2?`floor((${a[0]}) / (${a[1]}))`:a.join(', ');case 'rem':return a.length>=2?`((${a[0]}) - (${a[1]}) * floor((${a[0]}) / (${a[1]})))`:a.join(', ');case 'factorial':return `factorial(${a.join(', ')})`;case 'sec':return `(1 / cos(${a[0]}))`;case 'csc':return `(1 / sin(${a[0]}))`;case 'cot':return `(1 / tan(${a[0]}))`;case 'sech':return `(1 / cosh(${a[0]}))`;case 'csch':return `(1 / sinh(${a[0]}))`;case 'coth':return `(1 / tanh(${a[0]}))`;case 'eq':case 'neq':case 'gt':case 'lt':case 'geq':case 'leq':case 'and':case 'or':case 'xor':case 'not':return `${on}(${a.join(', ')})`;case 'piecewise':return `piecewise(${a.join(', ')})`;default:{if(d[on])return `${d[on]}(${a.join(', ')})`;const fb=xmlTxt(op)||on;return fb?`${fb}(${a.join(', ')})`:a.join(', ');}}}default:return fc()||xmlTxt(nd);}
}
function mathMlToFormula(x) { const p = parseXml(x); if (!p) return ''; return sanitize(ndFormula(p)); }

// ═══════════════════════════════════════════════════════════════════════
// infix → Content MathML converter (self-contained Pratt parser)
// ═══════════════════════════════════════════════════════════════════════
function tokenize(s) {
  const toks = []; let i = 0;
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
function parseAst(toks) {
  let p = 0;
  const peek = () => toks[p]; const next = () => toks[p++];
  function parseExpr(rbp = 0) { let left = nud(next()); while (peek() && lbp(peek()) > rbp) left = led(next(), left); return left; }
  function lbp(t) { if (!t || t.t !== 'op') return 0; return ({ '+': 10, '-': 10, '*': 20, '/': 20, '^': 30, ')': 0, ',': 0, '(': 40 })[t.v] || 0; }
  function nud(t) {
    if (!t) throw new Error('unexpected end');
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'id') { if (peek() && peek().t === 'op' && peek().v === '(') { next(); const a = []; if (!(peek() && peek().v === ')')) { a.push(parseExpr(0)); while (peek() && peek().v === ',') { next(); a.push(parseExpr(0)); } } if (!peek() || peek().v !== ')') throw new Error('missing )'); next(); return { k: 'call', name: t.v, args: a }; } return { k: 'id', v: t.v }; }
    if (t.t === 'op' && t.v === '(') { const e = parseExpr(0); if (!peek() || peek().v !== ')') throw new Error('missing )'); next(); return e; }
    if (t.t === 'op' && (t.v === '-' || t.v === '+')) return { k: 'un', op: t.v, e: parseExpr(25) };
    throw new Error('unexpected token ' + JSON.stringify(t));
  }
  function led(t, left) {
    if (t.v === '^') return { k: 'bin', op: '^', l: left, r: parseExpr(29) };
    return { k: 'bin', op: t.v, l: left, r: parseExpr(lbp(t)) };
  }
  const e = parseExpr(0);
  if (p !== toks.length) throw new Error('trailing tokens');
  return e;
}
const FN = { pow: 'power', exp: 'exp', ln: 'ln', abs: 'abs', floor: 'floor', ceil: 'ceiling', ceiling: 'ceiling', sin: 'sin', cos: 'cos', tan: 'tan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', asin: 'arcsin', acos: 'arccos', atan: 'arctan', asinh: 'arcsinh', acosh: 'arccosh', atanh: 'arctanh', min: 'min', max: 'max' };
function toMathML(ast) {
  if (!ast) return '';
  switch (ast.k) {
    case 'num': return `<cn>${ast.v}</cn>`;
    case 'id': return `<ci>${ast.v}</ci>`;
    case 'un': return ast.op === '-' ? `<apply><minus/>${toMathML(ast.e)}</apply>` : toMathML(ast.e);
    case 'bin': {
      const m = { '+': 'plus', '-': 'minus', '*': 'times', '/': 'divide', '^': 'power' }[ast.op];
      return m ? `<apply><${m}/>${toMathML(ast.l)}${toMathML(ast.r)}</apply>` : '<cn>0</cn>';
    }
    case 'call': {
      if (ast.name === 'sqrt') return `<apply><root/>${toMathML(ast.args[0])}</apply>`;
      if (ast.name === 'log10') return `<apply><log/><logbase><cn>10</cn></logbase>${toMathML(ast.args[0])}</apply>`;
      const f = FN[ast.name];
      if (f) return `<apply><${f}/>${ast.args.map(toMathML).join('')}</apply>`;
      return `<apply><ci>${ast.name}</ci>${ast.args.map(toMathML).join('')}</apply>`;
    }
  }
  return '';
}
function infixToMathML(expr) {
  return `<math xmlns="http://www.w3.org/1998/Math/MathML">${toMathML(parseAst(tokenize(expr)))}</math>`;
}

// ═══════════════════════════════════════════════════════════════════════
// Numeric evaluator for equivalence checking
// ═══════════════════════════════════════════════════════════════════════
function evalInfix(s, env) {
  const fns = { pow: Math.pow, sqrt: Math.sqrt, exp: Math.exp, ln: Math.log, log10: Math.log10, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, sin: Math.sin, cos: Math.cos, tan: Math.tan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asin: Math.asin, acos: Math.acos, atan: Math.atan, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh, min: Math.min, max: Math.max };
  const ast = parseAst(tokenize(s));
  function ev(n) {
    switch (n.k) {
      case 'num': return parseFloat(n.v);
      case 'id': return (n.v in env) ? env[n.v] : (n.v === 'pi' ? Math.PI : 1);
      case 'un': return n.op === '-' ? -ev(n.e) : ev(n.e);
      case 'bin': { const l = ev(n.l), r = ev(n.r); return ({ '+': l + r, '-': l - r, '*': l * r, '/': l / r, '^': Math.pow(l, r) })[n.op]; }
      case 'call': { const a = n.args.map(ev); if (fns[n.name]) return fns[n.name](...a); return a[0]; }
    }
    return 0;
  }
  return ev(ast);
}
const KNOWN_FNS = /^(pow|sqrt|exp|ln|log10|abs|floor|ceil|ceiling|sin|cos|tan|sinh|cosh|tanh|asin|acos|atan|asinh|acosh|atanh|min|max|pi|piecewise)$/;
function idsOf(s) { const st = new Set(); for (const t of tokenize(s)) if (t.t === 'id' && !KNOWN_FNS.test(t.v)) st.add(t.v); return [...st]; }
function equiv(orig, rt) {
  const ids = [...new Set([...idsOf(orig), ...idsOf(rt)])];
  for (let t = 0; t < 10; t++) {
    const env = {}; for (const id of ids) env[id] = 0.2 + Math.random() * 2.5;
    let a, b;
    try { a = evalInfix(orig, env); b = evalInfix(rt, env); } catch (e) { return { ok: false, why: e.message }; }
    if (!isFinite(a) || !isFinite(b)) continue;
    if (Math.abs(a - b) > 1e-7 * (1 + Math.abs(a))) return { ok: false, why: `num ${a} vs ${b}` };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════
// Corpus round-trip
// ═══════════════════════════════════════════════════════════════════════
const dir = BIOMODELS_DIR;
if (!fs.existsSync(dir)) {
  console.error(`ERROR: Biomodels directory not found: ${dir}`);
  console.error('Set BIOMODELS_DIR environment variable to the correct path.');
  process.exit(1);
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.xml'));
const mine = files.filter((_, i) => i % NSHARD === SHARD);

let tested = 0, passed = 0, failed = 0, skipped = 0, readerEmpty = 0;
const fails = [];
const started = Date.now();

for (const f of mine) {
  const xml = fs.readFileSync(`${dir}/${f}`, 'utf8');
  const kls = xml.match(/<kineticLaw\b[\s\S]*?<\/kineticLaw>/gi) || [];
  for (const kl of kls) {
    const mm = kl.match(/<math\b[\s\S]*?<\/math>/i);
    if (!mm) continue;
    let infix;
    try { infix = mathMlToFormula(mm[0]); } catch { continue; }
    if (!infix) { readerEmpty++; continue; }
    if (UNSUPPORTED.test(infix) || /[<>]/.test(infix)) { skipped++; continue; }
    tested++;
    let ml2, rt;
    try { ml2 = infixToMathML(infix); } catch (e) { failed++; if (fails.length < 6) fails.push([f, 'toMathML:' + e.message, infix.slice(0, 70)]); continue; }
    try { rt = mathMlToFormula(ml2); } catch (e) { failed++; if (fails.length < 6) fails.push([f, 'reread:' + e.message, infix.slice(0, 70)]); continue; }
    const eq = equiv(infix, rt);
    if (eq.ok) passed++;
    else { failed++; if (fails.length < 6) fails.push([f, eq.why, infix.slice(0, 70) + ' => ' + rt.slice(0, 70)]); }
  }
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
console.log(`shard ${SHARD}/${NSHARD}  dir: ${dir}`);
console.log(`  files=${mine.length} tested=${tested} passed=${passed} failed=${failed} skipped(unsupported-vocab)=${skipped} readerEmpty=${readerEmpty}  time: ${elapsed}s`);
for (const [f, w, ex] of fails) console.log('  FAIL', f, '|', w, '|', ex);

if (failed > 0) process.exit(1);
