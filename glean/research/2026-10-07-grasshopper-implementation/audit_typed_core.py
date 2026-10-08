# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Independent requirement fixtures; run small real Lean checks, never UI mocks."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from glean.prototype.source_check import SourceCheckService
from glean.prototype.typed_graph import compile_typed_graph
from glean.prototype.graph_jobs import GraphCheckService


def param(name, type_):
    return {'id': name, 'name': name, 'type': type_}


def script(id_, inputs, output, body):
    return {'id': id_, 'kind': 'script', 'inputs': inputs, 'outputType': output, 'body': body}


def wire(source, target, input_, output='out'):
    return {'id': f'{source}_{output}_{target}_{input_}', 'source': source,
            'output': output, 'target': target, 'input': input_}


def graph(inputs, goal, nodes, edges, result):
    return {'version': 3, 'name': 'Independent requirement audit', 'projectId': 'glean',
            'imports': [], 'policy': 'strict', 'inputs': inputs, 'goal': goal,
            'nodes': nodes, 'edges': edges, 'result': {'node': result, 'output': 'out'}, 'modules': []}


def or_cases():
    ps = [param('P', 'Prop'), param('Q', 'Prop'), param('h', 'P ∨ Q')]
    branches = []
    for id_, constructor, binder, type_, term in [
        ('left', 'Or.inl', 'hp', 'P', 'Or.inr hp'),
        ('right', 'Or.inr', 'hq', 'Q', 'Or.inl hq'),
    ]:
        branch_inputs = [param('P', 'Prop'), param('Q', 'Prop'), param(binder, type_)]
        branches.append({'id': id_, 'constructor': constructor,
            'binders': [param(binder, type_)],
            'nodes': [{'id': p['id'], 'kind': 'input', 'ref': p['id']} for p in branch_inputs]
                + [script('join', branch_inputs, 'Q ∨ P', term)],
            'edges': [wire(p['id'], 'join', p['id']) for p in branch_inputs],
            'result': {'node': 'join', 'output': 'out'}})
    case = {'id': 'case', 'kind': 'cases', 'inputs': ps, 'scrutinee': 'h',
            'outputType': 'Q ∨ P', 'branches': branches}
    return graph(ps, 'Q ∨ P', [{'id': p['id'], 'kind': 'input', 'ref': p['id']} for p in ps]
                 + [case], [wire(p['id'], 'case', p['id']) for p in ps], 'case')


def exists_case(escape=False):
    ps = [param('h', '∃ n : Nat, n = n')]
    inner_inputs = [param('n', 'Nat'), param('hn', 'n = n')]
    output = 'Nat' if escape else '∃ n : Nat, n = n'
    branch = {'id': 'witness', 'constructor': 'Exists.intro', 'binders': inner_inputs,
              'nodes': [{'id': p['id'], 'kind': 'input', 'ref': p['id']} for p in inner_inputs]
              + [script('use', inner_inputs, output, 'n' if escape else '⟨n, hn⟩')],
              'edges': [wire(p['id'], 'use', p['id']) for p in inner_inputs],
              'result': {'node': 'use', 'output': 'out'}}
    case = {'id': 'case', 'kind': 'cases', 'inputs': ps, 'scrutinee': 'h',
            'outputType': output, 'branches': [branch]}
    nodes = [{'id': 'h', 'kind': 'input', 'ref': 'h'}, case]
    if escape:
        nodes.append(script('truth', [], 'True', 'True.intro'))
    return graph(ps, 'True' if escape else output, nodes, [wire('h', 'case', 'h')],
                 'truth' if escape else 'case')


