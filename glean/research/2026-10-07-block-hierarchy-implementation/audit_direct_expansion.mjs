// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {harness,find,descendants} from './audit_dom_harness.mjs';
import {semanticDocument} from '../../prototype/web/presentation.mjs';
import {directExpansion} from '../../prototype/web/visibility-tools.mjs';
const cases=[];async function probe(name,run){try{cases.push({name,pass:true,...await run()});}catch(error){cases.push({name,pass:false,error:error.stack});}}
await probe('actual-direct-input-hidden-count-explicit-add-and-hide-preservation',async()=>{
 const h=harness();try{
  const semantic=semanticDocument(h.editor.current()),edges=h.editor.current().graph.edges,requests=h.requests.length;
  h.editor.jumpKey('root/n');await h.click('선택 숨기기');h.editor.jumpKey('root/zero');await h.click('선택 + 직접 입력 보기');
  const status=find(h.host,n=>n.className==='isolation-status'&&n.textContent.includes('정적 포트'));assert.ok(status);assert.ok(status.textContent.includes('직접 추가 0개'));assert.ok(status.textContent.includes('수동 숨긴 관련 1개'));assert.ok(status.textContent.includes('본문 소스 참조 미확정'));
  assert.deepEqual(h.editor.isolationSnapshot().views.root.frames.at(-1).targets,['zero']);
  await h.click('숨긴 관련 항목 명시적으로 추가');assert.ok(find(h.host,n=>n.tagName==='article'&&n.dataset.id==='n'));assert.deepEqual(new Set(h.editor.isolationSnapshot().views.root.frames.at(-1).targets),new Set(['zero','n']));assert.deepEqual(h.editor.current().presentation.scopes.root.hidden,['n:n']);
  await h.click('격리 종료');assert.deepEqual(h.editor.current().presentation.scopes.root.hidden,['n:n']);assert.equal(h.requests.length,requests);assert.deepEqual(h.editor.current().graph.edges,edges);assert.deepEqual(semanticDocument(h.editor.current()),semantic);
  return{status:status.textContent,manualHiddenPreserved:true,semanticAndRealWiresUnchanged:true,additionalRequests:0};
 }finally{h.editor.close();}
});
await probe('actual-direct-users-only-no-transitive-selection',async()=>{
 const h=harness();try{const doc=h.editor.current();doc.graph.nodes.push({id:'use',kind:'script',name:'use',inputs:[{id:'h',name:'h',type:'n + 0 = n'}],outputType:'n + 0 = n',body:'h',x:550,y:100},{id:'after',kind:'script',inputs:[{id:'h',name:'h',type:'n + 0 = n'}],outputType:'n + 0 = n',body:'h',x:780,y:100});doc.graph.edges.push({id:'use-wire',source:'zero',output:'out',target:'use',input:'h'},{id:'after-wire',source:'use',output:'out',target:'after',input:'h'});h.editor.open(doc);h.history.reset(h.editor.current());const semantic=semanticDocument(h.editor.current());h.editor.jumpKey('root/zero');await h.click('선택 + 직접 사용처 보기');const targets=h.editor.isolationSnapshot().views.root.frames.at(-1).targets;assert.deepEqual(new Set(targets),new Set(['zero','use']));assert.ok(!targets.includes('after'));assert.deepEqual(semanticDocument(h.editor.current()),semantic);assert.equal(h.changes.length,0);assert.equal(h.requests.length,0);return{targets,sourceReferenceExplicitUnknown:descendants(h.host).some(n=>n.textContent.includes('본문 소스 참조 미확정')),noTransitiveAfter:true};}finally{h.editor.close();}
});
await probe('source-direct-relation-unknown-range-without-fabricated-proof-wires',async()=>{
 const body={nodes:[{id:'a',kind:'declaration'},{id:'b',kind:'declaration'},{id:'c',kind:'declaration'}],edges:[]},p={hidden:[],containers:[{id:'pair',children:['n:b','n:c']}]};const result=directExpansion(body,p,['c:pair'],'inputs',selected=>({ids:['a','out-of-scope'],unresolved:['Library.unknown']}));assert.deepEqual(result.selected,['b','c']);assert.deepEqual(result.additions,['a']);assert.equal(result.relation,'소스 상수 직접 참조');assert.deepEqual(result.unresolved,['Library.unknown']);assert.equal(body.edges.length,0);return result;
});
const result={kind:'actual visibility menu callbacks with controlled DOM/transport plus pure source relation model; no native UI or Lean',hashes:Object.fromEntries(['typed-editor.mjs','visibility-tools.mjs'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(new URL('../../prototype/web/'+name,import.meta.url))).digest('hex')])),cases,pass:cases.every(c=>c.pass)};fs.writeFileSync(new URL(process.argv[2]??'direct-expansion-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));process.exitCode=result.pass?0:1;
