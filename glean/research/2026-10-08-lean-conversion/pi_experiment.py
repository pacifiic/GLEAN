# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Reproduce conversion of the unchanged mathlib pi source with actual Lean."""
import base64
import copy
import hashlib
import json
from pathlib import Path
import time
from glean.prototype.declaration_index import DeclarationIndexService
from glean.prototype.source_check import SourceCheckService
from glean.prototype.graph_jobs import GraphCheckService

HERE = Path(__file__).resolve().parent
ORIGINAL = HERE.parent / '2026-10-07-pi-audit/reference/Irrational.lean'
TERMINAL = {'analyzed', 'valid', 'invalid', 'incomplete', 'error', 'cancelled'}

def wait(service, result):
    started = time.monotonic()
    phase = None
    while True:
        if result.get('phase') != phase:
            phase = result.get('phase')
            print(result['status'], phase, round(time.monotonic()-started, 1), flush=True)
        if result['status'] in TERMINAL:
            return result
        if time.monotonic()-started > 390:
            service.cancel(result['jobId'])
            raise TimeoutError('Experiment wait exceeded 390 seconds')
        time.sleep(.2)
        result = service.get(result['jobId'])

def main():
    raw = ORIGINAL.read_bytes()
    source = raw.decode('utf-8')
    index = DeclarationIndexService()
    sources = SourceCheckService()
    graphs = GraphCheckService(sources)
    rows = []
    try:
        analyzed = wait(index, index.start({'source':source, 'filename':'Irrational.lean', 'projectId':'mathlib'}))
        (HERE/'pi-analysis.json').write_text(json.dumps(analyzed, ensure_ascii=False, indent=2))
        assert analyzed['status'] == 'analyzed' and not analyzed['hasErrors'], analyzed.get('diagnostics')
        origin = {'version':1,'bytesBase64':base64.b64encode(raw).decode(), 'byteLength':len(raw),
                  'sha256':hashlib.sha256(raw).hexdigest(), 'bom':raw.startswith(b'\xef\xbb\xbf'), 'decoding':'utf-8'}
        document = index.convert({'jobId':analyzed['jobId'], 'declaration':'irrational_pi',
            'sourceHash':analyzed['sourceHash'], 'environmentHash':analyzed['environment']['environmentHash'],
            'policy':'standard', 'sourceOrigin':origin})
        (HERE/'pi-converted.glean.json').write_text(json.dumps(document, ensure_ascii=False, indent=2))
        graph = document['graph']
        assert graph['sourceContext']['source'] == source
        assert graph['nodes'][-1]['body'] == '@irrational_pi'
        for label, expected, candidate in [('original_call', 'valid', graph),
            ('wrong_call', 'invalid', {**copy.deepcopy(graph), 'nodes':[{**graph['nodes'][-1], 'body':'by exact True.intro'}]})]:
            result = wait(graphs, graphs.start({'graph':candidate}))
            passed = result['status'] == expected
            if expected == 'valid':
                passed = passed and result.get('verified') is True and result.get('sourceContextKernelAccepted') is True
            else:
                passed = passed and result.get('verified') is False
            rows.append({'case':label, 'expected':expected, 'pass':passed, 'result':result})
            print(label, result['status'], 'verified', result.get('verified'),
                  'sourceReplay',result.get('sourceContextKernelAccepted'), flush=True)
            if result['status'] != expected:
                break
    finally:
        index.shutdown()
        sources.shutdown()
        (HERE/'pi-results.json').write_text(json.dumps({'cases':rows}, ensure_ascii=False, indent=2))
    assert len(rows)==2 and all(row['pass'] for row in rows), [(row['case'], row['result']['status']) for row in rows]

if __name__ == '__main__':
    main()
