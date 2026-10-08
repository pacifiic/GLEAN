// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {DocumentHistory,semanticKey} from '../../prototype/web/history.mjs';
import {normalizePresentation} from '../../prototype/web/presentation.mjs';
import {canReuseVerifiedResult} from '../../prototype/web/proof-review.mjs';
const app=fs.readFileSync(new URL('../../prototype/web/app.js',import.meta.url),'utf8'),start=app.indexOf('async function navigateHistory('),end=app.indexOf('\nfunction renderNotebook',start),cases=[];
assert.ok(start>0&&end>start);
for(const scenario of [{id:'same-environment-undo',environment:{environmentHash:'same'},expect:true},{id:'changed-environment-undo',environment:{environmentHash:'changed'},expect:false},{id:'missing-environment-undo',environment:{},expect:false},{id:'old-reuse-response-after-new-check',environment:{environmentHash:'same'},expect:false,late:true}]){
 const source=JSON.parse(fs.readFileSync(new URL('fixtures/legacy-v2-group.glean.json',import.meta.url),'utf8'));source.presentation=normalizePresentation(source).value;
 const history=new DocumentHistory();history.reset(source);let current=structuredClone(source);current.presentation.scopes.root.hidden=['n:g'];history.commit(current);
 let requested=false,resolve;const delivered=[],messages=[],original={status:'valid',verified:true,nodeTypes:{apply2:'R'},environment:{environmentHash:'same'}};
 const context={mode:'graph',currentDocument:()=>current,result:original,activeModuleId:null,view:{x:20,y:20,zoom:1},history,restoring:false,formDirty:false,verificationEpoch:0,semanticKey,canReuseVerifiedResult,
  isolationSnapshot:()=>null,visibilitySession:{},typedEditor:{presentation:()=>null},loadDocument(doc){current=structuredClone(doc);current.presentation=normalizePresentation(current).value;context.result=null;context.verificationEpoch++;},applyView(){},updateHistoryButtons(){},persistDraft(){},$:()=>({value:'all'}),
  displayGraphResult(result){delivered.push(result);context.result=result;},toast:(...message)=>messages.push(message),fetch:()=>{requested=true;return scenario.late?new Promise(r=>resolve=r):Promise.resolve({ok:true,json:async()=>scenario.environment});}};
 vm.createContext(context);vm.runInContext(app.slice(start,end),context);const pending=context.navigateHistory();
 if(scenario.late){while(!requested)await new Promise(r=>setTimeout(r,0));context.verificationEpoch++;context.result={status:'invalid',verified:false};resolve({ok:true,json:async()=>scenario.environment});}
 await pending;assert.deepEqual(current.presentation.scopes.root.hidden,[]);assert.equal(delivered.length,scenario.expect?1:0);if(scenario.expect){assert.equal(context.result,original);assert.equal(context.result.nodeTypes.apply2,'R');}else assert.equal(context.result?.verified??false,false);
 cases.push({id:scenario.id,pass:true,delivered:delivered.length,finalVerified:context.result?.verified??false,finalType:context.result?.nodeTypes?.apply2??null,messages});
}
const report={kind:'actual app history callback, real legacy-v2 presentation normalization/history; controlled environment/result for reuse/race decisions, not native UI or kernel',appHash:crypto.createHash('sha256').update(app).digest('hex'),cases};fs.writeFileSync(new URL('presentation-cache-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
