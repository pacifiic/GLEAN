// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import fs from 'node:fs';import crypto from 'node:crypto';import vm from 'node:vm';import assert from 'node:assert/strict';
import {Element} from './audit_dom_harness.mjs';
import {initSourceAnalysis} from '../../prototype/web/source-analysis.mjs';
globalThis.document={createElement:tag=>new Element(tag)};

const actual=JSON.parse(fs.readFileSync(new URL('design-audit-command-product-retest.json',import.meta.url))),app=fs.readFileSync(new URL('../../prototype/web/app.js',import.meta.url),'utf8'),line=app.split('\n').find(line=>line.startsWith("$('presentation-recovery-download').addEventListener("));assert.ok(line);
const results=[];
for(const original of [0,false,null,'broken']){
 let doc={kind:'lean',source:'theorem t : True := True.intro\n',filename:'File.lean',projectId:'glean',sourceFileView:original};const warnings=[],downloads=[],host=new Element(),button=new Element('button'),panel=initSourceAnalysis({host,status:new Element(),run:new Element('button'),cancel:new Element('button'),current:()=>doc,jump(){},onCache(){},onReference(){},onView:value=>doc.sourceFileView=value,onWarning:value=>warnings.push(value),post:async()=>actual});
 try{panel.loadCache(null);const context={$:()=>button,currentDocument:()=>doc,download:(...args)=>downloads.push(args)};vm.createContext(context);vm.runInContext(line,context);await button.fire('click');results.push({original,warningVisible:warnings.length>0,exactStoredOriginal:JSON.stringify(doc.sourceFileView.presentationRecovery)===JSON.stringify(original),downloads:downloads.length,exactExport:downloads.length===1&&JSON.stringify(JSON.parse(downloads[0][1]))===JSON.stringify(original)});}finally{panel.close();}
}

for(const original of [0,false,null,'broken']){
 const downloads=[],button=new Element('button'),doc={kind:'graph',presentationRecovery:original},context={$:()=>button,currentDocument:()=>doc,download:(...args)=>downloads.push(args)};vm.createContext(context);vm.runInContext(line,context);await button.fire('click');results.push({kind:'top-level',original,downloads:downloads.length,exactExport:downloads.length===1&&JSON.stringify(JSON.parse(downloads[0][1]))===JSON.stringify(original)});
}
const absent=[],button=new Element('button'),context={$:()=>button,currentDocument:()=>({kind:'lean'}),download:(...args)=>absent.push(args)};vm.createContext(context);vm.runInContext(line,context);await button.fire('click');assert.equal(absent.length,0);assert.ok(results.every(r=>r.exactExport));
const report={absentNoDownload:absent.length===0,kind:'actual source-analysis outer corrupt view normalization and actual app recovery-download listener; controlled DOM, no native UI or Lean job',results,appHash:crypto.createHash('sha256').update(app).digest('hex')};fs.writeFileSync(new URL(process.argv[2]??'design-audit-falsy-source-recovery-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
