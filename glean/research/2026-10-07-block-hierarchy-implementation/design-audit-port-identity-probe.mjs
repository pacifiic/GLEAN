// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import {projectScope} from '../../prototype/web/presentation.mjs';
import {validateDocument} from '../../prototype/web/document.mjs';
const body={version:3,name:'valid IDs contain colon',projectId:'glean',imports:[],policy:'strict',inputs:[],goal:'True',modules:[],nodes:[{id:'S',kind:'script',inputs:[],outputType:'True',body:'True.intro'},{id:'A:x',kind:'script',inputs:[{id:'y',name:'y',type:'True'}],outputType:'True',body:'y'},{id:'A',kind:'script',inputs:[{id:'x:y',name:'xy',type:'True'}],outputType:'True',body:'xy'}],edges:[{id:'one',source:'S',output:'out',target:'A:x',input:'y'},{id:'two',source:'S',output:'out',target:'A',input:'x:y'}],result:{node:'A',output:'out'}};
const p={hidden:[],containers:[{id:'capsule',name:'capsule',collapsed:true,children:['n:A:x','n:A'],x:0,y:0}]},projection=projectScope(body,p),ports=projection.nodes.find(n=>n.containerId).inputPorts;
console.log(JSON.stringify({fixture:body,validation:validateDocument({kind:'graph',graph:body}),ports,uniquePortIds:new Set(ports.map(p=>p.id)).size,edges:projection.edges},null,2));
