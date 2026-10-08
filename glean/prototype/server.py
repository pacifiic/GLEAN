# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Local graph editor and bounded Lean verification service (Python stdlib only)."""

import argparse
from functools import lru_cache
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
import time
from urllib.parse import unquote, urlsplit

from .graph import compile_graph
from . import lean_lsp
from .lean_project import list_projects
from .source_check import SourceCheckService
from .graph_jobs import GraphCheckService

SOURCE_CHECKS = SourceCheckService()
GRAPH_CHECKS = GraphCheckService(SOURCE_CHECKS)
from .declaration_index import DeclarationIndexService
DECLARATION_INDEX = DeclarationIndexService()


ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
from .limits import MAX_REQUEST_BYTES
LEAN_TIMEOUT_SECONDS = 10
EXPECTED_LEAN_VERSION = "4.34.1"
_VERIFICATION_SLOTS = threading.BoundedSemaphore(2)


@lru_cache(maxsize=1)
def _toolchain():
    local = REPO / ".glean-tools/lean-4.34.1-darwin_aarch64/bin/lean"
    if local.is_file():
        command = [str(local)]
    elif shutil.which("lake"):
        command = [str(REPO / "glean/scripts/lake"), "env", "lean"]
    else:
        raise RuntimeError("Lean을 찾지 못했습니다. GLEAN.md의 설치 안내를 확인해 주세요.")
    result = subprocess.run(command + ["--version"], cwd=REPO / "glean",
                            capture_output=True, text=True, timeout=5)
    version = result.stdout.strip()
    if result.returncode or not re.search(r"\bversion 4\.34\.1(?:,|\s|\))", version):
        raise RuntimeError(f"Lean {EXPECTED_LEAN_VERSION}이 필요합니다. 감지한 버전: {version or result.stderr.strip()}")
    return command, version


def preview_graph(graph, scope="all"):
    """Compile the constrained graph without starting the Lean kernel."""
    from .graph_scope import compile_for_scope
    if isinstance(graph,dict) and graph.get('version')==3:
        from .typed_graph import compile_typed_graph
        return {**compile_typed_graph(graph), 'verified':False, 'preview':True}
    return {**compile_for_scope(graph, scope), "verified": False, "preview": True}


def check_graph(graph, scope="all"):
    """Only elevate a compiled graph after Lean accepts it and reports no axioms."""
    if scope == "all":
        compiled = compile_graph(graph)
    else:
        from .graph_scope import compile_for_scope
        compiled = compile_for_scope(graph, scope)
    response = {**compiled, "verified": False}
    if response["status"] != "ready":
        return response
    if not _VERIFICATION_SLOTS.acquire(blocking=False):
        response["status"] = "error"
        response["diagnostics"].append({"severity": "error", "message": "다른 증명을 검사 중입니다. 잠시 후 다시 검사해 주세요."})
        return response
    started = time.monotonic()
    version = None
    try:
        command, version = _toolchain()
        with tempfile.TemporaryDirectory(prefix="glean-check-") as directory:
            source = Path(directory) / "Proof.lean"
            source.write_text(response["generatedCode"], encoding="utf-8")
            checked = subprocess.run(command + [str(source)], cwd=REPO / "glean",
                                     capture_output=True, text=True,
                                     timeout=LEAN_TIMEOUT_SECONDS)
        output = (checked.stdout + checked.stderr).strip()
        audit = "'glean_proof' does not depend on any axioms"
        clean_audit = any(line.strip() == audit for line in output.splitlines())
        response["lean"] = {"version": version, "output": output,
                            "durationMs": round((time.monotonic() - started) * 1000)}
        if checked.returncode == 0 and clean_audit:
            response.update(status="valid", verified=True)
        elif checked.returncode:
            response["status"] = "invalid"
            response["diagnostics"].append({"severity": "error", "message": "Lean이 생성된 증명을 거부했습니다. Lean 출력에서 원인을 확인하세요."})
        else:
            response["status"] = "error"
            response["diagnostics"].append({"severity": "error", "message": "Lean의 추가 공리 검사 결과를 확인하지 못했습니다."})
    except subprocess.TimeoutExpired:
        response["status"] = "error"
        response["diagnostics"].append({"severity": "error", "message": f"Lean 검사가 {LEAN_TIMEOUT_SECONDS}초 안에 끝나지 않았습니다."})
    except (OSError, RuntimeError) as exc:
        response["status"] = "error"
        response["diagnostics"].append({"severity": "error", "message": str(exc)})
    finally:
        _VERIFICATION_SLOTS.release()
    return response


