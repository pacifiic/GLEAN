// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {harness,find} from './audit_dom_harness.mjs';
import {parseDocument} from '../../prototype/web/document.mjs';
const hash=text=>crypto.createHash('sha256').update(text).digest('hex'),h=harness();
const original=JSON.parse(fs.readFileSync(new URL('ui-mixed-3-level.json',import.meta.url),'utf8'));
const contracts=doc=>[doc.graph,...doc.graph.modules].map(scope=>({id:scope.id??'root',inputs:scope.inputs,outputType:scope.outputType??scope.goal,result:scope.result,edges:scope.edges,nodes:scope.nodes.map(({body,x,y,...n})=>n)}));
let report;
try{
 h.editor.open(original);h.history.reset(h.editor.current());const before=h.editor.current(),oldBody=before.graph.modules.find(m=>m.id==='leaf').nodes.find(n=>n.id==='proof').body,oldHash=hash(oldBody);
 h.editor.restoreResult({status:'valid',verified:true});h.editor.jumpKey('module/leaf/proof');await h.click('코드 열기');const code=find(h.host,n=>n.tagName==='textarea'&&n.className==='typed-code-full');assert.ok(code);code.value='by\n  exact Nat.add_zero n';await code.fire('input');
 const edited=h.editor.current(),body=edited.graph.modules.find(m=>m.id==='leaf').nodes.find(n=>n.id==='proof').body;assert.notEqual(hash(body),oldHash);assert.deepEqual(contracts(edited),contracts(before));assert.equal(h.results.at(-1),null);
 h.editor.restoreResult({status:'valid',verified:true});await h.click('선택 숨기기');const hidden=h.editor.current();assert.equal(hash(hidden.graph.modules.find(m=>m.id==='leaf').nodes.find(n=>n.id==='proof').body),hash(body));assert.deepEqual(contracts(hidden),contracts(before));assert.equal(h.results.at(-1).verified,true);
 const restored=parseDocument('mixed.json',JSON.stringify(hidden));assert.equal(hash(restored.graph.modules.find(m=>m.id==='leaf').nodes.find(n=>n.id==='proof').body),hash(body));assert.deepEqual(contracts(restored),contracts(before));
 h.history.undo();const undo=h.history.undo();assert.equal(undo.graph.modules.find(m=>m.id==='leaf').nodes.find(n=>n.id==='proof').body,oldBody);h.history.redo();const redo=h.history.redo();assert.equal(redo.graph.modules.find(m=>m.id==='leaf').nodes.find(n=>n.id==='proof').body,body);
 report={kind:'actual typed wide body input/Hide callbacks, shared three-level fixture, real file parser/history; controlled verification result, no new native UI or Lean',pass:true,bodyHashBefore:oldHash,bodyHashAfter:hash(body),contractsAndAllRealEdgesUnchanged:true,bodyEditInvalidates:true,hideKeepsResult:true,jsonRoundtripExact:true,undoRedoExact:true,rootSharedReferences:restored.graph.nodes.filter(n=>n.kind==='module').map(n=>({id:n.id,ref:n.ref}))};
}finally{h.editor.close();}
report.hashes=Object.fromEntries(['typed-editor.mjs','code-editor.mjs','history.mjs'].map(file=>[file,hash(fs.readFileSync(new URL('../../prototype/web/'+file,import.meta.url)))]));fs.writeFileSync(new URL('mixed-body-events-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
