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
 const changes=[],editor=initTypedEditor({host,properties,onChange:()=>changes.push(editor.current())});return{doc,host,properties,editor,changes};
}
const results={};
{
 const f=fixture();try{
  const graph=typedDemo();graph.modules=[{id:'M',name:'M',inputs:[],outputType:'True',nodes:[{id:'leaf',kind:'script',inputs:[],outputType:'True',body:'True.intro'}],edges:[],result:{node:'leaf',output:'out'}}];graph.nodes.push({id:'A',kind:'module',ref:'M'});
  f.editor.open({kind:'graph',graph});await find(find(f.host,n=>n.tagName==='article'&&n.dataset.id==='A'),n=>n.textContent==='내부 열기').trigger('click');
  const previous=f.editor.presentation();f.editor.open({kind:'graph',graph:typedDemo()});f.editor.restorePresentation(previous);
  const after=f.editor.presentation(),doc=f.editor.current(),normalized=normalizePresentation(doc);
  results.missingScopeRestore={path:after.path,trail:after.trail,caption:find(f.host,n=>n.className==='typed-caption')?.textContent,recoveryWarnings:normalized.warnings,occurrenceKeys:Object.keys(doc.presentation.occurrenceViews)};
  const changed=structuredClone(graph);changed.modules.push({...structuredClone(graph.modules[0]),id:'N',name:'N'});changed.nodes.find(n=>n.id==='A').ref='N';f.editor.open({kind:'graph',graph:changed});f.editor.restorePresentation(previous);const changedAfter=f.editor.presentation();results.changedCallRestore={path:changedAfter.path,trail:changedAfter.trail,recoveryWarnings:normalizePresentation(f.editor.current()).warnings};
 }finally{f.editor.close();}
}
{
 const actual=JSON.parse(fs.readFileSync(new URL('./design-audit-body-diagnostic-baseline.json',import.meta.url))).result.diagnostics;
 const graph={nodes:[{id:'proof',kind:'script',inputs:[],outputType:'True',body:'True.intro'},{id:'other',kind:'script',inputs:[],outputType:'True',body:'True.intro'}],edges:[]};
 const p=normalizePresentation({kind:'graph',graph}).value.scopes.root,s=new PresentationSession();
 const visible=diagnosticVisibility(actual,'root',graph,projectScope(graph,p,s.state('root')));
 s.isolate('root',graph,p,['n:other'],{x:1,y:2,zoom:1});
 const outside=diagnosticVisibility(actual,'root',graph,projectScope(graph,p,s.state('root')));
 const unknown=diagnosticVisibility([{severity:'error',message:'no position'}],'root',graph,projectScope(graph,p,s.state('root')));
 createContainer(graph,p,['n:proof','n:other'],{id:'parent',name:'parent'});setManualHidden(p,s.state('root'),['c:parent'],true);
 results.actualDiagnostic={visible,outside,unknown,ancestorHidden:manuallyHidden(p,'proof')};
 assert.deepEqual(visible,{inside:1,outside:0,unknown:0});assert.deepEqual(outside,{inside:0,outside:1,unknown:0});assert.equal(unknown.unknown,1);assert.equal(manuallyHidden(p,'proof'),true);
}
{
 const f=fixture();try{
  f.editor.open({kind:'graph',graph:typedDemo()});
  const focus=initGraphFocus(f.doc,{cancelInteraction:()=>f.editor.cancelInteraction()});focus.enter();
  await find(f.host,n=>n.dataset.node==='n'&&n.dataset.output==='out').trigger('click');
  const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'key',{value:'Escape'});f.doc.dispatchEvent(event);
  results.fullscreen={firstEscapeKeepsFocus:focus.active,firstEscapePrevented:event.defaultPrevented};
  await find(f.host,n=>n.dataset.node==='zero'&&n.dataset.port==='x').trigger('click');
  results.fullscreen.originalWirePreserved=f.editor.current().graph.edges[0].id==='wire';
  const second=new Event('keydown',{cancelable:true});Object.defineProperty(second,'key',{value:'Escape'});f.doc.dispatchEvent(second);results.fullscreen.secondEscapeExits=!focus.active;
  assert.deepEqual(results.fullscreen,{firstEscapeKeepsFocus:true,firstEscapePrevented:true,originalWirePreserved:true,secondEscapeExits:true});
 }finally{f.editor.close();}
}
{
 const f=fixture();try{
  const graph=typedDemo();
  graph.modules=[{id:'N',name:'inner',inputs:[],outputType:'True',nodes:[{id:'leaf',kind:'script',inputs:[],outputType:'True',body:'True.intro',x:10,y:10}],edges:[],result:{node:'leaf',output:'out'}},{id:'M',name:'outer',inputs:[],outputType:'True',nodes:[{id:'inner',kind:'module',ref:'N',x:10,y:10}],edges:[],result:{node:'inner',output:'out'}}];
  graph.nodes.push(...['A','B'].map(id=>({id,kind:'module',ref:'M',x:500,y:100})));
  f.editor.open({kind:'graph',graph});const before=JSON.stringify(semanticDocument(f.editor.current()));
  const open=async id=>{await find(find(f.host,n=>n.tagName==='article'&&n.dataset.id===id),n=>n.textContent==='내부 열기').trigger('click');};
  await open('A');await open('inner');f.editor.jumpKey('module/N/leaf');await find(f.host,n=>n.textContent==='선택 숨기기').trigger('click');
  const hiddenA=f.editor.current().presentation.occurrenceViews;await find(f.host,n=>n.textContent==='상위로 돌아가기').trigger('click');await find(f.host,n=>n.textContent==='상위로 돌아가기').trigger('click');await open('B');await open('inner');
  const leafB=!!find(f.host,n=>n.tagName==='article'&&n.dataset.id==='leaf'),unchanged=before===JSON.stringify(semanticDocument(f.editor.current())),entries=Object.values(f.editor.current().presentation.occurrenceViews);
  results.nestedOccurrences={leafBVisible:leafB,semanticUnchanged:unchanged,callAViewHidden:Object.values(hiddenA).some(e=>e.scopeId==='module/N'&&e.trail[0].nodeId==='A'&&e.view.hidden.includes('n:leaf')),callBViewVisible:entries.some(e=>e.scopeId==='module/N'&&e.trail[0].nodeId==='B'&&!e.view.hidden.length),genericInnerViewVisible:!f.editor.current().presentation.scopes['module/N'].hidden.length};
  assert.ok(Object.values(results.nestedOccurrences).every(Boolean));
 }finally{f.editor.close();}
}
console.log(JSON.stringify(results,null,2));
