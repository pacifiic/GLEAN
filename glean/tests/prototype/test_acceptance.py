"""Exercise complete graphs with real Lean and the local HTTP boundary."""

import copy
import http.client
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch

from glean.prototype.graph import compile_graph
from glean.prototype import server


EXAMPLES = Path(__file__).resolve().parents[2] / "prototype" / "examples"


def load_example(name):
    return json.loads((EXAMPLES / f"{name}.json").read_text(encoding="utf-8"))


class ProofAcceptanceTests(unittest.TestCase):
    def assert_verified(self, name):
        graph = load_example(name)["graph"]
        compiled = compile_graph(graph)
        self.assertEqual(compiled["status"], "ready", compiled["diagnostics"])
        result = server.check_graph(graph)
        self.assertTrue(result["verified"], result)
        self.assertEqual(result["status"], "valid")
        self.assertIn("does not depend on any axioms", result["lean"]["output"])
        self.assertIn("4.34.1", result["lean"]["version"])
        self.assertIn("#print axioms glean_proof", result["generatedCode"])
        self.assertNotIn("sorry", result["generatedCode"])
        return result

    def test_composition_is_checked_by_real_lean(self):
        self.assert_verified("compose")

    def test_conjunction_swap_is_checked_by_real_lean(self):
        self.assert_verified("swap-conjunction")

    def test_shared_function_module_and_groups_are_checked_by_real_lean(self):
        result = self.assert_verified("module-demo")
        self.assertEqual(result["generatedCode"].count("private theorem glean_module_0"), 1)
        self.assertEqual(result["generatedCode"].count("glean_module_0"), 3)
        self.assertEqual(result["nodeTypes"]["pair"], "R ∧ R")
        self.assertEqual(result["moduleNodeTypes"]["compose-module"]["apply2"], "R")
        graph = load_example("module-demo")["graph"]
        for group in graph["groups"] + graph["modules"][0]["groups"]:
            group["collapsed"] = not group["collapsed"]
        self.assertEqual(compile_graph(graph)["generatedCode"], result["generatedCode"])

    def test_type_error_never_verifies(self):
        graph = load_example("type-error")["graph"]
        result = server.check_graph(graph)
        self.assertEqual(result["status"], "invalid", result)
        self.assertFalse(result["verified"])
        self.assertTrue(result["diagnostics"])
        self.assertIsNone(result["generatedCode"])
        self.assertNotIn("lean", result)

    def test_real_lean_failure_cannot_be_marked_verified(self):
        compiled = {
            "status": "ready", "nodeTypes": {}, "diagnostics": [],
            "generatedCode": "module\npublic theorem glean_proof : False := True.intro\n#print axioms glean_proof\n",
        }
        with patch.object(server, "compile_graph", return_value=compiled):
            result = server.check_graph({})
        self.assertFalse(result["verified"], result)
        self.assertEqual(result["status"], "invalid")
        self.assertIn("error:", result["lean"]["output"])

    def test_real_lean_sorry_axiom_cannot_be_marked_verified(self):
        compiled = {
            "status": "ready", "nodeTypes": {}, "diagnostics": [],
            "generatedCode": "module\npublic theorem glean_proof : False := by sorry\n#print axioms glean_proof\n",
        }
        with patch.object(server, "compile_graph", return_value=compiled):
            result = server.check_graph({})
        self.assertFalse(result["verified"], result)
        self.assertNotEqual(result["status"], "valid")
        self.assertIn("sorryAx", result["lean"]["output"])

    def test_missing_wire_never_verifies(self):
        graph = load_example("compose")["graph"]
        graph["edges"] = [edge for edge in graph["edges"] if edge["target"] != "goal"]
        result = server.check_graph(graph)
        self.assertEqual(result["status"], "incomplete", result)
        self.assertFalse(result["verified"])
        self.assertNotIn("lean", result)

    def test_disconnected_invalid_node_never_verifies(self):
        graph = load_example("compose")["graph"]
        graph["nodes"].append({"id": "bad", "kind": "assumption", "ref": "missing"})
        result = server.check_graph(graph)
        self.assertEqual(result["status"], "invalid", result)
        self.assertFalse(result["verified"])
        self.assertNotIn("lean", result)

    def test_type_syntax_cannot_inject_lean(self):
        graph = load_example("compose")["graph"]
        graph["goal"] = "R := by sorry\naxiom forged : False"
        result = server.check_graph(graph)
        self.assertEqual(result["status"], "invalid", result)
        self.assertFalse(result["verified"])
        self.assertIsNone(result["generatedCode"])

    def test_assumption_identifiers_are_not_lean_identifiers(self):
        graph = load_example("compose")["graph"]
        original = graph["assumptions"][0]["id"]
        malicious = "hp); axiom forged : False --"
        graph["assumptions"][0]["id"] = malicious
        for node in graph["nodes"]:
            if node.get("ref") == original:
                node["ref"] = malicious
        result = server.check_graph(graph)
        if result["status"] == "valid":
            self.assertNotIn(malicious, result["generatedCode"])
            self.assertNotIn("axiom forged", result["generatedCode"])
            self.assertTrue(result["verified"])
        else:
            self.assertEqual(result["status"], "invalid", result)
            self.assertFalse(result["verified"])

    def test_layout_has_no_proof_semantics(self):
        graph = load_example("compose")["graph"]
        moved = copy.deepcopy(graph)
        for index, node in enumerate(moved["nodes"]):
            node.update(x=100 + index * 17, y=700 - index * 31)
        self.assertEqual(compile_graph(graph)["generatedCode"], compile_graph(moved)["generatedCode"])

    def test_examples_have_unique_ids_and_readable_metadata(self):
        examples = [json.loads(path.read_text(encoding="utf-8")) for path in EXAMPLES.glob("*.json")]
        self.assertEqual(len(examples), 4)
        self.assertEqual(len({example["id"] for example in examples}), 4)
        for example in examples:
            self.assertTrue(example["title"])
            self.assertTrue(example["description"])
            self.assertIn(example["graph"]["version"], (1, 2))


class HttpAcceptanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.create_server(host="127.0.0.1", port=0)
        cls.port = cls.httpd.server_address[1]
        cls.worker = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.worker.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.worker.join(timeout=5)

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, response.getheader("Content-Type"), response.read()
        finally:
            connection.close()

    def test_health_reports_pinned_lean(self):
        status, content_type, body = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertIn("application/json", content_type)
        result = json.loads(body)
        self.assertTrue(result["ok"])
        self.assertIn("4.34.1", result["leanVersion"])

    def test_examples_endpoint_exposes_graphs(self):
        status, _, body = self.request("GET", "/api/examples")
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual({example["id"] for example in result["examples"]},
                         {"compose", "swap-conjunction", "type-error", "module-demo"})

    def test_editor_module_is_served_as_javascript(self):
        status, content_type, body = self.request("GET", "/model.mjs")
        self.assertEqual(status, 200)
        self.assertIn("javascript", content_type)
        self.assertTrue(body)

    def test_api_checks_valid_graph(self):
        body = json.dumps(load_example("compose")["graph"]).encode("utf-8")
        status, _, response = self.request("POST", "/api/check", body,
                                           {"Content-Type": "application/json"})
        self.assertEqual(status, 200)
        result = json.loads(response)
        self.assertTrue(result["verified"], result)

    def test_escaped_unicode_ids_cannot_break_json_response(self):
        graph = load_example("compose")["graph"]
        unusual_id = "hp\ud800"
        for node in graph["nodes"]:
            if node["id"] == "hp":
                node["id"] = unusual_id
        for edge in graph["edges"]:
            if edge["source"] == "hp":
                edge["source"] = unusual_id
        body = json.dumps(graph).encode("utf-8")
        status, _, response = self.request("POST", "/api/check", body,
                                           {"Content-Type": "application/json"})
        self.assertIn(status, (200, 400))
        result = json.loads(response)
        if status == 200 and result["status"] == "valid":
            self.assertTrue(result["verified"])
            self.assertEqual(result["nodeTypes"][unusual_id], "P")
        else:
            self.assertFalse(result["verified"])
            self.assertTrue(result["diagnostics"])

    def test_malformed_json_is_400(self):
        status, content_type, body = self.request("POST", "/api/check", b'{"version":',
                                                {"Content-Type": "application/json"})
        self.assertEqual(status, 400)
        self.assertIn("application/json", content_type)
        self.assertTrue(json.loads(body)["diagnostics"])

    def test_malformed_request_target_returns_json_error(self):
        for method in ("GET", "POST"):
            with self.subTest(method=method):
                status, content_type, body = self.request(method, "http://[", b"{}", {
                    "Host": f"127.0.0.1:{self.port}", "Content-Type": "application/json"})
                self.assertEqual(status, 400)
                self.assertIn("application/json", content_type)
                self.assertTrue(json.loads(body)["diagnostics"])

    def test_foreign_origin_is_rejected(self):
        status, _, body = self.request("POST", "/api/check", b"{}",
                                      {"Origin": "https://example.com", "Content-Type": "application/json"})
        self.assertEqual(status, 403)
        self.assertTrue(json.loads(body)["diagnostics"])

    def test_foreign_host_is_rejected(self):
        status, _, body = self.request("GET", "/api/health", headers={"Host": "example.com"})
        self.assertEqual(status, 403)
        self.assertTrue(json.loads(body)["diagnostics"])

    def test_non_finite_json_numbers_are_rejected(self):
        status, _, body = self.request("POST", "/api/check", b'{"version": NaN}',
                                      {"Content-Type": "application/json"})
        self.assertEqual(status, 400)
        self.assertTrue(json.loads(body)["diagnostics"])

    def test_local_origin_is_accepted(self):
        status, _, body = self.request("GET", "/api/health", headers={
            "Origin": f"http://127.0.0.1:{self.port}"})
        self.assertEqual(status, 200, body)

    def test_oversized_request_is_rejected_before_read(self):
        status, _, body = self.request("POST", "/api/check", b"", {
            "Content-Type": "application/json", "Content-Length": str(server.MAX_REQUEST_BYTES + 1)})
        self.assertEqual(status, 413)
        self.assertTrue(json.loads(body)["diagnostics"])

    def test_static_traversal_cannot_read_repository(self):
        for path in ("/../../AGENTS.md", "/%2e%2e/%2e%2e/AGENTS.md", "/../PROTOCOL.md"):
            with self.subTest(path=path):
                status, _, body = self.request("GET", path)
                self.assertIn(status, (400, 403, 404))
                self.assertNotIn(b"Build System Safety", body)
                self.assertNotIn(b"GLEAN prototype contract", body)

    def test_server_cannot_bind_public_interfaces(self):
        with self.assertRaises(ValueError):
            server.create_server(host="0.0.0.0", port=0)


if __name__ == "__main__":
    unittest.main()
