// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
// Execute exact product export/import/load callbacks in an isolated event harness.
// The harness observes browser Blob/anchor calls; it is not a native browser download test.
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {saveVariant,normalizeNotebook} from '../../prototype/web/notebook.mjs';
import {restoreWatches} from '../../prototype/web/proof-review.mjs';
import {parseDocument,validateDocument} from '../../prototype/web/document.mjs';
import {typedDemo} from '../../prototype/web/typed-model.mjs';

const app=readFileSync(new URL('../../prototype/web/app.js',import.meta.url),'utf8');
const section=(from,to)=>{const start=app.indexOf(from);assert.ok(start>=0,from);const end=app.indexOf(to,start+from.length);assert.ok(end>start,to);return app.slice(start,end);};
const download=section('function download(', 'function safeName(');
const exporter=section("$('notebook-export').addEventListener", "$('bookmark-add').addEventListener");
const importer=section("$('file-input').addEventListener", "$('canvas').addEventListener('pointerdown'");
const loader=section('function loadDocument(', app.includes('async function navigateHistory(')?'async function navigateHistory(':'function navigateHistory(');
const a={kind:'graph',graph:typedDemo()},b=structuredClone(a);b.graph.nodes[1].body='by exact Nat.add_zero x';
const record=JSON.parse(readFileSync(new URL('declaration-results.json',import.meta.url))).cases.find(c=>c.id==='R03-Lean-reference').result;
const notebook=saveVariant(saveVariant({},'A',a,record),'B',b,null);
const current={...b,review:{documentId:'handler-audit',watches:[],notebook},verified:true,kernelAccepted:true};
const callbacks={},controls=new Map(),anchors=[],blobs=[],statuses=[],toasts=[],opened=[];
const control=id=>{if(!controls.has(id))controls.set(id,{value:'',hidden:false,textContent:'',classList:{add(){},remove(){}},replaceChildren(){},addEventListener(type,fn){callbacks[id+':'+type]=fn;}});return controls.get(id);};
const context={Blob,structuredClone,crypto:{randomUUID},$:control,mode:'typed',currentDocument:()=>current,
 URL:{createObjectURL(blob){blobs.push(blob);return 'blob:audit-'+blobs.length;},revokeObjectURL(){}},
 element(tag){assert.equal(tag,'a');const anchor={click(){anchors.push({href:this.href,download:this.download});}};return anchor;},
 setTimeout(){return 1;},parseDocument,validateDocument,normalizeNotebook,restoreWatches,
 toast:(...args)=>toasts.push(args),status:(...args)=>statuses.push(args),
 loading:false,restoring:false,verificationEpoch:0,contextObservations:[],sourceGraphSelection:null,
 leanEditor:{close(){}},graphRunner:{cancel(){}},computeGate:{cancel(){},setMode(){}},requestController:null,
 gate:{bump(){}},result:{verified:true},formDirty:false,clearSource(){},setMode(next){context.mode=next;},
 typedEditor:{open(doc){opened.push(structuredClone(doc));},setAutomatic(){}},workspace:{reveal(){}},
 renderNotebook(){},history:{reset(){}},updateHistoryButtons(){},persistDraft(){}};
vm.createContext(context);vm.runInContext(download+loader+exporter+importer,context);
callbacks['notebook-export:click']();assert.equal(blobs.length,1);assert.deepEqual(anchors,[{href:'blob:audit-1',download:'glean-notebook.json'}]);assert.equal(blobs[0].type,'application/json');
const emitted=await blobs[0].text(),decoded=JSON.parse(emitted);assert.deepEqual(decoded.review.notebook,notebook);
writeFileSync(new URL('notebook-exported.json',import.meta.url),emitted);
const file={name:'glean-notebook.json',size:blobs[0].size,text:async()=>emitted},event={target:{files:[file],value:'file'}};
await callbacks['file-input:change'](event);
assert.equal(event.target.value,'');assert.equal(opened.length,1);assert.deepEqual(opened[0].graph,b.graph);
assert.equal(context.result,null);assert.ok(statuses.some(args=>args[0]==='unverified'));assert.equal(context.review.notebook.variants.length,2);
assert.equal(context.review.notebook.variants[0].provenance.historical,true);assert.equal(context.review.notebook.variants[0].document.verified,undefined);
const poisoned=JSON.parse(emitted);poisoned.verified=true;poisoned.kernelAccepted=true;
for(const item of poisoned.review.notebook.variants){item.document.verified=true;item.document.kernelAccepted=true;item.provenance.verified=true;item.provenance.kernelAccepted=true;item.provenance.observedStatus='valid';}
context.result={verified:true};const forged=JSON.stringify(poisoned);await callbacks['file-input:change']({target:{files:[{name:'forged.json',size:Buffer.byteLength(forged),text:async()=>forged}],value:'file'}});
assert.equal(context.result,null);assert.equal(context.review.notebook.variants[0].document.verified,undefined);assert.equal(context.review.notebook.variants[0].provenance.verified,undefined);
const result={appHash:createHash('sha256').update(app).digest('hex'),export:{anchor:anchors[0],mime:blobs[0].type,bytes:blobs[0].size,variants:decoded.review.notebook.variants.map(v=>v.name)},
 import:{opened:opened.length,statuses,notebookVariants:context.review.notebook.variants.length,result:context.result,forgedVerificationDowngraded:true},toasts};
writeFileSync(new URL('notebook-handler-results.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
