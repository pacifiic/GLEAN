# Independent source file and current command analysis audit

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

2026-10-08. Agent 3 owns these independent code/model/current callback probes. Agent 1 owns product changes; root owns native browser acceptance. No product changes or extra π lookup were made by this audit.

## I08 exact original bytes

`design-audit-source-bytes-probe.mjs` executes the real app's import listener, `loadDocument`, `currentDocument`, file-block render/open/back and save/export handlers. It uses the actual Lean editor with controlled transport, and real DraftStore/DocumentHistory; it does not run a Lean process. `RawPreserved.lean` contains a BOM, CRLF and astral Unicode. Its 152 bytes retain SHA-256 `60f03bdd58ac43f7cac5a480880cdc67e3b1813bbe962cdb8d949414b3b9b92b` through original/current export, JSON re-import, automatic draft recovery and Undo. An edited current source differs while original bytes remain unchanged.

`RawInvalidUtf8.lean` deliberately fails fatal UTF-8 decoding. Its 109 original bytes retain SHA-256 `2404302eff76273fd11c2a4d05c4f5b33ccf44cd1683ca6fd58be47a908b5b3c` through the same recovery/export paths. No replacement-character proof is created. Current product UI explicitly identifies failed decoding and disables source opening, analysis and verification for that empty unreadable source.

Root separately exercised native file selection, open/back, original and current downloads for these fixtures. The root-owned native results are in `ui-source-bytes-results.json` and associated screenshots. The independent callback results are `design-audit-source-bytes-results.json` and the repaired-state `design-audit-source-bytes-retest.json`.

### M13/M14 fixed

The first maximum-size origin control successfully parsed 8 MiB but threw `RangeError: Maximum call stack size exceeded` in repeated Base64 validation. Agent 1 replaced that expression with linear character/length/padding checks. The current 64 KiB, 1 MiB and 8 MiB actual-origin validation controls all pass.

Origin JSON initially accepted a missing SHA, wrong decoded byte count and a false UTF-8 classification. Those malformed metadata controls now reject. A well-formatted but false stored hash is independently recomputed from the actual original bytes; the file block displays the actual SHA and an explicit mismatch warning. It does not require edited current text to equal the original snapshot. The same byte-preserving controls remain valid after the repairs.

## P1 actual command state

The product `DeclarationIndexService` executed the existing independent namespace/private/macro/instance/partial-error fixture in 10.377 seconds. Actual metadata includes the private fullname `_private.GleanUploadedSource.0.Scoped.hidden`, the macro-generated `Scoped.generated`, an anonymous instance, `Scoped.valid_after_error` after a real type error, and a direct `sorryAx` dependency for the invalid declaration. Current-file direct references are actual elaborated names, and source SHA and UTF-16 ranges match the source. The `from_macro` declaration begins on source line 15; the audit's initial expected line 16 was corrected against the actual original text, without rerunning Lean or treating the expectation mistake as a product defect.

The product result is `analyzed`, `verified:false`, `kernelAccepted:false`. Analysis supplies names, types, ranges and direct dependencies; it never grants proof verification. Evidence: `design-audit-command-product-retest.json`, `design-audit-command-product-checks.json`. Agent 2 separately owns the actual 1000-declaration manifest/scale control and confirmed the current `imports`/`dependencyModules` schema from that actual result.

## Uploaded proof versus installed declaration

The genuine prior command-state observation of the uploaded π file with its last proof replaced by `sorry` is reused in `design-audit-source-analysis-ui-probe.mjs` to test the current UI. The installed record in that harness is deliberately controlled data: it verifies UI attribution/routing, not a new installed or uploaded proof. Prior genuine baseline π verification is separately recorded in `design-audit-pi-origin-comparison.json`; no new expensive π query was run.

The current UI explicitly calls the uploaded declaration current-file analysis and unverified, and labels a same-fullname installed record as a separate source whose existence is not evidence for the uploaded body. The installed-reference callback receives the installed record without attaching the uploaded source. Historical saved analysis requires fresh analysis for current attribution.

The initial installed lookup sent no imports. Agent 1 added actual command-state header imports and direct-dependency owning modules. The current UI's same-name visible import control and owning-module dependency control send their respective imports to the declaration API. The callback probe checks those exact request bodies. `design-audit-source-analysis-ui-retest.json` preserves the controls and explicitly marks the controlled installed/module records.

Late start, poll and installed lookup results are independently delayed across filename/source/project changes. They create no stale declaration cards or installed panels, do not save old analysis to the new source, cancel the old job and leave the run button usable. These are current UI callback checks; root-owned native acceptance and the final clean build remain separate gates.
