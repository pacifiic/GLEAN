# Batch 1 design/code audit

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

2026-10-07. Reviewed the actual Inspector/Watch, drag/compatibility, ComputeGate and dependency-preview changes in app.js, proof-review.mjs, compute-gate.mjs, document.mjs, graph.py and server.py. Root owns browser acceptance; the reproductions below use the actual pure models/compiler and a bounded local HTTP test. No product files were changed by this auditor.

## B1-01 — P1: closing or cancelling a graph request does not cancel its Lean job

Status: FIXED; independently tested with an actual Lean child process (see follow-up below).

The UI's `cancel-check` and compute-mode handlers abort `fetch` and clear the local request controller. The `/api/check` server path still runs `check_graph` synchronously with `subprocess.run`; its two verification slots are released only when that process finishes or reaches the old timeout. Therefore the newly introduced cancellation UI suppresses a response but does not cancel backend work.

Reproduction used the actual HTTP handler and compiler with only the Lean executable replaced by a blocking test function: start two valid graph checks, close both HTTP clients, then submit a third check. Both old checks remained active and the third returned `status:error` with `다른 증명을 검사 중입니다. 잠시 후 다시 검사해 주세요.` No expensive Lean run was needed. This affects automatic mode especially: an edit aborts the prior fetch, but the next debounced request competes with abandoned checks.

Repair: give graph kernel checks an actual cancellable job/process handle (or another equivalent server-side cancellation mechanism) and make mode changes/cancellation release obsolete work. A late result must still fail the revision gate. Also clear the checking status on compute-mode changes: the current handler resets the button but leaves the header in its old checking state.

## B1-02 — P1: restored Watch snapshots can claim current verification

Status: FIX IMPLEMENTED BY AGENT 1; requires final restoration/browser confirmation.

Original path: a pinned snapshot stores `verification:'verified-document'`, graph fingerprint and document ID. `loadDocument` restored all three. `renderInspector` considered the pin current when its fingerprint and ID matched, and `inspectionCard` displayed `현재 문서 커널 검증됨` even after refresh/import with no current verification result. Forged JSON could create the same label.

Agent 1 reported a regression fix: `restoreWatches` downgrades imported evidence to historical, and Watch cards always identify stored observations as not current verification. Only the live Inspector may report current document verification. Review the final implementation and browser reload; do not accept the original stored flag as proof provenance.

## B1-03 — P2: replacement function port can be falsely marked incompatible

Status: FIXED for the false incompatibility finding: the apply function input no longer inherits the full type of the currently connected function; its required type is unknown until inference.

Current `graph.py` sets an apply node's required `fn` type to the full type of its *currently connected* function. The drag UI compares a candidate's displayed type against that string. This confuses an existing value with the set of valid replacements.

Actual compiler reproduction:

- assumptions `hp:P`, `f:P→Q`, `g:P→R`; goal `R`; apply currently uses `f` and `hp`.
- old compilation: `invalid`, `portTypes.apply.fn = 'P → Q'`; candidate `g` has type `P → R`.
- replacing only the function wire with `g`: compilation becomes `ready`.

The current UI string comparison colors `g` incompatible even though it repairs the graph. Derive compatibility from the argument/target constraints or leave the candidate uncertain until a trial inference. Do not assert incompatibility merely because a function's codomain differs from the current value. The future v3 path must use actual Lean compatibility rather than this string rule.

## B1-04 — P2: collapsed group inputs cannot be inspected or pinned

Status: input proxy fixed; output proxy follow-up pending at the last read.

`inputClicked` selects the collapsed group's visual ID while the real input belongs to a member node. `renderInspector` then calls `inspectNode(graph, selected, ...)`, which only searches real `graph.nodes`.

Actual model reproduction: collapse a group containing the goal. The proxy input is `{id:'in:goal:proof', nodeId:'goal', input:'proof'}` and the displayed group ID is `group:gr`. `inspectNode(graph, 'group:gr', null)` returns null. Thus clicking the group's real input opens an empty Inspector and disables pinning.

Repair: retain the clicked real node/port identity independently of group highlight selection, or explicitly resolve group proxy selections before inspection/pinning. Test both input and output proxy ports, including a group containing multiple real nodes.

## Checks completed

- app.js parsed successfully with the bundled Node executable.
- B1-03 used the real `compile_graph` function and produced the statuses above.
- B1-04 used the real `createGroup`, `visibleGraph`, and `inspectNode` functions.
- B1-01 used a temporary loopback HTTP server with the real request handler and bounded fake Lean work, leaving the running user server untouched.
- No heavy π checks were run concurrently with root's LSP work.

This is a design/code bug audit. Agent 2 separately determines R01/R06/R07/R11 requirement completeness; passing pure-model tests alone does not establish the drag, persistence and browser behavior.

## B1-05 — P1: browser entrypoint syntax error escaped helper tests

Status: live syntax fixed; entrypoint smoke coverage requested.

Root captured a served `app.js` snapshot that prevented application startup: `work/grasshopper-implementation/served-app.mjs`. Independent `node --check` of that snapshot fails at line 66 because `inspectionCard` contains a literal newline inside a single-quoted string. Root also observed the browser syntax error and empty UI. Existing helper-module tests did not import or parse the application entrypoint.

The currently edited `glean/prototype/web/app.js` uses escaped `\n` and independently passes `node --check`. Add entrypoint parsing/import or browser startup smoke to routine verification so a green model-test suite cannot mask a completely broken boot. The archived snapshot establishes the original failure; it does not imply the live file remains broken.

## Follow-up verification of Batch 1 fixes

- **B1-01:** app cancellation and mode changes now route through `GraphRunner` and `/api/graph/check/cancel`, backed by `GraphCheckService` and `SourceCheckService`. An independent actual-Lean probe started a graph job with a one-job limit, cancelled after its process existed, then started a replacement. Observed: cancelled status, child exit `-15`, worker stopped; replacement was `valid`, `verified: true`, `kernelAccepted: true`, strict policy with zero axioms, duration 9,771 ms. This closes the abandoned backend work finding for the reviewed new path.
- **B1-02:** independently read `restoreWatches` downgrading stored verification to `historical` and every Watch card forcing historical display, including same-document/same-revision snapshots. The six proof-review tests passed. Browser reload remains root's integration check.
- **B1-03:** independently read that `graph.py` now exposes only the connected function's argument requirement, not its whole type as the required replacement function. A function candidate becomes unknown instead of falsely incompatible. This closes the reported false-red case; it does not establish dependent Lean compatibility for future v3 ports.
- **B1-04:** real input proxy identity now uses `inspectedId=node.id`. At the follow-up read, collapsed-group output clicks still selected only the virtual group ID; this remaining output case was sent to Agent 1 for the same real-node mapping.
- Agent 2 found nested malformed Watch snapshots that could crash rendering. By the independent follow-up read, `validateDocument` rejected each of `inputs:[null]`, `assumptions:[null]`, and source text without a source range. Permanent nested-shape regression coverage was requested.