def construction(subtype=False):
    ps = [param('n', 'Nat')]
    if subtype:
        target = '0 ≤ n'
        construct = {'id': 'make', 'kind': 'construct', 'inputs': [param('x', 'Nat')],
            'outputType': '{ k : Nat // 0 ≤ k }', 'body': '⟨x, Nat.zero_le x⟩',
            'outputs': [{'id': 'val', 'name': 'value', 'type': 'Nat', 'term': 'value.val'},
                        {'id': 'property', 'name': 'nonnegative', 'type': '0 ≤ value.val', 'term': 'value.property'}]}
        consume = script('use', [param('k', 'Nat'), param('hk', '0 ≤ k')], '0 ≤ k', 'hk')
        edges = [wire('n', 'make', 'x'), wire('make', 'use', 'k', 'val'), wire('make', 'use', 'hk', 'property')]
    else:
        target = 'n + (n + 1) = n + (n + 1)'
        construct = {'id': 'make', 'kind': 'construct', 'inputs': [param('x', 'Nat')],
            'outputType': 'Nat × Nat', 'body': '(x, x + 1)',
            'outputs': [{'id': 'fst', 'name': 'first', 'type': 'Nat', 'term': 'value.fst'},
                        {'id': 'snd', 'name': 'successor', 'type': 'Nat', 'term': 'value.snd'}]}
        consume = script('use', [param('a', 'Nat'), param('b', 'Nat')], 'a + b = a + b', 'by rfl')
        edges = [wire('n', 'make', 'x'), wire('make', 'use', 'a', 'fst'), wire('make', 'use', 'b', 'snd')]
    return graph(ps, target, [{'id': 'n', 'kind': 'input', 'ref': 'n'}, construct, consume], edges, 'use')


def calc(inequality=False):
    ps = [param('n', 'Nat')]
    relation = '≤' if inequality else '='
    node = {'id': 'calc', 'kind': 'calc', 'inputs': [param('x', 'Nat')],
        'outputType': 'x ≤ x + 2' if inequality else 'x + 0 + 0 = x',
        'start': 'x' if inequality else 'x + 0 + 0',
        'steps': [{'id': 'first', 'relation': relation, 'term': 'x + 1' if inequality else 'x + 0',
                   'proof': 'Nat.le_succ x' if inequality else 'by rfl'},
                  {'id': 'second', 'relation': relation, 'term': 'x + 2' if inequality else 'x',
                   'proof': 'Nat.le_succ (x + 1)' if inequality else 'by rfl'}]}
    return graph(ps, 'n ≤ n + 2' if inequality else 'n + 0 + 0 = n',
                 [{'id': 'n', 'kind': 'input', 'ref': 'n'}, node], [wire('n', 'calc', 'x')], 'calc')


def dependent_module():
    ps = [param('n', 'Nat'), param('i', 'Fin n')]
    module = {'id': 'bound', 'name': 'Fin bound', 'inputs': ps, 'outputType': 'i.val < n',
        'nodes': [{'id': p['id'], 'kind': 'input', 'ref': p['id']} for p in ps]
            + [script('proof', ps, 'i.val < n', 'i.isLt')],
        'edges': [wire(p['id'], 'proof', p['id']) for p in ps], 'result': {'node': 'proof', 'output': 'out'}}
    g = graph([], '2 < 3', [{'id': 'three', 'kind': 'nat', 'value': '3'},
        script('index', [], 'Fin 3', '⟨2, by decide⟩'),
        {'id': 'callA', 'kind': 'module', 'ref': 'bound'},
        {'id': 'callB', 'kind': 'module', 'ref': 'bound'}],
        [wire('three', target, 'n') for target in ['callA', 'callB']]
        + [wire('index', target, 'i') for target in ['callA', 'callB']], 'callB')
    g['modules'] = [module]
    return g


def exact_natural(value):
    return graph([], value + ' = ' + value,
        [{'id': 'n', 'kind': 'nat', 'value': value}, script('proof', [param('x', 'Nat')], 'x = x', 'by rfl')],
        [wire('n', 'proof', 'x')], 'proof')


