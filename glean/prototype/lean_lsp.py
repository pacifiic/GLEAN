# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Bounded, versioned Lean LSP sessions with source-derived navigation metadata."""

import atexit
from collections import deque
import json
import os
from pathlib import Path
import queue
import re
import signal
import subprocess
import threading
import time
import uuid

from .lean_project import list_projects, toolchain


from .limits import MAX_SOURCE_BYTES
MAX_MESSAGE_BYTES = 8 * 1024 * 1024
REQUEST_TIMEOUT = 120
SESSION_IDLE_SECONDS = 120
_DECLARATION = re.compile(
    r"^\s*(?:@\[[^\]\n]*\]\s*)*(?:(?:private|protected|noncomputable|unsafe|partial|public)\s+)*"
    r"(theorem|lemma|def|abbrev|opaque|axiom|constant|inductive|structure|class|example)\b"
    r"(?:\s+([^\s:({⦃\[]+))?"
)


class LeanSessionError(ValueError):
    def __init__(self, message, code="invalid_request"):
        super().__init__(message)
        self.code = code


def validate_source(filename, source):
    if (not isinstance(filename, str) or not 1 <= len(filename) <= 128
            or not filename.endswith(".lean") or filename in (".lean", "..lean")
            or any(character in filename for character in ("/", "\\"))
            or any(ord(character) < 32 for character in filename)):
        raise LeanSessionError("파일 이름은 경로가 없는 .lean 파일 이름이어야 합니다.")
    if not isinstance(source, str) or "\x00" in source:
        raise LeanSessionError("Lean 소스는 NUL 문자가 없는 텍스트여야 합니다.")
    try:
        length = len(source.encode("utf-8"))
        filename.encode("utf-8")
    except UnicodeError as error:
        raise LeanSessionError("Lean 소스와 파일 이름은 올바른 UTF-8 텍스트여야 합니다.") from error
    if length > MAX_SOURCE_BYTES:
        raise LeanSessionError("Lean 파일은 8 MiB 이하여야 합니다.", "too_large")


def _mask_comments_and_strings(source):
    result = list(source)
    depth, quoted, index = 0, False, 0
    while index < len(source):
        two = source[index:index + 2]
        if depth:
            if two == "/-":
                depth += 1
            elif two == "-/":
                depth -= 1
            else:
                if source[index] != "\n":
                    result[index] = " "
                index += 1
                continue
            result[index:index + 2] = [" ", " "]
            index += 2
        elif quoted:
            if source[index] == "\\":
                result[index:index + 2] = ["\n" if character == "\n" else " " for character in source[index:index + 2]]
                index += 2
                continue
            if source[index] == '"':
                quoted = False
            if source[index] != "\n":
                result[index] = " "
            index += 1
        elif two == "--":
            end = source.find("\n", index)
            end = len(source) if end < 0 else end
            result[index:end] = [" "] * (end - index)
            index = end
        elif two == "/-":
            depth = 1
            result[index:index + 2] = [" ", " "]
            index += 2
        elif source[index] == '"':
            quoted = True
            result[index] = " "
            index += 1
        else:
            index += 1
    return "".join(result)


