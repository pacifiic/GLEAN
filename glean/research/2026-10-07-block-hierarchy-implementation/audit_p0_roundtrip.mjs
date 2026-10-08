// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
// Independent pure presentation/import/history probe; no browser or Lean result.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {typedDemo} from '../../prototype/web/typed-model.mjs';
import {normalizePresentation,createContainer,moveContainer} from '../../prototype/web/presentation.mjs';
import {parseDocument,validateDocument} from '../../prototype/web/document.mjs';
import {DocumentHistory} from '../../prototype/web/history.mjs';
import {DraftStore} from '../../prototype/web/draft.mjs';

const report={kind:'pure model/import/history controls, not Lean or browser acceptance',cases:[]};
const add=(id,check)=>{try{report.cases.push({id,pass:true,...check()});}catch(error){report.cases.push({id,pass:false,error:error.message});}};
const old=JSON.parse(readFileSync(new URL('../../prototype/examples/compose.json',import.meta.url))).graph;
for(const version of [1,2,3])add('three-level-roundtrip-v'+version,()=>{
 const graph=version===3?typedDemo():{...structuredClone(old),version,...(version===2?{modules:[],groups:[]}:{} )};
 const doc={kind:'graph',graph};assert.equal(validateDocument(doc),null);const initial=structuredClone(doc);
 const p=normalizePresentation(doc).value;doc.presentation=p;const body=p.scopes.root,id=graph.nodes[1].id;
 createContainer(graph,body,['n:'+id],{id:'inner',name:'Inner'});createContainer(graph,body,['c:inner'],{id:'middle',name:'Middle'});createContainer(graph,body,['c:middle'],{id:'outer',name:'Outer'});
 body.hidden=['n:'+graph.nodes[0].id];const history=new DocumentHistory();history.reset(initial);history.commit(doc);
 const before=structuredClone(doc);moveContainer(graph,body,'outer',73,-11);history.commit(doc);
 assert.deepEqual(history.undo(),before);assert.deepEqual(history.redo(),doc);
 const parsed=parseDocument('saved.glean.json',JSON.stringify(doc));assert.deepEqual(parsed,doc);const normalized=normalizePresentation(parsed);assert.deepEqual(normalized.value,p);assert.deepEqual(normalized.warnings,[]);
 const storage={value:null,getItem(){return this.value;},setItem(_,v){this.value=v;}};const drafts=new DraftStore({storage,validate:validateDocument});assert.equal(drafts.save(parsed).ok,true);assert.deepEqual(drafts.load().document,doc);
 return{version,levels:3,hidden:body.hidden,undoRedo:true,fileRoundtrip:true,draftRoundtrip:true};
});
add('malformed-scope-quarantine',()=>{const doc={kind:'graph',graph:typedDemo(),presentation:{version:1,scopes:{root:'broken'}}},r=normalizePresentation(doc);assert.ok(r.warnings.length,'malformed scope discarded without warning');assert.deepEqual(r.original,doc.presentation);return{warnings:r.warnings,originalPreserved:true};});
add('overflow-containers-quarantine',()=>{const doc={kind:'graph',graph:typedDemo(),presentation:{version:1,scopes:{root:{hidden:[],containers:Array.from({length:257},(_,i)=>({id:'c'+i,name:'C'+i,children:[],collapsed:true,x:0,y:0}))}}}},r=normalizePresentation(doc);assert.ok(r.warnings.length,'257th container silently discarded');assert.deepEqual(r.original,doc.presentation);return{count:r.value.scopes.root.containers.length,warnings:r.warnings,originalPreserved:true};});
add('empty-container-finite-grouping',()=>{const doc={kind:'graph',graph:typedDemo(),presentation:{version:1,scopes:{root:{hidden:[],containers:[{id:'empty',name:'empty',children:[],collapsed:true,x:17,y:23}]}}}},p=normalizePresentation(doc).value.scopes.root,original=JSON.stringify(p);try{const created=createContainer(doc.graph,p,['c:empty'],{id:'parent',name:'parent'});assert.ok(Number.isFinite(created.x)&&Number.isFinite(created.y),'empty child grouping created nonfinite coordinates');assert.deepEqual(normalizePresentation({...doc,presentation:{version:1,scopes:{root:p}}}).value.scopes.root,p);return{coordinates:[created.x,created.y],fileRoundtrip:true};}catch(error){if(error.code==='ERR_ASSERTION')throw error;assert.equal(JSON.stringify(p),original,'rejected grouping partially changed presentation');return{atomicRejection:true,error:error.message};}});
report.fileHashes=Object.fromEntries(['presentation.mjs','history.mjs','document.mjs'].map(file=>[file,createHash('sha256').update(readFileSync(new URL('../../prototype/web/'+file,import.meta.url))).digest('hex')]));
const name=process.argv[2]??'p0-roundtrip-retest-results.json';writeFileSync(new URL(name,import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.cases.some(c=>!c.pass))process.exitCode=1;
