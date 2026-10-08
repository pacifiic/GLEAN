// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
// Real queried telescope through product UI events; network is mocked, not kernel evidence.
import {readFileSync,writeFileSync} from 'node:fs';
import {initTypedEditor} from '../../prototype/web/typed-editor.mjs';
import {typedDemo} from '../../prototype/web/typed-model.mjs';
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.textContent='';this.style={};this.dataset={};this.listeners={};this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),contains:c=>this.classes.has(c),toggle:(c,on)=>{if(on??!this.classes.has(c))this.classes.add(c);else this.classes.delete(c);}};}
 append(...children){for(const c of children){if(c&&typeof c==='object')c.parentElement=this;this.children.push(c);}}
 replaceChildren(...children){this.children=[];this.append(...children);}addEventListener(t,fn){(this.listeners[t]??=[]).push(fn);}setAttribute(k,v){this[k]=v;}setCustomValidity(message){this.validationMessage=message;}getBoundingClientRect(){return{left:0,top:0,width:1000,height:700};}remove(){this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}closest(){return null;}
 async trigger(type,target=this){const event={target,preventDefault(){},stopPropagation(){this.stopped=true;},button:0,clientX:0,clientY:0};let n=this;while(n){for(const fn of n.listeners[type]??[])await fn(event);if(event.stopped)break;n=n.parentElement;}}
 get selectedOptions(){return this.children.filter(c=>c.selected);}dispatchEvent(event){return this.trigger(event.type);}
}
const all=r=>[r,...r.children.flatMap(c=>c instanceof Element?all(c):[])];const find=(r,p)=>all(r).find(p);
globalThis.document={createElement:t=>new Element(t),createElementNS:(ns,t)=>{const e=new Element(t);e.namespaceURI=ns;return e;}};globalThis.window={addEventListener(){}};
const data=JSON.parse(readFileSync(new URL('declaration-results.json',import.meta.url)));
const signature=data.cases.find(c=>c.id==='R03-Lean-reference').graph.nodes.find(n=>n.kind==='reference').reference;
let request;
globalThis.fetch=async(path,options)=>({ok:true,json:async()=>{if(path==='/api/lean/declaration')return signature;request=JSON.parse(options.body);return{status:'ready',preview:true,verified:false};}});
const host=new Element(),properties=new Element(),editor=initTypedEditor({host,properties});
const graph=typedDemo();graph.nodes.push({id:'reference',kind:'reference',name:'reference',declaration:'Nat.add_zero',inputs:[],outputType:'True'});
graph.edges.push({id:'refwire',source:'n',output:'out',target:'reference',input:'arg0'});graph.result={node:'reference',output:'out'};
editor.open({kind:'graph',graph});
await find(host,n=>n.tagName==='article'&&n.dataset.id==='reference').trigger('click');
await find(properties,n=>n.textContent==='Lean 환경에서 시그니처 조회').trigger('click');
await editor.check(true);
const node=request.graph.nodes.find(n=>n.id==='reference');
const result={queriedInputs:signature.inputs,committedInputs:node.inputs,exactSignatureRetained:JSON.stringify(signature.inputs)===JSON.stringify(node.inputs),fixture:request.graph};
editor.open({kind:'graph',graph:request.graph});
const project=find(properties,n=>n.tagName==='select'&&n.value==='glean');
project.value='mathlib';await project.trigger('input');
const changed=editor.current().graph;
result.projectChange={projectId:changed.projectId,previousReferenceDiscarded:changed.nodes.find(n=>n.id==='reference').reference===undefined,markedStale:changed.nodes.find(n=>n.id==='reference').referenceStale===true};
if(!result.projectChange.previousReferenceDiscarded||!result.projectChange.markedStale)throw new Error('Project change retained stale reference authority');
writeFileSync(new URL('reference-ui-results.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify({queriedInputs:result.queriedInputs,committedInputs:result.committedInputs,exactSignatureRetained:result.exactSignatureRetained,projectChange:result.projectChange},null,2));
editor.close();
