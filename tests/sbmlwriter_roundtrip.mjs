import { infixToMathML, mathMlToFormula, evalInfix, idsOf } from '/tmp/exprlib.mjs';
const toSBMLId=n=>n.replace(/[^A-Za-z0-9_]/g,'_').replace(/^([0-9])/,'_$1');
const infixToContentMathML=e=>infixToMathML(e).replace(/^<math[^>]*>/,'').replace(/<\/math>$/,'');
function exprToMathML(e){try{const b=infixToContentMathML(e);return b&&b.length?b:null;}catch{return null;}}

// ---- faithful transcription of the FIXED generateReactions (network path) + write skeleton ----
function writeSBML(model, network){
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const speciesList=network?network.species:(model.species||[]);
  const comp=model.compartments?.[0]?.name||'default';
  const speciesXml=speciesList.map(s=>`      <species id="${toSBMLId(s.name)}" name="${esc(s.name)}" compartment="${comp}" initialConcentration="${s.initialConcentration||0}" hasOnlySubstanceUnits="false" boundaryCondition="false" constant="false"/>`).join('\n');
  const paramsXml=Object.entries(model.parameters||{}).map(([n,v])=>`      <parameter id="${toSBMLId(n)}" name="${esc(n)}" value="${v}" constant="true"/>`).join('\n');
  const rxnXml=network.reactions.map((r,i)=>{
    const id=`R${i+1}`;
    const reactants=r.reactants.map(n=>`          <speciesReference species="${toSBMLId(n)}" stoichiometry="1" constant="true"/>`).join('\n');
    const products=r.products.map(n=>`          <speciesReference species="${toSBMLId(n)}" stoichiometry="1" constant="true"/>`).join('\n');
    const functional=r.isFunctionalRate&&r.rateExpression&&r.rateExpression.trim().length>0;
    const rateToken=(r.rate!==undefined&&r.rate!==null&&String(r.rate).trim().length>0)?String(r.rate).trim():String(r.rateConstant??0);
    const rNames=r.reactants.map(toSBMLId);
    const massActionExpr=[rateToken,...rNames].join(' * ');
    let mathBody=null;
    if(functional)mathBody=exprToMathML(r.rateExpression.trim());
    if(mathBody===null)mathBody=exprToMathML(massActionExpr);
    if(mathBody===null)mathBody=`<cn>${String(r.rateConstant??0)}</cn>`;
    return `      <reaction id="${id}" reversible="false" fast="false">
        <listOfReactants>
${reactants}
        </listOfReactants>
        <listOfProducts>
${products}
        </listOfProducts>
        <kineticLaw>
          <math xmlns="http://www.w3.org/1998/Math/MathML">
            ${mathBody}
          </math>
        </kineticLaw>
      </reaction>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level3/version2/core" level="3" version="2">
  <model id="m" name="m">
    <listOfCompartments><compartment id="${comp}" size="1" constant="true"/></listOfCompartments>
    <listOfSpecies>
${speciesXml}
    </listOfSpecies>
    <listOfParameters>
${paramsXml}
    </listOfParameters>
    <listOfReactions>
${rxnXml}
    </listOfReactions>
  </model>
</sbml>`;
}

// ---- re-extract reactions from emitted SBML ----
function extract(xml){
  const rxns=[...xml.matchAll(/<reaction\b[\s\S]*?<\/reaction>/gi)].map(m=>m[0]);
  return rxns.map(rx=>{
    const reactants=[...(rx.match(/<listOfReactants>([\s\S]*?)<\/listOfReactants>/i)?.[1]||'').matchAll(/species="([^"]+)"/g)].map(m=>m[1]);
    const products=[...(rx.match(/<listOfProducts>([\s\S]*?)<\/listOfProducts>/i)?.[1]||'').matchAll(/species="([^"]+)"/g)].map(m=>m[1]);
    const mm=rx.match(/<math\b[\s\S]*?<\/math>/i);
    const rate=mm?mathMlToFormula(mm[0]):'';
    return {reactants,products,rate};
  });
}
const ms=a=>a.slice().sort().join('+');
function equiv(a,b,extraIds=[]){const ids=[...new Set([...idsOf(a),...idsOf(b),...extraIds])];for(let t=0;t<12;t++){const env={};for(const id of ids)env[id]=0.2+Math.random()*2.5;let x,y;try{x=evalInfix(a,env);y=evalInfix(b,env);}catch(e){return {ok:false,why:e.message};}if(!isFinite(x)||!isFinite(y))continue;if(Math.abs(x-y)>1e-7*(1+Math.abs(x)))return {ok:false,why:`${x} vs ${y}`};}return {ok:true};}

let P=0,F=0;const chk=(n,c,g)=>{c?P++:(F++,console.log('FAIL '+n+(g?'  '+g:'')));};

const model={parameters:{k1:0.5,k:2,kd:0.3,vmax:4,Kd:1.5,n:2,ksyn:0.7},compartments:[{name:'cell'}]};
// networks
const N=(species,reactions)=>({species:species.map(n=>({name:n,initialConcentration:1})),reactions});
// 1 bimolecular
let net=N(['A','B','C'],[{reactants:['A','B'],products:['C'],rate:'k1',rateConstant:0.5}]);
let out=writeSBML(model,net); let ex=extract(out);
chk('bimolecular reactants', ms(ex[0].reactants)==='A+B', ex[0].reactants.join(','));
chk('bimolecular product', ms(ex[0].products)==='C');
chk('bimolecular rate = k1*A*B', equiv(ex[0].rate,'k1*A*B').ok, ex[0].rate);
// 2 repeated reactant 2A->C
net=N(['A','C'],[{reactants:['A','A'],products:['C'],rate:'k',rateConstant:2}]);
ex=extract(writeSBML(model,net));
chk('2A reactants both present', ex[0].reactants.length===2 && ms(ex[0].reactants)==='A+A');
chk('2A rate = k*A*A', equiv(ex[0].rate,'k*A*A').ok, ex[0].rate);
// 3 synthesis ∅->P
net=N(['P'],[{reactants:[],products:['P'],rate:'ksyn',rateConstant:0.7}]);
ex=extract(writeSBML(model,net));
chk('synthesis no reactants', ex[0].reactants.length===0);
chk('synthesis rate = ksyn', equiv(ex[0].rate,'ksyn').ok, ex[0].rate);
// 4 degradation P->∅
net=N(['P'],[{reactants:['P'],products:[],rate:'kd',rateConstant:0.3}]);
ex=extract(writeSBML(model,net));
chk('degradation rate = kd*P', equiv(ex[0].rate,'kd*P').ok, ex[0].rate);
// 5 FUNCTIONAL Hill rate (the bug this fixes)
const hill='vmax*pow(S,n)/(pow(Kd,n)+pow(S,n))';
net=N(['S','P'],[{reactants:['S'],products:['P'],rate:'',rateConstant:0,isFunctionalRate:true,rateExpression:hill}]);
ex=extract(writeSBML(model,net));
chk('functional rate preserved (NOT mass-action)', equiv(ex[0].rate,hill,['S','n','Kd','vmax']).ok, ex[0].rate);
chk('functional NOT re-multiplied by S', !equiv(ex[0].rate,hill+' * S',['S','n','Kd','vmax']).ok, 'was double-multiplied');
// 6 zero rate constant (falsy bug): mass action with rate token "0"
net=N(['A'],[{reactants:['A'],products:[],rate:'0',rateConstant:0}]);
ex=extract(writeSBML(model,net));
chk('zero-rate stays 0*A (=0), not fallthrough', equiv(ex[0].rate,'0*A').ok, ex[0].rate);

console.log(`\nSBMLWriter roundtrip: ${P} passed, ${F} failed`);
