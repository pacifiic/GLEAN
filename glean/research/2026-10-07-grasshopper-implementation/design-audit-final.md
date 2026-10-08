# Latest implementation design and code audit

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

2026-10-07. Agent 3 independent audit continuing the user's three-agent repair loop. This report is incremental: “final” identifies the current integration review, not a claim that all 15 requirements have passed. Product files belong to Agent 1. Root performs browser acceptance, Agent 2 owns the frozen requirement matrix, and this auditor owns the reproductions and findings below.

Applicable repository instructions were read in `AGENTS.md`; the scope is `REQUIREMENTS.md` and the latest requirements review is `AUDIT-05.md`. No product files, Git commits, or pushes were made by this auditor.

## Closed lifecycle findings

The five original U4 reproductions were rerun after repair: imported malformed provenance, a pending wire across document replacement, DOM-only output deletion, preview delivery after mode change, and a late lookup failure after replacement. All original failures are closed in `design-audit-lifecycle-retest.json`. The independent related JavaScript suites passed 11/11. Details and commands remain in `design-audit-lifecycle.md`.

## F-01 — exact branch port metadata is absent (P2, FIXED)

`design-audit-scope-types-probe.py` runs the actual GraphCheckService → SourceCheckService → independent kernel replay path. The valid Or-elimination graph produced a verified final theorem, with distinct left `hp : P` and right `hq : Q` helper contexts. However, `typedNodeTypes` contains only the root P/Q/h/case outputs. No `root/case/left/hp/out`, `root/case/left/join/out`, or corresponding right branch ports are present.

The compiler only records `inputBindings` for the root and direct module scopes. The previous `lambdaLetTelescope` audit also observes only the outer lambda/let prefix, so nested match-branch let values are omitted. Branch Inspector must obtain actual scoped values/types, or explicitly remain unknown; a declared type must not be relabeled as a Lean-observed type.

The same actual probe verifies the direct Fin module scope and its calls successfully. Its declared abstract parameter type `Fin n` and actual call-site input type `Fin 3` are different contexts. Compatibility cannot be inferred by comparing those unrelated strings. The current backend is being extended to return actual call-site port types.

Evidence: `design-audit-scope-types-results.json`. Agent 1 and root were notified.

## F-02 — multi-output wire selection and source mapping are inconsistent (P2, FIXED)

The actual typed-editor module is executed by `design-audit-output-probe.mjs` with a controlled response containing distinct constructor/left/right source mappings. The harness implements button ancestor matching so output clicks do not spuriously bubble to the node-card selection handler.

Observed:

1. Click Construct.right: output identity is `right`.
2. Click the left outgoing SVG wire: Inspector still reports `right`.
3. Both selections use source lines 2–4 (constructor), even though exact projection mappings exist at lines 6–8 and 10–12.

The SVG wire handler sets `selected` but not `selectedOutput = edge.output`. `inspectionSnapshot` prefers `sourceMap[nodeKey]` and never checks `sourceMap[nodeKey/outputId]`. Set the actual endpoint identity and prefer its precise projection map. The current Watch deduplication has separately been repaired to include output identity.

Evidence: `design-audit-output-results.json`. Agent 1 received the reproduction and a request for a regression test. The product test harness's previous `closest()` implementation always returned null, so its output-identity test could accidentally reset a selected right output to the first output before exercising the purported regression.

## F-03 — new metadata normalization interrupts actual verification (P1, FIXED)

A real source check of a graph containing a valid `True.intro` result and a disconnected `by sorry : False` component failed with:

> uncaught exception: Unknown constant `glean_component_1`

The checker returned `invalid`, no audit, and no output types. This happened after the new `normalizeGraphExpr`/dependency metadata path was introduced. Earlier actual used-hypothesis, Or Cases, and Fin module checks passed before that update. The metadata extension must be retested against zero-input and dependent components after stabilization, preserving the independent kernel/type/axiom checks.

Evidence: `design-audit-disconnected-results.json`. This run does **not** establish that a disconnected unfinished node was accepted or shown green; the operation failed before that suspected display case could be evaluated. Agent 1 and root were notified immediately. A stable repair is awaited before repeating backend jobs.

## Used assumptions and output identity

The actual pre-normalization probe `design-audit-bindings-results.json` verifies a script with explicit P/Q/hp/hq inputs and body `hp`. Lean reports component usage P/hp only; Q/hq are unused. This confirms that copying all graph ancestors is insufficient. Current frontend code now reads `typedNodeUsage` and labels unavailable usage explicitly, but the new normalization must first pass actual backend checks. The root theorem's syntactic helper call passes all four arguments, so helper reduction/dependency tracing must respect the actual function body.

