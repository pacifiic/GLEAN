// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';import assert from 'node:assert/strict';
import {IsolationRecoveryStore,validateIsolation} from './isolation-recovery.mjs';
import {PresentationSession,normalizePresentation} from './presentation.mjs';
const document=()=>({kind:'graph',graph:{version:3,nodes:[{id:'A'},{id:'B'}],edges:[],modules:[]}});
test('recovery keeps sessions out of document history/export and requires an explicit matching-document load',()=>{
 const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},store=new IsolationRecoveryStore({storage}),doc=document(),session=new PresentationSession();doc.presentation=normalizePresentation(doc).value;session.isolate('root',doc.graph,doc.presentation.scopes.root,['n:A'],{x:4,y:5,zoom:1});const before=JSON.stringify(doc);store.save('document-A',session);assert.equal(JSON.stringify(doc),before);assert.equal(store.load('document-B',doc),null);const saved=store.load('document-A',doc);assert.deepEqual(saved.views.root.frames[0].targets,['A']);assert.equal(session.state('root').frames.length,1);
});
test('changed scopes/targets and malformed viewports are rejected without changing the saved document',()=>{
 const doc=document(),before=JSON.stringify(doc),snapshot={version:1,views:{root:{frames:[{targets:['missing','B'],revealed:['missing','B'],viewport:{x:0,y:0,zoom:1}}]},'module/missing':{frames:[{targets:['A'],revealed:[],viewport:{x:0,y:0,zoom:1}}]}}};const restored=validateIsolation(snapshot,doc);assert.deepEqual(restored.views.root.frames[0].targets,['B']);assert.equal(restored.views['module/missing'],undefined);assert.equal(JSON.stringify(doc),before);snapshot.views.root.frames[0].viewport.zoom=NaN;assert.deepEqual(validateIsolation(snapshot,doc).views,{});
});
test('navigation recovery retains valid child path/selection/viewport and rejects a changed call',()=>{
 const doc=document();doc.graph.nodes.push({id:'call',kind:'module',ref:'M'});doc.graph.modules=[{id:'M',nodes:[{id:'inside',kind:'input'}],edges:[]}];
 const navigation={path:[{kind:'module',id:'M'}],trail:[{scopeId:'root',nodeId:'call',definitionId:'M'}],selected:'inside',selectedOutput:'out',view:{x:60,y:20,zoom:1}};
 const snapshot={version:1,views:{},navigation};assert.deepEqual(validateIsolation(snapshot,doc).navigation,navigation);doc.graph.nodes.at(-1).ref='N';assert.equal(validateIsolation(snapshot,doc).navigation,undefined);
});
