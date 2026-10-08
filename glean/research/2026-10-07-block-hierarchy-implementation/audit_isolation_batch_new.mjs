// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {harness,find,descendants} from './audit_dom_harness.mjs';
const h=harness();let report;
try{
 h.editor.jumpKey('root/zero');await h.click('선택만 보기');const selects=descendants(h.properties).filter(n=>n.tagName==='select'),operation=selects.find(s=>s.children.some(c=>c.textContent==='map')),left=selects.find(s=>s.multiple);assert.ok(operation&&left);operation.value='map';const choice=left.children.find(c=>JSON.parse(c.value).node==='n');choice.selected=true;await h.click('배치 호출 만들기',h.properties);const created=h.editor.current().graph.nodes.find(n=>n.id.startsWith('map_'));assert.ok(created);const visible=!!find(h.host,n=>n.tagName==='article'&&n.dataset.id===created.id),targets=h.editor.isolationSnapshot().views.root.frames.at(-1).targets;report={kind:'actual typed Map creation while isolated; controlled DOM/fetch, no native UI or Lean',pass:visible&&targets.includes(created.id),createdId:created.id,createdVisible:visible,targets};
}finally{h.editor.close();}
report.hash=crypto.createHash('sha256').update(fs.readFileSync(new URL('../../prototype/web/typed-editor.mjs',import.meta.url))).digest('hex');fs.writeFileSync(new URL(process.argv[2]??'isolation-batch-new-initial-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=report.pass?0:1;
