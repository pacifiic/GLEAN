# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import json,time
from pathlib import Path
from glean.prototype.source_check import SourceCheckService
request={'projectId':'glean','filename':'LocalStructure.lean','target':'local_structure','policy':'strict','source':'structure LocalRecord where\n  value : Nat\n\ntheorem local_structure : (LocalRecord.mk 1).value = 1 :=\n  Eq.refl ((LocalRecord.mk 1).value)\n'}
service=SourceCheckService()
try:
 result=service.start(request);deadline=time.monotonic()+180
 while result['status'] not in {'valid','invalid','incomplete','error','cancelled'} and time.monotonic()<deadline:
  time.sleep(.2);result=service.get(result['jobId'])
 Path('glean/research/2026-10-07-grasshopper-implementation/design-audit-local-structure-results.json').write_text(json.dumps({'request':request,'result':result},ensure_ascii=False,indent=2))
 print(json.dumps({k:result.get(k) for k in ('status','verified','audit','diagnostics','bindingUsage','lean')},ensure_ascii=False,indent=2))
finally:service.shutdown()
