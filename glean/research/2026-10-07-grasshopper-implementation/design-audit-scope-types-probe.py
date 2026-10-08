# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import json,runpy,time
from pathlib import Path
from glean.prototype.source_check import SourceCheckService
from glean.prototype.graph_jobs import GraphCheckService
fixtures=runpy.run_path('glean/research/2026-10-07-grasshopper-implementation/audit_typed_core.py')
source=SourceCheckService();service=GraphCheckService(source);report=[]
try:
 for name,factory in [('cases',fixtures['or_cases']),('Fin-module',fixtures['dependent_module'])]:
  result=service.start({'graph':factory()});deadline=time.monotonic()+125
  while result.get('status') not in {'valid','invalid','incomplete','error','cancelled'} and time.monotonic()<deadline:
   time.sleep(.2);result=service.get(result['jobId'])
  entry={'id':name,'result':result};report.append(entry)
  Path('glean/research/2026-10-07-grasshopper-implementation/design-audit-scope-types-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
  print(json.dumps({'id':name,**{k:result.get(k) for k in ('status','verified','bindingTypes','bindingUsage','typedNodeTypes','nodeFunctions','inputBindings')}},ensure_ascii=False,indent=2),flush=True)
finally:source.shutdown()
