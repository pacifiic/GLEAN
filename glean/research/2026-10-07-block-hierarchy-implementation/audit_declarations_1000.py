# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Compare a thousand current-file declarations with actual product command-state metadata."""
import hashlib
import json
from pathlib import Path
import sys
import time
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT.parent))
from glean.prototype.declaration_index import DeclarationIndexService
HERE = Path(__file__).resolve().parent
source = (HERE/'fixtures/declarations-1000.lean').read_text()
expected = json.loads((HERE/'fixtures/declarations-1000.expected.json').read_text())
assert hashlib.sha256(source.encode()).hexdigest()==expected['sourceSha256']
report = {'kind':'actual product DeclarationIndexService command-state metadata; declaration analysis never proof verification', 'productHash':hashlib.sha256((ROOT/'prototype/declaration_index.py').read_bytes()).hexdigest(), 'sourceHash':expected['sourceSha256'], 'sourceBytes':len(source.encode())}
service = DeclarationIndexService()
started = time.monotonic()
try:
    result = service.start({'source':source,'filename':'LargeIndex.lean','projectId':'glean'})
    phases = []
    while result['status'] not in {'analyzed','error','cancelled'}:
        if not phases or phases[-1]['phase']!=result.get('phase'):
            phases.append({'phase':result.get('phase'),'seconds':round(time.monotonic()-started,3)})
        if time.monotonic()-started>150:
            service.cancel(result['jobId'])
            raise TimeoutError('actual current-file metadata deadline exceeded')
        time.sleep(.2)
        result = service.get(result['jobId'])
    (HERE/'declarations-1000-actual-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    report.update(status=result['status'],verified=result['verified'],kernelAccepted=result['kernelAccepted'],hasErrors=result.get('hasErrors'),wallSeconds=round(time.monotonic()-started,3),phases=phases,diagnostics=result.get('diagnostics'),environment=result.get('environment'))
    checks = []
    if result['status']=='analyzed':
        items={item['name']:item for item in result['declarations']}
        wanted={f'GleanLargeIndex.declaration_{index:04d}' for index in range(1000)}
        checks.append({'id':'all-1000-current-file-actual-names','pass':set(items)==wanted,'actualCount':len(items)})
        checks.append({'id':'metadata-analysis-is-not-verification','pass':result['verified'] is False and result['kernelAccepted'] is False and result['hasErrors'] is False and result.get('sourceAttribution')=='current-file' and result.get('adapter')=='lean-4.34.1-command-state' and result['sourceHash']==expected['sourceSha256']})
        failures=[]
        rows=source.splitlines()
        for index in range(1000):
            name=f'GleanLargeIndex.declaration_{index:04d}'
            item=items.get(name,{})
            inputs=item.get('inputs',[])
            location=item.get('range')
            good=(len(inputs)==1 and inputs[0].get('name')=='n' and inputs[0].get('type')=='Nat' and inputs[0].get('implicit') is False and inputs[0].get('instance') is False and item.get('outputType')=='n + 0 = n' and 'Nat.add_zero' in item.get('directDependencies',[]) and location and location['startLine']==index+9 and name.split('.')[-1] in rows[location['startLine']-1])
            if not good:failures.append({'name':name,'actual':item})
        checks.append({'id':'all-1000-real-telescopes-ranges-and-direct-constants','pass':not failures,'failures':failures[:5]})
        report['first']=items.get(expected['firstFullName']);report['last']=items.get(expected['lastFullName'])
    else:
        checks.append({'id':'actual-command-analysis','pass':False,'error':result.get('lean')})
    report['checks']=checks;report['pass']=all(check['pass'] for check in checks)
finally:
    service.shutdown()
(HERE/'declarations-1000-audit-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
if not report['pass']:raise SystemExit(1)
