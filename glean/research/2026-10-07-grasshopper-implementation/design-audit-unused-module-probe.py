# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import json,time,sys
from pathlib import Path
from glean.prototype.source_check import SourceCheckService
from glean.prototype.graph_jobs import GraphCheckService
module={'id':'unfinished','name':'Unused unfinished module','inputs':[],'outputType':'False','nodes':[{'id':'proof','kind':'script','inputs':[],'outputType':'False','body':'by sorry'}],'edges':[],'result':{'node':'proof','output':'out'}}
fixture={'version':3,'name':'Unused module audit','projectId':'glean','imports':[],'policy':'strict','inputs':[],'goal':'True','modules':[module],'nodes':[{'id':'valid','kind':'script','inputs':[],'outputType':'True','body':'True.intro'}],'edges':[],'result':{'node':'valid','output':'out'}}
source=SourceCheckService();service=GraphCheckService(source)
try:
 result=service.start({'graph':fixture});deadline=time.monotonic()+180
 while result.get('status') not in {'valid','invalid','incomplete','error','cancelled'} and time.monotonic()<deadline:
  time.sleep(.2);result=service.get(result['jobId'])
 Path(sys.argv[1] if len(sys.argv)>1 else 'glean/research/2026-10-07-grasshopper-implementation/design-audit-unused-module-results.json').write_text(json.dumps({'fixture':fixture,'result':result},ensure_ascii=False,indent=2))
 print(json.dumps({k:result.get(k) for k in ('status','verified','audit','diagnostics','typedNodeTypes','typedNodeUsage','typedNodeAudit','nodeFunctions')},ensure_ascii=False,indent=2))
finally:source.shutdown()
