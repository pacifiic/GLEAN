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

const results=[];
for(const mode of ['single','multiple']){
 const f=fixture();try{
  f.editor.open({kind:'graph',graph:typedDemo()});
  if(mode==='multiple')await find(f.host,n=>n.tagName==='article'&&n.dataset.id==='n').trigger('click');
  await find(f.host,n=>n.tagName==='article'&&n.dataset.id==='zero').trigger('click',undefined,{shiftKey:mode==='multiple'});
  const state=f.editor.presentation(),current=f.editor.current(),selectedBefore=all(f.host).filter(n=>n.tagName==='article'&&n.className.split(' ').includes('selected')).map(n=>n.dataset.id),disabledBefore=find(f.host,n=>n.textContent==='선택 숨기기').disabled;
  f.editor.open(current);f.editor.restorePresentation(state);
  const selectedAfter=all(f.host).filter(n=>n.tagName==='article'&&n.className.split(' ').includes('selected')).map(n=>n.dataset.id);
  results.push({mode,selectedBefore,selectedAfter,disabledBefore,disabledAfter:find(f.host,n=>n.textContent==='선택 숨기기').disabled,inspectorAfter:f.editor.inspectionSnapshot()?.id,stateSelected:state.selected});
 }finally{f.editor.close();}
}
console.log(JSON.stringify(results,null,2));
