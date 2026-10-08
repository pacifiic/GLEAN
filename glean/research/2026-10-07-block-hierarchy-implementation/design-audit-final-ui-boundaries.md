# Final source-view and clipboard boundary audit

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

2026-10-08. Agent 3 owns the independent design/code audit; Agent 1 owns product edits, Agent 2 owns requirements acceptance, and root owns native UI, final clean build and the complete relevant suite. This report describes controlled DOM callbacks and stored genuine Lean observations explicitly. No new Lean job was used for these UI controls.

## Clipboard identity repair independently passes

The first typed document could be opened without a review ID; `app.js` assigned a controller review ID only afterward. Clipboard copy therefore used the editor's numeric document token, whereas the same document's Undo snapshot used the controller ID. Paste then incorrectly rejected the same document. Initial actual editor callbacks and the controller code order are recorded in `design-audit-copy-ui-results.json`.

The repair initializes document identity before editor open. `design-audit-copy-controller-probe.mjs` executes the actual `app.js` `loadDocument`, `currentDocument` and `navigateHistory` functions with the real typed editor and `DocumentHistory`. The first editor/controller IDs match; Undo keeps the same ID; paste increases two nodes to three; a newly opened document has a distinct ID and rejects the old clipboard atomically. Evidence: `design-audit-copy-controller-retest.json`.

Copy alone preserves semantic identity and the verified Inspector snapshot without a verification status callback. Copying a whole Cases component allocates fresh component/branch/internal node/edge IDs, retains branch binder references, and reconnects every internal endpoint within its copied branch. Cross-scope paste rejects without mutation. The copied graph passes current compiler assembly (`ready`), not a newly executed independent Lean kernel check. Evidence: `design-audit-copy-ui-results.json`, `design-audit-copied-cases-fixture.json`.

## Source provenance and cancellation repair independently pass

`design-audit-source-view-lifecycle-probe.mjs` uses the actual source analysis component. It renders the stored genuine current-command adapter result for namespace/private/macro/partial-error controls. The separate installed declaration transport is controlled for callback identity testing; the π baseline and uploaded `sorry` observation remain distinct.

Saved analysis shows an explicit historical summary, local dependency buttons say stored analysis, current source jump buttons are disabled, and direct expansion marks source correspondence unknown. Source relations remain names from the analysis; their graph contains no editable proof wires. Delayed index start/poll and installed lookup success do not populate a newer document. An old index response after an invalid UTF-8 document load is cancelled and leaves analysis disabled. Evidence: `design-audit-source-view-lifecycle-retest.json`.

A cached analysis initially had no current identity. A lookup started from it, followed by a source edit, could display a late failure over the new status; success already checked document identity. Cached analysis now retains current source/project/file identity and the catch path checks it. The same control now preserves the current correspondence-unknown status and never displays the obsolete failure.

## Optional metadata corruption controls

Two additional optional metadata boundary failures were reported to Agent 1 for the final recovery batch. A valid Lean document with `analysisCache.imports: 42` passes document validation but initially throws a non-iterable TypeError in `loadCache`. Separately, `sourceFileView: "broken"` or an outer wrapper with version 99 initially produces neither a warning nor a preserved original; the latter even applies its inner hidden state. An invalid inner presentation is already diagnosed and preserved. Evidence: `design-audit-source-view-cache-corruption-results.json`, `design-audit-source-view-wrapper-results.json`.

Both recovery repairs now pass the same actual callback controls. Invalid imports leave a safe visible file, a persistent warning, and the exact original source/cache in the document without a load exception. Invalid outer view wrappers return default visibility with warnings and exact originals in nested recovery; a subsequent Hide edit retains that original. The source/card/cache callback evidence and product hashes are in `design-audit-source-view-lifecycle-retest.json`.

Agent 2 additionally requested `0`, `false` and `null` outer wrappers. The actual source analysis component diagnoses and stores all three exactly, but the app recovery-download listener initially used a truthiness check and emitted no file for them. The listener now checks whether the recovery property exists. Actual callback retests emit one exact JSON file for each `0`, `false`, `null` and string original, both at the top level and nested source-view location; absent recovery emits no file. Initial and repaired evidence: `design-audit-falsy-source-recovery-results.json`, `design-audit-falsy-source-recovery-retest.json`.

The related `source-view`, `source-analysis` and `proof-review` Node suites pass all 19 tests after the schema/identity repairs. These are recovery/UI controls, not accepted kernel results or the complete root build/test gate.

## Scoped signoff

All defects reported by Agent 3 in this implementation loop have repaired positive and negative controls. The final source/cache/recovery and clipboard controls above are closed. No new Lean process remains running. Frozen deferred requirements and root's native UI/build/full-suite acceptance remain separate; this report does not promote an unimplemented P2/P3 capability into a completed feature.

The complete metadata owner spoofing issue is separately closed by a genuine independent strict kernel retest in `design-audit-long-metadata.md`; source bytes, exact body locations, occurrence/isolation and Cases/public-parent controls are recorded in the earlier scoped design reports. Root's final build/test gate is not replaced by these probes.
