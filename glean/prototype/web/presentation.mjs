// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const clone=value=>structuredClone(value);
const unique=values=>[...new Set(values)];
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e6;
const empty=()=>({hidden:[],containers:[]});

export function scopeIndex(document){
 const result=new Map(),root=document.kind==='graph'?document.graph:document;
 if(document.kind==='lean'){result.set('root',{nodes:[{id:'file'},...(Array.isArray(document.analysisCache?.declarations)?document.analysisCache.declarations.slice(0,4096).filter(d=>typeof d?.name==='string').map(d=>({id:'declaration:'+d.name})):[])],edges:[]});return result;}
 if(!Array.isArray(root?.nodes))return result;
 const visit=(body,key)=>{result.set(key,body);for(const node of body.nodes)if(node.kind==='cases'&&Array.isArray(node.branches))for(const branch of node.branches)visit(branch,key+'/'+node.id+'/'+branch.id);};
 visit(root,'root');for(const definition of root.modules??[])visit(definition,'module/'+definition.id);
 return result;
}
function parents(p){const value=new Map();for(const container of p.containers)for(const child of container.children)value.set(child,container.id);return value;}
export function descendantNodes(p,entity){
 if(entity.startsWith('n:'))return[entity.slice(2)];
 const container=p.containers.find(c=>'c:'+c.id===entity);return container?unique(container.children.flatMap(child=>descendantNodes(p,child))):[];
}
function ancestors(p,id){const index=parents(p),found=[];let parent=index.get('n:'+id);while(parent){found.push(parent);parent=index.get('c:'+parent);}return found;}
function normalizeScope(body,raw,key,warnings){
 if(raw!=null&&!record(raw))warnings.push(key+': 손상된 범위 표현을 복구했습니다.');
 const p=empty(),known=new Set(body.nodes.map(n=>'n:'+n.id)),used=new Set();
  const containers=raw?.containers??(body.groups??[]).map(g=>({...g,children:g.nodeIds.map(id=>'n:'+id)}));
  if(!Array.isArray(containers)){warnings.push(key+': 컨테이너 목록을 복구했습니다.');return p;}
  if(containers.length>256)warnings.push(key+': 컨테이너 한도를 넘은 표현을 복구했습니다.');
  for(const c of containers.slice(0,256)){
   if(!record(c)||typeof c.id!=='string'||!c.id||c.id.length>128||used.has(c.id)||typeof c.name!=='string'||!Array.isArray(c.children)){warnings.push(key+': 손상된 컨테이너를 제외했습니다.');continue;}
   used.add(c.id);known.add('c:'+c.id);p.containers.push({id:c.id,name:c.name.slice(0,128),children:[...c.children],collapsed:c.collapsed===true,x:finite(c.x)?c.x:0,y:finite(c.y)?c.y:0});
  }
  const owner=new Map();
  for(const c of p.containers)c.children=c.children.filter(child=>{if(typeof child!=='string'||!known.has(child)||child==='c:'+c.id||owner.has(child)){warnings.push(key+': 존재하지 않거나 중복된 소속을 제외했습니다.');return false;}owner.set(child,c.id);return true;});
  const reaches=(from,target,seen=new Set())=>{if(from===target)return true;if(seen.has(from))return false;seen.add(from);return p.containers.find(c=>c.id===from)?.children.some(child=>child.startsWith('c:')&&reaches(child.slice(2),target,seen))??false;};
  for(const c of p.containers)c.children=c.children.filter(child=>{if(child.startsWith('c:')&&reaches(child.slice(2),c.id)){warnings.push(key+': 순환 포함을 제외했습니다.');return false;}return true;});
  if(raw?.hidden!==undefined&&!Array.isArray(raw.hidden))warnings.push(key+': 숨김 목록을 복구했습니다.');
  p.hidden=unique((Array.isArray(raw?.hidden)?raw.hidden:[]).filter(id=>{if(known.has(id))return true;warnings.push(key+': 없는 숨김 항목을 제외했습니다.');return false;}));
 return p;
}
export function normalizePresentation(document){
 const index=scopeIndex(document),warnings=[],provided=document.presentation,valid=record(provided)&&provided.version===1&&record(provided.scopes),value={version:1,scopes:{},occurrenceViews:{}};
 if(provided&&!valid)warnings.push('표현 형식 버전을 복구했습니다. 원본 표현은 보관됩니다.');
 for(const [key,body] of index){
  value.scopes[key]=normalizeScope(body,valid?provided.scopes[key]:null,key,warnings);
 }
 if(valid)for(const key of Object.keys(provided.scopes))if(!index.has(key))warnings.push(key+': 없는 의미 범위의 표현을 제외했습니다.');
 if(valid&&provided.occurrenceViews!==undefined&&!record(provided.occurrenceViews))warnings.push('호출별 표현 형식을 복구했습니다.');
 if(valid&&record(provided.occurrenceViews)&&Object.keys(provided.occurrenceViews).length>256)warnings.push('호출별 표현 한도를 넘은 기록을 복구했습니다.');
 if(valid&&record(provided.occurrenceViews))for(const [key,entry] of Object.entries(provided.occurrenceViews).slice(0,256)){
  const trail=entry?.trail;let previous=null,validTrail=typeof key==='string'&&key.length<=2048&&record(entry)&&index.has(entry.scopeId)&&Array.isArray(trail)&&trail.length>0&&trail.length<=32;
  if(validTrail)for(const step of trail){const scope=index.get(step?.scopeId),node=scope?.nodes.find(n=>n.id===step.nodeId);if(!node||node.kind!=='module'||node.ref!==step.definitionId||(previous&&step.scopeId!=='module/'+previous&&!step.scopeId.startsWith('module/'+previous+'/'))){validTrail=false;break;}previous=step.definitionId;}
  if(!validTrail||entry.scopeId!=='module/'+previous&&!entry.scopeId.startsWith('module/'+previous+'/')||key!==occurrenceKey(entry.scopeId,trail)){warnings.push(key+': 대응하지 않는 호출 탐색 상태를 제외했습니다.');continue;}
  value.occurrenceViews[key]={scopeId:entry.scopeId,trail:clone(trail),view:normalizeScope(index.get(entry.scopeId),entry.view,key,warnings)};
 }
 return{value,warnings,original:warnings.length&&provided?clone(provided):null};
}
export function occurrenceKey(scopeId,trail){return JSON.stringify({scopeId,trail});}
export function occurrenceView(presentation,key,scopeId,trail){
 if(!presentation.scopes[scopeId])throw new Error('의미 범위가 없습니다.');
 if(!trail?.length)return presentation.scopes[scopeId];
 presentation.occurrenceViews??={};
 if(key!==occurrenceKey(scopeId,trail))throw new Error('호출 탐색 경로 식별자가 대응하지 않습니다.');
 const existing=presentation.occurrenceViews[key];if(existing&&(existing.scopeId!==scopeId||JSON.stringify(existing.trail)!==JSON.stringify(trail)))throw new Error('저장된 호출 탐색 경로가 현재 호출과 다릅니다.');
 if(!presentation.occurrenceViews[key])presentation.occurrenceViews[key]={scopeId,trail:clone(trail),view:clone(presentation.scopes[scopeId])};
 return presentation.occurrenceViews[key].view;
}
export function prunePresentation(document){
 const p=document.presentation,index=scopeIndex(document);if(!p)return;
 const prune=(scope,view)=>{const known=new Set([...scope.nodes.map(n=>'n:'+n.id),...view.containers.map(c=>'c:'+c.id)]);view.hidden=view.hidden.filter(id=>known.has(id));for(const c of view.containers)c.children=c.children.filter(id=>known.has(id));};
 for(const key of Object.keys(p.scopes))if(!index.has(key))delete p.scopes[key];
 for(const [key,scope] of index){p.scopes[key]??=empty();prune(scope,p.scopes[key]);}
 for(const [key,entry] of Object.entries(p.occurrenceViews??{})){if(!index.has(entry.scopeId)||entry.trail.some(step=>!index.get(step.scopeId)?.nodes.some(n=>n.id===step.nodeId&&n.kind==='module'&&n.ref===step.definitionId)))delete p.occurrenceViews[key];else prune(index.get(entry.scopeId),entry.view);}
}
export function semanticDocument(document){
 const scope=body=>{const {groups,presentation,hidden,collapsed,nodes,modules,...fields}=body;const result={...fields,nodes:nodes.map(({x,y,hidden,collapsed,presentation,...node})=>node.kind==='cases'?{...node,branches:node.branches.map(scope)}:node)};if(modules)result.modules=modules.map(scope);return result;};
 const {review,presentation,presentationRecovery,sessionView,navigationState,analysisCache,sourceOrigin,sourceFileView,...value}=document;
 if(value.kind==='graph')return{...value,graph:scope(value.graph)};
 if(Array.isArray(value.nodes))return scope(value);
 return value;
}
export function createContainer(body,p,entities,{id,name,parent=null}){
 const keys=unique(entities),known=new Set([...body.nodes.map(n=>'n:'+n.id),...p.containers.map(c=>'c:'+c.id)]),owner=parents(p);
 if(!keys.length||!id||p.containers.some(c=>c.id===id)||keys.some(key=>!known.has(key)||(owner.get(key)??null)!==parent))throw new Error('같은 범위·상위 그룹의 유효한 항목을 선택하세요.');
 const members=keys.flatMap(key=>descendantNodes(p,key)),nodes=body.nodes.filter(n=>members.includes(n.id));
 if(!nodes.length)throw new Error('빈 그룹은 묶을 수 없습니다.');
 const c={id,name:name||'그룹',children:keys,collapsed:true,x:Math.min(...nodes.map(n=>n.x??0)),y:Math.min(...nodes.map(n=>n.y??0))};
 p.containers.push(c);if(parent){const enclosing=p.containers.find(c=>c.id===parent);enclosing.children=enclosing.children.filter(key=>!keys.includes(key));enclosing.children.push('c:'+id);}return c;
}
export function moveContainer(body,p,id,dx,dy){
 const container=p.containers.find(c=>c.id===id);if(!container)throw new Error('그룹이 없습니다.');
 const ids=new Set(descendantNodes(p,'c:'+id)),containers=new Set([id]);let changed=true;while(changed){changed=false;for(const c of p.containers)if(containers.has(c.id))for(const child of c.children)if(child.startsWith('c:')&&!containers.has(child.slice(2))){containers.add(child.slice(2));changed=true;}}
 const items=[...body.nodes.filter(n=>ids.has(n.id)),...p.containers.filter(c=>containers.has(c.id))];
 if(!items.every(item=>finite((item.x??0)+dx)&&finite((item.y??0)+dy)))throw new Error('작업 공간 좌표 범위를 벗어났습니다.');
 for(const item of items){item.x=(item.x??0)+dx;item.y=(item.y??0)+dy;}
}
export function setManualHidden(p,state,entities,hidden){
 const keys=unique(entities);p.hidden=hidden?unique([...p.hidden,...keys]):p.hidden.filter(key=>!keys.includes(key));
 if(hidden&&state){const ids=new Set(keys.flatMap(key=>descendantNodes(p,key)));for(const frame of state.frames)frame.revealed=frame.revealed.filter(id=>!ids.has(id));state.temporary.nodes=state.temporary.nodes.filter(id=>!ids.has(id));state.temporary.expanded=unique(state.temporary.nodes.flatMap(id=>ancestors(p,id)));}
}
export class PresentationSession{
 constructor(){this.views=new Map();}
 state(key){if(!this.views.has(key))this.views.set(key,{frames:[],temporary:{nodes:[],expanded:[]}});return this.views.get(key);}
 isolate(key,body,p,entities,viewport,reveal=false){
  const valid=new Set(body.nodes.map(n=>n.id)),targets=unique(entities.flatMap(entity=>descendantNodes(p,entity))).filter(id=>valid.has(id));if(!targets.length)return false;
  const state=this.state(key),revealed=reveal?[...targets]:[],last=state.frames.at(-1);
  if(last&&JSON.stringify([...last.targets].sort())===JSON.stringify([...targets].sort())&&JSON.stringify([...last.revealed].sort())===JSON.stringify([...revealed].sort()))return false;
  state.frames.push({targets,revealed,viewport:clone(viewport)});state.temporary={nodes:[],expanded:[]};return true;
 }
 back(key){const state=this.state(key),frame=state.frames.pop();state.temporary={nodes:[],expanded:[]};return frame?clone(frame.viewport):null;}
 exit(key){const state=this.state(key),viewport=state.frames[0]?.viewport;state.frames=[];state.temporary={nodes:[],expanded:[]};return viewport?clone(viewport):null;}
 add(key,body,p,entities,reveal=false){const state=this.state(key),frame=state.frames.at(-1);if(!frame)return this.isolate(key,body,p,entities,{},reveal);const valid=new Set(body.nodes.map(n=>n.id)),ids=entities.flatMap(entity=>descendantNodes(p,entity)).filter(id=>valid.has(id));frame.targets=unique([...frame.targets,...ids]);if(reveal)frame.revealed=unique([...frame.revealed,...ids]);}
 includeNew(key,ids){const frame=this.state(key).frames.at(-1);if(frame)frame.targets=unique([...frame.targets,...ids]);}
 prune(key,body,p){const state=this.state(key),valid=new Set(body.nodes.map(n=>n.id));for(const frame of state.frames){frame.targets=frame.targets.filter(id=>valid.has(id));frame.revealed=frame.revealed.filter(id=>valid.has(id));}while(state.frames.length&&!state.frames.at(-1).targets.length)state.frames.pop();state.temporary.nodes=state.temporary.nodes.filter(id=>valid.has(id));}
 reveal(key,body,p,id,viewport){if(!body.nodes.some(n=>n.id===id))return false;const previous=this.state(key).temporary.viewport;this.state(key).temporary={nodes:[id],expanded:ancestors(p,id),viewport:previous??(viewport?clone(viewport):null)};return true;}
 clearTemporary(key){const viewport=this.state(key).temporary.viewport;this.state(key).temporary={nodes:[],expanded:[]};return viewport?clone(viewport):null;}
}
export function projectScope(body,p=empty(),state={frames:[],temporary:{nodes:[],expanded:[]}},ports={}){
 const inputs=ports.inputs??(n=>n.inputs??[]),outputs=ports.outputs??(n=>n.kind==='construct'?n.outputs:n.kind==='goal'?[]:[{id:'out',name:'out'}]);
 const hidden=new Set(p.hidden),frame=state.frames.at(-1),allowed=frame?new Set(frame.targets):null,temporary=new Set(state.temporary.nodes),revealed=new Set([...(frame?.revealed??[]),...temporary]),expanded=new Set(state.temporary.expanded);
 const isManual=id=>hidden.has('n:'+id)||ancestors(p,id).some(id=>hidden.has('c:'+id));
 const visibleIds=body.nodes.filter(n=>(!isManual(n.id)||revealed.has(n.id))&&(!allowed||allowed.has(n.id)||temporary.has(n.id))).map(n=>n.id),visible=new Set(visibleIds),mapping=new Map(),nodes=[],used=new Set(body.nodes.map(n=>n.id));
 const fresh=base=>{let id=base;while(used.has(id))id+=':';used.add(id);return id;};
 const caps=new Map();
 for(const node of body.nodes){if(!visible.has(node.id))continue;const enclosing=ancestors(p,node.id).reverse().find(id=>p.containers.find(c=>c.id===id).collapsed&&!expanded.has(id));
  if(!enclosing){nodes.push(node);mapping.set(node.id,node);continue;}
  if(!caps.has(enclosing)){const c=p.containers.find(c=>c.id===enclosing),cap={id:fresh('@container:'+c.id),kind:'group',ref:c.id,containerId:c.id,name:c.name,x:c.x,y:c.y,memberIds:[],inputPorts:[],outputPorts:[]};caps.set(enclosing,cap);nodes.push(cap);}
  const cap=caps.get(enclosing);cap.memberIds.push(node.id);mapping.set(node.id,cap);
 }
 const boundary=new Set();for(const edge of body.edges)for(const [a,b] of [[edge.source,edge.target],[edge.target,edge.source]])if(visible.has(a)&&!visible.has(b))boundary.add(b);
 for(const id of boundary){const original=body.nodes.find(n=>n.id===id);if(!original)continue;const cap={id:fresh('@hidden:'+id),kind:'group',ref:null,name:'숨김 · '+(original.name??id),hiddenBoundary:true,realNodeId:id,x:original.x??0,y:original.y??0,memberIds:[id],inputPorts:[],outputPorts:[]};nodes.push(cap);mapping.set(id,cap);}
 for(const cap of [...caps.values(),...nodes.filter(n=>n.hiddenBoundary)]){
  const members=new Set(cap.memberIds);
  for(const id of cap.memberIds){const node=body.nodes.find(n=>n.id===id);
   for(const input of inputs(node)){const port=typeof input==='string'?{id:input,name:input}:input;if(body.edges.some(e=>e.target===id&&e.input===port.id&&members.has(e.source)))continue;cap.inputPorts.push({id:JSON.stringify(['in',id,port.id]),label:port.name??port.id,nodeId:id,input:port.id});}
   for(const port of outputs(node)){if(body.edges.some(e=>e.source===id&&(e.output??'out')===port.id)&&!body.edges.some(e=>e.source===id&&(e.output??'out')===port.id&&!members.has(e.target)))continue;cap.outputPorts.push({id:JSON.stringify(['out',id,port.id]),label:port.name??id,nodeId:id,output:port.id});}
  }
 }
 const edges=[];for(const edge of body.edges){const from=mapping.get(edge.source),to=mapping.get(edge.target);if(!from||!to||from===to||(!visible.has(edge.source)&&!visible.has(edge.target)))continue;const projected={...edge,originalSource:edge.source,originalOutput:edge.output??'out',originalTarget:edge.target,originalInput:edge.input};if(from.kind==='group'){projected.source=from.id;projected.sourcePort=from.outputPorts.find(p=>p.nodeId===edge.source&&p.output===(edge.output??'out'))?.id;projected.output=projected.sourcePort;}if(to.kind==='group'){projected.target=to.id;projected.input=to.inputPorts.find(p=>p.nodeId===edge.target&&p.input===edge.input)?.id;}edges.push(projected);}
 return{nodes,edges,visibleIds,hiddenIds:body.nodes.filter(n=>!visible.has(n.id)).map(n=>n.id),manualHiddenCount:body.nodes.filter(n=>isManual(n.id)).length,isolationHiddenCount:allowed?body.nodes.filter(n=>!isManual(n.id)&&!allowed.has(n.id)&&!temporary.has(n.id)).length:0};
}

/** Expanded parents include child headers and padding, rather than identical leaf unions. */
export function containerBounds(p,visibleNodes,size=()=>({width:190,height:110})){
 const result=new Map(),active=new Set();const rect=node=>({x:node.x,y:node.y,...size(node)});
 function entity(key){if(key.startsWith('n:')){const node=visibleNodes.find(n=>n.id===key.slice(2)&&!n.hiddenBoundary);return node?rect(node):null;}const id=key.slice(2),cap=visibleNodes.find(n=>n.containerId===id);if(cap)return rect(cap);if(result.has(id))return result.get(id);if(active.has(id))return null;const c=p.containers.find(c=>c.id===id);if(!c)return null;active.add(id);const children=c.children.map(entity).filter(Boolean);active.delete(id);if(!children.length)return null;const x=Math.min(...children.map(r=>r.x))-20,y=Math.min(...children.map(r=>r.y))-42,value={x,y,width:Math.max(...children.map(r=>r.x+r.width))-x+20,height:Math.max(...children.map(r=>r.y+r.height))-y+20};result.set(id,value);return value;}
 for(const c of p.containers)if(!c.collapsed)entity('c:'+c.id);return result;
}
