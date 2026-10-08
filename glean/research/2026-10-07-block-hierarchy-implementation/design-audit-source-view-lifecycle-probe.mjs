// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initTypedEditor} from '../../prototype/web/typed-editor.mjs';
import {initGraphFocus} from '../../prototype/web/focus-mode.js';
import {typedDemo} from '../../prototype/web/typed-model.mjs';
import {normalizePresentation,PresentationSession,projectScope,createContainer,setManualHidden,semanticDocument} from '../../prototype/web/presentation.mjs';
import {diagnosticVisibility,manuallyHidden} from '../../prototype/web/visibility-tools.mjs';

class Element{
 constructor(tag='div',doc){this.doc=doc;this.tagName=tag;this.children=[];this.value='';this.textContent='';this.style={};this.dataset={};this.listeners={};this.attrs=new Map();this.isConnected=true;this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),contains:c=>this.classes.has(c),toggle:(c,on)=>{if(on??!this.classes.has(c))this.classes.add(c);else this.classes.delete(c);}};}
 append(...children){for(const child of children){if(child&&typeof child==='object')child.parentElement=this;this.children.push(child);}}
 replaceChildren(...children){this.children=[];this.append(...children);}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 setAttribute(k,v){this.attrs.set(k,String(v));}
 getAttribute(k){return this.attrs.get(k)??null;}
 setCustomValidity(m){this.validationMessage=m;}
 getBoundingClientRect(){return{left:0,top:0,width:1000,height:700};}
 remove(){this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}
 closest(selector){let n=this;while(n){if(selector==='button'&&n.tagName==='button')return n;n=n.parentElement;}return null;}
 focus(){this.doc.activeElement=this;}
 blur(){this.doc.activeElement=null;}
 async trigger(type,target=this,fields={}){const e={target,preventDefault(){},stopPropagation(){this.stopped=true;},button:0,clientX:0,clientY:0,...fields};let n=this;while(n){for(const fn of n.listeners[type]??[])await fn(e);if(e.stopped)break;n=n.parentElement;}}
 get selectedOptions(){return this.children.filter(c=>c.selected);}
 dispatchEvent(e){return this.trigger(e.type);}
}
const all=r=>[r,...r.children.flatMap(c=>c instanceof Element?all(c):[])];
const find=(r,p)=>all(r).find(p);
function fixture(){
 const doc=new EventTarget();doc.defaultView={CustomEvent};doc.body=new Element('body',doc);doc.createElement=t=>new Element(t,doc);doc.createElementNS=(ns,t)=>{const e=new Element(t,doc);e.namespaceURI=ns;return e;};
 const host=new Element('div',doc),properties=new Element('div',doc),panel=new Element('section',doc),button=new Element('button',doc);button.textContent='전체화면';doc.activeElement=new Element('button',doc);doc.fullscreenEnabled=false;doc.querySelector=s=>s==='.editor-panel'?panel:null;doc.getElementById=id=>id==='fullscreen-button'?button:null;
 globalThis.document=doc;globalThis.window={addEventListener(){}};globalThis.fetch=async()=>({ok:true,json:async()=>({status:'ready',verified:false})});
 const changes=[],editor=initTypedEditor({host,properties,onChange:()=>changes.push(editor.current())});return{doc,host,properties,editor,changes};
}

