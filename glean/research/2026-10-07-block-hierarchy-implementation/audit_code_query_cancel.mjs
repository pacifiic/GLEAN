// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Element,find} from './audit_dom_harness.mjs';
import {initCodeEditor} from '../../prototype/web/code-editor.mjs';
globalThis.document={createElement:tag=>new Element(tag)};
const host=new Element(),changes=[];let resolve,cancellations=0;
const editor=initCodeEditor({host,source:'by\n  exact True.intro',onChange:body=>changes.push(body),queryContext:()=>new Promise(r=>resolve=r),cancelContext:()=>cancellations++});
const query=find(host,n=>n.tagName==='button'&&n.textContent==='커서의 Lean 목표'),cancel=find(host,n=>n.tagName==='button'&&n.textContent==='문맥 조회 중단');
const pending=query.fire('click');while(!resolve)await new Promise(r=>setTimeout(r,0));assert.equal(query.disabled,true);
editor.code.value+='\n-- edit';await editor.code.fire('input');resolve({structuredGoals:[{type:'obsolete True'}]});await pending;
const result={kind:'actual code editor async query and input callbacks; controlled DOM/context promise, no native UI or Lean',hash:crypto.createHash('sha256').update(fs.readFileSync(new URL('../../prototype/web/code-editor.mjs',import.meta.url))).digest('hex'),pass:query.disabled===false&&cancel.hidden===true,queryDisabledAfterEditAndCompletion:query.disabled,cancelHidden:cancel.hidden,cancellations,bodyPreserved:changes.at(-1)===editor.code.value,obsoleteGoalDisplayed:!!find(host,n=>n.textContent?.includes('obsolete True'))};
fs.writeFileSync(new URL(process.argv[2]??'code-query-edit-initial-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));editor.destroy();process.exitCode=result.pass?0:1;
