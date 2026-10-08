# Independent Cases and public port boundary audit

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

2026-10-08. Root requested concrete H04/B05 controls through current presentation and editor paths. Agent 3 owns these probes; no product edits or browser interaction.

`design-audit-scope-boundaries-probe.py` creates complete typed graph fixtures. Its Cases fixture proves `P ∨ Q` by two Or branches using each branch's own local witness. Its parent fixture passes Nat 3 through a shared public identity and proves `3 = 3`. Both currently compile as ready.

Five negative compiler controls reject without mutating their inputs: left witness wired into the right sibling; root input referring to the branch witness; outer node wired to an inner child by plain ID or qualified path; and qualified inner child wired directly outward. `design-audit-scope-boundaries-compiler-results.json` preserves the exact scope diagnostics. Compiler readiness is not trusted Lean verification; the two actual positive runs now pass strict verification, independent kernel replay and axioms `[]` (`design-audit-scope-boundaries-actual-results.json`).

The real typed-editor DOM callback harness independently starts a pending left-branch wire, navigates to the right branch, and clicks a right input. The original right witness wire ID remains; the left witness is absent from the rendered branch. It also starts a pending root wire, opens a parent's internal graph, and clicks an internal input. The existing internal public-input wire ID remains and the root source is absent. Both preserve semantic identity.

Presentation controls atomically reject containers spanning sibling branches or parent/inner bodies. A malformed imported foreign membership produces a warning, preserves the original presentation for recovery, and removes that membership. A valid parent visual capsule exposes only `parent.x` and `parent.out`; original edge endpoints remain the parent, without substituting its internal child.

The harness additionally executes actual grouping/hiding callbacks within the right branch and groups the root parent. Their resulting exported documents are preserved as `design-audit-cases-boundary-after-presentation.json` and `design-audit-parent-boundary-after-presentation.json`. Compiling their actual semantic graphs produces code byte-identical to the original fixtures (`design-audit-scope-boundaries-code-comparison.json`); no semantic graph, proof endpoint or generated source is changed by those visual operations.

Evidence: `design-audit-scope-boundaries-ui-results.json`, the two executable probes, complete before/after fixtures, and compiler/code-comparison results. Native browser acceptance and the final clean build remain distinct root-owned gates.

## M12: branch-local actual metadata lost after long-body optimization (fixed)

The same trusted Cases result is valid and has a correct root type, but its `typedNodeTypes`, `typedNodeUsage` and `typedPortTypes` omit `root/split/left/left_proof/out` and `root/split/right/right_proof/out`. Compiler metadata and generated branch lets contain these two outputs. The optimization opening only lambda binders for every `glean_component_` helper also skipped compiler-generated branch graph lets. This is an observed metadata regression, not a kernel or branch scope acceptance failure. Agent 1/root received exact actual evidence and a bounded generated-binding opening recommendation. The current known-bindings implementation passes an independent actual retest: strict valid/kernelAccepted, both branch output types/usage and all six input port types present, 23.275 seconds. Evidence: design-audit-cases-metadata-retest.json.
