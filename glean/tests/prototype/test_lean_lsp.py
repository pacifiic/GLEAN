from glean.prototype.limits import MAX_SOURCE_BYTES
"""Exercise fixed Lean project profiles and versioned, real language-server sessions."""

from pathlib import Path
import io
import json
import threading
import time
import unittest
from unittest.mock import patch
from http import HTTPStatus

from glean.prototype.lean_project import list_projects, toolchain
from glean.prototype.lean_lsp import (
    LeanSessionError, LeanSessionManager, _LeanClient, _read_message, _hover_text,
    extract_declarations, validate_source,
)


class LeanSourceBoundaryTests(unittest.TestCase):
    def test_structured_goal_context_releases_rpc_handles_and_preserves_ids(self):
        manager = LeanSessionManager()
        try:
            with patch("glean.prototype.lean_lsp._LeanClient") as client_type:
                opened = manager.open_document("glean", "Branches.lean", "example : True := by trivial\n")
                def reply(method, params, timeout):
                    if method == "$/lean/rpc/connect":
                        return {"sessionId": "rpc-1"}
                    if method == "$/lean/rpc/call":
                        return {"goals": [{"mvarId": "goal.left", "userName": "left", "ctx": {"p": "2"},
                            "type": {"tag": [{"info": {"p": "1"}}, {"append": [{"text": "n"}, {"text": " = n"}]}]},
                            "hyps": [{"names": ["n"], "fvarIds": ["local.n"], "type": {"text": "Nat"}}]}]}
                    if method == "$/lean/plainGoal":
                        return {"goals": ["n : Nat\n⊢ n = n"]}
                    return None
                client_type.return_value.request.side_effect = reply
                result = manager.context(opened["sessionId"], 0, 0, 1)
                self.assertEqual(result["structuredGoals"][0]["mvarId"], "goal.left")
                self.assertEqual(result["structuredGoals"][0]["type"], "n = n")
                self.assertEqual(result["structuredGoals"][0]["hypotheses"][0]["fvarId"], "local.n")
                self.assertEqual(result["position"], {"line": 0, "character": 0})
                calls = client_type.return_value.request.call_args_list
                waits = [call for call in calls if call.args[0] == "textDocument/waitForDiagnostics"]
                self.assertTrue(all(call.args[2] <= 1 for call in waits))
                releases = [call for call in client_type.return_value.notify.call_args_list if call.args[0] == "$/lean/rpc/release"]
                self.assertEqual(len(releases), 1)
                self.assertCountEqual(releases[0].args[1]["refs"], [{"p": "1"}, {"p": "2"}])
        finally:
            manager.close_all()

    def test_rpc_reconnect_does_not_reuse_expired_remote_handles(self):
        manager = LeanSessionManager()
        try:
            with patch("glean.prototype.lean_lsp._LeanClient") as client_type:
                opened = manager.open_document("glean", "Reconnect.lean", "example : True := by trivial\n")
                connections = []
                def reply(method, params, timeout):
                    if method == "$/lean/rpc/connect":
                        connections.append(str(len(connections) + 1))
                        return {"sessionId": connections[-1]}
                    if method == "$/lean/rpc/call" and params["sessionId"] == "1":
                        raise LeanSessionError("Outdated RPC session", "rpc_reconnect")
                    if method == "$/lean/rpc/call":
                        return {"goals": []}
                    return None
                client_type.return_value.request.side_effect = reply
                result = manager.context(opened["sessionId"], 0, 0, 1)
                self.assertEqual(connections, ["1", "2"])
                self.assertEqual(result["structuredGoals"], [])
        finally:
            manager.close_all()

    def test_project_ids_are_a_fixed_allowlist(self):
        projects = list_projects()
        self.assertEqual({project["id"] for project in projects}, {"glean", "mathlib"})
        command, cwd = toolchain("glean")
        self.assertEqual(command[-2:], ["env", "lean"])
        self.assertEqual(Path(cwd).name, "glean")
        for project in ("../", "/tmp", "missing", [], None):
            with self.subTest(project=project), self.assertRaises(ValueError):
                toolchain(project)

    def test_sources_are_bounded_and_filenames_never_become_paths(self):
        validate_source("Example.lean", "example : ∀ n : Nat, n = n := by intro n; rfl")
        for filename in ("../Secret.lean", "/tmp/Secret.lean", "x\\y.lean", "README", "", [], "bad\n.lean"):
            with self.subTest(filename=filename), self.assertRaises(LeanSessionError):
                validate_source(filename, "")
        for source in (None, [], "x" * (MAX_SOURCE_BYTES + 1), "a\x00b", "\ud800"):
            with self.subTest(source_type=type(source)), self.assertRaises(LeanSessionError):
                validate_source("Example.lean", source)

    def test_declaration_index_ignores_comments_and_strings(self):
        source = '''/- theorem fake : False := by sorry
/- nested -/ -/
def text := "theorem fake2 : False"
-- theorem fake3 : False
@[simp] theorem real (n : Nat) : n = n := by rfl
private lemma next : True := True.intro
example (n : Nat) : n = n := by rfl
'''
        declarations = extract_declarations(source)
        self.assertEqual([item["name"] for item in declarations[:3]], ["text", "real", "next"])
        self.assertEqual([item["kind"] for item in declarations], ["def", "theorem", "lemma", "example"])
        self.assertEqual(declarations[1]["range"]["start"]["line"], 4)
        self.assertEqual(declarations[1]["range"]["end"]["line"], 5)

    def test_framed_protocol_preserves_unicode_and_bounds_messages(self):
        message = {"result": {"goals": ["n : ℕ\n⊢ n = n"]}}
        encoded = json.dumps(message, ensure_ascii=False).encode()
        framed = f"Content-Length: {len(encoded)}\r\n\r\n".encode() + encoded
        self.assertEqual(_read_message(io.BytesIO(framed)), message)
        for malformed in (b"Content-Length: 999999999\r\n\r\n", b"Content-Length: -1\r\n\r\n",
                          b"Content-Length: 4\r\n\r\n{}", b"x" * 8193):
            with self.subTest(malformed=malformed[:40]), self.assertRaises((ValueError, EOFError)):
                _read_message(io.BytesIO(malformed))

    def test_hover_text_preserves_only_standard_text_content(self):
        self.assertEqual(_hover_text({"contents": {"kind": "markdown", "value": "Nat"}}), "Nat")
        self.assertEqual(_hover_text({"contents": ["first", {"language": "lean", "value": "n : Nat"}]}), "first\nn : Nat")
        self.assertEqual(_hover_text(None), "")
        self.assertEqual(_hover_text({"range": {}, "contents": {"value": []}}), "")

    def test_http_error_preserves_session_code_for_reconnection(self):
        from glean.prototype.server import Handler
        handler = object.__new__(Handler)
        with patch.object(handler, "_send") as send:
            handler._error(HTTPStatus.NOT_FOUND, "expired", code="not_found")
        self.assertEqual(send.call_args.args[1]["code"], "not_found")
        self.assertEqual(send.call_args.args[1]["diagnostics"][0]["message"], "expired")

    def test_timed_out_request_is_cancelled_and_removed(self):
        client = object.__new__(_LeanClient)
        client._next_id, client._pending, client._lock = 0, {}, threading.Lock()
        sent = []
        client._send = sent.append
        with self.assertRaises(LeanSessionError) as raised:
            client.request("test", {}, 0.001)
        self.assertEqual(raised.exception.code, "timeout")
        self.assertEqual(client._pending, {})
        self.assertEqual(sent[-1]["method"], "$/cancelRequest")

    def test_old_diagnostics_and_inflight_context_are_discarded(self):
        manager = LeanSessionManager()
        with patch("glean.prototype.lean_lsp._LeanClient") as client_type:
            opened = manager.open_document("glean", "Versioned.lean", "example : True := by trivial\n")
            session = manager._get(opened["sessionId"])
            session.notification("textDocument/publishDiagnostics", {
                "uri": session.uri, "version": 0, "diagnostics": [{"severity": 1, "message": "old"}]})
            self.assertEqual(session.diagnostics, [])
            def reply(method, params, timeout):
                if method == "$/lean/plainGoal":
                    manager.update_document(opened["sessionId"], "example : True := True.intro\n", 1)
                    return {"goals": ["old goal"], "rendered": "old goal"}
                return None
            client_type.return_value.request.side_effect = reply
            result = manager.context(opened["sessionId"], 0, 0, 1)
            self.assertTrue(result["stale"])
            self.assertEqual(result["version"], 2)
            self.assertEqual(result["goals"], [])
            self.assertEqual(result["diagnostics"], [])
            manager.close_all()

    def test_idle_sessions_are_reaped_after_reload_without_another_open(self):
        closed = threading.Event()
        manager = LeanSessionManager(idle_timeout=0.05)
        try:
            with patch("glean.prototype.lean_lsp._LeanClient") as client_type:
                client_type.return_value.close.side_effect = closed.set
                opened = manager.open_document("glean", "Abandoned.lean", "example : True := True.intro")
                self.assertTrue(closed.wait(timeout=2), "Abandoned session was not closed by the reaper.")
                with self.assertRaises(LeanSessionError) as error:
                    manager.context(opened["sessionId"], 0, 0, 1)
                self.assertEqual(error.exception.code, "not_found")
        finally:
            manager.close_all()

    def test_idle_reaping_preserves_an_active_context_query(self):
        manager = LeanSessionManager(idle_timeout=120)
        try:
            with patch("glean.prototype.lean_lsp._LeanClient") as client_type:
                opened = manager.open_document("glean", "Active.lean", "example : True := True.intro")
                session = manager._get(opened["sessionId"])
                session.last_access = 0
                session.query_lock.acquire()
                manager.cleanup_expired()
                client_type.return_value.close.assert_not_called()
                session.query_lock.release()
                manager.cleanup_expired()
                client_type.return_value.close.assert_called_once()
        finally:
            manager.close_all()


