// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import assert from 'node:assert/strict';
import {initTypedEditor} from '../../prototype/web/typed-editor.mjs';
import {typedDemo} from '../../prototype/web/typed-model.mjs';
import {DocumentHistory} from '../../prototype/web/history.mjs';
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

export {Element,descendants,find,harness};
