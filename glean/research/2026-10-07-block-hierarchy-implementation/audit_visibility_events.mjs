// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {initTypedEditor} from '../../prototype/web/typed-editor.mjs';
import {typedDemo} from '../../prototype/web/typed-model.mjs';
import {normalizePresentation} from '../../prototype/web/presentation.mjs';
import {DocumentHistory} from '../../prototype/web/history.mjs';

// This invokes product event callbacks with a small DOM model. It does not drive
// a browser and the result delivered by fetch is deliberately controlled.
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.textContent='';this.style={};this.dataset={};this.listeners={};this.classes=new Set();this.classList={add:(...cs)=>cs.forEach(c=>this.classes.add(c)),remove:(...cs)=>cs.forEach(c=>this.classes.delete(c)),contains:c=>this.classes.has(c),toggle:(c,on)=>{if(on??!this.classes.has(c))this.classes.add(c);else this.classes.delete(c);}};}
 append(...children){for(const child of children){if(child&&typeof child==='object')child.parentElement=this;this.children.push(child);}}
 replaceChildren(...children){this.children=[];this.append(...children);}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 setAttribute(k,v){this[k]=v;}
 getBoundingClientRect(){return {left:0,top:0,width:1000,height:700};}
 remove(){this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}
 closest(selector){let n=this;while(n){if(selector==='button'&&n.tagName==='button'||selector.startsWith('.')&&n.className?.split(' ').includes(selector.slice(1)))return n;n=n.parentElement;}return null;}
 async fire(type,fields={}){const e={target:this,preventDefault(){},stopPropagation(){this.stopped=true;},button:0,clientX:0,clientY:0,...fields};let n=this;while(n){for(const f of n.listeners[type]??[])await f(e);if(e.stopped)break;n=n.parentElement;}}
 dispatchEvent(e){return this.fire(e.type);}
 get selectedOptions(){return this.children.filter(c=>c.selected);}
}
const descendants=n=>[n,...n.children.flatMap(c=>c instanceof Element?descendants(c):[])];
const find=(n,p)=>descendants(n).find(p);
function harness(){
 globalThis.document={createElement:t=>new Element(t),createElementNS:(ns,t)=>Object.assign(new Element(t),{namespaceURI:ns})};
 const listeners={};globalThis.window={addEventListener:(k,f)=>(listeners[k]??=[]).push(f)};
 const requests=[],results=[],changes=[],statuses=[],warnings=[],host=new Element(),properties=new Element(),history=new DocumentHistory();
 globalThis.fetch=async (url,data)=>{requests.push({url,data:JSON.parse(data.body)});return {ok:true,json:async()=>({status:'valid',verified:true,generatedCode:'controlled source'})};};
 const editor=initTypedEditor({host,properties,onResult:v=>results.push(v),onStatus:(...v)=>statuses.push(v),onWarning:v=>warnings.push(v),onChange:()=>{changes.push(editor.current());history.commit(editor.current());}});
 const graph=typedDemo();graph.nodes.push({id:'spare',kind:'nat',name:'unused spare',value:'3',x:600,y:300});editor.open({kind:'graph',graph});history.reset(editor.current());
 const click=async(text,root=host)=>{const target=find(root,n=>n.tagName==='button'&&n.textContent===text);assert.ok(target,'missing button '+text);assert.ok(!target.disabled,'disabled button '+text);await target.fire('click');};
 return {editor,host,properties,requests,results,changes,statuses,warnings,history,click};
}
const cases=[];
async function probe(id,run){try{const detail=await run();cases.push({id,pass:true,...detail});}catch(e){cases.push({id,pass:false,error:e.message});}}
await probe('hide-delete-prunes-saved-hidden-id',async()=>{const h=harness();try{h.editor.jumpKey('root/spare');await h.click('선택 숨기기');h.editor.jumpKey('root/spare');await h.click('노드 삭제',h.properties);const doc=h.editor.current(),normalized=normalizePresentation(doc);assert.ok(!doc.graph.nodes.some(n=>n.id==='spare'));assert.deepEqual(normalized.warnings,[],'normal user deletion must not create corrupted presentation');assert.ok(!doc.presentation.scopes.root.hidden.includes('n:spare'));return {hidden:doc.presentation.scopes.root.hidden,warnings:normalized.warnings};}finally{h.editor.close();}});
await probe('group-delete-prunes-saved-child-id',async()=>{const h=harness();try{h.editor.jumpKey('root/spare');await h.click('그룹으로 묶기');h.editor.jumpKey('root/spare');await h.click('노드 삭제',h.properties);const doc=h.editor.current(),normalized=normalizePresentation(doc);assert.deepEqual(normalized.warnings,[],'normal group child deletion must not create corrupted presentation');assert.ok(doc.presentation.scopes.root.containers.every(c=>!c.children.includes('n:spare')));return {containers:doc.presentation.scopes.root.containers,warnings:normalized.warnings};}finally{h.editor.close();}});
await probe('deleting-last-isolation-target-safely-ends-frame',async()=>{const h=harness();try{h.editor.jumpKey('root/spare');await h.click('선택만 보기');assert.ok(find(h.host,n=>n.className==='isolation-status'));await h.click('노드 삭제',h.properties);assert.ok(!find(h.host,n=>n.className==='isolation-status'));assert.ok(find(h.host,n=>n.tagName==='article'&&n.dataset.id==='zero'));return {visible:descendants(h.host).filter(n=>n.tagName==='article').map(n=>n.dataset.id)};}finally{h.editor.close();}});
await probe('new-node-is-immediately-in-current-isolation',async()=>{const h=harness();try{h.editor.jumpKey('root/spare');await h.click('선택만 보기');await h.click('Nat');const added=h.editor.current().graph.nodes.at(-1);assert.ok(added.id.startsWith('nat_'));assert.ok(find(h.host,n=>n.tagName==='article'&&n.dataset.id===added.id));assert.ok(find(h.host,n=>n.className==='isolation-status'&&n.textContent.includes('대상 2')));return {added:added.id};}finally{h.editor.close();}});
await probe('presentation-events-preserve-result-and-do-not-request-check',async()=>{const h=harness();try{h.editor.jumpKey('root/zero');await h.editor.check();const requests=h.requests.length,changes=h.changes.length;await h.click('선택 숨기기');assert.equal(h.requests.length,requests);assert.equal(h.results.at(-1).verified,true);assert.equal(h.changes.length,changes+1);h.editor.jumpKey('root/n');const before=h.changes.length;await h.click('선택만 보기');await h.click('격리 종료');assert.equal(h.changes.length,before);assert.equal(h.requests.length,requests);assert.equal(h.results.at(-1).verified,true);return {requests,layoutCommits:1,navigationCommits:0};}finally{h.editor.close();}});
await probe('hidden-delete-undo-redo-restores-presentation-atomically',async()=>{const h=harness();try{h.editor.jumpKey('root/spare');await h.click('선택 숨기기');const before=h.editor.current();h.editor.jumpKey('root/spare');await h.click('노드 삭제',h.properties);const after=h.editor.current();assert.deepEqual(h.history.undo(),before);assert.deepEqual(h.history.redo(),after);assert.deepEqual(normalizePresentation(before).warnings,[]);assert.deepEqual(normalizePresentation(after).warnings,[]);return {beforeHidden:before.presentation.scopes.root.hidden,afterHidden:after.presentation.scopes.root.hidden};}finally{h.editor.close();}});
await probe('group-delete-undo-redo-restores-membership-atomically',async()=>{const h=harness();try{h.editor.jumpKey('root/spare');await h.click('그룹으로 묶기');const before=h.editor.current();h.editor.jumpKey('root/spare');await h.click('노드 삭제',h.properties);const after=h.editor.current();assert.deepEqual(h.history.undo(),before);assert.deepEqual(h.history.redo(),after);assert.deepEqual(normalizePresentation(before).warnings,[]);assert.deepEqual(normalizePresentation(after).warnings,[]);return {beforeChildren:before.presentation.scopes.root.containers[0].children,afterChildren:after.presentation.scopes.root.containers[0].children};}finally{h.editor.close();}});
await probe('actual-typed-open-emits-warning-and-preserves-original',async()=>{const h=harness();try{const doc={kind:'graph',graph:typedDemo(),presentation:{version:1,scopes:{root:'broken'}}};h.editor.open(doc);assert.ok(h.warnings.at(-1).some(s=>s.includes('복구')));assert.deepEqual(h.editor.current().presentationRecovery,doc.presentation);return {warning:h.warnings.at(-1),originalPreserved:true};}finally{h.editor.close();}});
await probe('call-A-B-view-shows-distinct-call-identity-and-arguments',async()=>{const h=harness();try{const doc=JSON.parse(fs.readFileSync(new URL('ui-mixed-3-level.json',import.meta.url),'utf8'));for(const n of doc.graph.nodes)if(['callA','callB'].includes(n.id))n.name='same display name';h.editor.open(doc);const text=()=>[...descendants(h.host),...descendants(h.properties)].filter(n=>!n.hidden&&(n.textContent||n.value)).map(n=>({tag:n.tagName,text:n.textContent,value:n.value}));await h.click('내부 열기',find(h.host,n=>n.tagName==='article'&&n.dataset.id==='callA'));const a={trail:h.editor.presentation().trail,display:text()};await h.click('상위로 돌아가기');await h.click('내부 열기',find(h.host,n=>n.tagName==='article'&&n.dataset.id==='callB'));const b={trail:h.editor.presentation().trail,display:text()};assert.notDeepEqual(a.trail,b.trail);const displayDiffers=JSON.stringify(a.display)!==JSON.stringify(b.display);cases.push({id:'call-A-B-displayed-context-observation',pass:displayDiffers,a,b});assert.ok(displayDiffers,'same-name A(n=3) and B(n=5) have identical displayed identity/arguments although occurrence keys differ');return {displayDiffers};}finally{h.editor.close();}});
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(new URL(file,import.meta.url))).digest('hex');
const result={kind:'actual product event callbacks / small DOM model / controlled fetch, not native UI or kernel',hashes:{typedEditor:sha('../../prototype/web/typed-editor.mjs'),presentation:sha('../../prototype/web/presentation.mjs'),visibilityTools:sha('../../prototype/web/visibility-tools.mjs')},cases};
fs.writeFileSync(new URL(process.argv[2]??'visibility-events-expanded-retest-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));process.exitCode=cases.every(c=>c.pass)?0:1;
