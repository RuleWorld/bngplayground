/**
 * mathml_corpus_stress.mjs
 *
 * Self-contained MathML→infix reader stress test over the BioModels corpus.
 * Extracts every <math> block, converts to infix, and checks:
 *   - no crashes
 *   - no empty output when input had content
 *   - balanced parentheses
 *
 * Usage (local):
 *   node tests/mathml_corpus_stress.mjs                          # single-threaded, all models
 *   node tests/mathml_corpus_stress.mjs 0 4                      # shard 0 of 4
 *   BIOMODELS_DIR=/path/to/models node tests/mathml_corpus_stress.mjs
 *
 * Usage (Slurm array):
 *   see slurm/mathml_corpus_stress.sh
 */
import fs from 'fs';

// ── Config ──────────────────────────────────────────────────────────
const BIOMODELS_DIR = process.env.BIOMODELS_DIR
  || '';
const SHARD = parseInt(process.argv[2] || process.env.SLURM_ARRAY_TASK_ID || '0', 10);
const NSHARD = parseInt(process.argv[3] || process.env.NSHARD || '1', 10);
const MAX_MATH_LEN = 300_000;

// ── Faithful transcription of the parser's MathML reader ────────────
function getXmlAttribute(tagAttributes, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = (tagAttributes || '').match(new RegExp(`${esc}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? ((m[1] ?? m[2] ?? '').trim()) : null;
}

function sanitize(formula) {
  let s = String(formula || '').trim();
  if (!s) return '';
  s = s.replace(/^\s*=\s*/, '').trim();
  if (!s) return '';
  if (/^[=(){}[\],;\s]+$/.test(s)) return '';
  return s;
}

function parseSimpleXml(xml) {
  const source = String(xml || '').trim();
  if (!source) return null;
  const tokens = source.match(/<[^>]+>|[^<]+/g);
  if (!tokens) return null;
  const root = { name: '#root', children: [], text: '' };
  const stack = [root];
  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith('<?') || token.startsWith('<!--') || token.startsWith('<!')) continue;
    if (token.startsWith('</')) {
      const raw = token.replace(/^<\s*\/\s*/, '').replace(/\s*>$/, '').trim();
      const cn = raw.split(':').pop()?.toLowerCase() || '';
      while (stack.length > 1) {
        const p = stack.pop();
        if (p?.name === cn) break;
      }
      continue;
    }
    if (token.startsWith('<')) {
      const om = token.match(/^<\s*([^\s/>]+)/);
      if (!om) continue;
      const rawName = om[1];
      const name = rawName.split(':').pop()?.toLowerCase() || rawName.toLowerCase();
      const attributes = token.replace(/^<\s*[^\s/>]+/, '').replace(/\/?\s*>$/, '').trim();
      const node = { name, children: [], text: '', attributes };
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

function simpleXmlText(node) {
  if (!node) return '';
  if (node.name === '#text') return node.text.trim();
  const parts = [];
  for (const c of node.children) { const t = simpleXmlText(c); if (t) parts.push(t); }
  return parts.join(' ').trim();
}

function nodeToFormula(node) {
  if (!node) return '';
  if (node.name === '#text') return node.text.trim();
  const ec = node.children.filter(c => c.name !== '#text');
  const firstChildExpr = () => {
    for (const c of ec) { const e = nodeToFormula(c).trim(); if (e) return e; }
    return '';
  };
  switch (node.name) {
    case 'math': case 'semantics': case 'annotation-xml': case 'condition': case 'piece': case 'otherwise':
      return firstChildExpr();
    case 'ci': case 'csymbol': return simpleXmlText(node);
    case 'cn': {
      const hasSep = node.children.some(c => c.name === 'sep');
      const tc = node.children.filter(c => c.name === '#text').map(c => c.text.trim()).filter(Boolean);
      const type = (getXmlAttribute(node.attributes || '', 'type') || '').toLowerCase();
      if (hasSep && tc.length >= 2) {
        if (type === 'e-notation' || type === 'enotation') return `(${tc[0]} * 10^(${tc[1]}))`;
        return `(${tc[0]} / ${tc[1]})`;
      }
      return simpleXmlText(node);
    }
    case 'true': return '1';
    case 'false': return '0';
    case 'pi': return '3.141592653589793';
    case 'exponentiale': return '2.718281828459045';
    case 'infinity': return '1e308';
    case 'notanumber': return '0';
    case 'piecewise': {
      const args = [];
      for (const child of ec) {
        if (child.name === 'piece') {
          const pc = child.children.filter(c => c.name !== '#text');
          const cond = pc.find(c => c.name === 'condition') || null;
          const val = pc.find(c => c.name !== 'condition') || null;
          const ve = nodeToFormula(val);
          const ce = nodeToFormula(cond);
          if (ve && ce) args.push(ve, ce);
          else if (ve) args.push(ve);
        } else if (child.name === 'otherwise') {
          const oe = nodeToFormula(child);
          if (oe) args.push(oe);
        }
      }
      if (args.length === 0) return '';
      return `piecewise(${args.join(', ')})`;
    }
    case 'apply': {
      if (ec.length === 0) return '';
      const opNode = ec[0];
      const opName = opNode.name;
      if (opName === 'ci' || opName === 'csymbol') {
        const fn = simpleXmlText(opNode);
        const oa = ec.slice(1).map(c => nodeToFormula(c)).map(e => e.trim()).filter(Boolean);
        return fn ? `${fn}(${oa.join(', ')})` : oa.join(', ');
      }
      const degreeNode = ec.slice(1).find(c => c.name === 'degree') || null;
      const logbaseNode = ec.slice(1).find(c => c.name === 'logbase') || null;
      const a = ec.slice(1).filter(c => c.name !== 'degree' && c.name !== 'logbase')
        .map(c => nodeToFormula(c)).map(e => e.trim()).filter(Boolean);
      const direct = {
        exp: 'exp', ln: 'ln', abs: 'abs', floor: 'floor',
        sin: 'sin', cos: 'cos', tan: 'tan',
        sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
        asin: 'asin', acos: 'acos', atan: 'atan',
        arcsin: 'asin', arccos: 'acos', arctan: 'atan',
        arcsinh: 'asinh', arccosh: 'acosh', arctanh: 'atanh',
        ceiling: 'ceil', min: 'min', max: 'max',
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

function mathMlToFormula(x) {
  const p = parseSimpleXml(x);
  if (!p) return '';
  return sanitize(nodeToFormula(p));
}

// ── Run corpus ──────────────────────────────────────────────────────
const dir = BIOMODELS_DIR;
if (!fs.existsSync(dir)) {
  console.error(`ERROR: Biomodels directory not found: ${dir}`);
  console.error('Set BIOMODELS_DIR environment variable to the correct path.');
  process.exit(1);
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.xml'));
const mine = files.filter((_, i) => i % NSHARD === SHARD);

let total = 0, empty = 0, unbal = 0, crash = 0, skipped = 0;
const balOK = s => {
  let d = 0;
  for (const c of s) {
    if (c === '(') d++;
    else if (c === ')') { d--; if (d < 0) return false; }
  }
  return d === 0;
};
const emptyExamples = [], unbalExamples = [];

const started = Date.now();
for (const f of mine) {
  const xml = fs.readFileSync(`${dir}/${f}`, 'utf8');
  const maths = xml.match(/<math\b[\s\S]*?<\/math>/gi) || [];
  for (const m of maths) {
    total++;
    if (m.length > MAX_MATH_LEN) { skipped++; continue; }
    let out = '';
    try { out = mathMlToFormula(m); } catch (e) { crash++; continue; }
    const hadContent = /<(ci|cn|apply|piecewise|true|false|pi|exponentiale)\b/i.test(m);
    if (!out && hadContent) { empty++; if (emptyExamples.length < 3) emptyExamples.push(f); continue; }
    if (out && !balOK(out)) { unbal++; if (unbalExamples.length < 3) unbalExamples.push({ f, out: out.slice(0, 80) }); }
  }
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
console.log(`shard ${SHARD}/${NSHARD}  dir: ${dir}`);
console.log(`  models: ${mine.length}   <math> blocks: ${total}   time: ${elapsed}s`);
console.log(`  crashes:            ${crash}`);
console.log(`  empty-on-content:   ${empty}${emptyExamples.length ? '  e.g. ' + emptyExamples.join(', ') : ''}`);
console.log(`  skipped(>300KB):    ${skipped}`);
console.log(`  unbalanced parens:  ${unbal}${unbalExamples.length ? '  e.g. ' + JSON.stringify(unbalExamples) : ''}`);

// Exit with non-zero if any real failures
if (crash > 0 || empty > 0 || unbal > 0) process.exit(1);
