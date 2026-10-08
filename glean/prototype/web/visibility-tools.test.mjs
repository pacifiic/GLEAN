// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';import assert from 'node:assert/strict';
import {diagnosticVisibility,manuallyHidden,directExpansion} from './visibility-tools.mjs';
test('real Lean graph locations distinguish visible, outside and unknown errors',()=>{
 const graph={nodes:[{id:'proof'},{id:'other'}]},view={visibleIds:['proof']};
 assert.deepEqual(diagnosticVisibility([{severity:'error',graphLocation:'root/proof'},{severity:'error',graphLocation:'root/other/out'},{severity:'error',graphLocation:'module/M/proof'},{severity:'error',message:'unmapped'}],'root',graph,view),{inside:1,outside:2,unknown:1});
});
test('a descendant of a manually hidden outer container is marked manual rather than collapsed',()=>{
 const p={hidden:['c:outer'],containers:[{id:'outer',children:['c:inner']},{id:'inner',children:['n:proof']}]};assert.equal(manuallyHidden(p,'proof'),true);assert.equal(manuallyHidden(p,'other'),false);
});
test('direct expansion uses only same-scope adjacent wires and does not silently reveal manual Hide',()=>{
 const graph={nodes:['a','b','c','other'].map(id=>({id,kind:'script'})),edges:[{source:'a',target:'b'},{source:'b',target:'c'},{source:'foreign',target:'b'}]},p={hidden:['n:a'],containers:[]};
 assert.deepEqual(directExpansion(graph,p,['n:b'],'inputs'),{selected:['b'],additions:[],hidden:['a'],unresolved:[],relation:'정적 포트 연결',sourceUnknown:true});
 assert.deepEqual(directExpansion(graph,p,['n:b'],'users').additions,['c']);
});
test('source references are declared separately, remain direct, and unresolved names never become proof wires',()=>{
 const graph={nodes:['a','b','c'].map(id=>({id,kind:'declaration'})),edges:[]},p={hidden:[],containers:[]};
 const result=directExpansion(graph,p,['n:b'],'inputs',()=>({ids:['a'],unresolved:['Library.external']}));
 assert.deepEqual(result,{selected:['b'],additions:['a'],hidden:[],unresolved:['Library.external'],relation:'소스 상수 직접 참조',sourceUnknown:false});assert.equal(graph.edges.length,0);
});
