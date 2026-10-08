// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_SOURCE_BYTES} from './limits.mjs';
import {parseDocument, validateDocument, sourcePosition, positionOffset} from './document.mjs';
const graph = {version:1,name:'x',propositions:['P'],assumptions:[],goal:'P',nodes:[{id:'g',kind:'goal',x:0,y:0}],edges:[]};
test('Lean files retain arbitrary mathematical syntax without JSON parsing', () => {
  const source = 'import Mathlib.Analysis.Real.Pi.Irrational\ntheorem pi_test : Irrational Real.pi := irrational_pi\n';
  const doc = parseDocument('Pi.lean', source);
  assert.equal(doc.kind,'lean'); assert.equal(doc.source,source); assert.equal(doc.projectId,'mathlib');
});
test('graph and saved Lean documents round trip with validated discriminants', () => {
  assert.deepEqual(parseDocument('x.json',JSON.stringify(graph)),{kind:'graph',graph});
  const doc={kind:'lean',filename:'x.lean',source:'example : ∀ n : Nat, n = n := by simp',projectId:'glean',target:''};
  assert.deepEqual(parseDocument('x.glean.json',JSON.stringify(doc)),doc);
  assert.equal(validateDocument({...doc,projectId:'../../secret'}).length>0,true);
  assert.equal(validateDocument({...doc,policy:'strict'}),null);
  assert.ok(validateDocument({...doc,policy:'ignore-all'}));
  assert.throws(()=>parseDocument('x.lean','a'.repeat(MAX_SOURCE_BYTES+1)),/8 MiB/);
});
test('UTF-16 cursor positions match Lean LSP and clamp jumps to actual lines', () => {
  const source='α𝒙\n  exact h\n';
  assert.deepEqual(sourcePosition(source,6),{line:1,character:2});
  assert.equal(positionOffset(source,1,2),6);
  assert.equal(positionOffset(source,1,99),13);
  assert.equal(positionOffset(source,99,99),source.length);
});
test('pending graph forms can recover but invalid graph documents cannot', () => {
  assert.equal(validateDocument({kind:'graph',graph,form:{name:'',propositions:'P',goal:'∀ n, n=n',assumptions:[]}}),null);
  assert.ok(validateDocument({kind:'graph',graph:{...graph,nodes:[]}}));
  assert.throws(()=>parseDocument('notes.txt','hello'),/\.lean/);
});
test('named notebook variants validate their actual document before compare or restore',()=>{const base={kind:'lean',filename:'Main.lean',source:'theorem x : True := True.intro',projectId:'glean',target:'x',review:{documentId:'d',watches:[],notebook:{variants:[{name:'A',document:{kind:'lean',source:[],filename:'A.lean',projectId:'glean',target:'x'}}],steps:[]}}};assert.ok(validateDocument(base));base.review.notebook.variants[0].document={kind:'graph',graph};assert.equal(validateDocument(base),null);});
