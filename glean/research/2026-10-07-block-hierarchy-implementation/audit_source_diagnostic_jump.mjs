// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import fs from 'node:fs';import crypto from 'node:crypto';import vm from 'node:vm';import assert from 'node:assert/strict';
import {Element,find} from './audit_dom_harness.mjs';
const app=fs.readFileSync(new URL('../../prototype/web/app.js',import.meta.url),'utf8'),start=app.indexOf('function renderLeanDiagnostics('),end=app.indexOf('\nfunction renderLeanResult(',start);assert.ok(start>=0&&end>start);
const source='example : False := by /- 😀 -/ exact True.intro\n',utf16=source.indexOf('exact'),unicode=[...source.slice(0,utf16)].length,nodes=new Map(),jumps=[],temporary=[];
const $=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};$('lean-file-block').hidden=false;$('lean-source-content').hidden=true;
const context={$: $,element:(tag,className,text)=>Object.assign(new Element(tag),{className,textContent:text??''}),leanEditor:{current:()=>({source})},sourceAnalysis:{jumpDiagnostic:d=>temporary.push(d)}};vm.createContext(context);vm.runInContext(app.slice(start,end),context);
const cases=[];
for(const sample of [{name:'Lean-codepoint-column-after-astral',diagnostic:{line:1,column:unicode+1,columnEncoding:'unicode',severity:'error',message:'controlled position only'}},{name:'LSP-UTF16-range-after-astral',diagnostic:{range:{start:{line:0,character:utf16}},severity:1,message:'controlled position only'}}]){
 context.renderLeanDiagnostics([sample.diagnostic],(line,character)=>jumps.push({line,character}));await find($('diagnostics'),n=>n.tagName==='button').fire('click');const last=jumps.at(-1);cases.push({name:sample.name,pass:last.line===0&&last.character===utf16,expected:{line:0,character:utf16},actual:last,sourceEditorVisible:!$('lean-source-content').hidden,fileBlockHidden:$('lean-file-block').hidden});
}
const report={kind:'actual app diagnostic listener with controlled codepoint/LSP positions and source text; no native UI or Lean result claimed',source,unicodeColumn:unicode+1,utf16Character:utf16,cases,pass:cases.every(c=>c.pass),appHash:crypto.createHash('sha256').update(app).digest('hex')};fs.writeFileSync(new URL(process.argv[2]??'source-diagnostic-jump-initial-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.pass?0:1;
