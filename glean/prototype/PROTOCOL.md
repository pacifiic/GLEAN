# GLEAN prototype contract

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

This first editor supports propositional proof terms: assumptions, function application,
conjunction construction/projection, and one goal. Python's standard library serves a
dependency-free browser editor. The final authority is the pinned Lean 4.34.1 executable.

## Graph version 1

```json
{
  "version": 1,
  "name": "compose",
  "propositions": ["P", "Q", "R"],
  "assumptions": [{"id": "hp", "type": "P"}, {"id": "f", "type": "P → Q"}, {"id": "g", "type": "Q → R"}],
  "goal": "R",
  "nodes": [
    {"id": "hp", "kind": "assumption", "ref": "hp", "x": 80, "y": 80},
    {"id": "f", "kind": "assumption", "ref": "f", "x": 80, "y": 220},
    {"id": "g", "kind": "assumption", "ref": "g", "x": 80, "y": 360},
    {"id": "apply1", "kind": "apply", "x": 380, "y": 140},
    {"id": "apply2", "kind": "apply", "x": 650, "y": 220},
    {"id": "goal", "kind": "goal", "x": 920, "y": 220}
  ],
  "edges": [
    {"id": "e1", "source": "f", "target": "apply1", "input": "fn"},
    {"id": "e2", "source": "hp", "target": "apply1", "input": "arg"},
    {"id": "e3", "source": "g", "target": "apply2", "input": "fn"},
    {"id": "e4", "source": "apply1", "target": "apply2", "input": "arg"},
    {"id": "e5", "source": "apply2", "target": "goal", "input": "proof"}
  ]
}
```

Node inputs: assumption = none; apply = fn, arg; pair = left, right;
left/right (conjunction projections) = value; goal = proof. Each non-goal node
has a single output. Exactly one goal is required. IDs are unique nonempty
strings with bounded lengths. Coordinates affect layout only. Each input has
at most one edge. Cycles, unknown references and malformed graphs are invalid.
All nodes are checked by default, including disconnected nodes; missing wires are incomplete.
The optional goal scope checks the dependency closure of the goal while reporting disconnected
workspace inference failures separately. Structural validity is always checked for the whole document.

Type grammar: declared uppercase ASCII proposition names (e.g. P, Q1), parentheses,
right-associative implication (→ or ->), and conjunction (∧ or /\\) with higher
precedence than implication. No arbitrary Lean expressions, binders, tactics or imports.

## Graph version 2

Version 2 adds explicit `modules` and `groups` arrays. Modules have typed formal inputs,
one output, local proof graphs and nonrecursive shared references. Groups are visual metadata
and do not alter compilation. The full schema and extraction rules are in [MODULES.md](MODULES.md).
The compiler also returns `moduleTypes`, `moduleNodeTypes`, and body diagnostics with `moduleId`.
Version 1 documents continue to work without migration until a module or group is created.

## Python compiler

`glean/prototype/graph.py` exports `compile_graph(graph: object) -> dict`.
It must validate untrusted JSON and never raise on ordinary malformed input.
Return fields: `status` (ready, incomplete, invalid), `generatedCode` (string or null),
`nodeTypes` (node ID to formatted type), `diagnostics` (list of objects with
`severity: "error" | "info"`, `message`, optional `nodeId` and `port`).
Only ready graphs have generated Lean code. Code is a complete module with a fixed
theorem name `glean_proof`, safe generated names for all graph identifiers, an
explicit proof term without sorry/admit/custom axioms, and `#print axioms glean_proof`.
Preserve node identifiers in diagnostics, never interpolate them into Lean code.

## HTTP

- GET `/api/examples`: `{ "examples": [{ "id", "title", "description", "graph" }] }`.
  Example files have this individual wrapper shape, stored in `examples/*.json`.
- GET `/api/health`: `{ "ok": boolean, "leanVersion": string | null }`.
- POST `/api/check`: raw graph as JSON, or `{graph, scope: "all" | "goal"}`. Returns compiler fields and `verified: boolean`.
  Ready code is checked by actual Lean; status becomes valid, invalid or error.
  Additional `lean` object: `{ "version", "output", "durationMs" }` when invoked.
  Incomplete/invalid graphs are never sent to Lean. Verified is true only on a successful
  Lean process and an axiom audit showing no axioms. HTTP errors are JSON diagnostics.

