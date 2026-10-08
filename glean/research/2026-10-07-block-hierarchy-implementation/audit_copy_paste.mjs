// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {harness,find} from './audit_dom_harness.mjs';
import {typedDemo,copyTyped,pasteTyped} from '../../prototype/web/typed-model.mjs';
const cases=[];
async function probe(name,run){try{cases.push({name,pass:true,...await run()});}catch(error){cases.push({name,pass:false,error:error.stack});}}
await probe('actual-copy-paste-in-isolation-and-document-undo',async()=>{
 const h=harness();try{
  h.editor.restoreResult({status:'valid',verified:true});
  h.editor.jumpKey('root/n');await find(h.host,n=>n.tagName==='article'&&n.dataset.id==='zero').fire('click',{shiftKey:true});
  const beforeCopy=h.editor.current(),commits=h.changes.length,requests=h.requests.length;
  await h.click('블록 복사');assert.deepEqual(h.editor.current(),beforeCopy);assert.equal(h.changes.length,commits);assert.equal(h.requests.length,requests);
  const copyStatus=h.statuses.at(-1);
  h.editor.jumpKey('root/spare');await h.click('선택만 보기');const before=h.editor.current();
  await h.click('블록 붙여넣기');const after=h.editor.current(),created=after.graph.nodes.filter(n=>!before.graph.nodes.some(o=>o.id===n.id));
  assert.equal(created.length,2);assert.ok(created.every(n=>!!find(h.host,e=>e.tagName==='article'&&e.dataset.id===n.id)));
  const targets=h.editor.isolationSnapshot().views.root.frames.at(-1).targets;assert.ok(created.every(n=>targets.includes(n.id)));
  const inserted=after.graph.edges.filter(e=>!before.graph.edges.some(o=>o.id===e.id));assert.equal(inserted.length,1);assert.equal(inserted[0].source,created.find(n=>n.kind==='input').id);assert.equal(inserted[0].target,created.find(n=>n.kind==='script').id);assert.deepEqual(after.graph.result,before.graph.result);
  assert.deepEqual(h.history.undo(),before);assert.deepEqual(h.history.redo(),after);
  return{createdIds:created.map(n=>n.id),targets,internalWires:inserted,externalWiresPreserved:true,copyStatus};
 }finally{h.editor.close();}
});
await probe('actual-cross-scope-paste-rejects-before-mutation',async()=>{
 const h=harness();try{h.editor.jumpKey('root/zero');await h.click('블록 복사');await h.click('+ 그래프 부모');const before=h.editor.current(),changes=h.changes.length;await h.click('블록 붙여넣기');assert.deepEqual(h.editor.current(),before);assert.equal(h.changes.length,changes);assert.ok(h.statuses.at(-1)[2].includes('같은 문서'));return{status:h.statuses.at(-1)};}finally{h.editor.close();}
});
await probe('copy-external-wires-not-copied-and-overlimit-atomic',async()=>{
 const graph=typedDemo(),id={documentId:1,scopeId:'root'},clipboard=copyTyped(graph,['zero'],id);assert.equal(clipboard.edges.length,0);for(let i=0;i<254;i++)graph.nodes.push({id:'extra'+i,kind:'nat',value:'0'});const before=structuredClone(graph);let allocations=0;assert.throws(()=>pasteTyped(graph,graph,clipboard,id,()=>{allocations++;return'new'+allocations;}),/256/);assert.deepEqual(graph,before);assert.equal(allocations,0);return{externalWiresExcluded:true,allocationsBeforeLimitRejection:allocations};
});
const report={kind:'actual typed editor/menu/history callbacks with controlled DOM/transport; pure model atomic limit negative; no native UI or Lean',productHashes:Object.fromEntries(['typed-editor.mjs','typed-model.mjs'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(new URL('../../prototype/web/'+name,import.meta.url))).digest('hex')])),cases,pass:cases.every(c=>c.pass)};
fs.writeFileSync(new URL(process.argv[2]??'copy-paste-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.pass?0:1;
