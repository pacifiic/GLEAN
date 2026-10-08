// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
export const PORTS = { assumption: [], apply: ['fn', 'arg'], pair: ['left', 'right'], left: ['value'], right: ['value'], goal: ['proof'] };
export const WIDTH = 160;
const MAX_NODES = 256, MAX_EDGES = 512, MAX_MODULES = 32, MAX_INPUTS = 16;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit = 128) => typeof value === 'string' && value.length > 0 && value.length <= limit;
const coordinate = value => Number.isFinite(value) && Math.abs(value) <= 1000000;

export function nodeInputs(node, graph) {
  if (node.kind === 'module') return graph?.modules?.find(m => m.id === node.ref)?.inputs.map(input => input.id) ?? [];
  if (node.kind === 'group') return node.inputPorts.map(input => input.id);
  return Object.hasOwn(PORTS, node.kind) ? PORTS[node.kind] : [];
}

export function nodeHeight(node, graph) {
  if (node.kind === 'assumption') return 54;
  const count = Math.max(nodeInputs(node, graph).length, node.kind === 'group' ? node.outputPorts.length : 1);
  return Math.max(74, 66 + Math.max(0, count - 1) * 24);
}

export function portPosition(node, input = null, graph) {
  const inputs = nodeInputs(node, graph);
  const center = node.kind === 'assumption' ? nodeHeight(node, graph) / 2 : (nodeHeight(node, graph) - 22) / 2;
  if (input === null || node.kind === 'group' && node.outputPorts.some(port => port.id === input)) return outputPortPosition(node, input, graph);
  const index = inputs.indexOf(input);
  if (index < 0) throw new RangeError('Unknown capsule input: ' + input);
  return { x: node.x, y: node.y + center + (index - (inputs.length - 1) / 2) * 24 };
}

export function outputPortPosition(node, port = null, graph) {
  const center = node.kind === 'assumption' ? nodeHeight(node, graph) / 2 : (nodeHeight(node, graph) - 22) / 2;
  let offset = 0;
  if (node.kind === 'group' && node.outputPorts.length) {
    const index = port === null ? 0 : node.outputPorts.findIndex(p => p.id === port);
    if (index < 0) throw new RangeError('Unknown capsule output: ' + port);
    offset = (index - (node.outputPorts.length - 1) / 2) * 24;
  } else if (port !== null) throw new RangeError('Unknown capsule output: ' + port);
  return { x: node.x + WIDTH, y: node.y + center + offset };
}

