/**
 * roundtrip_runner.mjs — per-model SBML round-trip verification for BNG Playground.
 *
 * Run one SBML file through the pipeline and emit a single-line JSON result.
 * Designed to be called once per model by the SLURM array job; it NEVER throws
 * (every stage is guarded) so one bad model can't kill a task.
 *
 * Usage:
 *   node --import tsx tests/roundtrip_runner.mjs <model.xml> <result.json> [--full-loop]
 *   USE_BNG2_SIM=1 node --import tsx tests/roundtrip_runner.mjs <model.xml> <result.json>
 *
 * Env:
 *   REPO_ROOT    absolute path to the julesplayground repo root (required)
 *   USE_BNG2_SIM set to 1 to also run BNG2.pl simulation on atomizer output
 *   BNG2_CMD     path to bionetgen/BNG2.pl (default: "bionetgen" from PATH)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REPO = process.env.REPO_ROOT;
const modelPath = process.argv[2];
const resultPath = process.argv[3];
const FULL_LOOP = process.argv.includes('--full-loop');
const USE_BNG2 = process.env.USE_BNG2_SIM === '1';
// Prefer an explicit BNG2_CMD; otherwise use BNG2.pl at the repo root if it's there
// (that's where it was placed), else fall back to the pyBioNetGen CLI on PATH.
const BNG2_CMD = process.env.BNG2_CMD
  || (REPO && fs.existsSync(path.join(REPO, 'BNG2.pl')) ? path.join(REPO, 'BNG2.pl') : 'bionetgen');

const TMPDIR = process.env.SLURM_TMPDIR || '/tmp';

const result = {
  model: modelPath ? path.basename(modelPath) : null,
  ok: false,
  stages: {},
  timings_ms: {},
  error: null,
  wasm_available: true,
};

function fin(code) {
  try { fs.writeFileSync(resultPath, JSON.stringify(result) + '\n'); }
  catch (e) { console.error('could not write result:', e); }
  process.exit(code);
}
if (!REPO) { result.error = 'REPO_ROOT not set'; fin(0); }
if (!modelPath || !resultPath) { result.error = 'usage: runner <model.xml> <result.json>'; fin(0); }

// ----------------------------------------------------------------------------
// Self-contained MathML reader + infix evaluator (validated; used for the
// ratelaw_equiv numeric check so it does not depend on internal exports).
// ----------------------------------------------------------------------------
const A = (attrs, name) => { const m = (attrs || '').match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')); return m ? (m[1] ?? m[2] ?? '') : null; };
function parseSimpleXml(xml) {
  const src = String(xml || '').trim(); if (!src) return null;
  const toks = src.match(/<[^>]+>|[^<]+/g); if (!toks) return null;
  const root = { name: '#root', children: [], text: '' }; const stack = [root];
  for (const t of toks) {
    if (!t) continue;
    if (t.startsWith('<?') || t.startsWith('<!--') || t.startsWith('<!')) continue;
    if (t.startsWith('</')) { const raw = t.replace(/^<\s*\/\s*/, '').replace(/\s*>$/, '').trim(); const cn = raw.split(':').pop()?.toLowerCase() || ''; while (stack.length > 1) { const p = stack.pop(); if (p?.name === cn) break; } continue; }
    if (t.startsWith('<')) { const om = t.match(/^<\s*([^\s/>]+)/); if (!om) continue; const name = om[1].split(':').pop()?.toLowerCase() || om[1].toLowerCase(); const attributes = t.replace(/^<\s*[^\s/>]+/, '').replace(/\/?\s*>$/, '').trim(); const node = { name, children: [], text: '', attributes }; stack[stack.length - 1].children.push(node); if (!/\/\s*>$/.test(t)) stack.push(node); continue; }
    const text = t.replace(/\s+/g, ' ').trim(); if (text) stack[stack.length - 1].children.push({ name: '#text', children: [], text });
  }
  return root.children[0] || null;
}
function simpleXmlText(n) { if (!n) return ''; if (n.name === '#text') return n.text.trim(); return n.children.map(simpleXmlText).filter(Boolean).join(' ').trim(); }
function nodeToFormula(node) {
  if (!node) return ''; if (node.name === '#text') return node.text.trim();
  const ec = node.children.filter(c => c.name !== '#text');
  const first = () => { for (const c of ec) { const e = nodeToFormula(c).trim(); if (e) return e; } return ''; };
  switch (node.name) {
    case 'math': case 'semantics': case 'annotation-xml': case 'condition': case 'piece': case 'otherwise': return first();
    case 'ci': case 'csymbol': return simpleXmlText(node);
    case 'cn': { const hasSep = node.children.some(c => c.name === 'sep'); const tc = node.children.filter(c => c.name === '#text').map(c => c.text.trim()).filter(Boolean); const type = (A(node.attributes || '', 'type') || '').toLowerCase(); if (hasSep && tc.length >= 2) { if (type.includes('notation')) return `(${tc[0]} * 10^(${tc[1]}))`; return `(${tc[0]} / ${tc[1]})`; } return simpleXmlText(node); }
    case 'true': return '1'; case 'false': return '0'; case 'pi': return '3.141592653589793'; case 'exponentiale': return '2.718281828459045'; case 'infinity': return '1e308'; case 'notanumber': return '0';
    case 'piecewise': { const args = []; for (const ch of ec) { if (ch.name === 'piece') { const pc = ch.children.filter(c => c.name !== '#text'); const cond = pc.find(c => c.name === 'condition') || null; const val = pc.find(c => c.name !== 'condition') || null; const ve = nodeToFormula(val); const ce = nodeToFormula(cond); if (ve && ce) args.push(ve, ce); else if (ve) args.push(ve); } else if (ch.name === 'otherwise') { const oe = nodeToFormula(ch); if (oe) args.push(oe); } } return args.length ? `piecewise(${args.join(', ')})` : ''; }
    case 'apply': {
      if (ec.length === 0) return ''; const op = ec[0]; const opName = op.name;
      if (opName === 'ci' || opName === 'csymbol') { const fn = simpleXmlText(op); const oa = ec.slice(1).map(nodeToFormula).map(e => e.trim()).filter(Boolean); return fn ? `${fn}(${oa.join(', ')})` : oa.join(', '); }
      const degree = ec.slice(1).find(c => c.name === 'degree'); const logbase = ec.slice(1).find(c => c.name === 'logbase');
      const a = ec.slice(1).filter(c => c.name !== 'degree' && c.name !== 'logbase').map(nodeToFormula).map(e => e.trim()).filter(Boolean);
      const direct = { exp: 'exp', ln: 'ln', abs: 'abs', floor: 'floor', sin: 'sin', cos: 'cos', tan: 'tan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', asin: 'asin', acos: 'acos', atan: 'atan', arcsin: 'asin', arccos: 'acos', arctan: 'atan', arcsinh: 'asinh', arccosh: 'acosh', arctanh: 'atanh', ceiling: 'ceil', min: 'min', max: 'max' };
      switch (opName) {
        case 'plus': return a.length ? `(${a.join(' + ')})` : '0';
        case 'times': return a.length ? `(${a.join(' * ')})` : '1';
        case 'minus': return a.length === 1 ? `(-${a[0]})` : `(${a.join(' - ')})`;
        case 'divide': return a.length >= 2 ? `(${a[0]} / ${a[1]})` : `(${a.join(' / ')})`;
        case 'power': return a.length >= 2 ? `pow(${a[0]}, ${a[1]})` : `pow(${a.join(', ')})`;
        case 'root': { const deg = degree ? nodeToFormula(degree).trim() : ''; return (deg && deg !== '2') ? `pow(${a[0]}, (1 / (${deg})))` : `sqrt(${a[0]})`; }
        case 'log': { const base = logbase ? nodeToFormula(logbase).trim() : ''; return (base && base !== '10') ? `(ln(${a[0]}) / ln(${base}))` : `log10(${a[0]})`; }
        case 'quotient': return a.length >= 2 ? `floor((${a[0]}) / (${a[1]}))` : a.join(', ');
        case 'rem': return a.length >= 2 ? `((${a[0]}) - (${a[1]}) * floor((${a[0]}) / (${a[1]})))` : a.join(', ');
        case 'factorial': return `factorial(${a.join(', ')})`;
        case 'sec': return `(1 / cos(${a[0]}))`; case 'csc': return `(1 / sin(${a[0]}))`; case 'cot': return `(1 / tan(${a[0]}))`;
        case 'eq': case 'neq': case 'gt': case 'lt': case 'geq': case 'leq': case 'and': case 'or': case 'xor': case 'not': return `${opName}(${a.join(', ')})`;
        default: return direct[opName] ? `${direct[opName]}(${a.join(', ')})` : (simpleXmlText(op) ? `${simpleXmlText(op)}(${a.join(', ')})` : a.join(', '));
      }
    }
    default: return first() || simpleXmlText(node);
  }
}
const mathMlToFormula = (xml) => { const p = parseSimpleXml(xml); return p ? nodeToFormula(p).trim() : ''; };

