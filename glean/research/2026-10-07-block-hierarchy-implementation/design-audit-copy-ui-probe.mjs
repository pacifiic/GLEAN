// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initTypedEditor} from '../../prototype/web/typed-editor.mjs';
import {initGraphFocus} from '../../prototype/web/focus-mode.js';
import {typedDemo} from '../../prototype/web/typed-model.mjs';
import {normalizePresentation,PresentationSession,projectScope,createContainer,setManualHidden,semanticDocument} from '../../prototype/web/presentation.mjs';
import {diagnosticVisibility,manuallyHidden} from '../../prototype/web/visibility-tools.mjs';

class Element{
 constructor(tag='div',doc){this.doc=doc;this.tagName=tag;this.children=[];this.value='';this.textContent='';this.style={};this.dataset={};this.listeners={};this.attrs=new Map();this.isConnected=true;this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),contains:c=>this.classes.has(c),toggle:(c,on)=>{if(on??!this.classes.has(c))this.classes.add(c);else this.classes.delete(c);}};}
 append(...children){for(const child of children){if(child&&typeof child==='object')child.parentElement=this;this.children.push(child);}}
 replaceChildren(...children){this.children=[];this.append(...children);}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 setAttribute(k,v){this.attrs.set(k,String(v));}
 getAttribute(k){return this.attrs.get(k)??null;}
 setCustomValidity(m){this.validationMessage=m;}
 getBoundingClientRect(){return{left:0,top:0,width:1000,height:700};}
 remove(){this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}
 closest(selector){let n=this;while(n){if(selector==='button'&&n.tagName==='button')return n;n=n.parentElement;}return null;}
 focus(){this.doc.activeElement=this;}
 blur(){this.doc.activeElement=null;}
 async trigger(type,target=this,fields={}){const e={target,preventDefault(){},stopPropagation(){this.stopped=true;},button:0,clientX:0,clientY:0,...fields};let n=this;while(n){for(const fn of n.listeners[type]??[])await fn(e);if(e.stopped)break;n=n.parentElement;}}
 get selectedOptions(){return this.children.filter(c=>c.selected);}
 dispatchEvent(e){return this.trigger(e.type);}
}
const all=r=>[r,...r.children.flatMap(c=>c instanceof Element?all(c):[])];
const find=(r,p)=>all(r).find(p);
function fixture(){
 const doc=new EventTarget();doc.defaultView={CustomEvent};doc.body=new Element('body',doc);doc.createElement=t=>new Element(t,doc);doc.createElementNS=(ns,t)=>{const e=new Element(t,doc);e.namespaceURI=ns;return e;};
 const host=new Element('div',doc),properties=new Element('div',doc),panel=new Element('section',doc),button=new Element('button',doc);button.textContent='전체화면';doc.activeElement=new Element('button',doc);doc.fullscreenEnabled=false;doc.querySelector=s=>s==='.editor-panel'?panel:null;doc.getElementById=id=>id==='fullscreen-button'?button:null;
 globalThis.document=doc;globalThis.window={addEventListener(){}};globalThis.fetch=async()=>({ok:true,json:async()=>({status:'ready',verified:false})});
 const changes=[],statuses=[],editor=initTypedEditor({host,properties,onStatus:(...args)=>statuses.push(args),onChange:()=>changes.push(editor.current())});return{doc,host,properties,editor,changes,statuses};
}

const {copyTyped,pasteTyped}=await import('../../prototype/web/typed-model.mjs');
const results={};
{
 const f=fixture();try{
  f.editor.open({kind:'graph',graph:typedDemo()});f.editor.jumpKey('root/zero');const before=JSON.stringify(semanticDocument(f.editor.current()));f.editor.restoreResult({verified:true,status:'valid',typedNodeTypes:{'root/zero/out':'n + 0 = n'},typedNodeUsage:{'root/zero/out':['n']}});const statusCount=f.statuses.length;await find(f.host,n=>n.textContent==='블록 복사').trigger('click');
  results.copyOnly={semanticUnchanged:JSON.stringify(semanticDocument(f.editor.current()))===before,statusCalls:f.statuses.length-statusCount,inspectionVerified:f.editor.inspectionSnapshot().verification==='verified-document'};assert.deepEqual(results.copyOnly,{semanticUnchanged:true,statusCalls:0,inspectionVerified:true});
  const reloaded={...f.editor.current(),review:{documentId:'same-controller-document',watches:[]}};f.editor.open(reloaded);const nodesBefore=f.editor.current().graph.nodes.length;await find(f.host,n=>n.textContent==='블록 붙여넣기').trigger('click');results.controllerReviewIdentityReload={nodesBefore,nodesAfter:f.editor.current().graph.nodes.length,status:f.statuses.at(-1)};
 }finally{f.editor.close();}
}
{
 const graph=JSON.parse(fs.readFileSync(new URL('./design-audit-cases-boundary-fixture.json',import.meta.url))).graph,identity={documentId:'doc',scopeId:'root'};const clipboard=copyTyped(graph,graph.nodes.map(n=>n.id),identity);let index=0;const created=pasteTyped(graph,graph,clipboard,identity,kind=>kind+'_'+(++index));
 const original=graph.nodes.find(n=>n.id==='split'),copied=created.find(n=>n.kind==='cases');assert.notEqual(original.id,copied.id);for(let i=0;i<2;i++){assert.notEqual(original.branches[i].id,copied.branches[i].id);assert.equal(copied.branches[i].binders[0].id,'w');assert.ok(copied.branches[i].nodes.some(n=>n.id===copied.branches[i].result.node));for(const e of copied.branches[i].edges)assert.ok(copied.branches[i].nodes.some(n=>n.id===e.source)&&copied.branches[i].nodes.some(n=>n.id===e.target));}
 const before=JSON.stringify(graph);assert.throws(()=>pasteTyped(graph,graph,clipboard,{documentId:'doc',scopeId:'root/split/left'},kind=>kind+'_'+(++index)),/범위/);assert.equal(JSON.stringify(graph),before);
 results.caseScope={newCase:copied.id,newBranches:copied.branches.map(b=>b.id),binderRefPreserved:true,allInternalEndpointsLocal:true,crossScopeAtomicReject:true};
 fs.writeFileSync(new URL('./design-audit-copied-cases-fixture.json',import.meta.url),JSON.stringify({kind:'graph',graph},null,2));
}
console.log(JSON.stringify(results,null,2));
