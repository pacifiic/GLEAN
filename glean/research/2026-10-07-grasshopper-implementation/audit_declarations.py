# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Independent real project/reference checks, including an actual environment epoch change."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from glean.prototype.declaration import lookup_declaration
from glean.prototype.graph_jobs import GraphCheckService
from glean.prototype.source_check import SourceCheckService


def fixture(signature):
    inputs = deepcopy(signature['inputs'])
    return {'version': 3, 'name': 'Independent actual declaration audit',
        'projectId': signature['projectId'], 'imports': signature['imports'], 'policy': 'standard',
        'inputs': inputs, 'goal': signature['outputType'],
        'nodes': [{'id': p['id'], 'kind': 'input', 'ref': p['id']} for p in inputs]
            + [{'id': 'reference', 'kind': 'reference', 'declaration': signature['name'],
                'inputs': deepcopy(inputs), 'outputType': signature['outputType'], 'reference': signature}],
        'edges': [{'id': 'e'+str(i), 'source': p['id'], 'output': 'out',
                    'target': 'reference', 'input': p['id']} for i, p in enumerate(inputs)],
        'result': {'node': 'reference', 'output': 'out'}, 'modules': []}


def run(service, graph):
    result = service.start({'graph': graph})
    deadline = time.monotonic() + 180
    while result['status'] not in {'valid', 'invalid', 'incomplete', 'error', 'cancelled'}:
        if time.monotonic() > deadline:
            raise RuntimeError('Actual reference check timed out')
        time.sleep(.1)
        result = service.get(result['jobId'])
    return result


def main():
    selected = set(sys.argv[1:])
    path = Path(__file__).with_name('declaration-retest-results.json' if selected else 'declaration-results.json')
    report = {'cases': []}
    source_service = SourceCheckService(timeout_seconds=150)
    graphs = GraphCheckService(source_service)
    temporary_input = ROOT / 'glean' / 'RequirementAuditEnvironmentChange.lean'
    if temporary_input.exists():
        raise RuntimeError('Refusing to overwrite an existing Lean file')
    def save(name, graph, expected):
        if selected and name not in selected:
            return
        result = run(graphs, graph)
        item = {'id': name, 'expected': expected, 'result': result, 'graph': graph,
                'passed': result['status'] == expected and (expected != 'valid' or result.get('verified') is True)}
        report['cases'].append(item)
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(name, result['status'], 'PASS' if item['passed'] else 'FAIL', flush=True)
    try:
        nat = lookup_declaration('glean', [], 'Nat.add_zero')
        print('Nat.add_zero actual telescope', nat['inputs'], nat['outputType'], flush=True)
        save('R03-Lean-reference', fixture(nat), 'valid')
        if not selected or 'R03-implicit-dependent-reference' in selected:
            implicit = lookup_declaration('glean', [], 'Nat.le_trans')
            print('Nat.le_trans actual telescope', implicit['inputs'], flush=True)
            save('R03-implicit-dependent-reference', fixture(implicit), 'valid')
        if not selected or 'R03-mathlib-reference' in selected:
            pi = lookup_declaration('mathlib', ['Mathlib.Analysis.SpecialFunctions.Trigonometric.Basic'], 'Real.pi_pos')
            print('Real.pi_pos actual module', pi['module'], 'commit', pi['environment']['gitCommit'], flush=True)
            save('R03-mathlib-reference', fixture(pi), 'valid')
        for declaration in [] if selected else ['Nat.this_declaration_does_not_exist', 'Nat.add_zero\n#eval 1']:
            try:
                lookup_declaration('glean', [], declaration)
            except ValueError as error:
                report['cases'].append({'id': 'R03-missing-or-injected-name', 'declaration': declaration,
                    'passed': True, 'message': str(error)})
            else:
                report['cases'].append({'id': 'R03-missing-or-injected-name', 'declaration': declaration,
                    'passed': False})
        wrong = fixture(nat)
        wrong['inputs'][0]['type'] = 'Bool'
        save('R03-wrong-argument', wrong, 'invalid')
        if not selected or selected & {'R03-actual-environment-change-rejects-old-signature', 'R03-refreshed-signature-in-new-environment'}:
            temporary_input.write_text('/-! Requirement audit environment freshness probe. -/\nexample : True := by trivial\n')
            save('R03-actual-environment-change-rejects-old-signature', fixture(nat), 'invalid')
            refreshed = lookup_declaration('glean', [], 'Nat.add_zero')
            assert refreshed['environment']['environmentHash'] != nat['environment']['environmentHash']
            save('R03-refreshed-signature-in-new-environment', fixture(refreshed), 'valid')
    finally:
        temporary_input.unlink(missing_ok=True)
        source_service.shutdown()
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if all(item['passed'] for item in report['cases']) else 1


if __name__ == '__main__':
    raise SystemExit(main())
