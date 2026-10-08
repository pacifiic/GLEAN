// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkImport, connect, deleteNode, nodeInputs, nodeHeight, portPosition, outputPortPosition,
  fitViewport, createGroup, toggleGroup, ungroup, moveGroup, visibleGraph, extractModule } from './model.mjs';

const node = (id, kind, x = 0, y = 0, ref) => ({ id, kind, x, y, ...(ref === undefined ? {} : { ref }) });
const edge = (id, source, target, input) => ({ id, source, target, input });
const composition = () => ({ version: 1, name: 'compose', propositions: ['P', 'Q', 'R'],
  assumptions: [{ id: 'p', type: 'P' }, { id: 'f', type: 'P → Q' }, { id: 'g', type: 'Q → R' }], goal: 'R',
  nodes: [node('p', 'assumption', 0, 100, 'p'), node('f', 'assumption', 0, 0, 'f'),
    node('g', 'assumption', 0, 200, 'g'), node('a', 'apply', 250, 0), node('b', 'apply', 500, 0), node('goal', 'goal', 750, 0)],
  edges: [edge('fp', 'f', 'a', 'fn'), edge('pa', 'p', 'a', 'arg'), edge('gb', 'g', 'b', 'fn'), edge('ab', 'a', 'b', 'arg'), edge('result', 'b', 'goal', 'proof')] });
const types = { p: 'P', f: 'P → Q', g: 'Q → R', a: 'Q', b: 'R', goal: 'R' };
const extract = graph => extractModule(graph, ['a', 'b'], types, { id: 'compose_fn', name: 'Compose', nodeId: 'call' });

test('module extraction preserves external wiring and makes every dependency explicit', () => {
  const graph = composition();
  const { definition, instance } = extract(graph);
  assert.equal(graph.version, 2);
  assert.equal(graph.modules[0], definition);
  assert.deepEqual(definition.inputs.map(input => input.type), ['P → Q', 'P', 'Q → R']);
  assert.equal(definition.outputType, 'R');
  assert.equal(instance.ref, definition.id);
  assert.equal(instance.kind, 'module');
  assert.deepEqual(graph.nodes.map(n => n.id), ['p', 'f', 'g', 'call', 'goal']);
  assert.equal(graph.edges.find(e => e.id === 'result').source, 'call');
  assert.equal(graph.edges.filter(e => e.target === 'call').length, 3);
  assert.equal(definition.nodes.filter(n => n.kind === 'assumption').length, 3);
  assert.equal(definition.nodes.filter(n => n.kind === 'goal').length, 1);
  assert.equal(definition.edges.find(e => e.id === 'ab').source, 'a');
  assert.equal(checkImport(graph), null);
  assert.equal(checkImport(JSON.parse(JSON.stringify(graph))), null);
});

test('one external source used more than once becomes one reusable formal input', () => {
  const graph = composition();
  graph.goal = 'P ∧ P';
  graph.nodes = [graph.nodes[0], node('pair', 'pair', 250, 0), graph.nodes.at(-1)];
  graph.edges = [edge('one', 'p', 'pair', 'left'), edge('two', 'p', 'pair', 'right'), edge('out', 'pair', 'goal', 'proof')];
  const { definition } = extractModule(graph, ['pair'], { p: 'P', pair: 'P ∧ P' }, { id: 'twice', name: 'Twice', nodeId: 'call' });
  assert.equal(definition.inputs.length, 1);
  assert.equal(graph.edges.filter(e => e.target === 'call').length, 1);
  const inputNode = definition.nodes.find(n => n.kind === 'assumption');
  assert.equal(definition.edges.filter(e => e.source === inputNode.id).length, 2);
});

