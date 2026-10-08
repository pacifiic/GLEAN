// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentHistory, semanticKey, sharedSnapshot } from './history.mjs';

const graph = () => ({ version: 1, name: 'identity', propositions: ['P'], assumptions: [{ id: 'hp', type: 'P' }], goal: 'P', nodes: [{ id: 'hp', kind: 'assumption', ref: 'hp', x: 0, y: 0 }, { id: 'goal', kind: 'goal', x: 300, y: 0 }], edges: [{ id: 'e1', source: 'hp', target: 'goal', input: 'proof' }] });

test('undo and redo restore independent graph and module snapshots', () => {
  const history = new DocumentHistory();
  const first = graph();
  history.reset(first);
  first.nodes[0].x = 15;
  history.commit(first);
  first.nodes[0].x = 999;
  assert.equal(history.current().nodes[0].x, 15);
  const undone = history.undo();
  assert.equal(undone.nodes[0].x, 0);
  undone.nodes[0].x = -999;
  assert.equal(history.redo().nodes[0].x, 15);
  assert.equal(history.undo().nodes[0].x, 0);
});

test('history boundaries and a no-op commit do not discard redo', () => {
  const history = new DocumentHistory();
  assert.equal(history.current(), null);
  assert.equal(history.undo(), null);
  assert.equal(history.redo(), null);
  history.reset(graph());
  assert.equal(history.canUndo, false);
  const edited = graph(); edited.goal = 'P ∧ P';
  assert.equal(history.commit(edited), true);
  assert.equal(history.canUndo, true);
  assert.equal(history.canRedo, false);
  history.undo();
  assert.equal(history.commit(graph()), false);
  assert.equal(history.canRedo, true);
  assert.equal(history.redo().goal, 'P ∧ P');
  assert.equal(history.redo(), null);
});

test('editing after undo discards only the abandoned future and reset starts a new document', () => {
  const history = new DocumentHistory();
  history.reset(graph());
  const second = graph(); second.goal = 'P ∧ P'; history.commit(second);
  history.undo();
  const replacement = graph(); replacement.goal = 'P → P'; history.commit(replacement);
  assert.equal(history.canRedo, false);
  assert.equal(history.undo().goal, 'P');
  history.reset({ kind: 'lean', source: 'example : True := by trivial' });
  assert.equal(history.canRedo, false);
  assert.equal(history.canUndo, false);
});

test('history keeps a bounded number of snapshots and rejected clones are atomic', () => {
  const history = new DocumentHistory({ limit: 3 });
  for (let i = 0; i < 6; i++) history.commit({ kind: 'lean', source: String(i) });
  assert.equal(history.undo().source, '4');
  assert.equal(history.undo().source, '3');
  assert.equal(history.undo(), null);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => history.commit(cyclic));
  assert.equal(history.current().source, '3');
  assert.equal(history.canRedo, true);
  assert.throws(() => new DocumentHistory({ limit: 0 }), RangeError);
  assert.throws(() => history.reset(undefined));
  assert.equal(history.current().source, '3');
});

test('semantic keys survive layout, grouping, and v1 to v2 presentation migration', () => {
  const original = graph();
  const edited = structuredClone(original);
  edited.version = 2;
  edited.modules = [];
  edited.nodes[0].x = 750;
  edited.nodes[0].y = -450;
  edited.groups = [{ id: 'group', name: 'Display', nodeIds: ['hp'], collapsed: true, x: 750, y: -450 }];
  assert.equal(semanticKey(original), semanticKey(edited));
  assert.equal(semanticKey({ kind: 'graph', graph: original }), semanticKey({ graph: edited, kind: 'graph' }));
  assert.equal(original.version, 1);
  assert.equal(original.nodes[0].x, 0);
});

test('module body layout is ignored while its definitions and wiring remain semantic', () => {
  const document = { ...graph(), version: 2, groups: [], modules: [{ id: 'identity', name: 'Identity', inputs: [{ id: 'p', name: 'p', type: 'P' }], outputType: 'P', nodes: graph().nodes, edges: graph().edges, groups: [] }] };
  const moved = structuredClone(document);
  moved.modules[0].nodes[0].x = 1000;
  moved.modules[0].groups.push({ id: 'nested', name: 'Body', nodeIds: ['hp'], collapsed: false, x: 0, y: 0 });
  assert.equal(semanticKey(document), semanticKey(moved));
  moved.modules[0].edges[0].source = 'another';
  assert.notEqual(semanticKey(document), semanticKey(moved));
  for (const edit of [g => g.goal = 'P ∧ P', g => g.assumptions[0].type = 'P → P', g => g.modules[0].outputType = 'P ∧ P', g => g.modules[0].inputs[0].type = 'P ∧ P']) {
    const changed = structuredClone(document); edit(changed);
    assert.notEqual(semanticKey(document), semanticKey(changed));
  }
});

test('semantic keys treat Lean source and project identity as verification inputs', () => {
  const lean = { kind: 'lean', source: 'example : True := by trivial', projectId: 'mathlib' };
  assert.notEqual(semanticKey(lean), semanticKey({ ...lean, source: 'example : False := by trivial' }));
  assert.notEqual(semanticKey(lean), semanticKey({ ...lean, projectId: 'local' }));
  assert.equal(semanticKey(lean), semanticKey({ projectId: 'mathlib', source: lean.source, kind: 'lean' }));
});

test('incomplete context forms remain recoverable and invalidate a verified graph key', () => {
  const history = new DocumentHistory();
  const initial = { kind: 'graph', graph: graph(), form: { name: 'identity', propositions: 'P', goal: 'P', assumptions: [{ id: 'hp', type: 'P', originalId: 'hp' }] } };
  history.reset(initial);
  const pending = structuredClone(initial);
  pending.form.goal = 'P →';
  history.commit(pending);
  assert.notEqual(semanticKey(initial), semanticKey(pending));
  assert.equal(history.current().form.goal, 'P →');
  assert.equal(history.undo().form.goal, 'P');
  assert.equal(history.redo().graph.goal, 'P');
});
test('case-branch positions are presentation while branch proof bodies remain semantic',()=>{const document={kind:'graph',graph:{version:3,nodes:[{id:'case',kind:'cases',branches:[{id:'left',binders:[],nodes:[{id:'proof',kind:'script',x:2,y:3,body:'by trivial'}],edges:[],result:{node:'proof',output:'out'}}]}],edges:[],modules:[]}},moved=structuredClone(document);moved.graph.nodes[0].branches[0].nodes[0].x=99;assert.equal(semanticKey(document),semanticKey(moved));moved.graph.nodes[0].branches[0].nodes[0].body='by sorry';assert.notEqual(semanticKey(document),semanticKey(moved));});

test('position-only history snapshots share a long body and unchanged module definitions',()=>{const body='by\n'+'  have h : True := True.intro\n'.repeat(35000)+'  exact True.intro',doc={kind:'graph',graph:{nodes:[{id:'call',x:0,y:0}],modules:[{id:'M',body}]}};const first=sharedSnapshot(doc),next=sharedSnapshot({...doc,graph:{...doc.graph,nodes:[{id:'call',x:4,y:0}]}},first);assert.equal(next.graph.modules,first.graph.modules);assert.equal(next.graph.modules[0].body,body);assert.notEqual(next.graph.nodes,first.graph.nodes);assert.equal(first.graph.nodes[0].x,0);assert.equal(sharedSnapshot({...doc,graph:{modules:doc.graph.modules,nodes:doc.graph.nodes}},first),first);});
