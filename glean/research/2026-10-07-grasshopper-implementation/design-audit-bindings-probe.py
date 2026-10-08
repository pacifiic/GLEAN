# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import json,time
from pathlib import Path
from glean.prototype.source_check import SourceCheckService
from glean.prototype.graph_jobs import GraphCheckService
inputs=[{'id':'P','name':'P','type':'Prop'},{'id':'Q','name':'Q','type':'Prop'},{'id':'hp','name':'hp','type':'P'},{'id':'hq','name':'hq','type':'Q'}]
nodes=[{'id':p['id'],'kind':'input','ref':p['id']} for p in inputs]+[{'id':'select','kind':'script','name':'return hp','inputs':inputs,'outputType':'P','body':'hp'}]
graph={'version':3,'name':'Unused hypothesis probe','projectId':'glean','imports':[],'policy':'standard','inputs':inputs,'goal':'P','modules':[],'nodes':nodes,'edges':[{'id':'e'+p['id'],'source':p['id'],'output':'out','target':'select','input':p['id']} for p in inputs],'result':{'node':'select','output':'out'}}
source=SourceCheckService();service=GraphCheckService(source)
try:
 result=service.start({'graph':graph});deadline=time.monotonic()+125
 while result.get('status') not in {'valid','invalid','incomplete','error','cancelled'} and time.monotonic()<deadline:
  time.sleep(.2);result=service.get(result['jobId'])
 Path('glean/research/2026-10-07-grasshopper-implementation/design-audit-bindings-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
 print(json.dumps({k:result.get(k) for k in ('status','verified','diagnostics','bindingTypes','bindingUsage','typedNodeTypes','nodeFunctions','inputBindings')},ensure_ascii=False,indent=2))
finally:source.shutdown()
