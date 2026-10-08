// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import {semanticKey, documentKey, DocumentHistory} from '../../prototype/web/history.mjs';
import {parseDocument} from '../../prototype/web/document.mjs';
import {typedDemo} from '../../prototype/web/typed-model.mjs';

const base={kind:'graph',graph:typedDemo()},changes=[];
for(const [id,change] of [
  ['node-position',d=>{d.graph.nodes[0].x+=100;}],
  ['outer-presentation',d=>{d.presentation={version:1,hidden:['root/n']};}],
  ['node-hidden',d=>{d.graph.nodes[0].hidden=true;}],
  ['source-body',d=>{d.graph.nodes[1].body='by exact Nat.add_zero x';}],
]){
 const value=structuredClone(base);change(value);
 changes.push({id,semanticUnchanged:semanticKey(base)===semanticKey(value),documentUnchanged:documentKey(base)===documentKey(value)});
}
const history=new DocumentHistory();history.reset(base);const hidden=structuredClone(base);hidden.presentation={version:1,hidden:['root/n']};history.commit(hidden);
const text='-- Unicode π\r\ntheorem kept : True := True.intro\r\n',bomBytes=new Uint8Array([239,187,191,...new TextEncoder().encode(text)]);
const decoded=await new Blob([bomBytes]).text(),doc=parseDocument('Preserved.lean',decoded);
const badBytes=new Uint8Array([...new TextEncoder().encode('-- '),0xC3,0x28,...new TextEncoder().encode('\ntheorem kept : True := True.intro\n')]);
const badText=await new Blob([badBytes]).text();let badAccepted=false,badError=null;
try{parseDocument('Invalid.lean',badText);badAccepted=true;}catch(error){badError=error.message;}
console.log(JSON.stringify({semanticChanges:changes,history:{canUndo:history.canUndo,undoRestoresOriginal:documentKey(history.undo())===documentKey(base)},sourceBytes:{rawLength:bomBytes.length,decodedLength:new TextEncoder().encode(decoded).length,bomPreserved:doc.source.charCodeAt(0)===0xFEFF,crlfPreserved:doc.source.includes('\r\n'),hasRawSnapshot:!!doc.sourceOrigin||!!doc.originalBytes},malformedUtf8:{replacementPresent:badText.includes('\uFFFD'),acceptedAfterReplacement:badAccepted,error:badError}},null,2));
