"""Keep unsupported formula errors actionable and attached to the exact context input."""

import unittest

from glean.prototype.graph import compile_graph
from glean.tests.prototype.test_graph import composition
from glean.tests.prototype.test_modules import modular_graph


class GraphSyntaxDiagnosticTests(unittest.TestCase):
    def assert_syntax_diagnostic(self, diagnostic, field, position):
        self.assertEqual(diagnostic["field"], field)
        self.assertEqual(diagnostic["position"], position)
        self.assertEqual(diagnostic["severity"], "error")
        self.assertIn("그래프 모드", diagnostic["message"])
        self.assertIn("→", diagnostic["message"])
        self.assertIn("∧", diagnostic["message"])
        self.assertIn("Lean 소스 모드", diagnostic["message"])
        self.assertIn(".lean", diagnostic["message"])

    def test_real_math_goal_identifies_the_goal_field_and_unsupported_character(self):
        graph = composition(); graph["goal"] = "Irrational Real.pi"
        result = compile_graph(graph)
        self.assertEqual(result["status"], "invalid")
        self.assertIsNone(result["generatedCode"])
        self.assert_syntax_diagnostic(result["diagnostics"][0], "goal", 2)

    def test_quantified_assumptions_identify_the_row_and_its_visible_node(self):
        graph = composition(); graph["assumptions"][0]["type"] = "∀ x, P"
        result = compile_graph(graph)
        diagnostic = next(d for d in result["diagnostics"] if d.get("nodeId") == "hp")
        self.assert_syntax_diagnostic(diagnostic, "assumption", 1)
        self.assertEqual(diagnostic["assumptionId"], "hp")

    def test_unused_assumptions_still_point_to_the_correct_context_row(self):
        graph = composition(); graph["assumptions"].append({"id": "unused", "type": "P = Q"})
        diagnostic = next(d for d in compile_graph(graph)["diagnostics"] if d.get("assumptionId") == "unused")
        self.assert_syntax_diagnostic(diagnostic, "assumption", 3)
        self.assertNotIn("nodeId", diagnostic)

    def test_positions_include_whitespace_and_missing_end_tokens(self):
        for source, position in (("  P ∨ Q", 5), ("P →", 4), ("(P", 3), ("P Q", 3), (" S", 2), ("", 1)):
            with self.subTest(source=source):
                graph = composition(); graph["goal"] = source
                self.assert_syntax_diagnostic(compile_graph(graph)["diagnostics"][0], "goal", position)

    def test_module_formal_input_errors_use_module_and_parameter_identity(self):
        graph = modular_graph(); graph["modules"][0]["inputs"][0]["type"] = "Real.pi = 0"
        diagnostic = compile_graph(graph)["diagnostics"][0]
        self.assert_syntax_diagnostic(diagnostic, "assumption", 2)
        self.assertEqual(diagnostic["moduleId"], "identity")
        self.assertEqual(diagnostic["assumptionId"], "value")

    def test_module_output_errors_use_module_goal_context(self):
        graph = modular_graph(); graph["modules"][0]["outputType"] = "P ∨ Q"
        diagnostic = compile_graph(graph)["diagnostics"][0]
        self.assert_syntax_diagnostic(diagnostic, "goal", 3)
        self.assertEqual(diagnostic["moduleId"], "identity")

    def test_invalid_json_type_and_size_errors_have_safe_positions(self):
        for source, position in ((None, 1), ([], 1), ("P" * 513, 513)):
            graph = composition(); graph["goal"] = source
            diagnostic = compile_graph(graph)["diagnostics"][0]
            self.assert_syntax_diagnostic(diagnostic, "goal", position)


if __name__ == "__main__":
    unittest.main()
