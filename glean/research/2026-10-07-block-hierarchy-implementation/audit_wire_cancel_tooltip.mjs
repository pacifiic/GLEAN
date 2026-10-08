// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {harness,find} from './audit_dom_harness.mjs';
const h=harness();let result;
try{
 h.editor.restoreResult({status:'valid',verified:true,typedNodeTypes:{'root/n/out':'Nat'},typedPortTypes:{'root/zero/x':'Nat'}});
 await find(h.host,n=>n.className==='typed-port typed-output'&&n.dataset.node==='n').fire('click');const target=find(h.host,n=>n.className==='typed-port typed-input'&&n.dataset.node==='zero');assert.ok(target);const candidateTitle=target.title;assert.ok(candidateTitle.includes('후보'));
 assert.equal(h.editor.cancelInteraction(),true);result={kind:'actual typed output click/cancelInteraction with controlled types and DOM, no native UI or Lean',pass:!target.title.includes('후보'),candidateClassCleared:['compatible','incompatible','unknown'].every(state=>!target.classList.contains('candidate-'+state)),candidateTitle,afterCancelTitle:target.title};
}finally{h.editor.close();}
result.hash=crypto.createHash('sha256').update(fs.readFileSync(new URL('../../prototype/web/typed-editor.mjs',import.meta.url))).digest('hex');fs.writeFileSync(new URL(process.argv[2]??'wire-cancel-tooltip-initial-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));process.exitCode=result.pass?0:1;
