import { mathMlToFormula } from '/tmp/reader.mjs';

// ---------- infix tokenizer ----------
function tokenize(s){
  const toks=[]; let i=0;
  const num=/[0-9]/, idst=/[A-Za-z_]/, idch=/[A-Za-z0-9_]/;
  while(i<s.length){
    const c=s[i];
    if(/\s/.test(c)){i++;continue;}
    if(num.test(c)||(c==='.'&&num.test(s[i+1]))){
      let j=i+1; while(j<s.length&&/[0-9.]/.test(s[j]))j++;
      if(s[j]==='e'||s[j]==='E'){j++; if(s[j]==='+'||s[j]==='-')j++; while(j<s.length&&num.test(s[j]))j++;}
      toks.push({t:'num',v:s.slice(i,j)}); i=j; continue;
    }
    if(idst.test(c)){let j=i+1;while(j<s.length&&idch.test(s[j]))j++;toks.push({t:'id',v:s.slice(i,j)});i=j;continue;}
    if('+-*/^(),'.includes(c)){toks.push({t:'op',v:c});i++;continue;}
    // unknown char: skip (shouldn't happen for our expressions)
    i++;
  }
  return toks;
}
// ---------- Pratt parser -> AST ----------
function parse(toks){
  let p=0;
  const peek=()=>toks[p], next=()=>toks[p++];
  function parseExpr(rbp=0){
    let left=nud(next());
    while(peek()&&lbp(peek())>rbp){ left=led(next(),left); }
    return left;
  }
  function lbp(tok){ if(tok.t!=='op')return 0; return {'+':10,'-':10,'*':20,'/':20,'^':30,')':0,',':0,'(':40}[tok.v]||0; }
  function nud(tok){
    if(!tok) throw new Error('unexpected end');
    if(tok.t==='num')return {k:'num',v:tok.v};
    if(tok.t==='id'){
      if(peek()&&peek().t==='op'&&peek().v==='('){ next(); const args=[]; if(!(peek()&&peek().v===')')){args.push(parseExpr(0)); while(peek()&&peek().v===','){next();args.push(parseExpr(0));}} if(!peek()||peek().v!==')')throw new Error('missing )'); next(); return {k:'call',name:tok.v,args}; }
      return {k:'id',v:tok.v};
    }
    if(tok.t==='op'&&tok.v==='('){ const e=parseExpr(0); if(!peek()||peek().v!==')')throw new Error('missing )'); next(); return e; }
    if(tok.t==='op'&&(tok.v==='-'||tok.v==='+')){ const e=parseExpr(25); return {k:'unary',op:tok.v,e}; }
    throw new Error('unexpected token '+JSON.stringify(tok));
  }
  function led(tok,left){
    if(tok.v==='^'){ const right=parseExpr(30-1); return {k:'bin',op:'^',l:left,r:right}; } // right-assoc
    const right=parseExpr(lbp(tok)); return {k:'bin',op:tok.v,l:left,r:right};
  }
  const e=parseExpr(0); if(p!==toks.length)throw new Error('trailing tokens'); return e;
}
// ---------- AST -> MathML ----------
const FUNC={pow:'power',sqrt:'root',exp:'exp',ln:'ln',log10:'log',abs:'abs',floor:'floor',ceil:'ceiling',ceiling:'ceiling',
  sin:'sin',cos:'cos',tan:'tan',sinh:'sinh',cosh:'cosh',tanh:'tanh',asin:'arcsin',acos:'arccos',atan:'arctan',
  asinh:'arcsinh',acosh:'arccosh',atanh:'arctanh',min:'min',max:'max',piecewise:'piecewise'};
function toMathML(ast){
  switch(ast.k){
    case 'num':return `<cn>${ast.v}</cn>`;
    case 'id':return `<ci>${ast.v}</ci>`;
    case 'unary':return ast.op==='-'?`<apply><minus/>${toMathML(ast.e)}</apply>`:toMathML(ast.e);
    case 'bin':{const opm={'+':'plus','-':'minus','*':'times','/':'divide','^':'power'}[ast.op];return `<apply><${opm}/>${toMathML(ast.l)}${toMathML(ast.r)}</apply>`;}
    case 'call':{
      const f=ast.name;
      if(f==='sqrt')return `<apply><root/>${toMathML(ast.args[0])}</apply>`;
      if(f==='log10')return `<apply><log/><logbase><cn>10</cn></logbase>${toMathML(ast.args[0])}</apply>`;
      if(FUNC[f])return `<apply><${FUNC[f]}/>${ast.args.map(toMathML).join('')}</apply>`;
      // unknown -> SBML function-definition call: <apply><ci>f</ci>args</apply>
      return `<apply><ci>${f}</ci>${ast.args.map(toMathML).join('')}</apply>`;
    }
  }
}
function infixToMathML(s){return `<math xmlns="http://www.w3.org/1998/Math/MathML">${toMathML(parse(tokenize(s)))}</math>`;}

