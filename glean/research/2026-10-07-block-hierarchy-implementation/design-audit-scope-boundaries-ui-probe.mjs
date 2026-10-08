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
import {connectTyped,typedInputs,typedOutputs} from '../../prototype/web/typed-model.mjs';
import {semanticKey} from '../../prototype/web/history.mjs';

const results={};
const casesDoc=JSON.parse(fs.readFileSync(new URL('./design-audit-cases-boundary-fixture.json',import.meta.url))),parentDoc=JSON.parse(fs.readFileSync(new URL('./design-audit-parent-boundary-fixture.json',import.meta.url)));
{
 const p=normalizePresentation(casesDoc).value,left=casesDoc.graph.nodes.at(-1).branches[0],right=casesDoc.graph.nodes.at(-1).branches[1],leftP=p.scopes['root/split/left'],before=JSON.stringify(leftP);
 let rejected=false;try{createContainer(left,leftP,['n:left_w','n:right_w'],{id:'invalid',name:'cross sibling'});}catch{rejected=true;}
 const containmentAtomic=before===JSON.stringify(leftP),edgeBefore=JSON.stringify(left.edges);let wireRejected=false;try{connectTyped(left,casesDoc.graph,'left_w','out','right_proof','w','bad');}catch{wireRejected=true;}
 const good=createContainer(left,leftP,['n:left_w','n:left_proof'],{id:'valid',name:'same branch'}),projection=projectScope(left,leftP,new PresentationSession().state('left'),{inputs:n=>typedInputs(n,casesDoc.graph),outputs:typedOutputs});
 const corrupt={...structuredClone(casesDoc),presentation:{version:1,scopes:{'root/split/left':{hidden:[],containers:[{id:'bad',name:'foreign',children:['n:right_w'],collapsed:true,x:0,y:0}]}}}};
 const normalized=normalizePresentation(corrupt);
 results.casesModel={crossSiblingContainmentRejected:rejected,containmentRejectedBeforeMutation:containmentAtomic,crossSiblingWireRejected:wireRejected,wireUnchanged:edgeBefore===JSON.stringify(left.edges),validGroup:!!good,foreignImportWarned:normalized.warnings.length>0,foreignImportOriginalRetained:!!normalized.original,foreignMemberRemoved:!normalized.value.scopes['root/split/left'].containers[0].children.length,projectedOriginalTargets:projection.edges.map(e=>e.originalTarget)};
 assert.ok(Object.entries(results.casesModel).filter(([k])=>k!=='projectedOriginalTargets').every(([,v])=>v));
}
{
 const p=normalizePresentation(parentDoc).value.scopes.root,before=JSON.stringify(p);let rejected=false;try{createContainer(parentDoc.graph,p,['n:parent','n:body'],{id:'bad',name:'parent+inner'});}catch{rejected=true;}
 const atomic=JSON.stringify(p)===before;createContainer(parentDoc.graph,p,['n:parent'],{id:'valid',name:'parent capsule'});const projection=projectScope(parentDoc.graph,p,new PresentationSession().state('root'),{inputs:n=>typedInputs(n,parentDoc.graph),outputs:typedOutputs}),cap=projection.nodes.find(n=>n.containerId==='valid');
 results.parentModel={foreignChildContainmentRejected:rejected,atomic,publicInputPorts:cap.inputPorts.map(p=>({nodeId:p.nodeId,input:p.input})),publicOutputPorts:cap.outputPorts.map(p=>({nodeId:p.nodeId,output:p.output})),inputEdge:projection.edges.find(e=>e.id==='outer-input'),resultEdge:projection.edges.find(e=>e.id==='outer-result')};
 assert.equal(rejected,true);assert.equal(atomic,true);assert.deepEqual(results.parentModel.publicInputPorts,[{nodeId:'parent',input:'x'}]);assert.deepEqual(results.parentModel.publicOutputPorts,[{nodeId:'parent',output:'out'}]);assert.equal(results.parentModel.inputEdge.originalTarget,'parent');assert.equal(results.parentModel.resultEdge.originalSource,'parent');
}
{
 const f=fixture();try{
  f.editor.open(casesDoc);const original=semanticKey(f.editor.current());f.editor.jumpKey('root/split/left/left_w');await find(f.host,n=>n.dataset.node==='left_w'&&n.dataset.output==='out').trigger('click');f.editor.jumpKey('root/split/right/right_proof');await find(f.host,n=>n.dataset.node==='right_proof'&&n.dataset.port==='w').trigger('click');
  const doc=f.editor.current(),right=doc.graph.nodes.at(-1).branches[1];results.casesEditor={originalEdgePreserved:right.edges.find(e=>e.input==='w').id==='right_w_wire',semanticUnchanged:semanticKey(doc)===original,foreignNodeNotRendered:!find(f.host,n=>n.dataset.id==='left_w'),scope:f.editor.inspectionSnapshot().scopeId};assert.equal(results.casesEditor.originalEdgePreserved,true);assert.equal(results.casesEditor.semanticUnchanged,true);assert.equal(results.casesEditor.foreignNodeNotRendered,true);await find(f.host,n=>n.textContent==='그룹으로 묶기').trigger('click');await find(f.host,n=>n.textContent==='선택 숨기기').trigger('click');results.casesEditor.semanticAfterPresentation=semanticKey(f.editor.current())===original;assert.equal(results.casesEditor.semanticAfterPresentation,true);fs.writeFileSync(new URL('./design-audit-cases-boundary-after-presentation.json',import.meta.url),JSON.stringify(f.editor.current(),null,2));
 }finally{f.editor.close();}
}
{
 const f=fixture();try{
  f.editor.open(parentDoc);const original=semanticKey(f.editor.current());await find(f.host,n=>n.dataset.node==='n'&&n.dataset.output==='out').trigger('click');await find(find(f.host,n=>n.tagName==='article'&&n.dataset.id==='parent'),n=>n.textContent==='내부 열기').trigger('click');await find(f.host,n=>n.dataset.node==='body'&&n.dataset.port==='x').trigger('click');const doc=f.editor.current();results.parentEditor={innerEdgePreserved:doc.graph.modules[0].edges[0].id==='inner-wire',semanticUnchanged:semanticKey(doc)===original,rootNatNotRendered:!find(f.host,n=>n.dataset.id==='n'),trail:f.editor.presentation().trail};assert.equal(results.parentEditor.innerEdgePreserved,true);assert.equal(results.parentEditor.semanticUnchanged,true);assert.equal(results.parentEditor.rootNatNotRendered,true);f.editor.jumpKey('root/parent');await find(f.host,n=>n.textContent==='그룹으로 묶기').trigger('click');results.parentEditor.semanticAfterPresentation=semanticKey(f.editor.current())===original;assert.equal(results.parentEditor.semanticAfterPresentation,true);fs.writeFileSync(new URL('./design-audit-parent-boundary-after-presentation.json',import.meta.url),JSON.stringify(f.editor.current(),null,2));
 }finally{f.editor.close();}
}
console.log(JSON.stringify(results,null,2));
