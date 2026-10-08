# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Identify the local Lean environment; this descriptor never certifies a proof.

Source/configuration/binary hashes are content hashes. The compiled-library stamp
uses path/size/mtime metadata so checking identity does not reread gigabytes of
mathlib on every edit. Its scope is explicit in the returned descriptor.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

from .lean_project import toolchain

_CONFIG = ('lean-toolchain', 'lake-manifest.json', 'lakefile.lean', 'lakefile.toml')
_COMPILED = ('.olean', '.olean.server', '.olean.private', '.ilean', '.so', '.dylib', '.dll')


def _digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':')).encode()).hexdigest()


def _file_hash(path):
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def _run(command, root):
    result = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=15)
    if result.returncode:
        return None
    return result.stdout.rstrip('\n')


def _lean_input(name):
    return name.endswith('.lean') or Path(name).name in _CONFIG


def _lean_search_paths(command, root):
    probe = "import json,os; print(json.dumps(os.environ.get('LEAN_PATH','').split(os.pathsep)))"
    raw = _run(command[:-1] + [sys.executable, '-I', '-c', probe], root)
    if raw is None:
        raise ValueError('Lake가 설정한 실제 Lean 검색 경로를 읽지 못했습니다.')
    paths = json.loads(raw)
    if not isinstance(paths, list) or len(paths) > 256 or any(not isinstance(path, str) for path in paths):
        raise ValueError('Lean 검색 경로 형식 또는 개수가 올바르지 않습니다.')
    return [str((root / path).resolve()) for path in paths if path]


def _resolve_directory(root, value):
    if not isinstance(value, str) or len(value) > 4096 or '\0' in value:
        raise ValueError('Lean 의존성 디렉터리 형식이 올바르지 않습니다.')
    return (root / value).resolve()


def _source_state(root):
    commit = _run(['git', 'rev-parse', 'HEAD'], root)
    git_root = _run(['git', 'rev-parse', '--show-toplevel'], root) if commit else None
    if commit and git_root and Path(git_root).resolve() == root.resolve():
        changed = _run(['git', 'diff', '--relative', '--name-only', '-z', 'HEAD', '--', '.'], root)
        untracked = _run(['git', 'ls-files', '--others', '--exclude-standard', '-z', '--', '.'], root)
        status = _run(['git', 'status', '--porcelain', '-z', '--', '.'], root)
        if changed is None or untracked is None or status is None:
            raise ValueError('Lean 프로젝트의 Git 상태를 읽지 못했습니다.')
        names = sorted({name for name in (changed + '\0' + untracked).split('\0') if name and _lean_input(name)})
        changes = {name: _file_hash(root / name) for name in names}
        return {'gitCommit': commit, 'gitDirty': bool(status),
                'sourceStateHash': _digest({'commit': commit, 'changes': changes}),
                'changedLeanInputs': len(changes), 'sourceIdentityKind': 'git-and-modified-input-content'}
    files = {}
    for directory, subdirs, names in os.walk(root):
        subdirs[:] = [name for name in subdirs if name not in {'.git', '.lake', 'node_modules', '__pycache__'}]
        for name in names:
            if _lean_input(name):
                path = Path(directory) / name
                files[path.relative_to(root).as_posix()] = _file_hash(path)
    status = _run(['git', 'status', '--porcelain', '-z', '--', '.'], root) if commit else None
    return {'gitCommit': commit, 'gitDirty': bool(status) if status is not None else None,
            'sourceStateHash': _digest(files), 'changedLeanInputs': None,
            'sourceIdentityKind': 'source-content-in-parent-git' if commit else 'source-content-without-git'}


def _compiled_state(roots):
    entries = []
    for label, root in roots:
        for directory, subdirs, files in os.walk(root):
            subdirs[:] = [name for name in subdirs if name not in {'.git', 'node_modules'}]
            for name in files:
                if name.endswith(_COMPILED):
                    path = Path(directory) / name
                    try:
                        info = path.stat()
                        entries.append((label, path.relative_to(root).as_posix(), info.st_size, info.st_mtime_ns))
                    except FileNotFoundError:
                        entries.append((label, path.relative_to(root).as_posix(), 'removed'))
    entries.sort()
    return {'kind': 'path-size-mtime-metadata', 'count': len(entries), 'hash': _digest(entries)}


def environment_provenance(project_id):
    """Return fresh JSON-compatible identity for a fixed installed project."""
    command, root = toolchain(project_id)
    root = Path(root)
    version = _run(command + ['--version'], root)
    prefix_text = _run(command + ['--print-prefix'], root)
    if not version or not prefix_text:
        raise ValueError('현재 Lean 도구 체인의 식별 정보를 읽지 못했습니다.')
    prefix = Path(prefix_text)
    binary = prefix / 'bin' / ('lean.exe' if os.name == 'nt' else 'lean')
    binary_hash = _file_hash(binary)
    if binary_hash is None:
        raise ValueError('현재 Lean 실행 파일의 해시를 계산하지 못했습니다.')
    files = {name: _file_hash(root / name) for name in _CONFIG}
    source = _source_state(root)
    dependencies = []
    compiled_roots = [('project', root / '.lake'), ('toolchain', prefix / 'lib/lean')]
    manifest_path = root / 'lake-manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.is_file() else {}
    packages = manifest.get('packages', [])
    if not isinstance(packages, list) or len(packages) > 128:
        raise ValueError('Lean 의존성 목록 형식 또는 크기가 올바르지 않습니다.')
    packages_dir = _resolve_directory(root, manifest.get('packagesDir', '.lake/packages'))
    for package in packages:
        name = package.get('name') if isinstance(package, dict) else None
        if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}', name):
            raise ValueError('Lean 의존성 이름이 올바르지 않습니다.')
        kind = package.get('type', 'git')
        if kind == 'path':
            path = _resolve_directory(root, package.get('dir'))
        elif kind == 'git':
            path = _resolve_directory(packages_dir / name, package.get('subDir') or '')
        else:
            raise ValueError('지원하지 않는 Lean 의존성 형식입니다.')
        info = {'name': name, 'kind': kind, 'root': str(path),
                'declaredRevision': package.get('rev'), 'available': path.is_dir()}
        if path.is_dir():
            info.update(_source_state(path))
            compiled_roots.append(('package:' + name, path / '.lake'))
        dependencies.append(info)
    dependencies.sort(key=lambda item: item['name'])
    search_paths = _lean_search_paths(command, root)
    compiled_roots.extend(('search:' + str(index), Path(path)) for index, path in enumerate(search_paths))
    covered = []
    for label, path in compiled_roots:
        path = path.resolve()
        if not any(path.is_relative_to(parent) for _, parent in covered):
            covered.append((label, path))
    compiled = _compiled_state(covered)
    descriptor = {'schema': 1, 'projectId': project_id, 'leanVersion': version,
                  'leanBinaryHash': binary_hash, 'projectFiles': files,
                  'sourceStateHash': source['sourceStateHash'], 'dependencies': dependencies,
                  'compiledArtifacts': compiled, 'leanSearchPaths': search_paths}
    return {**descriptor, **source, 'toolchainHash': files['lean-toolchain'],
            'manifestHash': files['lake-manifest.json'], 'environmentHash': _digest(descriptor),
            'hashScope': 'Lean binary and project/package source identity plus configuration content; compiled libraries use metadata, not a full content attestation'}
