// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import {normalizePresentation} from './presentation.mjs';
export function sourceScope(doc,declarations=[]){return{nodes:[{id:'file',name:doc.filename,kind:'원본 파일',x:0,y:0},...declarations.map((d,i)=>({id:'declaration:'+d.name,name:d.name,kind:'선언',x:240+(i%3)*240,y:Math.floor(i/3)*160}))],edges:[]};}
export function sourceView(doc,declarations=[]){
 const wrapper=doc.sourceFileView,valid=wrapper===undefined||(record(wrapper)&&wrapper.version===1&&Object.hasOwn(wrapper,'presentation'));
 const result=normalizePresentation({kind:'graph',graph:sourceScope(doc,declarations),presentation:valid?wrapper?.presentation:undefined});
 if(!valid){result.warnings.unshift('원본 파일 보기 형식 또는 버전이 올바르지 않아 기본 보기로 복구했습니다. 원본 설정은 보관됩니다.');result.original=structuredClone(wrapper);}
 return result;
}
export function sourceRelations(declarations,ids,direction){const selected=new Set(ids.filter(id=>id.startsWith('declaration:')).map(id=>id.slice(12))),known=new Set(declarations.map(d=>d.name));const names=direction==='inputs'?declarations.filter(d=>selected.has(d.name)).flatMap(d=>d.directDependencies):declarations.filter(d=>d.directDependencies.some(name=>selected.has(name))).map(d=>d.name);return{ids:[...new Set(names.filter(name=>known.has(name)))].map(name=>'declaration:'+name),unresolved:[...new Set(names.filter(name=>!known.has(name)))]};}
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),stringList=v=>Array.isArray(v)&&v.every(s=>typeof s==='string');
const range=v=>record(v)&&Number.isInteger(v.startLine)&&v.startLine>=1&&Number.isInteger(v.endLine)&&v.endLine>=v.startLine&&Number.isInteger(v.startCharacter)&&v.startCharacter>=0&&(v.endCharacter===undefined||(Number.isInteger(v.endCharacter)&&v.endCharacter>=0&&(v.endLine!==v.startLine||v.endCharacter>=v.startCharacter)));
export function normalizeSourceDeclarations(cache){
 if(!record(cache)||typeof cache.adapter!=='string'||!cache.adapter||!Array.isArray(cache.declarations)||cache.declarations.length>4096)return null;
 if(cache.imports!==undefined&&!stringList(cache.imports))return null;
 if(cache.environment!=null&&(!record(cache.environment)||(cache.environment.environmentHash!==undefined&&typeof cache.environment.environmentHash!=='string')))return null;
 for(const key of ['filename','projectId','sourceHash'])if(cache[key]!==undefined&&typeof cache[key]!=='string')return null;
 const names=new Set();
 for(const d of cache.declarations){
  if(!record(d)||typeof d.name!=='string'||!d.name||names.has(d.name)||!Array.isArray(d.inputs)||typeof d.outputType!=='string'||!stringList(d.directDependencies)||d.inputs.some(p=>!record(p)||typeof p.name!=='string'||typeof p.type!=='string'))return null;
  if(d.displayOutputType!==undefined&&typeof d.displayOutputType!=='string'||d.inputs.some(p=>p.displayType!==undefined&&typeof p.displayType!=='string'))return null;
  if(d.range!=null&&!range(d.range))return null;
  if(d.dependencyModules!==undefined&&(!record(d.dependencyModules)||!Object.values(d.dependencyModules).every(v=>typeof v==='string')))return null;
  names.add(d.name);
 }
 return cache;
}