def extract_declarations(source):
    """Conservative textual declaration index; this is not a proof dependency graph."""
    masked = _mask_comments_and_strings(source)
    declarations = []
    for line, text in enumerate(masked.split("\n")):
        found = _DECLARATION.match(text)
        if found is None:
            continue
        kind, name = found.groups()
        if kind == "example":
            name = f"example · {line + 1}"
        elif not name:
            continue
        start = {"line": line, "character": len(text[:found.start(1)].encode("utf-16-le")) // 2}
        if declarations:
            declarations[-1]["range"]["end"] = {"line": line, "character": 0}
        declarations.append({"id": f"declaration-{len(declarations)}", "name": name,
                             "kind": kind, "range": {"start": start, "end": start}})
    if declarations:
        lines = source.split("\n")
        declarations[-1]["range"]["end"] = {
            "line": len(lines) - 1, "character": len(lines[-1].encode("utf-16-le")) // 2}
    return declarations


def _hover_text(hover):
    contents = hover.get("contents") if isinstance(hover, dict) else hover
    values = contents if isinstance(contents, list) else [contents]
    text = []
    for value in values:
        if isinstance(value, dict):
            value = value.get("value")
        if isinstance(value, str):
            text.append(value)
    return "\n".join(text)


def _code_text(code):
    """Strip Lean's tagged pretty-printing without retaining remote references."""
    if not isinstance(code, dict):
        return ""
    if isinstance(code.get("text"), str):
        return code["text"]
    if isinstance(code.get("append"), list):
        return "".join(_code_text(item) for item in code["append"])
    if isinstance(code.get("tag"), list) and len(code["tag"]) == 2:
        return _code_text(code["tag"][1])
    return ""


def _rpc_refs(value):
    if isinstance(value, dict):
        if set(value) in ({"p"}, {"__rpcref"}):
            yield value
        else:
            for child in value.values():
                yield from _rpc_refs(child)
    elif isinstance(value, list):
        for child in value:
            yield from _rpc_refs(child)


def _structured_goals(raw):
    result = []
    for goal in (raw or {}).get("goals", []):
        hypotheses = []
        for bundle in goal.get("hyps", []):
            for name, identifier in zip(bundle.get("names", []), bundle.get("fvarIds", [])):
                hypotheses.append({"name": name, "fvarId": identifier,
                    "type": _code_text(bundle.get("type")), "value": _code_text(bundle.get("val")),
                    "isInstance": bool(bundle.get("isInstance")), "isType": bool(bundle.get("isType"))})
        result.append({"mvarId": goal["mvarId"], "name": goal.get("userName", ""),
            "type": _code_text(goal.get("type")), "prefix": goal.get("goalPrefix", "⊢ "),
            "hypotheses": hypotheses})
    return result


def _read_message(stream):
    length = None
    header_bytes = 0
    while True:
        line = stream.readline(8193)
        if not line:
            raise EOFError("Lean language server closed its output.")
        header_bytes += len(line)
        if header_bytes > 8192:
            raise ValueError("Oversized LSP header.")
        if line in (b"\r\n", b"\n"):
            break
        key, _, value = line.partition(b":")
        if key.lower() == b"content-length":
            length = int(value.strip())
    if length is None or not 0 <= length <= MAX_MESSAGE_BYTES:
        raise ValueError("Invalid LSP message size.")
    body = bytearray()
    while len(body) < length:
        chunk = stream.read(length - len(body))
        if not chunk:
            raise EOFError("Incomplete LSP message.")
        body.extend(chunk)
    message = json.loads(body)
    if not isinstance(message, dict):
        raise ValueError("Invalid LSP message.")
    return message


class _LeanClient:
    def __init__(self, project_id, notification, timeout):
        command, cwd = toolchain(project_id)
        self._lock = threading.Lock()
        self._write_lock = threading.Lock()
        self._pending = {}
        self._next_id = 0
        self._closed = False
        self._failure = None
        self._notification = notification
        self.stderr = deque(maxlen=32)
        self.process = subprocess.Popen(command + ["--server"], cwd=cwd, stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        start_new_session=True)
        self._reader = threading.Thread(target=self._read, daemon=True, name="glean-lean-lsp")
        self._errors = threading.Thread(target=self._read_errors, daemon=True, name="glean-lean-stderr")
        self._reader.start()
        self._errors.start()
        try:
            self.request("initialize", {
                "processId": os.getpid(), "rootUri": Path(cwd).as_uri(),
                "clientInfo": {"name": "GLEAN", "version": "0.2"},
                "capabilities": {"textDocument": {"publishDiagnostics": {"versionSupport": True}},
                                 "general": {"positionEncodings": ["utf-16"]}},
                "workspaceFolders": [{"uri": Path(cwd).as_uri(), "name": project_id}],
            }, timeout)
            self.notify("initialized", {})
        except Exception:
            self.close()
            raise

    def _send(self, message):
        encoded = json.dumps({"jsonrpc": "2.0", **message}, ensure_ascii=False).encode("utf-8")
        with self._write_lock:
            if self._closed:
                raise LeanSessionError("Lean 세션이 종료되었습니다.", "closed")
            if self._failure is not None:
                raise LeanSessionError(self._failure, "server_error")
            try:
                self.process.stdin.write(f"Content-Length: {len(encoded)}\r\n\r\n".encode() + encoded)
                self.process.stdin.flush()
            except (OSError, ValueError) as error:
                raise LeanSessionError("Lean 언어 서버와 통신하지 못했습니다.", "server_error") from error

    def notify(self, method, params):
        self._send({"method": method, "params": params})

    def request(self, method, params, timeout):
        if timeout <= 0:
            raise LeanSessionError("Lean 문맥 조회 시간이 초과되었습니다. 잠시 후 다시 조회하세요.", "timeout")
        response = queue.Queue(maxsize=1)
        with self._lock:
            self._next_id += 1
            identifier = self._next_id
            self._pending[identifier] = response
        try:
            self._send({"id": identifier, "method": method, "params": params})
            try:
                message = response.get(timeout=timeout)
            except queue.Empty as error:
                try:
                    self.notify("$/cancelRequest", {"id": identifier})
                except LeanSessionError:
                    pass
                raise LeanSessionError("Lean 문맥 조회 시간이 초과되었습니다. 잠시 후 다시 조회하세요.", "timeout") from error
            if "error" in message:
                detail = message["error"].get("message", "Lean 언어 서버 오류")
                code = "rpc_reconnect" if message["error"].get("code") == -32900 else "server_error"
                raise LeanSessionError(str(detail), code)
            return message.get("result")
        finally:
            with self._lock:
                self._pending.pop(identifier, None)

    def _read(self):
        failure = "Lean 언어 서버가 종료되었습니다."
        try:
            while True:
                message = _read_message(self.process.stdout)
                if "method" in message:
                    if "id" in message:
                        method = message["method"]
                        if method == "workspace/configuration":
                            result = [None for _ in message.get("params", {}).get("items", [])]
                        elif method == "workspace/applyEdit":
                            result = {"applied": False}
                        else:
                            result = None
                        self._send({"id": message["id"], "result": result})
                    else:
                        self._notification(message["method"], message.get("params", {}))
                elif "id" in message:
                    with self._lock:
                        pending = self._pending.get(message["id"])
                    if pending is not None:
                        pending.put_nowait(message)
        except (OSError, EOFError, ValueError, KeyError, queue.Full) as error:
            failure = str(error)
        finally:
            self._failure = failure
            with self._lock:
                for pending in self._pending.values():
                    try:
                        pending.put_nowait({"error": {"message": failure}})
                    except queue.Full:
                        pass

    def _read_errors(self):
        try:
            for line in iter(lambda: self.process.stderr.readline(4096), b""):
                self.stderr.append(line.decode("utf-8", errors="replace"))
        except (OSError, ValueError):
            pass

    def close(self):
        if self._closed:
            return
        self._closed = True
        try:
            os.killpg(self.process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            self.process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(self.process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            self.process.wait(timeout=2)
        self._reader.join(timeout=1)
        self._errors.join(timeout=1)
        for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
            stream.close()


class _Session:
    def __init__(self, project_id, filename, source, timeout):
        self.session_id = uuid.uuid4().hex
        self.project_id = project_id
        self.filename = filename
        self.source = source
        self.version = 1
        self.last_access = time.monotonic()
        self.lock = threading.RLock()
        self.query_lock = threading.Lock()
        self.diagnostics = []
        self.checked_version = 0
        self.rpc_session = None
        self.declarations = extract_declarations(source)
        _, root = toolchain(project_id)
        self.uri = (root / f"GleanSession_{self.session_id}.lean").as_uri()
        self.client = _LeanClient(project_id, self.notification, timeout)
        try:
            self.client.notify("textDocument/didOpen", {
                "textDocument": {"uri": self.uri, "languageId": "lean4", "version": 1, "text": source},
                "dependencyBuildMode": "never",
            })
        except Exception:
            self.client.close()
            raise

    def notification(self, method, params):
        if method != "textDocument/publishDiagnostics" or params.get("uri") != self.uri:
            return
        with self.lock:
            if params.get("version") != self.version:
                return
            diagnostics = params.get("diagnostics", [])
            if not isinstance(diagnostics, list):
                return
            if params.get("isIncremental"):
                self.diagnostics.extend(diagnostics)
            else:
                self.diagnostics = diagnostics

    def metadata(self):
        return {"sessionId": self.session_id, "projectId": self.project_id,
                "filename": self.filename, "version": self.version,
                "declarations": self.declarations, "stale": False}

    def stale_context(self):
        return {**self.metadata(), "stale": True, "goals": [], "renderedGoals": "",
                "structuredGoals": [], "position": None,
                "termGoal": None, "termGoalText": "", "hover": None, "hoverText": "", "diagnostics": []}

    def interactive_goals(self, params, request):
        for attempt in range(2):
            if self.rpc_session is None:
                self.rpc_session = request("$/lean/rpc/connect", {"uri": self.uri})["sessionId"]
            self.client.notify("$/lean/rpc/keepAlive", {"uri": self.uri, "sessionId": self.rpc_session})
            try:
                raw = request("$/lean/rpc/call", {**params, "sessionId": self.rpc_session,
                              "method": "Lean.Widget.getInteractiveGoals", "params": params})
            except LeanSessionError as error:
                if error.code != "rpc_reconnect" or attempt:
                    raise
                self.rpc_session = None
                continue
            try:
                return _structured_goals(raw)
            finally:
                refs = list(_rpc_refs(raw))
                if refs:
                    self.client.notify("$/lean/rpc/release", {
                        "uri": self.uri, "sessionId": self.rpc_session, "refs": refs})


class LeanSessionManager:
    def __init__(self, max_sessions=2, request_timeout=REQUEST_TIMEOUT, idle_timeout=SESSION_IDLE_SECONDS):
        self.max_sessions = max_sessions
        self.request_timeout = request_timeout
        self.idle_timeout = idle_timeout
        self._sessions = {}
        self._opening = 0
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._reaper = threading.Thread(target=self._reap, daemon=True, name="glean-lean-session-reaper")
        self._reaper.start()

    def _reap(self):
        while not self._stop.wait(min(15, max(0.025, self.idle_timeout / 2))):
            self.cleanup_expired()

    def cleanup_expired(self):
        expired = []
        with self._lock:
            now = time.monotonic()
            for identifier, session in list(self._sessions.items()):
                if now - session.last_access > self.idle_timeout and not session.query_lock.locked():
                    expired.append(self._sessions.pop(identifier))
        for session in expired:
            session.client.close()

    def _get(self, session_id):
        with self._lock:
            session = self._sessions.get(session_id) if isinstance(session_id, str) else None
            if session is None:
                raise LeanSessionError("Lean 세션을 찾을 수 없습니다. 파일을 다시 여세요.", "not_found")
            session.last_access = time.monotonic()
            return session

    def open_document(self, project_id, filename, source):
        validate_source(filename, source)
        try:
            toolchain(project_id)
        except ValueError as error:
            raise LeanSessionError(str(error), "project_unavailable") from error
        self.cleanup_expired()
        with self._lock:
            if self._stop.is_set():
                raise LeanSessionError("Lean 세션 관리자가 종료되었습니다.", "closed")
            if len(self._sessions) + self._opening >= self.max_sessions:
                raise LeanSessionError("Lean 파일은 동시에 두 개까지 열 수 있습니다. 사용 중인 파일을 먼저 닫으세요.", "session_limit")
            self._opening += 1
        try:
            session = _Session(project_id, filename, source, self.request_timeout)
            with self._lock:
                stopped = self._stop.is_set()
                if not stopped:
                    self._sessions[session.session_id] = session
            if stopped:
                session.client.close()
                raise LeanSessionError("Lean 세션 관리자가 종료되었습니다.", "closed")
            return session.metadata()
        except (OSError, subprocess.SubprocessError) as error:
            raise LeanSessionError("Lean 언어 서버를 시작하지 못했습니다.", "server_error") from error
        finally:
            with self._lock:
                self._opening -= 1

    def update_document(self, session_id, source, version=None):
        session = self._get(session_id)
        validate_source(session.filename, source)
        if version is not None and (type(version) is not int or version < 1):
            raise LeanSessionError("문서 버전은 양의 정수여야 합니다.")
        with session.lock:
            if version is not None and version != session.version:
                return {**session.metadata(), "stale": True}
            session.version += 1
            session.source = source
            session.diagnostics = []
            session.checked_version = 0
            session.declarations = extract_declarations(source)
            session.client.notify("textDocument/didChange", {
                "textDocument": {"uri": session.uri, "version": session.version},
                "contentChanges": [{"text": source}],
            })
            return session.metadata()

    def context(self, session_id, line, character, version):
        session = self._get(session_id)
        if type(version) is not int or version < 1:
            raise LeanSessionError("문서 버전은 양의 정수여야 합니다.")
        with session.lock:
            if version != session.version:
                return session.stale_context()
            lines = session.source.replace("\r\n", "\n").split("\n")
            if (type(line) is not int or type(character) is not int or not 0 <= line < len(lines)
                    or not 0 <= character <= len(lines[line].encode("utf-16-le")) // 2):
                raise LeanSessionError("문맥 위치는 파일 안의 0부터 시작하는 UTF-16 행·열이어야 합니다.")
        deadline = time.monotonic() + self.request_timeout
        if not session.query_lock.acquire(timeout=self.request_timeout):
            raise LeanSessionError("다른 Lean 문맥을 조회 중입니다. 잠시 후 다시 조회하세요.", "busy")
        try:
            with session.lock:
                if version != session.version:
                    return session.stale_context()
            request = lambda method, params: session.client.request(method, params, deadline - time.monotonic())
            params = {"textDocument": {"uri": session.uri}, "position": {"line": line, "character": character}}
            # Goal requests wait for the cursor's elaboration snapshot, not the entire file.
            goals = request("$/lean/plainGoal", params)
            with session.lock:
                if version != session.version:
                    return session.stale_context()
            structured = session.interactive_goals(params, request)
            term_goal = request("$/lean/plainTermGoal", params)
            hover = request("textDocument/hover", params)
            diagnostics_complete = session.checked_version == version
            if not diagnostics_complete:
                try:
                    session.client.request("textDocument/waitForDiagnostics", {"uri": session.uri, "version": version},
                                           min(1, max(0, deadline - time.monotonic())))
                    diagnostics_complete = True
                except LeanSessionError as error:
                    if error.code != "timeout":
                        raise
            with session.lock:
                if version != session.version:
                    return session.stale_context()
                if diagnostics_complete:
                    session.checked_version = version
                return {**session.metadata(), "goals": goals.get("goals", []) if goals else [],
                        "structuredGoals": structured, "position": params["position"],
                        "diagnosticsComplete": diagnostics_complete,
                        "renderedGoals": goals.get("rendered", "") if goals else "",
                        "termGoal": term_goal, "termGoalText": term_goal.get("goal", "") if term_goal else "",
                        "hover": hover, "hoverText": _hover_text(hover), "diagnostics": list(session.diagnostics)}
        except LeanSessionError:
            with session.lock:
                if version != session.version:
                    return session.stale_context()
            raise
        finally:
            session.query_lock.release()

    def close_document(self, session_id):
        with self._lock:
            session = self._sessions.pop(session_id, None) if isinstance(session_id, str) else None
        if session is not None:
            session.client.close()
        return {"closed": session is not None}

    def close_all(self):
        self._stop.set()
        with self._lock:
            sessions, self._sessions = list(self._sessions.values()), {}
        for session in sessions:
            session.client.close()
        self._reaper.join(timeout=1)


_manager = LeanSessionManager()
open_document = _manager.open_document
update_document = _manager.update_document
context = _manager.context
close_document = _manager.close_document
close_all = _manager.close_all
atexit.register(_manager.close_all)
