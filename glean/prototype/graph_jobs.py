# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Cancellable graph verification through the source service's independent kernel audit."""
from copy import deepcopy
import threading
import re
from .graph_scope import compile_for_scope
from .lean_policy import evaluate_axioms
from .source_check import parse_source_diagnostics

def fragment_diagnostics(output,fragments):
    diagnostics=[]
    for filename,fragment in fragments.items():
        messages=parse_source_diagnostics(output,filename,line_count=fragment['lineCount'])
        parser=re.compile(re.escape(filename)+r':(\d+):(\d+): (?:(?:error|warning|info): )?(.*)')
        for text in output.splitlines():
            match=parser.search(text)
            if match and not text.startswith(filename+':') and 1<=int(match[1])<=fragment['lineCount']:
                messages.append({'filename':filename,'line':int(match[1]),'column':int(match[2])+1,'severity':'error','message':match[3]})
        for diagnostic in messages:
            diagnostic.update(graphLocation=fragment['key'],fragmentField=fragment['field'],bodyLine=diagnostic['line'],bodyColumn=diagnostic['column'],columnEncoding='unicode')
            diagnostics.append(diagnostic)
    return diagnostics

def merge_fragment_diagnostics(diagnostics, mapped):
    if not mapped:
        return diagnostics
    filenames={item['filename'] for item in mapped}
    filtered=[item for item in diagnostics if not item.get('message','').startswith('Lean이 소스를 거부했습니다.')
              and not any(name+':' in item.get('message','') for name in filenames)]
    return filtered+mapped

class GraphCheckService:
    def __init__(self, source_service):
        self.sources=source_service
        self._compiled={}
        self._lock=threading.RLock()
    def start(self, request):
        if not isinstance(request,dict):
            raise ValueError('Graph request must be an object')
        graph=request.get('graph')
        typed=isinstance(graph,dict) and graph.get('version')==3
        if typed:
            from .typed_graph import compile_typed_graph
            compiled=compile_typed_graph(graph)
        else:
            compiled=compile_for_scope(graph,request.get('scope','all'))
        if compiled['status']!='ready':
            return {**compiled,'verified':False}
        arguments={'source':compiled['generatedCode'],'filename':'Graph.lean','target':'glean_proof','projectId':graph.get('projectId','glean'),'policy':graph.get('policy','strict')}
        if len(compiled.get('referenceEnvironments',[]))>1:
            return {**compiled,'status':'invalid','verified':False,'diagnostics':[{'severity':'error','message':'서로 다른 Lean 환경의 참조가 섞였습니다. 시그니처를 다시 조회하세요.'}]}
        options={'expected_source':compiled['expectedSource'],'metadata_bindings':list(compiled.get('bindingKeys',{}))} if typed else {}
        if compiled.get('sourceContext'):options['source_context']=compiled['sourceContext']
        if compiled.get('referenceEnvironments'):options['required_environment']=compiled['referenceEnvironments'][0]
        started=self.sources.start(arguments,**options)
        with self._lock:
            self._compiled[started['jobId']]=compiled
            while len(self._compiled)>50:
                self._compiled.pop(next(iter(self._compiled)))
        return {**deepcopy(compiled),**started}
    def get(self, identifier):
        result=self.sources.get(identifier)
        with self._lock:
            compiled=self._compiled.get(identifier)
        if result is None or compiled is None:return None
        response={**deepcopy(compiled),**result,'diagnostics':compiled['diagnostics']+result.get('diagnostics',[])}
        response['diagnostics']=merge_fragment_diagnostics(response['diagnostics'],fragment_diagnostics(result.get('lean',{}).get('output',''),compiled.get('fragmentSources',{})))
        bindings=result.get('bindingTypes',{})
        response['typedNodeTypes']={key:bindings[name] for name,key in compiled.get('bindingKeys',{}).items() if name in bindings}
        response['typedNodeTypes'].update({key:bindings[name] for key,name in compiled.get('inputBindings',{}).items() if name in bindings})
        dependencies=result.get('bindingDependencies',{})
        response['typedNodeUsage']={key:dependencies[name] for name,key in compiled.get('bindingKeys',{}).items() if name in dependencies}
        response['typedNodeUsage'].update({key:dependencies[name] for key,name in compiled.get('inputBindings',{}).items() if name in dependencies})
        arguments=result.get('bindingInputTypes',{})
        response['typedPortTypes']={}
        for name,key in compiled.get('bindingKeys',{}).items():
            types=arguments.get(name,[])
            for port,value in zip(compiled.get('nodeInputPorts',{}).get(key,[]),types):
                response['typedPortTypes'][key.rsplit('/',1)[0]+'/'+port]=value
        constant_axioms=result.get('constantAxioms',{})
        response['typedNodeAudit']={key:evaluate_axioms(constant_axioms[helper],compiled.get('policy','standard'))
                                    for key,helper in compiled.get('nodeFunctions',{}).items() if helper in constant_axioms}
        for diagnostic in response['diagnostics']:
            line=diagnostic.get('line')
            if line and not diagnostic.get('bodyLine'):
                ranges=[{'key':key,**value} for key,value in compiled.get('sourceMap',{}).items()]+compiled.get('sourceLocations',[])
                matching=sorted((r for r in ranges if r['startLine']<=line<=r['endLine']),key=lambda r:r['endLine']-r['startLine'])
                if matching:diagnostic['graphLocation']=matching[0]['key']
        return response
    def cancel(self, identifier):
        result=self.sources.cancel(identifier)
        with self._lock:
            compiled=self._compiled.get(identifier)
        return None if result is None or compiled is None else {**deepcopy(compiled),**result}
