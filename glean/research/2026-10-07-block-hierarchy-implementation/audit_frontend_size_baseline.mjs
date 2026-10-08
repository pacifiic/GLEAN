// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
// Pure import/model boundaries; this does not render a browser or run Lean.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {typedDemo} from '../../prototype/web/typed-model.mjs';
import {parseDocument,validateDocument} from '../../prototype/web/document.mjs';

const report={kind:'pure frontend import/model baseline',cases:[]};
for(const maximum of [64*1024,1024*1024]){
 let body='by\n',index=0;const ending='  exact Nat.add_zero x';
 while(true){const line=`  have h_${index++} : x + 0 = x := by exact Nat.add_zero x\n`;if(Buffer.byteLength(body+line+ending)>maximum)break;body+=line;}body+=ending;
 const graph=typedDemo();graph.nodes.find(n=>n.kind==='script').body=body;const doc={kind:'graph',graph};
 const text=JSON.stringify(doc);let parsed;try{parseDocument('large.glean.json',text);parsed={accepted:true};}catch(error){parsed={accepted:false,error:error.message};}
 report.cases.push({sizeClass:maximum,bodyBytes:Buffer.byteLength(body),lines:body.split('\n').length,serializedBytes:Buffer.byteLength(text),modelValidation:validateDocument(doc),fileImport:parsed});
}
report.fileHashes=Object.fromEntries(['document.mjs','history.mjs','app.js'].map(file=>[file,createHash('sha256').update(readFileSync(new URL('../../prototype/web/'+file,import.meta.url))).digest('hex')]));
writeFileSync(new URL('frontend-size-baseline-results.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
