# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Actual small fragment controls; preserve old wrapper-position baseline separately."""
import hashlib
import json
import sys
import time
from pathlib import Path
from glean.prototype.source_check import SourceCheckService
from glean.prototype.graph_jobs import GraphCheckService

directory=Path('glean/research/2026-10-07-block-hierarchy-implementation')
cases={
    'type': 'by\n  have h0 : True := True.intro\n  have h1 : True := h0\n  exact (0 : Nat)',
    'syntax': 'by\n  have h : True := True.intro\n  exact (',
    'syntax_eof_newline': 'by\n  have h : True := True.intro\n  exact (\n',
    'unicode': 'by\n  exact (let s := "😀"; (0 : Nat))',
}
source=SourceCheckService()
try:
    service=GraphCheckService(source)
    evidence=[]
    for label in sys.argv[1:] or cases:
        body=cases[label]
        fixture={'version':3,'name':'fragment '+label,'projectId':'glean','imports':[],'policy':'strict','inputs':[],'goal':'True','modules':[],'nodes':[{'id':'proof','kind':'script','inputs':[],'outputType':'True','body':body}],'edges':[],'result':{'node':'proof','output':'out'}}
        result=service.start({'graph':fixture});deadline=time.monotonic()+90
        while result.get('status') not in {'valid','invalid','incomplete','error','cancelled'} and time.monotonic()<deadline:
            time.sleep(.2);result=service.get(result['jobId'])
        if result.get('status') not in {'valid','invalid','incomplete','error','cancelled'}:
            service.cancel(result['jobId'])
        item={'case':label,'fixture':fixture,'compilerHash':hashlib.sha256(Path('glean/prototype/typed_graph.py').read_bytes()).hexdigest(),'result':result}
        evidence.append(item)
        (directory/('design-audit-body-'+label+'-retest.json')).write_text(json.dumps(item,ensure_ascii=False,indent=2))
        print(json.dumps({'case':label,**{k:result.get(k) for k in ('status','verified','diagnostics')}},ensure_ascii=False),flush=True)
    if len(evidence)>1:(directory/'design-audit-body-diagnostics-retest.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2))
finally:
    source.shutdown()