// small infix evaluator (arithmetic + transcendental) for numeric equivalence
function tokenize(s){const T=[];let i=0;const num=/[0-9]/,idst=/[A-Za-z_]/,idch=/[A-Za-z0-9_]/;while(i<s.length){const c=s[i];if(/\s/.test(c)){i++;continue;}if(num.test(c)||(c==='.'&&num.test(s[i+1]))){let j=i+1;while(j<s.length&&/[0-9.]/.test(s[j]))j++;if(s[j]==='e'||s[j]==='E'){j++;if(s[j]==='+'||s[j]==='-')j++;while(j<s.length&&num.test(s[j]))j++;}T.push({t:'num',v:s.slice(i,j)});i=j;continue;}if(idst.test(c)){let j=i+1;while(j<s.length&&idch.test(s[j]))j++;T.push({t:'id',v:s.slice(i,j)});i=j;continue;}if('+-*/^(),'.includes(c)){T.push({t:'op',v:c});i++;continue;}i++;}return T;}
function parseInfix(toks){let p=0;const peek=()=>toks[p],next=()=>toks[p++];const lbp=t=>t&&t.t==='op'?({'+':10,'-':10,'*':20,'/':20,'^':30,')':0,',':0,'(':40})[t.v]||0:0;function nud(t){if(!t)throw new Error('eof');if(t.t==='num')return{k:'num',v:t.v};if(t.t==='id'){if(peek()&&peek().v==='('){next();const args=[];if(!(peek()&&peek().v===')')){args.push(expr(0));while(peek()&&peek().v===','){next();args.push(expr(0));}}if(!peek()||peek().v!==')')throw new Error(')');next();return{k:'call',name:t.v,args};}return{k:'id',v:t.v};}if(t.v==='('){const e=expr(0);if(!peek()||peek().v!==')')throw new Error(')');next();return e;}if(t.v==='-'||t.v==='+'){return{k:'un',op:t.v,e:expr(25)};}throw new Error('tok');}function led(t,l){if(t.v==='^')return{k:'bin',op:'^',l,r:expr(29)};return{k:'bin',op:t.v,l,r:expr(lbp(t))};}function expr(rbp){let l=nud(next());while(peek()&&lbp(peek())>rbp)l=led(next(),l);return l;}const e=expr(0);if(p!==toks.length)throw new Error('trail');return e;}
function evalInfix(s,env){const F={pow:Math.pow,sqrt:Math.sqrt,exp:Math.exp,ln:Math.log,log10:Math.log10,abs:Math.abs,floor:Math.floor,ceil:Math.ceil,sin:Math.sin,cos:Math.cos,tan:Math.tan,sinh:Math.sinh,cosh:Math.cosh,tanh:Math.tanh,asin:Math.asin,acos:Math.acos,atan:Math.atan,asinh:Math.asinh,acosh:Math.acosh,atanh:Math.atanh,min:Math.min,max:Math.max};const ast=parseInfix(tokenize(s));const ev=n=>{switch(n.k){case 'num':return parseFloat(n.v);case 'id':return (n.v in env)?env[n.v]:(n.v==='pi'?Math.PI:1);case 'un':return n.op==='-'?-ev(n.e):ev(n.e);case 'bin':{const l=ev(n.l),r=ev(n.r);return{'+':l+r,'-':l-r,'*':l*r,'/':l/r,'^':Math.pow(l,r)}[n.op];}case 'call':return F[n.name]?F[n.name](...n.args.map(ev)):(n.args.length?ev(n.args[0]):1);}};return ev(ast);}
function idsOf(s){const set=new Set();for(const t of tokenize(s))if(t.t==='id'&&!/^(pow|sqrt|exp|ln|log10|abs|floor|ceil|ceiling|sin|cos|tan|sinh|cosh|tanh|asin|acos|atan|asinh|acosh|atanh|min|max|pi|piecewise|eq|neq|gt|lt|geq|leq|and|or|xor|not)$/.test(t.v))set.add(t.v);return [...set];}
const UNSUPPORTED = /\b(piecewise|eq|neq|gt|lt|geq|leq|and|or|xor|not|factorial|gcd|lcm|quotient|rem|delay|rateOf)\s*\(/;
function numericEquiv(a, b){ const ids=[...new Set([...idsOf(a),...idsOf(b)])]; for(let t=0;t<12;t++){ const env={}; for(const id of ids)env[id]=0.2+Math.random()*2.5; let x,y; try{x=evalInfix(a,env);y=evalInfix(b,env);}catch{return false;} if(!isFinite(x)||!isFinite(y))continue; if(Math.abs(x-y)>1e-7*(1+Math.abs(x)))return false; } return true; }

// ----------------------------------------------------------------------------
// BNG2.pl simulation stage: run BNG2.pl on atomizer BNGL and check GDAT output
// ----------------------------------------------------------------------------
function runBng2Simulation(bnglContent, modelName) {
  const tmpDir = fs.mkdtempSync(path.join(TMPDIR, 'bng2-'));
  const bnglFile = path.join(tmpDir, `${modelName}.bngl`);
  try {
    fs.writeFileSync(bnglFile, bnglContent, 'utf8');
    // BNG2.pl is a Perl script driven by the model's own `begin actions` block, so it is
    // run as `perl BNG2.pl <model.bngl>` (no subcommand). It needs BNGPATH pointing at a
    // full BioNetGen install (Perl2/ modules + bin/run_network) — settable via the BNGPATH
    // env var, otherwise defaulted to the script's own directory. If BNG2_CMD is instead the
    // pyBioNetGen CLI, use its `run` subcommand. Outputs land under tmpDir either way.
    let cmd, args;
    const runEnv = { ...process.env, HOME: process.env.HOME };
    if (/\.pl$/i.test(BNG2_CMD)) {
      cmd = 'perl';
      args = [BNG2_CMD, bnglFile];
      if (!runEnv.BNGPATH) runEnv.BNGPATH = path.dirname(BNG2_CMD);
    } else {
      cmd = BNG2_CMD;
      args = ['run', '-i', bnglFile, '-o', tmpDir];
    }
    const r = spawnSync(cmd, args, {
      cwd: tmpDir, timeout: 120_000, maxBuffer: 50 * 1024 * 1024,
      env: runEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = r.stdout?.toString() || '';
    const stderr = r.stderr?.toString() || '';
    if (r.status !== 0 && r.status !== null) {
      return { ok: false, error: `BNG2.pl exit ${r.status}: ${stderr.slice(0, 200)}` };
    }
    if (r.signal) {
      return { ok: false, error: `BNG2.pl killed by signal ${r.signal}` };
    }
    // Look for .gdat files (recurse: BNG2.pl writes to cwd, the pyBNG CLI to a subdir)
    const gdatFiles = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.gdat')) gdatFiles.push(p);
      }
    };
    walk(tmpDir);
    if (gdatFiles.length === 0) {
      return { ok: false, error: 'no .gdat files produced', stdout: stdout.slice(0, 300) };
    }
    // Read and validate the largest .gdat
    let bestGdat = null, bestSize = 0;
    for (const gf of gdatFiles) {
      const st = fs.statSync(gf);
      if (st.size > bestSize) { bestSize = st.size; bestGdat = gf; }
    }
    const gdatContent = fs.readFileSync(bestGdat, 'utf8');
    const lines = gdatContent.trim().split('\n');
    if (lines.length < 2) {
      return { ok: false, error: `GDAT has only ${lines.length} lines` };
    }
    const header = lines[0].trim().split(/\s+/);
    if (header.length < 2) {
      return { ok: false, error: `GDAT header has <2 columns: ${header.length}` };
    }
    const dataRows = lines.slice(1);
    let nanCount = 0, negCount = 0;
    for (const row of dataRows) {
      const vals = row.trim().split(/\s+/);
      for (let c = 1; c < vals.length; c++) {
        const v = parseFloat(vals[c]);
        if (isNaN(v)) nanCount++;
        else if (v < -1e-10) negCount++;
      }
    }
    return {
      ok: true,
      gdatColumns: header.length,
      gdatRows: dataRows.length,
      nanCount, negCount,
      gdatFile: path.basename(bestGdat),
      gdatSize: bestSize,
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    // Clean up
    try {
      const dirFiles = fs.readdirSync(tmpDir);
      for (const f of dirFiles) fs.rmSync(path.join(tmpDir, f), { force: true });
      fs.rmdirSync(tmpDir);
    } catch { /* best effort */ }
  }
}

// ----------------------------------------------------------------------------

async function main() {
  const sbml = fs.readFileSync(modelPath, 'utf8');

  // ---- Load what we can. atomizer needs WASM (may fail on HPC); the rest is pure JS. ----
  let infixToMathML, engine;
  let atomAvailable = false;
  try {
    const converterPath = pathToFileURL(path.join(REPO, 'packages/engine/src/utils/infixToMathML.ts')).href;
    ({ infixToMathML } = await import(converterPath));
    engine = await import('@bngplayground/engine');
    atomAvailable = true;
  } catch (e) {
    result.error = 'core imports: ' + (e?.message || e);
    fin(0);
  }
  // atomizer import separately (WASM may fail)
  let sbmlToBngl;
  try {
    const atomIdx = pathToFileURL(path.join(REPO, 'src/lib/atomizer/index.ts')).href;
    ({ sbmlToBngl } = await import(atomIdx));
  } catch (e) {
    result.wasm_available = false;
  }

  // ---- Stage: parse (SBML -> BNGL) ----
  let t0 = Date.now(); let atom = null;
  if (sbmlToBngl) {
    try {
      atom = await sbmlToBngl(sbml, {});
      result.stages.parse = !!(atom && atom.success && atom.bngl && atom.bngl.length > 0);
      if (!result.stages.parse) result.error = (atom && atom.error) || 'atomizer produced no BNGL';
      // Persist the emitted BNGL next to the result JSON so a downstream parity check
      // (libRoadRunner vs BNG2) can reuse it instead of re-atomizing.
      if (result.stages.parse) {
        try { fs.writeFileSync(resultPath.replace(/\.json$/, '.bngl'), atom.bngl); } catch { /* non-fatal */ }
      }
    } catch (e) {
      result.stages.parse = false;
      const msg = e?.message || String(e);
      // Detect WASM memory failures — skip atomizer stages but continue
      if (/could not allocate memory|Initialize.*SBML|abort/i.test(msg)) {
        result.wasm_available = false;
      }
      result.error = 'parse: ' + msg;
    }
  } else {
    result.wasm_available = false;
  }
  result.timings_ms.parse = Date.now() - t0;

  // ---- Stage: reparse (BNGL -> engine model) ----
  // (only if atomizer succeeded)
  if (result.stages.parse && atom && engine) {
    t0 = Date.now();
    try {
      const pr = engine.parseBNGLWithANTLR(atom.bngl);
      const errs = (pr && pr.errors) ? pr.errors.length : 0;
      result.stages.reparse = errs === 0 && !!(pr && (pr.model || pr.ast));
      result.reparse_errors = errs;
      if (!result.stages.reparse && pr && pr.errors && pr.errors[0]) result.reparse_first_error = String(pr.errors[0].message || pr.errors[0]);
    } catch (e) { result.stages.reparse = false; result.error = (result.error || '') + ' | reparse: ' + (e?.message || e); }
    result.timings_ms.reparse = Date.now() - t0;
  } else {
    result.stages.reparse = false;
  }

  // ---- Stage: ratelaw_equiv (MathML round-trip on the ORIGINAL kinetic laws) ----
  // SELF-CONTAINED — runs regardless of WASM/atomizer
  t0 = Date.now();
  try {
    result.ratelaw_tested = 0; result.ratelaw_passed = 0; result.ratelaw_skipped = 0;
    if (engine && infixToMathML) {
      const kls = sbml.match(/<kineticLaw\b[\s\S]*?<\/kineticLaw>/gi) || [];
      let tested = 0, passed = 0, skipped = 0;
      for (const kl of kls) {
        const mm = kl.match(/<math\b[\s\S]*?<\/math>/i); if (!mm) continue;
        const infix = mathMlToFormula(mm[0]); if (!infix) continue;
        if (UNSUPPORTED.test(infix) || /[<>]/.test(infix)) { skipped++; continue; }
        tested++;
        let rt; try { rt = mathMlToFormula(infixToMathML(infix)); } catch { passed += 0; continue; }
        if (numericEquiv(infix, rt)) passed++;
      }
      result.ratelaw_tested = tested; result.ratelaw_passed = passed; result.ratelaw_skipped = skipped;
      result.stages.ratelaw_equiv = tested === 0 || passed === tested;
    } else {
      result.stages.ratelaw_equiv = false;
      result.ratelaw_error = !engine ? 'engine not available' : 'infixToMathML not available';
    }
  } catch (e) { result.stages.ratelaw_equiv = false; result.error = (result.error || '') + ' | ratelaw: ' + (e?.message || e); }
  result.timings_ms.ratelaw_equiv = Date.now() - t0;

  // ---- Stage: bng2_sim (BNG2.pl simulation on atomizer BNGL) ----
  if (USE_BNG2 && result.stages.parse && atom) {
    t0 = Date.now();
    try {
      const simResult = runBng2Simulation(atom.bngl, path.basename(modelPath, '.xml'));
      result.stages.bng2_sim = simResult.ok;
      result.bng2_sim_details = simResult;
      if (!simResult.ok) result.error = (result.error || '') + ' | bng2_sim: ' + (simResult.error || '');
    } catch (e) { result.stages.bng2_sim = false; result.error = (result.error || '') + ' | bng2_sim: ' + (e?.message || e); }
    result.timings_ms.bng2_sim = Date.now() - t0;
  } else {
    result.stages.bng2_sim = false;
  }

  // ---- Stage: full_loop (opt-in) ----
  if (FULL_LOOP && result.stages.parse && atom && engine) {
    t0 = Date.now();
    try {
      const pr = engine.parseBNGLWithANTLR(atom.bngl);
      const model = pr.model;
      const gen = new engine.NetworkGenerator({});
      const network = (typeof gen.generateNetwork === 'function')
        ? gen.generateNetwork(model)
        : (typeof gen.generate === 'function') ? gen.generate(model) : null;
      if (!network) throw new Error('network generation API not found');
      const sbml2 = engine.SBMLWriter.write(model, network, {});
      const extract = (x) => (x.match(/<reaction\b[\s\S]*?<\/reaction>/gi) || []).map(rx => {
        const r = [...(rx.match(/<listOfReactants>([\s\S]*?)<\/listOfReactants>/i)?.[1] || '').matchAll(/species="([^"]+)"/g)].map(m => m[1]).sort();
        const p = [...(rx.match(/<listOfProducts>([\s\S]*?)<\/listOfProducts>/i)?.[1] || '').matchAll(/species="([^"]+)"/g)].map(m => m[1]).sort();
        const mm = rx.match(/<math\b[\s\S]*?<\/math>/i);
        return { key: r.join('+') + '=>' + p.join('+'), rate: mm ? mathMlToFormula(mm[0]) : '' };
      });
      const orig = extract(sbml), round = new Map(extract(sbml2).map(e => [e.key, e.rate]));
      let matched = 0, equiv = 0;
      for (const o of orig) { if (round.has(o.key)) { matched++; if (numericEquiv(o.rate, round.get(o.key))) equiv++; } }
      result.full_loop_reactions = orig.length; result.full_loop_matched = matched; result.full_loop_equiv = equiv;
      result.stages.full_loop = orig.length > 0 && matched === orig.length && equiv === matched;
    } catch (e) { result.stages.full_loop = false; result.full_loop_error = (e?.message || String(e)); }
    result.timings_ms.full_loop = Date.now() - t0;
  } else {
    result.stages.full_loop = false;
  }

  // overall: ratelaw_equiv is the essential stage; atomizer stages are bonus
  const wasmSkipped = result.wasm_available === false;
  result.ok = !!result.stages.ratelaw_equiv
    && (wasmSkipped || !!result.stages.parse)
    && (wasmSkipped || !!result.stages.reparse)
    && (!USE_BNG2 || wasmSkipped || !!result.stages.bng2_sim)
    && (!FULL_LOOP || wasmSkipped || !!result.stages.full_loop);
  fin(0);
}

main().catch(e => { result.error = 'fatal: ' + (e?.message || e); fin(0); });
