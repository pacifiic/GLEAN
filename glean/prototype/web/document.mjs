import {MAX_SOURCE_BYTES,MAX_DOCUMENT_BYTES} from './limits.mjs';
// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import {checkImport} from './model.mjs';
import {checkTypedImport} from './typed-model.mjs';
function validBase64(value){if(value.length%4)return false;const padding=value.indexOf('=');return !/[^A-Za-z0-9+/]/.test(padding<0?value:value.slice(0,padding))&&(padding<0||padding>=value.length-2&&/^={1,2}$/.test(value.slice(padding)));}
export function validOrigin(origin){
 if(!origin||origin.version!==1||typeof origin.bytesBase64!=='string'||origin.bytesBase64.length>Math.ceil(MAX_SOURCE_BYTES/3)*4||!validBase64(origin.bytesBase64)||typeof origin.sha256!=='string'||!/^[a-f0-9]{64}$/.test(origin.sha256)||typeof origin.bom!=='boolean'||!Number.isInteger(origin.byteLength)||!['utf-8','invalid-utf8'].includes(origin.decoding))return false;
 const padding=origin.bytesBase64.endsWith('==')?2:origin.bytesBase64.endsWith('=')?1:0,byteLength=origin.bytesBase64.length*3/4-padding;if(byteLength!==origin.byteLength||byteLength>MAX_SOURCE_BYTES||origin.bom!==origin.bytesBase64.startsWith('77u/'))return false;
 try{const bytes=Uint8Array.from(atob(origin.bytesBase64),c=>c.charCodeAt(0));new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);return origin.decoding==='utf-8';}catch{return origin.decoding==='invalid-utf8';}
}
export function validateDocument(doc) {
  if (!doc || typeof doc !== 'object') return '문서 형식이 올바르지 않습니다.';
  if(doc.review && (typeof doc.review.documentId!=='string'||!Array.isArray(doc.review.watches)||doc.review.watches.length>2||doc.review.watches.some(pin=>!pin||typeof pin.documentId!=='string'||typeof pin.nodeId!=='string'||typeof pin.revision!=='string'||!pin.snapshot||typeof pin.snapshot.name!=='string'||typeof pin.snapshot.id!=='string'||!Array.isArray(pin.snapshot.inputs)||pin.snapshot.inputs.length>16||pin.snapshot.inputs.some(p=>!p||typeof p.name!=='string')||!Array.isArray(pin.snapshot.assumptions)||pin.snapshot.assumptions.length>256||pin.snapshot.assumptions.some(a=>!a||typeof a.id!=='string'||typeof a.type!=='string')||(pin.snapshot.source&&(!pin.snapshot.sourceRange||!Number.isInteger(pin.snapshot.sourceRange.startLine))))))return 'Watch 저장 형식이 올바르지 않습니다.';
  const notebook=doc.review?.notebook;
  if(notebook!=null){if(typeof notebook!=='object'||Array.isArray(notebook)||!Array.isArray(notebook.variants)||notebook.variants.length>2||!Array.isArray(notebook.steps)||notebook.steps.length>20)return '북마크 / 문서 비교 저장 형식을 확인하세요.';for(const variant of notebook.variants){if(!variant||typeof variant.name!=='string'||!variant.document||typeof variant.document!=='object'||variant.document.review!==undefined||validateDocument(variant.document))return '저장된 A/B 문서의 형식을 확인하세요.';}if(notebook.steps.some(step=>!step||typeof step.id!=='string'))return '증명 단계 저장 형식을 확인하세요.';}
  if (doc.kind === 'graph') {
    const error = doc.graph?.version===3?checkTypedImport(doc.graph):checkImport(doc.graph);
    if (error) return error;
    const context=doc.graph.sourceContext;
    if(context?.sourceOrigin&&!validOrigin(context.sourceOrigin))return '보존된 원본 Lean 바이트 출처를 확인하세요.';
    if (doc.form && (typeof doc.form.name !== 'string' || typeof doc.form.propositions !== 'string' || typeof doc.form.goal !== 'string' || !Array.isArray(doc.form.assumptions) || doc.form.assumptions.length > 256 || doc.form.assumptions.some(a => !a || typeof a.id !== 'string' || typeof a.type !== 'string'))) return '설정 임시 저장 형식이 올바르지 않습니다.';
    return null;
  }
  if (doc.kind !== 'lean' || typeof doc.filename !== 'string' || !doc.filename.endsWith('.lean') || doc.filename.length > 128 || /[\/\\\0]/.test(doc.filename) || typeof doc.source !== 'string' || new TextEncoder().encode(doc.source).length > MAX_SOURCE_BYTES || !['glean','mathlib'].includes(doc.projectId) || typeof doc.target !== 'string' || doc.target.length > 512) return 'Lean 문서의 파일 이름, 프로젝트, 크기를 확인하세요 (최대 8 MiB).';
  if(doc.sourceOrigin&&!validOrigin(doc.sourceOrigin))return '원본 Lean 파일 바이트 및 출처 정보의 형식을 확인하세요.';
  if (doc.policy !== undefined && !['standard','strict'].includes(doc.policy)) return '지원하지 않는 공리 정책입니다.';
  return null;
}
export function parseDocument(filename, text) {
  if (new TextEncoder().encode(text).length > (/\.lean$/i.test(filename)?MAX_SOURCE_BYTES:MAX_DOCUMENT_BYTES)) throw new Error('Lean 파일은 8 MiB, 작업 기록은 JSON 인코딩 후 24 MiB 이하여야 합니다.');
  let doc;
  if (/\.lean$/i.test(filename)) doc = {kind:'lean',filename,source:text,projectId:/\bimport\s+Mathlib\b/.test(text)?'mathlib':'glean',target:''};
  else if (/\.json$/i.test(filename)) {
    try { const value=JSON.parse(text); doc=value.kind?value:{kind:'graph',graph:value}; }
    catch { throw new Error('GLEAN JSON 문서를 읽지 못했습니다. Lean 코드는 .lean 파일로 여세요.'); }
  } else throw new Error('.lean 또는 GLEAN .json 파일을 선택하세요.');
  const error=validateDocument(doc); if(error) throw new Error(error); return doc;
}
export function sourcePosition(source, offset) {
  const prefix=source.slice(0,Math.max(0,Math.min(source.length,offset)));
  const lines=prefix.split('\n'); return {line:lines.length-1,character:lines.at(-1).length};
}
export function positionOffset(source,line,character=0) {
  const lines=source.split('\n'); const row=Math.max(0,Math.min(lines.length-1,line));
  return lines.slice(0,row).reduce((n,s)=>n+s.length+1,0)+Math.max(0,Math.min(lines[row].length,character));
}