test('module calls can be reused and wrapped in another nonrecursive definition', () => {
  const graph = composition();
  extract(graph);
  const { definition } = extractModule(graph, ['call'], { ...types, call: 'R' }, { id: 'wrapper', name: 'Wrapper', nodeId: 'outer' });
  assert.equal(definition.nodes.find(n => n.id === 'call').ref, 'compose_fn');
  assert.equal(graph.modules.length, 2);
  graph.nodes.push(node('again', 'module', 100, 400, 'compose_fn'));
  for (const input of graph.modules[0].inputs) connect(graph, input.type === 'P' ? 'p' : input.type === 'P → Q' ? 'f' : 'g', 'again', input.id, `again-${input.id}`);
  assert.equal(checkImport(graph), null);
  assert.equal(graph.nodes.filter(n => n.ref === 'compose_fn').length, 1);
});

test('module geometry fits sixteen explicit inputs and dynamic output ports', () => {
  const graph = composition();
  graph.modules = [{ id: 'many', inputs: Array.from({ length: 16 }, (_, i) => ({ id: `p${i}` })) }];
  const call = node('call', 'module', 100, 200, 'many');
  assert.equal(nodeInputs(call, graph).length, 16);
  for (const input of nodeInputs(call, graph)) {
    const point = portPosition(call, input, graph);
    assert.equal(point.x, 100);
    assert.ok(point.y > 208 && point.y < 200 + nodeHeight(call, graph) - 22);
  }
  assert.ok(nodeHeight(call, graph) > 400);
  const viewport = fitViewport([call], 800, 600, graph);
  assert.ok(Number.isFinite(viewport.zoom) && viewport.zoom > 0);
});

test('module connections enforce real signature names and retain wires on rejection', () => {
  const graph = composition();
  extract(graph);
  const before = JSON.stringify(graph.edges);
  assert.throws(() => connect(graph, 'p', 'call', 'not-a-formal', 'bad'));
  assert.equal(JSON.stringify(graph.edges), before);
  const formal = graph.modules[0].inputs[1].id;
  connect(graph, 'p', 'call', formal, 'new-wire');
  assert.equal(graph.edges.filter(e => e.target === 'call' && e.input === formal).length, 1);
});

test('visual groups preserve proof nodes and edges while collapsing losslessly', () => {
  const graph = composition();
  const originalNodes = JSON.stringify(graph.nodes), originalEdges = JSON.stringify(graph.edges);
  const group = createGroup(graph, ['a', 'b'], { id: 'box', name: 'Computation' });
  assert.equal(group.collapsed, true);
  assert.deepEqual(graph.modules, []);
  assert.equal(checkImport(graph), null);
  const projected = visibleGraph(graph);
  const capsule = projected.nodes.find(n => n.kind === 'group');
  assert.equal(capsule.ref, 'box');
  assert.deepEqual(capsule.memberIds, ['a', 'b']);
  assert.equal(capsule.inputPorts.length, 3);
  assert.equal(capsule.outputPorts.length, 1);
  assert.equal(projected.edges.length, 4);
  const incoming = projected.edges.find(e => e.id === 'fp');
  const port = capsule.inputPorts.find(p => p.id === incoming.input);
  assert.equal(incoming.originalTarget, 'a');
  assert.equal(port.nodeId, 'a');
  assert.equal(port.input, 'fn');
  const output = projected.edges.find(e => e.id === 'result');
  assert.equal(output.originalSource, 'b');
  assert.equal(capsule.outputPorts.find(p => p.id === output.sourcePort).nodeId, 'b');
  assert.equal(JSON.stringify(graph.nodes), originalNodes);
  assert.equal(JSON.stringify(graph.edges), originalEdges);
  toggleGroup(graph, 'box');
  assert.deepEqual(visibleGraph(graph), { nodes: graph.nodes, edges: graph.edges });
  assert.equal(ungroup(graph, 'box'), true);
  assert.equal(graph.groups.length, 0);
});

test('collapsed groups have distinct source sockets and route group-to-group edges', () => {
  const graph = composition();
  createGroup(graph, ['f', 'p'], { id: 'inputs', name: 'Inputs' });
  createGroup(graph, ['a', 'b'], { id: 'compute', name: 'Compute' });
  const projection = visibleGraph(graph);
  const inputs = projection.nodes.find(n => n.ref === 'inputs');
  assert.equal(inputs.outputPorts.length, 2);
  assert.notEqual(outputPortPosition(inputs, inputs.outputPorts[0].id).y, outputPortPosition(inputs, inputs.outputPorts[1].id).y);
  const wire = projection.edges.find(e => e.id === 'fp');
  assert.equal(wire.source, inputs.id);
  assert.equal(wire.target, projection.nodes.find(n => n.ref === 'compute').id);
  assert.equal(wire.originalSource, 'f');
  assert.equal(wire.originalTarget, 'a');
});

