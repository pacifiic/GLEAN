# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""H04/B05 real typed compiler and optional trusted Lean graph controls."""
import copy
import hashlib
import json
import sys
import time
from pathlib import Path
from glean.prototype.typed_graph import compile_typed_graph
from glean.prototype.source_check import SourceCheckService
from glean.prototype.graph_jobs import GraphCheckService

directory=Path('glean/research/2026-10-07-block-hierarchy-implementation')
parameters=[{'id':'P','name':'P','type':'Prop'},{'id':'Q','name':'Q','type':'Prop'},{'id':'h','name':'h','type':'P ∨ Q'}]
branches=[]
for label,proposition,constructor in [('left','P','Or.inl'),('right','Q','Or.inr')]:
    inputs=[*copy.deepcopy(parameters[:2]),{'id':'w','name':'w','type':proposition}]
    nodes=[{'id':label+'_'+p['id'],'kind':'input','ref':p['id']} for p in inputs]
    proof={'id':label+'_proof','kind':'script','inputs':inputs,'outputType':'P ∨ Q','body':constructor+' w'}
    nodes.append(proof)
    branches.append({'id':label,'constructor':constructor,'binders':[{'id':'w','name':'w','type':proposition}],'nodes':nodes,'edges':[{'id':label+'_'+p['id']+'_wire','source':label+'_'+p['id'],'output':'out','target':proof['id'],'input':p['id']} for p in inputs],'result':{'node':proof['id'],'output':'out'}})
cases={'version':3,'name':'H04 independent Cases scope','projectId':'glean','imports':[],'policy':'strict','inputs':parameters,'goal':'P ∨ Q','modules':[],'nodes':[*[{'id':p['id'],'kind':'input','ref':p['id']} for p in parameters],{'id':'split','kind':'cases','inputs':copy.deepcopy(parameters),'outputType':'P ∨ Q','scrutinee':'h','branches':branches}],'edges':[{'id':'root_'+p['id']+'_wire','source':p['id'],'output':'out','target':'split','input':p['id']} for p in parameters],'result':{'node':'split','output':'out'}}
parent={'version':3,'name':'B05 independent public boundary','projectId':'glean','imports':[],'policy':'strict','inputs':[],'goal':'3 = 3','modules':[{'id':'M','name':'public identity','inputs':[{'id':'x','name':'x','type':'Nat'}],'outputType':'Nat','nodes':[{'id':'public_x','kind':'input','ref':'x'},{'id':'body','kind':'script','inputs':[{'id':'x','name':'x','type':'Nat'}],'outputType':'Nat','body':'x'}],'edges':[{'id':'inner-wire','source':'public_x','output':'out','target':'body','input':'x'}],'result':{'node':'body','output':'out'}}],'nodes':[{'id':'n','kind':'nat','value':'3'},{'id':'parent','kind':'module','ref':'M'},{'id':'proof','kind':'script','inputs':[{'id':'y','name':'y','type':'Nat'}],'outputType':'y = y','body':'by rfl'}],'edges':[{'id':'outer-input','source':'n','output':'out','target':'parent','input':'x'},{'id':'outer-result','source':'parent','output':'out','target':'proof','input':'y'}],'result':{'node':'proof','output':'out'}}
fixtures={'cases':cases,'parent':parent};results=[]
for name,graph in fixtures.items():
    compiled=compile_typed_graph(graph)
    results.append({'case':name+'-positive','expected':'ready','status':compiled['status'],'diagnostics':compiled['diagnostics'],'generatedHash':hashlib.sha256(compiled.get('generatedCode','').encode()).hexdigest()})
    (directory/('design-audit-'+name+'-boundary-fixture.json')).write_text(json.dumps({'kind':'graph','graph':graph},ensure_ascii=False,indent=2))
for name in ['cross-sibling-wire','escaped-branch-binder','outside-to-inner-plain','outside-to-inner-qualified','inner-to-outside-qualified']:
    graph=copy.deepcopy(cases if name.startswith(('cross','escaped')) else parent)
    if name=='cross-sibling-wire':graph['nodes'][-1]['branches'][1]['edges'][-1]['source']='left_w'
    elif name=='escaped-branch-binder':graph['nodes'].append({'id':'escaped','kind':'input','ref':'w'})
    elif name=='outside-to-inner-plain':graph['edges'][0]['target']='body'
    elif name=='outside-to-inner-qualified':graph['edges'][0]['target']='module/M/body'
    elif name=='inner-to-outside-qualified':graph['edges'][1]['source']='module/M/body'
    before=copy.deepcopy(graph);compiled=compile_typed_graph(graph)
    results.append({'case':name,'expected':'invalid','status':compiled['status'],'diagnostics':compiled['diagnostics'],'unchanged':before==graph})
(directory/'design-audit-scope-boundaries-compiler-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False),flush=True)
if '--actual' in sys.argv:
    source=SourceCheckService()
    try:
        service=GraphCheckService(source);actual=[]
        for name,graph in fixtures.items():
            result=service.start({'graph':graph});deadline=time.monotonic()+90
            while result.get('status') not in {'valid','invalid','incomplete','error','cancelled'} and time.monotonic()<deadline:
                time.sleep(.2);result=service.get(result['jobId'])
            if result.get('status') not in {'valid','invalid','incomplete','error','cancelled'}:service.cancel(result['jobId'])
            actual.append({'case':name,'result':result});(directory/('design-audit-'+name+'-boundary-actual.json')).write_text(json.dumps(actual[-1],ensure_ascii=False,indent=2))
            print(json.dumps({'case':name,**{k:result.get(k) for k in ['status','verified','kernelAccepted','diagnostics']}},ensure_ascii=False),flush=True)
        (directory/'design-audit-scope-boundaries-actual-results.json').write_text(json.dumps(actual,ensure_ascii=False,indent=2))
    finally:source.shutdown()
