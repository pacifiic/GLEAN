// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import { WIDTH, nodeInputs, nodeHeight, portPosition, outputPortPosition, extractModule, checkImport, connect, deleteNode, RevisionGate, fitViewport, resizeViewport } from './model.mjs';
import { initWorkspace } from './workspace.js';
import { initGraphFocus } from './focus-mode.js';
import { initRibbon } from './ribbon.mjs';
import {DocumentHistory, semanticKey} from './history.mjs';
import {DraftStore} from './draft.mjs';
import {MAX_SOURCE_BYTES,MAX_DOCUMENT_BYTES} from './limits.mjs';
import {IsolationRecoveryStore,validateIsolation,isolationSnapshot} from './isolation-recovery.mjs';
import {initSourceAnalysis} from './source-analysis.mjs';
import {parseSourceBytes,currentSourceBytes,originalBytes} from './source-bytes.mjs';
import {parseDocument, validateDocument} from './document.mjs';
import {initLeanEditor} from './lean-editor.mjs';
import {inspectNode, pinWatch, previewIds, reviewFingerprint, restoreWatches, canReuseVerifiedResult,ensureDocumentIdentity} from './proof-review.mjs';
import {ComputeGate} from './compute-gate.mjs';
import {GraphRunner} from './graph-runner.mjs';
import {normalizePresentation,PresentationSession,projectScope,createContainer,descendantNodes,prunePresentation,containerBounds} from './presentation.mjs';
import {initVisibilityTools} from './visibility-tools.mjs';
import {initTypedEditor} from './typed-editor.mjs';
import {typedDemo} from './typed-model.mjs';
import {normalizeNotebook,saveVariant,restoreVariant,bookmark,compareVariants} from './notebook.mjs';

const $ = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
const META = {
  assumption: { title: '가정', symbol: 'h', label: 'GIVEN' },
  apply: { title: '함수 적용', symbol: '→', label: 'APPLY' },
  pair: { title: '논리곱 만들기', symbol: '∧', label: 'PAIR' },
  left: { title: '왼쪽 꺼내기', symbol: 'π₁', label: 'FIRST' },
  right: { title: '오른쪽 꺼내기', symbol: 'π₂', label: 'SECOND' },
  goal: { title: '목표', symbol: '⊢', label: 'GOAL' },
  module: { title: '함수 모듈', symbol: 'ƒ', label: 'FUNCTION' },
  group: { title: '접기 그룹', symbol: '▧', label: 'GROUP' },
};
const LABELS = { fn: '함수', arg: '입력', left: '왼쪽', right: '오른쪽', value: '논리곱', proof: '증명' };
const gate = new RevisionGate();
let graph;
let rootGraph;
let activeModuleId = null;
let selectedIds = new Set();
let documentPresentation={version:1,scopes:{}},presentationRecovery=null;
const sourceAnalysis=initSourceAnalysis({host:$('lean-file-declarations'),status:$('lean-file-analysis-status'),run:$('lean-file-index'),cancel:$('lean-file-index-cancel'),current:()=>leanEditor.current(),fileCard:$('lean-source-capsule'),onView:value=>leanEditor.setFileView(value),onWarning:renderPresentationWarning,onViewChange:persistIsolationRecovery,onTemporaryReturn:()=>{$('lean-file-block').hidden=false;$('lean-source-content').hidden=true;},diagnostics:()=>result?.diagnostics??[],onAnalyzed:value=>{$('lean-file-meta').textContent=(value.historical?'저장된 과거 명령 분석':'명령 분석 완료')+' · '+value.declarations.length+'개 선언 · '+(leanEditor.current()?.sourceOrigin?.byteLength??new TextEncoder().encode(leanEditor.current()?.source??'').length)+' bytes · '+value.projectId;},jump:(line,character)=>{$('lean-file-block').hidden=true;$('lean-source-content').hidden=false;leanEditor.jump(line,character);},onCache:value=>leanEditor.setAnalysisCache(value),post:async(url,body)=>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw new Error(value.diagnostics?.[0]?.message??'요청 실패');return value;},onConvert:doc=>{recordDocument();if(loadDocument(doc,false)){recordDocument();toast('선언 호출 그래프로 변환했습니다. 원문은 보관되며 Lean 재검사가 필요합니다.');}},onReference:reference=>{const inputs=reference.inputs.map(p=>({...p})),nodes=inputs.map((p,i)=>({id:'input'+i,kind:'input',ref:p.id,x:50,y:60+i*150}));nodes.push({id:'reference',name:reference.name,kind:'reference',declaration:reference.name,inputs,outputType:reference.outputType,reference,x:350,y:70});loadDocument({kind:'graph',graph:{version:3,name:reference.name+' · 설치 환경 참조',projectId:reference.projectId,imports:reference.imports,policy:'standard',inputs,goal:reference.outputType,nodes,edges:inputs.map((p,i)=>({id:'wire'+i,source:'input'+i,output:'out',target:'reference',input:p.id})),result:{node:'reference',output:'out'},modules:[]}});}});

const visibilitySession=new PresentationSession(),isolationRecoveryStore=new IsolationRecoveryStore();let pendingIsolationRecovery=null;
function persistIsolationRecovery(){if(loading||!review?.documentId)return;isolationRecoveryStore.save(review.documentId,mode==='typed'?typedEditor.isolationSnapshot():mode==='lean'?sourceAnalysis.isolationSnapshot():{...isolationSnapshot(visibilitySession),navigation:{moduleId:activeModuleId,selected,selectedIds:[...selectedIds],view:{...view}}});}
function offerIsolationRecovery(){const saved=isolationRecoveryStore.load(review.documentId,currentDocument());if(!saved)return;if(mode==='typed')typedEditor.offerIsolationRecovery(saved);else if(mode==='lean')sourceAnalysis.offerIsolationRecovery(saved);else{pendingIsolationRecovery=saved;graphVisibility.render();}}
const visualScopeKey=()=>activeModuleId?'module/'+activeModuleId:'root';
const scopePresentation=()=>documentPresentation.scopes[visualScopeKey()]??=({hidden:[],containers:[]});
function visibleGraph(body){return projectScope(body,scopePresentation(),visibilitySession.state(visualScopeKey()),{inputs:n=>nodeInputs(n,body),outputs:n=>n.kind==='goal'?[]:[{id:'out',name:n.name??n.id}]});}
function selectedEntities(){const projection=visibleGraph(graph);return [...selectedIds].map(id=>{if(id.startsWith('@container:'))return 'c:'+id.slice(11);const n=projection.nodes.find(n=>n.id===id);return n?.containerId?'c:'+n.containerId:'n:'+(n?.realNodeId??id);});}
const scopeViews = new Map();
let result = null;
let selected = null;
let pending = null;
let view = { x: 30, y: 40, zoom: 1 };
let drag = null;
let requestController = null;
let formDirty = false;
let activeExample = null;
let toastTimer;
let examples = [];
let mode = 'graph';
let restoring = false;
let loading = false;
let autosaveTimer;
const history = new DocumentHistory();
const drafts = new DraftStore({validate:validateDocument});
const graphRunner=new GraphRunner({post:async(path,body)=>{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.diagnostics?.[0]?.message??'검사 요청 실패');return data;}});
let inspectedId=null,contextObservations=[],sourceGraphSelection=null;
let verificationEpoch=0;
let review={documentId:crypto.randomUUID(),watches:[]}, previewMode='all', wireDrag=null, suppressPortClick=false;
const computeGate=new ComputeGate({run:kind=>{if(mode==='graph'&&!formDirty&&!loading)checkGraph(kind==='preview');}});
function reviewRevision(){return reviewFingerprint(semanticKey(currentDocument()));}
function applyPreview(){
  if(!graph)return;
  const projection=visibleGraph(graph), realSelected=[...selectedIds].flatMap(id=>projection.nodes.find(n=>n.id===id)?.memberIds??[id]);
  const included=previewIds(graph,previewMode,realSelected);
  for(const box of $('nodes').children){const node=projection.nodes.find(n=>n.id===box.dataset.id);box.classList.toggle('preview-muted',previewMode!=='all'&&!([node.id,...(node.memberIds??[])].some(id=>included.has(id))));}
  for(const path of $('wire-paths').children)path.classList.toggle('preview-muted',previewMode!=='all'&&(!included.has(path.dataset.source)||!included.has(path.dataset.target)));
}
function sourceLabel(label='그래프에서 생성된 증명'){
  $('source-note').textContent=label;
  $('source-panel').setAttribute('aria-label',label==='그래프에서 생성된 증명'?'생성된 Lean 코드':label);
  const sourceBacked=mode==='typed'&&typedEditor.current()?.graph.sourceContext;
  $('export-button').textContent=sourceBacked?'생성 그래프 + 원문 모듈 내보내기 ↗':'.lean 내보내기 ↗';
  $('export-button').title=sourceBacked?'내보내는 파일: 편집 그래프에서 생성한 Lean + GleanUploadedSource.lean 원문 모듈. 원문 보기에서는 화면의 원문과 별도로 생성 그래프 파일도 함께 저장됩니다. 두 파일을 같은 Lean 프로젝트에 보관하고 원문 모듈을 먼저 빌드하세요.':mode==='lean'?'현재 Lean 문서를 내보냅니다.':'그래프에서 생성한 Lean 파일을 내보냅니다.';
}
function revealSource(code,range){
  sourceLabel(range.sourceKind==='preserved'?'보존된 Lean 원문 · '+range.title:range.title?'Lean 선언 원문 · '+range.title:undefined);
  workspace.reveal('source');$('source-code').replaceChildren();
  const first=range.firstLine??1;
  for(const [index,line] of code.split('\n').entries())$('source-code').append(element('span',index+first>=range.startLine&&index+first<=range.endLine?'selected-source':'',line+'\n'));
  $('source-code').classList.add('has-code');$('line-numbers').textContent=code.split('\n').map((_,i)=>i+first).join('\n');
  $('source-code').querySelector('.selected-source')?.scrollIntoView({block:'nearest'});toast((range.title??'생성 소스')+' · L'+range.startLine+'–'+range.endLine);
}
function inspectionCard(data,stale=false){
  const card=element('article','inspection-card'+(stale?' stale':''));
  card.append(element('strong','',data.name+' · '+data.id),element('small','',stale?'과거 Watch · 현재 문서와 다름':data.verification==='historical'?'저장된 관찰 · 현재 검증 아님':data.verification==='incomplete-component'?'이 출력은 sorry를 포함 · 미완성':data.verification==='rejected-component'?'이 출력은 공리 정책에서 거부됨':data.verification==='verified-document'?'현재 문서 커널 검증됨':data.verification==='preview'?'타입 미리보기 · 커널 미검증':'미검증'));
  card.append(element('pre','', '출력: '+(data.type??'미확정')));if(data.audit)card.append(element('small','','이 출력의 공리: '+(Array.isArray(data.audit.axioms)?data.audit.axioms.join(', ')||'없음':'미확정')));
  for(const port of data.inputs)card.append(element('pre','',port.name+' ← '+(port.source??'미연결')+'\n'+(port.declared?'요구 (추상 선언 · 호환 미확정): ':'요구 (현재 문맥): ')+(port.expectedType??'미확정')+'\n제공: '+(port.actualType??'미확정')));
  card.append(element('small','','사용 가정: '+(data.assumptionsKnown===false?'미확정 · 현재 Lean 검사가 필요합니다.':data.assumptions.map(a=>a.id+' : '+a.type).join(', ')||'없음')));
  if(data.source){const code=element('pre','inspection-source',data.source);card.append(code);const jump=element('button','button quiet small','소스 L'+data.sourceRange.startLine+' ↗');jump.addEventListener('click',()=>{workspace.reveal('source');if(mode==='typed'){typedEditor.jumpKey(data.scopeId+'/'+data.id+'/'+(data.outputId??'out'));if(stale||data.verification==='historical'||!typedEditor.revealSelectedSource())revealSource(data.source,{...data.sourceRange,firstLine:data.sourceRange.startLine,title:'저장된 관찰 소스'});}else focusNode(data.id,data.scopeId??null);});card.append(jump);}
  return card;
}
function renderInspector(){
  if(mode==='lean')return;
  const data=mode==='typed'?typedEditor.inspectionSnapshot():inspectNode(graph,inspectedId??selected,result,activeModuleId);
  $('node-inspector').replaceChildren(data?inspectionCard({...data,scopeId:mode==='typed'?data.scopeId:activeModuleId}):element('p','muted','노드 또는 입력 포트를 선택하세요.'));
  $('watch-pin').disabled=!data;$('watch-list').replaceChildren();
  for(const pin of review.watches??[]){const card=inspectionCard({...pin.snapshot,verification:'historical'},pin.revision!==reviewRevision()||pin.documentId!==review.documentId);const remove=element('button','button quiet small','고정 해제');remove.addEventListener('click',()=>{review.watches=review.watches.filter(item=>item!==pin);renderInspector();recordDocument();});card.prepend(element('b','','WATCH '+(review.watches.indexOf(pin)+1)));card.append(remove);$('watch-list').append(card);}
}

