import { SBMLWriter } from '/home/claude/build/engine/src/services/export/SBMLWriter.ts';
// @ts-ignore
import { mathMlToFormula, evalInfix } from '/tmp/exprlib.mjs';
const model: any = { name:'m', parameters:{k1:0.5,k:2,kd:0.3,ksyn:0.7,Vmax:4,Km:1.5}, compartments:[{name:'cell',size:1}] };
const N=(sp:string[],rx:any[])=>({species:sp.map(n=>({name:n,initialConcentration:1})),reactions:rx,observableExpressions:new Map(),parameterValues:new Map()});
function equiv(a:string,b:string,ids:string[]){for(let t=0;t<12;t++){const e:any={};for(const id of ids)e[id]=0.2+Math.random()*2.5;let x:number,y:number;try{x=evalInfix(a,e);y=evalInfix(b,e);}catch{return false;}if(!isFinite(x)||!isFinite(y))continue;if(Math.abs(x-y)>1e-7*(1+Math.abs(x)))return false;}return true;}
const rate=(xml:string)=>{const kl=xml.match(/<kineticLaw>[\s\S]*?<\/kineticLaw>/)![0];return mathMlToFormula(kl.match(/<math[\s\S]*?<\/math>/)![0]);};
let P=0,F=0;const chk=(n:string,c:boolean,g?:string)=>{c?P++:(F++,console.log('FAIL '+n+(g?'  '+g:'')));};

// realistic functional reaction: rate holds the expression (as NetParser sets it)
const hill='Vmax*S/(Km+S)';
let r=rate(SBMLWriter.write(model, N(['S','P'],[{reactants:['S'],products:['P'],rate:hill,rateConstant:0,isFunctionalRate:true,rateExpression:hill}]),{}));
chk('functional: rateLaw * reactant (engine-consistent)', equiv(r, `(${hill})*S`, ['Vmax','S','Km']), r);
// mass action
r=rate(SBMLWriter.write(model, N(['A','B','C'],[{reactants:['A','B'],products:['C'],rate:'k1',rateConstant:0.5}]),{}));
chk('mass action k1*A*B', equiv(r,'k1*A*B',['k1','A','B']), r);
// difference rate law must be parenthesized before *reactants
r=rate(SBMLWriter.write(model, N(['A'],[{reactants:['A'],products:[],rate:'k - kd',rateConstant:0,isFunctionalRate:true,rateExpression:'k - kd'}]),{}));
chk('difference rate parenthesized: (k-kd)*A', equiv(r,'(k - kd)*A',['k','kd','A']), r);
// zero-rate mass action
r=rate(SBMLWriter.write(model, N(['A'],[{reactants:['A'],products:[],rate:'0',rateConstant:0}]),{}));
chk('zero rate: 0*A', equiv(r,'0*A',['A']), r);
// synthesis
r=rate(SBMLWriter.write(model, N(['P'],[{reactants:[],products:['P'],rate:'ksyn',rateConstant:0.7}]),{}));
chk('synthesis: ksyn', equiv(r,'ksyn',['ksyn']), r);
console.log(`\ncorrected SBMLWriter (REAL): ${P} passed, ${F} failed`);
