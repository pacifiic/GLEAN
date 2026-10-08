# GLEAN v3 initial design audit

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

2026-10-07. Read-only architecture review before implementation. These are concrete acceptance constraints for the proposed extension, **not claims that the bounded v1/v2 compiler already has these defects**. No product files were changed. Reviewed GLEAN.md, PROTOCOL.md, MODULES.md, graph.py, graph_scope.py, server.py, source_check.py, lean_policy.py, lean_lsp.py, document.mjs, history.mjs and lean-editor.mjs.

The implementer's direction is appropriate: retain v1/v2, add a Lean-backed v3, use explicit typed ports and scopes, query actual Lean for declaration signatures/compatibility, and keep verification on the existing independent kernel/axiom audit path. No replacement architecture is needed.

## P0 — Keep unrestricted Lean nodes outside the old stdout trust boundary

Current boundary: `server.py:52` checks bounded graph output and lines 77–81 accept successful execution plus an exact no-axioms stdout line. This works only because v1/v2 never interpolate arbitrary Lean. `source_check.py:75` instead replays serialized declarations through the kernel and then independently traverses the target's axioms.

Trigger: a v3 LeanScript contains `sorry`, a custom axiom, or an environment mutation, and also prints a fake successful `#print axioms` message. Sending this to the old graph checker could elevate untrusted stdout to proof evidence.

Required behavior: route the complete v3 target through `SourceCheckService`, not the old regex gate. Keep the fixed generated target name and source hash. A node's type inspection/pretty-printing output is metadata, never verification. The existing tests for fake stdout, custom axioms, `sorryAx`, and `doCheck := false` environment hacking are suitable regression cases for the v3 route too.

This does not change the raw-source developer execution model into an OS sandbox. Lean metaprograms may execute locally as they already do; do not invent a new unrelated approval flow.

## P0 — Audit the intended target signature, not only its name

The current raw-source checker confirms that a local theorem with the requested name survived independent kernel replay. It intentionally does not compare that theorem with a separately claimed graph goal. That is adequate for raw-source mode, where the theorem statement is in the source the user is editing.

For v3, an arbitrary LeanScript fragment must not be able to escape its term context and replace the generated target with a different valid proposition. A true theorem with the expected name is still the wrong result if the graph goal was `False`. The acceptance route must bind the independently audited target type to the graph's intended full signature, including explicit binders and dependencies. Ask the implementer to specify complete Lean term parsing/full-consumption boundaries and the independent expected-signature check before accepting v3 verification. Plain string wrapping and user-emitted `#check` output are not sufficient evidence.

## P0 — Scope belongs to binder identity, not its displayed name

Trigger: two case branches both display `h : P`, or an existential witness `n` is wired into a node outside the branch that introduced it. Identical names/types do not make local constants interchangeable.

Required behavior: ports retain stable binder identity, scope ancestry, and branch identity. A case join must actually generate Lean branch abstractions/recursor application that discharges every branch. Neither copying the textual context nor marking child nodes complete proves the parent.

Actual Lean 4.34.1 probe:

```lean
def escaped (h : ∃ n : Nat, n = n) : Nat := by
  cases h with
  | intro n hn => exact n
```

Rejected: motive has sort `Type 1` where elimination requires `Prop`. The corresponding theorem returning `∃ n : Nat, n = n` with `exact ⟨n, hn⟩` succeeds. Therefore an `Exists` decomposition cannot always expose an unrestricted data output. A scoped witness is appropriate; explicit `Classical.choose` is a different operation whose axiom dependencies remain visible.

## P0 — Dependent input compatibility must be re-elaborated after substitution

Trigger: a component expects `(n : Nat)` then `(i : Fin n)`; changing `n` leaves the old green wire or old displayed type in place. Another trigger is silently treating an unresolved metavariable as a proven compatible type.

Required behavior: read Lean's binder information and instantiate later types using earlier arguments in order. Track explicit, implicit, strict-implicit, and instance arguments. Changing an earlier input invalidates the downstream elaboration/version. Names and pretty-printed type strings cannot decide compatibility. Inference with temporary holes is useful for editing, but cannot give a verified complete graph.

Actual Lean 4.34.1 probe: `def bad : Fin 3 := ⟨3, by decide⟩` is rejected because `3 < 3` is false.

## P0 — Multiple outputs need a real Lean result type and elimination rule

Trigger: replacing every multi-output result by conjunction, including data values, or flattening dependent outputs into independent fields.

Required behavior: proof conjunction uses `And`; ordinary products use `Prod`; dependent pairs/structures may require `Sigma` or a structure; `Subtype`/existentials bring evidence and elimination restrictions. An output is a checked projection or branch-bound result, not just a labeled socket. The final verification target remains a theorem even when intermediate components compute data; successful elaboration of a `def` alone is not a proved proposition.

## P1 — RPC goal handles must not outlive the source snapshot

Current `lean_lsp.py:454` asks plain-goal endpoints, and `extract_declarations` at line 99 is explicitly a conservative source index. Neither is a structured proof dependency graph.

Required behavior for structured RPC: bind MVarId/local-context/RPC references to `(sessionId, version, sourceHash)` and cursor/source range. Reopen/recompute after session expiration. Do not restore ephemeral RPC IDs as usable graph data after JSON import or browser refresh. Persist declarative graph/source intent instead. An empty goal array may mean outside a proof, failed elaboration, or closed local goals; it is not a global verification signal.

Test stale query replies after edit, deleted branch, project switch, undo, and session expiry. Unicode locations need the existing distinction: LSP positions are zero-based UTF-16; displayed CLI diagnostics are one-based. Source maps must retain node, scope, and output identity when several nodes share names or one Lean declaration has several outputs.