test('all boundary inputs stay available when unconnected and goals have no proxy output', () => {
  const graph = composition();
  graph.edges = [];
  createGroup(graph, ['a', 'goal'], { id: 'box', name: 'Box' });
  const capsule = visibleGraph(graph).nodes.find(n => n.kind === 'group');
  assert.equal(capsule.inputPorts.length, 3);
  assert.deepEqual(capsule.outputPorts.map(p => p.nodeId), ['a']);
});

test('grouping refuses overlaps, absent members and duplicate ids without changes', () => {
  const graph = composition();
  createGroup(graph, ['a'], { id: 'box', name: 'A' });
  for (const [members, id] of [[['a', 'b'], 'other'], [['missing'], 'other'], [['b'], 'box'], [[], 'other']]) {
    const before = JSON.stringify(graph);
    assert.throws(() => createGroup(graph, members, { id, name: 'Bad' }));
    assert.equal(JSON.stringify(graph), before);
  }
});

test('collapsed drag translates original members and rejects out-of-range motion atomically', () => {
  const graph = composition();
  createGroup(graph, ['a', 'b'], { id: 'box', name: 'Box' });
  moveGroup(graph, 'box', 25, -10);
  assert.equal(graph.nodes.find(n => n.id === 'a').x, 275);
  assert.equal(graph.nodes.find(n => n.id === 'b').y, -10);
  assert.equal(graph.groups[0].x, 275);
  const before = JSON.stringify(graph);
  assert.throws(() => moveGroup(graph, 'box', 1000001, 0));
  assert.equal(JSON.stringify(graph), before);
});

test('deleting grouped nodes prunes members and removes empty groups', () => {
  const graph = composition();
  createGroup(graph, ['a', 'b'], { id: 'box', name: 'Box' });
  deleteNode(graph, 'a');
  assert.deepEqual(graph.groups[0].nodeIds, ['b']);
  deleteNode(graph, 'b');
  assert.deepEqual(graph.groups, []);
});

test('extraction rejects unknown types, incomplete regions and multiple results atomically', () => {
  for (const [prepare, attempt] of [
    [() => {}, graph => extractModule(graph, ['p'], types, { id: 'bad', name: 'Bad', nodeId: 'call' })],
    [() => {}, graph => extractModule(graph, ['a', 'b'], {}, { id: 'bad', name: 'Bad', nodeId: 'call' })],
    [graph => { graph.edges = graph.edges.filter(e => e.id !== 'pa'); }, extract],
    [graph => { graph.nodes.push(node('extra', 'left', 800, 300)); graph.edges.push(edge('extra', 'a', 'extra', 'value')); }, extract],
  ]) {
    const graph = composition();
    prepare(graph);
    const before = JSON.stringify(graph);
    assert.throws(() => attempt(graph));
    assert.equal(JSON.stringify(graph), before);
  }
});

test('nonconvex extraction cannot introduce a cycle when a path leaves and reenters', () => {
  const graph = composition();
  graph.nodes.splice(-1, 0, node('middle', 'left', 400, 100));
  graph.edges = graph.edges.filter(e => e.id !== 'ab');
  graph.edges.push(edge('am', 'a', 'middle', 'value'), edge('mb', 'middle', 'b', 'arg'));
  const before = JSON.stringify(graph);
  assert.throws(() => extractModule(graph, ['a', 'b'], { ...types, middle: 'Q' }, { id: 'bad', name: 'Bad', nodeId: 'call' }));
  assert.equal(JSON.stringify(graph), before);
});

