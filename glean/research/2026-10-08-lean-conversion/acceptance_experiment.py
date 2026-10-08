# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Independent conversion experiments; no product code is modified."""
import copy
import hashlib
import json
import time
from pathlib import Path
from glean.prototype.declaration_index import DeclarationIndexService
from glean.prototype.graph_jobs import GraphCheckService
from glean.prototype.source_check import SourceCheckService
from glean.prototype.source_context import source_document
from glean.prototype.typed_graph import compile_typed_graph

TERMINAL = {'analyzed', 'valid', 'invalid', 'incomplete', 'error', 'cancelled'}
SOURCE = '''import Lean
namespace IndependentAcceptance
abbrev Size := Nat
private theorem zero (n : Nat) : n + 0 = n := Nat.add_zero n
theorem public_zero (n : Nat) : n + 0 = n := zero n
theorem dependent (n : Size) (i : Fin (n+1)) : i = i := rfl
theorem implicit (n : Nat) {i : Fin n} : i = i := rfl
theorem unicode (π : Nat) : π = π := rfl
theorem instance_proof [inst : Inhabited Nat] : (default : Nat) = default := rfl
private def secretType := Nat
theorem private_type (n : secretType) : n = n := rfl
theorem polymorphic {α : Type u} (x : α) : x = x := rfl
end IndependentAcceptance
'''

def main():
    index = DeclarationIndexService()
    sources = SourceCheckService()
    graphs = GraphCheckService(sources)
    rows = []
    saved = {}

    def wait(service, result):
        deadline = time.monotonic() + 125
        while result['status'] not in TERMINAL:
            if time.monotonic() > deadline:
                raise TimeoutError(result['status'])
            time.sleep(.1)
            result = service.get(result['jobId'])
        return result

    def analyze(source):
        result = wait(index, index.start({'source': source, 'filename': 'Independent.lean', 'projectId': 'glean'}))
        if result['status'] != 'analyzed':
            raise RuntimeError(result.get('diagnostics'))
        return result

    def convert(analysis, name, **change):
        return index.convert({'jobId': analysis['jobId'], 'declaration': name,
            'sourceHash': analysis['sourceHash'], 'environmentHash': analysis['environment']['environmentHash'],
            'policy': 'strict', **change})

    def record(name, expected, action):
        start = time.monotonic()
        try:
            actual, evidence = action()
            row = {'case': name, 'expected': expected, 'actual': actual, 'pass': actual == expected,
                'durationSeconds': round(time.monotonic() - start, 3), 'evidence': evidence}
        except Exception as error:
            row = {'case': name, 'expected': expected, 'actual': 'exception', 'pass': False, 'error': str(error)}
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)

    def checked(document):
        result = wait(graphs, graphs.start({'graph': document['graph']}))
        return result['status'], {key: result.get(key) for key in
            ['verified', 'kernelAccepted', 'sourceContextKernelAccepted', 'audit', 'diagnostics']}

    def denied(analysis, name, **change):
        try:
            convert(analysis, name, **change)
            return 'accepted', {}
        except ValueError as error:
            return 'rejected', {'message': str(error)}

    try:
        metadata = analyze(SOURCE)
        if metadata['hasErrors']:
            raise RuntimeError(metadata['diagnostics'])
        for name in ['public_zero', 'dependent', 'implicit', 'unicode', 'instance_proof']:
            qualified = 'IndependentAcceptance.' + name
            def positive(qualified=qualified):
                document = convert(metadata, qualified)
                saved[qualified] = document
                actual, evidence = checked(document)
                evidence.update(inputs=document['graph']['inputs'], wires=document['graph']['edges'],
                    sourceUnchanged=document['graph']['sourceContext']['source'] == SOURCE,
                    roundTripPolicy=source_document(document['graph']['sourceContext'])['policy'])
                return actual, evidence
            record(name + '_actual_kernel', 'valid', positive)

        for name in ['IndependentAcceptance.private_type', 'IndependentAcceptance.polymorphic']:
            record(name + '_unsupported', 'rejected', lambda name=name: denied(metadata, name))
        private = next(item['name'] for item in metadata['declarations'] if item['private'] and item['name'].endswith('.zero'))
        record('private_selection_unsupported', 'rejected', lambda: denied(metadata, private))
        record('stale_source_identity', 'rejected', lambda: denied(metadata, 'IndependentAcceptance.dependent', sourceHash='0'*64))
        record('stale_environment_identity', 'rejected', lambda: denied(metadata, 'IndependentAcceptance.dependent', environmentHash='0'*64))

        original = saved['IndependentAcceptance.dependent']
        bad = copy.deepcopy(original)
        bad['graph']['nodes'][-1]['body'] = 'by exact True.intro'
        record('edited_wrong_body', 'invalid', lambda: checked(bad))
        corrupt = copy.deepcopy(original)
        corrupt['graph']['sourceContext']['source'] += '\n-- changed'
        record('source_context_changed_without_reanalysis', 'invalid', lambda: (compile_typed_graph(corrupt['graph'])['status'], {}))
        stale = copy.deepcopy(original)
        stale['graph']['sourceContext']['environmentHash'] = '0'*64
        record('saved_old_environment_recheck', 'invalid', lambda: checked(stale))

        for label, source, target, expected in [
            ('sorry_original', 'theorem sorry_target : True := by sorry\n', 'sorry_target', 'incomplete'),
            ('custom_axiom_original', 'axiom acceptance_axiom : False\ntheorem axiom_target : False := acceptance_axiom\n', 'axiom_target', 'invalid')]:
            def check_source(source=source, target=target):
                result = analyze(source)
                return checked(convert(result, target))
            record(label, expected, check_source)
        partial = analyze('theorem good : True := True.intro\ndef broken : Nat := True.intro\n')
        record('partial_error_source', 'rejected', lambda: denied(partial, 'good'))
    finally:
        index.shutdown()
        sources.shutdown()
        result = {'kind': 'independent actual Lean conversion acceptance', 'sourceSHA256': hashlib.sha256(SOURCE.encode()).hexdigest(),
            'cases': rows, 'passed': sum(row['pass'] for row in rows), 'total': len(rows)}
        Path(__file__).with_name('acceptance-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    if not all(row['pass'] for row in rows):
        raise SystemExit(1)

if __name__ == '__main__':
    main()
