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

const results={actualBodyJumps:[],nestedReveal:null};
for(const name of ['type','syntax','syntax_eof_newline','unicode']){
 const saved=JSON.parse(fs.readFileSync(new URL('./design-audit-body-'+name+'-retest.json',import.meta.url))),f=fixture();
 try{
  f.editor.open({kind:'graph',graph:saved.fixture});f.editor.restoreResult(saved.result);
  const diagnostic=saved.result.diagnostics.find(d=>d.bodyLine);
  f.editor.jumpDiagnostic(diagnostic);
  const code=find(f.host,n=>n.tagName==='textarea'&&n.getAttribute('aria-label')==='Lean 코드 본문');
  const body=saved.fixture.nodes[0].body,expected=name==='type'?body.indexOf('exact'):name==='unicode'?body.indexOf('(0'):body.length;
  const row={case:name,bodyLine:diagnostic.bodyLine,bodyColumn:diagnostic.bodyColumn,encoding:diagnostic.columnEncoding,selectionOffset:code.selectionStart,expectedOffset:expected,selectedText:body.slice(code.selectionStart,code.selectionStart+5),activeCode:f.doc.activeElement===code,selectedId:f.editor.presentation().selected,codeTarget:f.editor.presentation().codeTarget,zoom:f.editor.presentation().view.zoom,semanticUnchanged:JSON.stringify(semanticDocument(f.editor.current()))===JSON.stringify(semanticDocument({kind:'graph',graph:saved.fixture}))};
  assert.equal(row.selectionOffset,expected);assert.equal(row.activeCode,true);assert.equal(row.selectedId,'proof');assert.equal(row.codeTarget,'proof');assert.equal(row.semanticUnchanged,true);assert.ok(row.zoom>=.85);results.actualBodyJumps.push(row);
 }finally{f.editor.close();}
}
{
 const f=fixture();try{
  const saved=JSON.parse(fs.readFileSync(new URL('./design-audit-body-unicode-retest.json',import.meta.url))),document={kind:'graph',graph:structuredClone(saved.fixture)};
  document.graph.nodes.push({id:'other',kind:'script',inputs:[],outputType:'True',body:'True.intro',x:600,y:300});document.graph.nodes[0].x=400;document.graph.nodes[0].y=600;
  document.presentation=normalizePresentation(document).value;const p=document.presentation.scopes.root;
  createContainer(document.graph,p,['n:proof'],{id:'inner',name:'inner'});createContainer(document.graph,p,['c:inner'],{id:'outer',name:'outer'});p.containers.forEach(c=>c.collapsed=true);p.hidden=['c:outer'];
  f.editor.open(document);f.editor.jumpKey('root/other');await find(f.host,n=>n.textContent==='선택만 보기').trigger('click');
  const before=f.editor.presentation(),persistent=JSON.stringify(f.editor.current().presentation),semantic=JSON.stringify(semanticDocument(f.editor.current()));
  f.editor.restoreResult(saved.result);f.editor.jumpDiagnostic(saved.result.diagnostics.find(d=>d.bodyLine));
  const code=find(f.host,n=>n.tagName==='textarea'&&n.getAttribute('aria-label')==='Lean 코드 본문');
  assert.equal(code.selectionStart,27);assert.equal(JSON.stringify(f.editor.current().presentation),persistent);assert.equal(JSON.stringify(semanticDocument(f.editor.current())),semantic);
  const temporaryBadge=!!find(f.host,n=>n.textContent==='진단 위치 임시 표시');
  await find(f.host,n=>n.textContent==='캔버스로 돌아가기').trigger('click');
  const revealedCard=!!find(f.host,n=>n.tagName==='article'&&n.dataset.id==='proof');
  await find(f.host,n=>n.textContent==='격리로 돌아가기').trigger('click');const after=f.editor.presentation(),snapshot=f.editor.isolationSnapshot();
  const row={temporaryBadge,temporarilyVisible:revealedCard,collapsedAncestors:f.editor.current().presentation.scopes.root.containers.filter(c=>c.collapsed).map(c=>c.id),persistentPresentationUnchanged:JSON.stringify(f.editor.current().presentation)===persistent,semanticUnchanged:JSON.stringify(semanticDocument(f.editor.current()))===semantic,viewportRestored:JSON.stringify(before.view)===JSON.stringify(after.view),temporaryCleared:!find(f.host,n=>n.textContent==='진단 위치 임시 표시'),originalIsolationTargets:snapshot.views.root.frames.at(-1).targets,proofHiddenAgain:!find(f.host,n=>n.tagName==='article'&&n.dataset.id==='proof')};
  assert.ok(row.temporaryBadge&&row.collapsedAncestors.includes('inner')&&row.collapsedAncestors.includes('outer'));assert.ok(row.temporarilyVisible&&row.persistentPresentationUnchanged&&row.semanticUnchanged&&row.viewportRestored&&row.temporaryCleared&&row.proofHiddenAgain);assert.deepEqual(row.originalIsolationTargets,['other']);results.nestedReveal=row;
 }finally{f.editor.close();}
}
console.log(JSON.stringify(results,null,2));
