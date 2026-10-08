# Typed graph v3 core audit

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

2026-10-07. Initial implementation review of `typed_graph.py`, `TYPED_GRAPH.md`, and independent expected-signature changes in `source_check.py`. Product edits belong to Agent 1. These findings were sent directly to Agent 1 and root before the UI integration is considered complete.

The core already represents arbitrary terms as string data for Lean's EOF term parser and independently checks the generated target type. The issues below do not demonstrate a false mathematical theorem accepted by the kernel. They concern whether the graph faithfully represents the checked proof, whether valid names compile, and whether diagnostics identify the actual component.

## T3-01 — P1: a LeanScript can depend on a disconnected generated component

Status: FIXED; both the original script path and alternate reference-node path were independently rejected by actual Lean after repairs.

Actual fixture: root goal `True`, no inputs, two disconnected `script` nodes. Node A has no parameters, output `True`, body `True.intro`. Node B also has no parameters, output `True`, body `glean_component_1`. The result is B and the graph has no edges.

`compile_typed_graph` returns ready and the generated source compiles with actual Lean exit 0. Node B resolves node A's predictable generated global declaration even though it has no input or wire to A. Thus a dependency inspector based on graph edges misses a real proof dependency, contradicting the contract that a script sees only explicit parameters and imports.

Repair guidance: isolate generated helper identities from user fragment resolution and/or inspect the actual elaborated fragment's free constant dependencies against permitted imported declarations and explicit inputs. A superficial textual blocklist would miss qualified names and macro-generated references. Generated case/module calls themselves still need their normal explicit access.

## T3-02 — P2: allowed local aliases can shadow generated function names

Status: FIXED by reserving the `glean_` alias prefix; independently checked schema rejection.

Start with the Nat identity fixture, rename the root input from `n` to `glean_component_1`, and update its goal to `glean_component_1 + 0 = glean_component_1`. Keep the input node and explicit script wire unchanged.

The schema accepts this alias and produces ready source. Actual Lean fails at the generated call with `Function expected at glean_component_1` because the root Nat binder shadows the generated helper function.

Reserve generated names/namespaces for local aliases, or use hygienic qualified references that cannot be shadowed. Include generated module identifiers as well as component identifiers and future proof-harness names in that decision.

## T3-03 — P2: calc step fields do not have independent fragment boundaries

Status: fragment escape FIXED; independently recompiled the original injection and observed EOF rejection. Per-step diagnostic identity is still pending implementation.

Actual one-step fixture:

```json
{
  "start": "(1 : Nat)",
  "outputType": "(1 : Nat) = 1",
  "steps": [{
    "id": "only",
    "relation": "=",
    "term": "1 := by rfl\n  _ = 1",
    "proof": "by rfl"
  }]
}
```

The generator concatenates these strings into two calc steps and then EOF-parses only the combined expression. Actual Lean exits 0. The graph says one step while Lean checked two; per-step provenance is therefore inaccurate.

Parse/wrap each start, right-hand term and proof as its own term before combining the fixed calc structure. Preserve step IDs in diagnostics/source maps. This does not restrict a proof term's internal tactics; it prevents an expression field from escaping its structural role.

## T3-04 — P1: parsed fragment diagnostics point to unrelated generated lines

Status: fragment line mapping and diagnostic-code parsing FIXED; independently retested.

Actual Nat identity fixture with script body `by exact missing` produces a `root/s` source map covering generated lines 11–13. Actual Lean reports:

```text
error_map.lean:1:9: error(lean.unknownIdentifier): Unknown identifier `missing`
```

The fragment parser's syntax positions start at the fragment's own beginning, so an ordinary generated-file line lookup points at the import header instead of the node. In addition, the existing `parse_source_diagnostics` severity pattern expects `error:` and misses Lean's `error(lean.unknownIdentifier):` form, losing even the display location.

Relocate parsed syntax references to the owning fragment or produce structured diagnostics carrying the fragment identity. Support Lean's diagnostic-code suffix in the display parser. Neither stdout text nor these display mappings may become acceptance evidence.

## Verification performed

Each fixture above was generated with the current `compile_typed_graph` and compiled with the pinned project's real `lake env lean` command in an isolated temporary directory, bounded to 20 seconds per file. Results: hidden dependency exit 0; alias collision exit 1; injected calc steps exit 0; unknown identifier exit 1 with incorrect location shown above. No product files were modified and no heavy mathlib builds or π runs were used.

Further v3 reference introspection, actual dependent-port metadata, case fixtures, frontend integration, batching and calc UI were still under implementation at review time. Their absence is tracked by the requirements auditor rather than reported here as completed behavior.

## First repair retest

After Agent 1's fixes, the original hidden script reference is rejected by an elaborated-expression dependency check. However, replacing node B with `{kind:'reference', inputs:[], outputType:'True', declaration:'glean_component_1'}` still compiles with actual Lean exit 0 and no graph edge. The `reference` branch directly emits the call and bypasses the new fragment guard. This alternate path was immediately reported to Agent 1 and root.

The original calc injection now fails at its owning node with `expected end of input`. The unknown identifier now reports generated line 29, inside `root/s`'s source range 28–30, instead of line 1. The display parser recognizes `error(lean.unknownIdentifier)` and returns filename `Typed.lean`, one-based line 29 / column 15, severity error, and the original message.

An additional code-read issue was identified while constructing the expected signature: global replacement of `gleanTerm%` also changed user string-literal contents. Agent 1 replaced this with explicit token parameters when building binders and the goal. Independent generated-source inspection confirms the user text `"gleanTerm%" = "gleanTerm%"` is preserved in the expected signature. No kernel failure was attributed to this issue without an actual kernel run.

## Reference-path repair retest

Reference nodes now pass their qualified application through the same trusted fragment elaborator. The auditor reran the exact disconnected reference-node fixture with actual Lean: exit 1 and `Component fragments may use only explicit inputs and imported declarations, not generated helpers`. This closes the remaining demonstrated T3-01 bypass. It does not replace the still-required positive reference-signature, dependent-type, and UI acceptance tests.
