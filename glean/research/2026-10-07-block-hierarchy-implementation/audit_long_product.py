# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Independent long-body checks through actual product compilation and kernel jobs."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT.parent))
from glean.prototype.graph_jobs import GraphCheckService
from glean.prototype.source_check import SourceCheckService
from glean.prototype.typed_graph import compile_typed_graph

HERE = Path(__file__).resolve().parent
SUFFIX = sys.argv[1] if len(sys.argv) > 1 else ''
if SUFFIX and not all(char.isalnum() or char in '-_' for char in SUFFIX):
    raise SystemExit('artifact suffix must contain only letters, digits, - or _')
TAG = f'-{SUFFIX}' if SUFFIX else ''
TERMINAL = {'valid', 'invalid', 'error', 'cancelled', 'incomplete'}
digest = lambda value: hashlib.sha256(value.encode()).hexdigest()
report = {'method': 'actual GraphCheckService -> SourceCheckService -> expected signature and kernel audit; serial jobs',
          'startedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'productHashes': {}, 'cases': []}
for name in ('typed_graph.py', 'graph_jobs.py', 'source_check.py', 'limits.py'):
    report['productHashes'][name] = digest((ROOT/'prototype'/name).read_text())
sources = SourceCheckService(timeout_seconds=120, max_jobs=1)
service = GraphCheckService(sources)
try:
    for size in ('64k', '1m'):
        original = json.loads((HERE/'fixtures'/f'code-body-{size}.glean.json').read_text())['graph']
        for control in ('valid', 'wrong-ending'):
            graph = deepcopy(original)
            if control == 'wrong-ending':
                graph['nodes'][1]['body'] = graph['nodes'][1]['body'].rsplit('exact Nat.add_zero n', 1)[0] + 'exact True.intro'
            body = graph['nodes'][1]['body']
            compiled = compile_typed_graph(graph)
            assert compiled['status'] == 'ready', compiled.get('diagnostics')
            generated = compiled['generatedCode']
            expected = compiled['expectedSource']
            assert json.dumps(body, ensure_ascii=False) in generated
            started = time.monotonic()
            result = service.start({'graph': graph})
            job_id = result.get('jobId')
            while result['status'] not in TERMINAL:
                if time.monotonic()-started > 150:
                    service.cancel(job_id)
                    raise TimeoutError(f'{size}/{control} exceeded audit deadline')
                time.sleep(.2)
                result = service.get(job_id)
            name = f'long-product-{size}-{control}{TAG}'
            (HERE/f'{name}-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
            # Result JSON already preserves generated and expected sources. Retests
            # avoid changing the project's Lean-file environment fingerprint.
            if not SUFFIX:
                (HERE/f'{name}.lean').write_text(generated)
                (HERE/f'{name}-expected.lean').write_text(expected)
            item = {'name': name, 'size': size, 'control': control,
                    'bodyBytes': len(body.encode()), 'bodyLines': len(body.splitlines()), 'bodyHash': digest(body),
                    'graphJsonBytes': len(json.dumps({'kind':'graph','graph':graph}, ensure_ascii=False).encode()),
                    'sourceBytes': len(generated.encode()), 'sourceHash': digest(generated), 'expectedSourceHash': digest(expected),
                    'wallSeconds': round(time.monotonic()-started, 3), 'status': result['status'],
                    'verified': result['verified'], 'kernelAccepted': result.get('kernelAccepted'),
                    'audit': result.get('audit'), 'environment': result.get('environment'),
                    'diagnostics': result.get('diagnostics'), 'lean': result.get('lean')}
            item['pass'] = (result['verified'] is True and result['status']=='valid' and result.get('kernelAccepted') is True and not result.get('audit',{}).get('axioms')) if control=='valid' else (result['verified'] is False and result['status']=='invalid' and any('True' in d.get('message','') for d in result.get('diagnostics',[])))
            report['cases'].append(item)
            (HERE/f'long-product{TAG}-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
            print(json.dumps({key: item[key] for key in ('name','status','verified','bodyBytes','wallSeconds','pass')}), flush=True)
finally:
    sources.shutdown()
report['completedAt'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
report['pass'] = len(report['cases'])==4 and all(case['pass'] for case in report['cases'])
(HERE/f'long-product{TAG}-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
if not report['pass']:
    raise SystemExit(1)
