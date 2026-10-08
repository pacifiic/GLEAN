# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Use a legal local let name to test graph metadata's complete owner identity."""
import json
import time
from pathlib import Path
from glean.prototype.source_check import SourceCheckService
from glean.prototype.graph_jobs import GraphCheckService

directory = Path('glean/research/2026-10-07-block-hierarchy-implementation')
graph = json.loads((directory / 'design-audit-cases-boundary-fixture.json').read_text())['graph']
graph['nodes'][-1]['branches'][0]['nodes'][-1]['body'] = 'let glean_component_4 : Bool := true; Or.inl w'
sources = SourceCheckService()
try:
    service = GraphCheckService(sources)
    result = service.start({'graph': graph})
    deadline = time.monotonic() + 90
    while result['status'] not in {'valid', 'invalid', 'incomplete', 'error', 'cancelled'}:
        if time.monotonic() >= deadline:
            service.cancel(result['jobId'])
            raise TimeoutError('Small metadata ownership control exceeded 90 seconds')
        time.sleep(.2)
        result = service.get(result['jobId'])
    (directory / 'design-audit-metadata-owner-cases-retest.json').write_text(json.dumps({'graph': graph, 'result': result}, ensure_ascii=False, indent=2) + '\n')
    key = 'root/split/left/left_proof/out'
    checks = {'valid': result['status'] == 'valid' and result['verified'], 'actualType': result.get('typedNodeTypes', {}).get(key) == 'Or P Q', 'actualUsage': result.get('typedNodeUsage', {}).get(key) == ['P', 'Q', 'w'], 'unrelatedUserLocalNotIndexed': 'glean_component_3/glean_component_4' not in result.get('bindingTypes', {})}
    print(json.dumps({'checks': checks, 'typedNodeTypes': result.get('typedNodeTypes'), 'typedNodeUsage': result.get('typedNodeUsage')}, ensure_ascii=False), flush=True)
    assert all(checks.values()), checks
finally:
    sources.shutdown()
