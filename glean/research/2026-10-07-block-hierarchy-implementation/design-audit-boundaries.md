# Independent hierarchy UI boundary audit

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

2026-10-08, Agent 3. This batch runs product modules through an independent DOM callback/model harness. Native browser interaction, final build, full acceptance and the P1 product adapter remain separate release checks.

`design-audit-ui-boundaries-probe.mjs` and `design-audit-ui-boundaries-results.json` preserve these passing controls:

- A genuine previous Lean diagnostic with only `graphLocation:root/proof` counts inside when proof is visible, outside under another target's isolation, and a diagnostic without a known location counts unknown. A manual hide of an outer group classifies its descendant as manually hidden.
- The actual typed editor's pending wire and the actual graph focus controller cooperate: first Escape prevents the event, clears the wire, keeps graph focus and preserves the original edge ID; second Escape exits focus. This is callback integration, not native fullscreen acceptance.
- A nested shared definition has occurrences A→M→N and B→M→N. Hiding N's leaf in A leaves the same leaf visible in B and the generic N view. The semantic document is byte-identical through these presentation operations.

Related current presentation, visibility, focus and typed-editor suites pass 48/48. The previous four model reproductions were adapted to canonical occurrence keys and re-executed; `design-audit-presentation-canonical-retest.json` retains the expected repairs. The legal colon endpoint collision also passes independent retest: JSON tuples give two distinct boundary sockets and retain each original edge target/input (`design-audit-port-identity-retest.json`).

## P1 same-name source origin adversary

`design-audit-uploaded-pi-sorry.lean` keeps the original π theorem name/type and replaces only its final proof with `by sorry`. The actual command-state adapter reports `irrational_pi : Irrational Real.pi`, no error severity diagnostics, a sorry warning, and a direct `sorryAx` dependency. Its explicit `verified:false` remains essential: successful partial declaration analysis does not establish the uploaded proof's completeness or trusted verification.

`design-audit-pi-origin-comparison.json` binds the uploaded variant to its bytes and compares it with the original and currently installed file bytes. The installed file is identical to the prior genuine baseline source, whose preserved actual Lean runs and axiom output show `[propext, Classical.choice, Quot.sound]` without `sorryAx`. A current installed declaration lookup hit its configured 45-second timeout; it was not retried, and no additional π kernel job was run. The comparison therefore cites the prior actual baseline evidence rather than claiming a fresh successful lookup.

The product gate remains open until its source-card path is available: a same-fullname installed reference must visibly identify its installed environment origin and must not label the different uploaded body verified or callable solely through name equality. Uploaded declaration metadata must bind its source/project/environment/adapter/request identity and retain warning/error/incomplete state separately. This batch demonstrates the adversary and does not claim that a not-yet-integrated P1 path failed or passed.

## M07: restoring a removed semantic scope retains an invalid occurrence (fixed)

The actual typed editor reproduces this path: open module occurrence A→M, save `presentation()`, open a prior graph without A/M, then call `restorePresentation(previous)` as app history navigation does. Its catch resets `path` to root but leaves A→M in `callTrail`. Rendering creates a persistent root occurrence view for the removed call and retains a caption identifying the missing M call. Re-running `normalizePresentation(current())` now reports a mismatched call exploration state. Evidence: `design-audit-ui-boundaries-second-results.json`, `missingScopeRestore`.

The repair must validate the scope and complete occurrence trail against the restored graph before using them, and fall back atomically to a clean root view when the scope has disappeared. This is separate from Agent 2's active-isolation Undo/session persistence audit. The repaired implementation validates every call step and falls back with clean path/trail/navigation/code target. Independent retest of removed A/M and A.ref changing M→N now has root path/trail, no invalid occurrence entries, and no normalization warnings (`design-audit-ui-boundaries-restoration-retest.json`).

## M08: creating a parent commits documents beyond import limits (fixed)

`design-audit-parent-limits-probe.mjs` executes the real `+ 코드 부모` callback. Its complete source fixtures pass `validateDocument` before the action. A 32-module fixture becomes 33 modules; a 254-node fixture becomes 257 total nodes after the new definition's two children and root call. Both changes invoke `onChange` and the resulting current document fails `validateDocument`. Evidence: `design-audit-parent-limits-results.json`.

Creation must check the complete document's module/node/edge additions before mutating it. A rejected operation must retain the previous document, body, navigation and history. This is a persistence/recovery integrity defect, separate from raising code-body byte limits. Agent 1 repaired pre-mutation counts across all semantic scopes. Independent code/graph parent controls reject the 32-module, 254-node and 512-edge starting fixtures without changing document/view or invoking onChange; immediately below each boundary, creation succeeds with one commit and valid totals. Twelve controls pass (`design-audit-parent-limits-retest.json`), and current related presentation/typed-editor suites pass 36/36.

## M09: recovery accepts disconnected or wrong-final-scope occurrences (fixed)

The new `validateIsolation` path validates individual call nodes and refs but initially omits their consecutive relationship and the final displayed scope. `design-audit-isolation-occurrence-results.json` shows valid A→M→N and direct B→N controls accepted, while scope M with trail B→N and trail root/A→M followed by root/B→N are also wrongly accepted. All involved nodes individually exist; the complete call occurrence does not.

This is a recovery data validation defect. The forged canonical key differs from normal UI occurrence keys, so this auditor does not claim that it changes a valid proof or demonstrate A/B leakage. The same relationship constraints already required by document presentation and history restore should apply to recovery before offering a valid resumable session. Agent 3 coordinates this trail-only probe with Agent 2's separate session/viewport/Undo audit and sent it to Agent 1/root.

Independent M09 retest accepts both valid direct/nested occurrences and rejects both disconnected/wrong-final-scope controls (`design-audit-isolation-occurrence-retest.json`). Related isolation-recovery tests pass 2/2 at this point.

## M11: selected node set lost on normal view restoration (fixed)

The original editor kept Inspector selected but restored `selectedIds` to an empty set, disabling Hide and Isolate after document restoration. The independent current `design-audit-selection-restore-probe.mjs` now passes single (`zero`) and multi (`n`, `zero`) selections. Both commands remain enabled and Inspector points to `zero`. Evidence: `design-audit-selection-restore-retest.json`.
