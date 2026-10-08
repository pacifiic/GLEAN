# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import json,runpy,time,hashlib
from pathlib import Path
from copy import deepcopy
from glean.prototype.source_check import SourceCheckService
from glean.prototype.graph_jobs import GraphCheckService
f=runpy.run_path('glean/research/2026-10-07-grasshopper-implementation/audit_typed_core.py')
parameters=[f['param']('P','Prop'),f['param']('Q','Prop'),f['param']('hp','P'),f['param']('hq','Q')]
unused=f['graph'](parameters,'P',[{'id':p['id'],'kind':'input','ref':p['id']} for p in parameters]+[f['script']('select',parameters,'P','hp')],[f['wire'](p['id'],'select',p['id']) for p in parameters],'select')
disconnected=json.loads(Path('glean/research/2026-10-07-grasshopper-implementation/design-audit-disconnected-results.json').read_text())['fixture']
sibling=f['or_cases']();sibling['nodes'][-1]['branches'][1]['nodes'][2]['ref']='hp'
wrong=deepcopy(unused);wrong['nodes'][-1]['body']='True.intro'
fixtures=[('unused-argument',unused,'valid'),('Cases-metadata',f['or_cases'](),'valid'),('Fin-metadata',f['dependent_module'](),'valid'),('disconnected-sorry',disconnected,'incomplete'),('Cases-sibling-scope-negative',sibling,'invalid'),('wrong-term-negative',wrong,'invalid')]
source=SourceCheckService(timeout_seconds=120);service=GraphCheckService(source)
report={'codeHashes':{name:hashlib.sha256(Path('glean/prototype/'+name).read_bytes()).hexdigest() for name in ['source_check.py','typed_graph.py','graph_jobs.py']},'cases':[]}
try:
 for name,fixture,expected in fixtures:
  result=service.start({'graph':fixture});deadline=time.monotonic()+180
  while result.get('status') not in {'valid','invalid','incomplete','error','cancelled'} and time.monotonic()<deadline:
   time.sleep(.2);result=service.get(result['jobId'])
  entry={'id':name,'expected':expected,'fixture':fixture,'result':result};report['cases'].append(entry)
  Path('glean/research/2026-10-07-grasshopper-implementation/design-audit-metadata-retest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
  print(json.dumps({'id':name,'expected':expected,**{k:result.get(k) for k in ['status','verified','audit','diagnostics','typedNodeTypes','typedNodeUsage','typedPortTypes']}},ensure_ascii=False,indent=2),flush=True)
finally:source.shutdown()
