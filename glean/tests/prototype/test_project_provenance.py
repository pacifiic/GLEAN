"""Environment identity changes with actual source, configuration, and build inputs."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from glean.prototype.project_provenance import environment_provenance


class EnvironmentProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "project"
        self.prefix = Path(self.temp.name) / "toolchain"
        self.root.mkdir()
        (self.prefix / "bin").mkdir(parents=True)
        (self.prefix / "bin/lean").write_bytes(b"Lean binary fixture")
        (self.prefix / "lib/lean").mkdir(parents=True)
        (self.prefix / "lib/lean/Init.olean").write_bytes(b"compiled")
        (self.root / "lean-toolchain").write_text("leanprover/lean4:v4.34.1\n")
        (self.root / "lake-manifest.json").write_text('{"packages": []}')
        (self.root / "lakefile.lean").write_text('import Lake\n')
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        subprocess.run(["git", "-C", str(self.root), "add", "."], check=True)
        subprocess.run(["git", "-C", str(self.root), "-c", "user.name=GLEAN test", "-c", "user.email=glean@example.invalid", "commit", "-qm", "fixture"], check=True)
        self.toolchain = patch("glean.prototype.project_provenance.toolchain", return_value=(["lake", "env", "lean"], self.root))
        self.toolchain.start()
        self.addCleanup(self.toolchain.stop)
        actual_run = subprocess.run
        def run(command, **options):
            if command[:3] == ["lake", "env", "lean"]:
                value = str(self.prefix) if command[-1] == "--print-prefix" else "Lean (version 4.34.1, fixture)"
                return subprocess.CompletedProcess(command, 0, value + "\n", "")
            return actual_run(command, **options)
        self.commands = patch("glean.prototype.project_provenance.subprocess.run", side_effect=run)
        self.commands.start()
        self.addCleanup(self.commands.stop)
        self.environment = patch('glean.prototype.project_provenance._lean_search_paths', return_value=[])
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_stable_descriptor_identifies_actual_version_and_hashes(self):
        a, b = environment_provenance("glean"), environment_provenance("glean")
        self.assertEqual(a, b)
        self.assertEqual(a["leanVersion"], "Lean (version 4.34.1, fixture)")
        self.assertFalse(a["gitDirty"])
        self.assertEqual(len(a["environmentHash"]), 64)
        self.assertNotIn("verified", a)
        self.assertIn("metadata", a["compiledArtifacts"]["kind"])
        json.dumps(a)

    def test_untracked_source_and_manifest_changes_invalidate_identity(self):
        before = environment_provenance("glean")
        (self.root / "New.lean").write_text("def newValue : Nat := 1\n")
        added = environment_provenance("glean")
        self.assertTrue(added["gitDirty"])
        self.assertNotEqual(before["environmentHash"], added["environmentHash"])
        (self.root / "New.lean").write_text("def newValue : Nat := 2\n")
        edited = environment_provenance("glean")
        self.assertNotEqual(added["sourceStateHash"], edited["sourceStateHash"])
        (self.root / "lake-manifest.json").write_text('{"packages": [], "version": "2"}')
        config = environment_provenance("glean")
        self.assertNotEqual(config["manifestHash"], edited["manifestHash"])

    def test_binary_and_compiled_artifact_updates_invalidate_identity(self):
        before = environment_provenance("glean")
        (self.prefix / "bin/lean").write_bytes(b"different Lean binary")
        binary = environment_provenance("glean")
        self.assertNotEqual(before["leanBinaryHash"], binary["leanBinaryHash"])
        compiled = self.prefix / "lib/lean/Init.olean"
        stat = compiled.stat()
        os.utime(compiled, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1000000))
        changed = environment_provenance("glean")
        self.assertNotEqual(binary["environmentHash"], changed["environmentHash"])

    def test_non_lean_ui_changes_do_not_change_lean_environment_identity(self):
        before = environment_provenance("glean")
        (self.root / "editor.js").write_text("// presentation change")
        after = environment_provenance("glean")
        self.assertEqual(before["environmentHash"], after["environmentHash"])

    def test_missing_dependency_is_identified_and_local_dependency_edits_change_hash(self):
        (self.root / '.gitignore').write_text('.lake/\n')
        (self.root / "lake-manifest.json").write_text('{"packages": [{"name":"Example","rev":"abc"}]}')
        before = environment_provenance("glean")
        self.assertFalse(before["dependencies"][0]["available"])
        dependency = self.root / ".lake/packages/Example"
        dependency.mkdir(parents=True)
        (dependency / "Main.lean").write_text("def x := 1")
        installed = environment_provenance("glean")
        self.assertTrue(installed["dependencies"][0]["available"])
        self.assertNotEqual(before["environmentHash"], installed["environmentHash"])
        (dependency / "Main.lean").write_text("def x := 2")
        changed = environment_provenance("glean")
        self.assertNotEqual(installed["environmentHash"], changed["environmentHash"])

    def test_path_and_custom_git_package_locations_use_actual_sources(self):
        local = self.root.parent / 'local-package'
        local.mkdir()
        (local / 'Main.lean').write_text('def x := 1')
        git_package = self.root / 'custom-packages/GitPackage/sub'
        git_package.mkdir(parents=True)
        (git_package / 'Main.lean').write_text('def y := 1')
        (self.root / 'lake-manifest.json').write_text(json.dumps({'packagesDir':'custom-packages','packages':[
            {'type':'path','name':'Local','dir':'../local-package'},
            {'type':'git','name':'GitPackage','subDir':'sub','rev':'abc'}]}))
        before = environment_provenance('glean')
        self.assertTrue(all(item['available'] for item in before['dependencies']))
        (local / 'Main.lean').write_text('def x := 2')
        local_edit = environment_provenance('glean')
        self.assertNotEqual(before['environmentHash'], local_edit['environmentHash'])
        (git_package / 'Main.lean').write_text('def y := 2')
        git_edit = environment_provenance('glean')
        self.assertNotEqual(local_edit['environmentHash'], git_edit['environmentHash'])

    def test_resolved_lean_path_changes_and_external_artifacts_invalidate_identity(self):
        external = self.root.parent / 'external-lib'
        external.mkdir()
        artifact = external / 'External.olean'
        artifact.write_bytes(b'external')
        before = environment_provenance('glean')
        with patch('glean.prototype.project_provenance._lean_search_paths', return_value=[str(external)]):
            included = environment_provenance('glean')
            self.assertNotEqual(before['environmentHash'], included['environmentHash'])
            stamp = artifact.stat()
            os.utime(artifact, ns=(stamp.st_atime_ns, stamp.st_mtime_ns+1000000))
            changed = environment_provenance('glean')
            self.assertNotEqual(included['environmentHash'], changed['environmentHash'])


if __name__ == "__main__":
    unittest.main()
