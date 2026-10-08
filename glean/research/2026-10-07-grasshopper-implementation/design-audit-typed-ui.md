# Typed graph UI design/code audit

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

2026-10-07. Read-only review of `typed-editor.mjs`, `typed-model.mjs`, and app integration. The reproductions run the actual editor module in an ephemeral small DOM harness; root independently owns and runs browser acceptance. Product fixes belong to Agent 1.

## U3-01 — P1: unapplied edits retain verification and late results erase the input

Status: OPEN; root corroborated in the actual browser.

The original node controls only copy their values into the document when `노드 적용` is clicked. Input events do not invalidate the result or record a draft. Consequently, a visible LeanScript edit can leave the old green result on screen, and `check()` sends the old stored body rather than the visible text.

Stronger independent reproduction:

1. Open the typed Nat identity demo and select its script.
2. Start a check, holding its API result pending.
3. Change the visible body from `by rfl` to `by exact True.intro`.
4. Deliver the original successful check response.

Observed: `renderProperties()` reconstructs controls from the old document, silently replaces the visible edit with `by rfl`, and delivers `verified: true`. Root independently reproduced the same loss using an unapplied `by sorry` edit during a real browser check.

Requirements for repair: maintain explicit draft state, invalidate current verification immediately on semantic input, prevent stale responses from replacing draft controls, and define check/save/undo/navigation behavior for the draft. The user should not need to infer which visible content was actually checked. Preserving a pending edit across adding a calc step, adding an output, changing selection, and a preview response is part of the same lifecycle issue.

## U3-02 — P2: selected output identity leaks between nodes

Status: OPEN.

Reproduction: click output `right` on a Construct node, select an ordinary input node `n`, then click `이 출력을 범위의 결과로 지정`. The actual stored endpoint becomes `{node:'n', output:'right'}` although `n` only has output `out`.

Reset the selected output when selecting/navigating to a different node, or derive it from a selection tuple and validate membership when assigning a result. Also clear pending wire/drag/output state when replacing or closing the whole document.

## U3-03 — P1: editing a branch signature silently changes the root theorem

Status: OPEN.

Reproduction: enter a Cases branch, open the document/signature properties, change the visible output/goal field from `True` to `False`, and apply. Observed stored state: root `graph.goal` becomes `False`, while the owning Cases node's `outputType` remains `True`.

The non-module path in `renderProperties` falls back to root inputs/goal even inside a case branch. A branch needs explicitly scoped controls for its available binders and owning case output (or an explanatory read-only view). It must not present root settings as though they belong to the branch.

## Concurrent fixes and scope notes

- The current imported-v3 shape validator already rejects missing imports and null component inputs after Agent 1's concurrent hardening. An earlier minimal validator would not; no remaining finding is based on that stale code.
- Agent 2 independently covers requirement completeness, including batch calls in nested scopes, impact-callsite feedback, and typed Inspector/compatibility metadata. This audit does not treat placeholder or unfinished UI as verified functionality.
- A standalone pinned Lean API probe for Agent 1 successfully used `Meta.lambdaLetTelescope` plus `inferType`/`ppExpr` inside the reconstructed local context. This supports actual let-binding metadata; it does not imply the typed Inspector is already integrated or tested.

## U3-04 — P1: switching from a running legacy check can leave typed checking disabled

Status: OPEN code-path finding; browser reproduction requested from root.

Legacy `checkGraph()` disables the shared check button. Its `finally` only resets that button if its revision/controller still matches. Opening a typed document bumps that revision and aborts the legacy request, but the typed branch of `loadDocument()` does not reset the shared button, unlike the raw Lean branch. Consequently, the obsolete check cannot reset the button and the new typed document can inherit a disabled verification control.

The same opening branch clears result variables but leaves the old generated source/log panel visible. Reset checking controls and result-derived panels as part of switching documents, while retaining only explicitly historical records. This finding was communicated with its code path and was not described as browser-confirmed evidence.