class ActualLeanSessionTests(unittest.TestCase):
    def setUp(self):
        self.manager = LeanSessionManager(max_sessions=2)

    def tearDown(self):
        self.manager.close_all()

    def test_quantifiers_equalities_goal_context_updates_and_stale_responses(self):
        source = "theorem quantified : ∀ n : Nat, n = n := by\n  intro n\n  rfl\n"
        opened = self.manager.open_document("glean", "Quantified.lean", source)
        self.assertEqual(opened["version"], 1)
        context = self.manager.context(opened["sessionId"], 2, 2, 1)
        self.assertFalse(context["stale"])
        self.assertIn("n : Nat", "\n".join(context["goals"]))
        self.assertIn("⊢ n = n", "\n".join(context["goals"]))
        self.assertFalse(any(item.get("severity") == 1 for item in context["diagnostics"]))
        changed = self.manager.update_document(opened["sessionId"], source.replace("rfl", "exact False.elim"), 1)
        self.assertEqual(changed["version"], 2)
        stale = self.manager.context(opened["sessionId"], 2, 2, 1)
        self.assertTrue(stale["stale"])
        self.assertEqual(stale["goals"], [])
        rejected = self.manager.update_document(opened["sessionId"], source, 1)
        self.assertTrue(rejected["stale"])
        self.assertEqual(rejected["version"], 2)
        context = self.manager.context(opened["sessionId"], 2, 2, 2)
        self.assertTrue(any(item.get("severity") == 1 for item in context["diagnostics"]), context)
        self.assertTrue(self.manager.close_document(opened["sessionId"])["closed"])
        with self.assertRaises(LeanSessionError):
            self.manager.context(opened["sessionId"], 0, 0, 2)

    def test_session_limit_and_position_validation(self):
        source = "example : True := True.intro\n"
        one = self.manager.open_document("glean", "One.lean", source)
        self.manager.open_document("glean", "Two.lean", source)
        with self.assertRaises(LeanSessionError):
            self.manager.open_document("glean", "Three.lean", source)
        for line, character in ((-1, 0), (0, -1), (True, 0), (0, []), (20, 0), (0, 10000)):
            with self.subTest(line=line, character=character), self.assertRaises(LeanSessionError):
                self.manager.context(one["sessionId"], line, character, 1)

    def test_actual_pi_proof_exposes_its_local_context(self):
        projects = {item["id"]: item for item in list_projects()}
        if not projects["mathlib"]["available"]:
            self.skipTest("The fixed mathlib audit cache is unavailable.")
        root = Path(projects["mathlib"]["root"])
        source = (root / "Mathlib/Analysis/Real/Pi/Irrational.lean").read_text()
        line = max(i for i, text in enumerate(source.splitlines()) if text.strip() == "lia")
        opened = self.manager.open_document("mathlib", "Irrational.lean", source)
        context = self.manager.context(opened["sessionId"], line, 2, 1)
        goals = "\n".join(context["goals"])
        self.assertIn("z : ℤ", goals)
        self.assertIn("⊢ False", goals)
        self.assertFalse(any(item.get("severity") == 1 for item in context["diagnostics"]), context)

    def test_actual_structured_branches_track_local_scope_and_completion(self):
        source = ("theorem branches (P : Prop) : P → P := by\n"
                  "  intro hp\n  by_cases h : P\n  · exact h\n  · exact hp\n")
        opened = self.manager.open_document("glean", "Branches.lean", source)
        sid = opened["sessionId"]
        both = self.manager.context(sid, 3, 2, 1)
        goals = both["structuredGoals"]
        self.assertEqual(len(goals), 2)
        self.assertNotEqual(goals[0]["mvarId"], goals[1]["mvarId"])
        local_h = [[hyp for hyp in goal["hypotheses"] if hyp["name"] == "h"][0] for goal in goals]
        self.assertEqual({hyp["type"] for hyp in local_h}, {"P", "¬P"})
        self.assertNotEqual(local_h[0]["fvarId"], local_h[1]["fvarId"])
        remaining = self.manager.context(sid, 4, 2, 1)
        self.assertEqual(len(remaining["structuredGoals"]), 1)
        self.assertEqual(remaining["structuredGoals"][0]["mvarId"], goals[1]["mvarId"])
        done = self.manager.context(sid, 4, 12, 1)
        self.assertEqual(done["structuredGoals"], [])
        self.manager.update_document(sid, source.replace("exact hp", "exact h"), 1)
        stale = self.manager.context(sid, 4, 2, 1)
        self.assertTrue(stale["stale"])
        self.assertEqual(stale["structuredGoals"], [])

    def test_early_cursor_does_not_wait_for_a_later_long_running_command(self):
        source = "theorem early : True := by\n  trivial\n\n#eval IO.sleep 10000\n"
        opened = self.manager.open_document("glean", "Incremental.lean", source)
        started = time.monotonic()
        context = self.manager.context(opened["sessionId"], 1, 2, 1)
        self.assertLess(time.monotonic() - started, 6)
        self.assertEqual(context["structuredGoals"][0]["type"], "True")
        self.assertFalse(context["diagnosticsComplete"])


if __name__ == "__main__":
    unittest.main()
