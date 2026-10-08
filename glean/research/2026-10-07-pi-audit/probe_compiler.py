# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Reproduce the Pi audit boundary probes; this does not prove irrational_pi."""

from hashlib import sha256
import json
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[3]
AUDIT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from glean.prototype.graph import compile_graph
from glean.prototype.server import check_graph


def control():
    return {
        "version": 1,
        "name": "audit_propositional_control_NOT_PI",
        "propositions": ["P", "Q"],
        "assumptions": [{"id": "hp", "type": "P"}, {"id": "hq", "type": "Q"}],
        "goal": "P ∧ Q",
        "nodes": [
            {"id": "hp", "kind": "assumption", "ref": "hp", "x": 20, "y": 30},
            {"id": "hq", "kind": "assumption", "ref": "hq", "x": 20, "y": 120},
            {"id": "pair", "kind": "pair", "x": 220, "y": 80},
            {"id": "goal", "kind": "goal", "x": 420, "y": 80},
        ],
        "edges": [
            {"id": "e1", "source": "hp", "target": "pair", "input": "left"},
            {"id": "e2", "source": "hq", "target": "pair", "input": "right"},
            {"id": "e3", "source": "pair", "target": "goal", "input": "proof"},
        ],
    }


def main():
    source = (AUDIT / "reference/Irrational.lean").read_text()
    probes = []

    def add(identifier, purpose, lines, graph, expected):
        result = compile_graph(graph)
        assert result["status"] == expected, (identifier, result)
        probes.append({
            "id": identifier, "purpose": purpose, "sourceLines": lines,
            "input": graph, "expectedCompilerStatus": expected, "compilerResult": result,
        })

    add("control-conjunction", "Positive control: only proves P and Q imply P ∧ Q; no connection to π", [], control(), "ready")
    probes[-1]["actualLeanCheck"] = check_graph(control())
    assert probes[-1]["actualLeanCheck"]["verified"] is True
    add("raw-lean-source", "Pass downloaded Lean source directly to current compiler", [1, 311], source, "invalid")

    expressions = [
        ("irrational-goal", "Irrational π", [281, 281]),
        ("integral-equation", "I 0 θ * θ = 2 * sin θ", [49, 49]),
        ("universal-degree", "∀ n : ℕ, (sinPoly n).natDegree ≤ n", [168, 168]),
        ("integer-witness", "∃ z : ℤ, p.eval₂ (Int.castRingHom ℝ) (a / b) * b ^ k = z", [216, 216]),
        ("eventual-filter", "∀ᶠ n : ℕ in atTop, (a : ℝ) ^ (2 * n + 1) / n ! * I n (π / 2) < 1", [290, 290]),
        ("rational-negation", "¬Irrational x", [276, 276]),
        ("integral-bound", "I n (π / 2) ≤ 2", [252, 252]),
        ("integer-inequality-conjunction", "(0 : ℝ) < z ∧ (z : ℝ) < 1", [307, 307]),
    ]
    for identifier, goal, lines in expressions:
        graph = control()
        graph["goal"] = goal
        add(identifier, "Use the real source expression as the graph goal", lines, graph, "invalid")

    graph = control()
    graph["assumptions"][0] = {"id": "hp", "type": "ℕ"}
    add("typed-data-port", "Attempt a natural-number input n : ℕ through the only current assumption mechanism", [45, 47], graph, "invalid")
    graph = control()
    graph["assumptions"][0] = {"id": "hp", "type": "HasDerivAt f (- 2 * x) x"}
    add("derivative-proof-port", "Use actual scoped derivative evidence as an assumption type", [84, 86], graph, "invalid")

    graph = control()
    graph["imports"] = ["Mathlib.Analysis.Real.Pi.Irrational"]
    graph["binders"] = [{"name": "n", "type": "ℕ"}]
    graph["sourceMap"] = {"pair": {"startLine": 307, "endLine": 307}}
    add("unknown-extension-fields", "Check whether adding imports, binders, and source mapping changes generated semantics", [8, 10], graph, "ready")
    assert probes[-1]["compilerResult"]["generatedCode"] == probes[0]["compilerResult"]["generatedCode"]

    for identifier, kind, lines in [
        ("theorem-reference-node", "theorem", [298, 300]),
        ("rewrite-node", "rewrite", [304, 306]),
        ("contradiction-node", "by_contra", [282, 285]),
    ]:
        graph = control()
        graph["nodes"][2]["kind"] = kind
        add(identifier, "Attempt an operation present in the real proof as a node kind", lines, graph, "invalid")

    graph = control()
    graph["nodes"].append({"id": "branch-goal", "kind": "goal", "x": 420, "y": 160})
    graph["edges"].append({"id": "e4", "source": "hp", "target": "branch-goal", "input": "proof"})
    add("two-branch-goals", "Attempt simultaneous subgoals created by refine or cases", [111, 120], graph, "invalid")
    graph = control()
    graph["nodes"].append({"id": "unfinished-scratch", "kind": "apply", "x": 20, "y": 260})
    add("disconnected-scratch-blocks-proof", "Leave an unused experimental subgraph while the goal path remains complete", [173, 176], graph, "incomplete")
    graph = control()
    graph["edges"][0]["source"] = "pair"
    add("recursion-as-cycle", "Attempt direct feedback edge for recursive structure; this is not a valid representation of Lean recursion", [147, 150], graph, "invalid")
    graph = control()
    graph["nodes"][2]["kind"] = "apply"
    graph["edges"][0]["input"] = "fn"
    graph["edges"][1]["input"] = "arg"
    add("supported-type-mismatch", "Control: within its grammar, GLEAN reports the incorrect function port precisely", [], graph, "invalid")

    node = shutil.which("node")
    bundled = Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
    if not node and bundled.is_file():
        node = str(bundled)
    if not node:
        raise SystemExit("Node.js is required to reproduce frontend import-validation probes.")
    javascript = """
import fs from 'node:fs';
import {checkImport} from './glean/prototype/web/model.mjs';
const probes = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(probes.map(p => checkImport(p.input))));
"""
    checked = subprocess.run([node, "--input-type=module", "-e", javascript],
                             input=json.dumps(probes), cwd=ROOT, text=True,
                             capture_output=True, check=True)
    for probe, result in zip(probes, json.loads(checked.stdout), strict=True):
        probe["frontendImportValidation"] = result

    output = {
        "copyright": "Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.",
        "scope": "Current compiler and frontend-model boundary probes, not a proof or translation of irrational_pi. Positive controls are explicitly abstract.",
        "source": {
            "repository": "leanprover-community/mathlib4", "tag": "v4.34.1",
            "commit": "d13f23b723b8a846827a245b89c10fc7d3f11612",
            "path": "Mathlib/Analysis/Real/Pi/Irrational.lean",
            "sha256": sha256(source.encode()).hexdigest(),
        },
        "compiler": {"path": "glean/prototype/graph.py", "sha256": sha256((ROOT / "glean/prototype/graph.py").read_bytes()).hexdigest()},
        "frontendModel": {"path": "glean/prototype/web/model.mjs", "meaning": "null means import shape accepted, not mathematical syntax validated."},
        "reproduction": "python3 glean/research/2026-10-07-pi-audit/probe_compiler.py",
        "probeCount": len(probes), "probes": probes,
    }
    (AUDIT / "compiler-probes.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"probeCount": len(probes),
                      "statuses": {s: sum(p["compilerResult"]["status"] == s for p in probes) for s in ["ready", "invalid", "incomplete"]},
                      "abstractControlLeanVerified": probes[0]["actualLeanCheck"]["verified"]}, indent=2))


if __name__ == "__main__":
    main()
