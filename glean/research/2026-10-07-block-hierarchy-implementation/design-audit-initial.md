# Block hierarchy and source import: independent design audit

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

2026-10-08. Agent 3 reviews the user's continuing three-agent implementation loop against `2026-10-07-block-hierarchy-import/PLAN.md` and the frozen 37-row requirements. Applicable `AGENTS.md` was read. Agent 1 owns product edits, Agent 2 owns requirements/corruption/size-path checks, root owns browser acceptance. This auditor edits only research probes/reports; no product changes or commits.

## Baseline and regression boundaries

The original baseline shows node position changes leave semantic identity unchanged, while newly added outer presentation and node hidden flags initially changed it. The first product batch now uses an explicit semantic document adapter; the exact independent baseline rerun confirms those presentation changes are excluded and a proof-body change still changes identity. Original and repair results remain separate (`design-audit-baseline-results.json`, `design-audit-baseline-retest.json`). Runtime isolation/navigation and analysis cache must stay outside proof identity, while source/project/import/policy and real graph endpoints remain inside it.

Scope, shared definition, call occurrence, and visual container are different identities. Definition-wide generic types must not appear as substituted call A/B types without actual Lean evidence. Isolation needs one transient stack per occurrence/scope, and persistent manual views also need occurrence identity. Nested grouping must preserve actual edges and reject Cases sibling or public-boundary bypasses. Merely dimming unrelated blocks does not satisfy isolation.

Agent 2 independently owns full-path 64 KiB/1 MiB limits and legacy v1/v2/v3 migration tests. Long-body acceptance must cover escaped JSON, generated wrapper source, source checking/LSP, save/recovery/history, sharing across calls, cancellation, and exact body diagnostics. Raising only the textarea or one server limit is insufficient.

## Confirmed first model findings

1. **Shared manual hide in call A/B (fixed in model, UI integration pending).** Initial per-occurrence runtime keys did not separate the shared module presentation. The repaired `occurrenceView` now clones the definition view per call. Independent retest hides B in call A only, keeps call B and the generic definition visible, and preserves the correct A view after JSON reload.
2. **Manual Hide leaves a diagnostic ancestor expanded (fixed).** Revealing B inside collapsed group g then hiding B removed the temporary node but retained g's temporary expansion, exposing sibling C. Retest restores an empty expansion override and the collapsed group boundary.
3. **Empty imported group creates nonfinite parent positions (fixed; Agent 2 also owns this regression).** Grouping an empty valid container produced Infinity, serialized as null. The repair rejects the operation atomically before mutation.
4. **Ignored script metadata crashes presentation traversal (fixed).** A document accepted by `validateDocument` with `branches:42` on a script node caused an iterable exception. `scopeIndex` now follows actual Cases branches only; the same accepted original document no longer crashes.
5. **Existing occurrence key ignores the requested scope/trail (fixed).** An imported key `callA` pointing to a valid call B trail originally passed normalization without warnings/recovery, and requesting A returned B's hidden view. The product now binds canonical occurrence keys to the same scope/trail. Independent retest quarantines a canonical key A / trail B mismatch with the original preserved, leaves A's view empty, and rejects a mismatched live entry. Evidence: `design-audit-occurrence-mismatch-results.json` and `design-audit-occurrence-mismatch-retest.json`.
6. **Boundary socket IDs collide for legal endpoint IDs (fixed).** A complete typed graph accepted by `validateDocument` uses node `A:x` with input `y` and node `A` with input `x:y`. Both container boundary sockets become `in:A:x:y`; both projected edges attach to the same socket despite different original targets. The repaired proxy identity uses JSON endpoint tuples. The same validated graph now yields two distinct socket IDs and each projected edge retains its original target/input. Evidence: `design-audit-port-identity-results.json`, `design-audit-port-identity-retest.json`, and its executable probe. This is a visual endpoint error; the stored original proof graph is unchanged.

Initial four reproductions and repaired outputs are in `design-audit-presentation-results.json` and `design-audit-presentation-retest.json`. The independent related presentation/history suites pass 23/23 at this repair point. These are model experiments, not browser acceptance.

UI integration review also identified two concrete shape/priority boundaries for the next stable batch: actual Lean diagnostics often use `graphLocation` without nodeId, while the new outside-error counter currently reads nodeId only; and the fullscreen document capture handler consumes Escape before pending-wire/menu/editor cancellation handlers can run. Agent 1 is coordinating those repairs. Native UI confirmation remains root's responsibility.

## Actual body diagnostics and raw bytes

`design-audit-body-diagnostic-probe.py` runs actual GraphCheckService/Lean elaboration with a four-line proof whose final line has `exact (0 : Nat)` for True. Lean correctly rejects it, but the API reports only generated wrapper line 29, column 15, plus `root/proof`; no body-local fourth-line location exists. `_header` rewrites every parsed syntax node to the string token head location. This baseline establishes the B03 exact line/column gate; it does not claim that the planned editor has already been implemented or failed. Evidence: `design-audit-body-diagnostic-baseline.json`.

The current Blob.text → parseDocument path strips a UTF-8 BOM (53 bytes become 50), preserves CRLF in the string, has no raw snapshot, and silently accepts malformed UTF-8 after replacement with U+FFFD. A source-byte snapshot and explicit strict decode path are necessary for I08. These are documented existing baseline gaps, not claims about a future byte-preservation batch.

## P1 actual current-file command adapter PoC

The standalone `design-audit-command-adapter.lean` successfully analyzes `design-audit-command-fixture.lean` through actual Lean 4.34.1 command state. It initializes the search path and initializer execution, parses/processes the original header, processes the original commands, and queries the resulting environment with:

- `env.getLocalConstantInfos` for actual current-file full names/kinds, including generated/private declarations;
- `findDeclarationRanges?` for actual source ranges;
- `Meta.ppExpr` for actual types, retaining section dependencies;
- `ConstantInfo.getUsedConstantsAsSet` for direct constants used by the actual elaborated declaration.

The real output contains `_private.GleanAuditSource.0.Scoped.hidden` at line 10, macro-generated `Scoped.generated` at line 13, `Scoped.from_hidden` with its forall n signature and private helper dependency, an anonymous instance/helper, and `Scoped.valid_after_error` after an intentionally broken definition. That broken definition has a sorryAx dependency, and the file retains its actual type-error diagnostic at line 17. Missing helper ranges remain null. The result explicitly says verified false and hasErrors true: partial declaration analysis is distinct from independent proof checking.

Command: `lake env lean --run .../design-audit-command-adapter.lean .../design-audit-command-fixture.lean .../design-audit-command-adapter-results.json`, executed in the pinned glean project. The actual result is preserved in `design-audit-command-adapter-results.json`. Initial harness compile/setup mistakes were repaired before the successful run; this is a research PoC, not a production adapter or installed declaration query.

For product use, bind metadata to original source bytes/text hash, filename, project/toolchain/environment, adapter version, and request/session generation; retain partial/unavailable ranges explicitly. Handle cancellation and source/environment replacement, separate generated parser/macro helpers from user-facing declarations, and keep uploaded declaration exploration distinct from environment-call eligibility. This PoC establishes a viable actual-data path; P1 acceptance still requires product integration, adversarial source cases, original-source preservation, and scale measurements.

## Current limits of this audit

No full build, all-37 acceptance, production P1 adapter, long-code editor, or browser success is claimed. Root must run the required final build/integration suites and native browser acceptance after implementation stabilizes. This auditor continues each stable implementation batch and independently retests reported defects.
