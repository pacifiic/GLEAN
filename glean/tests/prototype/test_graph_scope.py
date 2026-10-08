"""Test goal-reachable verification without weakening whole-document structural validation."""

import copy
import unittest
from unittest.mock import patch

from glean.prototype.graph import compile_graph
from glean.prototype.graph_scope import compile_for_scope
from glean.prototype.server import check_graph
from glean.tests.prototype.test_graph import composition
from glean.tests.prototype.test_modules import identity, modular_graph


class GoalScopeTests(unittest.TestCase):
    def test_default_scope_preserves_full_workspace_compilation(self):
        graph = composition()
        graph["nodes"].append({"id": "draft", "kind": "apply"})
        self.assertEqual(compile_for_scope(graph), compile_graph(graph))
        self.assertEqual(compile_for_scope(graph)["status"], "incomplete")

    def test_goal_scope_handles_arbitrary_json_and_v1_unrecognized_metadata_safely(self):
        for graph in (None, [], 1, {}, {"version": True}):
            self.assertEqual(compile_for_scope(graph, "goal")["status"], "invalid")
        graph = composition()
        graph["modules"] = None
        self.assertEqual(compile_for_scope(graph, "goal")["status"], "ready")

    def test_detached_incomplete_nodes_do_not_block_the_goal_proof(self):
        graph = composition()
        graph["nodes"].append({"id": "draft", "kind": "apply"})
        original = copy.deepcopy(graph)
        result = compile_for_scope(graph, "goal")
        self.assertEqual(result["status"], "ready", result)
        self.assertEqual(result["scope"], "goal")
        self.assertEqual(result["diagnostics"], [])
        self.assertNotIn("draft", result["includedNodes"])
        self.assertEqual(len(result["workspaceDiagnostics"]), 2)
        self.assertTrue(all(d["scope"] == "workspace" for d in result["workspaceDiagnostics"]))
        self.assertEqual(graph, original)
        self.assertNotIn("draft", result["sourceMap"])

    def test_detached_type_errors_remain_visible_as_workspace_diagnostics(self):
        graph = composition()
        graph["nodes"].append({"id": "draft", "kind": "left"})
        graph["edges"].append({"id": "bad", "source": "hp", "target": "draft", "input": "value"})
        result = compile_for_scope(graph, "goal")
        self.assertEqual(result["status"], "ready", result)
        self.assertEqual(result["workspaceDiagnostics"][0]["nodeId"], "draft")
        self.assertEqual(result["workspaceDiagnostics"][0]["severity"], "error")
        self.assertIn("Expected a conjunction", result["workspaceDiagnostics"][0]["message"])

    def test_goal_ancestors_still_reject_missing_ports_and_type_errors(self):
        for changed in ("missing", "wrong_type"):
            graph = composition()
            if changed == "missing":
                graph["edges"].pop(0)
            else:
                graph["edges"][0]["source"] = "hp"
            result = compile_for_scope(graph, "goal")
            self.assertIn(result["status"], ("invalid", "incomplete"), result)
            self.assertIsNone(result["generatedCode"])
            self.assertTrue(any(d.get("nodeId") == "a1" for d in result["diagnostics"]))

    def test_unknown_detached_nodes_references_and_malformed_edges_are_not_filtered_away(self):
        alterations = [
            lambda g: g["nodes"].append({"id": "draft", "kind": "tactic"}),
            lambda g: g["nodes"].append({"id": "draft", "kind": "assumption", "ref": "missing"}),
            lambda g: g["nodes"].append({"id": "draft", "kind": "apply", "x": float("nan")}),
            lambda g: g["nodes"].append({"id": "goal", "kind": "apply"}),
            lambda g: g["edges"].append({"id": "draft", "source": "missing", "target": "hp", "input": "value"}),
            lambda g: g["assumptions"].append({"id": "unused", "type": "arbitrary Lean"}),
            lambda g: g["nodes"].extend({"id": f"draft{i}", "kind": "apply"} for i in range(256)),
        ]
        for alter in alterations:
            graph = composition(); alter(graph)
            with self.subTest(graph=graph):
                result = compile_for_scope(graph, "goal")
                self.assertEqual(result["status"], "invalid", result)
                self.assertIsNone(result["generatedCode"])
                self.assertTrue(result["diagnostics"])
                self.assertEqual(result["workspaceDiagnostics"], [])

    def test_detached_cycles_block_all_scopes_as_structural_errors(self):
        graph = composition()
        graph["nodes"].extend([{"id": "x", "kind": "left"}, {"id": "y", "kind": "left"}])
        graph["edges"].extend([{"id": "x", "source": "x", "target": "y", "input": "value"},
                               {"id": "y", "source": "y", "target": "x", "input": "value"}])
        self.assertEqual(compile_for_scope(graph, "goal")["status"], "invalid")

    def test_unused_definitions_and_detached_module_body_nodes_are_filtered(self):
        graph = modular_graph()
        graph["modules"][0]["nodes"].append({"id": "draft-body", "kind": "apply"})
        unused = identity("unused"); unused["edges"] = []
        graph["modules"].append(unused)
        result = compile_for_scope(graph, "goal")
        self.assertEqual(result["status"], "ready", result)
        self.assertEqual(result["includedModules"], ["identity"])
        self.assertEqual(result["generatedCode"].count("private theorem"), 1)
        self.assertEqual({d.get("moduleId") for d in result["workspaceDiagnostics"]}, {"identity", "unused"})
        self.assertNotIn("draft-body", result["moduleSourceMaps"]["identity"])

    def test_reachable_module_dependencies_are_transitive_and_body_errors_block(self):
        graph = modular_graph()
        outer = identity("outer")
        outer["nodes"].insert(1, {"id": "call", "kind": "module", "ref": "identity"})
        outer["edges"] = [{"id": "first", "source": "input", "target": "call", "input": "value"},
                           {"id": "last", "source": "call", "target": "goal", "input": "proof"}]
        graph["modules"].append(outer)
        graph["nodes"][1]["ref"] = "outer"
        result = compile_for_scope(graph, "goal")
        self.assertEqual(set(result["includedModules"]), {"identity", "outer"})
        self.assertEqual(result["status"], "ready")
        graph["modules"][0]["edges"] = []
        result = compile_for_scope(graph, "goal")
        self.assertEqual(result["status"], "incomplete", result)
        self.assertTrue(any(d.get("moduleId") == "identity" for d in result["diagnostics"]))

    def test_unused_modules_still_validate_refs_signatures_and_recursion(self):
        for alteration in ("reference", "signature", "cycle"):
            graph = modular_graph()
            unused = identity("unused")
            if alteration == "signature":
                unused["outputType"] = "arbitrary Lean"
            else:
                unused["nodes"].append({"id": "bad", "kind": "module", "ref": "missing" if alteration == "reference" else "unused"})
            graph["modules"].append(unused)
            result = compile_for_scope(graph, "goal")
            self.assertEqual(result["status"], "invalid", result)
            self.assertIsNone(result["generatedCode"])

    def test_whole_document_bounds_apply_before_unused_modules_are_pruned(self):
        graph = modular_graph()
        unused = identity("unused")
        unused["nodes"].extend({"id": f"draft{i}", "kind": "apply"} for i in range(250))
        graph["modules"].append(unused)
        result = compile_for_scope(graph, "goal")
        self.assertEqual(result["status"], "invalid", result)
        self.assertTrue(any("total across root and module bodies" in d["message"] for d in result["diagnostics"]))
        self.assertEqual(result["workspaceDiagnostics"], [])

    def test_visual_groups_spanning_active_and_detached_nodes_do_not_change_the_proof(self):
        graph = modular_graph()
        baseline = compile_for_scope(graph, "goal")["generatedCode"]
        graph["nodes"].append({"id": "draft", "kind": "pair"})
        graph["groups"] = [{"id": "mixed", "name": "Mixed", "nodeIds": ["input", "draft"], "collapsed": True}]
        result = compile_for_scope(graph, "goal")
        self.assertEqual(result["status"], "ready", result)
        self.assertEqual(result["generatedCode"], baseline)

    def test_unknown_scope_is_rejected_without_falling_back_to_less_strict_checks(self):
        with self.assertRaises(ValueError):
            compile_for_scope(composition(), "typo")

    def test_structural_validation_has_no_codegen_or_inference_side_effects(self):
        graph = composition()
        graph["nodes"].append({"id": "draft", "kind": "apply"})
        result = compile_graph(graph, structure_only=True)
        self.assertEqual(result["status"], "valid", result)
        self.assertIsNone(result["generatedCode"])
        self.assertEqual(result["diagnostics"], [])

    def test_selected_root_and_module_proofs_are_accepted_by_the_lean_kernel(self):
        graph = modular_graph()
        graph["modules"][0]["nodes"].append({"id": "draft", "kind": "apply"})
        graph["nodes"].append({"id": "draft", "kind": "apply"})
        compiled = compile_for_scope(graph, "goal")
        with patch("glean.prototype.server.compile_graph", return_value=compiled):
            checked = check_graph(graph)
        self.assertTrue(checked["verified"], checked)
        self.assertIn("does not depend on any axioms", checked["lean"]["output"])