test('extraction keeps whole groups in the body and prunes partial groups without overlaps', () => {
  const graph = composition();
  createGroup(graph, ['a', 'b'], { id: 'box', name: 'Box' });
  const { definition } = extract(graph);
  assert.equal(graph.groups.length, 0);
  assert.deepEqual(definition.groups[0].nodeIds, ['a', 'b']);
  assert.equal(checkImport(graph), null);
});

test('new helper ids never collide with selected node or edge ids', () => {
  const graph = composition();
  graph.nodes.find(n => n.id === 'a').id = 'input_1';
  graph.edges.forEach(e => { if (e.source === 'a') e.source = 'input_1'; if (e.target === 'a') e.target = 'input_1'; });
  graph.edges[0].id = 'module_goal';
  const { definition } = extractModule(graph, ['input_1', 'b'], { ...types, input_1: 'Q' }, { id: 'fn', name: 'Fn', nodeId: 'call' });
  assert.equal(new Set(definition.nodes.map(n => n.id)).size, definition.nodes.length);
  assert.equal(new Set(definition.edges.map(e => e.id)).size, definition.edges.length);
  assert.equal(checkImport(graph), null);
});

test('v2 import validates every definition, captures, dependencies, signatures and groups', () => {
  const base = composition(); extract(base);
  const mutations = [
    g => delete g.modules,
    g => delete g.groups,
    g => g.modules = null,
    g => g.rootGraph = { nodes: [], modules: [] },
    g => g.moduleId = 'compose_fn',
    g => g.modules.push(structuredClone(g.modules[0])),
    g => g.modules[0].nodes.find(n => n.kind === 'assumption').ref = 'root-only',
    g => g.modules[0].nodes.find(n => n.id === 'a').kind = 'unknown',
    g => g.modules[0].inputs.push({ ...g.modules[0].inputs[0] }),
    g => g.modules[0].inputs.push(...Array.from({ length: 17 }, (_, i) => ({ id: `extra${i}`, name: 'x', type: 'P' }))),
    g => g.nodes.find(n => n.kind === 'module').ref = 'missing',
    g => g.modules[0].nodes.push(node('recursive', 'module', 0, 0, 'compose_fn')),
    g => g.groups = [{ id: 'broken', name: 'Broken', nodeIds: ['missing'], collapsed: true, x: 0, y: 0 }],
    g => g.modules[0].groups = [null],
    g => g.modules[0].edges[0].input = 'invalid',
    g => g.edges.push({ ...g.edges[0] }),
  ];
  for (const mutate of mutations) { const g = structuredClone(base); mutate(g); assert.equal(typeof checkImport(g), 'string'); }
});

test('import and extraction enforce global limits, not only each isolated body', () => {
  const graph = composition(); extract(graph);
  graph.nodes.push(...Array.from({ length: 250 }, (_, i) => node(`unused${i}`, 'pair', 0, 0)));
  assert.equal(typeof checkImport(graph), 'string');
  const full = composition();
  full.nodes.push(...Array.from({ length: 250 }, (_, i) => node(`unused${i}`, 'pair', 0, 0)));
  const before = JSON.stringify(full);
  assert.throws(() => extract(full));
  assert.equal(JSON.stringify(full), before);
});

test('hostile identifiers never mutate object prototypes or become inferred types', () => {
  const graph = composition();
  const { definition } = extractModule(graph, ['a', 'b'], types, { id: '__proto__', name: 'Constructor', nodeId: 'constructor' });
  assert.equal(definition.id, '__proto__');
  assert.equal(checkImport(graph), null);
  assert.equal({}.polluted, undefined);
  const bad = composition();
  bad.nodes.find(n => n.id === 'a').id = '__proto__';
  bad.edges.forEach(e => { if (e.source === 'a') e.source = '__proto__'; if (e.target === 'a') e.target = '__proto__'; });
  const snapshot = JSON.stringify(bad);
  assert.throws(() => extractModule(bad, ['__proto__', 'b'], types, { id: 'fn', name: 'Fn', nodeId: 'call' }));
  assert.equal(JSON.stringify(bad), snapshot);
});

