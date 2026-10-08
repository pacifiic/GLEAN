// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import {validateIsolation} from '../../prototype/web/isolation-recovery.mjs';
import {occurrenceKey} from '../../prototype/web/presentation.mjs';
import {typedDemo} from '../../prototype/web/typed-model.mjs';
const graph=typedDemo();graph.modules=[{id:'M',name:'outer',inputs:[],outputType:'True',nodes:[{id:'inner',kind:'module',ref:'N'}],edges:[],result:{node:'inner',output:'out'}},{id:'N',name:'inner',inputs:[],outputType:'True',nodes:[{id:'leaf',kind:'script',inputs:[],outputType:'True',body:'True.intro'}],edges:[],result:{node:'leaf',output:'out'}}];
graph.nodes.push({id:'A',kind:'module',ref:'M'},{id:'B',kind:'module',ref:'N'});
const document={kind:'graph',graph},a={scopeId:'root',nodeId:'A',definitionId:'M'},b={scopeId:'root',nodeId:'B',definitionId:'N'},inner={scopeId:'module/M',nodeId:'inner',definitionId:'N'};
const results=[];
for(const [label,scopeId,trail,target,expectedAccepted] of [
 ['valid-nested','module/N',[a,inner],'leaf',true],
 ['valid-direct','module/N',[b],'leaf',true],
 ['wrong-final-scope','module/M',[b],'inner',false],
 ['disconnected-trail','module/N',[a,b],'leaf',false],
]){
 const key=occurrenceKey(scopeId,trail),snapshot={version:1,views:{[key]:{frames:[{targets:[target],revealed:[],viewport:{x:20,y:20,zoom:1}}]}}};
 const validated=validateIsolation(snapshot,document);results.push({label,scopeId,trail,expectedAccepted,actualAccepted:Object.hasOwn(validated.views,key)});
}
console.log(JSON.stringify(results,null,2));
