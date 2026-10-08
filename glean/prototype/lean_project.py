# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Fixed, locally installed Lean projects shared by source checking and the LSP."""

from functools import lru_cache
from pathlib import Path
import shutil
import subprocess


REPO = Path(__file__).resolve().parents[2]
LEAN_VERSION = "4.34.1"
_PROFILES = {
    "glean": ("GLEAN · Lean 표준 라이브러리", REPO / "glean"),
    "mathlib": ("Mathlib · π 증명 연구 환경", REPO / ".glean-tools/mathlib-audit/mathlib4"),
}


@lru_cache(maxsize=1)
def _lake_binary():
    local = REPO / ".glean-tools/lean-4.34.1-darwin_aarch64/bin/lake"
    executable = str(local) if local.is_file() else shutil.which("lake")
    if executable is None:
        raise ValueError("Lean 4.34.1의 Lake 실행 파일을 찾지 못했습니다.")
    return executable


@lru_cache(maxsize=2)
def _check_version(executable):
    checked = subprocess.run([executable, "env", "lean", "--version"], cwd=REPO / "glean",
                             capture_output=True, text=True, timeout=10)
    if checked.returncode or "version 4.34.1," not in checked.stdout:
        raise ValueError("Lean 4.34.1 도구 체인이 필요합니다.")


def get_project(project_id):
    if not isinstance(project_id, str) or project_id not in _PROFILES:
        raise ValueError("지원하지 않는 Lean 프로젝트입니다.")
    name, root = _PROFILES[project_id]
    if not root.is_dir():
        raise ValueError("이 Lean 프로젝트가 설치되어 있지 않습니다.")
    try:
        version = (root / "lean-toolchain").read_text().strip()
    except OSError as error:
        raise ValueError("프로젝트의 lean-toolchain을 읽을 수 없습니다.") from error
    if version != "leanprover/lean4:v4.34.1":
        raise ValueError("프로젝트가 Lean 4.34.1로 고정되어 있지 않습니다.")
    return {"id": project_id, "name": name, "root": root, "leanVersion": LEAN_VERSION}


def toolchain(project_id):
    project = get_project(project_id)
    executable = _lake_binary()
    try:
        _check_version(executable)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ValueError("Lean 도구 체인을 실행하지 못했습니다.") from error
    return [executable, "env", "lean"], project["root"]


def list_projects():
    projects = []
    for project_id, (name, root) in _PROFILES.items():
        entry = {"id": project_id, "name": name, "root": str(root), "leanVersion": LEAN_VERSION}
        try:
            toolchain(project_id)
            entry["available"] = True
        except ValueError as error:
            entry.update(available=False, reason=str(error))
        projects.append(entry)
    return projects
