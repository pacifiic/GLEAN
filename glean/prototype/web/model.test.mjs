// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PORTS, WIDTH, nodeHeight, portPosition, checkImport, connect, deleteNode, RevisionGate, fitViewport, resizeViewport } from './model.mjs';

const graph = () => ({ version: 1, name: 'example', propositions: ['P'], assumptions: [{ id: 'hp', type: 'P' }], goal: 'P', nodes: [{ id: 'hp', kind: 'assumption', ref: 'hp', x: 0, y: 0 }, { id: 'apply', kind: 'apply', x: 300, y: 0 }, { id: 'goal', kind: 'goal', x: 600, y: 0 }], edges: [] });

test('imports fail safely before the editor replaces a working graph', () => {
  for (const value of [null, [], {}, { ...graph(), nodes: [null] }, { ...graph(), edges: [null] }, { ...graph(), propositions: ['<script>'] }, { ...graph(), nodes: [...graph().nodes, { id: 'goal', kind: 'pair' }] }]) {
    assert.equal(typeof checkImport(value), 'string');
  }
  assert.equal(checkImport(graph()), null);
});

test('editor exports round-trip long supported types and layout bounds', () => {
  const g = graph();
  g.assumptions[0].type = 'P → '.repeat(51) + 'P';
  g.goal = g.assumptions[0].type;
  g.nodes[0].x = 1000000;
  g.nodes[0].y = -1000000;
  assert.equal(checkImport(JSON.parse(JSON.stringify(g))), null);
  g.assumptions[0].type = 'P'.repeat(513);
  assert.equal(typeof checkImport(g), 'string');
});

test('each input has one incoming connection; replacement is explicit', () => {
  const g = graph();
  connect(g, 'hp', 'apply', 'arg', 'e1');
  connect(g, 'hp', 'apply', 'arg', 'e2');
  assert.deepEqual(g.edges, [{ id: 'e2', source: 'hp', target: 'apply', input: 'arg' }]);
  assert.throws(() => connect(g, 'apply', 'apply', 'fn', 'e3'));
  assert.throws(() => connect(g, 'goal', 'apply', 'fn', 'e4'));
  assert.throws(() => connect(g, 'hp', 'apply', 'missing', 'e5'));
});

test('cycles are rejected and existing wires survive a rejected edit', () => {
  const g = graph();
  g.nodes.push({ id: 'b', kind: 'pair', x: 400, y: 300 });
  connect(g, 'apply', 'b', 'left', 'e1');
  assert.throws(() => connect(g, 'b', 'apply', 'fn', 'e2'));
  assert.equal(g.edges.length, 1);
});

test('deleting a node removes incident wires while retaining the sole goal', () => {
  const g = graph();
  connect(g, 'hp', 'goal', 'proof', 'e1');
  assert.equal(deleteNode(g, 'goal'), false);
  assert.equal(deleteNode(g, 'hp'), true);
  assert.equal(g.edges.length, 0);
  assert.equal(g.nodes.length, 2);
});

test('in-flight results cannot verify a newer graph, including a same-graph reload', () => {
  const gate = new RevisionGate();
  const first = gate.current();
  gate.bump();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isCurrent(gate.current()), true);
  gate.bump();
  assert.equal(gate.isCurrent(first), false);
});

test('fit includes all nodes and handles zero-size viewport without NaN', () => {
  for (const size of [[800, 500], [0, 0]]) {
    const view = fitViewport(graph().nodes, ...size);
    assert.ok(Number.isFinite(view.x) && Number.isFinite(view.y));
    assert.ok(view.zoom > 0 && view.zoom <= 1.1);
  }
});

test('compact capsule geometry leaves distinct rows for two input components', () => {
  assert.equal(WIDTH, 160);
  assert.equal(nodeHeight({ kind: 'assumption' }), 54);
  for (const kind of ['left', 'right', 'goal']) assert.equal(nodeHeight({ kind }), 74);
  for (const kind of ['apply', 'pair']) assert.equal(nodeHeight({ kind }), 90);
});

test('wire endpoints sit exactly on the capsule sides and input row centers', () => {
  const node = { kind: 'apply', x: 120, y: 80 };
  assert.deepEqual(portPosition(node, 'fn'), { x: 120, y: 102 });
  assert.deepEqual(portPosition(node, 'arg'), { x: 120, y: 126 });
  assert.deepEqual(portPosition(node), { x: 280, y: 114 });
  assert.deepEqual(portPosition({ kind: 'assumption', x: -40, y: -10 }), { x: 120, y: 17 });
  assert.deepEqual(portPosition({ kind: 'goal', x: 600, y: 10 }, 'proof'), { x: 600, y: 36 });
});

test('all supported capsule inputs stay within the body above the type strip', () => {
  for (const [kind, inputs] of Object.entries(PORTS)) {
    const node = { kind, x: -300, y: 210 };
    for (const input of inputs) {
      const point = portPosition(node, input);
      assert.equal(point.x, node.x);
      assert.ok(point.y > node.y + 8);
      assert.ok(point.y < node.y + nodeHeight(node) - 22);
    }
  }
  assert.throws(() => portPosition({ kind: 'apply', x: 0, y: 0 }, 'missing'), RangeError);
});

test('resizing dock areas preserves the graph center and zoom without mutating the view', () => {
  const original = { x: -110, y: 60, zoom: .75 };
  const before = { width: 740, height: 400 };
  const after = { width: 1200, height: 760 };
  const resized = resizeViewport(original, before, after);
  assert.equal((before.width / 2 - original.x) / original.zoom, (after.width / 2 - resized.x) / resized.zoom);
  assert.equal((before.height / 2 - original.y) / original.zoom, (after.height / 2 - resized.y) / resized.zoom);
  assert.equal(resized.zoom, original.zoom);
  assert.deepEqual(original, { x: -110, y: 60, zoom: .75 });
  assert.deepEqual(resizeViewport(resized, after, before), original);
});

test('initial or temporarily hidden canvas dimensions do not displace the graph', () => {
  const original = { x: 10, y: 20, zoom: 1 };
  assert.deepEqual(resizeViewport(original, { width: 0, height: 0 }, { width: 900, height: 600 }), original);
  assert.deepEqual(resizeViewport(original, { width: 900, height: 600 }, { width: 0, height: 0 }), original);
});