const {initSourceAnalysis}=await import('../../prototype/web/source-analysis.mjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function analysisFixture(route){const f=fixture(),host=new Element('section',f.doc),status=new Element('p',f.doc),run=new Element('button',f.doc),cancel=new Element('button',f.doc);let value={kind:'lean',filename:'Uploaded.lean',projectId:'mathlib',source:'theorem irrational_pi : Irrational Real.pi := by sorry\n'};const calls=[],caches=[],references=[],jumps=[],warnings=[],views=[],fileCard=new Element('article',f.doc);const analysis=initSourceAnalysis({host,status,run,cancel,fileCard,onWarning:x=>warnings.push(x),onView:x=>{views.push(x);value.sourceFileView=x;},current:()=>structuredClone(value),jump:(...args)=>jumps.push(args),onCache:x=>caches.push(x),onReference:x=>references.push(x),post:async(url,body)=>{calls.push({url,body});return route(url,body);}});return{...f,host,status,run,cancel,analysis,calls,caches,references,jumps,warnings,views,fileCard,current:()=>value,set:x=>value={...value,...x},close(){analysis.close();f.editor.close();}};}
const uploadedSource=fs.readFileSync(new URL('./design-audit-uploaded-pi-sorry.lean',import.meta.url),'utf8'),savedUploaded=JSON.parse(fs.readFileSync(new URL('./design-audit-uploaded-pi-sorry-analysis.json',import.meta.url)));
const actualUploaded=(savedUploaded.metadata?.declarations??savedUploaded.metadata?.items??[]).find(d=>d.name==='irrational_pi');
assert.ok(actualUploaded);
const uploadedResult={status:'analyzed',verified:false,kernelAccepted:false,adapter:'controlled real prior command-state observation',imports:['Lean'],sourceAttribution:'current-file',sourceHash:'controlled identity',filename:'Uploaded.lean',projectId:'mathlib',hasErrors:false,environment:{environmentHash:'controlled-upload-environment'},declarations:[{...actualUploaded,kind:actualUploaded.kind??'theorem',private:false,inputs:[],outputType:actualUploaded.type,range:actualUploaded.range,dependencyModules:{'Real.pi':'Controlled.Real.Pi'},directDependencies:actualUploaded.directDependencies??actualUploaded.dependencies??[]}]};
const results={};
{
 const reference={name:'irrational_pi',projectId:'mathlib',module:'Mathlib.Analysis.Real.Pi.Irrational',type:'Irrational Real.pi',inputs:[],outputType:'Irrational Real.pi',imports:['Mathlib.Analysis.Real.Pi.Irrational'],environment:{environmentHash:'controlled-installed-environment'},sourcePath:'controlled installed source; prior genuine baseline exists'};
 const h=analysisFixture(async url=>url.endsWith('/index/start')?uploadedResult:url.endsWith('/declaration')?reference:{cancelled:true});try{
  h.set({source:uploadedSource});await h.run.trigger('click');const statusBefore=h.status.textContent,allText=all(h.host).map(n=>n.textContent).join('\n');
  const importsInput=find(h.host,n=>n.getAttribute('aria-label')==='설치 선언 조회 import 모듈');assert.equal(importsInput.value,'Lean');importsInput.value='Mathlib.Analysis.Real.Pi.Irrational';await importsInput.trigger('input');await find(h.host,n=>n.textContent==='설치 환경의 같은 이름 조회').trigger('click');
  const disclaimer=find(h.host,n=>n.textContent==='설치 환경의 선언 · 업로드 본문의 검증 근거가 아닙니다.');
  await find(h.host,n=>n.textContent==='이 설치 선언으로 참조 그래프 만들기').trigger('click');
  results.provenance={uploadedActualSorryDependency:uploadedResult.declarations[0].directDependencies.includes('sorryAx'),uploadedUiStatus:statusBefore,uploadUnverified:statusBefore.includes('미검증'),currentFileExplicit:allText.includes('현재 파일'),installedDisclaimer:!!disclaimer,installedReferenceType:reference.type,referenceReceived:h.references[0]===reference,uploadedBodyNotAttachedToReference:!Object.hasOwn(h.references[0],'source'),lookupRequest:h.calls.find(c=>c.url.endsWith('/declaration'))?.body,controlledInstalledRecord:true,controlledDependencyModule:true};assert.deepEqual(results.provenance.lookupRequest.imports,['Mathlib.Analysis.Real.Pi.Irrational']);await find(h.host,n=>n.textContent==='Real.pi · 설치 환경').trigger('click');results.provenance.dependencyLookupRequest=h.calls.filter(c=>c.url.endsWith('/declaration')).at(-1).body;assert.deepEqual(results.provenance.dependencyLookupRequest.imports,['Controlled.Real.Pi']);
  assert.equal(results.provenance.uploadedActualSorryDependency,true);assert.ok(results.provenance.uploadUnverified&&results.provenance.currentFileExplicit&&results.provenance.installedDisclaimer&&results.provenance.referenceReceived&&results.provenance.uploadedBodyNotAttachedToReference);
  h.analysis.loadCache(uploadedResult);results.provenance.historicalCacheLabel=h.status.textContent;assert.ok(h.status.textContent.includes('저장된')&&h.status.textContent.includes('다시 분석'));
 }finally{h.close();}
}
{
 const opening=deferred(),h=analysisFixture(url=>url.endsWith('/index/start')?opening.promise:{cancelled:true});try{
  const pending=h.run.trigger('click');await new Promise(r=>setImmediate(r));h.set({filename:'New.lean',source:'theorem newer : True := True.intro'});h.analysis.invalidate();opening.resolve({status:'queued',jobId:'old-open'});await pending;
  results.lateStart={cacheCount:h.caches.length,renderedCards:all(h.host).filter(n=>n.className==='source-declaration-card').length,oldJobCancelled:h.calls.some(c=>c.url.endsWith('/index/cancel')&&c.body.jobId==='old-open'),runEnabled:!h.run.disabled};assert.deepEqual(results.lateStart,{cacheCount:0,renderedCards:0,oldJobCancelled:true,runEnabled:true});
 }finally{h.close();}
}
{
 const polling=deferred(),h=analysisFixture(url=>url.endsWith('/index/start')?{status:'queued',jobId:'old-poll'}:url.endsWith('/index/poll')?polling.promise:{cancelled:true});try{
  const pending=h.run.trigger('click');await new Promise(r=>setTimeout(r,220));h.set({projectId:'glean'});h.analysis.invalidate();polling.resolve(uploadedResult);await pending;
  results.latePoll={cacheCount:h.caches.length,renderedCards:all(h.host).filter(n=>n.className==='source-declaration-card').length,oldJobCancelled:h.calls.some(c=>c.url.endsWith('/index/cancel')&&c.body.jobId==='old-poll'),runEnabled:!h.run.disabled};assert.deepEqual(results.latePoll,{cacheCount:0,renderedCards:0,oldJobCancelled:true,runEnabled:true});
 }finally{h.close();}
}
{
 const lookup=deferred(),h=analysisFixture(url=>url.endsWith('/index/start')?uploadedResult:url.endsWith('/declaration')?lookup.promise:{cancelled:true});try{
  await h.run.trigger('click');const pending=find(h.host,n=>n.textContent==='설치 환경의 같은 이름 조회').trigger('click');h.set({source:'theorem changed : True := True.intro'});h.analysis.invalidate();lookup.resolve({name:'irrational_pi',environment:{environmentHash:'old'}});await pending;
  results.lateLookup={installedPanels:all(h.host).filter(n=>n.className==='source-installed-reference').length,cacheCount:h.caches.length,status:h.status.textContent};assert.equal(results.lateLookup.installedPanels,0);assert.ok(results.lateLookup.status.includes('다시 읽어'));
 }finally{h.close();}
}

{
 const real=JSON.parse(fs.readFileSync(new URL('./design-audit-command-product-retest.json',import.meta.url))),h=analysisFixture(url=>url.endsWith('/index/start')?real:{cancelled:true});try{
  h.set({filename:'Command.lean',projectId:'glean',source:fs.readFileSync(new URL('./design-audit-command-fixture.lean',import.meta.url),'utf8')});await h.run.trigger('click');
  const local=find(h.host,n=>n.tagName==='button'&&n.textContent==='Scoped.generated · 현재 파일');assert.ok(local);h.analysis.loadCache(real);
  const stored=find(h.host,n=>n.tagName==='button'&&n.textContent==='Scoped.generated · 저장된 분석');assert.ok(stored);const storedDependencyVisible=!!stored;await stored.trigger('click');
  await find(h.host,n=>n.textContent==='선택 + 직접 입력 보기').trigger('click');
  const text=all(h.host).map(n=>n.textContent).join('\n'),jumps=all(h.host).filter(n=>n.textContent==='원문 위치');
  results.historicalSourceRelations={summaryExplicit:text.includes('저장된 과거 분석'),localDependencyStored:storedDependencyVisible,noCurrentFileLabel:!text.includes('현재 파일'),sourceCorrespondenceUnknown:text.includes('본문 소스 참조 미확정'),allOriginalJumpsDisabled:jumps.every(n=>n.disabled),proofWireCount:0,actualAdapter:real.adapter};
  assert.ok(results.historicalSourceRelations.summaryExplicit&&results.historicalSourceRelations.localDependencyStored&&results.historicalSourceRelations.noCurrentFileLabel&&results.historicalSourceRelations.sourceCorrespondenceUnknown&&results.historicalSourceRelations.allOriginalJumpsDisabled);
 }finally{h.close();}
}
{
 const lookup=deferred(),h=analysisFixture(url=>url.endsWith('/declaration')?lookup.promise:{cancelled:true});try{
  h.analysis.loadCache(uploadedResult);const pending=find(h.host,n=>n.textContent==='설치 환경의 같은 이름 조회').trigger('click');h.set({source:'theorem newer : True := True.intro'});h.analysis.invalidate();lookup.reject(new Error('obsolete lookup failure'));await pending;
  results.historicalLateLookupFailure={status:h.status.textContent,obsoleteFailureDisplayed:h.status.textContent==='obsolete lookup failure',cacheCount:h.caches.length};assert.equal(results.historicalLateLookupFailure.obsoleteFailureDisplayed,false);
 }finally{h.close();}
}
{
 const start=deferred(),h=analysisFixture(url=>url.endsWith('/index/start')?start.promise:{cancelled:true});try{
  const pending=h.run.trigger('click');await new Promise(r=>setImmediate(r));h.set({filename:'Invalid.lean',source:'',sourceOrigin:{decoding:'invalid-utf8'}});h.analysis.loadCache(null);start.resolve({status:'queued',jobId:'obsolete-index'});await pending;
  results.lateIndexToInvalidUtf8={runDisabled:h.run.disabled,oldJobCancelled:h.calls.some(c=>c.url.endsWith('/index/cancel')&&c.body.jobId==='obsolete-index'),oldCacheCount:h.caches.length};assert.deepEqual(results.lateIndexToInvalidUtf8,{runDisabled:true,oldJobCancelled:true,oldCacheCount:0});
 }finally{h.close();}
}

{
 const {validateDocument}=await import('../../prototype/web/document.mjs');const h=analysisFixture(()=>({cancelled:true}));try{
  const cache={...uploadedResult,imports:42};h.set({target:'',analysisCache:cache});const importError=validateDocument(h.current());let loadError=null;try{h.analysis.loadCache(cache);}catch(error){loadError=error.name+': '+error.message;}
  results.malformedHistoricalImports={documentAccepted:importError===null,loadError,sourceUnchanged:h.current().source==='theorem irrational_pi : Irrational Real.pi := by sorry\n',cachePreserved:JSON.stringify(h.current().analysisCache)===JSON.stringify(cache),warningVisible:h.status.textContent.includes('손상'),persistentWarning:h.warnings.flat().some(s=>s.includes('캐시')),fileVisible:h.fileCard.hidden===false};assert.equal(loadError,null);assert.ok(results.malformedHistoricalImports.cachePreserved&&results.malformedHistoricalImports.warningVisible&&results.malformedHistoricalImports.persistentWarning&&results.malformedHistoricalImports.fileVisible);
 }finally{h.close();}
}

results.wrapperRecovery=[];
for(const [name,sourceFileView] of [['nonrecord','broken'],['badOuterVersion',{version:99,presentation:{version:1,scopes:{root:{hidden:['n:file'],containers:[]}},occurrenceViews:{}}}]]){
 const h=analysisFixture(()=>({cancelled:true}));try{
  h.set({sourceFileView});h.analysis.loadCache(null);const recovery=structuredClone(h.current().sourceFileView.presentationRecovery),source=h.current().source;assert.deepEqual(recovery,sourceFileView);assert.ok(h.warnings.length);assert.equal(h.fileCard.hidden,false);
  await h.fileCard.trigger('click');await find(h.host,n=>n.textContent==='선택 숨기기').trigger('click');const saved=h.current().sourceFileView.presentationRecovery;
  results.wrapperRecovery.push({name,warningVisible:h.warnings.length>0,exactOuterOriginal:JSON.stringify(recovery)===JSON.stringify(sourceFileView),defaultFileVisible:true,sourceUnchanged:h.current().source===source,originalRetainedAfterHide:JSON.stringify(saved)===JSON.stringify(sourceFileView),savedOriginal:saved??null,manualHideApplied:h.fileCard.hidden===true});assert.ok(results.wrapperRecovery.at(-1).originalRetainedAfterHide&&h.fileCard.hidden);
 }finally{h.close();}
}
const {createHash}=await import('node:crypto');
results.productHashes=Object.fromEntries(['source-analysis.mjs','source-view.mjs','visibility-tools.mjs'].map(name=>[name,createHash('sha256').update(fs.readFileSync(new URL('../../prototype/web/'+name,import.meta.url))).digest('hex')]));
results.executedAt=new Date().toISOString();
console.log(JSON.stringify(results,null,2));
