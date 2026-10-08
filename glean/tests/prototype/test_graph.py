"""Exercise the constrained graph language and safe Lean source generation."""

import copy
import unittest

from glean.prototype.graph import compile_graph


def composition():
    return {
        "version": 1,
        "name": "compose",
        "propositions": ["P", "Q", "R"],
        "assumptions": [
            {"id": "hp", "type": "P"},
            {"id": "f", "type": "P → Q"},
            {"id": "g", "type": "Q → R"},
        ],
        "goal": "R",
        "nodes": [
            {"id": "hp", "kind": "assumption", "ref": "hp"},
            {"id": "f", "kind": "assumption", "ref": "f"},
            {"id": "g", "kind": "assumption", "ref": "g"},
            {"id": "a1", "kind": "apply"},
            {"id": "a2", "kind": "apply"},
            {"id": "goal", "kind": "goal"},
        ],
        "edges": [
            {"id": "e1", "source": "f", "target": "a1", "input": "fn"},
            {"id": "e2", "source": "hp", "target": "a1", "input": "arg"},
            {"id": "e3", "source": "g", "target": "a2", "input": "fn"},
            {"id": "e4", "source": "a1", "target": "a2", "input": "arg"},
            {"id": "e5", "source": "a2", "target": "goal", "input": "proof"},
        ],
    }


