// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
// Independent product-controller event tests. Network responses are test doubles.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initTypedEditor} from '../../prototype/web/typed-editor.mjs';
import {typedDemo} from '../../prototype/web/typed-model.mjs';
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.textContent='';this.style={};this.dataset={};this.listeners={};this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),contains:c=>this.classes.has(c),toggle:(c,on)=>{if(on??!this.classes.has(c))this.classes.add(c);else this.classes.delete(c);}};}
 append(...children){for(const c of children){if(c&&typeof c==='object')c.parentElement=this;this.children.push(c);}}
 replaceChildren(...children){this.children=[];this.append(...children);}addEventListener(t,fn){(this.listeners[t]??=[]).push(fn);}setAttribute(k,v){this[k]=v;}setCustomValidity(message){this.validationMessage=message;}getBoundingClientRect(){return{left:0,top:0,width:1000,height:700};}remove(){this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}closest(){return null;}
 async trigger(type,target=this){const event={target,preventDefault(){},stopPropagation(){this.stopped=true;},button:0,clientX:0,clientY:0};let n=this;while(n){for(const fn of n.listeners[type]??[])await fn(event);if(event.stopped)break;n=n.parentElement;}}
 get selectedOptions(){return this.children.filter(c=>c.selected);}dispatchEvent(event){return this.trigger(event.type);}
}
const all=r=>[r,...r.children.flatMap(c=>c instanceof Element?all(c):[])];const find=(r,p)=>all(r).find(p);const pause=ms=>new Promise(r=>setTimeout(r,ms));
function setup(answer){const calls=[],results=[],selections=[],statuses=[],host=new Element(),properties=new Element();globalThis.document={createElement:t=>new Element(t),createElementNS:(ns,t)=>{const e=new Element(t);e.namespaceURI=ns;return e;}};globalThis.window={addEventListener(){}};globalThis.fetch=async(path,options)=>{const body=JSON.parse(options.body);calls.push({path,body});return{ok:true,json:()=>answer(path,body)};};let editor;editor=initTypedEditor({host,properties,onResult:r=>results.push(r),onStatus:(...s)=>statuses.push(s),onSelection:()=>selections.push(editor.inspectionSnapshot())});return{editor,host,properties,calls,results,selections,statuses};}
const report={typedEditorHash:createHash('sha256').update(readFileSync(new URL('../../prototype/web/typed-editor.mjs',import.meta.url))).digest('hex'),networkResponsesAreTestDoubles:true};
{
 const actual=JSON.parse(readFileSync(new URL('design-audit-metadata-retest.json',import.meta.url))).cases.find(c=>c.id==='unused-argument');let preview;
 const h=setup(path=>path==='/api/preview'?new Promise(resolve=>preview=resolve):Promise.resolve(actual.result));
 try{h.editor.open({kind:'graph',graph:actual.fixture});await find(h.host,n=>n.tagName==='article'&&n.dataset.id==='select').trigger('click');await h.editor.check();assert.equal(h.selections.at(-1).verification,'verified-document');assert.deepEqual(h.selections.at(-1).assumptions.map(a=>a.id),['P','hp']);
  const body=find(h.properties,n=>n.tagName==='textarea'&&n.value==='hp');body.value='by exact hp';await body.trigger('input');const immediate=structuredClone(h.selections.at(-1));assert.equal(immediate.verification,'unverified');assert.equal(immediate.type,null);assert.equal(immediate.assumptionsKnown,false);
  body.value='by exact (hp)';await body.trigger('input');await pause(650);assert.equal(h.calls.filter(c=>c.path==='/api/preview').length,1);assert.equal(h.calls.filter(c=>c.path.endsWith('/start')).length,1);assert.ok(preview);
  const latest=h.calls.at(-1).body.graph.nodes.find(n=>n.id==='select').body;assert.equal(latest,'by exact (hp)');preview({status:'ready',preview:true,verified:false,generatedCode:'',sourceMap:{},diagnostics:[]});await pause(10);
  report.manual={immediateInspector:immediate,editsMade:2,previewJobs:1,extraKernelJobs:0,checkedBody:latest,pendingInputPreserved:h.editor.current().graph.nodes.find(n=>n.id==='select').body};
 }finally{h.editor.close();}
}
{
 const h=setup(path=>Promise.resolve(path==='/api/preview'?{status:'ready',preview:true,verified:false}:{jobId:'auto',status:'incomplete',verified:false}));
 try{h.editor.open({kind:'graph',graph:typedDemo()});h.editor.setAutomatic(true);await find(h.host,n=>n.tagName==='article'&&n.dataset.id==='zero').trigger('click');const body=find(h.properties,n=>n.tagName==='textarea'&&n.value==='by rfl');for(const value of ['by exact Nat.add_zero x','by rfl','by exact Nat.add_zero x']){body.value=value;await body.trigger('input');}await pause(650);
  assert.equal(h.calls.filter(c=>c.path.endsWith('/start')).length,1);assert.equal(h.calls.filter(c=>c.path==='/api/preview').length,0);const checked=h.calls.find(c=>c.path.endsWith('/start')).body.graph.nodes.find(n=>n.id==='zero').body;assert.equal(checked,'by exact Nat.add_zero x');
  body.value='by rfl';await body.trigger('input');h.editor.setAutomatic(false);await pause(650);assert.equal(h.calls.filter(c=>c.path.endsWith('/start')).length,1);
  body.value='by exact Nat.add_zero x';await body.trigger('input');await pause(650);assert.equal(h.calls.filter(c=>c.path==='/api/preview').length,1);
  report.automatic={rapidEdits:3,kernelStartJobs:1,checkedBody:checked,modeChangeCancelledPendingKernel:true,manualEditPreviewOnly:true};
 }finally{h.editor.close();}
}
{
 let resolve;const h=setup(path=>path.endsWith('/start')?new Promise(r=>resolve=r):Promise.resolve({status:'cancelled',verified:false}));
 try{h.editor.open({kind:'graph',graph:typedDemo()});const checking=h.editor.check();while(!resolve)await pause(0);h.editor.cancel();resolve({jobId:'late-start',status:'queued',verified:false});await checking;assert.ok(h.calls.some(c=>c.path.endsWith('/cancel')&&c.body.jobId==='late-start'));assert.ok(!h.results.some(r=>r?.verified));report.cancel={lateStartedJobCancelled:true,obsoleteResultShown:false};}finally{h.editor.close();}
}
{
 let resolve;const h=setup(path=>path==='/api/preview'?new Promise(r=>resolve=r):Promise.resolve({status:'cancelled',verified:false}));
 try{h.editor.open({kind:'graph',graph:typedDemo()});const checking=h.editor.check(true);while(!resolve)await pause(0);h.editor.setAutomatic(true);resolve({status:'ready',preview:true,verified:true});await checking;assert.equal(h.results.length,0);report.modeStaleResponse={responseDelivered:false};}finally{h.editor.close();}
}
{
 const actual=JSON.parse(readFileSync(new URL('design-audit-metadata-retest.json',import.meta.url))).cases.find(c=>c.id==='unused-argument');const outcomes=[];
 for(const fail of [false,true]){let resolve,reject;const h=setup(path=>path==='/api/preview'?new Promise((res,rej)=>{resolve=res;reject=rej;}):Promise.resolve(actual.result));
  try{h.editor.open({kind:'graph',graph:actual.fixture});const old=h.editor.check(true);while(!resolve)await pause(0);await h.editor.check();assert.equal(h.results.at(-1).verified,true);const count=h.results.length,statusCount=h.statuses.length;
   if(fail)reject(new Error('obsolete preview failure'));else resolve({status:'ready',preview:true,verified:false});await old;
   assert.equal(h.results.length,count);assert.equal(h.results.at(-1).verified,true);assert.equal(h.statuses.length,statusCount);outcomes.push({oldResponse:fail?'error':'success',latestVerifiedPreserved:true,obsoleteResultDelivered:false,obsoleteErrorDisplayed:false});
  }finally{h.editor.close();}
 }
 report.sameDocumentOverlap=outcomes;
}
writeFileSync(new URL('compute-ui-results.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
