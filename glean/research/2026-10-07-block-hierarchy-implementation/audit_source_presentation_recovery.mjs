// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import fs from 'node:fs';import crypto from 'node:crypto';import vm from 'node:vm';import assert from 'node:assert/strict';
import {Element} from './audit_dom_harness.mjs';
import {initSourceAnalysis} from '../../prototype/web/source-analysis.mjs';
globalThis.document={createElement:tag=>new Element(tag)};
const actual=JSON.parse(fs.readFileSync(new URL('design-audit-command-product-retest.json',import.meta.url))),original={version:1,scopes:{root:'broken'},auditMarker:'exact original source presentation'};
let doc={kind:'lean',source:fs.readFileSync(new URL('design-audit-command-fixture.lean',import.meta.url),'utf8'),filename:actual.filename,projectId:actual.projectId,sourceFileView:{version:1,presentation:original}};
const warnings=[],downloads=[],host=new Element(),button=new Element('button'),panel=initSourceAnalysis({host,status:new Element(),run:new Element('button'),cancel:new Element('button'),current:()=>doc,jump(){},onCache(){},onReference(){},onView:value=>doc.sourceFileView=value,onWarning:value=>warnings.push(value),post:async()=>actual});
let report;
try{
 panel.loadCache(actual);assert.ok(warnings.flat().some(message=>message.includes('복구')));assert.deepEqual(doc.sourceFileView.presentationRecovery,original);
 const app=fs.readFileSync(new URL('../../prototype/web/app.js',import.meta.url),'utf8'),line=app.split('\n').find(line=>line.startsWith("$('presentation-recovery-download').addEventListener("));assert.ok(line);
 const context={$:()=>button,currentDocument:()=>doc,download:(...args)=>downloads.push(args)};vm.createContext(context);vm.runInContext(line,context);await button.fire('click');
 const exported=downloads[0]?JSON.parse(downloads[0][1]):null;report={kind:'actual source-analysis corrupt view normalization and actual app recovery-download listener; controlled DOM, no native UI or Lean',pass:downloads.length===1&&JSON.stringify(exported)===JSON.stringify(original),warnings: warnings.flat(),originalInStoredDocumentExact:true,downloads:downloads.length,exported,appHash:crypto.createHash('sha256').update(app).digest('hex')};
}finally{panel.close();}
fs.writeFileSync(new URL(process.argv[2]??'source-presentation-recovery-initial-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.pass?0:1;
