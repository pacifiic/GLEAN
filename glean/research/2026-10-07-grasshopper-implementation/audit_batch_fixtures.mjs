// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import {writeFileSync} from 'node:fs';
import {batchCalls} from '../../prototype/web/typed-model.mjs';

const fixtures=[];
for(const operation of ['map','zip','product']){
  const inputs=[{id:'x',name:'x',type:'Nat'},...(operation==='map'?[]:[{id:'y',name:'y',type:'Nat'}])];
  const template={id:'template',kind:'script',inputs,outputType:operation==='map'?'x = x':'x + y = x + y',body:'by rfl'};
  const leftValues=operation==='product'?[1,2]:[1,2,3],rightValues=operation==='map'?[]:[4,5,6];
  const left=leftValues.map((value,i)=>({id:'left'+i,kind:'nat',value:String(value)}));
  const right=rightValues.map((value,i)=>({id:'right'+i,kind:'nat',value:String(value)}));
  const leftItems=left.map(n=>({node:n.id,output:'out'})),rightItems=right.map(n=>({node:n.id,output:'out'}));
  const finalTerm=operation==='map'?String(leftValues.at(-1)):`${leftValues.at(-1)} + ${rightValues.at(-1)}`;
  const graph={version:3,name:operation+' independent audit',projectId:'glean',imports:[],policy:'strict',inputs:[],
    goal:finalTerm+' = '+finalTerm,modules:[],nodes:[...left,...right,template],
    edges:[{id:'template_x',source:left[0].id,output:'out',target:'template',input:'x'},
      ...(operation==='map'?[]:[{id:'template_y',source:right[0].id,output:'out',target:'template',input:'y'}])],
    result:{node:'template',output:'out'}};
  const created=batchCalls(graph,template,operation,leftItems,rightItems,inputs.map(p=>p.id),operation);
  graph.result.node=created.at(-1).id;
  fixtures.push({id:'R12-'+operation,expected:'valid',graph,
    counts:{left:left.length,right:right.length,output:created.length},
    provenance:created.map(node=>({node:node.id,...node.provenance}))});
  if(operation==='map'){
    const bad=structuredClone(graph);bad.nodes[1]={id:'left1',kind:'script',inputs:[],outputType:'Bool',body:'true'};
    fixtures.push({id:'R12-map-wrong-item',expected:'invalid',graph:bad,expectedFailureNode:'map_1',expectedSourceItem:'left1'});
  }
  if(operation==='zip'){
    const before=JSON.stringify(graph);let error=null;
    try{batchCalls(graph,template,operation,leftItems,rightItems.slice(0,2),inputs.map(p=>p.id),'wrongZip');}
    catch(e){error=e.message;}
    fixtures.push({id:'R12-unequal-zip-model',expected:'rejected',error,unchanged:JSON.stringify(graph)===before});
  }
}
writeFileSync(new URL('typed-batch-fixtures.json',import.meta.url),JSON.stringify(fixtures,null,2));
console.log(JSON.stringify(fixtures.map(({id,counts,error,unchanged})=>({id,counts,error,unchanged})),null,2));
