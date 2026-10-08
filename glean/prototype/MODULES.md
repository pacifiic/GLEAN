# Function modules and visual groups

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

Version 1 documents remain supported. Version 2 adds `modules` and `groups` arrays.
The supported type grammar remains declared propositional atoms, implication and conjunction.

## Function definition

```
{ id, name, inputs: [{id, name, type}], outputType,
  nodes: [...], edges: [...], groups: [...] }
```

Body nodes use the existing graph language: `assumption.ref` refers ONLY to a formal input id;
exactly one `goal` has the declared output type. Bodies share the root proposition declarations
and root module library. A call is `{id,kind:"module",ref:moduleId,x,y}`; its input names are the
formal input ids and it has one output. Multiple results can be represented by conjunction.
Definitions are reusable; editing a body updates every call. No implicit capture of root
assumptions. Module dependencies must be acyclic. At most32 definitions and16 inputs each;
total nodes across root and all definitions ≤256, total edges ≤512. IDs are unique within
their own scope; module ids globally unique. Generated Lean names never interpolate user text.

The compiler validates every definition, including unused definitions, infers body node types,
checks each declared output, emits private Lean theorems as reusable proof-valued functions with explicit typed inputs,
then compiles calls in the main `glean_proof`. No axioms/sorry or string-based user Lean injection.
Compiler result extends with `moduleNodeTypes: {moduleId: {nodeId:type}}`,
`moduleTypes: {moduleId: signature}`; body diagnostics carry `moduleId` plus local nodeId/port.

## Visual groups

`groups: [{id,name,nodeIds,collapsed,x,y}]` is the legacy flat presentation format. Member nodes remain in
the scope graph, and all original edges remain. The current UI migrates this metadata into the document
envelope's `presentation:{version:1,scopes,occurrenceViews}`. Its containers can nest within one scope;
parent-child membership forms a forest and cannot cross semantic module/Cases boundaries.
Collapse renders one virtual capsule with boundary sockets
and routes crossing edges to it; expand restores members. A group can include assumptions/goals.
Moving a collapsed group translates all member nodes. Grouping, collapsing, and layout motion
must preserve semantic verification state. Groups are retained in JSON but ignored by proof code.
Manual Hide and temporary isolation use the common presentation projection. Collapsed groups can be
selected, moved, hidden, isolated or wrapped by another container in v1/v2/v3. Proxy ports preserve
original endpoints; hidden-hidden wires are omitted, never replaced with inferred bypass wires.

## Shared JavaScript model API

`nodeInputs(node, graph)` returns input ids (`PORTS[kind]` for existing nodes).
`nodeHeight(node, graph)`, `portPosition(node,input,graph)`, `fitViewport(nodes,w,h,graph)`
accept optional scope graph and support module calls. Root and body scope graphs expose modules.
`checkImport`, `connect`, `deleteNode` support both versions and tidy group membership.

`createGroup(graph, ids, {id,name})`, `toggleGroup(graph,id)`, `ungroup(graph,id)` mutate graph
like existing connect/delete APIs. createGroup returns new group and sets version2.
`extractModule(graph, ids, nodeTypes, {id,name,nodeId})` mutates and returns
`{definition,instance}`. Selected nodes must be computation nodes (not assumption/goal), have
all inputs connected, one distinct node output crossing the boundary, and known inferred types.
One formal input per distinct external source; repeated use shares a single input. Replace the
selected computation nodes with a call and rewire crossing edges. Body gets explicit formal
assumption nodes and a goal. Preserve outside edges and original proof semantics. Reject extraction
when contracting the region creates a cycle; validate and commit atomically. Use non-colliding
generated local ids. No changes on rejection. Check total node/edge/module/input bounds.

`visibleGraph(graph)` returns `{nodes,edges}` for rendering. Virtual group nodes use kind `group`,
`ref` group id, `inputPorts: [{id,label,nodeId,input}]`, `outputPorts:[{id,label,nodeId}]`,
`memberIds`, width/height helpers as needed. Rendered edges retain id plus original source/target
metadata; proxy input/source ids map to real endpoints. Projected edges expose `originalSource`, `originalTarget`, `originalInput`; `sourcePort` names
the virtual output socket. Body editor scopes carry temporary `rootGraph` and `moduleId` metadata
for global validation; these keys never belong in saved documents.

## Editor integration

The editor uses controls with ids `group-button`, `module-button`, `ungroup-button`,
`module-name` (text input), `module-library`, `module-back-button`, `module-breadcrumb`.
Grouping/extraction use Shift-click multi-selection (box selection optional). Palette contains a
new `data-panel="modules"` section and one ribbon button `data-ribbon-command="modules"`.
Selection toolbar contains group/module/ungroup controls. Module library offers add instance and
edit body; return button restores root canvas. Body context signature is read-only for this version
but internal wiring/nodes are editable. Extraction name comes from `module-name`, defaults sensibly.
Changing input signatures after creation and importing arbitrary Lean/mathlib remain future work.
