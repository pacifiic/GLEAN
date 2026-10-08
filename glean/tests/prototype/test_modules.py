"""Exercise reusable typed proof functions and presentation-only visual groups."""

import copy
import unittest

from glean.prototype.graph import compile_graph
from glean.prototype.server import check_graph
from glean.tests.prototype.test_graph import composition


def identity(identifier="identity"):
    return {
        "id": identifier, "name": "Identity", "inputs": [{"id": "value", "name": "value", "type": "P"}],
        "outputType": "P", "nodes": [
            {"id": "input", "kind": "assumption", "ref": "value"},
            {"id": "goal", "kind": "goal"}],
        "edges": [{"id": "wire", "source": "input", "target": "goal", "input": "proof"}], "groups": []}


def modular_graph():
    return {
        "version": 2, "name": "modular", "propositions": ["P", "Q", "R"],
        "assumptions": [{"id": "root-value", "type": "P"}], "goal": "P",
        "nodes": [{"id": "input", "kind": "assumption", "ref": "root-value"},
                  {"id": "call", "kind": "module", "ref": "identity"},
                  {"id": "goal", "kind": "goal"}],
        "edges": [{"id": "e1", "source": "input", "target": "call", "input": "value"},
                  {"id": "e2", "source": "call", "target": "goal", "input": "proof"}],
        "modules": [identity()], "groups": []}


