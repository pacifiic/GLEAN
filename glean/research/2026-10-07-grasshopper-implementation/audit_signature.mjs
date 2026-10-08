// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
// Independent model, history, and document roundtrip check; not browser/kernel evidence.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {editSignature} from '../../prototype/web/typed-model.mjs';
import {DocumentHistory} from '../../prototype/web/history.mjs';
import {validateDocument} from '../../prototype/web/document.mjs';

const cases=JSON.parse(readFileSync(new URL('typed-dependent-nat-results.json',import.meta.url))).cases;
const original=structuredClone(cases.find(c=>c.expected==='valid'&&c.fixture.modules?.length)?.fixture);
assert.ok(original);
const graph=structuredClone(original),beforeWires=JSON.stringify(graph.edges),definition=graph.modules[0];
const doc={kind:'graph',graph},history=new DocumentHistory();history.reset(doc);
const parameters=[{id:'n',name:'limit',type:'Nat'},{id:'i',name:'idx',type:'Fin limit'}];
const affected=editSignature(graph,definition.id,parameters,'idx.val < limit');
assert.deepEqual(affected.sort(),['root/callA','root/callB']);
assert.equal(JSON.stringify(graph.edges),beforeWires);
history.commit(doc);
const undo=history.undo();assert.deepEqual(undo.graph.modules[0].inputs,original.modules[0].inputs);
const redo=history.redo();assert.deepEqual(redo.graph.modules[0].inputs,parameters);
const parsed=JSON.parse(JSON.stringify(redo));assert.equal(validateDocument(parsed),null);
const reordered=structuredClone(parsed.graph);
const reorderedAffected=editSignature(reordered,definition.id,[parameters[1],parameters[0]],'idx.val < limit');
assert.equal(JSON.stringify(reordered.edges),beforeWires);
assert.equal(reordered.modules[0].inputs[0].id,'i');
const deleted=structuredClone(parsed.graph);
editSignature(deleted,definition.id,[parameters[0]],'True');
assert.equal(deleted.edges.filter(e=>e.input==='i').length,2);
const report={renamed:{affected,fixture:parsed.graph},undoRedoRestoresExactInputs:true,
  preservesWires:true,roundtrip:true,reordered:{affected:reorderedAffected,fixture:reordered},
  deletedPort:{preservedInvalidWires:2,fixture:deleted}};
writeFileSync(new URL('signature-model-results.json',import.meta.url),JSON.stringify(report,null,2));
console.log('R08 model names/dependent types/order/deletion/history/roundtrip PASS');
