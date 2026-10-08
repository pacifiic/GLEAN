// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import {scopeIndex,occurrenceKey} from './presentation.mjs';
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
export function validateIsolation(snapshot,document){
 const value={version:1,views:{}},index=scopeIndex(document);if(!record(snapshot)||snapshot.version!==1||!record(snapshot.views))return value;
 for(const [key,entry] of Object.entries(snapshot.views).slice(0,256)){
  let scope=index.get(key);if(!scope){try{const identity=JSON.parse(key);if(key!==occurrenceKey(identity.scopeId,identity.trail)||!Array.isArray(identity.trail)||!identity.trail.length||identity.trail.length>32||identity.trail.some(step=>!index.get(step.scopeId)?.nodes.some(n=>n.id===step.nodeId&&n.kind==='module'&&n.ref===step.definitionId)))continue;let previous=null;let valid=true;for(const step of identity.trail){if(previous&&step.scopeId!=='module/'+previous&&!step.scopeId.startsWith('module/'+previous+'/'))valid=false;previous=step.definitionId;}if(!valid||identity.scopeId!=='module/'+previous&&!identity.scopeId.startsWith('module/'+previous+'/'))continue;scope=index.get(identity.scopeId);}catch{continue;}}
  if(!scope||!Array.isArray(entry?.frames))continue;const known=new Set(scope.nodes.map(n=>n.id)),frames=[];
  for(const frame of entry.frames.slice(0,32)){const v=frame?.viewport;if(!Array.isArray(frame?.targets)||!Array.isArray(frame?.revealed)||!v||!['x','y','zoom'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k]))||Math.abs(v.x)>1e6||Math.abs(v.y)>1e6||v.zoom<=0||v.zoom>2)continue;const targets=[...new Set(frame.targets.filter(id=>known.has(id)))];if(targets.length)frames.push({targets,revealed:[...new Set(frame.revealed.filter(id=>targets.includes(id)))],viewport:{x:v.x,y:v.y,zoom:v.zoom}});}
  if(frames.length)value.views[key]={frames,temporary:{nodes:[],expanded:[]}};
 }
 const nav=snapshot.navigation;if(record(nav)&&record(nav.view)&&['x','y','zoom'].every(k=>typeof nav.view[k]==='number'&&Number.isFinite(nav.view[k]))&&nav.view.zoom>0&&nav.view.zoom<=2){try{
  let key='root';if(Array.isArray(nav.path)){if(nav.path.length>33)throw new Error();for(const part of nav.path){if(part.kind==='module')key='module/'+part.id;else if(part.kind==='branch')key+='/'+part.node+'/'+part.id;else throw new Error();}}
  else if(nav.moduleId)key='module/'+nav.moduleId;
  const scope=index.get(key);if(!scope)throw new Error();const trail=nav.trail??[];let previous=null;if(!Array.isArray(trail)||trail.length>32)throw new Error();for(const step of trail){if(!index.get(step.scopeId)?.nodes.some(n=>n.id===step.nodeId&&n.kind==='module'&&n.ref===step.definitionId)||(previous&&step.scopeId!=='module/'+previous&&!step.scopeId.startsWith('module/'+previous+'/')))throw new Error();previous=step.definitionId;}if(previous&&key!=='module/'+previous&&!key.startsWith('module/'+previous+'/'))throw new Error();
  value.navigation=structuredClone(nav);delete value.navigation.navigation;delete value.navigation.returnStack;if(Array.isArray(nav.returnStack)){value.navigation.returnStack=nav.returnStack.slice(0,64).map(item=>{const clean={...item};delete clean.returnStack;return validateIsolation({version:1,views:{},navigation:clean},document).navigation;}).filter(Boolean);}if(nav.selected&&!scope.nodes.some(n=>n.id===nav.selected))value.navigation.selected=null;if(Array.isArray(nav.selectedIds))value.navigation.selectedIds=nav.selectedIds.filter(id=>scope.nodes.some(n=>n.id===id));
 }catch{}}
 return value;
}
export function isolationSnapshot(session){return{version:1,views:Object.fromEntries([...session.views].filter(([,state])=>state.frames.length).map(([key,state])=>[key,{frames:structuredClone(state.frames)}]))};}
export class IsolationRecoveryStore{
 constructor({storage=globalThis.localStorage,key='glean.isolation-recovery.v1'}={}){this.storage=storage;this.key=key;}
 save(documentId,session){try{this.storage.setItem(this.key,JSON.stringify({documentId,snapshot:session?.version===1?session:isolationSnapshot(session)}));return true;}catch{return false;}}
 load(documentId,document){try{const entry=JSON.parse(this.storage.getItem(this.key));if(entry?.documentId!==documentId)return null;const result=validateIsolation(entry.snapshot,document);return Object.keys(result.views).length?result:null;}catch{return null;}}
}
