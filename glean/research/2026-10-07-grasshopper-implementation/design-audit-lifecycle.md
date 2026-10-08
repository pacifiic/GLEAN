# GLEAN document and asynchronous lifecycle audit

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

2026-10-07. Agent 3 independent read-only product review, continuing the implementation → requirements audit → design/code audit → repair loop. Product changes belong to Agent 1; root owns browser acceptance.

The executable `design-audit-lifecycle-probe.mjs` imports the actual `typed-editor.mjs`, `document.mjs`, and `notebook.mjs` modules. A small DOM harness supplies event dispatch and observes the editor's returned document, callbacks, and results. API responses in this harness are controlled to reproduce races; the test does not claim actual kernel acceptance. Results are saved in `design-audit-lifecycle-results.json`.

## U4-01 — malformed imported A/B provenance can crash rendering (P2)

Status: OPEN, sent to Agent 1.

A valid graph document with an A/B entry containing `provenance: {audit:{axioms:{}}}` passes `validateDocument`. `normalizeNotebook` clones the arbitrary provenance. The actual render expression `variant.provenance.audit?.axioms?.join(', ')` then throws `join is not a function`. A string value similarly lacks array `join`.

Normalize/validate imported provenance before rendering. Historical input must never be trusted as proof success, and malformed diagnostic metadata must not prevent the containing graph from loading.

## U4-02 — an old pending wire connects a replacement document (P1)

Status: OPEN, sent to Agent 1.

1. Open the typed Nat example and click `n.out` to begin a connection.
2. Replace the document with a separate graph using the same ordinary `n`/`zero` node IDs and no edges.
3. Click the new graph's `zero.x` input without starting any new connection.

Observed: an `n.out → zero.x` edge is inserted in the new document and `onChange` runs. `open`/`close` do not clear `pending`, `drag`, `selectedOutput`, or the dependency-preview class. Reset all transient interaction state during replacement/closure, independently of the graph's IDs.

## U4-03 — deleting a named output changes only the controls (P1)

Status: OPEN, sent to Agent 1.

1. Select a Construct node with `left` and `right` named outputs and complete a check.
2. Click the × on the `right` output row.

Observed: the row disappears, but `current().graph` still contains both outputs, no `onChange` runs, and the successful check remains current. The deleted output reappears after selection change/reload. Calc step × uses the same DOM-only deletion pattern. The control must commit the semantic deletion, invalidate current verification, and enter history/autosave immediately, including the remaining wire diagnosis/migration behavior.

## U4-04 — a mode change does not invalidate an in-flight typed preview (P2)

Status: OPEN, sent to Agent 1.

Hold `/api/preview` pending, call `setAutomatic(true)`, then deliver the old preview. It still enters the result callbacks because mode changes cancel `GraphRunner` but do not bump the typed revision; preview requests are outside that runner. Explicitly version/cancel preview delivery as well as heavy verification.

## U4-05 — an old lookup failure changes the new document's status (P2)

Status: OPEN, sent to Agent 1.

Hold a declaration query pending, replace the document, then reject the old query. Its unguarded `catch` calls `showError`, marking the replacement document invalid with the old lookup's error. The successful query path gates `revision`, but failure delivery needs the same document/revision check.

## Earlier input hardening retest

The previously reported `normalizeNotebook(null)` case now returns empty `variants`/`steps`. A bookmark with `before.structuredGoals: [null, 3, {type:'P'}]` drops malformed entries and safely normalizes its position. These particular input faults are FIXED in the reviewed code; U4-01 concerns a separate provenance branch.

## Further boundaries under review

- Typed Inspector still derives the displayed used assumptions from all graph input ancestors, while the backend now returns `bindingUsage`. It must distinguish a merely wired hypothesis from one used by the actual term.
- Legacy layout undo currently redisplays an in-memory result by graph semantic equality without independently checking whether Lean/library environment identity changed. This is not equivalent to importing a historical result, but reusable current verification still needs environment freshness.
- The A/B UI currently exposes the two saved bodies and a same/different semantic message. Requirements audit is determining whether the missing explicit changes comparison prevents R14 acceptance.
- Generated-graph selection metadata survives the transition to Lean source. If source editing changes its identity/mapping, bookmarks must keep the old graph selection as historical rather than assign it to a new current source version.

## Execution

`node glean/research/2026-10-07-grasshopper-implementation/design-audit-lifecycle-probe.mjs` exited 0 and reproduced all five open cases. A zero exit here means the probe ran; its JSON records defects rather than asserting product success. No product files were edited by this auditor.

## U4 repair retest

Agent 1 repaired all five demonstrated paths. The exact original independent probe was rerun against the edited product modules and saved as `design-audit-lifecycle-retest.json`:

- U4-01: imported malformed provenance normalizes without a render exception.
- U4-02: replacement graph keeps zero edges; stale pending click produces no change.
- U4-03: deleting `right` immediately leaves one stored output, emits one document change, and clears the prior result.
- U4-04: no old preview result is delivered after compute-mode change.
- U4-05: no old declaration failure status is delivered after replacement.

These five findings are FIXED for their original reproductions. The related `notebook.test.mjs` and `typed-editor.test.mjs` suites independently passed 11/11 tests. Root still owns actual browser acceptance; the DOM harness is not substituted for that acceptance.

## Actual binding metadata probe

`python3 -m glean.research.2026-10-07-grasshopper-implementation.design-audit-bindings-probe` ran the actual `GraphCheckService → SourceCheckService → independent Lean kernel replay` path. A script with explicit `P,Q : Prop`, `hp : P`, `hq : Q`, and body `hp` was accepted, with the expected signature check and no custom axioms. Its result is saved in `design-audit-bindings-results.json`.

The result contains actual types for all five graph output ports. Its generated component's `bindingUsage` contains only `P,hp`; `Q,hq` are not used. The root theorem's syntactic call expression contains all passed arguments, so accurate graph Inspector usage needs component-aware port traversal rather than blindly copying the theorem call's syntactic free-variable set. The current Inspector still uses all ancestors; this separate R01 issue remains open and has been sent to Agent 1 and the requirements auditor.