Compiler output includes 1-based inclusive `sourceMap[nodeId] = {startLine,endLine}` and
`moduleSourceMaps[moduleId][nodeId]` for generated lines. Goal scope includes `includedNodes`,
`includedModules`, and `workspaceDiagnostics`; these are distinct from blocking `diagnostics`.
Syntax diagnostics can include `field: "goal" | "assumption"`, `assumptionId`, and a 1-based
`position` for navigation to the original input. Module diagnostics retain `moduleId`.

## Lean source documents

The UI distinguishes graph JSON from raw `.lean`; it never parses Lean text as JSON. Drafts use
`{kind:"graph",graph,form?}` or `{kind:"lean",filename,source,projectId,target,policy?}`. Optional
`form` preserves unapplied graph property edits. Policies are `standard` (default) or `strict`.
Source size is at most 8 MiB UTF-8; script bodies have a separate 1 MiB budget and serialized documents/requests a 24 MiB budget. File names are basenames. Project IDs are fixed `glean` and
`mathlib`, both pinned to Lean 4.34.1; API callers cannot choose a working directory or executable.
The mathlib profile uses `.glean-tools/mathlib-audit/mathlib4`; its caches are not committed.

- GET `/api/lean/projects`: `{projects:[{id,name,root,leanVersion,available,reason?}]}`.
- GET `/api/lean/reference/pi`: the bundled, unchanged 311-line source document and target `irrational_pi`.
- POST `/api/lean/open`: `{projectId,filename,source}` → session ID, version, declarations.
- POST `/api/lean/update`: `{sessionId,source,version}`. Version is the expected current version;
  stale updates are returned as `stale:true` without changing the document.
- POST `/api/lean/context`: `{sessionId,line,character,version}` → actual Lean goals, rendered goals,
  hover/term-goal data and plain text, diagnostics, source-derived declaration navigation.
  LSP positions are zero-based UTF-16. Source-derived declarations are navigation hints, not
  a certified elaborated declaration dependency graph.
- POST `/api/lean/close`: `{sessionId}` releases the persistent language-server process.
- POST `/api/lean/check/start`: `{source,filename,projectId,target,policy}` → asynchronous job.
- POST `/api/lean/check/poll` and `/cancel`: `{jobId}` → current job state.
- POST `/api/lean/index/start`: `{source,filename,projectId}` → cancellable actual command-state analysis.
- POST `/api/lean/index/poll` and `/cancel`: `{jobId}` → analysis job state. `analyzed` returns current-file declarations with exact full names, telescope/output types, optional ranges, direct constant dependencies, header imports, dependency owner modules, source/environment provenance and partial-error diagnostics. It always has `verified:false`; this endpoint does not perform proof acceptance. The adapter handles namespaces, private names and macro-generated declarations from Lean's actual environment, not regex source parsing.
- POST `/api/lean/index/convert`: `{jobId,declaration,sourceHash,environmentHash,policy?,sourceOrigin?}` → `{kind:"graph",graph}`. Requires a completed, error-free live current-file analysis with matching source and current environment. Supports public monomorphic safe theorems whose signature does not directly reference private constants; unsupported cases return a reason and the caller keeps the source document. This creates input nodes and wires into an editable LeanScript calling the uploaded declaration, not tactic-body unfolding. Conversion is not verification.
- POST `/api/lean/declaration`: `{projectId,imports,declaration}` → installed-environment signature/provenance. This is separate from an uploaded current-file declaration with the same name. Unsupported universe signatures are explicit; supported signatures can seed a new reference graph.

Converted v3 graphs embed `sourceContext` (version 1, fixed module `GleanUploadedSource`, full source, filename, source/environment hashes, project, declaration, policy and optional original bytes). The server validates this envelope and builds the original source as a separate module before graph and expected-signature compilation. The auditor independently replays both original and graph declarations and returns `sourceContextKernelAccepted`. The graph JSON is the portable envelope; Lean export requires both the generated file and `GleanUploadedSource.lean`, built in the same project. Cursor-goal LSP for these graphs is explicitly unsupported; return to the source document for LSP goals. Existing whole-graph checking remains available.

