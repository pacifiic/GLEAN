// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {parseSourceBytes,currentSourceBytes,originalBytes} from '../../prototype/web/source-bytes.mjs';
import {parseDocument,validateDocument} from '../../prototype/web/document.mjs';
import {DocumentHistory} from '../../prototype/web/history.mjs';
import {DraftStore} from '../../prototype/web/draft.mjs';
import {initLeanEditor} from '../../prototype/web/lean-editor.mjs';
import {MAX_SOURCE_BYTES,MAX_DOCUMENT_BYTES} from '../../prototype/web/limits.mjs';
class Element{
 constructor(){this.value='';this.textContent='';this.children=[];this.listeners={};this.selectionStart=0;this.scrollTop=0;this.classList={toggle(){}};}
 addEventListener(type,f){this.listeners[type]=f;}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}
 setSelectionRange(start,end=start){this.selectionStart=start;this.selectionEnd=end;}setAttribute(k,v){this[k]=v;}focus(){globalThis.document.activeElement=this;}
}
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
globalThis.document={getElementById:get,createElement:()=>new Element()};globalThis.window={addEventListener(){},sessionStorage:storage};
let session=0;const requests=[];globalThis.fetch=async(url,options={})=>{requests.push({url,body:options.body?JSON.parse(options.body):null});return{ok:true,json:async()=>url.endsWith('/projects')?{projects:[{id:'glean',available:true}]}:url.endsWith('/open')?{sessionId:'fake-'+(++session),version:1,declarations:[]}:{closed:true}};};
const editor=initLeanEditor({onChange(){},onResult(){},onStatus(){},onDiagnostics(){},onReveal(){}}),history=new DocumentHistory(),drafts=new DraftStore({storage,validate:validateDocument});
const app=fs.readFileSync(new URL('../../prototype/web/app.js',import.meta.url),'utf8');
const extract=(from,to)=>{const a=app.indexOf(from),b=app.indexOf(to,a);assert.ok(a>=0&&b>a);return app.slice(a,b);};
const toasts=[],statuses=[],downloads=[];
const context={$:get,parseSourceBytes,parseDocument,validateDocument,currentSourceBytes,originalBytes,MAX_SOURCE_BYTES,MAX_DOCUMENT_BYTES,TextDecoder,TextEncoder,Uint8Array,structuredClone,crypto,mode:'lean',originDisplayGeneration:0,sourceAnalysis:{loadCache(){}},leanEditor:editor,typedEditor:{close(){},setAutomatic(){}},graphRunner:{cancel(){}},computeGate:{cancel(){},setMode(){}},gate:{bump(){}},requestController:null,result:null,formDirty:false,loading:false,restoring:false,verificationEpoch:0,contextObservations:[],sourceGraphSelection:null,review:{},history,toast:(...args)=>toasts.push(args),status:(...args)=>statuses.push(args),renderPresentationWarning(){},renderLeanResult(){},setMode(value){context.mode=value;},workspace:{reveal(){}},restoreWatches:v=>v??[],normalizeNotebook:v=>v??{variants:[],steps:[]},renderNotebook(){},updateHistoryButtons(){},persistDraft(){return drafts.save(context.currentDocument());},download:(name,bytes,mime)=>downloads.push({name,bytes:Uint8Array.from(bytes),mime})};
vm.createContext(context);vm.runInContext([
 extract('function currentDocument()','\nfunction updateHistoryButtons'),
 extract('function loadDocument(','\nasync function navigateHistory'),
 extract('function renderSourceFileBlock(','\nfunction renderTypedResult'),
 extract("$('save-button').addEventListener", "\n$('canvas').addEventListener"),
 app.slice(app.indexOf("$('lean-file-open').addEventListener"))
].join('\n'),context);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),rows=[];
async function importFile(name,bytes){await get('file-input').listeners.change({target:{value:'chosen',files:[{name,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}]}});await new Promise(r=>setImmediate(r));}
try{
 for(const name of ['RawPreserved.lean','RawInvalidUtf8.lean']){
  const bytes=fs.readFileSync(new URL('./ui-fixtures/'+name,import.meta.url)),expected=hash(bytes);await importFile(name,bytes);const imported=editor.current();
  assert.equal(hash(originalBytes(imported)),expected);assert.equal(hash(currentSourceBytes(imported)),expected);assert.equal(get('lean-file-block').hidden,false);assert.equal(get('lean-source-content').hidden,true);
  if(imported.sourceOrigin.decoding==='utf-8'){get('lean-file-open').listeners.click();assert.equal(get('lean-source-content').hidden,false);get('lean-file-back').listeners.click();}else{assert.equal(get('lean-file-open').disabled,true);assert.equal(get('lean-file-index').disabled,true);assert.equal(get('check-button').disabled,true);}
  get('lean-file-original').listeners.click();get('save-button').listeners.click();get('export-button').listeners.click();
  for(const downloaded of downloads.slice(-3))assert.equal(hash(downloaded.bytes),expected);
  const json=parseDocument('Reopen.glean.json',JSON.stringify(context.currentDocument()));assert.equal(hash(originalBytes(json)),expected);assert.equal(hash(currentSourceBytes(json)),expected);
  const recovered=drafts.load().document;assert.equal(hash(originalBytes(recovered)),expected);assert.equal(hash(currentSourceBytes(recovered)),expected);
  const restored=structuredClone(context.currentDocument());restored.source+='-- edit\n';history.commit(restored);const undone=history.undo();assert.equal(hash(originalBytes(undone)),expected);assert.equal(hash(currentSourceBytes(undone)),expected);
  const row={name,bytes:bytes.length,sha256:expected,originHash:imported.sourceOrigin.sha256,decoding:imported.sourceOrigin.decoding,bom:imported.sourceOrigin.bom,fileBlockMeta:get('lean-file-meta').textContent,sourceTextIncludesReplacement:imported.source.includes('�'),actualImportOpenBackSaveExportPass:true,jsonRoundTripPass:true,draftRecoveryPass:true,undoPass:true,originalBytesAfterEdit:hash(originalBytes(restored)),currentBytesAfterEditDiffer:hash(currentSourceBytes(restored))!==expected};
  assert.equal(row.originalBytesAfterEdit,expected);assert.equal(row.currentBytesAfterEditDiffer,true);rows.push(row);
 }
 const sizes=[];for(const size of [65536,1048576,8388608]){const doc=await parseSourceBytes('Big.lean',new Uint8Array(size).fill(32));let error=null;try{error=validateDocument(doc);}catch(e){error=e.name+': '+e.message;}sizes.push({size,validated:error===null,error});}
 const valid=await parseSourceBytes('Metadata.lean',new TextEncoder().encode('theorem t : True := True.intro\n')),malformed=[];
 for(const [name,change] of [['missingHash',d=>delete d.sourceOrigin.sha256],['wrongHash',d=>d.sourceOrigin.sha256='0'.repeat(64)],['wrongByteLength',d=>d.sourceOrigin.byteLength=999],['wrongDecoding',d=>d.sourceOrigin.decoding='invalid-utf8']]){const doc=structuredClone(valid);change(doc);malformed.push({name,error:validateDocument(doc)});}
 const wrong=structuredClone(valid);wrong.sourceOrigin.sha256='0'.repeat(64);await importFile('WrongHash.glean.json',Buffer.from(JSON.stringify(wrong)));await new Promise(r=>setTimeout(r,20));const originCorrection={display:get('lean-file-origin').textContent,actualHash:hash(originalBytes(wrong)),mismatchWarning:toasts.some(args=>args[0].includes('원본 hash')&&args[1]===true)};assert.ok(originCorrection.display.includes(originCorrection.actualHash)&&originCorrection.display.includes('불일치')&&originCorrection.mismatchWarning);
 const result={originCorrection,kind:'actual app import/load/currentDocument/file-block/open/back/save/export callbacks, actual Lean editor with controlled transport; real DraftStore/DocumentHistory; no native UI or Lean process',appHash:hash(Buffer.from(app)),fixtures:rows,sizes,malformedOriginValidation:malformed,toasts,statuses,transportRequests:requests.map(x=>x.url)};
 fs.writeFileSync(new URL(process.argv[2]??'design-audit-source-bytes-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({fixtures:rows,sizes,malformedOriginValidation:malformed,originCorrection},null,2));
}finally{await editor.close();}
