// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import {nodeInputs} from './model.mjs';
export function ensureDocumentIdentity(document){return{...document,review:{...document.review,documentId:document.review?.documentId??crypto.randomUUID(),watches:document.review?.watches??[]}};}

export function dependencyIds(graph, selected) {
  const known=new Set(graph.nodes.map(node=>node.id)), found=new Set(), pending=[...selected];
  const inputs=new Map(graph.nodes.map(node=>[node.id,[]]));
  for(const edge of graph.edges)inputs.get(edge.target)?.push(edge.source);
  while(pending.length){const id=pending.pop();if(!known.has(id)||found.has(id))continue;found.add(id);pending.push(...inputs.get(id));}
  return found;
}
export function previewIds(graph, mode, selected) {
  if(mode==='dependencies')return dependencyIds(graph,selected);
  if(mode==='selected')return new Set(selected.filter(id=>graph.nodes.some(node=>node.id===id)));
  return new Set(graph.nodes.map(node=>node.id));
}
export function inspectNode(graph, id, result, moduleId=null) {
  const node=graph.nodes.find(node=>node.id===id);if(!node)return null;
  const types=(moduleId?result?.moduleNodeTypes?.[moduleId]:result?.nodeTypes)??{};
  const portTypes=(moduleId?result?.modulePortTypes?.[moduleId]:result?.portTypes)??{};
  const definition=node.kind==='module'?graph.modules?.find(item=>item.id===node.ref):null;
  const actualType=source=>types[source.id]??(source.kind==='assumption'?graph.assumptions.find(item=>item.id===source.ref)?.type:null)??(source.kind==='goal'?graph.goal:null);
  const allDiagnostics=[...(result?.diagnostics??[]),...(result?.workspaceDiagnostics??[])];
  const included=!result?.includedNodes||Boolean(moduleId?result?.moduleSourceMaps?.[moduleId]?.[id]:result.includedNodes.includes(id));
  const inputs=nodeInputs(node,graph).map(port=>{
    const edge=graph.edges.find(edge=>edge.target===id&&edge.input===port),from=graph.nodes.find(node=>node.id===edge?.source);
    const parameter=definition?.inputs.find(input=>input.id===port);
    const diagnostics=allDiagnostics.filter(item=>item.nodeId===id&&item.port===port&&(item.moduleId??null)===moduleId);
    return {id:port,name:parameter?.name??port,source:from?.id??null,actualType:from?actualType(from):null,
      expectedType:portTypes[id]?.[port]??parameter?.type??(node.kind==='goal'?graph.goal:null),
      compatibility:diagnostics.some(item=>item.severity==='error')?'invalid':'unchecked',diagnostics};
  });
  const dependency=dependencyIds(graph,[id]);
  const refs=new Set(graph.nodes.filter(node=>dependency.has(node.id)&&node.kind==='assumption').map(node=>node.ref));
  const mapping=(moduleId?result?.moduleSourceMaps?.[moduleId]:result?.sourceMap)?.[id];
  return {id,kind:node.kind,name:definition?.name??node.name??node.ref??id,type:actualType(node),inputs,
    assumptions:graph.assumptions.filter(item=>refs.has(item.id)).map(item=>({...item})),
    source:mapping&&result?.generatedCode?result.generatedCode.split('\n').slice(mapping.startLine-1,mapping.endLine).join('\n'):null,
    sourceRange:mapping??null,dependencies:[...dependency],diagnostics:allDiagnostics.filter(item=>item.nodeId===id&&(item.moduleId??null)===moduleId),
    verification:result?.verified===true&&included?'verified-document':result?.preview?'preview':'unverified'};
}
export function pinWatch(pins, pin) {
  const same=item=>item.documentId===pin.documentId&&item.scopeId===pin.scopeId&&item.nodeId===pin.nodeId&&(item.outputId??item.snapshot?.outputId??'out')===(pin.outputId??pin.snapshot?.outputId??'out');
  return [...pins.filter(item=>!same(item)),structuredClone(pin)].slice(-2);
}
export function reviewFingerprint(text) {
  let value=2166136261;for(let index=0;index<text.length;index++){value^=text.charCodeAt(index);value=Math.imul(value,16777619);}
  return (value>>>0).toString(16)+':'+text.length;
}
export function restoreWatches(pins) {
  return structuredClone(pins??[]).slice(-2).map(pin=>({...pin,snapshot:{...pin.snapshot,verification:'historical'}}));
}
export function canReuseVerifiedResult(result,environment){return result?.verified===true&&typeof result.environment?.environmentHash==='string'&&result.environment.environmentHash===environment?.environmentHash;}
