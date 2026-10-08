// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import {parseDocument} from './document.mjs';import {MAX_SOURCE_BYTES} from './limits.mjs';
function encode(bytes){let result='';for(let start=0;start<bytes.length;start+=32768)result+=String.fromCharCode(...bytes.subarray(start,start+32768));return btoa(result);}
export function originalBytes(doc){const data=atob(doc.sourceOrigin?.bytesBase64??'');return Uint8Array.from(data,char=>char.charCodeAt(0));}
export function currentSourceBytes(doc){return doc.sourceOrigin?.decoding==='invalid-utf8'&&!doc.source?originalBytes(doc):new TextEncoder().encode(doc.source);}
export async function parseSourceBytes(filename,value){
 const bytes=value instanceof Uint8Array?value:new Uint8Array(value);if(bytes.length>MAX_SOURCE_BYTES)throw new Error('원본 Lean 파일은 8 MiB 이하를 선택해 주세요.');let source,decoding='utf-8';try{source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{source='';decoding='invalid-utf8';}
 const doc=parseDocument(filename,source),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 doc.sourceOrigin={version:1,bytesBase64:encode(bytes),sha256:hash,byteLength:bytes.length,decoding,bom:bytes[0]===239&&bytes[1]===187&&bytes[2]===191};return doc;
}
