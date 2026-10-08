// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
// Pure history benchmark for one shared long definition; no UI/Lean success claim.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {DocumentHistory} from '../../prototype/web/history.mjs';
import {validateDocument} from '../../prototype/web/document.mjs';
const fixture=JSON.parse(readFileSync(new URL('fixtures/code-body-1m.glean.json',import.meta.url))),body=fixture.graph.nodes.find(n=>n.kind==='script').body;
const definition={id:'shared',name:'Shared long code',inputs:[{id:'n',name:'n',type:'Nat'}],outputType:'n + 0 = n',nodes:fixture.graph.nodes,edges:fixture.graph.edges,result:fixture.graph.result};
const doc={kind:'graph',graph:{version:3,name:'200 shared calls',projectId:'glean',imports:[],policy:'standard',inputs:[],goal:'3 + 0 = 3',modules:[definition],nodes:[{id:'three',kind:'nat',value:'3',x:0,y:0},...Array.from({length:200},(_,i)=>({id:'call'+i,kind:'module',ref:'shared',x:i*10,y:100}))],edges:Array.from({length:200},(_,i)=>({id:'wire'+i,source:'three',output:'out',target:'call'+i,input:'n'})),result:{node:'call199',output:'out'}}};
const error=validateDocument(doc);if(error)throw new Error(error);
const encoded=JSON.stringify(doc),baselineHeap=()=>{globalThis.gc?.();return process.memoryUsage();};
const before=baselineHeap(),history=new DocumentHistory({limit:50}),durations=[];history.reset(doc);
for(let i=0;i<50;i++){doc.graph.nodes[1].x=i;const started=performance.now();history.commit(doc);durations.push(performance.now()-started);}
const after=baselineHeap(),ordered=durations.toSorted((a,b)=>a-b),start=performance.now();history.undo();const undoMs=performance.now()-start;
const report={kind:'pure Node model benchmark; not browser response or actual kernel check',nodeVersion:process.version,platform:process.platform,architecture:process.arch,
 calls:200,bodyBytes:Buffer.byteLength(body),serializedDocumentBytes:Buffer.byteLength(encoded),serializedDefinitionOccurrences:encoded.split(JSON.stringify(body)).length-1,historyLimit:50,
 commitMs:{median:ordered[Math.floor(ordered.length*.5)],p95:ordered[Math.floor(ordered.length*.95)],maximum:ordered.at(-1)},undoMs,memoryBytes:{before,after,heapDelta:after.heapUsed-before.heapUsed,rssDelta:after.rss-before.rss},
 historyHash:createHash('sha256').update(readFileSync(new URL('../../prototype/web/history.mjs',import.meta.url))).digest('hex')};
writeFileSync(new URL(process.argv[2]??'shared-body-memory-retest-results.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
