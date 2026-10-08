// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
// Independent presentation recovery boundaries, without UI or Lean.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizePresentation,occurrenceKey} from '../../prototype/web/presentation.mjs';
const doc=JSON.parse(readFileSync(new URL('ui-mixed-3-level.json',import.meta.url)));
const entry={scopeId:'module/outer',trail:[{scopeId:'root',nodeId:'callA',definitionId:'outer'}],view:{hidden:[],containers:[]}};
const report={kind:'pure recovery checks, not UI/Lean',presentationHash:createHash('sha256').update(readFileSync(new URL('../../prototype/web/presentation.mjs',import.meta.url))).digest('hex'),cases:[]};
for(const [id,occurrenceViews] of [['malformed','broken'],['overflow',Object.fromEntries(Array.from({length:257},(_,i)=>['occurrence'+i,structuredClone(entry)]))]]){
 const input={...doc,presentation:{version:1,scopes:{},occurrenceViews}},result=normalizePresentation(input);let pass=true,error;
 try{assert.ok(result.warnings.length,'silent loss without warning');assert.deepEqual(result.original,input.presentation);}catch(e){pass=false;error=e.message;}
 report.cases.push({id,pass,error,warnings:result.warnings,count:Object.keys(result.value.occurrenceViews).length,originalPreserved:result.original!==null});
}
// Generate over 256 genuine different trails without exceeding semantic graph limits.
const inner={id:'inner',name:'Inner',inputs:[],outputType:'True',nodes:[{id:'proof',kind:'script',inputs:[],outputType:'True',body:'True.intro'}],edges:[],result:{node:'proof',output:'out'}};
const outer={id:'outer',name:'Outer',inputs:[],outputType:'True',nodes:Array.from({length:16},(_,i)=>({id:'inner'+i,kind:'module',ref:'inner'})),edges:[],result:{node:'inner0',output:'out'}};
const many={kind:'graph',graph:{version:3,name:'Many valid occurrences',projectId:'glean',imports:[],policy:'standard',inputs:[],goal:'True',modules:[inner,outer],nodes:Array.from({length:17},(_,i)=>({id:'outer'+i,kind:'module',ref:'outer'})),edges:[],result:{node:'outer0',output:'out'}}};
const views={};for(let i=0;i<17&&Object.keys(views).length<257;i++)for(let j=0;j<16&&Object.keys(views).length<257;j++){const trail=[{scopeId:'root',nodeId:'outer'+i,definitionId:'outer'},{scopeId:'module/outer',nodeId:'inner'+j,definitionId:'inner'}],scopeId='module/inner';views[occurrenceKey(scopeId,trail)]={scopeId,trail,view:{hidden:[],containers:[]}};}
for(const size of [256,257]){const input={...many,presentation:{version:1,scopes:{},occurrenceViews:Object.fromEntries(Object.entries(views).slice(0,size))}},r=normalizePresentation(input);let pass=true,error;try{assert.equal(Object.keys(r.value.occurrenceViews).length,256);if(size===256){assert.deepEqual(r.warnings,[]);assert.equal(r.original,null);}else{assert.ok(r.warnings.some(w=>w.includes('한도')));assert.deepEqual(r.original,input.presentation);}}catch(e){pass=false;error=e.message;}report.cases.push({id:'canonical-valid-'+size,pass,error,count:Object.keys(r.value.occurrenceViews).length,warnings:r.warnings,originalPreserved:r.original!==null});}
const filename=process.argv[2]??'occurrence-corruption-retest-results.json';writeFileSync(new URL(filename,import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,cases:report.cases.map(c=>({...c,warnings:c.warnings.slice(0,3),warningCount:c.warnings.length}))},null,2));if(report.cases.some(c=>!c.pass))process.exitCode=1;
