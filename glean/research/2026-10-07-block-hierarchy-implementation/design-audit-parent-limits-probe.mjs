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
import {validateDocument} from '../../prototype/web/document.mjs';

const results=[];
for(const condition of ['module-limit','node-limit','edge-limit'])for(const boundary of ['reject','accept'])for(const kind of ['코드','그래프']){
 const f=fixture();try{
  const graph=typedDemo();
  if(condition==='module-limit')graph.modules=Array.from({length:boundary==='reject'?32:31},(_,i)=>({id:'M'+i,name:'M'+i,inputs:[],outputType:'True',nodes:[{id:'leaf',kind:'script',inputs:[],outputType:'True',body:'True.intro'}],edges:[],result:{node:'leaf',output:'out'}}));
  else if(condition==='node-limit'){graph.inputs=[];graph.goal='True';graph.nodes=Array.from({length:boundary==='reject'?254:253},(_,i)=>({id:'leaf'+i,kind:'script',inputs:[],outputType:'True',body:'True.intro'}));graph.edges=[];graph.result={node:'leaf0',output:'out'};}
  else{graph.inputs=[];graph.goal='True';const inputs=Array.from({length:16},(_,i)=>({id:'p'+i,name:'p'+i,type:'True'}));graph.nodes=[{id:'S',kind:'script',inputs:[],outputType:'True',body:'True.intro'},...Array.from({length:32},(_,i)=>({id:'T'+i,kind:'script',inputs:structuredClone(inputs),outputType:'True',body:'p0'}))];graph.edges=Array.from({length:boundary==='reject'?512:511},(_,i)=>({id:'e'+i,source:'S',output:'out',target:'T'+Math.floor(i/16),input:'p'+i%16}));graph.result={node:'T0',output:'out'};}
  f.editor.open({kind:'graph',graph});const before=f.editor.current(),validationBefore=validateDocument(before),key=JSON.stringify(before),viewBefore=JSON.stringify(f.editor.presentation());
  await find(f.host,n=>n.textContent==='+ '+kind+' 부모').trigger('click');
  const after=f.editor.current();results.push({condition,boundary,kind,validationBefore,validationAfter:validateDocument(after),unchanged:JSON.stringify(after)===key,changes:f.changes.length,viewUnchanged:JSON.stringify(f.editor.presentation())===viewBefore,moduleCount:after.graph.modules.length,nodeCount:after.graph.nodes.length+after.graph.modules.reduce((n,m)=>n+m.nodes.length,0),edgeCount:after.graph.edges.length+after.graph.modules.reduce((n,m)=>n+m.edges.length,0)});
 }finally{f.editor.close();}
}
console.log(JSON.stringify(results,null,2));
