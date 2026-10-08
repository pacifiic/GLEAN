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


const {default:vm}=await import('node:vm');
const {DocumentHistory,semanticKey}=await import('../../prototype/web/history.mjs');
const {validateDocument}=await import('../../prototype/web/document.mjs');
const {validateIsolation}=await import('../../prototype/web/isolation-recovery.mjs');
const {ensureDocumentIdentity}=await import('../../prototype/web/proof-review.mjs');
const app=fs.readFileSync(new URL('../../prototype/web/app.js',import.meta.url),'utf8'),extract=(from,to)=>{const a=app.indexOf(from),b=app.indexOf(to,a);assert.ok(a>=0&&b>a);return app.slice(a,b);};
const f=fixture(),elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element('div',f.doc));return elements.get(id);},controllerStatuses=[],history=new DocumentHistory();
const context={$:get,typedEditor:f.editor,sourceAnalysis:{close(){}},leanEditor:{close(){}},graphRunner:{cancel(){}},computeGate:{cancel(){},setMode(){}},gate:{bump(){}},requestController:null,mode:'typed',review:{},result:null,formDirty:false,loading:false,restoring:false,verificationEpoch:0,contextObservations:[],sourceGraphSelection:null,activeModuleId:null,view:{x:0,y:0,zoom:1},history,crypto,structuredClone,validateDocument,validateIsolation,ensureDocumentIdentity,semanticKey,canReuseVerifiedResult:()=>false,restoreWatches:x=>x??[],normalizeNotebook:x=>x??{variants:[],steps:[]},renderPresentationWarning(){},setMode:m=>context.mode=m,clearSource(){},status:(...args)=>controllerStatuses.push(args),workspace:{reveal(){}},renderNotebook(){},updateHistoryButtons(){},persistDraft(){},toast(){},fetch:async()=>({ok:false})};
vm.createContext(context);vm.runInContext([extract('function currentDocument()','\nfunction updateHistoryButtons'),extract('function loadDocument(','\nasync function navigateHistory'),extract('async function navigateHistory(','\nfunction renderNotebook')].join('\n'),context);
try{
 context.loadDocument({kind:'graph',graph:typedDemo()});const controllerId=context.review.documentId,editorId=f.editor.current().review?.documentId??null;f.editor.jumpKey('root/zero');await find(f.host,n=>n.textContent==='블록 복사').trigger('click');
 const edit=context.currentDocument();edit.graph.name+=' edited';context.history.commit(edit);context.loadDocument(edit,false);await context.navigateHistory();const beforePaste=f.editor.current().graph.nodes.length;await find(f.host,n=>n.textContent==='블록 붙여넣기').trigger('click');const afterPaste=f.editor.current().graph.nodes.length,undoRetainedDocumentId=history.current().review.documentId===controllerId,sameDocumentPasteStatus=f.statuses.at(-1)??null;
 context.loadDocument({kind:'graph',graph:typedDemo()});const distinctId=context.review.documentId,beforeForeign=f.editor.current().graph.nodes.length;await find(f.host,n=>n.textContent==='블록 붙여넣기').trigger('click');
 const {createHash}=await import('node:crypto');const productHashes=Object.fromEntries(['app.js','typed-editor.mjs','typed-model.mjs','proof-review.mjs'].map(name=>[name,createHash('sha256').update(fs.readFileSync(new URL('../../prototype/web/'+name,import.meta.url))).digest('hex')]));
 const results={productHashes,executedAt:new Date().toISOString(),kind:'actual app loadDocument/currentDocument/navigateHistory and actual typed editor callbacks; real DocumentHistory; controlled DOM, no Lean job',controllerId,editorIdAtFirstOpen:editorId,identityInitializedBeforeOpen:editorId===controllerId,undoRetainedDocumentId,nodesBeforeSameDocumentPaste:beforePaste,nodesAfterSameDocumentPaste:afterPaste,sameDocumentPasteAccepted:afterPaste===beforePaste+1,sameDocumentPasteStatus,distinctDocumentId:distinctId!==controllerId,foreignPasteAtomicReject:f.editor.current().graph.nodes.length===beforeForeign,foreignPasteStatus:f.statuses.at(-1)};
 assert.ok(results.identityInitializedBeforeOpen&&results.undoRetainedDocumentId&&results.sameDocumentPasteAccepted&&results.distinctDocumentId&&results.foreignPasteAtomicReject);
 fs.writeFileSync(new URL(process.argv[2]??'design-audit-copy-controller-results.json',import.meta.url),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
}finally{f.editor.close();}
