// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
// Independent comparison and exact product renderer test. DOM is a harness stub.
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeNotebook,compareVariants,saveVariant} from '../../prototype/web/notebook.mjs';
const app=readFileSync(new URL('../../prototype/web/app.js',import.meta.url),'utf8');
const start=app.indexOf('function renderNotebook()'),end=app.indexOf('function renderLeanDiagnostics(',start);assert.ok(start>=0&&end>start);
const renderer=app.slice(start,end);
const report={appHash:createHash('sha256').update(app).digest('hex'),cases:[]};
const exported=JSON.parse(readFileSync(new URL('notebook-exported.json',import.meta.url)));
const records=JSON.parse(readFileSync(new URL('design-audit-metadata-retest.json',import.meta.url))).cases.filter(c=>['unused-argument','Cases-metadata'].includes(c.id));
const known=records.reduce((state,c)=>saveVariant(state,c.id,{kind:'graph',graph:c.fixture},c.result),{});
for(const spec of [{id:'missing-source-environment',notebook:exported.review.notebook,available:false},{id:'known-source-environment',notebook:known,available:true}]){
 const notebook=normalizeNotebook(spec.notebook),comparison=compareVariants(notebook);assert.equal(comparison.sourceComparisonAvailable,spec.available);assert.equal(comparison.environmentComparisonAvailable,spec.available);
 if(!spec.available){assert.deepEqual(comparison.source,[]);assert.equal(comparison.environmentChanged,null);}else assert.ok(comparison.source.length>0);
 const node=(tag,className='',text='')=>({tag,className,text,children:[],value:'',append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},addEventListener(){}}),list=node('div');
 const ctx={$:id=>{assert.equal(id,'notebook-list');return list;},review:{notebook},element:node,normalizeNotebook,compareVariants};vm.createContext(ctx);vm.runInContext(renderer+'\nrenderNotebook();',ctx);
 const walk=n=>[n,...n.children.flatMap(walk)],card=walk(list).find(n=>n.className==='inspection-card notebook-diff');assert.ok(card);const messages=walk(card).map(n=>n.text).filter(Boolean);
 if(!spec.available){assert.ok(messages.some(t=>t.includes('소스 비교 불가 · 기록 없음')&&t.includes('환경 비교 불가 · 기록 없음')));assert.ok(!messages.some(t=>t.startsWith('Lean L')));}else assert.ok(messages.some(t=>t.startsWith('Lean L')));
 report.cases.push({id:spec.id,sourceComparisonAvailable:comparison.sourceComparisonAvailable,environmentComparisonAvailable:comparison.environmentComparisonAvailable,environmentChanged:comparison.environmentChanged,sourceChanges:comparison.source.length,messages});
}
writeFileSync(new URL('notebook-availability-results.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
