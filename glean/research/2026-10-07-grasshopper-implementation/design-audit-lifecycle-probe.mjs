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
const output={};
output.nullNotebook=normalizeNotebook(null);
output.malformedGoalNormalized=normalizeNotebook({steps:[{id:'bad',before:{structuredGoals:[null,3,{type:'P'}],position:'bad'}}]}).steps[0].before;
const base={kind:'graph',graph:typedDemo(),review:{documentId:'d',watches:[],notebook:{variants:[{name:'A',document:{kind:'graph',graph:typedDemo()},provenance:{audit:{axioms:{}}}}]}}};
output.malformedProvenanceValidation=validateDocument(base);
try { const n=normalizeNotebook(base.review.notebook); n.variants[0].provenance.audit?.axioms?.join(', ');output.malformedProvenanceRender='no throw';}catch(e){output.malformedProvenanceRender=e.message;}
{
 const h=harness(async()=>({ok:true,json:async()=>({status:'ready',preview:true})}));
 h.editor.open({kind:'graph',graph:typedDemo()});
 await find(h.host,n=>n.dataset.node==='n'&&n.dataset.output==='out').trigger('click');
 const replacement=typedDemo();replacement.edges=[];
 h.editor.open({kind:'graph',graph:replacement});
 await find(h.host,n=>n.dataset.node==='zero'&&n.dataset.port==='x').trigger('click');
 output.crossDocumentPendingWire={edges:h.editor.current().graph.edges,changes:h.changes.length};h.editor.close();
}
{
 let resolve;const h=harness(async path=>({ok:true,json:()=>path==='/api/preview'?new Promise(r=>resolve=r):Promise.resolve({status:'cancelled'})}));
 h.editor.open({kind:'graph',graph:typedDemo()});const pending=h.editor.check(true);while(!resolve)await new Promise(r=>setTimeout(r,0));h.editor.setAutomatic(true);resolve({status:'ready',preview:true,nodeTypes:{old:'Nat'}});await pending;output.previewAfterModeChange={results:h.results,statuses:h.statuses};h.editor.close();
}
{
 const h=harness(async()=>({ok:true,json:async()=>({status:'valid',verified:true})}));const graph=typedDemo();graph.nodes.push({id:'pair',kind:'construct',inputs:[],outputType:'Nat × Nat',body:'(1,2)',outputs:[{id:'left',name:'left',type:'Nat',term:'value.fst'},{id:'right',name:'right',type:'Nat',term:'value.snd'}]});
 h.editor.open({kind:'graph',graph});await find(h.host,n=>n.tagName==='article'&&n.dataset.id==='pair').trigger('click');await h.editor.check();
 const row=find(h.properties,n=>n.dataset.id==='right');await find(row,n=>n.tagName==='button'&&n.textContent==='×').trigger('click');output.constructDeletion={remainingVisible:all(h.properties).filter(n=>n.dataset.id==='right').length,storedOutputs:h.editor.current().graph.nodes.find(n=>n.id==='pair').outputs,changes:h.changes.length,lastResult:h.results.at(-1)};h.editor.close();
}
{
 let reject;const h=harness(async path=>{if(path==='/api/lean/declaration')return new Promise((r,j)=>reject=j);return{ok:true,json:async()=>({})};});const graph=typedDemo();graph.nodes.push({id:'ref',kind:'reference',name:'ref',inputs:[],outputType:'True',declaration:'Nat.add_zero'});
 h.editor.open({kind:'graph',graph});await find(h.host,n=>n.tagName==='article'&&n.dataset.id==='ref').trigger('click');const pending=find(h.properties,n=>n.textContent==='Lean 환경에서 시그니처 조회').trigger('click');while(!reject)await new Promise(r=>setTimeout(r,0));h.editor.open({kind:'graph',graph:typedDemo()});reject(new Error('old document lookup failed'));await pending;output.lookupFailureAfterReplacement=h.statuses;h.editor.close();
}
console.log(JSON.stringify(output,null,2));
