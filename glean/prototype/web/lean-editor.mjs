// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import {sourcePosition, positionOffset} from './document.mjs';
const $ = id => document.getElementById(id);
async function api(path, body) {
  const response = await fetch('/api/lean/' + path, body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const value = await response.json();
  if (!response.ok || value.error) {
    const error=new Error(value.message || value.error || value.diagnostics?.[0]?.message || 'Lean 요청을 처리하지 못했습니다.');
    error.code=value.code;throw error;
  }
  return value;
}
export function initLeanEditor({onChange,onResult,onStatus,onDiagnostics,onReveal,onContext=()=>{}}) {
  let doc = null, session = null, generation = 0, revision = 0, syncTask = null, syncedSource = null, contextTimer, job = null, pollTimer, contextRequest=0, checkRequest=0;
  let closeTask=Promise.resolve(), starting=false, lastContext=null, sessionEpoch=0;
  const goalTree=document.createElement('section');goalTree.id='lean-goal-tree';goalTree.className='lean-goal-tree';
  goalTree.setAttribute('aria-label','Lean 목표와 지역 문맥 트리');
  const contextCancel=document.createElement('button');contextCancel.textContent='문맥 조회 중단';contextCancel.hidden=true;
  contextCancel.addEventListener('click',cancelContext);
  $('lean-context-view').append(contextCancel,goalTree);
  const contextSnapshot=()=>lastContext?structuredClone(lastContext):null;
  function clearContext() {lastContext=null;goalTree.replaceChildren();$('lean-goals').hidden=false;onContext(null);}
  function showGoalTree(data,position) {
    goalTree.replaceChildren();
    if(!Array.isArray(data.structuredGoals))return;
    const count=document.createElement('strong');count.textContent=`현재 위치의 열린 목표 · ${data.structuredGoals.length}개`;
    const list=document.createElement('ul');list.setAttribute('aria-label','열린 증명 분기');
    for(const goal of data.structuredGoals) {
      const row=document.createElement('li'),details=document.createElement('details'),summary=document.createElement('summary');
      details.open=true;summary.textContent=`${goal.name||'목표'} · ${goal.prefix||'⊢ '}${goal.type}`;
      const hypotheses=document.createElement('ul');hypotheses.setAttribute('aria-label',`${goal.name||'목표'}의 지역 가정`);
      for(const hypothesis of goal.hypotheses??[]) {
        const item=document.createElement('li');item.textContent=`${hypothesis.name} : ${hypothesis.type}${hypothesis.value?' := '+hypothesis.value:''}`;
        hypotheses.append(item);
      }
      const reveal=document.createElement('button');reveal.textContent=`관찰 위치 L${position.line+1}:${position.character+1}로 이동`;
      reveal.addEventListener('click',()=>jump(position.line,position.character));
      details.append(summary,hypotheses,reveal);row.append(details);list.append(row);
    }
    const note=document.createElement('small');note.textContent=`소스 v${data.version} · 커서의 Lean 상태이며 전체 정리의 검증 결과와는 별개입니다.`;
    goalTree.append(count,list,note);
  }
  async function cancelContext() {
    contextRequest++;sessionEpoch++;clearTimeout(contextTimer);contextCancel.hidden=true;clearContext();
    $('lean-goals').textContent='문맥 조회를 중단했습니다. 다시 읽으면 Lean에 재연결합니다.';goalSummary();
    $('lean-session-status').textContent='문맥 조회 중단됨';
    await closeSession();
  }
  const sessionKey='glean.lean-session.v1';
  function rememberedSession() {try{return window.sessionStorage.getItem(sessionKey);}catch{return null;}}
  function rememberSession(id) {try{window.sessionStorage.setItem(sessionKey,id);}catch{}}
  function forgetSession(id) {try{if(rememberedSession()===id)window.sessionStorage.removeItem(sessionKey);}catch{}}
  function queueClose(id) {
    if(!id)return closeTask;
    closeTask=closeTask.then(async()=>{try{await api('close',{sessionId:id});forgetSession(id);}catch{}});
    return closeTask;
  }
  queueClose(rememberedSession());
  const current = () => doc ? structuredClone(doc) : null;
  function goalSummary(text='') {const summary=$('lean-goal-summary');summary.textContent=text;summary.hidden=!text;}
  function editorInfo() {
    const position = sourcePosition($('lean-editor').value, $('lean-editor').selectionStart);
    $('lean-cursor').textContent = `Ln ${position.line+1}, Col ${position.character+1}`;
    $('lean-line-numbers').textContent = doc.source.split('\n').map((_,i)=>i+1).join('\n');
    $('lean-line-numbers').scrollTop = $('lean-editor').scrollTop;
    return position;
  }
  function declarations(items) {
    $('lean-declarations').replaceChildren();
    for (const item of items ?? []) {
      const name = item.name || item.id;
      const line = item.line ?? item.range?.start?.line ?? item.startLine ?? 0;
      const button = document.createElement('button'); button.className='lean-declaration';
      const label=document.createElement('span'); label.textContent=name;
      const number=document.createElement('small'); number.textContent='L'+(line+1);
      button.append(label,number); button.title=(item.kind || '선언')+' '+name;
      button.addEventListener('click',()=>jump(line,0));
      $('lean-declarations').append(button);
    }
  }
  function closeSession() {
    const previous=session;session=null;syncedSource=null;
    return queueClose(previous?.sessionId);
  }
  async function ensureSession(token=generation) {
    const epoch=sessionEpoch, live=()=>doc&&token===generation&&epoch===sessionEpoch;
    if(!live())return null;
    if(syncTask) {
      const running=syncTask;
      try{await running.promise;}catch(error){if(running.token===token && running.epoch===epoch && live())throw error;}
      return live()?ensureSession(token):null;
    }
    const task={token,epoch,promise:null};syncTask=task;
    task.promise=(async()=>{
      await closeTask;
      let recovered=false;
      while(live() && (!session || syncedSource!==doc.source)) {
        const source=doc.source, active=session;
        $('lean-session-status').textContent='Lean 정교화 중…';
        let response;
        try{response=active ? await api('update',{sessionId:active.sessionId,source,version:active.version}) : await api('open',{projectId:doc.projectId,filename:doc.filename,source});}
        catch(error){
          if(!live())return;
          if(active && error.code==='not_found' && !recovered){recovered=true;await closeSession();continue;}
          throw error;
        }
        if(!live()) {await queueClose(response.sessionId);return;}
        if(response.stale) {
          if(recovered)throw new Error('Lean 문서 버전을 동기화하지 못했습니다. 다시 조회하세요.');
          recovered=true;await closeSession();continue;
        }
        session=response;rememberSession(response.sessionId);syncedSource=source;declarations(response.declarations);
      }
      if(session && live()) $('lean-session-status').textContent='Lean 연결됨 · 현재 소스 v'+session.version;
    })();
    try {await task.promise;} finally {if(syncTask===task)syncTask=null;}
    return live()?session:null;
  }
  async function readContext() {
    if(!doc) return;
    clearTimeout(contextTimer);
    const token=generation, edit=revision, request=++contextRequest, position=editorInfo();
    const isCurrent=()=>doc && token===generation && edit===revision && request===contextRequest;
    $('lean-goals').textContent='Lean에서 목표와 지역 가정을 읽고 있습니다…';
    contextCancel.hidden=false;clearContext();
    $('lean-session-status').textContent='커서의 Lean 정교화를 기다리고 있습니다 · 최대 120초';
    goalSummary();
    $('lean-context-position').textContent=`L${position.line+1}:${position.character+1}`;
    let diagnosticsPending=false;
    try {
      let data;
      for(let attempt=0;attempt<2;attempt++) {
        const active=await ensureSession(token);
        if(!active || !isCurrent())return;
        $('lean-session-status').textContent='커서의 Lean 정교화를 기다리고 있습니다 · 최대 120초';
        try{data=await api('context',{sessionId:active.sessionId,...position,version:active.version});break;}
        catch(error){
          if(!isCurrent())return;
          if(error.code!=='not_found' || attempt)throw error;
          if(session?.sessionId===active.sessionId)await closeSession();
        }
      }
      if(!isCurrent() || data.stale) return;
      diagnosticsPending=data.diagnosticsComplete===false;
      const actualPosition=data.position??position;
      lastContext={...structuredClone(data),sessionId:data.sessionId??session?.sessionId,position:actualPosition,
        source:doc.source,projectId:doc.projectId,filename:doc.filename};
      showGoalTree(data,actualPosition);onContext(contextSnapshot());
      const rendered=(data.goals??[]).map(goal=>typeof goal==='string'?goal:goal.goal??JSON.stringify(goal)).join('\n\n') || data.renderedGoals;
      $('lean-goals').textContent=rendered?.replace(/^```lean\n|\n```$/g,'') || '이 위치에는 열린 증명 목표가 없습니다. by 블록 안의 전술 끝에 커서를 놓으세요.';
      $('lean-goals').hidden=Boolean(data.structuredGoals?.length);
      goalSummary((rendered??'').split('\n').filter(line=>/^\s*⊢/.test(line)).join('\n'));
      const hover=data.hover?.contents ?? data.hover;
      $('lean-hover').textContent=data.hoverText || data.termGoalText || (typeof hover==='string'?hover:hover?.value) || data.termGoal?.goal || '표현식 타입 정보 없음';
      declarations(data.declarations);
      if(!job) onDiagnostics(data.diagnostics??[],jump);
      $('lean-session-status').textContent='Lean 목표·지역 문맥 동기화됨 · v'+data.version+(data.diagnosticsComplete===false?' · 뒤쪽 소스 정교화 중':'');
      if(data.diagnosticsComplete===false)contextTimer=setTimeout(readContext,1500);
    } catch(error) {if(isCurrent()) {$('lean-session-status').textContent='Lean 연결 확인 필요';$('lean-goals').textContent=error.message;}}
    finally {if(isCurrent())contextCancel.hidden=!diagnosticsPending;}
  }
  function queueContext() {contextRequest++;editorInfo();clearTimeout(contextTimer);contextTimer=setTimeout(readContext,450);}
  function jump(line,character=0) {
    if(!doc) return;
    const offset=positionOffset(doc.source,line,character);
    $('lean-editor').focus();$('lean-editor').setSelectionRange(offset,offset);
    $('lean-editor').scrollTop=Math.max(0,line*22-100);editorInfo();readContext();onReveal();
  }
  async function cancel() {
    checkRequest++;const old=job,wasStarting=starting;job=null;starting=false;clearTimeout(pollTimer);$('lean-cancel-button').hidden=true;
    if(old || wasStarting)onStatus('unverified','검사를 취소했습니다','소스는 그대로 보관됩니다.');
    if(old) {try {await api('check/cancel',{jobId:old.jobId});} catch {}}
  }
  function invalidate() {
    revision++; cancel();onResult(null);
    onStatus('unverified','소스 변경 · 다시 검사해 주세요','목표와 지역 문맥은 현재 소스를 Lean 서버에서 읽습니다.');
    $('lean-goals').textContent='변경된 소스의 목표를 읽고 있습니다…';onDiagnostics([],jump);
    clearContext();
    goalSummary();
    onChange(current());queueContext();
  }
  async function open(value) {
    generation++;revision++;clearTimeout(contextTimer);cancel();closeSession();
    clearContext();contextCancel.hidden=true;
    doc=structuredClone(value);
    doc.policy=doc.policy??'standard';$('lean-policy').value=doc.policy;
    if(!doc.target) doc.target=[...doc.source.matchAll(/^\s*(?:public\s+)?(?:theorem|lemma)\s+([\p{L}_][\p{L}\p{N}_'.]*)/gmu)].at(-1)?.[1]??'';
    $('lean-editor').value=doc.source;$('lean-editor').setSelectionRange(0,0);$('lean-target').value=doc.target;$('lean-project').value=doc.projectId;
    $('graph-title').textContent=doc.filename;editorInfo();
    $('lean-goals').textContent='증명 내부의 커서 위치에서 실제 Lean 목표를 읽을 수 있습니다.';
    $('lean-context-position').textContent='';onDiagnostics([],jump);
    goalSummary();
    $('lean-hover').textContent='';$('lean-declarations').replaceChildren();
    const token=generation;
    api('projects').then(data=>{
      if(token!==generation) return;
      const profile=(Array.isArray(data)?data:data.projects??[]).find(p=>p.id===doc.projectId);
      $('lean-project-status').textContent=profile?.available===false ? profile.reason || profile.message || '프로젝트 준비가 필요합니다.' : (profile?.name || doc.projectId)+' · '+(profile?.leanVersion||'Lean 4.34.1');
    }).catch(error=>{if(token===generation)$('lean-project-status').textContent=error.message;});
    try {await ensureSession(token);} catch(error) {if(token===generation)$('lean-session-status').textContent=error.message;}
  }
  async function check() {
    if(!doc)return;
    const token=generation,edit=revision,cancelled=cancel(),request=checkRequest;
    await cancelled;
    if(!doc || token!==generation || edit!==revision || request!==checkRequest)return;
    if(!doc.target.trim()) {onStatus('incomplete','검증할 정리를 지정하세요','왼쪽에 정리 이름을 입력하세요. 이름 없는 example은 이름 있는 theorem으로 바꾸어 검사합니다.');onReveal();return;}
    onStatus('checking','Lean 소스를 검사하고 있습니다','소스 컴파일 → 커널 재검사 → 정리의 공리 의존성 확인');
    starting=true;$('lean-cancel-button').hidden=false;onDiagnostics([],jump);onReveal();
    try {
      const data=await api('check/start',{...current(),policy:$('lean-policy').value});
      if(token!==generation || edit!==revision || request!==checkRequest) {if(data.jobId)api('check/cancel',{jobId:data.jobId}).catch(()=>{});return;}
      starting=false;job=data;const jobId=data.jobId;
      const poll=async()=>{
        if(!job || job.jobId!==jobId || token!==generation || edit!==revision || request!==checkRequest) return;
        try {
          const state=await api('check/poll',{jobId});
          if(!job || job.jobId!==jobId || token!==generation || edit!==revision || request!==checkRequest) return;
          if(['queued','running','checking'].includes(state.status)) {
            const phase={elaborating:'소스 컴파일','kernel-audit':'커널·공리 재검사',preparing:'프로젝트 준비'}[state.phase] || state.phase || '소스 검사';
            onStatus('checking',phase+' 중…','최대 120초 · 검사 취소로 중단할 수 있습니다.');pollTimer=setTimeout(poll,700);
          } else {job=null;$('lean-cancel-button').hidden=true;onResult(state);onDiagnostics(state.diagnostics??[],jump);}
        } catch(error) {if(request!==checkRequest || token!==generation)return;job=null;$('lean-cancel-button').hidden=true;onStatus('error','검사 결과를 받지 못했습니다',error.message);}
      };poll();
    } catch(error) {if(request!==checkRequest || token!==generation)return;starting=false;$('lean-cancel-button').hidden=true;onStatus('error','Lean 검사를 시작하지 못했습니다',error.message);}
  }
  window.addEventListener('pagehide',()=>{if(session)navigator.sendBeacon('/api/lean/close',new Blob([JSON.stringify({sessionId:session.sessionId})],{type:'application/json'}));if(job)navigator.sendBeacon('/api/lean/check/cancel',new Blob([JSON.stringify({jobId:job.jobId})],{type:'application/json'}));});
  $('lean-goto-button').addEventListener('click',()=>jump(Math.max(0,Number($('lean-goto-line').value)-1),2));
  $('lean-editor').addEventListener('input',()=>{if(doc){doc.source=$('lean-editor').value;invalidate();}});
  for(const event of ['click','keyup']) $('lean-editor').addEventListener(event,()=>{if(doc)queueContext();});
  $('lean-editor').addEventListener('scroll',()=>{$('lean-line-numbers').scrollTop=$('lean-editor').scrollTop;});
  $('lean-target').addEventListener('input',()=>{if(doc){doc.target=$('lean-target').value;invalidate();}});
  $('lean-policy').addEventListener('change',()=>{if(doc){doc.policy=$('lean-policy').value;revision++;cancel();onResult(null);onStatus('unverified','공리 정책 변경','선택한 정책으로 다시 검사하세요.');onChange(current());}});
  $('lean-project').addEventListener('change',()=>{if(doc){doc.projectId=$('lean-project').value;const next=current();open(next);invalidate();}});
  $('lean-context-button').addEventListener('click',()=>{onReveal();readContext();});
  $('lean-cancel-button').addEventListener('click',cancel);
  return {open,current,setFileView(value){if(doc){doc.sourceFileView=structuredClone(value);onChange(current());}},setAnalysisCache(value){if(doc){doc.analysisCache=structuredClone(value);onChange(current());}},check,cancel,jump,readContext,contextSnapshot,cancelContext,close(){generation++;revision++;doc=null;clearTimeout(contextTimer);clearContext();contextCancel.hidden=true;return Promise.all([cancel(),closeSession()]);}};
}
