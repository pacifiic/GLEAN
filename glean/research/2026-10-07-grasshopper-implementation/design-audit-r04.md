# R04 design/code audit

Audit date: 2026-10-07. Auditor: Agent 3. Product ownership: root (`lean_lsp.py`, `lean-editor.mjs`). No product files were edited by this audit.

## R04-01 — P1: cancelling an initial session open resurrected the connection

Status: FIXED; independently retested.

The original `cancelContext()` invalidated the context request and closed the currently assigned session, but a pending `ensureSession()` open had neither an assigned session nor an invalidated generation. Its late response therefore installed and remembered a new live session, overwrote the cancelled status, and left Lean running despite cancellation.

The independent reproduction used the existing frontend fake-DOM harness with a deferred `open` response:

1. Start `editor.open(source)` and leave `/api/lean/open` pending.
2. Start `readContext()` and call `cancelContext()`.
3. Resolve the original open with `sessionId: 'late-session'`.
4. Await open/context completion and inspect request history and session storage.

Before the fix, the 13 existing tests passed but the extra test failed. Request history contained only `projects` and `open`; no close was sent. The remembered session was `late-session` and status was `Lean 연결됨 · 현재 소스 v1`.

Root added a separate session epoch, invalidated it on context cancellation, and closes a late response from an obsolete epoch. Keeping this distinct from the kernel-check generation avoids cancelling an unrelated source verification. The permanent regression additionally confirms the cancelled status persists, storage is empty, and a subsequent context read opens a fresh session. The auditor reran all 14 editor tests successfully.

## Remaining boundaries checked

- Backend version checks occur before and after the cursor goal request and again before delivering all metadata. A source change discards mixed-version context instead of exposing old goal IDs as current.
- The response binds structured goal IDs to session, source version, and observed cursor position. The editor clears detached context snapshots on edit, replacement, close and cancellation.
- RPC references are released in a `finally` block after plain goal metadata is extracted. Duplicate occurrences are retained in the release list, consistent with Lean's reference-counted contract in `src/Lean/Server/Rpc/Basic.lean`: each received occurrence requires a release. An expired RPC session reconnects once.
- Empty goals are labelled as the cursor's state, separate from whole-theorem verification. The tree navigation is explicitly to the observed source position; it does not claim that position is the definition of every branch.
- Context waits use a bounded overall budget and query lock. The whole-file diagnostics wait is limited to one second, so an early cursor can respond while later source remains elaborating.
- Frontend late responses cannot restore a cancelled context snapshot. Closing an established session terminates its actual Lean process group.

No additional actionable correctness finding was identified in these reviewed R04 paths. This is not a claim that R04 alone implements every typed graph feature or every future goal-action workflow.

## Independent validation

`node --test glean/prototype/web/lean-editor.test.mjs glean/prototype/web/proof-review.test.mjs glean/prototype/web/graph-runner.test.mjs`: 22/22 passed (14 editor, 6 Watch/Inspector, 2 graph runner).

`python3 -m unittest glean.tests.prototype.test_lean_lsp.LeanSourceBoundaryTests glean.tests.prototype.test_lean_lsp.ActualLeanSessionTests.test_actual_structured_branches_track_local_scope_and_completion`: 13/13 passed in 2.378 seconds. The actual Lean test checks two branches with distinct local hypotheses/IDs, then one branch, then no open goals, followed by stale-version rejection.

The auditor deliberately did not duplicate the large π run. Root's separate full R04 suite log is `work/grasshopper-implementation/r04-python-final.log` (reported 17/17, including π and early-cursor behavior). This audit's independent evidence is the smaller test set above and the before/after cancellation reproduction.

## Follow-up: cancellation between partial-diagnostics polls

Root retained the context cancellation button while `diagnosticsComplete` is false, including the interval between polls. The auditor reran the updated editor suite: 15/15 passed. The new regression confirms the partial result keeps the button visible, cancellation closes the session, and the button then hides. This preserves user control while later source continues elaborating after the cursor goal has already appeared.
