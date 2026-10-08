// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import {normalizePresentation,PresentationSession,projectScope,createContainer,setManualHidden,occurrenceView,occurrenceKey} from '../../prototype/web/presentation.mjs';
import {validateDocument} from '../../prototype/web/document.mjs';
import {typedDemo} from '../../prototype/web/typed-model.mjs';
const body=()=>({nodes:['A','B','C'].map((id,i)=>({id,kind:'script',inputs:i?[{id:'x',name:'x'}]:[],x:i*200,y:0})),edges:[{id:'ab',source:'A',target:'B',input:'x',output:'out'},{id:'bc',source:'B',target:'C',input:'x',output:'out'}]});
const output={};
{
 const doc={kind:'graph',graph:typedDemo()};doc.graph.nodes[1].branches=42;
 let error=null;try{normalizePresentation(doc);}catch(e){error=e.message;}
 output.nonCasesExtraBranches={validation:validateDocument(doc),normalizationError:error};
}
{
 const graph={...body(),modules:[{id:'M',...body()}]};graph.nodes.push({id:'callA',kind:'module',ref:'M'},{id:'callB',kind:'module',ref:'M'});
 const trailA=[{scopeId:'root',nodeId:'callA',definitionId:'M'}],trailB=[{scopeId:'root',nodeId:'callB',definitionId:'M'}],keyA=occurrenceKey('module/M',trailA),keyB=occurrenceKey('module/M',trailB);
 const presentation=normalizePresentation({kind:'graph',graph}).value,session=new PresentationSession(),a=occurrenceView(presentation,keyA,'module/M',trailA),b=occurrenceView(presentation,keyB,'module/M',trailB);
 setManualHidden(a,session.state(keyA),['n:B'],true);
 const restored=normalizePresentation({kind:'graph',graph,presentation:JSON.parse(JSON.stringify(presentation))});
 output.manualHideOccurrences={callA:projectScope(graph.modules[0],a,session.state(keyA)).hiddenIds,callB:projectScope(graph.modules[0],b,session.state(keyB)).hiddenIds,definitionHidden:presentation.scopes['module/M'].hidden,restoredA:restored.value.occurrenceViews[keyA].view.hidden,warnings:restored.warnings,expectedCallB:[]};
}
{
 const graph=body(),p=normalizePresentation({kind:'graph',graph}).value.scopes.root,session=new PresentationSession();
 createContainer(graph,p,['n:B','n:C'],{id:'g',name:'g'});session.reveal('root',graph,p,'B');setManualHidden(p,session.state('root'),['n:B'],true);
 output.hideAfterDiagnostic={temporary:session.state('root').temporary,collapsed:p.containers[0].collapsed,projected:projectScope(graph,p,session.state('root')).nodes.map(n=>({id:n.id,group:n.containerId??null})),expectedTemporaryExpanded:[]};
}
{
 const graph=body(),p=normalizePresentation({kind:'graph',graph,presentation:{version:1,scopes:{root:{hidden:[],containers:[{id:'empty',name:'empty',children:[],collapsed:true,x:0,y:0}]}}}}).value.scopes.root;
 const before=JSON.stringify(p);let created=null,error=null;try{created=createContainer(graph,p,['c:empty'],{id:'outer',name:'outer'});}catch(e){error=e.message;}
 output.emptyContainer={rejected:!!error,error,unchanged:JSON.stringify(p)===before,finiteCoordinates:created?Number.isFinite(created.x)&&Number.isFinite(created.y):null};
}
console.log(JSON.stringify(output,null,2));
