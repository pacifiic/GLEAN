// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {harness,find} from './audit_dom_harness.mjs';
import {semanticKey} from '../../prototype/web/history.mjs';
const h=harness(),before=h.editor.current(),key=semanticKey(before),changes=h.changes.length;
const record={kind:'actual typed selection/Hide/isolate/all-show/Undo command callbacks, controlled DOM; no native UI or kernel',cases:[]};
try{
 assert.equal(find(h.host,n=>n.tagName==='button'&&n.textContent==='선택만 보기').disabled,true);assert.equal(h.changes.length,changes);record.cases.push({id:'empty-selection-command-disabled-no-edit',pass:true});
 h.editor.jumpKey('root/spare');await h.click('선택 숨기기');h.editor.jumpKey('root/zero');await find(h.host,n=>n.tagName==='article'&&n.dataset.id==='n').fire('click',{shiftKey:true});await h.click('선택만 보기');const initial=structuredClone(h.editor.isolationSnapshot().views.root.frames);assert.deepEqual(new Set(initial[0].targets),new Set(['n','zero']));await find(h.host,n=>n.tagName==='article'&&n.dataset.id==='n').fire('click');assert.deepEqual(h.editor.isolationSnapshot().views.root.frames,initial);record.cases.push({id:'actual-selection-change-does-not-mutate-frozen-targets',pass:true,targets:initial[0].targets});
 await h.click('선택 숨기기');await find(h.host,n=>n.tagName==='article'&&n.dataset.id==='zero').fire('click');await h.click('선택 숨기기');assert.equal(!!find(h.host,n=>n.tagName==='article'),false);assert.ok(find(h.host,n=>n.textContent==='격리 종료'));assert.equal(find(h.host,n=>n.textContent==='현재 캔버스 전부 표시').disabled,false);record.cases.push({id:'all-manually-hidden-targets-retain-escape-commands',pass:true});
 const hidden=h.editor.current();await h.click('현재 캔버스 전부 표시');assert.deepEqual(h.editor.current().presentation.scopes.root.hidden,[]);assert.ok(!find(h.host,n=>n.textContent==='격리 종료'));assert.equal(semanticKey(h.editor.current()),key);assert.deepEqual(h.editor.current().graph.edges,before.graph.edges);assert.equal(h.requests.length,0);record.cases.push({id:'all-show-ends-isolation-clears-manual-hide-without-semantic-or-http-change',pass:true});
 const undo=h.history.undo();h.editor.open(undo);assert.deepEqual(new Set(h.editor.current().presentation.scopes.root.hidden),new Set(hidden.presentation.scopes.root.hidden));assert.ok(!find(h.host,n=>n.textContent==='격리 종료'));assert.equal(find(h.host,n=>n.textContent==='현재 캔버스 전부 표시').disabled,false);record.cases.push({id:'all-show-undo-restores-manual-hides-and-keeps-ended-isolation-separate',pass:true});
}finally{h.editor.close();}
record.hashes=Object.fromEntries(['typed-editor.mjs','visibility-tools.mjs','presentation.mjs','history.mjs'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(new URL('../../prototype/web/'+file,import.meta.url))).digest('hex')]));fs.writeFileSync(new URL('isolation-command-results.json',import.meta.url),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record,null,2));
