"""Exercise the boundary between graph compilation and actual Lean verification."""

import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from glean.prototype import server


class VerificationBoundaryTests(unittest.TestCase):
    def test_incomplete_graph_never_launches_lean(self):
        result = {"status": "incomplete", "generatedCode": None,
                  "nodeTypes": {}, "diagnostics": []}
        with patch.object(server, "compile_graph", return_value=result), \
                patch.object(server, "_toolchain") as toolchain:
            self.assertFalse(server.check_graph({})["verified"])
            toolchain.assert_not_called()

    def test_successful_exit_without_axiom_audit_is_not_verified(self):
        result = {"status": "ready", "generatedCode": "module\n",
                  "nodeTypes": {}, "diagnostics": []}
        with patch.object(server, "compile_graph", return_value=result), \
                patch.object(server, "_toolchain", return_value=(["lean"], "Lean 4.34.1")), \
                patch.object(server.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "", "")):
            response = server.check_graph({})
        self.assertFalse(response["verified"])
        self.assertEqual(response["status"], "error")

    def test_timeout_never_keeps_ready_state(self):
        result = {"status": "ready", "generatedCode": "module\n",
                  "nodeTypes": {}, "diagnostics": []}
        with patch.object(server, "compile_graph", return_value=result), \
                patch.object(server, "_toolchain", return_value=(["lean"], "Lean 4.34.1")), \
                patch.object(server.subprocess, "run", side_effect=subprocess.TimeoutExpired("lean", 10)):
            response = server.check_graph({})
        self.assertFalse(response["verified"])
        self.assertEqual(response["status"], "error")

    def test_network_bind_cannot_be_public(self):
        with self.assertRaises(ValueError):
            server.create_server(host="0.0.0.0", port=0)


if __name__ == "__main__":
    unittest.main()