class GraphCompilerTests(unittest.TestCase):
    def assert_status(self, graph, status):
        result = compile_graph(graph)
        self.assertEqual(result["status"], status, result)
        self.assertIsInstance(result["diagnostics"], list)
        self.assertIsInstance(result["nodeTypes"], dict)
        if status != "ready":
            self.assertIsNone(result["generatedCode"])
            self.assertTrue(result["diagnostics"])
        return result

    def test_composition_generates_a_complete_deterministic_module(self):
        graph = composition()
        original = copy.deepcopy(graph)
        result = self.assert_status(graph, "ready")
        self.assertEqual(graph, original)
        self.assertEqual(result, compile_graph(graph))
        self.assertEqual(result["nodeTypes"]["a1"], "Q")
        self.assertEqual(result["nodeTypes"]["a2"], "R")
        code = result["generatedCode"]
        self.assertIn("module", code)
        self.assertIn("theorem glean_proof", code)
        self.assertIn("#print axioms glean_proof", code)
        self.assertNotIn("sorry", code)

    def test_arbitrary_json_is_diagnosed(self):
        for value in (None, 1, True, "graph", [], {}, {"version": True}):
            with self.subTest(value=value):
                self.assert_status(value, "invalid")

    def test_malformed_containers_and_elements_do_not_raise(self):
        for key in ("propositions", "assumptions", "nodes", "edges"):
            for value in (None, {}, "text", [None], [[]], [True]):
                with self.subTest(key=key, value=value):
                    graph = composition()
                    graph[key] = value
                    self.assert_status(graph, "invalid")

    def test_requires_exact_version_and_one_goal(self):
        for version in (None, True, 1.0, 2, "1"):
            graph = composition()
            graph["version"] = version
            self.assert_status(graph, "invalid")
        graph = composition()
        graph["nodes"].append({"id": "goal2", "kind": "goal"})
        self.assert_status(graph, "invalid")
        graph["nodes"] = [n for n in graph["nodes"] if n["kind"] != "goal"]
        graph["edges"].pop()
        self.assert_status(graph, "invalid")

    def test_duplicate_identifiers_and_propositions(self):
        for field in ("propositions", "assumptions", "nodes", "edges"):
            graph = composition()
            graph[field].append(copy.deepcopy(graph[field][0]))
            self.assert_status(graph, "invalid")

    def test_bad_identifiers_and_node_kinds(self):
        for bad in (None, [], {}, "", "x" * 129):
            for field in ("nodes", "assumptions", "edges"):
                graph = composition()
                graph[field][0]["id"] = bad
                self.assert_status(graph, "invalid")
        for kind in ([], None, "tactic", ""):
            graph = composition()
            graph["nodes"][0]["kind"] = kind
            self.assert_status(graph, "invalid")

    def test_coordinates_must_be_finite_numbers_when_present(self):
        for coordinate in ("1", True, None, [], float("nan"), float("inf")):
            graph = composition()
            graph["nodes"][0]["x"] = coordinate
            self.assert_status(graph, "invalid")

    def test_unknown_assumption_reference(self):
        for ref in ("missing", None, []):
            graph = composition()
            graph["nodes"][0]["ref"] = ref
            result = self.assert_status(graph, "invalid")
            self.assertTrue(any(d.get("nodeId") == "hp" for d in result["diagnostics"]))

    def test_unknown_edge_endpoints_and_input_ports(self):
        for key in ("source", "target", "input"):
            for value in ("missing", [], None):
                graph = composition()
                graph["edges"][0][key] = value
                self.assert_status(graph, "invalid")

    def test_goal_cannot_supply_an_output(self):
        graph = composition()
        graph["edges"][1]["source"] = "goal"
        self.assert_status(graph, "invalid")

    def test_duplicate_input_connection_is_invalid(self):
        graph = composition()
        graph["edges"].append({"id": "extra", "source": "hp", "target": "a1", "input": "arg"})
        result = self.assert_status(graph, "invalid")
        self.assertTrue(any(d.get("nodeId") == "a1" and d.get("port") == "arg" for d in result["diagnostics"]))

    def test_missing_wire_is_incomplete_and_located(self):
        graph = composition()
        graph["edges"].pop(1)
        result = self.assert_status(graph, "incomplete")
        self.assertTrue(any(d.get("nodeId") == "a1" and d.get("port") == "arg" for d in result["diagnostics"]))

    def test_disconnected_nodes_are_checked(self):
        graph = composition()
        graph["nodes"].append({"id": "unused", "kind": "pair"})
        result = self.assert_status(graph, "incomplete")
        self.assertTrue(any(d.get("nodeId") == "unused" for d in result["diagnostics"]))

    def test_cycles_and_self_edges_are_invalid(self):
        graph = composition()
        graph["edges"][1]["source"] = "a2"
        self.assert_status(graph, "invalid")
        graph["edges"][1]["source"] = "a1"
        self.assert_status(graph, "invalid")

    def test_argument_type_mismatch_is_located(self):
        graph = composition()
        graph["edges"][1]["source"] = "g"
        result = self.assert_status(graph, "invalid")
        self.assertTrue(any(d.get("nodeId") == "a1" and d.get("port") == "arg" for d in result["diagnostics"]))

    def test_nonfunction_and_goal_mismatch(self):
        graph = composition()
        graph["edges"][0]["source"] = "hp"
        result = self.assert_status(graph, "invalid")
        self.assertTrue(any(d.get("nodeId") == "a1" and d.get("port") == "fn" for d in result["diagnostics"]))
        graph = composition()
        graph["goal"] = "P"
        result = self.assert_status(graph, "invalid")
        self.assertTrue(any(d.get("nodeId") == "goal" and d.get("port") == "proof" for d in result["diagnostics"]))

    def test_known_type_errors_take_precedence_over_incomplete(self):
        graph = composition()
        graph["edges"][0]["source"] = "hp"
        graph["edges"].pop(1)
        self.assert_status(graph, "invalid")

    def test_conjunction_construction_and_projections(self):
        graph = composition()
        graph["assumptions"] = [{"id": "h", "type": "P /\\ Q"}]
        graph["goal"] = "Q ∧ P"
        graph["nodes"] = [
            {"id": "h", "kind": "assumption", "ref": "h"},
            {"id": "left", "kind": "left"},
            {"id": "right", "kind": "right"},
            {"id": "pair", "kind": "pair"},
            {"id": "goal", "kind": "goal"},
        ]
        graph["edges"] = [
            {"id": "e1", "source": "h", "target": "left", "input": "value"},
            {"id": "e2", "source": "h", "target": "right", "input": "value"},
            {"id": "e3", "source": "right", "target": "pair", "input": "left"},
            {"id": "e4", "source": "left", "target": "pair", "input": "right"},
            {"id": "e5", "source": "pair", "target": "goal", "input": "proof"},
        ]
        result = self.assert_status(graph, "ready")
        self.assertEqual(result["nodeTypes"]["pair"], "Q ∧ P")
        self.assertIn("And.intro", result["generatedCode"])
        self.assertIn("And.left", result["generatedCode"])
        self.assertIn("And.right", result["generatedCode"])
        graph["assumptions"][0]["type"] = "P"
        self.assert_status(graph, "invalid")

    def test_type_grammar_precedence_and_right_associativity(self):
        cases = [
            ("P -> Q -> R", "P → (Q → R)", "P → Q → R"),
            ("P /\\ Q -> R", "(P ∧ Q) → R", "P ∧ Q → R"),
            ("(P -> Q) /\\ R", "(P → Q) ∧ R", "(P → Q) ∧ R"),
        ]
        for source, goal, rendered in cases:
            graph = {"version": 1, "propositions": ["P", "Q", "R"],
                     "assumptions": [{"id": "h", "type": source}], "goal": goal,
                     "nodes": [{"id": "h", "kind": "assumption", "ref": "h"}, {"id": "goal", "kind": "goal"}],
                     "edges": [{"id": "e", "source": "h", "target": "goal", "input": "proof"}]}
            result = self.assert_status(graph, "ready")
            self.assertEqual(result["nodeTypes"]["h"], rendered)

    def test_types_reject_undeclared_names_and_lean_injection(self):
        for bad in (None, [], "", "S", "P Q", "P ->", "()", "(P", "P)",
                    "P -- comment", "P; sorry", "by exact hp", "∀ x, P",
                    "P\naxiom injected : Q", "P ∨ Q", "True", "P := by sorry"):
            for field in ("goal", "assumption"):
                graph = composition()
                if field == "goal":
                    graph["goal"] = bad
                else:
                    graph["assumptions"][0]["type"] = bad
                with self.subTest(bad=bad, field=field):
                    self.assert_status(graph, "invalid")

    def test_propositions_use_constrained_names(self):
        for bad in ("p", "P Q", "P\naxiom", "ℙ", "", "P'", "Type", "P;", []):
            graph = composition()
            graph["propositions"].append(bad)
            self.assert_status(graph, "invalid")

    def test_graph_identifiers_never_become_source(self):
        graph = composition()
        graph["name"] = "end\naxiom injected : False"
        bad = "hp); axiom injected : False --"
        graph["assumptions"][0]["id"] = bad
        graph["nodes"][0]["ref"] = bad
        graph["nodes"][0]["id"] = bad
        graph["edges"][1]["source"] = bad
        result = self.assert_status(graph, "ready")
        self.assertNotIn("injected", result["generatedCode"])
        self.assertIn(bad, result["nodeTypes"])

    def test_resource_limits_fail_without_recursion_errors(self):
        for oversized in ("(" * 1000 + "P" + ")" * 1000, "P → " * 1000 + "P",
                          "(" * 100 + "P" + ")" * 100, "P → " * 100 + "P"):
            graph = composition()
            graph["goal"] = oversized
            self.assert_status(graph, "invalid")
        for field, size in (("nodes", 257), ("assumptions", 257), ("propositions", 65), ("edges", 513)):
            graph = composition()
            graph[field] = [copy.deepcopy(graph[field][0]) for _ in range(size)]
            self.assert_status(graph, "invalid")

    def test_conjunction_grouping_is_not_erased(self):
        graph = composition()
        graph["assumptions"] = [{"id": "h", "type": "(P ∧ Q) ∧ R"}]
        graph["goal"] = "P ∧ Q ∧ R"
        graph["nodes"] = [{"id": "h", "kind": "assumption", "ref": "h"}, {"id": "goal", "kind": "goal"}]
        graph["edges"] = [{"id": "e", "source": "h", "target": "goal", "input": "proof"}]
        self.assert_status(graph, "invalid")
        graph["goal"] = "(P ∧ Q) ∧ R"
        result = self.assert_status(graph, "ready")
        self.assertEqual(result["nodeTypes"]["h"], "(P ∧ Q) ∧ R")

    def test_repeated_pairing_has_bounded_type_expansion(self):
        graph = {"version": 1, "propositions": ["P"], "assumptions": [{"id": "h", "type": "P"}],
                 "goal": "P", "nodes": [{"id": "h", "kind": "assumption", "ref": "h"}], "edges": []}
        previous = "h"
        for i in range(30):
            current = f"pair{i}"
            graph["nodes"].append({"id": current, "kind": "pair"})
            for port in ("left", "right"):
                graph["edges"].append({"id": f"{current}-{port}", "source": previous, "target": current, "input": port})
            previous = current
        graph["nodes"].append({"id": "goal", "kind": "goal"})
        graph["edges"].append({"id": "finish", "source": "h", "target": "goal", "input": "proof"})
        self.assert_status(graph, "invalid")


if __name__ == "__main__":
    unittest.main()