The current `pinWatch` identity includes `outputId`, and a model regression test covers distinct left/right pins on one component. Browser acceptance remains root's responsibility.

## Source bookmarks and environment reuse (original integration findings, FIXED)

The current app keeps a generated graph's `sourceGraphSelection` when opening its generated Lean source. Editing that source does not invalidate the graph mapping; `onContext(null)` is ignored and old observations remain. Adding a bookmark then assigns the current source fingerprint to old graph/source-range metadata. The bookmark normalizer retains session/version/position but drops each observation's source/project/file identity. Preserve the original identities and mark or clear stale mappings rather than assigning them to the current version. Agent 2 independently identified the same lifecycle boundary, and Agent 1 has been notified.

Legacy layout undo currently redisplays the previous in-memory verified result when graph semantics match. It does not establish that the external Lean/library environment still matches that result. A memory result may be reused only after fresh environment identity confirms the same verification provenance; unavailable or changed identity must require a recheck. No imported saved green flag may be promoted to current verification.

## Commands and limits

- `node .../design-audit-lifecycle-probe.mjs`: original reproductions rerun, all five repair cases closed.
- `node --test glean/prototype/web/notebook.test.mjs glean/prototype/web/typed-editor.test.mjs`: 11/11 passed at that repair point.
- `python3 -m glean.research.2026-10-07-grasshopper-implementation.design-audit-bindings-probe`: actual expected-signature/kernel/axiom checks passed; actual types and selective usage returned.
- `python3 -m glean.research.2026-10-07-grasshopper-implementation.design-audit-scope-types-probe`: valid Cases and Fin-module checks passed, but branch metadata omitted.
- `node .../design-audit-output-probe.mjs`: reproduced incorrect output identity and source mapping. Controlled metadata is used only to test UI delivery/selection, not as evidence of kernel acceptance.
- `python3 -m glean.research.2026-10-07-grasshopper-implementation.design-audit-disconnected-probe`: failed at the new metadata audit path; not an acceptance success.

No complete final build/test success is claimed here. Root must run the required build and relevant suites after the final product repair, and Agent 2 must update the requirement matrix based on actual evidence.


## Latest repair retests

The exact output-selection/projection probe now returns right → lines 10–12 and left-wire → left → lines 6–8. Evidence: `design-audit-output-retest.json`. F-02 is closed.

The actual backend metadata retest covered six fixtures in `design-audit-metadata-retest.json`: used P/hp only; all Or-case branch inputs/results; Fin module/call-site types; disconnected root sorry; forbidden sibling local; and a wrong script term. Actual positive checks pass, both invalid negatives reject, and disconnected root sorry is incomplete. The latter expectation was corrected explicitly: the generated theorem retains the unused let expression and therefore conservatively includes its sorryAx dependency. The original expectation and correction reason are recorded; the actual run output was not changed. The Unknown-constant regression no longer appears. F-01 and F-03 are closed.

`design-audit-source-identity-probe.mjs` executes the actual app callbacks in an isolated VM. Source text, project, and filename mismatches each now clear the old graph mapping, withhold stale after goals, and prevent a historical jump from borrowing the new document. Original before/after source/project/file/session/version fields survive normalization/JSON roundtrip. Evidence: `design-audit-source-identity-retest.json`.

`design-audit-environment-reuse-probe.mjs` executes the actual `navigateHistory` and `checkGraph` functions. Matching fresh environment hashes restore the same-semantic memory result; changed/missing hashes do not; a delayed old environment response cannot replace the result of a newer check. Evidence: `design-audit-environment-reuse-results.json`. The implemented monotonic verification epoch now guards the reuse response. This is an actual callback-delivery experiment with controlled responses, not a claim that the synthetic hashes are real environments. Live HTTP acceptance initially found the existing server had not loaded the new endpoint (404); root was told to restart the updated backend.

Latest independent related JavaScript suites: `node --test .../notebook.test.mjs .../proof-review.test.mjs .../typed-editor.test.mjs`, 22/22 passed.

## F-04 — unused module proof inherits main-target verification (P1, FIXED)

An actual graph with a root `True.intro` proof and an unused module containing `by sorry : False` correctly passes the main-target audit: root status valid, verified true, target axioms empty. The unused module has an actual False output type and a sorry warning. The current Inspector nevertheless labels that selected module component verified-document solely because the root result is verified.

