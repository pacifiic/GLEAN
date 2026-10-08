# R03/R14 environment provenance audit

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

2026-10-07. Read-only review of root's `project_provenance.py` and tests before Agent 1 integrates it. The descriptor is an environment identity hint for ordinary cache invalidation, not proof verification or an attestation of every binary byte. The explicit metadata scope and absence of a `verified` flag are appropriate.

## P-01 — P1: local dependency paths are not resolved from the Lake manifest

Status: FIXED; original independent fixture retested successfully.

Every package is currently assumed to reside in `.lake/packages/<name>`. Lake's manifest also supports local `type: "path"` entries with a `dir` relative to the package containing the manifest, a configurable `packagesDir`, and Git `subDir` entries. See local Lean source `src/lake/Lake/Load/Manifest.lean` lines 69–82 and 98–118.

Reproduction using the existing test fixture:

1. Create a real sibling directory `../local-package` containing `Main.lean`.
2. Set the manifest package to `{ "type": "path", "name": "Local", "dir": "../local-package" }`.
3. Capture provenance, edit the sibling source from `def value := 1` to `def value := 2`, then capture again.

Observed descriptor: dependency `available: false`; environment hash unchanged. This is an ordinary supported Lake dependency, not a forged metadata timestamp. Its source and compiled outputs are omitted from the descriptor. The two current checked-in profiles use the default Git package layout, so that baseline is unaffected; a profile's local configuration can reach the bad case.

Resolve actual package locations and include their relevant source/compiled identities. An acceptable interim behavior is to mark unsupported forms incomplete/non-cacheable rather than supply a silently reusable environment hash.

## P-02 — P2: inherited/custom compiled library search paths are outside the scan

Status: FIXED for the reviewed paths; independently checked with actual Lake environment resolution and an external metadata fixture.

The helper scans `root/.lake` and `prefix/lib/lean`, but does not record actual `lake env` Lean search paths. Lake appends the inherited environment's `LEAN_PATH` to workspace library paths (`src/lake/Lake/Config/Workspace.lean` lines 388–393). A custom build directory or external/symlinked compiled dependency may therefore affect Lean imports while falling outside the metadata scan.

Capture the resolved Lean library search paths and metadata-stamp the relevant directories, or explicitly make nonstandard paths non-cacheable. This does not require full-content hashing of gigabytes of mathlib. The current metadata-vs-content disclaimer should remain.

## Integration constraints

The environment scan is not atomic. A cache entry must bind the graph/source semantic identity and the environment observed during its verification; a new descriptor must not be retroactively attached to an old verified result. If relevant environment identity changes during a check, do not reuse that result as current without rechecking. Unknown or unavailable provenance should prevent reuse, not fabricate a fresh identity.

No misleading proof-success fields were found in the isolated helper. `gitCommit` for a project nested inside a parent checkout is disambiguated by `sourceIdentityKind`; source contents are hashed in that mode instead of incorrectly treating the parent commit as sufficient.

## Independent checks

`python3 -m unittest glean.tests.prototype.test_project_provenance`: 5/5 passed in 1.860 seconds. The separate local-path dependency fixture above demonstrated the missed change. No expensive mathlib scan was duplicated, and no product files were edited by the auditor.

## Repair retest

Root now resolves local path packages relative to the project, Git packages through `packagesDir` and optional `subDir`, and includes external package build directories. It also asks the actual `lake env` process for ordered `LEAN_PATH` entries, canonicalizes those paths, and includes their compiled artifact metadata.

Independent checks after repair:

- Updated provenance suite: 7/7 passed in 2.924 seconds, including custom Git folder/subdirectory and external library updates.
- Original sibling-dependency reproduction: the dependency is now available and editing its source changes the environment hash.
- Actual installed GLEAN/Lake process, with a temporary external `LEAN_PATH`: the canonical external path appears in the returned list. Touching a test `.olean` entry changes both compiled metadata hash and environment hash. The file was a metadata fixture and was never claimed to be an imported/valid Lean module. Canonical comparison accounts for macOS `/var` → `/private/var` resolution.

The demonstrated P-01/P-02 gaps are closed. Full binary-content attestation and atomic verification snapshots remain outside this helper's explicit scope; integration must still respect the cache-binding constraints above.
