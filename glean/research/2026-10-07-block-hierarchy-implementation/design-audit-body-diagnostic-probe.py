# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Actual Lean baseline for body-local line/column preservation, not a success fixture."""
import hashlib
import json
import time
from pathlib import Path
from glean.prototype.source_check import SourceCheckService
from glean.prototype.graph_jobs import GraphCheckService

body='by\n  have h0 : True := True.intro\n  have h1 : True := h0\n  exact (0 : Nat)'
fixture={'version':3,'name':'body-local diagnostic baseline','projectId':'glean','imports':[],'policy':'strict','inputs':[],'goal':'True','modules':[],'nodes':[{'id':'proof','kind':'script','inputs':[],'outputType':'True','body':body}],'edges':[],'result':{'node':'proof','output':'out'}}
source=SourceCheckService()
try:
 service=GraphCheckService(source)
 result=service.start({'graph':fixture});deadline=time.monotonic()+120
 while result.get('status') not in {'valid','invalid','incomplete','error','cancelled'} and time.monotonic()<deadline:
  time.sleep(.2);result=service.get(result['jobId'])
 evidence={'fixture':fixture,'bodyErrorExpected':{'line':4,'column':9},'compilerHash':hashlib.sha256(Path('glean/prototype/typed_graph.py').read_bytes()).hexdigest(),'result':result}
 Path('glean/research/2026-10-07-block-hierarchy-implementation/design-audit-body-diagnostic-baseline.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2))
 print(json.dumps({k:result.get(k) for k in ('status','verified','diagnostics','sourceMap')},ensure_ascii=False,indent=2))
finally:
 source.shutdown()
