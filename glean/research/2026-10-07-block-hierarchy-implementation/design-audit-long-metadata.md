# Long proof metadata audit

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

2026-10-08. Agent 3 reviewed the generated auditor read-only while Agent 2/Agent 1 owned actual long-body jobs. This report does not claim an independent long-body product success or a stack trace that was not recorded.

## Trust boundary retained

The source service compiles the user's generated module and independently generated expected signature. The auditor reads serialized declarations, replays them into the Lean kernel, replays the expected-signature declaration and checks the actual target type against that expected signature. It traverses actual target axioms and applies the selected policy. Optional component metadata only inspects safe, nonpartial constants found in the replayed kernel environment. Nonce-bound structured results, rather than arbitrary Lean stdout, carry acceptance. No accepted fix may disable kernel replay, weaken the expected signature or skip axiom policy.

## Observed original long failure and bounded normalization

Agent 2's original 64 KiB/1 MiB valid bodies elaborated but the product auditor failed with maximum recursion depth. The original metadata normalizer repeatedly returned `Meta.TransformStep.visit` for each let/helper head; Lean's transform `visit` adds recursion depth at every step. Thousand-let user proofs therefore exhausted Meta depth while standalone Lean verification succeeded. This code path was the concrete likely cause, not an instrumented stack-trace claim.

Agent 1 now reduces metadata head chains iteratively with cancellation/resource checks and a 32768-step bound. Mandatory target kernel/type/axiom checks stay intact. Optional telescope traversal opens compiler graph lets with a manifest and a 512-let bound, instead of opening every arbitrary user `have` in long proof bodies. Agent 1 independently reported the 64 KiB trusted product retest passed; Agent 2/root own the remaining long positive/negative acceptance.

## M12 branch metadata regression fixed

An intermediate blanket lambda-only rule for all `glean_component_` constants skipped legitimate Cases branch graph lets. The actual trusted Cases result was valid but lacked both branch output types, used assumptions and instantiated input port types. Agent 3 reported the exact generated owner/binding evidence.

The current compiler-binding manifest repair passes an independent actual Cases retest in 23.275 seconds: strict verification and kernel acceptance are true with no axioms, left and right outputs are `Or P Q`, their uses are `P,Q,w`, and their own witness types remain `P` and `Q`. No branch-local assumptions cross into siblings or the root. Evidence: `design-audit-cases-metadata-retest.json`.

Complete metadata owner identity remains a separate negative control. User local binders can legally share generated-looking names; a global basename manifest alone must not turn a user's local into another graph node's observed type or use set. The executable `design-audit-metadata-owner-probe.py` checks that case independently and records its actual result.

## M15 owner identity and equivalent JSON order (closed after actual retest)

Two actual controls use legal generated-looking local let names. Root and Cases target proofs both remain valid. The actual Cases metadata contains graph owner `glean_component_2/glean_component_4 : Or P Q` and unrelated user owner `glean_component_3/glean_component_4 : Bool`. A falsely displayed type was not observed in those actual kernel runs.

Replaying the same actual metadata with equivalent object key orders proves the old basename assembly could select either `Bool` or `Or P Q`, even though the keys/values and actual proof are unchanged. The current compiler manifests complete owner/binding keys, the auditor selects those exact keys, and the current GraphCheckService uses them. Both JSON order controls now preserve `Or P Q` and used assumptions `P,Q,w` (`design-audit-metadata-order-results.json`).

The first full-owner repair still used `String.toName` on slash-separated owner/binding keys. Lean treats the slash as an invalid identifier and returns `Name.anonymous`, so distinct manifest and lookup keys collapsed. An independent actual retest observed the unrelated user binding still present in optional raw metadata. Both creation and lookup now use `Name.mkSimple` for the exact opaque key.

The final independent actual product retest passes all controls: strict target verification and independent kernel acceptance succeed with no axioms; both Cases outputs remain `Or P Q` with uses `P,Q,w`; the user owner `glean_component_3/glean_component_4` is absent from raw binding types. Evidence: `design-audit-metadata-owner-cases-retest.json`. This closes M15 without weakening the mandatory kernel, signature or axiom checks. Root still owns the final clean build and complete relevant suite.