class ModuleCompilerTests(unittest.TestCase):
    def compile(self, graph, expected):
        original = copy.deepcopy(graph)
        result = compile_graph(graph)
        self.assertEqual(result["status"], expected, result)
        self.assertEqual(graph, original)
        self.assertEqual(result, compile_graph(graph))
        if expected != "ready":
            self.assertIsNone(result["generatedCode"])
            self.assertTrue(result["diagnostics"])
        return result

    def test_reusable_function_has_explicit_parameters_and_scoped_types(self):
        graph = modular_graph()
        result = self.compile(graph, "ready")
        self.assertEqual(result["nodeTypes"]["call"], "P")
        self.assertEqual(result["moduleNodeTypes"]["identity"]["input"], "P")
        self.assertEqual(result["moduleTypes"]["identity"], "P → P")
        code = result["generatedCode"]
        self.assertIn("private theorem glean_module_0", code)
        self.assertIn("(h0 : p0)", code)
        self.assertIn("glean_module_0 p0 p1 p2 n0", code)
        self.assertNotIn("sorry", code)
        self.assertNotIn("axiom ", code)

    def test_nested_definitions_emit_dependencies_first_without_inlining(self):
        graph = modular_graph()
        outer = identity("outer")
        outer["nodes"].insert(1, {"id": "nested", "kind": "module", "ref": "identity"})
        outer["edges"] = [{"id": "n1", "source": "input", "target": "nested", "input": "value"},
                          {"id": "n2", "source": "nested", "target": "goal", "input": "proof"}]
        graph["modules"].insert(0, outer)
        graph["nodes"][1]["ref"] = "outer"
        result = self.compile(graph, "ready")
        self.assertLess(result["generatedCode"].index("private theorem glean_module_1"),
                        result["generatedCode"].index("private theorem glean_module_0"))
        self.assertEqual(result["generatedCode"].count("private theorem"), 2)
        checked = check_graph(graph)
        self.assertTrue(checked["verified"], checked)
        self.assertIn("does not depend on any axioms", checked["lean"]["output"])

    def test_function_inputs_are_typed_and_ordered_explicitly(self):
        source = composition()
        definition = {"id": "compose", "name": "Composition", "inputs": [
            {**item, "name": item["id"]} for item in source["assumptions"]],
            "outputType": source["goal"], "nodes": source["nodes"], "edges": source["edges"]}
        graph = composition()
        graph.update(version=2, modules=[definition], groups=[])
        graph["nodes"] = graph["nodes"][:3] + [
            {"id": "call", "kind": "module", "ref": "compose"}, {"id": "goal", "kind": "goal"}]
        graph["edges"] = [{"id": "e" + item["id"], "source": item["id"], "target": "call", "input": item["id"]}
                          for item in graph["assumptions"]]
        graph["edges"].append({"id": "end", "source": "call", "target": "goal", "input": "proof"})
        result = self.compile(graph, "ready")
        self.assertEqual(result["moduleTypes"]["compose"], "P → (P → Q) → (Q → R) → R")
        self.assertIn("glean_module_0 p0 p1 p2 n0 n1 n2", result["generatedCode"])
        checked = check_graph(graph)
        self.assertTrue(checked["verified"], checked)
        self.assertIn("does not depend on any axioms", checked["lean"]["output"])
        self.assertNotIn("warning:", checked["lean"]["output"])

    def test_shared_module_calls_keep_code_size_linear(self):
        graph = modular_graph()
        for index in range(1, 32):
            module = identity(str(index))
            previous = "identity" if index == 1 else str(index - 1)
            module["nodes"][1:1] = [{"id": "first", "kind": "module", "ref": previous},
                                    {"id": "second", "kind": "module", "ref": previous}]
            module["edges"] = [{"id": "e1", "source": "input", "target": "first", "input": "value"},
                               {"id": "e2", "source": "first", "target": "second", "input": "value"},
                               {"id": "e3", "source": "second", "target": "goal", "input": "proof"}]
            graph["modules"].append(module)
        graph["nodes"][1]["ref"] = "31"
        result = self.compile(graph, "ready")
        self.assertEqual(result["generatedCode"].count("private theorem"), 32)
        self.assertLess(len(result["generatedCode"]), 15000)

    def test_module_input_ids_never_become_source_and_are_real_port_names(self):
        graph = modular_graph()
        bad = "value); axiom injected : False --"
        graph["modules"][0]["inputs"][0]["id"] = bad
        graph["modules"][0]["nodes"][0]["ref"] = bad
        graph["edges"][0]["input"] = bad
        result = self.compile(graph, "ready")
        self.assertNotIn("injected", result["generatedCode"])
        graph["edges"][0]["input"] = "value"
        self.compile(graph, "invalid")

    def test_missing_inputs_are_incomplete_but_known_wrong_types_are_invalid(self):
        graph = modular_graph()
        graph["edges"].pop(0)
        result = self.compile(graph, "incomplete")
        self.assertTrue(any(d.get("nodeId") == "call" and d.get("port") == "value" for d in result["diagnostics"]))
        graph = modular_graph()
        graph["assumptions"][0]["type"] = "Q"
        self.compile(graph, "invalid")

    def test_body_errors_are_local_and_unused_definitions_are_checked(self):
        graph = modular_graph()
        graph["modules"].append(identity("unused"))
        graph["modules"][1]["edges"] = []
        result = self.compile(graph, "incomplete")
        self.assertTrue(any(d.get("moduleId") == "unused" and d.get("nodeId") == "goal" for d in result["diagnostics"]))
        graph["modules"][1]["outputType"] = "Q"
        graph["modules"][1]["edges"] = identity()["edges"]
        result = self.compile(graph, "invalid")
        self.assertTrue(any(d.get("moduleId") == "unused" and d.get("nodeId") == "goal" for d in result["diagnostics"]))

    def test_module_cannot_capture_root_assumptions(self):
        graph = modular_graph()
        graph["modules"][0]["nodes"][0]["ref"] = "root-value"
        result = self.compile(graph, "invalid")
        self.assertTrue(any(d.get("moduleId") == "identity" and d.get("nodeId") == "input" for d in result["diagnostics"]))

    def test_unknown_duplicate_and_recursive_definitions_are_invalid(self):
        graph = modular_graph()
        graph["nodes"][1]["ref"] = "missing"
        self.compile(graph, "invalid")
        graph = modular_graph()
        graph["modules"].append(identity())
        self.compile(graph, "invalid")
        for mutual in (False, True):
            graph = modular_graph()
            graph["modules"][0]["nodes"].append({"id": "recursive", "kind": "module", "ref": "other" if mutual else "identity"})
            if mutual:
                other = identity("other")
                other["nodes"].append({"id": "recursive", "kind": "module", "ref": "identity"})
                graph["modules"].append(other)
            result = self.compile(graph, "invalid")
            self.assertTrue(any("cycle" in d["message"].lower() for d in result["diagnostics"]))

    def test_unhashable_module_references_are_diagnosed(self):
        for ref in (None, [], {}, True):
            graph = modular_graph()
            graph["nodes"][1]["ref"] = ref
            self.compile(graph, "invalid")

    def test_malformed_module_definitions_do_not_raise(self):
        for field in ("modules", "groups"):
            for value in (None, {}, "text", [None], [[]], [True]):
                graph = modular_graph()
                graph[field] = value
                self.compile(graph, "invalid")
        for field in ("inputs", "nodes", "edges", "groups"):
            for value in (None, {}, "text", [None], [[]]):
                graph = modular_graph()
                graph["modules"][0][field] = value
                self.compile(graph, "invalid")
        for field in ("id", "name", "outputType"):
            for value in (None, [], {}, ""):
                graph = modular_graph()
                graph["modules"][0][field] = value
                self.compile(graph, "invalid")

    def test_duplicate_input_ids_bad_input_names_and_injected_types(self):
        graph = modular_graph()
        graph["modules"][0]["inputs"] *= 2
        self.compile(graph, "invalid")
        for field in ("id", "name", "type"):
            graph = modular_graph()
            graph["modules"][0]["inputs"][0][field] = []
            self.compile(graph, "invalid")
        for field in ("type", "outputType"):
            graph = modular_graph()
            target = graph["modules"][0]["inputs"][0] if field == "type" else graph["modules"][0]
            target[field] = "P := by sorry"
            self.compile(graph, "invalid")

    def test_definition_labels_never_become_lean_source(self):
        graph = modular_graph()
        bad = "end\naxiom injected : False"
        graph["modules"][0]["id"] = bad
        graph["modules"][0]["name"] = bad
        graph["modules"][0]["inputs"][0]["name"] = bad
        graph["nodes"][1]["ref"] = bad
        result = self.compile(graph, "ready")
        self.assertNotIn("injected", result["generatedCode"])

    def test_resource_bounds_apply_across_all_scopes(self):
        graph = modular_graph()
        graph["modules"] = [identity(str(i)) for i in range(33)]
        self.compile(graph, "invalid")
        graph = modular_graph()
        graph["modules"][0]["inputs"] = [{"id": str(i), "name": str(i), "type": "P"} for i in range(17)]
        self.compile(graph, "invalid")
        for field, count in (("nodes", 254), ("edges", 511)):
            graph = modular_graph()
            graph["modules"][0][field] = [copy.deepcopy(graph["modules"][0][field][0]) for _ in range(count)]
            result = self.compile(graph, "invalid")
            self.assertTrue(any("total" in d["message"].lower() for d in result["diagnostics"]))

    def test_visual_groups_do_not_change_generated_proof(self):
        graph = modular_graph()
        before = self.compile(graph, "ready")["generatedCode"]
        graph["groups"] = [{"id": "g", "name": "Context and module", "nodeIds": ["input", "call"],
                            "collapsed": True, "x": 12, "y": 34}]
        graph["modules"][0]["groups"] = [{"id": "g", "name": "Body", "nodeIds": ["input", "goal"],
                                              "collapsed": False, "x": 0, "y": 0}]
        self.assertEqual(self.compile(graph, "ready")["generatedCode"], before)

    def test_group_membership_and_metadata_are_validated(self):
        group = {"id": "g", "name": "Group", "nodeIds": ["input", "call"], "collapsed": True, "x": 0, "y": 0}
        for field, value in (("id", []), ("name", ""), ("nodeIds", []), ("nodeIds", ["missing"]),
                             ("nodeIds", ["input", "input"]), ("collapsed", 1), ("x", float("inf")),
                             ("y", [])):
            graph = modular_graph()
            graph["groups"] = [dict(group, **{field: value})]
            self.compile(graph, "invalid")
        graph = modular_graph()
        graph["groups"] = [group, dict(group, id="other")]
        self.compile(graph, "invalid")

    def test_v1_stays_compatible_and_v2_requires_its_arrays(self):
        self.compile(composition(), "ready")
        graph = composition()
        graph["version"] = 2
        self.compile(graph, "invalid")
        graph.update(modules=[], groups=[])
        self.compile(graph, "ready")


if __name__ == "__main__":
    unittest.main()