class Handler(BaseHTTPRequestHandler):
    server_version = "GLEAN/0.1"

    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def _send(self, status, data, content_type="application/json; charset=utf-8"):
        if isinstance(data, dict):
            data = json.dumps(data, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _error(self, status, message, code=None):
        self.close_connection = True
        data = {"status": "error", "verified": False, "generatedCode": None,
                "nodeTypes": {}, "diagnostics": [{"severity": "error", "message": message}]}
        if code is not None:
            data["code"] = code
        self._send(status, data)

    def _local_request(self):
        port = self.server.server_address[1]
        allowed = {f"localhost:{port}", f"127.0.0.1:{port}"}
        if self.headers.get("Host", "") not in allowed:
            self._error(HTTPStatus.FORBIDDEN, "이 서버는 로컬 주소로만 사용할 수 있습니다.")
            return False
        origin = self.headers.get("Origin")
        if origin is not None and origin not in {"http://" + host for host in allowed}:
            self._error(HTTPStatus.FORBIDDEN, "다른 웹사이트에서 보낸 요청은 허용하지 않습니다.")
            return False
        if self.headers.get("Sec-Fetch-Site") == "cross-site":
            self._error(HTTPStatus.FORBIDDEN, "다른 웹사이트에서 보낸 요청은 허용하지 않습니다.")
            return False
        return True

    def do_GET(self):
        if not self._local_request():
            return
        try:
            path = unquote(urlsplit(self.path).path)
        except ValueError:
            self._error(HTTPStatus.BAD_REQUEST, "잘못된 요청 경로입니다.")
            return
        if path == "/api/health":
            try:
                _, version = _toolchain()
                self._send(HTTPStatus.OK, {"ok": True, "leanVersion": version})
            except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
                self._send(HTTPStatus.OK, {"ok": False, "leanVersion": None, "message": str(exc)})
        elif path == "/api/examples":
            examples = [json.loads(file.read_text(encoding="utf-8"))
                        for file in sorted((ROOT / "examples").glob("*.json"))]
            self._send(HTTPStatus.OK, {"examples": examples})
        elif path == "/api/lean/projects":
            self._send(HTTPStatus.OK, {"projects": list_projects()})
        elif path == "/api/lean/reference/pi":
            source = REPO / "glean/research/2026-10-07-pi-audit/reference/Irrational.lean"
            if source.is_file():
                self._send(HTTPStatus.OK, {"kind": "lean", "filename": "Irrational.lean", "source": source.read_text(encoding="utf-8"), "projectId": "mathlib", "target": "irrational_pi"})
            else:
                self._error(HTTPStatus.NOT_FOUND, "저장된 π 증명 참조 파일이 없습니다.")
        elif path.startswith("/api/"):
            self._error(HTTPStatus.NOT_FOUND, "요청한 API가 없습니다.")
        else:
            web = ROOT / "web"
            try:
                file = (web / (path.lstrip("/") or "index.html")).resolve()
                file.relative_to(web.resolve())
                if not file.is_file() or file.suffix not in {".html", ".js", ".mjs", ".css", ".svg", ".ico"}:
                    raise ValueError("Not a web asset")
                content = file.read_bytes()
            except (OSError, ValueError):
                self._error(HTTPStatus.NOT_FOUND, "파일을 찾을 수 없습니다.")
                return
            mime = "text/javascript" if file.suffix in {".js", ".mjs"} else (mimetypes.guess_type(file.name)[0] or "application/octet-stream")
            self._send(HTTPStatus.OK, content, mime + "; charset=utf-8")

    def do_POST(self):
        if not self._local_request():
            return
        try:
            path = urlsplit(self.path).path
        except ValueError:
            self._error(HTTPStatus.BAD_REQUEST, "잘못된 요청 경로입니다.")
            return
        lean_routes = {"/api/lean/open", "/api/lean/update", "/api/lean/context", "/api/lean/close",
                       "/api/lean/check/start", "/api/lean/check/poll", "/api/lean/check/cancel",
                       "/api/graph/check/start", "/api/graph/check/poll", "/api/graph/check/cancel", "/api/lean/declaration", "/api/lean/declaration/source", "/api/lean/environment", "/api/lean/index/start", "/api/lean/index/poll", "/api/lean/index/cancel", "/api/lean/index/convert"}
        if path not in ("/api/check", "/api/preview") and path not in lean_routes:
            self._error(HTTPStatus.NOT_FOUND, "요청한 API가 없습니다.")
            return
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
            self._error(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "JSON 형식이 필요합니다.")
            return
        lengths = self.headers.get_all("Content-Length", [])
        if len(lengths) != 1 or self.headers.get("Transfer-Encoding"):
            self._error(HTTPStatus.BAD_REQUEST, "Content-Length가 필요합니다.")
            return
        try:
            length = int(lengths[0])
            if length < 0:
                raise ValueError("negative length")
        except ValueError:
            self._error(HTTPStatus.BAD_REQUEST, "잘못된 요청 길이입니다.")
            return
        limit = MAX_REQUEST_BYTES
        if length > limit:
            self._error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "요청은 JSON 인코딩 후 24 MiB 이하여야 합니다.")
            return
        try:
            body = self.rfile.read(length)
            if len(body) != length:
                raise ValueError("요청 본문이 불완전합니다.")
            def reject_constant(value):
                raise ValueError("지원하지 않는 JSON 값: " + value)
            graph = json.loads(body.decode("utf-8"), parse_constant=reject_constant)
        except (UnicodeError, ValueError, RecursionError, TimeoutError):
            self._error(HTTPStatus.BAD_REQUEST, "그래프 JSON을 읽을 수 없습니다.")
            return
        if path in ("/api/check", "/api/preview"):
            action = preview_graph if path == "/api/preview" else check_graph
            if isinstance(graph, dict) and "graph" in graph and graph.get("scope", "all") not in ("all", "goal"):
                self._error(HTTPStatus.BAD_REQUEST, "검사 범위는 all 또는 goal이어야 합니다.")
                return
            if isinstance(graph, dict) and "graph" in graph:
                response = action(graph["graph"], graph.get("scope", "all"))
            else:
                response = action(graph)
            self._send(HTTPStatus.OK, response)
            return
        if not isinstance(graph, dict):
            self._error(HTTPStatus.BAD_REQUEST, "Lean 요청은 JSON 객체여야 합니다.")
            return
        try:
            if path == "/api/lean/index/start":
                data=DECLARATION_INDEX.start(graph)
            elif path == "/api/lean/index/convert":
                data=DECLARATION_INDEX.convert(graph)
            elif path == "/api/lean/index/poll":
                data=DECLARATION_INDEX.get(graph.get("jobId"))
            elif path == "/api/lean/index/cancel":
                data=DECLARATION_INDEX.cancel(graph.get("jobId"))
            elif path == "/api/lean/environment":
                from .project_provenance import environment_provenance
                data = environment_provenance(graph.get("projectId"))
            elif path == "/api/lean/declaration/source":
                from .declaration import declaration_source
                data = declaration_source(graph.get("projectId"),graph.get("imports",[]),graph.get("declaration"))
            elif path == "/api/lean/declaration":
                from .declaration import lookup_declaration
                data = lookup_declaration(graph.get("projectId"),graph.get("imports",[]),graph.get("declaration"))
            elif path == "/api/graph/check/start":
                data = GRAPH_CHECKS.start(graph)
            elif path == "/api/graph/check/poll":
                data = GRAPH_CHECKS.get(graph.get("jobId"))
            elif path == "/api/graph/check/cancel":
                data = GRAPH_CHECKS.cancel(graph.get("jobId"))
            elif path == "/api/lean/open":
                data = lean_lsp.open_document(graph.get("projectId"), graph.get("filename"), graph.get("source"))
            elif path == "/api/lean/update":
                data = lean_lsp.update_document(graph.get("sessionId"), graph.get("source"), graph.get("version"))
            elif path == "/api/lean/context":
                data = lean_lsp.context(graph.get("sessionId"), graph.get("line"), graph.get("character"), graph.get("version"))
            elif path == "/api/lean/close":
                data = lean_lsp.close_document(graph.get("sessionId"))
            elif path == "/api/lean/check/start":
                data = SOURCE_CHECKS.start(graph)
            elif path == "/api/lean/check/poll":
                data = SOURCE_CHECKS.get(graph.get("jobId"))
            else:
                data = SOURCE_CHECKS.cancel(graph.get("jobId"))
            self._send(HTTPStatus.OK, data)
        except lean_lsp.LeanSessionError as error:
            status = {"not_found": HTTPStatus.NOT_FOUND, "session_limit": HTTPStatus.TOO_MANY_REQUESTS,
                      "busy": HTTPStatus.TOO_MANY_REQUESTS, "timeout": HTTPStatus.GATEWAY_TIMEOUT,
                      "server_error": HTTPStatus.SERVICE_UNAVAILABLE}.get(error.code, HTTPStatus.BAD_REQUEST)
            self._error(status, str(error), code=error.code)
        except (ValueError, KeyError, TypeError) as error:
            self._error(HTTPStatus.BAD_REQUEST, str(error))
        except (OSError, RuntimeError, TimeoutError) as error:
            self._error(HTTPStatus.SERVICE_UNAVAILABLE, str(error))


def create_server(host="127.0.0.1", port=8765):
    if host not in {"127.0.0.1", "localhost"}:
        raise ValueError("GLEAN must bind to loopback")
    return ThreadingHTTPServer((host, port), Handler)


def main():
    parser = argparse.ArgumentParser(description="Run the local GLEAN node editor")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    try:
        server = create_server(port=args.port)
    except OSError as exc:
        parser.exit(1, f"서버를 시작할 수 없습니다: {exc}\n다른 포트를 사용하려면 --port 8766을 지정하세요.\n")
    print(f"GLEAN → http://127.0.0.1:{server.server_address[1]}\n종료: Ctrl+C", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        lean_lsp.close_all()
        DECLARATION_INDEX.shutdown()
        SOURCE_CHECKS.shutdown()


if __name__ == "__main__":
    main()