Source checking runs compilation, then a separate trusted Lean program that imports the result
with extension loading disabled, replays kernel checking, and traverses the named declaration's
axiom dependencies. It does not trust user-generated `#print` or console success text. A completed
job includes `verified`, `kernelAccepted`, `audit`, `sourceHash`, `target`, diagnostics and Lean
logs. The three standard axioms (`propext`, `Classical.choice`, `Quot.sound`) are allowed only in
standard mode. `sorryAx` is incomplete; custom axioms or strict-policy violations are invalid.
CLI diagnostics use 1-based `line`/`column`; they guide the UI but do not establish verification.

Ordinary source/graph jobs have a 120-second total deadline; graphs with a validated `sourceContext`
have a 360-second total deadline across source-module, graph, independent-signature compilation and
kernel audit. The server selects this budget and returns `timeoutSeconds` in each job snapshot;
client fields cannot extend it. Progress snapshots include the current phase and elapsed duration.
Jobs are cancellable by process group. At most two jobs and
two LSP sessions run concurrently. Idle LSP sessions expire after 120 seconds and are reaped in
the background; clients reopen expired sessions. This is a local Lean development tool, not an
OS sandbox for hostile metaprograms. It retains the same loopback/origin boundary as graph checking.
Command analysis has its own one-job limit, 120-second deadline, maximum 4,096 declarations and 16 MiB metadata output. The browser renders/searches the list in pages of fifty. Optional historical cache fields are shape-checked before rendering; malformed caches are skipped with a warning while source and original cache remain in the document.

Raw `.lean` import uses strict UTF-8 decoding and stores `sourceOrigin` with exact Base64 bytes, byte length, BOM flag, decoding result and SHA-256. Invalid UTF-8 remains downloadable but analysis/check controls are disabled until a decodable source exists. Original-file export and edited UTF-8 source export are different actions. Imported origin metadata is checked against actual byte count/BOM/decoding, and a displayed authoritative hash is recomputed from bytes. The current editable source can legitimately differ from original bytes.

`sourceFileView:{version:1,presentation,presentationRecovery?}` uses the same manual Hide/container model for the file capsule and read-only declaration proxies. It never creates semantic proof edges. Source constant references, editable graph wires and cursor goal observations have separate labels. Historical analyses cannot provide a current source-range jump. Corrupt wrapper/presentation metadata is recovered to a safe view with exact original retained for download.

## History and recovery

The browser keeps 50 document snapshots for undo/redo, sharing unchanged subtrees internally. Logical changes invalidate proof state;
positions and visual groups do not. Previously verified graph results are cached only in memory,
keyed by semantic document and check scope. A refresh never restores a trusted green state.
The draft store atomically writes a current and previous validated document to `glean.draft.v1`
in localStorage. Invalid or unavailable storage produces visible feedback; no proof result is saved.
Reusing an in-memory result after presentation-only Undo also checks the current actual environment and request epoch. Isolation and navigation use a separate validated session recovery entry and an explicit resume offer, never ordinary document Undo/export.

The server binds loopback only (default 127.0.0.1:8765), rejects foreign Origin headers,
limits request size and Lean runtime, serves only web assets, and invokes Lean without
a shell. The browser must visibly distinguish unverified, incomplete, rejected, and
Lean-verified results. Any semantic change immediately clears the verified state; stale
responses cannot re-verify a newer graph. Layout and group changes preserve verification. Exported graph JSON retains positions.

## File ownership for parallel implementation

- Compiler agent: `graph.py`, `glean/tests/prototype/test_graph.py`.
- Editor agent: `web/` only.
- Validation agent: `examples/`, `glean/tests/prototype/test_acceptance.py`.
- Main agent: server, launch scripts, protocol, documentation and integration fixes.

Tests run from the repository root with `python3 -m unittest discover -s glean/tests/prototype -v`.
