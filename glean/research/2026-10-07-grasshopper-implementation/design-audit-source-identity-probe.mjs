// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import vm from 'node:vm';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {bookmark,normalizeNotebook} from '../../prototype/web/notebook.mjs';import {reviewFingerprint} from '../../prototype/web/proof-review.mjs';
const app=readFileSync(new URL('../../prototype/web/app.js',import.meta.url),'utf8');
const record=app.slice(app.indexOf('function recordDocument()'),app.indexOf('function setMode('));
const addStart=app.indexOf("$('bookmark-add').addEventListener"),add=app.slice(addStart,app.indexOf("$('watch-pin')",addStart));
const jumpStart=app.indexOf("jump.addEventListener('click',()=>{if(mode==='lean'"),jump=app.slice(jumpStart,app.indexOf('});card.append(save',jumpStart)+3);
const baseline={kind:'lean',source:'theorem t : True := by trivial',projectId:'glean',filename:'Graph.lean',target:'t'};
const result={appHash:createHash('sha256').update(app).digest('hex'),selectionInvalidation:[],bookmarkAssociation:[],jumpAssociation:[]};
for(const change of [{id:'source',source:baseline.source+'\n'},{id:'project',projectId:'mathlib'},{id:'filename',filename:'Other.lean'}]){
 const selection={sourceIdentity:reviewFingerprint(baseline.source),projectId:baseline.projectId,filename:baseline.filename,scopeId:'root',nodeIds:['select'],sourceRange:{startLine:3,endLine:3},subgraph:{nodes:[{id:'select'}],edges:[]}};
 const doc={...baseline,...change},review={sourceGraphSelection:selection},ctx={loading:false,restoring:false,verificationEpoch:0,renderNotebook(){},mode:'lean',sourceGraphSelection:selection,review,currentDocument:()=>({...doc,review}),history:{commit(){}},updateHistoryButtons(){},clearTimeout(){},setTimeout(){return 1;},autosaveTimer:null,persistDraft(){},reviewFingerprint};
 vm.createContext(ctx);vm.runInContext(record+'\nrecordDocument();',ctx);result.selectionInvalidation.push({id:change.id,cleared:ctx.sourceGraphSelection===null,reviewCleared:review.sourceGraphSelection===null});
 const before={source:baseline.source,sourceIdentity:reviewFingerprint(baseline.source),projectId:baseline.projectId,filename:baseline.filename,sessionId:'old-session',version:1,position:{line:2,character:2},structuredGoals:[{type:'True'}]};
 let action;const state={notebook:{}},fields={'notebook-name':{value:'step'},'notebook-description':{value:'desc'}},callback={$:id=>id==='bookmark-add'?{addEventListener(_,fn){action=fn;}}:fields[id],mode:'lean',sourceGraphSelection:ctx.sourceGraphSelection,contextObservations:[before],currentDocument:()=>doc,review:state,reviewFingerprint,semanticKey:d=>JSON.stringify(d),normalizeNotebook,bookmark,uid:()=>change.id,renderNotebook(){},recordDocument(){}};
 vm.createContext(callback);vm.runInContext(add,callback);action();const entry=state.notebook.steps[0];result.bookmarkAssociation.push({id:change.id,beforeIdentity:entry.before?.sourceIdentity,after:entry.after,graphMapped:entry.nodeIds.length>0,sourceIdentity:entry.sourceIdentity});
 let handler;const jumps=[],toasts=[],jumpCtx={jump:{addEventListener(_,fn){handler=fn;}},mode:'lean',step:{after:before},leanEditor:{current:()=>doc,jump:(...p)=>jumps.push(p)},reviewFingerprint,toast:(...p)=>toasts.push(p)};
 vm.createContext(jumpCtx);vm.runInContext(jump,jumpCtx);handler();result.jumpAssociation.push({id:change.id,jumps,toasts});
}
const good=bookmark({id:'roundtrip',before:{sourceIdentity:'before',projectId:'glean',filename:'Graph.lean',sessionId:'session',version:1,position:{line:1,character:0},structuredGoals:[{type:'P'}]},after:{sourceIdentity:'after',projectId:'mathlib',filename:'Other.lean',sessionId:'session2',version:2,position:{line:2,character:1},structuredGoals:[]}});result.normalizedRoundtrip=normalizeNotebook(JSON.parse(JSON.stringify({steps:[good]}))).steps[0];
console.log(JSON.stringify(result,null,2));
