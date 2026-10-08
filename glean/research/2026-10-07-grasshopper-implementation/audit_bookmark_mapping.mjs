// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
// Independent exact controller/callback association test. DOM and goals are stubs;
// graph fixtures, generated source and source maps are actual kernel records.
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initTypedEditor} from '../../prototype/web/typed-editor.mjs';
import {bookmark,normalizeNotebook} from '../../prototype/web/notebook.mjs';
import {reviewFingerprint} from '../../prototype/web/proof-review.mjs';
import {semanticKey} from '../../prototype/web/history.mjs';
import {parseDocument,validateDocument} from '../../prototype/web/document.mjs';

class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.textContent='';this.style={};this.dataset={};this.listeners={};this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),contains:c=>this.classes.has(c),toggle:(c,on)=>{if(on??!this.classes.has(c))this.classes.add(c);else this.classes.delete(c);}};}
 append(...children){for(const c of children){if(c&&typeof c==='object')c.parentElement=this;this.children.push(c);}}
 replaceChildren(...children){this.children=[];this.append(...children);}addEventListener(t,fn){(this.listeners[t]??=[]).push(fn);}setAttribute(k,v){this[k]=v;}setCustomValidity(message){this.validationMessage=message;}getBoundingClientRect(){return{left:0,top:0,width:1000,height:700};}remove(){this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}closest(){return null;}
 async trigger(type,target=this){const event={target,preventDefault(){},stopPropagation(){this.stopped=true;},button:0,clientX:0,clientY:0};let n=this;while(n){for(const fn of n.listeners[type]??[])await fn(event);if(event.stopped)break;n=n.parentElement;}}
 get selectedOptions(){return this.children.filter(c=>c.selected);}dispatchEvent(event){return this.trigger(event.type);}
}
const all=r=>[r,...r.children.flatMap(c=>c instanceof Element?all(c):[])];
const app=readFileSync(new URL('../../prototype/web/app.js',import.meta.url),'utf8');
const extract=(start,end)=>{const a=app.indexOf(start);assert.ok(a>=0,start);const b=app.indexOf(end,a);assert.ok(b>a,end);return app.slice(a,b);};
const explore=extract('onExplore:(source,selection,range)=>','workspace.reveal(\'inspector\');}});').slice('onExplore:'.length)+"workspace.reveal('inspector');}";
const add=extract("$('bookmark-add').addEventListener","$('watch-pin')");
const record=extract('function recordDocument()','function setMode(');
const kernelRecords=JSON.parse(readFileSync(new URL('design-audit-metadata-retest.json',import.meta.url))).cases;
const report={appHash:createHash('sha256').update(app).digest('hex'),typedEditorHash:createHash('sha256').update(readFileSync(new URL('../../prototype/web/typed-editor.mjs',import.meta.url))).digest('hex'),observationsAreTestDoubles:true,cases:[]};
for(const spec of [{id:'Cases-left',fixture:'Cases-metadata',key:'root/case/left/join',expected:['join','hp','P','Q'],scope:'root/case/left'},{id:'Fin-module',fixture:'Fin-metadata',key:'module/bound/proof',expected:['proof','i','n'],scope:'module/bound'}]){
 const actual=kernelRecords.find(c=>c.id===spec.fixture);assert.equal(actual.result.verified,true);
 const host=new Element(),properties=new Element(),opened=[],jumps=[],reveals=[];
 globalThis.document={createElement:t=>new Element(t),createElementNS:(ns,t)=>{const e=new Element(t);e.namespaceURI=ns;return e;}};globalThis.window={addEventListener(){}};
 const ctx={review:{documentId:'mapping-audit',watches:[],notebook:{steps:[],variants:[]}},reviewFingerprint,loadDocument(doc){assert.equal(validateDocument(doc),null);opened.push(structuredClone(doc));ctx.doc=doc;ctx.review=doc.review;ctx.sourceGraphSelection=doc.review.sourceGraphSelection;ctx.mode='lean';},setTimeout(fn){fn();},leanEditor:{jump:(...args)=>jumps.push(args)},workspace:{reveal:p=>reveals.push(p)}};
 vm.createContext(ctx);const onExplore=vm.runInContext('('+explore+')',ctx);
 const editor=initTypedEditor({host,properties,onExplore});editor.open({kind:'graph',graph:actual.fixture});editor.restoreResult(actual.result);editor.jumpKey(spec.key);
 const selection=editor.captureSelection();assert.equal(selection.scopeId,spec.scope);assert.deepEqual(new Set(selection.nodeIds),new Set(spec.expected));assert.deepEqual(new Set(selection.subgraph.nodes.map(n=>n.id)),new Set(spec.expected));assert.ok(selection.sourceRange);
 const tools=all(properties).find(n=>n.tagName==='button'&&n.textContent==='Lean 목표 탐색 ↗');assert.ok(tools);await tools.trigger('click');assert.equal(opened.length,1);assert.equal(ctx.doc.source,actual.result.generatedCode);assert.equal(ctx.sourceGraphSelection.scopeId,spec.scope);assert.deepEqual(ctx.sourceGraphSelection.sourceRange,selection.sourceRange);assert.equal(ctx.sourceGraphSelection.sourceIdentity,reviewFingerprint(actual.result.generatedCode));assert.equal(ctx.sourceGraphSelection.projectId,actual.fixture.projectId);assert.deepEqual(jumps,[[selection.sourceRange.startLine,4]]);
 const identity=ctx.sourceGraphSelection.sourceIdentity,position={line:selection.sourceRange.startLine-1,character:4};ctx.contextObservations=[{source:ctx.doc.source,sourceIdentity:identity,projectId:ctx.doc.projectId,filename:ctx.doc.filename,sessionId:'association-test',version:1,position,structuredGoals:[{type:'association test before'}]},{source:ctx.doc.source,sourceIdentity:identity,projectId:ctx.doc.projectId,filename:ctx.doc.filename,sessionId:'association-test',version:1,position,structuredGoals:[]}];
 let addAction;const fields={'notebook-name':{value:spec.id},'notebook-description':{value:'Scoped source association'}};Object.assign(ctx,{$:id=>id==='bookmark-add'?{addEventListener(_,fn){addAction=fn;}}:fields[id],typedEditor:editor,currentDocument:()=>({...ctx.doc,review:ctx.review}),semanticKey,normalizeNotebook,bookmark,uid:()=>spec.id,renderNotebook(){},recordDocument(){}});vm.runInContext(add,ctx);addAction();const step=ctx.review.notebook.steps[0];assert.equal(step.scopeId,spec.scope);assert.deepEqual(new Set(step.nodeIds),new Set(spec.expected));assert.deepEqual(step.sourceRange,selection.sourceRange);assert.equal(step.before.sourceIdentity,identity);assert.equal(step.after.sourceIdentity,identity);assert.equal(step.after.version,1);assert.equal(step.after.projectId,actual.fixture.projectId);
 const restored=parseDocument('bookmark.json',JSON.stringify({...ctx.doc,review:ctx.review}));assert.deepEqual(restored.review.notebook.steps[0],JSON.parse(JSON.stringify(step)));
 const invalidated=[];for(const change of [{id:'source',source:ctx.doc.source+'\n-- edit'},{id:'project',projectId:'mathlib'},{id:'file',filename:'Other.lean'}]){const savedDoc={...ctx.doc,...change},savedReview=structuredClone(ctx.review);const invalidation={loading:false,restoring:false,verificationEpoch:0,mode:'lean',sourceGraphSelection:structuredClone(ctx.sourceGraphSelection),review:savedReview,currentDocument:()=>({...savedDoc,review:savedReview}),reviewFingerprint,history:{commit(){}},updateHistoryButtons(){},renderNotebook(){},clearTimeout(){},setTimeout(){return 1;},autosaveTimer:null,persistDraft(){}};vm.createContext(invalidation);vm.runInContext(record+'\nrecordDocument();',invalidation);assert.equal(invalidation.sourceGraphSelection,null);assert.equal(savedReview.sourceGraphSelection,null);invalidated.push(change.id);}
 report.cases.push({id:spec.id,scopeId:step.scopeId,nodeIds:step.nodeIds,sourceRange:step.sourceRange,sourceIdentity:step.sourceIdentity,projectId:step.after.projectId,filename:step.after.filename,roundtrip:true,invalidated,exploreJumps:jumps,reveals});editor.close();
}
writeFileSync(new URL('bookmark-mapping-results.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