class SourceMapTests(unittest.TestCase):
    def test_root_node_maps_point_to_emitted_terms_and_final_goal(self):
        result = compile_graph(composition())
        lines = result["generatedCode"].splitlines()
        for node, mapping in result["sourceMap"].items():
            self.assertEqual(mapping["startLine"], mapping["endLine"])
            line = lines[mapping["startLine"] - 1]
            self.assertTrue(line.startswith("  let ") if node != "goal" else line == "  n4", (node, line))
        self.assertEqual(set(result["sourceMap"]), {"hp", "f", "g", "a1", "a2", "goal"})

    def test_module_maps_account_for_reordered_definitions_and_root_offsets(self):
        graph = modular_graph()
        outer = identity("outer")
        outer["nodes"].insert(1, {"id": "call", "kind": "module", "ref": "identity"})
        outer["edges"] = [{"id": "a", "source": "input", "target": "call", "input": "value"},
                           {"id": "b", "source": "call", "target": "goal", "input": "proof"}]
        graph["modules"].insert(0, outer)
        graph["nodes"][1]["ref"] = "outer"
        result = compile_graph(graph)
        lines = result["generatedCode"].splitlines()
        self.assertIn("glean_module_0", lines[result["sourceMap"]["call"]["startLine"] - 1])
        self.assertIn("glean_module_1", lines[result["moduleSourceMaps"]["outer"]["call"]["startLine"] - 1])
        root_goal = result["sourceMap"]["goal"]["startLine"]
        for module in result["moduleSourceMaps"].values():
            self.assertTrue(all(mapping["endLine"] < root_goal for mapping in module.values()))

    def test_invalid_graphs_never_expose_stale_generated_line_mappings(self):
        graph = modular_graph()
        graph["edges"].pop()
        result = compile_graph(graph)
        self.assertIsNone(result["generatedCode"])
        self.assertEqual(result["sourceMap"], {})
        self.assertEqual(result["moduleSourceMaps"], {})


if __name__ == "__main__":
    unittest.main()
