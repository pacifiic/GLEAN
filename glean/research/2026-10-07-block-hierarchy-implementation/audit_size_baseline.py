# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Record pure compiler/request boundaries; this does not run the Lean kernel."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from glean.prototype.typed_graph import compile_typed_graph
from glean.prototype.source_check import validate_request
from glean.prototype.lean_lsp import extract_declarations, validate_source


def body_near_limit(size):
    lines = ['by']
    index = 0
    total = 3
    while True:
        prefix = 'h_' if size <= 64 * 1024 else 'local_calculation_with_explicit_actual_Nat_proof_'
        line = f'  have {prefix}{index:06d} : n + 0 = n := by exact Nat.add_zero n'
        if total + len(line.encode()) + 1 + len('  exact Nat.add_zero n') > size:
            break
        lines.append(line)
        total += len(line.encode()) + 1
        index += 1
    lines.append('  exact Nat.add_zero n')
    return '\n'.join(lines)


def validation(action):
    try:
        action()
        return {'accepted': True}
    except ValueError as error:
        return {'accepted': False, 'error': str(error)}
    except Exception as error:
        return {'accepted': False, 'error': str(error), 'exception': type(error).__name__}


report = {'kind': 'pure compiler and validation baseline, not a kernel result', 'cases': []}
for minimum in (64 * 1024, 1024 * 1024):
    body = body_near_limit(minimum)
    graph = {'version': 3, 'name': 'Long explicit Nat proof', 'projectId': 'glean',
             'imports': [], 'policy': 'standard', 'inputs': [{'id': 'n', 'name': 'n', 'type': 'Nat'}],
             'goal': 'n + 0 = n', 'modules': [],
             'nodes': [{'id': 'n', 'kind': 'input', 'ref': 'n'},
                       {'id': 'proof', 'kind': 'script', 'inputs': [{'id': 'n', 'name': 'n', 'type': 'Nat'}],
                        'outputType': 'n + 0 = n', 'body': body}],
             'edges': [{'id': 'wire', 'source': 'n', 'output': 'out', 'target': 'proof', 'input': 'n'}],
             'result': {'node': 'proof', 'output': 'out'}}
    compiled = compile_typed_graph(graph)
    source = 'theorem long (n : Nat) : n + 0 = n :=\n' + body + '\n'
    report['cases'].append({'minimum': minimum, 'bodyBytes': len(body.encode()),
                            'bodyLines': len(body.splitlines()), 'bodyHash': hashlib.sha256(body.encode()).hexdigest(),
                            'requestJsonBytes': len(json.dumps({'graph': graph}).encode()),
                            'compile': {'status': compiled['status'], 'diagnostics': compiled['diagnostics']},
                            'sourceCheck': validation(lambda: validate_request({'source': source, 'filename': 'Long.lean', 'target': 'long'})),
                            'lsp': validation(lambda: validate_source('Long.lean', source))})

index_source = '''namespace AuditNamespace
section
variable (n : Nat)
private theorem hidden_proof : n + 0 = n := by exact Nat.add_zero n
macro "generated_identity" : command => `(def generated : Nat := 3)
generated_identity
end
end AuditNamespace
'''
report['textIndex'] = {'source': index_source, 'declarations': extract_declarations(index_source),
                       'interpretation': 'Conservative text only: not actual private/full names, types or macro-generated declarations.'}
report['fileHashes'] = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in
                       ['glean/prototype/typed_graph.py', 'glean/prototype/source_check.py', 'glean/prototype/lean_lsp.py',
                        'glean/prototype/server.py']}
destination = Path(__file__).with_name('size-baseline-results.json')
destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
print(json.dumps(report, indent=2, ensure_ascii=False))