// ---------- mini evaluator for the reader's output vocabulary ----------
function evalInfix(s, env){
  const fns={pow:Math.pow,sqrt:Math.sqrt,exp:Math.exp,ln:Math.log,log10:Math.log10,abs:Math.abs,floor:Math.floor,ceil:Math.ceil,
    sin:Math.sin,cos:Math.cos,tan:Math.tan,sinh:Math.sinh,cosh:Math.cosh,tanh:Math.tanh,asin:Math.asin,acos:Math.acos,atan:Math.atan,
    asinh:Math.asinh,acosh:Math.acosh,atanh:Math.atanh,min:Math.min,max:Math.max};
  const ast=parse(tokenize(s));
  function ev(n){switch(n.k){
    case 'num':return parseFloat(n.v);
    case 'id':return (n.v in env)?env[n.v]:(n.v==='pi'?Math.PI:1);
    case 'unary':return n.op==='-'?-ev(n.e):ev(n.e);
    case 'bin':{const l=ev(n.l),r=ev(n.r);return {'+':l+r,'-':l-r,'*':l*r,'/':l/r,'^':Math.pow(l,r)}[n.op];}
    case 'call':{const a=n.args.map(ev);if(fns[n.name])return fns[n.name](...a);if(n.name==='log10')return Math.log10(a[0]); return a[0];}
  }}
  return ev(ast);
}
function idsOf(s){const set=new Set();for(const t of tokenize(s))if(t.t==='id'&&!/^(pow|sqrt|exp|ln|log10|abs|floor|ceil|ceiling|sin|cos|tan|sinh|cosh|tanh|asin|acos|atan|asinh|acosh|atanh|min|max|pi|piecewise)$/.test(t.v))set.add(t.v);return [...set];}
function equiv(orig, rt){
  const ids=[...new Set([...idsOf(orig),...idsOf(rt)])];
  for(let trial=0;trial<12;trial++){
    const env={}; for(const id of ids)env[id]=0.1+Math.random()*3;
    let a,b; try{a=evalInfix(orig,env);}catch(e){return {ok:false,why:'orig eval: '+e.message};}
    try{b=evalInfix(rt,env);}catch(e){return {ok:false,why:'rt eval: '+e.message};}
    if(!isFinite(a)||!isFinite(b))continue;
    if(Math.abs(a-b)>1e-9*(1+Math.abs(a)))return {ok:false,why:`mismatch ${a} vs ${b}`};
  }
  return {ok:true};
}

// ---------- battery ----------
const cases=[
  'k * A * B','k1*S/(Km+S)','vmax*S/(Km+S)','k*A*A','kf*A - kr*B','a + b + c + d',
  '((a-b)-c)-d','k*pow(S,2)/(K+pow(S,n))','2^n','a/b/c','a-(b-c)','-k*x','k*exp(-E/(R*T))',
  'V*pow(S,h)/(pow(Kd,h)+pow(S,h))','sqrt(a*a+b*b)','log10(x)+ln(y)','min(a,b)+max(c,d)',
  'k*(1 - A/Amax)','compartment*k*A*B'
];
let P=0,F=0;const fails=[];
for(const c of cases){
  let ml,rt;
  try{ml=infixToMathML(c);}catch(e){F++;fails.push([c,'toMathML: '+e.message]);continue;}
  try{rt=mathMlToFormula(ml);}catch(e){F++;fails.push([c,'reader: '+e.message]);continue;}
  const eq=equiv(c,rt);
  if(eq.ok)P++;else{F++;fails.push([c,eq.why+'  rt='+rt]);}
}
console.log(`synthetic: ${P} passed, ${F} failed`);
for(const [c,w] of fails)console.log('  FAIL',JSON.stringify(c),'->',w);
// export for reuse
globalThis.__expr={infixToMathML,mathMlToFormula,equiv,tokenize,idsOf};