def fixtures():
    valid = graph([param('n', 'Nat')], 'n + 0 = n',
        [{'id': 'n', 'kind': 'input', 'ref': 'n'}, script('s', [param('x', 'Nat')], 'x + 0 = x', 'by rfl')],
        [wire('n', 's', 'x')], 's')
    cases = [('R02-script-valid', valid, 'valid')]
    for body, expected, label in [('True.intro', 'invalid', 'wrong-term'), ('by sorry', 'incomplete', 'sorry'),
                                  ('by exact n', 'invalid', 'undeclared-local')]:
        g = deepcopy(valid); g['nodes'][1]['body'] = body
        cases.append(('R02-' + label, g, expected))
    valid_or = or_cases(); cases.append(('R05-both-branches', valid_or, 'valid'))
    missing = deepcopy(valid_or); missing['nodes'][-1]['branches'].pop()
    cases.append(('R05-missing-branch', missing, 'invalid'))
    sibling = deepcopy(valid_or); sibling['nodes'][-1]['branches'][1]['nodes'][2]['ref'] = 'hp'
    cases.append(('R05-sibling-local-leak', sibling, 'invalid'))
    wrong = deepcopy(valid_or); wrong['nodes'][-1]['branches'][1]['nodes'][-1]['body'] = 'Or.inr hq'
    cases.append(('R05-wrong-branch-proof', wrong, 'invalid'))
    for is_subtype, label in [(False, 'Prod'), (True, 'Subtype')]:
        g = construction(is_subtype); cases.append((f'R09-{label}-multioutput', g, 'valid'))
        bad = deepcopy(g); bad['nodes'][1]['outputs'][1]['term'] = 'True.intro'
        cases.append((f'R09-{label}-wrong-projection', bad, 'invalid'))
    cases.extend([('R09-Exists-scoped', exists_case(), 'valid'),
                  ('R09-Exists-witness-escape', exists_case(True), 'invalid')])
    for inequality, label in [(False, 'equality'), (True, 'inequality')]:
        g = calc(inequality); cases.append((f'R13-{label}-chain', g, 'valid'))
        bad = deepcopy(g); bad['nodes'][1]['steps'][0]['term'] = 'x + 3'
        cases.append((f'R13-{label}-wrong-step', bad, 'invalid'))
    dep = dependent_module(); cases.append(('R08-Fin-dependent-shared-calls', dep, 'valid'))
    bad = deepcopy(dep); bad['nodes'][0]['value'] = '2'
    cases.append(('R08-Fin-input-index-change', bad, 'invalid'))
    for value in ['0', '7', '9007199254740993']:
        cases.append(('R15-exact-' + value, exact_natural(value), 'valid'))
    distinct = exact_natural('9007199254740993'); distinct['nodes'][0]['value'] = '9007199254740992'
    cases.append(('R15-distinct-beyond-safe-integer', distinct, 'invalid'))
    batch_file = Path(__file__).with_name('typed-batch-fixtures.json')
    if batch_file.is_file():
        cases.extend((item['id'], item['graph'], item['expected'])
                     for item in json.loads(batch_file.read_text()) if 'graph' in item)
    return cases


def main():
    selected = set(sys.argv[1:])
    service = SourceCheckService(timeout_seconds=40)
    graph_service = GraphCheckService(service)
    target = Path(__file__).with_name('typed-core-results.json')
    report = {'compilerHash': hashlib.sha256((ROOT / 'glean/prototype/typed_graph.py').read_bytes()).hexdigest(),
              'sourceCheckerHash': hashlib.sha256((ROOT / 'glean/prototype/source_check.py').read_bytes()).hexdigest(),
              'checkRoute': 'GraphCheckService', 'cases': []}
    try:
        for name, fixture, expected in fixtures():
            if selected and name not in selected:
                continue
            compiled = compile_typed_graph(fixture)
            result = compiled
            if compiled['status'] == 'ready':
                result = graph_service.start({'graph': fixture})
                deadline = time.monotonic() + 45
                while result['status'] not in {'valid', 'invalid', 'incomplete', 'error', 'cancelled'}:
                    if time.monotonic() > deadline:
                        raise RuntimeError(f'{name}: polling deadline exceeded')
                    time.sleep(.05); result = graph_service.get(result['jobId'])
            item = {'id': name, 'expected': expected, 'status': result['status'],
                    'passed': result['status'] == expected, 'fixture': fixture,
                    'sourceMap': compiled['sourceMap'], 'generatedCode': compiled['generatedCode'],
                    'sourceLocations': compiled.get('sourceLocations'), 'nodeBindings': compiled.get('nodeBindings'),
                    'expectedSource': compiled['expectedSource'], 'result': result}
            report['cases'].append(item)
            target.write_text(json.dumps(report, ensure_ascii=False, indent=2))
            print(name, item['status'], 'PASS' if item['passed'] else 'FAIL', flush=True)
    finally:
        service.shutdown()
    return 0 if all(c['passed'] for c in report['cases']) else 1


if __name__ == '__main__':
    raise SystemExit(main())