## P1 — Exact natural-number literals must remain exact through every UI path

Actual probes:

- JavaScript: `Number('9007199254740993') === Number('9007199254740992')` is `true`.
- Lean 4.34.1: `example : (9007199254740993 : Nat) ≠ 9007199254740992 := by decide` succeeds.

Required behavior: persist a validated decimal string, including through form controls, drafts, history, cloning, batches, exports and import migration. Avoid `Number`, `parseInt`, `valueAsNumber`, or JSON numeric values for exactNat. If BigInt is used internally, convert explicitly at serialization boundaries. Reject fractional/negative/invalid/over-limit literals visibly instead of rounding or truncating.

## P1 — Batch and calc must generate typed obligations rather than cosmetic connections

For Map/Zip/Product, preserve explicit cardinality and branch paths; unequal Zip inputs must have a documented visible error, not JavaScript's common shortest-list truncation. Bound expanded output size before building a Cartesian product. A Boolean data filter is not a proof of a proposition, and a branch-local context is not an arbitrary list that can be broadcast or flattened.

For calc, each step needs a real expression/relation and checked justification; changing relation/direction or inserting a step invalidates all dependent links. Emit and check Lean's relation/transitivity obligations. Matching displayed endpoint strings is not a proof. Start with the relations actually supported in the implementation contract and show unsupported combinations as errors.

## P1 — Expand validation and semantic caching together with v3

Current touchpoints are `graph.py:186`, `graph_scope.py:9`, `document.mjs:3`, and `history.mjs:19`. They assume the v1/v2 single-goal/module shape. `semanticScope` deliberately discards `version` and groups because those versions share a semantics and groups are visual.

Required behavior: preserve the old path, add explicit v3 schema validation across server, client import, draft recovery, history and export, and include all new proof-relevant fields in the semantic cache key: graph language version, project/imports, axiom policy, scripts/declaration references, exact literals, binder scopes, signatures, selected outputs and batch/calc settings. Only actual presentation metadata may be excluded. A scope/tree edit is semantic; a viewport move is not. Validate structural cycles and illegal scope edges even when outside the selected goal.

## P2 — Keep metadata lookup and recomputation bounded

Current limits include two source jobs, two persistent LSP sessions, a 120-second source deadline, fixed project profiles, and 128 KiB source input. New call-node introspection should use a bounded batch/session rather than launching one unrestricted Lean process per socket. Whole-graph or Cartesian expansion must not bypass existing source/output limits. Cancelling or superseding a graph request must release or invalidate its query handles and prevent a late verified response from recoloring a newer graph.

## Audit checks to request with the first changed batch

1. v1/v2 regression suite and one unchanged existing example still verifies.
2. An injected fragment cannot change the intended target signature while preserving its generated name; reject command breakout or fail the independent expected-signature check.
3. v3 correct small script verifies; custom axiom plus fake stdout remains invalid; `sorry` is incomplete.
4. `Fin n` input change causes downstream mismatch; unresolved placeholders cannot count as proof.
5. Sibling/existential witness scope escape rejected; every case branch needed by the final target is checked.
6. Multi-output data/proof distinction and projection identity survive JSON save/load.
7. ExactNat 9007199254740993 survives edit, draft, undo and export without becoming 9007199254740992.
8. Stale RPC/type/check response after edit, undo or project change is ignored.
9. Explicit unequal Zip/calc invalid step cannot appear complete.

The subsequent design/code audit should run against the actual proposed v3 contract and changed files. These checks do not expand the requested feature scope.

## Proposal follow-up and observed context regression

Agent 1 subsequently specified v3 `projectId/imports`, explicit root/node typed inputs and outputs, `scopeId` ancestry, named output edges, stable generated binder identifiers, Lean term parsing to EOF for scripts/types, and an independent expected telescope/goal comparison in the source auditor. These decisions address the initial verification-boundary objections. Review the implementation, not only the proposal, against those promises.

The remaining alias question is concrete: user-written bodies such as `n + 0` and dependent types such as `Fin n` must resolve to the intended stable input IDs. Use a controlled Lean local context/parsed syntax, or an explicit supported binding convention; never textual identifier substitution or silently inferred free variables. Reordering/renaming a signature must re-elaborate its body and all calls. Reject ambiguous duplicate locals and undocumented captures.

### P1 — The required π context workflow exceeds the current LSP request budget

Root reproduced two timeouts with the current 30-second `LeanSessionManager.context` budget. The unchanged π source then returned diagnostics `[]` and the expected `⊢ False` in **68.85 seconds** with a 120-second bounded request budget (open took 4.44 seconds). Root evidence: `work/grasshopper-implementation/pi-context-baseline.json`. This is a measured baseline regression for the required realistic source workflow, not a speculative performance concern; no extra download or compiler rebuild is needed.

At `lean_lsp.py:451` the current context path first waits for whole-file diagnostics. The R04 implementation should keep a bounded longer budget/progress/cancellation path and investigate obtaining an early cursor's available snapshot without forcing full-file completion. Do not present a timeout or not-yet-elaborated state as zero remaining goals. Closure requires the original π workflow and an edited stale-request negative case, using actual LSP results.

Root also exercised `Lean.Widget.getInteractiveGoals`: a conjunction proof yielded real mvar/fvar identities and goal counts `1 → 2 → 1 → 0`. The RPC session's retained references are version-bound resources; the reported current protocol uses keepalive/expiry, so reconnect and reference release need explicit lifecycle handling. Evidence: `work/grasshopper-implementation/structured-rpc-probe.json`.
