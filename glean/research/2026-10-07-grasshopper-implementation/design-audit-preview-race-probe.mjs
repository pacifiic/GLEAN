// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import {initTypedEditor} from '../../prototype/web/typed-editor.mjs';
import {typedDemo} from '../../prototype/web/typed-model.mjs';
import {normalizeNotebook} from '../../prototype/web/notebook.mjs';
import {validateDocument} from '../../prototype/web/document.mjs';
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.textContent='';this.style={};this.dataset={};this.listeners={};this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),contains:c=>this.classes.has(c),toggle:(c,on)=>{if(on??!this.classes.has(c))this.classes.add(c);else this.classes.delete(c);}};}
 append(...children){for(const c of children){if(c&&typeof c==='object')c.parentElement=this;this.children.push(c);}}
 replaceChildren(...children){this.children=[];this.append(...children);}addEventListener(t,fn){(this.listeners[t]??=[]).push(fn);}setAttribute(k,v){this[k]=v;}setCustomValidity(message){this.validationMessage=message;}getBoundingClientRect(){return{left:0,top:0,width:1000,height:700};}remove(){this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}closest(){return null;}
 async trigger(type,target=this){const event={target,preventDefault(){},stopPropagation(){this.stopped=true;},button:0,clientX:0,clientY:0};let n=this;while(n){for(const fn of n.listeners[type]??[])await fn(event);if(event.stopped)break;n=n.parentElement;}}
 get selectedOptions(){return this.children.filter(c=>c.selected);}dispatchEvent(event){return this.trigger(event.type);}
}
const all=r=>[r,...r.children.flatMap(c=>c instanceof Element?all(c):[])];const find=(r,p)=>all(r).find(p);
function harness(fetch){globalThis.document={createElement:t=>new Element(t),createElementNS:(ns,t)=>{const e=new Element(t);e.namespaceURI=ns;return e;}};globalThis.window={addEventListener(){}};globalThis.fetch=fetch;const host=new Element(),properties=new Element(),results=[],changes=[],statuses=[];const editor=initTypedEditor({host,properties,onResult:r=>results.push(r),onChange:()=>changes.push(editor.current()),onStatus:(...s)=>statuses.push(s)});return{host,properties,results,changes,statuses,editor};}

const cases=[];
for(const scenario of ['late-preview-success','late-preview-error']){
 let release,reject;const h=harness(async path=>({ok:true,json:()=>path==='/api/preview'?new Promise((r,j)=>{release=r;reject=j;}):Promise.resolve({status:'valid',verified:true,generatedCode:'actual newer source'})}));
 h.editor.open({kind:'graph',graph:typedDemo()});const oldPreview=h.editor.check(true);while(!release)await new Promise(r=>setTimeout(r,0));
 await h.editor.check(false);if(scenario==='late-preview-error')reject(new Error('obsolete preview failed'));else release({status:'ready',preview:true,verified:false,generatedCode:'old preview source'});await oldPreview;
 cases.push({scenario,delivered:h.results,statuses:h.statuses,lastStatus:h.results.at(-1)?.status,lastVerified:h.results.at(-1)?.verified,obsoleteErrorShown:h.statuses.some(s=>s[0]==='invalid'),expected:{lastStatus:'valid',lastVerified:true,obsoleteErrorShown:false}});h.editor.close();
}
console.log(JSON.stringify({cases},null,2));
