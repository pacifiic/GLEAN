// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import {dependencyIds, inspectNode, pinWatch, previewIds,ensureDocumentIdentity} from './proof-review.mjs';

test('document identity exists before editor open, survives Undo, and differs for a new import',()=>{const original={kind:'graph',graph:{}},prepared=ensureDocumentIdentity(original);assert.equal(typeof prepared.review.documentId,'string');assert.equal(original.review,undefined);assert.equal(ensureDocumentIdentity(structuredClone(prepared)).review.documentId,prepared.review.documentId);assert.notEqual(ensureDocumentIdentity(original).review.documentId,prepared.review.documentId);});

const graph=()=>({version:1,name:'test',propositions:['P','Q'],assumptions:[{id:'hp',type:'P'},{id:'f',type:'P → Q'},{id:'unused',type:'Q'}],goal:'Q',nodes:[{id:'hp',kind:'assumption',ref:'hp'},{id:'f',kind:'assumption',ref:'f'},{id:'unused',kind:'assumption',ref:'unused'},{id:'a',kind:'apply'},{id:'goal',kind:'goal'}],edges:[{id:'1',source:'hp',target:'a',input:'arg'},{id:'2',source:'f',target:'a',input:'fn'},{id:'3',source:'a',target:'goal',input:'proof'}]});
test('dependency preview includes only actual ancestors and survives malformed cycles',()=>{
  const g=graph();assert.deepEqual([...dependencyIds(g,['a'])].sort(),['a','f','hp']);
  g.edges.push({source:'a',target:'f',input:'bad'});assert.equal(dependencyIds(g,['a']).size,3);
  assert.equal(dependencyIds(g,['missing']).size,0);
});
test('inspector reports actual producers, declared inputs, assumptions, source and diagnostics',()=>{
  const g=graph(),result={nodeTypes:{a:'Q',hp:'P',f:'P → Q'},generatedCode:'line1\n  let n : Q := f hp\n',sourceMap:{a:{startLine:2,endLine:2}},diagnostics:[{nodeId:'a',port:'arg',message:'bad argument'}]};
  const info=inspectNode(g,'a',result);
  assert.equal(info.type,'Q');assert.deepEqual(info.assumptions.map(a=>a.id),['hp','f']);
  assert.equal(info.inputs.find(p=>p.id==='arg').source,'hp');
  assert.equal(info.inputs.find(p=>p.id==='arg').actualType,'P');
  assert.match(info.source,/f hp/);assert.equal(info.diagnostics.length,1);
  assert.equal(inspectNode(g,'a',null).type,null);
});
test('inspector uses formal module types and never guesses compatibility from matching text',()=>{
  const g=graph();g.modules=[{id:'m',name:'module',inputs:[{id:'x',name:'value',type:'P'}],outputType:'Q'}];
  g.nodes.push({id:'m1',kind:'module',ref:'m'});
  const info=inspectNode(g,'m1',null);assert.equal(info.inputs[0].expectedType,'P');
  assert.equal(info.inputs[0].compatibility,'unchecked');assert.equal(info.inputs[0].source,null);
});
test('two watch pins are detached snapshots with document/scope identity and explicit stale state',()=>{
  const g=graph();let pins=[];pins=pinWatch(pins,{documentId:'doc',scopeId:'root',nodeId:'a',evidence:inspectNode(g,'a',null),revision:'r1'});
  pins=pinWatch(pins,{documentId:'doc',scopeId:'root',nodeId:'hp',evidence:inspectNode(g,'hp',null),revision:'r1'});
  pins=pinWatch(pins,{documentId:'doc',scopeId:'root',nodeId:'f',evidence:inspectNode(g,'f',null),revision:'r1'});
  assert.deepEqual(pins.map(p=>p.nodeId),['hp','f']);g.assumptions[0].type='Q';assert.equal(pins[0].evidence.type,'P');
  pins=pinWatch(pins,{...pins[0],revision:'r2'});assert.equal(pins.length,2);assert.equal(pins.at(-1).revision,'r2');
});
test('preview modes never mutate graph topology and default to the full graph',()=>{
  const g=graph(),before=JSON.stringify(g);assert.equal(previewIds(g,'all',['a']).size,5);
  assert.deepEqual([...previewIds(g,'selected',['a'])],['a']);assert.equal(previewIds(g,'dependencies',['a']).size,3);
  assert.equal(JSON.stringify(g),before);
});
test('restored Watch snapshots lose current-session verification regardless of saved flags',async()=>{
 const {restoreWatches}=await import('./proof-review.mjs');
 const pins=[{documentId:'d',scopeId:null,nodeId:'n',revision:'x',snapshot:{name:'n',id:'n',inputs:[],assumptions:[],verification:'verified-document'}}];
 const restored=restoreWatches(pins);assert.equal(restored[0].snapshot.verification,'historical');assert.equal(pins[0].snapshot.verification,'verified-document');
});
test('two outputs of one typed component keep distinct Watch identities',()=>{let pins=[];for(const outputId of ['left','right'])pins=pinWatch(pins,{documentId:'typed',scopeId:'root',nodeId:'pair',outputId,revision:'same',snapshot:{name:'pair '+outputId,id:'pair',outputId,inputs:[],assumptions:[]}});assert.equal(pins.length,2);assert.deepEqual(pins.map(p=>p.outputId),['left','right']);});
test('verified memory results require the same freshly read actual Lean environment',async()=>{const {canReuseVerifiedResult}=await import('./proof-review.mjs');const result={verified:true,environment:{environmentHash:'current'}};assert.equal(canReuseVerifiedResult(result,{environmentHash:'current'}),true);assert.equal(canReuseVerifiedResult(result,{environmentHash:'changed'}),false);assert.equal(canReuseVerifiedResult(result,null),false);assert.equal(canReuseVerifiedResult({verified:true},{}),false);});