This is a per-component display error, not a kernel acceptance bypass. Keep the main-target result distinct from the component's own axiom/policy state. Agent 1 agreed to return per-helper constant axiom metadata and evaluate the selected node separately; the exact original fixture is awaiting independent repair retest.

Evidence: `design-audit-unused-module-results.json`, created by `design-audit-unused-module-probe.py` through the actual source/kernel service.

The exact fixture now passes the actual expected-signature/kernel/axiom check for the root and returns per-helper `typedNodeAudit`. The root has no axioms; the unused module has `sorryAx`, `hasSorry: true`, and policyAccepted false. Feeding this real result to the actual typed editor reports root verified-document and the module incomplete-component. Evidence: `design-audit-unused-module-retest.json` and `design-audit-unused-module-ui-retest.json`. Optional metadata is restricted to replayed safe, nonpartial entries; Agent 1's separate unsafe/partial prefix regression passes. This closes the per-component display defect without changing the main target's verification.

## F-05 — exact output navigation loses the endpoint suffix (P2, FIXED)

After selecting Construct.left, the actual editor's `jumpKey('root/pair/right')` and `focusSource(11)` both keep outputId left and source lines 6–8, although right has an exact mapping at lines 10–12. The current `jumpKey` processes module/branch/calc-step paths but never consumes the output port suffix. The Inspector/Watch source button also drops outputId when calling it and only reveals the source panel. Agent 1 has the concrete reproduction and is repairing endpoint selection and the source reveal.

Evidence: `design-audit-output-jump-results.json` and its executable actual-module probe. Controlled source metadata tests UI navigation only; this is not a kernel acceptance experiment.

The original probe now selects right / lines 10–12 through both `jumpKey` and `focusSource`; the existing left wire remains left / lines 6–8. Evidence: `design-audit-output-jump-retest.json`. Code review confirms the source button keeps outputId, reveals the current selected projection, and renders saved historical Watch snippets with an explicit historical title. The exact source range is also preserved by `captureSelection`. Related notebook/proof-review/typed-editor suites pass 24/24, and the actual entrypoint parsing test passes 1/1.

The source identity VM harness was updated with `verificationEpoch` and `renderNotebook` stubs after the actual app introduced those dependencies; the latest source/project/file association run passes and records the current app hash. The old harness's temporary ReferenceError was a missing test context dependency, not a product defect. The current environment reuse/race probe and 22 related JavaScript tests also pass.

## F-06 — earlier preview replaces a newer actual check (P2, FIXED)

Agent 1 raised a same-document scheduling concern; the independent actual-editor reproduction confirms it. Start a preview and hold its response, complete a newer actual check with valid/verified true, then release the earlier preview. Both callbacks share the semantic revision, so the delivered result sequence is `[valid verified:true, ready preview:true verified:false]`. The source and Inspector end on the older preview rather than the newer actual check. This is stale delivery, not fake kernel acceptance.

Every check start needs its own monotonic request generation in addition to semantic revision; both delivery and error reporting must reject obsolete requests. Evidence: `design-audit-preview-race-results.json` and `design-audit-preview-race-probe.mjs`. Responses are controlled to isolate the callback ordering; no kernel acceptance claim is derived from these synthetic responses.

The current editor increments a separate checkGeneration at every check start and gates both delivery and error handling by it and semantic revision. Independent retest covers an old preview success and an old preview failure after the newer actual check: each retains only the newer valid/verified result and reports no obsolete error. Evidence: `design-audit-preview-race-retest.json`.

## Current audit disposition

All six confirmed final-review findings and the five original lifecycle findings are closed by independent focused reproductions/retests. The final related JavaScript command `node --test glean/prototype/web/notebook.test.mjs glean/prototype/web/proof-review.test.mjs glean/prototype/web/typed-editor.test.mjs glean/prototype/web/entrypoint.test.mjs` passes 27/27. The independent actual unused-module fixture is valid at the main target while the selected unfinished helper is explicitly incomplete. R10 source/project/file identity and R14 environment freshness/race probes also pass; Agent 2 separately owns actual Cases/Fin goal-bookmark correspondence.

This is the disposition of this targeted design/code audit, not a claim that every frozen requirement or the entire repository passes. Required final build/relevant integration suites and browser acceptance remain root's responsibility. No product edits, commits, or pushes were made by this auditor.