function hasCycle(nodes, edges) {
  const outgoing = new Map(nodes.map(n => [n.id, []]));
  for (const edge of edges) outgoing.get(edge.source)?.push(edge.target);
  const visited = new Set(), visiting = new Set();
  const visit = id => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if ((outgoing.get(id) ?? []).some(visit)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return nodes.some(n => visit(n.id));
}

function checkGroups(groups, nodes) {
  if (groups === undefined) return null;
  if (!Array.isArray(groups) || groups.length > MAX_NODES) return '그룹 목록의 형식이 올바르지 않습니다.';
  const ids = new Set(), members = new Set(), nodeIds = new Set(nodes.map(n => n.id));
  for (const group of groups) {
    if (!record(group) || !text(group.id) || ids.has(group.id) || !text(group.name)
      || typeof group.collapsed !== 'boolean' || !coordinate(group.x) || !coordinate(group.y)
      || !Array.isArray(group.nodeIds) || !group.nodeIds.length || group.nodeIds.length > MAX_NODES) return '그룹 이름, 위치와 구성 요소를 확인해 주세요.';
    ids.add(group.id);
    for (const id of group.nodeIds) {
      if (!nodeIds.has(id) || members.has(id)) return '그룹 구성 요소가 없거나 여러 그룹에 중복되어 있습니다.';
      members.add(id);
    }
  }
  return null;
}

function checkScope(scope, assumptions, library, allowModules) {
  if (!Array.isArray(scope.nodes) || scope.nodes.length > MAX_NODES || !scope.nodes.every(n => record(n)
    && text(n.id) && (Object.hasOwn(PORTS, n.kind) || allowModules && n.kind === 'module')
    && coordinate(n.x) && coordinate(n.y))) return '노드 형식이나 위치가 올바르지 않습니다 (총 최대 256개).';
  const byId = new Map(scope.nodes.map(n => [n.id, n]));
  if (byId.size !== scope.nodes.length || scope.nodes.filter(n => n.kind === 'goal').length !== 1) return '노드 이름은 중복될 수 없으며 목표 노드는 하나여야 합니다.';
  const assumptionsById = new Set(assumptions.map(a => a.id));
  for (const node of scope.nodes) {
    if (node.kind === 'assumption' && (!text(node.ref) || !assumptionsById.has(node.ref))) return '가정 노드는 현재 문맥에 선언된 입력만 참조할 수 있습니다.';
    if (node.kind === 'module' && (!text(node.ref) || !library.some(m => m.id === node.ref))) return '함수 모듈 정의를 찾을 수 없습니다.';
  }
  if (!Array.isArray(scope.edges) || scope.edges.length > MAX_EDGES) return '연결 목록의 형식이 올바르지 않습니다 (총 최대 512개).';
  const edgeIds = new Set(), connected = new Set();
  for (const edge of scope.edges) {
    if (!record(edge) || !text(edge.id) || edgeIds.has(edge.id) || !byId.has(edge.source) || !byId.has(edge.target)
      || byId.get(edge.source).kind === 'goal' || !nodeInputs(byId.get(edge.target), { modules: library }).includes(edge.input)) return '연결 목록의 형식이나 대상 포트가 올바르지 않습니다.';
    const inputKey = JSON.stringify([edge.target, edge.input]);
    if (connected.has(inputKey)) return '하나의 입력에는 하나의 연결만 사용할 수 있습니다.';
    edgeIds.add(edge.id);
    connected.add(inputKey);
  }
  if (hasCycle(scope.nodes, scope.edges)) return '순환하는 연결은 사용할 수 없습니다.';
  return checkGroups(scope.groups, scope.nodes);
}

export function checkImport(g) {
  if (!record(g) || ![1, 2].includes(g.version)) return 'GLEAN 버전 1 또는 2 그래프 파일을 선택해 주세요.';
  if (Object.hasOwn(g, 'rootGraph') || Object.hasOwn(g, 'moduleId')) return '편집 중인 함수 문맥 대신 전체 그래프 파일을 선택해 주세요.';
  if (!text(g.name) || !text(g.goal, 512)) return '정리 이름과 목표가 필요합니다.';
  if (!Array.isArray(g.propositions) || g.propositions.length > 64 || new Set(g.propositions).size !== g.propositions.length || !g.propositions.every(p => text(p, 64) && /^[A-Z][A-Z0-9_]*$/.test(p))) return '명제 이름에는 P, Q처럼 대문자로 시작하는 이름을 사용하세요.';
  if (!Array.isArray(g.assumptions) || g.assumptions.length > 256 || !g.assumptions.every(a => record(a) && text(a.id) && text(a.type, 512)) || new Set(g.assumptions.map(a => a.id)).size !== g.assumptions.length) return '가정 목록의 형식을 확인해 주세요.';
  if (g.version === 2 && (!Array.isArray(g.modules) || !Array.isArray(g.groups))) return '버전 2 문서는 함수와 그룹 목록이 필요합니다.';
  const modules = g.modules ?? [];
  if (!Array.isArray(modules) || modules.length > MAX_MODULES || g.version === 1 && (modules.length || g.groups?.length)) return '함수와 그룹은 버전 2 형식이며 함수는 최대 32개입니다.';
  const moduleIds = new Set();
  for (const definition of modules) {
    if (!record(definition) || !text(definition.id) || moduleIds.has(definition.id) || !text(definition.name)
      || !text(definition.outputType, 512) || !Array.isArray(definition.inputs) || definition.inputs.length > MAX_INPUTS
      || !definition.inputs.every(input => record(input) && text(input.id) && text(input.name) && text(input.type, 512))
      || new Set(definition.inputs.map(input => input.id)).size !== definition.inputs.length) return '함수 정의, 이름, 입력 형식을 확인해 주세요 (입력 최대 16개).';
    moduleIds.add(definition.id);
  }
  const rootError = checkScope(g, g.assumptions, modules, g.version === 2);
  if (rootError) return rootError;
  let totalNodes = g.nodes.length, totalEdges = g.edges.length;
  for (const definition of modules) {
    const error = checkScope(definition, definition.inputs, modules, true);
    if (error) return `${definition.name}: ${error}`;
    totalNodes += definition.nodes.length;
    totalEdges += definition.edges.length;
  }
  if (totalNodes > MAX_NODES || totalEdges > MAX_EDGES) return '전체 문서는 노드 256개, 연결 512개 이하여야 합니다.';
  const dependencies = modules.flatMap(m => m.nodes.filter(n => n.kind === 'module').map(n => ({ source: m.id, target: n.ref })));
  if (hasCycle(modules, dependencies)) return '함수 모듈은 자신이나 서로를 순환 참조할 수 없습니다.';
  return null;
}

export function connect(graph, source, target, input, id) {
  const from = graph.nodes.find(n => n.id === source);
  const to = graph.nodes.find(n => n.id === target);
  if (!from || !to || from.kind === 'goal' || !nodeInputs(to, graph).includes(input)) throw new Error('이 포트에는 연결할 수 없습니다.');
  if (!text(id) || graph.edges.some(e => e.id === id && !(e.target === target && e.input === input))) throw new Error('연결 이름은 중복될 수 없습니다.');
  const visited = new Set();
  const reachesSource = node => {
    if (node === source) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    return graph.edges.some(e => e.source === node && reachesSource(e.target));
  };
  if (reachesSource(target)) throw new Error('순환하는 연결은 만들 수 없습니다.');
  const replacing = graph.edges.some(e => e.target === target && e.input === input);
  if (!replacing && documentCounts(graph).edges >= MAX_EDGES) throw new Error('전체 문서에는 연결을 최대 512개 사용할 수 있습니다.');
  graph.edges = graph.edges.filter(e => !(e.target === target && e.input === input));
  graph.edges.push({ id, source, target, input });
}

export function deleteNode(graph, id) {
  if (!graph.nodes.some(n => n.id === id && n.kind !== 'goal')) return false;
  graph.nodes = graph.nodes.filter(n => n.id !== id);
  graph.edges = graph.edges.filter(e => e.source !== id && e.target !== id);
  if (graph.groups) graph.groups = graph.groups.map(group => ({ ...group, nodeIds: group.nodeIds.filter(member => member !== id) })).filter(group => group.nodeIds.length);
  return true;
}

function documentCounts(graph) {
  const root = graph.rootGraph ?? graph;
  let nodes = root.nodes.length, edges = root.edges.length;
  for (const definition of root.modules ?? []) {
    const scope = graph.rootGraph && definition.id === graph.moduleId ? graph : definition;
    nodes += scope.nodes.length;
    edges += scope.edges.length;
  }
  return { nodes, edges };
}

function freshId(base, used) {
  let id = base, suffix = 2;
  while (used.has(id)) id = `${base.slice(0, 110)}_${suffix++}`;
  used.add(id);
  return id;
}

export function createGroup(graph, ids, { id, name }) {
  if (!text(id) || !text(name) || graph.groups?.some(group => group.id === id)) throw new Error('고유한 그룹 이름과 ID가 필요합니다.');
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('그룹으로 묶을 구성 요소를 선택해 주세요.');
  const members = ids.map(member => graph.nodes.find(node => node.id === member));
  if (members.some(node => !node)) throw new Error('그룹 구성 요소를 찾을 수 없습니다.');
  if (graph.groups?.some(group => group.nodeIds.some(member => ids.includes(member)))) throw new Error('이미 다른 그룹에 속한 구성 요소는 먼저 그룹에서 꺼내 주세요.');
  const group = { id, name, nodeIds: [...ids], collapsed: true, x: Math.min(...members.map(n => n.x)), y: Math.min(...members.map(n => n.y)) };
  graph.version = 2;
  graph.modules ??= [];
  (graph.groups ??= []).push(group);
  if (graph.rootGraph) {
    graph.rootGraph.version = 2;
    graph.rootGraph.modules ??= [];
    graph.rootGraph.groups ??= [];
  }
  return group;
}

export function toggleGroup(graph, id) {
  const group = graph.groups?.find(item => item.id === id);
  if (!group) throw new Error('그룹을 찾을 수 없습니다.');
  group.collapsed = !group.collapsed;
  if (group.collapsed) {
    const members = graph.nodes.filter(n => group.nodeIds.includes(n.id));
    group.x = Math.min(...members.map(n => n.x));
    group.y = Math.min(...members.map(n => n.y));
  }
  return group;
}

export function ungroup(graph, id) {
  if (!graph.groups?.some(group => group.id === id)) return false;
  graph.groups = graph.groups.filter(group => group.id !== id);
  return true;
}

export function moveGroup(graph, id, dx, dy) {
  const group = graph.groups?.find(item => item.id === id);
  if (!group || !Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error('그룹 이동 값이 올바르지 않습니다.');
  const members = graph.nodes.filter(node => group.nodeIds.includes(node.id));
  if (![group, ...members].every(item => coordinate(item.x + dx) && coordinate(item.y + dy))) throw new Error('작업 공간의 좌표 범위를 벗어났습니다.');
  for (const item of [group, ...members]) { item.x += dx; item.y += dy; }
  return group;
}

export function visibleGraph(graph) {
  const collapsed = graph.groups?.filter(group => group.collapsed) ?? [];
  if (!collapsed.length) return { nodes: graph.nodes, edges: graph.edges };
  const usedIds = new Set(graph.nodes.map(n => n.id)), byMember = new Map();
  for (const group of collapsed) {
    const members = new Set(group.nodeIds), inputPorts = [], outputPorts = [], inputIds = new Set(), outputIds = new Set();
    const memberNodes = graph.nodes.filter(node => members.has(node.id));
    for (const node of memberNodes) {
      for (const input of nodeInputs(node, graph)) {
        if (graph.edges.some(e => e.target === node.id && e.input === input && members.has(e.source))) continue;
        inputPorts.push({ id: freshId(`in:${node.id}:${input}`, inputIds), label: input, nodeId: node.id, input });
      }
      const outgoing = graph.edges.filter(e => e.source === node.id);
      if (node.kind !== 'goal' && (!outgoing.length || outgoing.some(e => !members.has(e.target)))) {
        outputPorts.push({ id: freshId(`out:${node.id}`, outputIds), label: node.id, nodeId: node.id });
      }
    }
    const capsule = { id: freshId(`group:${group.id}`, usedIds), kind: 'group', ref: group.id, name: group.name,
      x: group.x, y: group.y, memberIds: [...group.nodeIds], inputPorts, outputPorts };
    for (const id of members) byMember.set(id, capsule);
  }
  const nodes = [], included = new Set();
  for (const node of graph.nodes) {
    const capsule = byMember.get(node.id);
    if (!capsule) nodes.push(node);
    else if (!included.has(capsule.id)) { nodes.push(capsule); included.add(capsule.id); }
  }
  const edges = [];
  for (const edge of graph.edges) {
    const sourceGroup = byMember.get(edge.source), targetGroup = byMember.get(edge.target);
    if (sourceGroup && sourceGroup === targetGroup) continue;
    const projected = { ...edge, originalSource: edge.source, originalTarget: edge.target, originalInput: edge.input };
    if (sourceGroup) {
      projected.source = sourceGroup.id;
      projected.sourcePort = sourceGroup.outputPorts.find(port => port.nodeId === edge.source).id;
    }
    if (targetGroup) {
      projected.target = targetGroup.id;
      projected.input = targetGroup.inputPorts.find(port => port.nodeId === edge.target && port.input === edge.input).id;
    }
    edges.push(projected);
  }
  return { nodes, edges };
}

export function extractModule(graph, ids, nodeTypes, { id, name, nodeId }) {
  const root = graph.rootGraph ?? graph;
  const initialError = checkImport(root);
  if (initialError) throw new Error(initialError);
  if (!text(id) || !text(name) || !text(nodeId) || root.modules?.some(m => m.id === id) || graph.nodes.some(n => n.id === nodeId)) throw new Error('함수와 인스턴스에는 고유한 이름과 ID가 필요합니다.');
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('함수로 만들 연산 구성 요소를 선택해 주세요.');
  const selected = new Set(ids), byId = new Map(graph.nodes.map(n => [n.id, n]));
  const selectedNodes = graph.nodes.filter(n => selected.has(n.id));
  if (selectedNodes.length !== selected.size || selectedNodes.some(n => ['assumption', 'goal'].includes(n.kind))) throw new Error('가정과 목표를 제외한 연산 구성 요소만 함수로 만들 수 있습니다.');
  const inferred = node => record(nodeTypes) && Object.hasOwn(nodeTypes, node) && text(nodeTypes[node], 512) ? nodeTypes[node] : null;
  for (const node of selectedNodes) {
    if (!inferred(node.id)) throw new Error('먼저 그래프를 검사해 선택한 구성 요소의 타입을 확인해 주세요.');
    for (const input of nodeInputs(node, graph)) {
      if (graph.edges.filter(e => e.target === node.id && e.input === input).length !== 1) throw new Error('선택한 구성 요소의 입력을 모두 연결해 주세요.');
    }
  }
  const incoming = graph.edges.filter(e => !selected.has(e.source) && selected.has(e.target));
  const outgoing = graph.edges.filter(e => selected.has(e.source) && !selected.has(e.target));
  const outputIds = new Set(outgoing.map(e => e.source));
  if (outputIds.size !== 1) throw new Error('함수의 외부 출력은 하나여야 합니다. 여러 결과는 Pair로 묶어 주세요.');
  const output = [...outputIds][0];
  const external = [...new Set(incoming.map(e => e.source))];
  if (external.length > MAX_INPUTS) throw new Error('함수 입력은 최대 16개입니다.');
  if (external.some(source => !inferred(source))) throw new Error('외부 입력의 타입을 먼저 검사해 주세요.');

  const minX = Math.min(...selectedNodes.map(n => n.x)), minY = Math.min(...selectedNodes.map(n => n.y));
  const instance = { id: nodeId, kind: 'module', ref: id, x: minX, y: minY };
  const localNodeIds = new Set(selectedNodes.map(n => n.id));
  const localEdgeIds = new Set(graph.edges.filter(e => selected.has(e.target)).map(e => e.id));
  const inputs = external.map((source, index) => ({ id: `input_${index + 1}`, name: byId.get(source).ref ?? source, type: inferred(source) }));
  const inputNodes = inputs.map((input, index) => ({ id: freshId(`module_input_${index + 1}`, localNodeIds), kind: 'assumption', ref: input.id, x: 0, y: 40 + index * 90 }));
  const inputBySource = new Map(external.map((source, index) => [source, { input: inputs[index], node: inputNodes[index] }]));
  const bodyNodes = selectedNodes.map(node => ({ ...node, x: node.x - minX + 240, y: node.y - minY + 40 }));
  const goalNode = { id: freshId('module_goal', localNodeIds), kind: 'goal', x: Math.max(...bodyNodes.map(n => n.x)) + 240, y: bodyNodes.find(n => n.id === output).y };
  const bodyEdges = graph.edges.filter(e => selected.has(e.target)).map(edge => ({ ...edge, source: selected.has(edge.source) ? edge.source : inputBySource.get(edge.source).node.id }));
  bodyEdges.push({ id: freshId('module_result', localEdgeIds), source: output, target: goalNode.id, input: 'proof' });
  const bodyGroups = (graph.groups ?? []).filter(group => group.nodeIds.every(member => selected.has(member)))
    .map(group => ({ ...group, nodeIds: [...group.nodeIds], x: group.x - minX + 240, y: group.y - minY + 40 }));
  const definition = { id, name, inputs, outputType: inferred(output), nodes: [...inputNodes, ...bodyNodes, goalNode], edges: bodyEdges, groups: bodyGroups };
  const nextNodes = [];
  let inserted = false;
  for (const node of graph.nodes) {
    if (!selected.has(node.id)) nextNodes.push(node);
    else if (!inserted) { nextNodes.push(instance); inserted = true; }
  }
  const nextEdges = graph.edges.filter(e => !selected.has(e.target)).map(edge => selected.has(edge.source) ? { ...edge, source: nodeId } : edge);
  const usedEdgeIds = new Set(nextEdges.map(e => e.id));
  for (const source of external) {
    nextEdges.push({ id: freshId(incoming.find(e => e.source === source).id, usedEdgeIds), source, target: nodeId, input: inputBySource.get(source).input.id });
  }
  const nextGroups = (graph.groups ?? []).map(group => ({ ...group, nodeIds: group.nodeIds.filter(member => !selected.has(member)) })).filter(group => group.nodeIds.length);
  if (hasCycle(nextNodes, nextEdges)) throw new Error('선택한 영역을 하나의 함수로 묶으면 순환 연결이 생깁니다. 경로 중간의 구성 요소도 함께 선택해 주세요.');
  const candidate = structuredClone(root);
  candidate.version = 2;
  candidate.modules ??= [];
  candidate.groups ??= [];
  if (graph.rootGraph) {
    const enclosing = candidate.modules.find(module => module.id === graph.moduleId);
    if (!enclosing) throw new Error('편집 중인 함수 정의를 찾을 수 없습니다.');
    Object.assign(enclosing, { nodes: nextNodes, edges: nextEdges, groups: nextGroups });
  } else Object.assign(candidate, { nodes: nextNodes, edges: nextEdges, groups: nextGroups });
  candidate.modules.push(definition);
  const error = checkImport(candidate);
  if (error) throw new Error(error);

  // Validate the entire document before updating either a body or its shared library.
  graph.version = root.version = 2;
  graph.nodes = nextNodes;
  graph.edges = nextEdges;
  graph.groups = nextGroups;
  root.modules ??= [];
  root.groups ??= [];
  if (graph.rootGraph) Object.assign(root.modules.find(module => module.id === graph.moduleId), { nodes: nextNodes, edges: nextEdges, groups: nextGroups });
  root.modules.push(definition);
  graph.modules = root.modules;
  return { definition, instance };
}

export class RevisionGate {
  #revision = 0;
  current() { return this.#revision; }
  bump() { return ++this.#revision; }
  isCurrent(revision) { return revision === this.#revision; }
}

export function fitViewport(nodes, width, height, graph) {
  if (!nodes.length) return { x: 40, y: 40, zoom: 1 };
  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxX = Math.max(...nodes.map(n => n.x + WIDTH));
  const maxY = Math.max(...nodes.map(n => n.y + nodeHeight(n, graph)));
  const zoom = Math.max(.15, Math.min(1.1, (Math.max(width, 100) - 80) / Math.max(maxX - minX, 1), (Math.max(height, 100) - 100) / Math.max(maxY - minY, 1)));
  return { x: (width - (maxX - minX) * zoom) / 2 - minX * zoom, y: (height - (maxY - minY) * zoom) / 2 - minY * zoom, zoom };
}

export function resizeViewport(view, previous, next) {
  if (previous.width <= 0 || previous.height <= 0 || next.width <= 0 || next.height <= 0) return { ...view };
  return { ...view, x: view.x + (next.width - previous.width) / 2, y: view.y + (next.height - previous.height) / 2 };
}