test('body extraction commits a shared reusable definition and body atomically', () => {
  const graph = composition(); extract(graph);
  const definition = graph.modules[0];
  const scope = { version: 2, name: definition.name, propositions: graph.propositions,
    assumptions: definition.inputs, goal: definition.outputType, nodes: definition.nodes, edges: definition.edges,
    groups: definition.groups, modules: graph.modules, moduleId: definition.id, rootGraph: graph };
  const bodyTypes = { a: 'Q', b: 'R' };
  definition.nodes.filter(n => n.kind === 'assumption').forEach(n => { bodyTypes[n.id] = definition.inputs.find(p => p.id === n.ref).type; });
  const result = extractModule(scope, ['a', 'b'], bodyTypes, { id: 'nested', name: 'Nested', nodeId: 'nested-call' });
  assert.equal(graph.modules.length, 2);
  assert.equal(graph.modules.find(m => m.id === 'compose_fn').nodes.find(n => n.id === 'nested-call').ref, result.definition.id);
  assert.equal(checkImport(graph), null);
});

test('v2 import rejects mutual module recursion and missing fields even on unused definitions', () => {
  const graph = composition(); extract(graph);
  const another = structuredClone(graph.modules[0]);
  another.id = 'other';
  graph.modules.push(another);
  graph.modules[0].nodes.push(node('use-other', 'module', 0, 0, 'other'));
  another.nodes.push(node('use-first', 'module', 0, 0, 'compose_fn'));
  assert.equal(typeof checkImport(graph), 'string');
  graph.modules[0].nodes.pop();
  another.nodes.pop();
  assert.equal(checkImport(graph), null);
  another.inputs[0].name = '';
  assert.equal(typeof checkImport(graph), 'string');
});

test('visible group identifiers and sockets remain unambiguous for punctuation-containing ids', () => {
  const graph = composition();
  graph.nodes.push(node('group:box', 'pair', 100, 500));
  createGroup(graph, ['a', 'b'], { id: 'box', name: 'Box' });
  const view = visibleGraph(graph);
  assert.equal(new Set(view.nodes.map(n => n.id)).size, view.nodes.length);
  assert.equal(view.nodes.find(n => n.kind === 'group').id, 'group:box_2');
  assert.equal(checkImport(graph), null);
});

test('extracting into a full module library rejects atomically', () => {
  const graph = composition(); extract(graph);
  for (let index = 1; index < 32; index++) graph.modules.push({ ...structuredClone(graph.modules[0]), id: `copy${index}` });
  assert.equal(checkImport(graph), null);
  const before = JSON.stringify(graph);
  assert.throws(() => extractModule(graph, ['call'], { ...types, call: 'R' }, { id: 'one-too-many', name: 'Overflow', nodeId: 'new-call' }));
  assert.equal(JSON.stringify(graph), before);
});

test('seventeen distinct inputs reject extraction before modifying the graph', () => {
  const graph = composition();
  graph.assumptions = Array.from({ length: 17 }, (_, i) => ({ id: `p${i}`, type: 'P' }));
  graph.nodes = graph.assumptions.map((a, i) => node(a.id, 'assumption', 0, i * 70, a.id));
  graph.edges = [];
  const inferred = Object.fromEntries(graph.assumptions.map(a => [a.id, a.type]));
  const selected = [];
  for (let index = 1; index < 17; index++) {
    const id = `pair${index}`, previous = index === 1 ? 'p0' : `pair${index - 1}`;
    selected.push(id);
    graph.nodes.push(node(id, 'pair', index * 200, 0));
    graph.edges.push(edge(`${id}-left`, previous, id, 'left'), edge(`${id}-right`, `p${index}`, id, 'right'));
    inferred[id] = index === 1 ? 'P ∧ P' : `(${inferred[previous]}) ∧ P`;
  }
  graph.nodes.push(node('goal', 'goal', 3600, 0));
  graph.goal = inferred.pair16;
  graph.edges.push(edge('result', 'pair16', 'goal', 'proof'));
  assert.equal(checkImport(graph), null);
  const before = JSON.stringify(graph);
  assert.throws(() => extractModule(graph, selected, inferred, { id: 'many', name: 'Many', nodeId: 'call' }));
  assert.equal(JSON.stringify(graph), before);
});
