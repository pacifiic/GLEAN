# Independent actual body diagnostic audit

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

2026-10-08. Agent 3 ran four small controls sequentially after Agent 1's backend stability signal. Each used the actual current GraphCheckService and SourceCheckService with the pinned Lean toolchain; all four were rejected with `verified:false`. No π or long-body job was duplicated. Additional Cases/parent trusted controls wait behind Agent 2's long-body queue.

| Control | Actual mapped body position | Evidence |
|---|---|---|
| Four-line `exact (0 : Nat)` for True | L4:C3 | `design-audit-body-type-retest.json` |
| Unterminated final `exact (` | L3:C10 | `design-audit-body-syntax-retest.json` |
| Same parser failure with a trailing newline | L4:C1, EOF on final empty line | `design-audit-body-syntax_eof_newline-retest.json` |
| `exact (let s := "😀"; (0 : Nat))` | L2:C24 in Unicode scalar columns | `design-audit-body-unicode-retest.json` |

Each fragment diagnostic has `graphLocation:root/proof`, `fragmentField:body`, `bodyLine/bodyColumn`, and `columnEncoding:unicode`. The initial baseline reported only the wrapper location. Its proposed term-start column 9 was an anticipated pointer, not an observed Lean diagnostic; the current actual Lean tactic diagnostic correctly points at `exact`, column 3. The astral example points at `(`, whose browser UTF-16 position is column 25 (body selection offset 27), so a frontend may not use scalar column 24 directly as a UTF-16 offset.

Backend location preservation and EOF handling pass these small controls. The frontend exact-code jump, nested ancestor reveal, long-body middle/end navigation and native browser acceptance remain open checks until the UI integration stabilizes.

## M10: mapped body errors were duplicated in global display (fixed)

One underlying Lean type error currently produces a generic source-error fallback plus its precise body diagnostic. The generic entry contributes an additional unknown position. One parser error produces both a wrapper diagnostic and a body diagnostic for the same failure, doubling the outside-error count. The four real result files preserve these duplicates and the original Lean output for comparison.

Proof/kernel/axiom status is unaffected. Display and counts should use one underlying diagnostic identity after precise fragment mapping, while any useful generated-wrapper location may remain secondary metadata. This was sent to Agent 1/root for the pending UI diagnostic batch; Independent replay of all four saved actual Lean outputs through current fragment mapping/merge now produces one precise error per failure and preserves an unrelated wrapper diagnostic (`design-audit-body-diagnostic-merge-retest.json`).

## Current actual-result → code editor retest

`design-audit-body-ui-jump-probe.mjs` sends each of the four actual saved GraphCheckService results through the current typed editor and `jumpDiagnostic`, without fabricating locations. All four reach the exact textarea selection: type error offset 59 (`exact`), parser EOF offsets 42 and 43, and astral Unicode offset 27 (`(0 : Nat)`). The actual editor owns focus, selects the proof/code target, and preserves semantic identity.

A second control places that proof under two collapsed ancestors, manually hides the outer group and isolates another node. The diagnostic temporarily reveals the proof at a readable zoom; returning to the prior isolation restores its viewport and targets. Both collapsed flags, manual Hide, persistent presentation and semantic graph remain unchanged. `design-audit-body-ui-jump-results.json` records these callbacks. Native browser and long-body acceptance remain separate.
