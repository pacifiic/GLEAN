// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parseDocument,validateDocument} from '../../prototype/web/document.mjs';
import {DraftStore} from '../../prototype/web/draft.mjs';
import {DocumentHistory} from '../../prototype/web/history.mjs';
import {MAX_BODY_BYTES,MAX_DOCUMENT_BYTES} from '../../prototype/web/limits.mjs';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const report={kind:'actual frontend parse/validation/history/autosave APIs, controlled byte-quota storage; no native UI or Lean',cases:[],hashes:{}};
for(const file of ['limits.mjs','document.mjs','typed-model.mjs','history.mjs','draft.mjs'])report.hashes[file]=hash(fs.readFileSync(new URL('../../prototype/web/'+file,import.meta.url)));
for(const size of ['64k','1m']){
 const text=fs.readFileSync(new URL('fixtures/code-body-'+size+'.glean.json',import.meta.url),'utf8'),doc=parseDocument('long.glean.json',text),body=doc.graph.nodes[1].body,memory=new Map();
 const storage={getItem:key=>memory.get(key)??null,setItem(key,value){if(Buffer.byteLength(value)>5*1024*1024)throw Error('controlled 5 MiB quota exceeded');memory.set(key,value);}};
 const drafts=new DraftStore({storage,validate:validateDocument}),history=new DocumentHistory();history.reset(doc);assert.equal(drafts.save(doc).ok,true);
 const edit=structuredClone(doc);edit.graph.nodes[1].body=body.replace(/exact Nat.add_zero n$/, 'exact True.intro');history.commit(edit);assert.equal(drafts.save(edit).ok,true);
 assert.equal(drafts.load().document.graph.nodes[1].body,edit.graph.nodes[1].body);assert.equal(drafts.recoverPrevious().document.graph.nodes[1].body,body);
 assert.equal(history.undo().graph.nodes[1].body,body);assert.equal(history.redo().graph.nodes[1].body,edit.graph.nodes[1].body);
 const snapshotBytes=Buffer.byteLength([...memory.values()][0]),overBody=structuredClone(edit);overBody.graph.nodes[1].body='x'.repeat(MAX_BODY_BYTES+1);assert.equal(drafts.save(overBody).ok,true);assert.equal(drafts.load().document.graph.nodes[1].body,overBody.graph.nodes[1].body);
 const quotaFailure=structuredClone(overBody);quotaFailure.graph.nodes[1].body='x'.repeat(6*1024*1024);assert.equal(drafts.save(quotaFailure).ok,false);assert.equal(drafts.load().document.graph.nodes[1].body,overBody.graph.nodes[1].body);
 const exported=JSON.stringify(doc),reopened=parseDocument('roundtrip.json',exported);assert.equal(hash(reopened.graph.nodes[1].body),hash(body));assert.ok(Buffer.byteLength(exported)<MAX_DOCUMENT_BYTES);
 report.cases.push({size,pass:true,bodyBytes:Buffer.byteLength(body),bodyHash:hash(body),jsonBytes:Buffer.byteLength(exported),autosaveCurrentPlusPreviousBytes:snapshotBytes,controlledQuotaBytes:5*1024*1024,overBodyLimitRawDraftPreserved:true,quotaFailurePreservesLastGood:true,historyUndoRedoExact:true,exportReimportHashExact:true});
}
fs.writeFileSync(new URL('long-frontend-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
