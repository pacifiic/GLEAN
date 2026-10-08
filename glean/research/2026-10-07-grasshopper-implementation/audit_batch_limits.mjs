// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
// Independent global document-boundary model probes; not actual Lean/UI evidence.
import {writeFileSync} from 'node:fs';
import {typedDemo,batchCalls,checkTypedImport} from '../../prototype/web/typed-model.mjs';

function nodeLimit(){const root=typedDemo();root.nodes=[...Array.from({length:245},(_,i)=>({id:'root'+i,kind:'nat',value:'0'})),{id:'truth',kind:'script',inputs:[],outputType:'True',body:'True.intro'}];root.edges=[];root.inputs=[];root.goal='True';root.result={node:'truth',output:'out'};
 const body={id:'m',name:'m',inputs:[],outputType:'Nat',nodes:[...Array.from({length:6},(_,i)=>({id:'n'+i,kind:'nat',value:String(i)})),{id:'p',kind:'script',inputs:[{id:'x',name:'x',type:'Nat'}],outputType:'Nat',body:'x'}],edges:[{id:'original',source:'n0',output:'out',target:'p',input:'x'}],result:{node:'n0',output:'out'}};root.modules=[body];return{root,body,items:Array.from({length:4},(_,i)=>({node:'n'+i,output:'out'}))};}
function edgeLimit(){const root=typedDemo();root.inputs=[];root.nodes=Array.from({length:16},(_,i)=>({id:'n'+i,kind:'nat',value:'0'}));root.edges=[];root.modules=[];root.goal='True';
 for(let index=0;index<32;index++){const parameters=Array.from({length:index===0?14:16},(_,i)=>({id:'a'+i,name:'a'+i,type:'Nat'}));root.nodes.push({id:'s'+index,kind:'script',inputs:parameters,outputType:'True',body:'True.intro'});for(const p of parameters)root.edges.push({id:index+'_'+p.id,source:'n'+p.id.slice(1),output:'out',target:'s'+index,input:p.id});}
 root.result={node:'s31',output:'out'};
 const body={id:'m',name:'m',inputs:[],outputType:'Nat',nodes:[{id:'n0',kind:'nat',value:'0'},{id:'p',kind:'script',inputs:[{id:'x',name:'x',type:'Nat'}],outputType:'Nat',body:'x'}],edges:[{id:'original',source:'n0',output:'out',target:'p',input:'x'}],result:{node:'n0',output:'out'}};root.modules=[body];return{root,body,items:Array.from({length:3},()=>({node:'n0',output:'out'}))};}
const result={};
for(const [name,make] of [['nodes',nodeLimit],['edges',edgeLimit]]){const {root,body,items}=make(),before=JSON.stringify(root);const record={beforeValidation:checkTypedImport(root),globalNodes:root.nodes.length+body.nodes.length,globalEdges:root.edges.length+body.edges.length};try{record.created=batchCalls(body,body.nodes.at(-1),'map',items,[],['x'],'auditmap',root).length;record.rejected=false;}catch(error){record.rejected=true;record.message=error.message;}record.unchanged=before===JSON.stringify(root);record.afterValidation=checkTypedImport(root);record.passed=record.beforeValidation===null&&record.rejected&&record.unchanged;result[name]=record;}
writeFileSync(new URL('batch-global-limit-results.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
process.exitCode=Object.values(result).every(r=>r.passed)?0:1;