function currentDocument() {
  if (mode === 'lean') {const doc=leanEditor.current();return doc?{...doc,review}:null;}
  if (mode === 'typed') {const doc=typedEditor.current();return doc?{...doc,review}:null;}
  syncScope();
  const doc = {kind:'graph', graph:rootGraph,review,presentation:documentPresentation};if(presentationRecovery)doc.presentationRecovery=presentationRecovery;
  if (formDirty) doc.form = {name:$('theorem-name').value,propositions:$('propositions').value,goal:$('goal-type').value,
    assumptions:[...$('assumptions-list').children].map(row=>{const inputs=row.querySelectorAll('input');return {id:inputs[0].value,type:inputs[1].value,originalId:row.dataset.originalId};})};
  return doc;
}
function updateHistoryButtons() { $('undo-button').disabled=!history.canUndo; $('redo-button').disabled=!history.canRedo; }
function persistDraft() {
  clearTimeout(autosaveTimer);
  const document=currentDocument(); if(!document)return;
  const saved=drafts.save(document);
  $('save-state').textContent=saved.ok?'자동 저장됨 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'자동 저장 실패 · 파일로 저장하세요';
  $('save-state').title=saved.error || '이 브라우저에 임시 저장됩니다. 그래프 저장으로 파일을 보관하세요.';
}
function recordDocument() {
  if(loading || restoring)return;
  verificationEpoch++;
  if(mode==='lean')sourceAnalysis.invalidate();
  const document=currentDocument();if(!document)return;
  if(mode==='lean'&&sourceGraphSelection&&(sourceGraphSelection.sourceIdentity!==reviewFingerprint(document.source)||sourceGraphSelection.projectId!==document.projectId||sourceGraphSelection.filename!==document.filename)){sourceGraphSelection=null;review.sourceGraphSelection=null;}
  history.commit(document);updateHistoryButtons();renderNotebook();
  clearTimeout(autosaveTimer);autosaveTimer=setTimeout(persistDraft,220);
}
function setMode(next) {
  mode=next;document.body.classList.toggle('lean-mode',mode==='lean');document.body.classList.toggle('typed-mode',mode==='typed');
  $('typed-workbench').hidden=$('typed-properties').hidden=mode!=='typed';
  $('lean-workbench').hidden=$('lean-properties').hidden=$('lean-context-view').hidden=mode!=='lean';
  $('save-button').textContent=mode==='lean'?'소스 저장 ↗':'그래프 저장 ↗';
  $('workspace-diagnostics').hidden=true;
}
function loadDocument(doc, resetHistory=true) {
  renderPresentationWarning([]);
  const error=validateDocument(doc);if(error){toast(error,true);return false;}
  doc=ensureDocumentIdentity(doc);
  verificationEpoch++;loading=true;contextObservations=[];sourceGraphSelection=doc.review?.sourceGraphSelection??null;
  if(doc.kind==='graph'&&doc.graph.version===3){
    sourceAnalysis.close();leanEditor.close();graphRunner.cancel();computeGate.cancel();requestController?.abort();gate.bump();result=null;formDirty=false;
    setMode('typed');$('check-button').disabled=false;$('check-button').textContent='▷ Lean으로 검증';clearSource();$('lean-output').hidden=true;$('diagnostics').replaceChildren();typedEditor.open(doc);$('graph-title').textContent=doc.graph.name;$('graph-count').textContent='Lean typed graph v3';
    status('unverified','타입 그래프 검사 대기','명시적 입력과 Lean 본문을 연결하세요.');workspace.reveal('context');workspace.reveal('verification');
  } else if(doc.kind==='graph') {
    sourceAnalysis.close();typedEditor.close();loadGraph(doc.graph,null,false,doc.presentation);
    if(doc.review){review=structuredClone(doc.review);review.watches=restoreWatches(review.watches);renderInspector();}
    if(doc.form) {
      $('theorem-name').value=doc.form.name;$('propositions').value=doc.form.propositions;$('goal-type').value=doc.form.goal;
      $('assumptions-list').replaceChildren();
      doc.form.assumptions.forEach(a=>{addAssumptionRow(a);$('assumptions-list').lastElementChild.dataset.originalId=a.originalId??a.id;});
      formDirty=true;$('apply-context').classList.add('dirty');status('unverified','설정 변경 중','복원된 설정을 적용한 뒤 검사하세요.');
    }
  } else {
    typedEditor.close();graphRunner.cancel();computeGate.cancel();gate.bump();requestController?.abort();requestController=null;result=null;formDirty=false;
    setMode('lean');$('check-button').disabled=false;$('check-button').textContent='▷ Lean으로 검증';
    leanEditor.open(doc);renderSourceFileBlock(doc);sourceAnalysis.loadCache(doc.analysisCache);renderLeanResult(null);
    status('unverified','Lean 소스 검사 대기','검증할 정리를 지정하고 Lean으로 검증을 누르세요.');
    workspace.reveal('context');workspace.reveal('verification');
  }
  review={documentId:doc.review?.documentId??crypto.randomUUID(),watches:restoreWatches(doc.review?.watches),notebook:normalizeNotebook(doc.review?.notebook),sourceGraphSelection,computeMode:doc.review?.computeMode==='auto'?'auto':'manual'};computeGate.setMode(review.computeMode);typedEditor.setAutomatic(review.computeMode==='auto');$('compute-mode').value=review.computeMode;renderNotebook();
  loading=false;
  if(resetHistory)history.reset(currentDocument());
  updateHistoryButtons();if(!restoring)persistDraft();return true;
}
async function navigateHistory(redo=false) {
  const old=currentDocument(),oldResult=result,oldScope=activeModuleId,oldView={...view},typedPresentation=mode==='typed'?typedEditor.presentation():null,oldIsolation=mode==='typed'?typedEditor.isolationSnapshot():mode==='graph'?isolationSnapshot(visibilitySession):mode==='lean'?sourceAnalysis.isolationSnapshot():null;
  const restored=redo?history.redo():history.undo();if(!restored)return;
  restoring=true;loadDocument(restored,false);
  if(mode==='graph'){if(oldScope&&rootGraph.modules?.some(m=>m.id===oldScope))setScope(oldScope);view=oldView;applyView();}
  else if(mode==='typed'&&typedPresentation)typedEditor.restorePresentation(typedPresentation);
  if(oldIsolation){if(mode==='typed')typedEditor.restoreIsolation(oldIsolation);else if(mode==='lean')sourceAnalysis.restoreIsolation(oldIsolation);else if(mode==='graph'){visibilitySession.views=new Map(Object.entries(validateIsolation(oldIsolation,currentDocument()).views));renderGraph();}}
  restoring=false;updateHistoryButtons();persistDraft();
  const key=semanticKey(restored),nextMode=mode,scope=$('graph-check-scope').value,epoch=verificationEpoch;
  if(old?.kind!==restored.kind||semanticKey(old)!==key||!oldResult?.verified||formDirty)return;
  try{const response=await fetch('/api/lean/environment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:(restored.kind==='lean'?restored.projectId:restored.graph.projectId)??'glean'})});if(!response.ok)return;const environment=await response.json();if(epoch!==verificationEpoch||mode!==nextMode||semanticKey(currentDocument())!==key||scope!==$('graph-check-scope').value)return;if(canReuseVerifiedResult(oldResult,environment)){if(mode==='typed')typedEditor.restoreResult(oldResult);else if(mode==='lean')renderLeanResult(oldResult);else displayGraphResult(oldResult);}else toast('Lean 환경이 바뀌어 이전 검증을 해제했습니다.');}catch{toast('Lean 환경을 확인하지 못해 이전 검증을 해제했습니다.',true);}
}
function renderNotebook(){
  const list=$('notebook-list');if(!list)return;list.replaceChildren();const notebook=normalizeNotebook(review.notebook);
  for(const variant of notebook.variants){const card=element('article','inspection-card');card.append(element('b','',variant.name+' · 저장된 문서'),element('small','',variant.createdAt),element('pre','',`프로젝트: ${variant.provenance.projectId??'미확정'}\n대상: ${variant.provenance.target??'미확정'}\n정책: ${variant.provenance.policy??'미확정'}\nLean: ${variant.provenance.environment?.leanVersion??'검사 기록 없음'}\n환경: ${variant.provenance.environment?.environmentHash??'미확정'}\n커밋: ${variant.provenance.environment?.gitCommit??'미확정'}\n소스: ${variant.provenance.sourceHash??'미확정'}\n공리: ${variant.provenance.audit?.axioms?.join(', ')??'미확정'}`));const restore=element('button','button quiet small','이 문서 복원 · 재검증 필요');restore.addEventListener('click',()=>{const saved=review,doc=restoreVariant(notebook,variant.name);loadDocument({...doc,review:saved});});const body=element('details','notebook-body'),summary=element('summary','','문서 본문 비교');body.append(summary,element('pre','',variant.document.kind==='lean'?variant.document.source:JSON.stringify(variant.document.graph,null,2)));const proof=element('details','notebook-body');proof.append(element('summary','','기록된 Lean 증명'),element('pre','',variant.provenance.generatedCode??'검사 소스 기록 없음'));card.append(restore,body,proof);list.append(card);}
  const comparison=compareVariants(notebook);if(comparison){const card=element('article','inspection-card notebook-diff');card.append(element('b','',comparison.names.join(' / ')+' 비교'),element('small','',`본문 변경 ${comparison.fields.length}곳 · 소스 ${comparison.sourceComparisonAvailable?'변경 '+comparison.source.length+'줄':'비교 불가 · 기록 없음'} · 환경 ${comparison.environmentComparisonAvailable?(comparison.environmentChanged?'다름':'같음'):'비교 불가 · 기록 없음'} · 정책 ${comparison.policyChanged?'다름':'같음'}`));for(const change of comparison.fields)card.append(element('pre','',change.path+'\nA: '+JSON.stringify(change.before)+'\nB: '+JSON.stringify(change.after)));for(const change of comparison.source)card.append(element('pre','',`Lean L${change.line}\nA: ${change.before}\nB: ${change.after}`));if(!comparison.fields.length)card.append(element('p','muted',comparison.sourceComparisonAvailable&&!comparison.source.length?'두 문서의 본문과 기록된 Lean 소스가 같습니다.':'두 문서의 본문이 같습니다.'));if(!comparison.sourceComparisonAvailable)card.append(element('p','muted','Lean 소스 기록이 없는 상태가 있어 소스를 비교할 수 없습니다.'));list.append(card);}
  for(const step of notebook.steps){const card=element('article','inspection-card'),name=element('input'),description=element('textarea');name.value=step.name;description.value=step.description;card.append(name,description,element('small','',(step.revision===reviewFingerprint(semanticKey(currentDocument()))?'현재 문서 기록':'과거 문서 기록')+' · '+step.scopeId),element('pre','', '이전 목표 (저장된 관찰): '+(step.before?.structuredGoals?.map(g=>g.type).join(' / ')??'관찰 없음')+'\n  '+(step.before?`${step.before.projectId} / ${step.before.filename} · v${step.before.version} · 소스 ${step.before.sourceIdentity}`:'')+'\n이후 목표 (저장된 관찰): '+(step.after?.structuredGoals?.map(g=>g.type).join(' / ')??'관찰 없음')+'\n  '+(step.after?`${step.after.projectId} / ${step.after.filename} · v${step.after.version} · 소스 ${step.after.sourceIdentity}`:'')));const save=element('button','button quiet small','설명 저장');save.addEventListener('click',()=>{review.notebook.steps=review.notebook.steps.map(s=>s.id===step.id?{...s,name:name.value,description:description.value}:s);recordDocument();});const jump=element('button','button quiet small','기록 위치로 이동');jump.addEventListener('click',()=>{if(mode==='lean'&&step.after?.sourceIdentity&&(step.after.sourceIdentity!==reviewFingerprint(leanEditor.current().source)||step.after.projectId!==leanEditor.current().projectId||step.after.filename!==leanEditor.current().filename)){toast('과거 소스의 관찰입니다. 기록된 위치와 목표를 확인하세요.',true);return;}if(mode==='lean'&&step.after?.position)leanEditor.jump(step.after.position.line,step.after.position.character);else if(mode==='typed'&&step.nodeIds?.length)typedEditor.jumpKey(step.scopeId+'/'+step.nodeIds[0]);else if(mode==='graph'&&step.nodeIds?.length)focusNode(step.nodeIds[0],step.scopeId==='root'?null:step.scopeId);});card.append(save,jump);list.append(card);}
}
function renderLeanDiagnostics(items,jump) {
  $('diagnostics').replaceChildren();
  for(const diagnostic of items) {
    const line=diagnostic.range?.start?.line ?? (diagnostic.line!=null?Math.max(0,diagnostic.line-1):null);
    const sourceLine=leanEditor.current()?.source?.split('\n')[line]??'';
    const character=diagnostic.range?.start?.character ?? [...sourceLine].slice(0,Math.max(0,(diagnostic.column??1)-1)).join('').length;
    const item=element('div','diagnostic '+([1,'error'].includes(diagnostic.severity)?'error':'info'));
    item.append(element('span','',diagnostic.message || String(diagnostic)));
    if(line!==null){const button=element('button','',`L${line+1}:${character+1} ↗`);button.addEventListener('click',()=>{sourceAnalysis.jumpDiagnostic({...diagnostic,line:line+1});$('lean-file-block').hidden=true;$('lean-source-content').hidden=false;jump(line,character);});item.append(button);}
    $('diagnostics').append(item);
  }
}
function renderLeanResult(data) {
  result=data;
  const doc=leanEditor.current();sourceLabel(doc?'Lean 문서 · '+doc.filename:undefined);
  $('source-code').textContent=doc?.source??'';$('source-code').classList.add('has-code');$('line-numbers').textContent='';$('export-button').disabled=!doc;
  $('lean-output').hidden=!data?.lean;$('lean-output-text').textContent=data?.lean?.output||'';
  if(!data)return;
  const audit=data.audit??{};
  if(data.verified)status('valid','정리가 검증되었습니다',`${data.target||doc.target} · 커널 재검사 통과 · 공리: ${(audit.axioms??[]).join(', ')||'없음'}`);
  else if(data.status==='incomplete')status('incomplete','미완성 증명입니다','sorryAx가 포함되어 검증 완료로 표시하지 않습니다.');
  else if(data.status==='cancelled')status('unverified','검사가 취소되었습니다','소스는 보관됩니다.');
  else status(data.status==='invalid'?'invalid':'error','Lean 소스를 확인하세요',audit.customAxioms?.length?'허용되지 않은 공리: '+audit.customAxioms.join(', '):'아래 진단과 Lean 실행 로그를 확인하세요.');
}
let originDisplayGeneration=0;
function renderSourceFileBlock(doc){const originToken=++originDisplayGeneration;const block=$('lean-file-block'),content=$('lean-source-content');block.hidden=false;content.hidden=true;const unreadable=doc.sourceOrigin?.decoding==='invalid-utf8'&&!doc.source;block.classList.toggle('decode-error',unreadable);$('lean-file-open').disabled=unreadable;$('lean-file-index').disabled=unreadable;$('check-button').disabled=unreadable;$('lean-file-title').textContent=doc.filename;$('lean-file-meta').textContent=(doc.sourceOrigin?.decoding==='invalid-utf8'?'UTF-8 해독 실패 · 원본 바이트 보관됨':'Lean 원본 파일 · 분석 전')+' · '+(doc.sourceOrigin?.byteLength??new TextEncoder().encode(doc.source).length)+' bytes · '+doc.projectId;$('lean-file-origin').textContent=doc.sourceOrigin?'원본 SHA-256 '+doc.sourceOrigin.sha256+' · '+(doc.sourceOrigin.bom?'BOM 보존':'BOM 없음'):'이 문서의 소스 텍스트 · 바이트 출처 미등록';if(doc.sourceOrigin)crypto.subtle.digest('SHA-256',originalBytes(doc)).then(hash=>{if(originToken!==originDisplayGeneration)return;const actual=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');$('lean-file-origin').textContent='원본 바이트 SHA-256 '+actual+' · '+(doc.sourceOrigin.bom?'BOM 보존':'BOM 없음');if(actual!==doc.sourceOrigin.sha256){$('lean-file-origin').textContent+=' · 저장된 출처 hash 불일치';toast('저장된 원본 hash와 실제 바이트가 다릅니다. 실제 바이트의 SHA-256을 표시합니다.',true);}});$('lean-file-original').hidden=!doc.sourceOrigin;$('lean-file-analysis-status').textContent=unreadable?'해독할 수 없는 원본 · 분석 불가 · 원본 바이트 보존':'아직 분석하지 않은 원본 파일 · 검증 결과와 별도';}
function renderTypedResult(data){
  result=data;if(!data){clearSource();return;}
  if(data.verified)status('valid','수학 그래프 검증 완료','커널 재검사 + 의도한 목표 타입 대조 · 공리: '+(data.audit?.axioms?.join(', ')||'없음'));
  else if(data.preview&&data.status==='ready')status('unverified','구조 미리보기 완료','Lean 타입/커널 검증은 아직 실행하지 않았습니다.');
  else status(data.status==='queued'||data.status==='running'?'checking':data.status,data.status==='incomplete'?'미완성 증명':data.status==='invalid'?'Lean이 그래프를 거부했습니다':'검사 결과',data.diagnostics?.[0]?.message??'');
  $('diagnostics').replaceChildren();for(const diagnostic of data.diagnostics??[]){const item=element('div','diagnostic error',diagnostic.message);if(diagnostic.line){const jump=element('button','',`L${diagnostic.line} ↗`);jump.addEventListener('click',()=>typedEditor.jumpDiagnostic(diagnostic));item.append(jump);}$('diagnostics').append(item);}
  if(data.generatedCode){sourceLabel();$('source-code').textContent=data.generatedCode;$('source-code').classList.add('has-code');$('line-numbers').textContent=data.generatedCode.split('\n').map((_,i)=>i+1).join('\n');$('export-button').disabled=false;}
  $('lean-output').hidden=!data.lean;$('lean-output-text').textContent=data.lean?.output??'';
}
const typedEditor=initTypedEditor({host:$('typed-workbench'),properties:$('typed-properties'),onChange:recordDocument,onResult:renderTypedResult,onStatus:status,onWarning:messages=>renderPresentationWarning(messages),onViewChange:persistIsolationRecovery,onSelection:renderInspector,onSource:revealSource,onSaveOriginalModule:source=>download('GleanUploadedSource.lean',source,'text/plain'),onOriginal:source=>{recordDocument();if(loadDocument(source,false)){recordDocument();toast('보존된 원문을 열었습니다. 실행 취소로 편집 중이던 그래프로 돌아갈 수 있습니다.');}},onExplore:(source,selection,range)=>{const saved={...review,sourceGraphSelection:{...selection,sourceIdentity:reviewFingerprint(source.source),projectId:source.projectId,filename:source.filename}};loadDocument({kind:'lean',...source,review:saved});setTimeout(()=>leanEditor.jump(range.startLine,4),200);workspace.reveal('inspector');}});
const leanEditor=initLeanEditor({onContext:snapshot=>{if(snapshot){contextObservations=[...contextObservations,{...snapshot,sourceIdentity:reviewFingerprint(snapshot.source)}].slice(-2);renderNotebook();}},onChange:recordDocument,onResult:renderLeanResult,onStatus:status,onDiagnostics:renderLeanDiagnostics,onReveal:()=>workspace.reveal('verification')});

const graphVisibility=initVisibilityTools({host:$('graph-visibility'),body:()=>graph,presentation:scopePresentation,session:visibilitySession,key:visualScopeKey,selection:selectedEntities,viewport:()=>({...view}),setViewport:v=>{view={...v};applyView();},edit:markLayoutChanged,refresh:()=>{renderGraph();persistIsolationRecovery();},recovery:()=>!!pendingIsolationRecovery,resume:()=>{const saved=validateIsolation(pendingIsolationRecovery,currentDocument());if(saved.navigation){if(saved.navigation.moduleId&&rootGraph.modules?.some(m=>m.id===saved.navigation.moduleId))setScope(saved.navigation.moduleId);selected=saved.navigation.selected;selectedIds=new Set(saved.navigation.selectedIds??[]);view={...saved.navigation.view};}visibilitySession.views=new Map(Object.entries(saved.views));pendingIsolationRecovery=null;renderGraph();persistIsolationRecovery();},focus:id=>focusNode(id,activeModuleId),ports:()=>({inputs:n=>nodeInputs(n,graph),outputs:n=>n.kind==='goal'?[]:[{id:'out',name:n.name??n.id}]}),diagnostics:scopeDiagnostics,fit:()=>{const nodes=visibleGraph(graph).nodes.filter(n=>selectedIds.has(n.id));if(!nodes.length)return;view.zoom=Math.max(.9,view.zoom);view.x=40-Math.min(...nodes.map(n=>n.x))*view.zoom;view.y=40-Math.min(...nodes.map(n=>n.y))*view.zoom;applyView();},error:e=>toast(e.message,true)});

function element(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
function uid(prefix) { return prefix + '_' + crypto.randomUUID().slice(0, 8); }
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').className = 'toast' + (error ? ' error' : '');
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}
function blankGraph() {
  return { version: 1, name: 'my_proof', propositions: ['P', 'Q'], assumptions: [{ id: 'hp', type: 'P' }], goal: 'P', nodes: [{ id: 'hp', kind: 'assumption', ref: 'hp', x: 80, y: 130 }, { id: 'goal', kind: 'goal', x: 420, y: 130 }], edges: [] };
}
function renderPresentationWarning(messages){$('presentation-warning').hidden=!messages.length;$('presentation-warning-text').textContent=messages.length?'표현 복구 · 원본 보관됨: '+messages.join(' '):'';}
function status(kind, title, description) {
  if(kind==='checking')verificationEpoch++;
  $('status-card').className = 'status-card ' + kind;
  $('status-icon').textContent = ({ valid: '✓', invalid: '×', error: '!', incomplete: '◌', checking: '◉', unverified: '○' })[kind] || '○';
  $('status-title').textContent = title;
  $('status-description').textContent = description;
  const compact=$('graph-checkstate');if(compact){compact.textContent=({valid:'현재 목표 · 커널 검증 완료',invalid:'현재 목표 · Lean 오류',error:'현재 목표 · 검사 오류',incomplete:'현재 목표 · 미완성',checking:'현재 목표 · 검사 중',unverified:'현재 목표 · 미검증'})[kind]??'현재 목표 · 미검증';compact.dataset.status=kind;compact.title=title+' · '+description;$('graph-check-run').disabled=kind==='checking'||mode==='lean'&&leanEditor.current()?.sourceOrigin?.decoding==='invalid-utf8'&&!leanEditor.current()?.source;$('graph-check-cancel').hidden=kind!=='checking';const list=$('graph-inline-diagnostics');if(list){list.replaceChildren();for(const d of result?.diagnostics??[]){const item=element('div','diagnostic',d.message),jump=element('button','button quiet small',d.bodyLine?'본문 L'+d.bodyLine+':'+d.bodyColumn+' ↗':'오류 위치 ↗');jump.addEventListener('click',()=>{if(mode==='typed')typedEditor.jumpDiagnostic(d);else if(mode==='lean'){sourceAnalysis.jumpDiagnostic(d); $('lean-file-block').hidden=true;$('lean-source-content').hidden=false;const line=Math.max(0,(d.line??1)-1),text=leanEditor.current()?.source.split('\n')[line]??'';leanEditor.jump(line,[...text].slice(0,Math.max(0,(d.column??1)-1)).join('').length);}else if(d.nodeId)focusNode(d.nodeId,d.moduleId??null);});if(d.graphLocation||d.nodeId||d.line)item.append(jump);list.append(item);}}}
}
function clearSource() {
  sourceLabel();
  $('source-code').textContent = '노드를 연결한 뒤 ‘Lean으로 검증’을 누르세요.\n완성된 그래프가 실행 가능한 Lean 코드로 변환됩니다.';
  $('source-code').classList.remove('has-code');
  $('line-numbers').textContent = '';
  $('export-button').disabled = true;
}
function syncScope() {
  if (!activeModuleId) return;
  const definition = rootGraph.modules.find(m => m.id === activeModuleId);
  Object.assign(definition, { nodes: graph.nodes, edges: graph.edges, groups: graph.groups ?? [] });
}
function scopeTypes() { return activeModuleId ? result?.moduleNodeTypes?.[activeModuleId] : result?.nodeTypes; }
function scopeDiagnostics() { return (result?.diagnostics ?? []).filter(d => (d.moduleId ?? null) === activeModuleId); }
function setScope(id) {
  if (formDirty && !applyContext()) return;
  syncScope();
  scopeViews.set(activeModuleId, { ...view });
  activeModuleId = id;inspectedId=null;
  const definition = rootGraph.modules?.find(m => m.id === id);
  graph = definition ? { version: 2, name: definition.name, propositions: rootGraph.propositions,
    assumptions: definition.inputs.map(input => ({ id: input.id, type: input.type })), goal: definition.outputType,
    nodes: definition.nodes, edges: definition.edges, groups: definition.groups ?? [], modules: rootGraph.modules,
    moduleId: id, rootGraph } : rootGraph;
  selected = pending = null;
  selectedIds.clear();
  fillContext();
  renderGraph();
  renderLibrary();
  if (scopeViews.has(id)) { view = { ...scopeViews.get(id) }; applyView(); } else fit();
}
function markLayoutChanged() {
  syncScope();
  $('save-state').textContent = '배치 변경됨 · 자동 저장 대기';
  if(!drag)recordDocument();
}
function markChanged(render = true) {
  syncScope();prunePresentation({kind:'graph',graph:rootGraph,presentation:documentPresentation});
  computeGate.cancel();graphRunner.cancel();
  gate.bump();
  requestController?.abort();
  requestController = null;
  result = null;
  $('check-button').disabled = false;
  $('check-button').textContent = '▷ Lean으로 검증';
  status('unverified', formDirty ? '설정 변경 중' : '다시 검증해 주세요', formDirty ? '설정을 적용한 뒤 현재 그래프를 확인하세요.' : '마지막 변경이 아직 검증되지 않았습니다.');
  $('diagnostics').replaceChildren();
  $('lean-output').hidden = true;
  clearSource();
  $('save-state').textContent = '변경됨 · 그래프 저장으로 보관';
  document.querySelectorAll('.node').forEach(n => {
    n.classList.remove('error', 'warning', 'verified');
    n.querySelector('.node-state')?.remove();
  });
  renderLibrary();
  if (render) renderGraph();
  recordDocument();
  if(!loading&&!restoring&&!formDirty)computeGate.changed();
}
function loadGraph(value, exampleId = null, resetHistory = true, savedPresentation=null) {
  const error = checkImport(value);
  if (error) { toast(error, true); return false; }
  const wasLoading=loading;loading=true;leanEditor.close();typedEditor.close();setMode('graph');
  rootGraph = graph = structuredClone(value);const normalized=normalizePresentation({kind:'graph',graph:rootGraph,presentation:savedPresentation});documentPresentation=normalized.value;presentationRecovery=normalized.original;visibilitySession.views.clear();pendingIsolationRecovery=null;if(normalized.warnings.length)renderPresentationWarning(normalized.warnings);
  review={documentId:crypto.randomUUID(),watches:[]};previewMode='all';$('preview-mode').value='all';
  activeModuleId = null;inspectedId=null;
  scopeViews.clear();
  selectedIds.clear();
  selected = null;
  pending = null;
  activeExample = exampleId;
  formDirty = false;
  markChanged(false);
  fillContext();
  renderGraph();
  fit();
  renderExamples();
  $('save-state').textContent = '자동 저장 대기';
  status('unverified', '검증 대기', '현재 그래프를 Lean 커널로 확인하세요.');
  loading=wasLoading;if(resetHistory)history.reset(currentDocument());updateHistoryButtons();if(!loading&&!restoring)persistDraft();
  return true;
}
function fillContext() {
  $('theorem-name').value = graph.name;
  $('propositions').value = graph.propositions.join(', ');
  $('goal-type').value = graph.goal;
  $('assumptions-list').replaceChildren();
  graph.assumptions.forEach(addAssumptionRow);
  updateAssumptionSelect();
  $('apply-context').classList.remove('dirty');
  $('context-form').querySelectorAll('input,button').forEach(input => { input.disabled = Boolean(activeModuleId); });
  $('context-scope-hint').hidden = !activeModuleId;
}
function addAssumptionRow(assumption = { id: '', type: '' }) {
  const row = element('div', 'assumption-row');
  row.dataset.originalId = assumption.id;
  const name = element('input');
  name.value = assumption.id;
  name.placeholder = 'hp';
  name.maxLength = 128;
  name.required = true;
  name.setAttribute('aria-label', '가정 이름');
  name.spellcheck = false;
  const type = element('input');
  type.value = assumption.type;
  type.placeholder = 'P → Q';
  type.maxLength = 512;
  type.required = true;
  type.setAttribute('aria-label', '가정 타입');
  type.spellcheck = false;
  const remove = element('button', 'remove-assumption', '×');
  remove.type = 'button';
  remove.setAttribute('aria-label', (assumption.id || '이') + ' 가정 제거');
  remove.addEventListener('click', () => { row.remove(); contextChanged(); });
  row.append(name, element('span', '', ':'), type, remove);
  $('assumptions-list').append(row);
}
function contextChanged() {
  formDirty = true;
  $('apply-context').classList.add('dirty');
  markChanged(false);
}
function updateAssumptionSelect() {
  const select = $('assumption-select');
  const previous = select.value;
  select.replaceChildren();
  graph.assumptions.forEach(a => {
    const option = element('option', '', a.id + ' : ' + a.type);
    option.value = a.id;
    select.append(option);
  });
  if (!graph.assumptions.length) select.append(element('option', '', '먼저 가정을 추가하세요'));
  if (graph.assumptions.some(a => a.id === previous)) select.value = previous;
  $('add-assumption-node').disabled = !graph.assumptions.length;
}
function applyContext() {
  if (activeModuleId) return true;
  if (!$('context-form').reportValidity()) return false;
  const assumptions = [];
  const renamed = new Map();
  for (const row of $('assumptions-list').children) {
    const inputs = row.querySelectorAll('input');
    const assumption = { id: inputs[0].value.trim(), type: inputs[1].value.trim() };
    if (!assumption.id || !assumption.type) { toast('가정 이름과 타입을 모두 입력해 주세요.', true); return false; }
    assumptions.push(assumption);
    if (row.dataset.originalId) renamed.set(row.dataset.originalId, assumption.id);
  }
  if (new Set(assumptions.map(a => a.id)).size !== assumptions.length) { toast('가정 이름이 중복됩니다.', true); return false; }
  const propositions = $('propositions').value.split(/[\s,]+/).filter(Boolean);
  if (!propositions.length || propositions.length > 64 || propositions.some(p => p.length > 64 || !/^[A-Z][A-Z0-9_]*$/.test(p)) || new Set(propositions).size !== propositions.length) { toast('명제 이름을 P, Q, R처럼 중복 없이 입력해 주세요.', true); return false; }
  if (!$('theorem-name').value.trim() || !$('goal-type').value.trim()) { toast('정리 이름과 목표를 입력해 주세요.', true); return false; }
  graph.name = $('theorem-name').value.trim();
  graph.propositions = propositions;
  graph.assumptions = assumptions;
  graph.goal = $('goal-type').value.trim();
  graph.nodes.filter(n => n.kind === 'assumption').forEach(node => {
    node.ref = renamed.get(node.ref) || node.ref;
    if (!assumptions.some(a => a.id === node.ref)) deleteNode(graph, node.id);
  });
  selected = graph.nodes.some(n => n.id === selected) ? selected : null;
  pending = null;
  formDirty = false;
  activeExample = null;
  markChanged();
  fillContext();
  renderExamples();
  return true;
}
function nodeType(node) {
  const types = scopeTypes();
  if (types && Object.hasOwn(types, node.id)) return types[node.id];
  if (node.kind === 'assumption') return graph.assumptions.find(a => a.id === node.ref)?.type || '가정 없음';
  if (node.kind === 'goal') return graph.goal;
  if (node.kind === 'module') return graph.modules?.find(m => m.id === node.ref)?.outputType || '?';
  if (node.kind === 'group') return node.memberIds.length + '개 노드 · 그룹';
  return '?';
}
function nodeTitle(node) {
  if (node.kind === 'assumption') return graph.modules?.find(m => m.id === activeModuleId)?.inputs.find(i => i.id === node.ref)?.name || node.ref;
  if (node.kind === 'module') return graph.modules?.find(m => m.id === node.ref)?.name || '함수';
  return node.name || META[node.kind].title;
}
function beginNodeDrag(event, node) {
  if(node.hiddenBoundary){focusNode(node.realNodeId,activeModuleId);return;}if (event.button !== 0 || event.target.closest('button,input')) return;
  event.stopPropagation(); event.preventDefault();
  $('canvas').focus({ preventScroll: true });
  if (event.shiftKey) selectNode(node.id, true);
  else if (!selectedIds.has(node.id)) selectNode(node.id);
  const projection = visibleGraph(graph);
  const ids = new Set();
  const groups = [];
  for (const item of projection.nodes.filter(n => selectedIds.has(n.id))) {
    if (item.containerId) {descendantNodes(scopePresentation(),'c:'+item.containerId).forEach(id=>ids.add(id));const pending=[item.containerId],seen=new Set();while(pending.length){const id=pending.pop();if(seen.has(id))continue;seen.add(id);const c=scopePresentation().containers.find(c=>c.id===id);if(c){groups.push(c);pending.push(...c.children.filter(k=>k.startsWith('c:')).map(k=>k.slice(2)));}}}
    else ids.add(item.id);
  }
  drag = { kind: 'node', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false,
    positions: [...graph.nodes.filter(n => ids.has(n.id)), ...groups].map(n => ({ node: n, x: n.x, y: n.y })) };
}
function changeGroup(id, remove = false) {
  const p=scopePresentation(),c=p.containers.find(c=>c.id===id);if(!c)return;if(remove){for(const parent of p.containers)parent.children=parent.children.flatMap(child=>child==='c:'+id?c.children:[child]);p.containers=p.containers.filter(c=>c.id!==id);p.hidden=p.hidden.filter(k=>k!=='c:'+id);}else c.collapsed=!c.collapsed;
  selected = null; selectedIds.clear(); pending = null;
  markLayoutChanged(); renderGraph();
}
function renderGroupFrames() {
  $('groups').replaceChildren();
  const bounds=containerBounds(scopePresentation(),visibleGraph(graph).nodes,n=>({width:WIDTH,height:nodeHeight(n,graph)}));
  for (const group of scopePresentation().containers) {
    if (group.collapsed) continue;
    const members = graph.nodes.filter(n => descendantNodes(scopePresentation(),'c:'+group.id).includes(n.id));if(!members.length||!members.some(n=>visibleGraph(graph).nodes.some(v=>v.id===n.id)))continue;
    const r=bounds.get(group.id);if(!r)continue;const {x,y}=r;
    const frame = element('div', 'group-frame');
    Object.assign(frame.style, { left: x + 'px', top: y + 'px', width:r.width+'px',height:r.height+'px' });
    const header = element('div', 'group-frame-header');
    header.append(element('strong', '', group.name));
    for (const [label, remove] of [['접기', false], ['그룹 해제', true]]) {
      const button = element('button', '', label);
      button.addEventListener('click', () => changeGroup(group.id, remove)); header.append(button);
    }
    header.addEventListener('pointerdown', event => {
      if (event.target.closest('button') || event.button !== 0) return;
      event.stopPropagation(); event.preventDefault();
      selectedIds = new Set(descendantNodes(scopePresentation(),'c:'+group.id)); selected = [...selectedIds][0]; updateSelection();
      drag = { kind: 'node', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false,
        positions: [...members, group].map(node => ({ node, x: node.x, y: node.y })) };
    });
    frame.append(header); $('groups').append(frame);
  }
}
function renderGraph() {
  $('graph-title').textContent = graph.name;
  $('module-breadcrumb').hidden = !activeModuleId;
  $('module-scope-name').textContent = activeModuleId ? rootGraph.name + ' / ƒ ' + graph.name + ' · 정의 편집 (모든 인스턴스에 적용)' : '';
  const projection = visibleGraph(graph);
  $('graph-count').textContent = projection.nodes.length + ' visible / ' + graph.nodes.length + ' nodes';
  const nodes = $('nodes'); nodes.replaceChildren();
  renderGroupFrames();graphVisibility.render();
  const diagnostics = scopeDiagnostics();
  const errors = new Set(diagnostics.filter(d => d.severity === 'error').map(d => d.nodeId));
  const warnings = new Set(diagnostics.filter(d => d.severity !== 'error' && d.port).map(d => d.nodeId));
  for (const node of projection.nodes) {
    const meta = META[node.kind], title = nodeTitle(node), typeText = nodeType(node);
    const members = node.memberIds ?? [node.id];
    const error = members.some(id => errors.has(id)), warning = members.some(id => warnings.has(id));
    const box = element('article', 'node ' + node.kind+(node.hiddenBoundary?' hidden-boundary':''));
    box.dataset.id = node.id;
    Object.assign(box.style, { width: WIDTH + 'px', left: node.x + 'px', top: node.y + 'px', height: nodeHeight(node, graph) + 'px' });
    box.classList.toggle('selected', selectedIds.has(node.id));
    box.classList.toggle('error', error); box.classList.toggle('warning', warning && !error);
    box.classList.toggle('verified', node.kind === 'goal' && result?.verified === true);
    box.title = title + ' · ' + typeText + '\n' + node.id;
    box.setAttribute('aria-label', title + ' · ' + typeText);
    const header = element('header');
    header.append(element('span', 'node-symbol', meta.symbol), element('span', 'node-name', title), element('span', 'node-kind', meta.label)); box.append(header);
    for (const input of nodeInputs(node, graph)) {
      const proxy = node.inputPorts?.find(p => p.id === input);
      const realNode = proxy ? graph.nodes.find(n => n.id === proxy.nodeId) : node;
      const realInput = proxy?.input ?? input;
      const portLabel = graph.modules?.find(m => m.id === realNode.ref)?.inputs.find(i => i.id === realInput)?.name || LABELS[realInput] || realInput;
      const name = proxy ? nodeTitle(realNode) + ' · ' + realNode.id + ' · ' + portLabel : portLabel;
      const position = portPosition(node, input, graph);
      const port = element('button', 'port input');
      port.classList.toggle('connected', graph.edges.some(e => e.target === realNode.id && e.input === realInput));
      port.dataset.input = input;port.dataset.nodeId=realNode.id;port.dataset.realInput=realInput;
      port.style.left = position.x - node.x - 1 + 'px'; port.style.top = position.y - node.y - 1 + 'px';
      port.title = title + ' · ' + name + ' 입력 (Alt + 클릭: 연결 해제)'; port.setAttribute('aria-label', title + ' ' + name + ' 입력');
      port.addEventListener('click', event => inputClicked(event, realNode, realInput, node.id));
      const shortLabel = proxy ? (node.memberIds.indexOf(realNode.id) + 1) + '·' + portLabel : portLabel;
      const label = element('span', 'port-label', shortLabel); label.style.top = position.y - node.y - 1 + 'px';
      box.append(port, label);
    }
    const outputs = node.kind === 'group' ? node.outputPorts : node.kind === 'goal' ? [] : [{ id: null, nodeId: node.id }];
    for (const socket of outputs) {
      const position = outputPortPosition(node, socket.id, graph);
      const output = element('button', 'port output');
      output.style.left = position.x - node.x - 1 + 'px'; output.style.top = position.y - node.y - 1 + 'px';
      output.title = title + ' · 출력: ' + (node.kind === 'group' ? socket.nodeId : typeText);
      output.setAttribute('aria-label', title + ' 출력' + (node.kind === 'group' ? ' ' + socket.nodeId : ''));
      output.addEventListener('pointerdown', event=>{if(event.button!==0)return;event.stopPropagation();wireDrag={source:socket.nodeId,pointerId:event.pointerId,x:event.clientX,y:event.clientY,moved:false,previous:pending};pending=socket.nodeId;renderPending(worldPoint(event));});
      output.addEventListener('click', event => { event.stopPropagation();if(suppressPortClick){suppressPortClick=false;return;} pending = pending === socket.nodeId ? null : socket.nodeId; selectNode(node.id);inspectedId=socket.nodeId;renderInspector();renderPending(); }); box.append(output);
    }
    const type = element('div', 'node-type', typeText); type.title = typeText; box.append(type);
    if (node.kind === 'module' || node.kind === 'group'&&!node.hiddenBoundary) {
      const button = element('button', 'module-open', node.kind === 'group' ? '펼치기' : '내부 ↗');
      button.setAttribute('aria-label', title + (node.kind === 'group' ? ' 펼치기' : ' 정의 편집'));
      button.addEventListener('click', event => { event.stopPropagation(); if (node.kind === 'group') changeGroup(node.ref); else setScope(node.ref); }); box.append(button);
    }
    if (error || warning || node.kind === 'goal' && result?.verified) box.append(element('span', 'node-state', error || warning ? '!' : '✓'));
    box.addEventListener('contextmenu',event=>{if(!selectedIds.has(node.id))selectNode(node.id);graphVisibility.contextMenu(event);});box.addEventListener('pointerdown', event => beginNodeDrag(event, node)); nodes.append(box);
  }
  updateSelection(); renderWires(); renderPending(); renderInspector(); applyPreview();
}
function curve(a, b) {
  const bend = Math.max(48, Math.abs(b.x - a.x) * .5);
  return 'M ' + a.x + ' ' + a.y + ' C ' + (a.x + bend) + ' ' + a.y + ' ' + (b.x - bend) + ' ' + b.y + ' ' + b.x + ' ' + b.y;
}
function renderWires() {
  const group = $('wire-paths'); group.replaceChildren();
  const projection = visibleGraph(graph);
  for (const edge of projection.edges) {
    const source = projection.nodes.find(n => n.id === edge.source), target = projection.nodes.find(n => n.id === edge.target);
    if (!source || !target) continue;
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', curve(outputPortPosition(source, edge.sourcePort ?? null, graph), portPosition(target, edge.input, graph)));
    path.setAttribute('class', 'wire' + ([source.id, target.id].some(id => selectedIds.has(id)) ? ' highlight' : '') + (scopeDiagnostics().some(d => d.nodeId === (edge.originalTarget ?? target.id) && d.port === (edge.originalInput ?? edge.input) && d.severity === 'error') ? ' invalid' : ''));
    path.dataset.source=edge.originalSource??source.id;path.dataset.target=edge.originalTarget??target.id;
    const wireTitle=document.createElementNS(svgNS,'title');wireTitle.textContent=path.dataset.source+' → '+path.dataset.target+' / '+(edge.originalInput??edge.input)+' · '+nodeType(graph.nodes.find(n=>n.id===path.dataset.source)??source);path.append(wireTitle);
    path.addEventListener('click',event=>{event.stopPropagation();focusNode(path.dataset.source,activeModuleId);workspace.reveal('inspector');});
    group.append(path);
  }
}
function renderPending(point) {
  const projection = visibleGraph(graph);
  const source = projection.nodes.find(n => n.id === pending || n.outputPorts?.some(p => p.nodeId === pending));
  document.querySelectorAll('.node').forEach(n => n.classList.toggle('pending-source', n.dataset.id === source?.id));
  const sourceType=(activeModuleId?result?.moduleNodeTypes?.[activeModuleId]:result?.nodeTypes)?.[pending];
  const required=(activeModuleId?result?.modulePortTypes?.[activeModuleId]:result?.portTypes)??{};
  for(const port of document.querySelectorAll('.port.input')){
    const expected=required[port.dataset.nodeId]?.[port.dataset.realInput];
    for(const value of ['compatible','incompatible','unknown'])port.classList.remove('candidate-'+value);
    if(pending)port.classList.add('candidate-'+(!sourceType||!expected?'unknown':sourceType===expected?'compatible':'incompatible'));
    port.title=(port.getAttribute('aria-label')??'입력')+' · 요구: '+(expected??'미확정')+(pending?' · 제공: '+(sourceType??'미확정'):'')+' · 타입 추론 안내 (커널 검증과 별개)';
  }
  $('canvas-tip').textContent = pending ? '입력 포트를 선택하세요 · Esc로 취소' : '◉  출력 포트 → 입력 포트 순서로 연결하세요';
  $('canvas-tip').classList.toggle('connecting', Boolean(pending));
  const path = $('pending-wire'); path.style.display = source && point ? '' : 'none';
  if (source && point) {
    path.removeAttribute('hidden');
    const port = source.outputPorts?.find(p => p.nodeId === pending)?.id ?? null;
    path.setAttribute('d', curve(outputPortPosition(source, port, graph), point)); path.setAttribute('class', 'wire pending');
  }
}
function inputClicked(event, node, input, selectionId = node.id) {
  event.stopPropagation();
  if(suppressPortClick){suppressPortClick=false;return;}
  selectNode(selectionId);inspectedId=node.id;renderInspector();workspace.reveal('inspector');
  if (event.altKey) {
    graph.edges = graph.edges.filter(e => !(e.target === node.id && e.input === input));
    pending = null;
    markChanged();
    return;
  }
  if (!pending) {
    toast(graph.edges.some(e => e.target === node.id && e.input === input) ? '다른 출력부터 선택하면 연결을 바꿀 수 있어요. Alt + 클릭으로 해제합니다.' : '먼저 다른 노드의 오른쪽 출력 포트를 선택하세요.');
    return;
  }
  try {
    connect(graph, pending, node.id, input, uid('wire'));
    pending = null;
    activeExample = null;
    markChanged();
    renderExamples();
  } catch (error) { toast(error.message, true); }
}
function selectNode(id, toggle = false) {
  if (!toggle) selectedIds.clear();
  inspectedId=null;
  if (id) { if (toggle && selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id); }
  selected = selectedIds.has(id) ? id : [...selectedIds].at(-1) ?? null;
  document.querySelectorAll('.node').forEach(n => n.classList.toggle('selected', selectedIds.has(n.dataset.id)));
  updateSelection();graphVisibility.render(); renderWires();renderInspector();applyPreview();
  for(const line of $('source-code').querySelectorAll('[data-node-id]'))line.classList.toggle('selected-source',line.dataset.nodeId===selected && line.dataset.moduleId===(activeModuleId??''));
  $('source-code').querySelector('.selected-source')?.scrollIntoView({block:'nearest'});
}
function updateSelection() {
  const selectedNodes = visibleGraph(graph).nodes.filter(n => selectedIds.has(n.id));
  $('selection-toolbar').hidden = !selectedNodes.length;
  const group = selectedNodes.length === 1 && selectedNodes[0].kind === 'group' ? selectedNodes[0] : null;
  $('selected-label').textContent = selectedNodes.length === 1 ? nodeTitle(selectedNodes[0]) : selectedNodes.length + '개 선택';
  $('delete-button').disabled = !selectedNodes.some(n => !['goal', 'group'].includes(n.kind));
  $('disconnect-button').disabled = !graph.edges.some(e => selectedIds.has(e.target));
  $('group-button').disabled = !selectedNodes.length || selectedNodes.some(n => n.hiddenBoundary);
  $('module-button').disabled = !selectedNodes.length || selectedNodes.some(n => ['goal', 'assumption', 'group'].includes(n.kind));
  $('ungroup-button').hidden = !group;
  $('module-name').hidden = Boolean(group);
}
function moduleDependsOn(id, target, seen = new Set()) {
  if (id === target) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  return rootGraph.modules?.find(m => m.id === id)?.nodes.some(n => n.kind === 'module' && moduleDependsOn(n.ref, target, seen)) ?? false;
}
function addNode(kind, ref = null, point = null) {
  if(mode!=='graph')return;
  if (formDirty && !applyContext()) return;
  syncScope();
  if (rootGraph.nodes.length + (rootGraph.modules ?? []).reduce((n, m) => n + m.nodes.length, 0) >= 256) { toast('전체 문서는 최대 256개 노드를 지원합니다.', true); return; }
  if (kind === 'module' && activeModuleId && moduleDependsOn(ref, activeModuleId)) { toast('함수는 자신을 순환 참조할 수 없습니다.', true); return; }
  const canvas = $('canvas');
  const node = { id: uid(kind), kind, x: Math.round((canvas.clientWidth / 2 - view.x) / view.zoom - WIDTH / 2), y: Math.round((canvas.clientHeight / 2 - view.y) / view.zoom - 40) };
  if(point){node.x=Math.round(point.x-WIDTH/2);node.y=Math.round(point.y-30);}
  if (kind === 'module') node.ref = ref;
  if (kind === 'assumption') { if (!graph.assumptions.length) return; node.ref = $('assumption-select').value; }
  let offset = 0;
  while (graph.nodes.some(n => Math.abs(n.x - node.x - offset) < 15 && Math.abs(n.y - node.y - offset) < 15)) offset += 28;
  node.x += offset; node.y += offset; graph.nodes.push(node);visibilitySession.includeNew(visualScopeKey(),[node.id]);
  selected = node.id; selectedIds = new Set([node.id]); pending = null; activeExample = null;
  markChanged(); renderExamples();
}
function renderLibrary() {
  const list = $('module-library'); list.replaceChildren();
  if (!rootGraph?.modules?.length) { list.append(element('p', 'module-empty', '연산 노드를 Shift + 클릭으로 선택하고 ‘함수로 만들기’를 누르세요.')); return; }
  for (const definition of rootGraph.modules) {
    const card = element('article', 'module-card');
    const count = [rootGraph, ...rootGraph.modules].reduce((n, scope) => n + scope.nodes.filter(node => node.kind === 'module' && node.ref === definition.id).length, 0);
    card.append(element('strong', '', 'ƒ ' + definition.name), element('small', '', count + '개 인스턴스 · 정의 공유'));
    card.append(element('pre', 'module-signature', definition.inputs.map(i => i.name + ' : ' + i.type).join('\n') + '\n→ ' + definition.outputType));
    const actions = element('div', 'module-actions');
    const add = element('button', 'button quiet small', '+ 인스턴스');
    add.setAttribute('aria-label', definition.name + ' 인스턴스 추가');
    add.disabled = Boolean(activeModuleId && moduleDependsOn(definition.id, activeModuleId));
    add.addEventListener('click', () => addNode('module', definition.id));
    const edit = element('button', 'button quiet small', '정의 편집');
    edit.setAttribute('aria-label', definition.name + ' 정의 열기'); edit.addEventListener('click', () => setScope(definition.id));
    actions.append(add, edit); card.append(actions); list.append(card);
  }
}
function deleteSelection() {
  let changed = false;
  for (const id of selectedIds) changed = deleteNode(graph, id) || changed;
  if (changed) { selected = pending = null; selectedIds.clear(); markChanged(); }
}
async function makeFunction() {
  if (formDirty && !applyContext()) return;
  const ids = [...selectedIds], scope = activeModuleId;
  if (!scopeTypes()) await checkGraph();
  if (scope !== activeModuleId || !ids.every(id => selectedIds.has(id))) return;
  try {
    syncScope();
    const { instance } = extractModule(graph, ids, scopeTypes(), { id: uid('function'), name: $('module-name').value.trim() || 'Function ' + ((rootGraph.modules?.length ?? 0) + 1), nodeId: uid('module') });
    selected = instance.id; selectedIds = new Set([instance.id]); pending = null;
    $('module-name').value = ''; activeExample = null;
    markChanged(); workspace.reveal('modules');
    toast('함수를 만들었습니다. 라이브러리에서 재사용하거나 내부를 편집하세요.');
  } catch (error) { toast(error.message, true); }
}
function applyView() {
  $('world').style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.zoom + ')';
  $('zoom-label').textContent = Math.round(view.zoom * 100) + '%';
  $('canvas').style.backgroundSize = (20 * view.zoom) + 'px ' + (20 * view.zoom) + 'px';
  $('canvas').style.backgroundPosition = view.x + 'px ' + view.y + 'px';
}
function fit() {
  view = fitViewport(visibleGraph(graph).nodes, $('canvas').clientWidth, $('canvas').clientHeight, graph);
  applyView();
}
function zoom(multiplier, x = $('canvas').clientWidth / 2, y = $('canvas').clientHeight / 2) {
  const next = Math.max(.15, Math.min(2, view.zoom * multiplier));
  view.x = x - (x - view.x) * next / view.zoom;
  view.y = y - (y - view.y) * next / view.zoom;
  view.zoom = next;
  applyView();
}
function worldPoint(event) {
  const rect = $('canvas').getBoundingClientRect();
  return { x: (event.clientX - rect.left - view.x) / view.zoom, y: (event.clientY - rect.top - view.y) / view.zoom };
}
function focusNode(id, moduleId = null) {
  if (moduleId !== activeModuleId) setScope(moduleId);
  if(!visibleGraph(graph).nodes.some(n=>n.id===id)){visibilitySession.reveal(visualScopeKey(),graph,scopePresentation(),id,view);renderGraph();}
  view.zoom = Math.max(.9, view.zoom);
  const node = graph.nodes.find(n => n.id === id);
  if (!node) return;
  view.x = $('canvas').clientWidth / 2 - (node.x + WIDTH / 2) * view.zoom;
  view.y = $('canvas').clientHeight / 2 - (node.y + nodeHeight(node, graph) / 2) * view.zoom;
  selectNode(id);
  applyView();
}
function renderDiagnostics(items) {
  $('diagnostics').replaceChildren();
  document.querySelectorAll('.field-error').forEach(input=>input.classList.remove('field-error'));
  for (const diagnostic of items) {
    const item = element('div', 'diagnostic ' + (diagnostic.severity === 'info' ? 'info' : 'error'));
    item.append(element('span', '', diagnostic.message || '확인되지 않은 오류입니다.'));
    if (diagnostic.field) {
      const button=element('button','',(diagnostic.field==='goal'?'목표':`가정 ${diagnostic.assumptionId??''}`)+' · '+(diagnostic.position??1)+'번째 문자 ↗');
      button.addEventListener('click',()=>{
        if((diagnostic.moduleId??null)!==activeModuleId)setScope(diagnostic.moduleId??null);
        workspace.reveal('context');
        const input=diagnostic.field==='goal'?$('goal-type'):[...$('assumptions-list').children].find(row=>row.dataset.originalId===diagnostic.assumptionId)?.querySelectorAll('input')[1];
        if(input){input.classList.add('field-error');input.focus();const start=Math.max(0,(diagnostic.position??1)-1);input.setSelectionRange(start,Math.min(input.value.length,start+1));}
      });
      item.append(button);
    }
    if (diagnostic.nodeId) {
      const button = element('button', '', diagnostic.nodeId + (diagnostic.port ? ' / ' + diagnostic.port : '') + ' ↗');
      button.addEventListener('click', () => focusNode(diagnostic.nodeId, diagnostic.moduleId ?? null));
      item.append(button);
    }
    $('diagnostics').append(item);
  }
}
async function checkGraph(preview = false) {
  verificationEpoch++;
  preview=preview===true;computeGate.cancel();
  if(!preview)workspace.reveal('verification');
  if(mode==='lean'){if(leanEditor.current()?.sourceOrigin?.decoding==='invalid-utf8'&&!leanEditor.current()?.source){toast('해독할 수 없는 원본은 Lean으로 검사할 수 없습니다.',true);return;}leanEditor.check();return;}
  if(mode==='typed'){typedEditor.check(preview);return;}
  if (formDirty && !applyContext()) return;
  syncScope();
  requestController?.abort();
  const controller = new AbortController();
  requestController = controller;
  const revision = gate.current();
  $('check-button').disabled = true;
  $('check-button').textContent = '◉ 검증 중…';
  status('checking', preview?'타입 미리보기 중':'Lean이 확인하고 있어요', preview?'커널을 실행하지 않고 그래프 타입을 추론합니다.':'연결된 타입과 최종 증명 항을 검사합니다.');
  try {
    const request={graph:structuredClone(rootGraph),scope:$('graph-check-scope').value};
    const deliver=data=>{
      if(!gate.isCurrent(revision)||controller!==requestController)return;
      displayGraphResult(data);
    };
    if(preview){
      await graphRunner.cancel();
      if(!gate.isCurrent(revision)||controller!==requestController)return;
      const response=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:controller.signal});
      deliver(await response.json());
    }else await graphRunner.run(request,deliver);

  } catch (error) {
    if (error.name === 'AbortError' || !gate.isCurrent(revision) || controller !== requestController) return;
    result = null;
    status('error', '검증 서버에 연결할 수 없어요', '로컬 서버가 실행 중인지 확인한 뒤 다시 시도하세요.');
    renderDiagnostics([{ severity: 'error', message: error.message }]);
    clearSource();
    renderGraph();
  } finally {
    if (gate.isCurrent(revision) && controller === requestController) {
      requestController = null;
      $('check-button').disabled = false;
      $('check-button').textContent = '▷ Lean으로 검증';
    }
  }
}
function displayGraphResult(data,responseOk=true) {
  result = data;
  const valid = data.status === 'valid' && data.verified === true;
  if (valid) status('valid', '증명이 검증되었습니다', (data.scope==='goal'?'목표에 필요한 노드 검증 완료 · 분리 작업 노드는 별도 진단. ':'주어진 가정 아래 목표가 증명되었습니다. ')+'추가 공리 없음' + (data.lean?.durationMs != null ? ' · ' + (data.lean.durationMs / 1000).toFixed(2) + '초' : ''));
  else if(data.preview&&data.status==='ready')status('unverified','타입 미리보기 완료','Lean 커널 미검증 · 검증 버튼으로 증명을 확인하세요.');
  else if (data.status === 'incomplete') status('incomplete', '연결을 완성해 주세요', '아직 증명을 만들지 못한 입력 포트가 있습니다.');
  else if (data.status === 'invalid') status('invalid', '증명을 확인해 주세요', '연결된 타입 또는 그래프 구조가 맞지 않습니다.');
  else status('error', '검증을 완료하지 못했어요', responseOk ? 'Lean 실행 결과와 아래 진단을 확인하세요.' : '서버가 요청을 처리하지 못했습니다.');
  renderDiagnostics(Array.isArray(data.diagnostics) ? data.diagnostics : []);
  if (typeof data.generatedCode === 'string' && data.generatedCode) {
    sourceLabel();
    $('source-code').textContent = data.generatedCode;
    $('source-code').classList.add('has-code');
    $('line-numbers').textContent = data.generatedCode.trimEnd().split('\n').map((_, i) => String(i + 1)).join('\n');
    $('export-button').disabled = false;
  } else clearSource();
  $('lean-output').hidden = !data.lean;
  $('lean-output-text').textContent = data.lean?.output || '출력 없음';
  $('save-state').textContent = valid ? '현재 그래프 검증 완료' : '현재 그래프 확인됨 · 수정 필요';
  renderGraph();
  const warnings=data.workspaceDiagnostics??[];
  $('workspace-diagnostics').hidden=!warnings.length;$('workspace-diagnostic-items').replaceChildren();
  for(const diagnostic of warnings){const button=element('button','button quiet small',(diagnostic.nodeId||'작업 노드')+': '+diagnostic.message);button.addEventListener('click',()=>focusNode(diagnostic.nodeId,diagnostic.moduleId??null));$('workspace-diagnostic-items').append(button);}
  renderSourceMap(data);
}
function renderSourceMap(data) {
  if(!data.generatedCode)return;
  const mapped=[];
  for(const [nodeId,range] of Object.entries(data.sourceMap??{}))mapped.push({nodeId,...range});
  for(const [moduleId,map] of Object.entries(data.moduleSourceMaps??{}))for(const [nodeId,range] of Object.entries(map))mapped.push({moduleId,nodeId,...range});
  sourceLabel();$('source-code').replaceChildren();
  data.generatedCode.trimEnd().split('\n').forEach((line,index)=>{
    const range=mapped.find(r=>r.startLine<=index+1&&r.endLine>=index+1);
    const span=element('span','source-line'+(range?' mapped':''),line||' ');
    if(range){span.dataset.nodeId=range.nodeId;span.dataset.moduleId=range.moduleId??'';span.title=range.nodeId+' · 노드로 이동';span.addEventListener('click',()=>focusNode(range.nodeId,range.moduleId??null));}
    $('source-code').append(span);
  });
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = element('a');
  anchor.href = url;
  anchor.download = name;
  anchor.hidden = true;
  document.body.append(anchor);
  try { anchor.click(); }
  finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
function safeName() { return ((mode==='typed'?typedEditor.current().graph.name:rootGraph.name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'glean_proof'); }
function renderExamples() {
  const list = $('examples-list');
  list.replaceChildren();
  if (!examples.length) { list.append(element('p', 'muted', '예제가 없습니다. 빈 증명으로 시작할 수 있어요.')); return; }
  examples.forEach((example, index) => {
    const button = element('button', 'example-button' + (example.id === activeExample ? ' active' : ''));
    const content = element('span');
    content.append(element('b', '', example.title), element('small', '', example.description));
    button.append(element('span', 'example-number', String(index + 1).padStart(2, '0')), content, element('span', 'example-arrow', '↗'));
    button.addEventListener('click', () => { if (loadGraph(example.graph, example.id)) toast('예제를 열었습니다. 검증 버튼으로 확인해 보세요.'); });
    list.append(button);
  });
}

$('context-form').addEventListener('input', contextChanged);
$('context-form').addEventListener('submit', event => { event.preventDefault(); if (applyContext()) toast('가정과 목표를 적용했습니다.'); });
$('add-assumption').addEventListener('click', () => { addAssumptionRow(); contextChanged(); $('assumptions-list').lastElementChild.querySelector('input').focus(); });
$('add-assumption-node').addEventListener('click', () => addNode('assumption'));
document.querySelectorAll('[data-add]').forEach(button=>{button.addEventListener('click',()=>addNode(button.dataset.add));button.draggable=true;button.addEventListener('dragstart',event=>{event.dataTransfer.setData('application/x-glean-component',button.dataset.add);event.dataTransfer.effectAllowed='copy';});});
$('canvas').addEventListener('dragover',event=>{if([...event.dataTransfer.types].includes('application/x-glean-component')){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
$('canvas').addEventListener('drop',event=>{const kind=event.dataTransfer.getData('application/x-glean-component');if(!META[kind]||['goal','module','group'].includes(kind))return;event.preventDefault();addNode(kind,null,worldPoint(event));});
$('check-button').addEventListener('click', ()=>checkGraph());
$('preview-button').addEventListener('click',()=>checkGraph(true));
$('graph-check-run').addEventListener('click',()=>{if(mode==='lean'&&leanEditor.current()?.sourceOrigin?.decoding==='invalid-utf8'&&!leanEditor.current()?.source){toast('UTF-8 해독 실패로 Lean 분석/검사를 실행할 수 없습니다. 원본 파일을 저장하세요.',true);return;}checkGraph();});
$('presentation-recovery-download').addEventListener('click',()=>{const document=currentDocument(),holder=Object.hasOwn(document??{},'presentationRecovery')?document:document?.sourceFileView;if(holder&&Object.hasOwn(holder,'presentationRecovery'))download('glean-presentation-original.json',JSON.stringify(holder.presentationRecovery,null,2),'application/json');});
$('graph-check-cancel').addEventListener('click',()=>{$('cancel-check').click();});
$('compute-mode').addEventListener('change',()=>{review.computeMode=$('compute-mode').value;recordDocument();computeGate.setMode($('compute-mode').value);typedEditor.setAutomatic($('compute-mode').value==='auto');graphRunner.cancel();requestController?.abort();status('unverified','실행 모드 변경됨','이전 검사를 취소했습니다.');requestController=null;$('check-button').disabled=false;$('check-button').textContent='▷ Lean으로 검증';});
$('cancel-check').addEventListener('click',()=>{if(mode==='typed'){typedEditor.cancel();return;}computeGate.cancel();graphRunner.cancel();requestController?.abort();requestController=null;$('check-button').disabled=false;$('check-button').textContent='▷ Lean으로 검증';status('unverified','실행 취소됨','현재 문서는 보관됩니다.');});
$('preview-mode').addEventListener('change',()=>{previewMode=$('preview-mode').value;applyPreview();});
$('inspect-button').addEventListener('click',()=>workspace.reveal('inspector'));
$('variant-save').addEventListener('click',async()=>{const control=$('variant-save'),document=structuredClone(currentDocument()),name=$('notebook-name').value,captured=result?structuredClone(result):{},documentId=review.documentId;control.disabled=true;try{const response=await fetch('/api/lean/environment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:document.projectId??document.graph?.projectId??'glean'})});if(!response.ok)throw new Error('문서의 Lean 환경을 확인하지 못했습니다.');const environment=await response.json();let evidence={...captured,environment};if(captured.environment?.environmentHash!==environment.environmentHash)evidence={environment,status:'unverified',generatedCode:captured.generatedCode??document.source??null};if(!evidence.generatedCode&&document.kind==='graph'){const preview=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({graph:document.graph,scope:'all'})});if(preview.ok)evidence.generatedCode=(await preview.json()).generatedCode;}if(typeof evidence.generatedCode==='string'){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(evidence.generatedCode));evidence.sourceHash=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}if(review.documentId!==documentId)return;review.notebook=saveVariant(review.notebook,name,document,evidence);renderNotebook();recordDocument();toast('문서와 실제 Lean 환경을 저장했습니다. 복원 후 다시 검증하세요.');}catch(error){toast(error.message,true);}finally{control.disabled=false;}});
$('notebook-export').addEventListener('click',()=>download('glean-notebook.json',JSON.stringify(currentDocument(),null,2),'application/json'));
$('bookmark-add').addEventListener('click',()=>{let selection=mode==='typed'?typedEditor.captureSelection():mode==='graph'?{scopeId:activeModuleId??'root',nodeIds:[...selectedIds],sourceRange:(activeModuleId?result?.moduleSourceMaps?.[activeModuleId]:result?.sourceMap)?.[selected],subgraph:{nodes:graph.nodes.filter(n=>selectedIds.has(n.id)),edges:graph.edges.filter(e=>selectedIds.has(e.source)&&selectedIds.has(e.target))}}:sourceGraphSelection??{};const last=contextObservations.at(-1),doc=currentDocument(),current=mode==='lean'&&last?.source===doc.source&&last?.projectId===doc.projectId&&last?.filename===doc.filename?last:null,previous=current?contextObservations.at(-2):last;const notebook=normalizeNotebook(review.notebook);notebook.steps.push(bookmark({id:uid('step'),name:$('notebook-name').value,description:$('notebook-description').value,revision:reviewFingerprint(semanticKey(currentDocument())),...selection,before:previous,after:current,source:current?.source?.split('\n').slice(Math.max(0,(current.position?.line??0)-2),(current.position?.line??0)+3).join('\n')}));review.notebook=normalizeNotebook(notebook);renderNotebook();recordDocument();});
$('watch-pin').addEventListener('click',()=>{const snapshot=mode==='typed'?typedEditor.inspectionSnapshot():inspectNode(graph,inspectedId??selected,result,activeModuleId);if(!snapshot)return;review.watches=pinWatch(review.watches,{documentId:review.documentId,scopeId:mode==='typed'?snapshot.scopeId:activeModuleId,nodeId:snapshot.id,outputId:snapshot.outputId??'out',revision:reviewRevision(),snapshot:{...snapshot,scopeId:mode==='typed'?snapshot.scopeId:activeModuleId}});renderInspector();recordDocument();});
$('fit-button').addEventListener('click', fit);
$('zoom-in').addEventListener('click', () => zoom(1.2));
$('zoom-out').addEventListener('click', () => zoom(1 / 1.2));
$('new-button').addEventListener('click', () => loadGraph(blankGraph()));
$('disconnect-button').addEventListener('click', () => { graph.edges = graph.edges.filter(e => !selectedIds.has(e.target)); pending = null; markChanged(); });
$('delete-button').addEventListener('click', deleteSelection);
$('module-button').addEventListener('click', makeFunction);
$('module-back-button').addEventListener('click', () => setScope(null));
$('group-button').addEventListener('click', () => {
  if (formDirty && !applyContext()) return;
  try {
    const group = createContainer(graph,scopePresentation(),selectedEntities(),{id:uid('group'),name:$('module-name').value.trim()||'그룹 '+(scopePresentation().containers.length+1)});
    $('module-name').value = ''; selected = visibleGraph(graph).nodes.find(n => n.kind === 'group' && n.ref === group.id).id; selectedIds = new Set([selected]); pending = null; markLayoutChanged(); renderGraph();
  } catch (error) { toast(error.message, true); }
});
$('ungroup-button').addEventListener('click', () => { const group = visibleGraph(graph).nodes.find(n => n.id === selected && n.kind === 'group'); if (group) changeGroup(group.ref, true); });
$('save-button').addEventListener('click', () => {
  if(mode==='lean'){const doc=leanEditor.current();download(doc.filename,currentSourceBytes(doc),'application/octet-stream');persistDraft();return;}
  if(mode==='typed'){download(safeName()+'.glean.json',JSON.stringify(currentDocument(),null,2),'application/json');persistDraft();return;}
  if (formDirty && !applyContext()) return;
  syncScope();
  download(safeName() + '.glean.json', JSON.stringify(currentDocument(), null, 2) + '\n', 'application/json');
  $('save-state').textContent = '그래프 파일 내보내기 완료';
  toast('현재 그래프를 JSON 파일로 저장했습니다.');
});
$('export-button').addEventListener('click', () => { if(mode==='lean'){const doc=leanEditor.current();download(doc.filename,currentSourceBytes(doc),'application/octet-stream');return;} if (result?.generatedCode){const context=mode==='typed'?typedEditor.current()?.graph.sourceContext:null;if(context){download('GleanUploadedSource.lean',context.source,'text/plain');toast('생성 Lean과 GleanUploadedSource.lean을 같은 Lean 프로젝트에 보관하세요. 모듈을 먼저 빌드해야 합니다.');}download(safeName() + '.lean', result.generatedCode, 'text/plain');} });
$('import-button').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > (/\.lean$/i.test(file.name)?MAX_SOURCE_BYTES:MAX_DOCUMENT_BYTES)) { toast('Lean 파일은 8 MiB, JSON은 24 MiB 이하를 선택해 주세요.', true); return; }
  try {
    const raw=new Uint8Array(await file.arrayBuffer()),value=/\.lean$/i.test(file.name)?await parseSourceBytes(file.name,raw):parseDocument(file.name,new TextDecoder('utf-8',{fatal:true}).decode(raw));
    if (loadDocument(value)) toast(value.sourceOrigin?.decoding==='invalid-utf8'?'UTF-8 해독 실패 · 원본 바이트가 보관되었습니다. 원본 파일 저장으로 복구하세요.':value.kind==='lean'?'Lean 원본 파일을 열었습니다. 소스 열기 또는 선언 분석을 선택하세요.':'그래프를 열었습니다. 다시 검증해 주세요.');
  } catch(error) { toast(error.message, true); }
});
$('canvas').addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('.node, .selection-toolbar, .group-frame-header, .preview-control')) return;
  selectNode(null);
  drag = { kind: 'pan', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: view.x, y: view.y, moved: false };
  $('canvas').classList.add('panning');
  event.preventDefault();
});
window.addEventListener('pointermove', event => {
  if(wireDrag&&wireDrag.pointerId===event.pointerId){wireDrag.moved ||= Math.abs(event.clientX-wireDrag.x)+Math.abs(event.clientY-wireDrag.y)>4;}
  if (pending) renderPending(worldPoint(event));
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (Math.abs(dx) + Math.abs(dy) < 3 && !drag.moved) return;
  if (drag.kind === 'pan') {
    view.x = drag.x + dx;
    view.y = drag.y + dy;
    applyView();
  } else {
    if (drag.positions.some(p => Math.abs(p.x + dx / view.zoom) > 1000000 || Math.abs(p.y + dy / view.zoom) > 1000000)) return;
    for (const position of drag.positions) {
      position.node.x = Math.round(position.x + dx / view.zoom);
      position.node.y = Math.round(position.y + dy / view.zoom);
    }
    markLayoutChanged(); renderGraph();
  }
  drag.moved = true;
});
function endDrag() { const changed=drag?.kind==='node'&&drag.moved;drag = null; $('canvas').classList.remove('panning');if(changed)recordDocument(); }
window.addEventListener('pointerup',event=>{if(wireDrag&&wireDrag.pointerId===event.pointerId){const active=wireDrag;wireDrag=null;if(active.moved){const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.port.input');suppressPortClick=true;setTimeout(()=>suppressPortClick=false,0);pending=null;if(target){try{connect(graph,active.source,target.dataset.nodeId,target.dataset.realInput,uid('wire'));activeExample=null;markChanged();}catch(error){toast(error.message,true);}}renderPending();}else pending=active.previous;}endDrag();});
window.addEventListener('pointercancel',()=>{wireDrag=null;pending=null;renderPending();endDrag();});
window.addEventListener('blur',()=>{wireDrag=null;pending=null;renderPending();endDrag();});
$('canvas').addEventListener('wheel', event => { event.preventDefault(); const rect = $('canvas').getBoundingClientRect(); zoom(Math.exp(-event.deltaY * .0015), event.clientX - rect.left, event.clientY - rect.top); }, { passive: false });
window.addEventListener('keydown', event => {
  if((event.metaKey||event.ctrlKey)&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();navigateHistory(event.key.toLowerCase()==='y'||event.shiftKey);return;}
  if(mode!=='graph')return;
  if(event.key==='Escape'){if(wireDrag||pending){wireDrag=null;pending=null;renderPending();}else if(!event.target.closest('input,select,textarea')&&!document.body.classList.contains('graph-focused'))graphVisibility.back();return;}
  if (event.target.closest('input,select,textarea') || !selected) return;
  if (!event.target.closest('#canvas')) return;
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    deleteSelection();
  }
});
async function start() {
  const recovered=drafts.load();
  if(recovered){loadDocument(recovered.document);offerIsolationRecovery();toast('자동 저장된 작업을 복구했습니다. 검증은 다시 실행해 주세요.');}
  else loadGraph(blankGraph());
  await Promise.allSettled([
    (async () => {
      try {
        const response = await fetch('/api/health');
        const health = await response.json();
        $('health-dot').className = 'connection-dot ' + (health.ok ? 'online' : 'offline');
        $('health-label').textContent = health.ok ? 'Lean ' + (health.leanVersion?.match(/\d+\.\d+\.\d+/)?.[0] || '4') + ' · 준비 완료' : 'Lean 실행 파일 확인 필요';
        $('health-label').title = health.leanVersion || '';
      } catch {
        $('health-dot').className = 'connection-dot offline';
        $('health-label').textContent = '로컬 서버 연결 끊김';
      }
    })(),
    (async () => {
      try {
        const response = await fetch('/api/examples');
        const data = await response.json();
        examples = (data.examples || []).filter(e => e && typeof e.id === 'string' && typeof e.title === 'string' && checkImport(e.graph) === null);
        renderExamples();
        if (!recovered && examples.length && gate.current() === 1) loadGraph(examples[0].graph, examples[0].id);
      } catch {
        $('examples-list').replaceChildren(element('p', 'muted', '예제를 불러올 수 없습니다. 서버 연결을 확인하세요.'));
      }
    })(),
  ]);
}
const workspace = initWorkspace();
initRibbon(document, workspace);
initGraphFocus(document,{cancelInteraction:()=>{if(mode==='typed')return typedEditor.cancelInteraction();if(mode==='lean'){if(sourceAnalysis.cancelInteraction())return true;if(!$('lean-source-content').hidden){renderSourceFileBlock(leanEditor.current());sourceAnalysis.refresh();return true;}}if(wireDrag||pending||drag){wireDrag=null;pending=null;drag=null;renderPending();return true;}const menu=[...document.querySelectorAll('.editor-panel details[open]')][0];if(menu){menu.open=false;return true;}if(document.activeElement?.matches('input,textarea,select')){document.activeElement.blur();return true;}return false;}});
let canvasSize = { width: $('canvas').clientWidth, height: $('canvas').clientHeight };
new ResizeObserver(() => {
  const next = { width: $('canvas').clientWidth, height: $('canvas').clientHeight };
  view = resizeViewport(view, canvasSize, next);
  canvasSize = next;
  applyView();
}).observe($('canvas'));
let windowedViewport = null;
let focusRevision = 0;
document.addEventListener('glean:focuschange', event => {
  if(mode!=='graph')return;
  const active = event.detail.active;
  const revision = ++focusRevision;
  if (active && !windowedViewport) windowedViewport = { view: { ...view }, size: { ...canvasSize } };
  requestAnimationFrame(() => {
    if (revision !== focusRevision) return;
    if (active && graph) {
      canvasSize = { width: $('canvas').clientWidth, height: $('canvas').clientHeight };
      fit();
    }
    else if (windowedViewport) {
      const next = { width: $('canvas').clientWidth, height: $('canvas').clientHeight };
      view = resizeViewport(windowedViewport.view, windowedViewport.size, next);
      canvasSize = next;
      windowedViewport = null;
      applyView();
    }
  });
});
$('undo-button').addEventListener('click',()=>navigateHistory());
$('redo-button').addEventListener('click',()=>navigateHistory(true));
$('recover-button').addEventListener('click',()=>{const saved=drafts.recoverPrevious();if(saved){loadDocument(saved.document);toast('이전 자동 저장본을 복원했습니다.');}else toast('복원할 이전 초안이 없습니다.');});
$('graph-check-scope').addEventListener('change',()=>markChanged());
$('pi-source-button').addEventListener('click',async()=>{try{const response=await fetch('/api/lean/reference/pi');const doc=await response.json();if(!response.ok)throw new Error(doc.diagnostics?.[0]?.message||'참조 파일을 열지 못했습니다.');loadDocument(doc);}catch(error){toast(error.message,true);}});
$('typed-new-button').addEventListener('click',()=>loadDocument({kind:'graph',graph:typedDemo()}));
$('lean-new-button').addEventListener('click',()=>loadDocument({kind:'lean',filename:'Proof.lean',projectId:'glean',target:'identity',source:'theorem identity (n : Nat) : n = n := by\n  rfl\n'}));
window.addEventListener('pagehide',()=>{persistIsolationRecovery();persistDraft();if(graphRunner.job)navigator.sendBeacon('/api/graph/check/cancel',new Blob([JSON.stringify({jobId:graphRunner.job})],{type:'application/json'}));});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){persistIsolationRecovery();persistDraft();}});
start();

$('lean-file-open').addEventListener('click',()=>{$('lean-file-block').hidden=true;$('lean-source-content').hidden=false;$('lean-editor').focus();});
$('lean-file-back').addEventListener('click',()=>{renderSourceFileBlock(leanEditor.current());sourceAnalysis.refresh();});
$('lean-file-original').addEventListener('click',()=>{const doc=leanEditor.current();download(doc.filename,originalBytes(doc),'application/octet-stream');});
