# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Replay one actual metadata record with equivalent JSON object key orders."""
import copy
import json
from pathlib import Path
from glean.prototype.graph_jobs import GraphCheckService
from glean.prototype.typed_graph import compile_typed_graph

directory = Path('glean/research/2026-10-07-block-hierarchy-implementation')
saved = json.loads((directory / 'design-audit-metadata-owner-cases-results.json').read_text())
compiled = compile_typed_graph(saved['graph'])
actual = saved['result']
records = []
for reversed_order in [False, True]:
    bindings = dict(list(actual['bindingTypes'].items())[::(-1 if reversed_order else 1)])
    dependencies = dict(list(actual['bindingDependencies'].items())[::(-1 if reversed_order else 1)])
    legacy = {key: value for name, key in actual['nodeBindings'].items()
              for binding, value in bindings.items() if binding.rsplit('/', 1)[-1] == name}

    class SourceReplay:
        def start(self, *args, **kwargs):
            return {'jobId': 'replayed-observation', 'status': actual['status'], 'verified': actual['verified']}
        def get(self, identifier):
            return {field: copy.deepcopy(actual.get(field)) for field in ['status', 'verified', 'kernelAccepted', 'audit', 'constantAxioms', 'bindingInputTypes', 'diagnostics', 'lean']} | {'bindingTypes': bindings, 'bindingDependencies': dependencies}

    service = GraphCheckService(SourceReplay())
    result = service.start({'graph': saved['graph']})
    response = service.get(result['jobId'])
    key = 'root/split/left/left_proof/out'
    record = {'reversedObjectOrder': reversed_order, 'legacyBasenameObservedType': legacy[key], 'currentOwnedObservedType': response['typedNodeTypes'][key], 'currentOwnedUsage': response['typedNodeUsage'][key]}
    assert record['currentOwnedObservedType'] == 'Or P Q'
    assert record['currentOwnedUsage'] == ['P', 'Q', 'w']
    records.append(record)
assert {record['legacyBasenameObservedType'] for record in records} == {'Bool', 'Or P Q'}
(directory / 'design-audit-metadata-order-results.json').write_text(json.dumps({'kind': 'real actual metadata replay, no new kernel verification', 'records': records}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(records, ensure_ascii=False), flush=True)
