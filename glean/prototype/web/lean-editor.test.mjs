// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initLeanEditor} from './lean-editor.mjs';

const deferred = () => {let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick = () => new Promise(resolve=>setImmediate(resolve));
const source = (name='first') => ({kind:'lean',filename:name+'.lean',projectId:'glean',target:name,source:`theorem ${name} : True := by\n  trivial\n`});
class Element {
  constructor(){this.value='';this.textContent='';this.selectionStart=0;this.scrollTop=0;this.children=[];this.listeners={};}
  addEventListener(type,fn){this.listeners[type]=fn;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  setSelectionRange(start){this.selectionStart=start;}
  focus(){}
  setAttribute(name,value){this[name]=value;}
  dispatch(type){this.listeners[type]?.();}
}
function harness(t, route=()=>undefined, initialSession=null) {
  const elements=new Map(), storage=new Map(initialSession?[['glean.lean-session.v1',initialSession]]:[]), calls=[], results=[], statuses=[], diagnostics=[], contexts=[];
  const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  globalThis.document={getElementById:get,createElement:()=>new Element()};
  globalThis.window={addEventListener(){},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
  let count=0;
  globalThis.fetch=async(url,options={})=>{
    const path=url.replace('/api/lean/',''), body=options.body?JSON.parse(options.body):undefined;
    calls.push({path,body});
    let value=await route(path,body,calls);
    if(value===undefined){
      if(path==='projects')value={projects:[{id:'glean',name:'GLEAN',available:true}]};
      else if(path==='open')value={sessionId:'session-'+(++count),version:1,declarations:[]};
      else if(path==='update')value={sessionId:body.sessionId,version:body.version+1,declarations:[]};
      else if(path==='context')value={version:body.version,goals:['h : True\n⊢ True'],renderedGoals:'h : True\n⊢ True',diagnostics:[]};
      else if(path==='check/start')value={jobId:'job-1',status:'queued'};
      else if(path==='check/poll')value={jobId:body.jobId,status:'valid',verified:true,diagnostics:[]};
      else value={closed:true};
    }
    return {ok:!value.error,json:async()=>value};
  };
  get('lean-policy').value='standard';
  const editor=initLeanEditor({onChange(){},onResult:value=>results.push(value),onStatus:(...value)=>statuses.push(value),onDiagnostics:value=>diagnostics.push(value),onContext:value=>contexts.push(value),onReveal(){}});
  t.after(async()=>{await editor.close();await tick();});
  return {editor,get,calls,results,statuses,storage,diagnostics,contexts};
}

test('reload closes this tab’s remembered session before opening another',async t=>{
  const closing=deferred();
  const h=harness(t,(path,body)=>path==='close'&&body.sessionId==='abandoned'?closing.promise:undefined,'abandoned');
  const opening=h.editor.open(source());await tick();
  assert.equal(h.calls.filter(c=>c.path==='open').length,0);
  assert.ok(h.calls.some(c=>c.path==='close'&&c.body.sessionId==='abandoned'));
  closing.resolve({closed:true});await opening;
  assert.equal(h.storage.get('glean.lean-session.v1'),'session-1');
});

test('expired context session is reopened once and actual goal/hover text is shown',async t=>{
  let attempt=0;
  const h=harness(t,path=>path==='context'?(++attempt===1?{error:'expired',code:'not_found'}:{version:1,goals:['z : Int\n⊢ False'],renderedGoals:'z : Int\n⊢ False',hoverText:'z : Int',termGoalText:'False',diagnostics:[]}):undefined);
  await h.editor.open(source());await h.editor.readContext();
  assert.equal(h.calls.filter(c=>c.path==='open').length,2);
  assert.equal(h.get('lean-goal-summary').textContent,'⊢ False');
  assert.equal(h.get('lean-goal-summary').hidden,false);
  assert.equal(h.get('lean-hover').textContent,'z : Int');
});

test('expired session during source update reopens the latest source',async t=>{
  const h=harness(t,path=>path==='update'?{error:'expired',code:'not_found'}:undefined);
  await h.editor.open(source());h.get('lean-editor').value=source('changed').source;h.get('lean-editor').dispatch('input');
  await h.editor.readContext();
  assert.equal(h.calls.filter(c=>c.path==='open').at(-1).body.source,source('changed').source);
  assert.match(h.get('lean-session-status').textContent,/동기화됨/);
});

test('failed old open cannot block a newer document session',async t=>{
  const first=deferred();let openings=0;
  const h=harness(t,path=>path==='open'&&++openings===1?first.promise:undefined);
  const old=h.editor.open(source('old'));await tick();
  const current=h.editor.open(source('new'));first.reject(new Error('old request failed'));
  await Promise.all([old,current]);
  assert.equal(h.calls.filter(c=>c.path==='open').at(-1).body.filename,'new.lean');
  assert.match(h.get('lean-session-status').textContent,/연결됨/);
});

test('replacement open waits for the previous session close',async t=>{
  const closing=deferred();let closeCount=0;
  const h=harness(t,path=>path==='close'&&++closeCount===1?closing.promise:undefined);
  await h.editor.open(source('old'));const opening=h.editor.open(source('new'));await tick();
  assert.equal(h.calls.filter(c=>c.path==='open').length,1);
  closing.resolve({closed:true});await opening;
  assert.equal(h.calls.filter(c=>c.path==='open').length,2);
});

test('check waiting on cancellation does not check a replacement document',async t=>{
  const cancelling=deferred(), polling=deferred();
  const h=harness(t,path=>path==='check/cancel'?cancelling.promise:path==='check/poll'?polling.promise:undefined);
  await h.editor.open(source('old'));await h.editor.check();await tick();
  const waiting=h.editor.check();await tick();
  await h.editor.open(source('new'));cancelling.resolve({cancelled:true});await waiting;
  assert.equal(h.calls.filter(c=>c.path==='check/start').length,1);
  polling.resolve({status:'cancelled'});await tick();
});

test('late project failure cannot overwrite the current project status',async t=>{
  const first=deferred();let requests=0;
  const h=harness(t,path=>path==='projects'&&++requests===1?first.promise:undefined);
  await h.editor.open(source('old'));await h.editor.open(source('new'));await tick();
  first.reject(new Error('old project failure'));await tick();
  assert.doesNotMatch(h.get('lean-project-status').textContent,/old project/);
});

test('policy is restored and changes persist in the document',async t=>{
  const h=harness(t);await h.editor.open({...source(),policy:'strict'});
  assert.equal(h.get('lean-policy').value,'strict');
  h.get('lean-policy').value='standard';h.get('lean-policy').dispatch('change');
  assert.equal(h.editor.current().policy,'standard');
  assert.equal(h.results.at(-1),null);
});

test('opening a replacement clears old diagnostics and cursor context immediately',async t=>{
  const h=harness(t,path=>path==='context'?{version:1,diagnostics:[{message:'old error'}]}:undefined);
  await h.editor.open(source());await h.editor.readContext();
  assert.equal(h.diagnostics.at(-1)[0].message,'old error');
  await h.editor.open(source('fixed'));
  assert.deepEqual(h.diagnostics.at(-1),[]);
  assert.equal(h.get('lean-context-position').textContent,'');
});

test('cancel during pending start visibly cancels and discards the late job',async t=>{
  const starting=deferred();
  const h=harness(t,path=>path==='check/start'?starting.promise:undefined);
  await h.editor.open(source());const checking=h.editor.check();await tick();
  await h.editor.cancel();
  assert.equal(h.statuses.at(-1)[0],'unverified');
  starting.resolve({jobId:'late-job',status:'queued'});await checking;await tick();
  assert.ok(h.calls.some(c=>c.path==='check/cancel'&&c.body.jobId==='late-job'));
  assert.equal(h.calls.filter(c=>c.path==='check/poll').length,0);
});

test('declaration navigation does not change the explicitly chosen theorem',async t=>{
  const h=harness(t,path=>path==='open'?{sessionId:'s',version:1,declarations:[{name:'private_helper',kind:'lemma',range:{start:{line:1,character:0}}}]}:undefined);
  await h.editor.open(source('public_target'));
  h.get('lean-declarations').children[0].dispatch('click');await tick();
  assert.equal(h.editor.current().target,'public_target');
  assert.equal(h.get('lean-cursor').textContent,'Ln 2, Col 1');
});

test('actual structured goal tree exposes two scoped branches and detached context snapshots',async t=>{
  const h=harness(t,(path,body)=>path==='context'?{sessionId:body.sessionId,version:1,position:{line:1,character:2},structuredGoals:[
    {mvarId:'left',name:'positive',type:'P',hypotheses:[{fvarId:'h1',name:'h',type:'P'}]},
    {mvarId:'right',name:'negative',type:'P',hypotheses:[{fvarId:'h2',name:'h',type:'¬P'}]}
  ],goals:['h : P\n⊢ P','h : ¬P\n⊢ P'],diagnostics:[]}:undefined);
  await h.editor.open(source());await h.editor.readContext();
  const snapshot=h.editor.contextSnapshot();
  assert.equal(snapshot.structuredGoals.length,2);
  assert.equal(snapshot.position.line,1);
  snapshot.structuredGoals[0].type='corrupted';
  assert.equal(h.editor.contextSnapshot().structuredGoals[0].type,'P');
  const tree=h.get('lean-context-view').children.find(e=>e.id==='lean-goal-tree');
  assert.ok(tree);
  assert.match(tree.children[0].textContent,/2/);
  const rows=tree.children[1].children;
  assert.equal(rows.length,2);
  assert.match(rows[1].children[0].children[1].children[0].textContent,/¬P/);
  assert.equal(h.contexts.at(-1).structuredGoals[1].hypotheses[0].fvarId,'h2');
  h.get('lean-editor').value=source('changed').source;h.get('lean-editor').dispatch('input');
  assert.equal(h.editor.contextSnapshot(),null);
  assert.equal(tree.children.length,0);
});

test('context cancellation closes active computation and discards late goal IDs',async t=>{
  const pending=deferred();const h=harness(t,path=>path==='context'?pending.promise:undefined);
  await h.editor.open(source());const reading=h.editor.readContext();await tick();
  await h.editor.cancelContext();
  assert.equal(h.editor.contextSnapshot(),null);
  assert.ok(h.calls.some(call=>call.path==='close'&&call.body.sessionId==='session-1'));
  pending.resolve({version:1,structuredGoals:[{mvarId:'late',type:'False',hypotheses:[]}],goals:['⊢ False']});
  await reading;
  assert.equal(h.editor.contextSnapshot(),null);
  assert.match(h.get('lean-goals').textContent,/중단/);
});

test('context cancellation during initial open closes the late session and can reopen',async t=>{
  const pending=deferred();let opens=0;
  const h=harness(t,path=>path==='open'&&++opens===1?pending.promise:undefined);
  const opening=h.editor.open(source());await tick();
  const reading=h.editor.readContext();await tick();
  await h.editor.cancelContext();
  pending.resolve({sessionId:'late-session',version:1,declarations:[]});
  await Promise.all([opening,reading]);await tick();
  assert.ok(h.calls.some(call=>call.path==='close'&&call.body.sessionId==='late-session'));
  assert.equal(h.storage.get('glean.lean-session.v1'),undefined);
  assert.match(h.get('lean-session-status').textContent,/중단/);
  await h.editor.readContext();
  assert.equal(h.calls.filter(call=>call.path==='open').length,2);
  assert.match(h.get('lean-session-status').textContent,/동기화됨/);
});

test('partial diagnostics keep cancellation available while later source elaborates',async t=>{
  const h=harness(t,path=>path==='context'?{version:1,goals:['⊢ True'],structuredGoals:[],diagnostics:[],diagnosticsComplete:false}:undefined);
  await h.editor.open(source());await h.editor.readContext();
  const button=h.get('lean-context-view').children.find(el=>el.textContent==='문맥 조회 중단');
  assert.equal(button.hidden,false);
  assert.match(h.get('lean-session-status').textContent,/뒤쪽 소스 정교화 중/);
  await h.editor.cancelContext();
  assert.equal(button.hidden,true);
  assert.ok(h.calls.some(call=>call.path==='close'));
});
