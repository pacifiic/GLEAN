# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Explicit typed component graphs compiled into closed Lean functions.

Lean owns mathematical inference. This layer checks identity, bounds and lexical
scope, then represents every user fragment as string data for an EOF term parser.
"""
from collections import deque
import json
import math
import re
from .limits import MAX_BODY_BYTES, MAX_SOURCE_BYTES

_NAME=re.compile(r"[A-Za-z][A-Za-z0-9_']{0,63}\Z")
_QUALIFIED=re.compile(r"[A-Za-z_][A-Za-z0-9_']*(?:\.[A-Za-z_][A-Za-z0-9_']*)*\Z")
_KEYWORDS={'by','let','in','fun','match','with','if','then','else','do','have','show','from','where','theorem','def','axiom','namespace','end','open','import','set_option','Type','Prop','Sort','forall','structure','class','instance','private','public','syntax','value'}
_KINDS={'input','nat','script','reference','module','construct','calc','cases'}


def _header(imports, token='gleanTerm'):
    template = r'''open Lean Elab Term in
elab "GLEAN_TOKEN% " location:str text:str : term <= expectedType => do
  let filename := if location.getString.isEmpty then "<input>" else location.getString
  let stx ← match Parser.runParserCategory (← getEnv) `term text.getString filename with
    | .ok parsed => pure parsed
    | .error message => throwError message
  let stx := if location.getString.isEmpty then stx.rewriteBottomUp (Syntax.setInfo text.raw.getHeadInfo) else stx
  let elaborate : TermElabM Expr := withoutErrToSorry do
    try
      let result ← elabTerm stx expectedType
      synthesizeSyntheticMVarsNoPostponing
      let result ← instantiateMVars result
      let env ← getEnv
      let mut pending := result.getUsedConstants.toList
      let mut seen : NameSet := {}
      while !pending.isEmpty do
        let name := pending.head!
        pending := pending.tail!
        unless seen.contains name do
          seen := seen.insert name
          if name.toString.startsWith "glean_component_" || name.toString.startsWith "glean_module_" || name == `glean_proof then
            throwError "Component fragments may use only explicit inputs and imported declarations, not generated helpers"
          if (env.getModuleIdxFor? name).isNone then
            if let some ci := env.find? name then
              pending := ci.getUsedConstantsAsSet.toList ++ pending
      return result
    catch error =>
      logException error
      throwAbortTerm
  if location.getString.isEmpty then elaborate
  else withTheReader Core.Context (fun ctx => { ctx with fileName := filename, fileMap := FileMap.ofString text.getString }) elaborate
'''
    return ['import Lean', *['import '+name for name in imports], 'set_option autoImplicit false', 'set_option linter.defProp false', 'set_option Elab.async false', *template.replace('GLEAN_TOKEN',token).splitlines(), '']


def _text(value,label,maximum=8192):
    if not isinstance(value,str) or not value.strip() or len(value.encode())>maximum:
        raise ValueError(f'{label} must be nonempty text, at most {maximum} bytes')
    return value


def _id(value):
    identifier=_text(value,'ID',128)
    if '/' in identifier or any(ord(c)<32 for c in identifier):raise ValueError('IDs cannot contain slash or control characters')
    return identifier


def _array(value,label,maximum):
    if not isinstance(value,list) or len(value)>maximum:
        raise ValueError(f'{label} must be an array with at most {maximum} entries')
    return value


def _parameters(value):
    parameters=_array(value,'inputs',16)
    ids=set();names=set()
    for item in parameters:
        if not isinstance(item,dict):raise ValueError('Each input must be an object')
        identifier=_id(item.get('id'));name=item.get('name')
        if identifier in ids:raise ValueError('Duplicate input ID')
        if not isinstance(name,str) or not _NAME.fullmatch(name) or name in _KEYWORDS or name.startswith('glean_') or name in names:
            raise ValueError('Input aliases must be unique non-keyword ASCII Lean names')
        ids.add(identifier);names.add(name);_text(item.get('type'),'Input type',4096)
    return parameters


def _fragment(text, token='gleanTerm', location=''):
    return '('+token+'% '+json.dumps(location,ensure_ascii=False)+' '+json.dumps(text,ensure_ascii=False)+')'


class _Compiler:
    def __init__(self,graph):
        self.graph=graph;self.code=[];self.maps={};self.count=0;self.nodes=0;self.edges=0
        self.modules={};self.module_names={};self.module_state={};self.location={};self.node_bindings={};self.binding_keys={};self.locations=[];self.node_functions={};self.input_bindings={};self.reference_hashes=set();self.node_input_ports={};self.fragment_sources={}
    def fail(self,message,scope=None,node=None):
        if scope:self.location['scopeId']=scope
        if node:self.location['nodeId']=node
        raise ValueError(message)
    def emit(self,lines,key=None):
        start=len(self.code)+1;self.code.extend(lines)
        if key:self.maps[key]={'startLine':start,'endLine':len(self.code)}
    def binders(self,parameters,token='gleanTerm'):
        return ' '.join('('+p['name']+' : '+_fragment(p['type'],token)+')' for p in parameters)
    def name(self):
        self.count+=1;return 'glean_component_'+str(self.count)
    def signature(self,node):
        if node['kind']=='module':
            definition=self.modules.get(node.get('ref'))
            if definition is None:self.fail('Unknown module reference')
            return definition['inputs']
        if node['kind'] in {'input','nat'}:return []
        return _parameters(node.get('inputs'))
    def outputs(self,node):
        if node['kind']!='construct':return [{'id':'out','name':'out'}]
        outputs=_array(node.get('outputs'),'outputs',16)
        if not outputs:self.fail('Construct needs at least one named output')
        seen=set()
        for output in outputs:
            if not isinstance(output,dict):self.fail('Malformed output')
            identifier=_id(output.get('id'))
            if identifier in seen:self.fail('Duplicate output ID')
            seen.add(identifier);_text(output.get('name'),'Output name',128)
            _text(output.get('type'),'Output type',4096);_text(output.get('term'),'Projection term')
        return outputs
    def module(self,identifier):
        if self.module_state.get(identifier)=='ready':return self.module_names[identifier]
        if self.module_state.get(identifier)=='visiting':self.fail('Recursive modules are unsupported')
        definition=self.modules[identifier];self.module_state[identifier]='visiting'
        self.location={'scopeId':'module/'+identifier}
        parameters=_parameters(definition.get('inputs'));output=_text(definition.get('outputType'),'Module output type',4096)
        name=self.module_names[identifier]
        body=self.scope(definition,{p['id']:p['name'] for p in parameters},'module/'+identifier,0)
        self.emit([f'noncomputable def {name} {self.binders(parameters)} : {_fragment(output)} :=', *['  '+line for line in body], ''])
        self.module_state[identifier]='ready';return name
    def component(self,node,scope,depth):
        kind=node['kind'];parameters=self.signature(node);output=_text(node.get('outputType'),'Output type',4096)
        key=scope+'/'+node['id'];name=self.name();binders=self.binders(parameters)
        if kind in {'script','construct'}:
            source=_text(node.get('body'),'Lean body',MAX_BODY_BYTES);filename='GLEAN_FRAGMENT_'+str(len(self.fragment_sources)+1)
            self.fragment_sources[filename]={'key':key,'field':'body','lineCount':len(source.split('\n'))}
            body=_fragment(source,location=filename)
        elif kind=='reference':
            declaration=node.get('declaration')
            if not isinstance(declaration,str) or not _QUALIFIED.fullmatch(declaration):self.fail('Invalid qualified declaration name')
            reference=node.get('reference')
            if not isinstance(reference,dict) or reference.get('name')!=declaration or reference.get('projectId')!=self.graph['projectId'] or reference.get('imports')!=self.graph.get('imports',[]):self.fail('Refresh this reference signature from the selected Lean environment')
            if reference.get('inputs')!=parameters or reference.get('outputType')!=output:self.fail('Reference ports differ from the queried signature; refresh the declaration')
            environment=reference.get('environment',{}).get('environmentHash')
            if not isinstance(environment,str):self.fail('Reference has no environment provenance; refresh it')
            self.reference_hashes.add(environment)
            body=_fragment('@'+declaration+' '+ ' '.join(p['name'] for p in parameters))
        elif kind=='calc':
            start=_text(node.get('start'),'Calc starting expression');steps=_array(node.get('steps'),'Calc steps',32)
            if not steps:self.fail('Calc needs at least one step')
            lines=['calc'];left=_fragment(start);step_ids=set()
            for step in steps:
                if not isinstance(step,dict):self.fail('Malformed calc step')
                step_id=_id(step.get('id'))
                if step_id in step_ids:self.fail('Duplicate calc step ID')
                step_ids.add(step_id);relation=step.get('relation')
                if relation not in {'=','≤','<'}:self.fail('Calc relation must be =, ≤, or <')
                right=_text(step.get('term'),'Calc expression');proof=_text(step.get('proof'),'Calc proof')
                lines.append('  '+left+' '+relation+' '+_fragment(right)+' := '+_fragment(proof));left='_'
            body='\n'.join(lines)
        elif kind=='cases':
            scrutinee=next((p['name'] for p in parameters if p['id']==node.get('scrutinee')),None)
            if scrutinee is None:self.fail('Cases scrutinee must be an explicit input')
            branches=_array(node.get('branches'),'Cases branches',16)
            if not branches:self.fail('Cases requires all constructor branches')
            lines=['match '+scrutinee+' with'];branch_ids=set()
            for branch in branches:
                if not isinstance(branch,dict):self.fail('Malformed branch')
                identifier=_id(branch.get('id'))
                if identifier in branch_ids:self.fail('Duplicate branch ID')
                branch_ids.add(identifier);constructor=branch.get('constructor')
                if not isinstance(constructor,str) or not _QUALIFIED.fullmatch(constructor):self.fail('Invalid case constructor')
                binders2=_parameters(branch.get('binders'))
                if {p['id'] for p in parameters}&{p['id'] for p in binders2} or {p['name'] for p in parameters}&{p['name'] for p in binders2}:self.fail('Case binders must not shadow explicit inputs')
                bindings={p['id']:p['name'] for p in parameters+binders2}
                branch_name=self.name()
                branch_path=key+'/'+identifier
                branch_body=self.scope(branch,bindings,branch_path,depth+1,binding_owner=branch_name)
                self.emit([f'noncomputable def {branch_name} {self.binders(parameters+binders2)} : {_fragment(output)} :=',*['  '+line for line in branch_body],''],branch_path)
                lines.append('| '+constructor+' '+ ' '.join(p['name'] for p in binders2)+' =>')
                lines.append('  '+branch_name+' '+ ' '.join('('+p['name']+')' for p in parameters+binders2))
            body='\n'.join(lines)
        else:self.fail('Unknown typed component')
        self.emit([f'noncomputable def {name} {binders} : {_fragment(output)} :=',*['  '+line for line in body.splitlines()],''],key)
        if kind=='calc':
            for index,step in enumerate(node['steps']):
                line=self.maps[key]['startLine']+2+index
                self.maps[key+'/'+step['id']]={'startLine':line,'endLine':line}
        if kind!='construct':return {'out':name}
        names={}
        for projection in self.outputs(node):
            projection_name=self.name();names[projection['id']]=projection_name
            # A dependent output type may mention the constructed value.
            actual='('+name+' '+ ' '.join(p['name'] for p in parameters)+')'
            result_type='(let value := '+actual+'; '+_fragment(projection['type'])+')'
            self.emit([f'noncomputable def {projection_name} {binders} : {result_type} :=',f'  let value := {actual}', '  '+_fragment(projection['term']),''],key+'/'+projection['id'])
        return names
    def scope(self,scope,bindings,path,depth,binding_owner=None):
        if depth>8:self.fail('Case scopes exceed depth 8',path)
        nodes=_array(scope.get('nodes'),'nodes',256);edges=_array(scope.get('edges'),'edges',512)
        self.nodes+=len(nodes);self.edges+=len(edges)
        if self.nodes>256 or self.edges>512:self.fail('Document exceeds 256 nodes or 512 edges',path)
        by_id={};ports={};outputs={}
        for node in nodes:
            if not isinstance(node,dict):self.fail('Malformed node',path)
            identifier=_id(node.get('id'));self.location={'scopeId':path,'nodeId':identifier}
            if identifier in by_id:self.fail('Duplicate node ID')
            if node.get('kind') not in _KINDS:self.fail('Unknown node kind')
            for axis in ('x','y'):
                if axis in node and (type(node[axis]) not in (int,float) or not math.isfinite(node[axis]) or abs(node[axis])>1e6):self.fail('Node coordinates must be finite')
            by_id[identifier]=node;ports[identifier]=self.signature(node);outputs[identifier]={p['id'] for p in self.outputs(node)}
        links={identifier:{} for identifier in by_id};degree={identifier:0 for identifier in by_id};followers={identifier:[] for identifier in by_id};edge_ids=set()
        for edge in edges:
            if not isinstance(edge,dict):self.fail('Malformed edge',path)
            identifier=_id(edge.get('id'))
            if identifier in edge_ids:self.fail('Duplicate edge ID',path)
            edge_ids.add(identifier);source=edge.get('source');target=edge.get('target');port=edge.get('input')
            if source not in by_id or target not in by_id:self.fail('Edges cannot leave their scope or refer to missing nodes',path)
            if edge.get('output','out') not in outputs[source] or port not in {p['id'] for p in ports[target]}:self.fail('Unknown input or output port',path,target)
            if port in links[target]:self.fail('Input already connected',path,target)
            links[target][port]=(source,edge.get('output','out'));degree[target]+=1;followers[source].append(target)
        queue=deque(identifier for identifier in by_id if degree[identifier]==0);ordered=[]
        while queue:
            identifier=queue.popleft();ordered.append(identifier)
            for follower in followers[identifier]:
                degree[follower]-=1
                if degree[follower]==0:queue.append(follower)
        if len(ordered)!=len(nodes):self.fail('Typed graph contains a cycle',path)
        endpoint=scope.get('result')
        if not isinstance(endpoint,dict) or endpoint.get('node') not in by_id or endpoint.get('output','out') not in outputs[endpoint['node']]:self.fail('Choose a valid result output',path)
        lines=[];values={}
        binding_owner=binding_owner or ('glean_proof' if path=='root' else self.module_names.get(path.split('/')[1]) if path.startswith('module/') and path.count('/')==1 else None)
        for identifier in ordered:
            node=by_id[identifier];self.location={'scopeId':path,'nodeId':identifier};kind=node['kind']
            if kind=='input':
                if node.get('ref') not in bindings:self.fail('Input refers to an undeclared or out-of-scope binder')
                values[(identifier,'out')]=bindings[node['ref']];
                owner=binding_owner or ('glean_proof' if path=='root' else self.module_names.get(path.split('/')[1]) if path.startswith('module/') and path.count('/')==1 else None)
                if owner:self.input_bindings[path+'/'+identifier+'/out']=owner+'/'+bindings[node['ref']]
                continue
            if kind=='nat':
                value=node.get('value')
                if not isinstance(value,str) or not re.fullmatch(r'0|[1-9][0-9]{0,199}',value):self.fail('Nat values must be exact canonical decimal strings (up to 200 digits)')
                name=self.name();lines.append(f'let {name} : Nat := {value}');values[(identifier,'out')]=name;self.node_bindings[name]=path+'/'+identifier+'/out';self.binding_keys[binding_owner+'/'+name]=path+'/'+identifier+'/out';continue
            missing=[p['id'] for p in ports[identifier] if p['id'] not in links[identifier]]
            if missing:self.fail('Missing inputs: '+', '.join(missing))
            arguments=[values[links[identifier][p['id']]] for p in ports[identifier]]
            functions={'out':self.module(node['ref'])} if kind=='module' else self.component(node,path,depth)
            self.node_functions[path+'/'+identifier]=next(iter(functions.values()))
            for output,function in functions.items():
                self.node_functions[path+'/'+identifier+'/'+output]=function
                self.node_input_ports[path+'/'+identifier+'/'+output]=[p['id'] for p in ports[identifier]]
                name=self.name();lines.append('let '+name+' := '+function+' '+ ' '.join('('+arg+')' for arg in arguments));values[(identifier,output)]=name;self.node_bindings[name]=path+'/'+identifier+'/'+output;self.binding_keys[binding_owner+'/'+name]=path+'/'+identifier+'/'+output
        lines.append(values[(endpoint['node'],endpoint.get('output','out'))]);return lines
    def compile(self):
        graph=self.graph
        if not isinstance(graph,dict) or type(graph.get('version')) is not int or graph['version']!=3:self.fail('Expected a version 3 graph')
        if graph.get('projectId') not in {'glean','mathlib'}:self.fail('Unknown project')
        if graph.get('policy','standard') not in {'standard','strict'}:self.fail('Unknown axiom policy')
        _text(graph.get('name'),'Graph name',128)
        imports=_array(graph.get('imports',[]),'imports',16)
        for name in imports:
            if not isinstance(name,str) or not _QUALIFIED.fullmatch(name) or len(name)>200:self.fail('Invalid import name')
        source_context=None
        if graph.get('sourceContext') is not None:
            from .source_context import validate_source_context
            source_context=validate_source_context(graph['sourceContext'],graph['projectId'])
            self.reference_hashes.add(source_context['environmentHash'])
            imports=[source_context['module'],*imports]
        self.emit(_header(imports))
        for index,definition in enumerate(_array(graph.get('modules',[]),'modules',32)):
            if not isinstance(definition,dict):self.fail('Malformed module')
            identifier=_id(definition.get('id'))
            if identifier in self.modules:self.fail('Duplicate module ID')
            _text(definition.get('name'),'Module name',128);self.modules[identifier]=definition;self.module_names[identifier]='glean_module_'+str(index)
        for identifier in self.modules:self.module(identifier)
        parameters=_parameters(graph.get('inputs'));goal=_text(graph.get('goal'),'Goal type',4096)
        body=self.scope(graph,{p['id']:p['name'] for p in parameters},'root',0)
        self.emit([f'theorem glean_proof {self.binders(parameters)} : {_fragment(goal)} :=',*['  '+line for line in body],''],'root')
        telescope=('∀ '+self.binders(parameters,'gleanExpectedTerm')+', ' if parameters else '')+_fragment(goal,'gleanExpectedTerm')
        expected='\n'.join(_header(imports,'gleanExpectedTerm')+['def glean_expected_type : Prop := '+telescope,''])
        for line,text in enumerate(self.code,1):
            for name,key in self.node_bindings.items():
                if text.lstrip().startswith('let '+name+' '):
                    self.locations.append({'key':key,'startLine':line,'endLine':line})
                    self.maps.setdefault(key.rsplit('/',1)[0],{'startLine':line,'endLine':line})
        code='\n'.join(self.code)
        if len(code.encode())>MAX_SOURCE_BYTES:self.fail('Generated Lean exceeds 8 MiB')
        return {'status':'ready','verified':False,'generatedCode':code,'expectedSource':expected,'sourceMap':self.maps,'fragmentSources':self.fragment_sources,'sourceLocations':self.locations,'nodeBindings':self.node_bindings,'bindingKeys':self.binding_keys,'nodeFunctions':self.node_functions,'nodeInputPorts':self.node_input_ports,'inputBindings':self.input_bindings,'sourceContext':source_context,'referenceEnvironments':sorted(self.reference_hashes),'diagnostics':[],'nodeTypes':{},'projectId':graph['projectId'],'policy':graph.get('policy','standard')}


def compile_typed_graph(graph):
    compiler=_Compiler(graph)
    try:return compiler.compile()
    except (ValueError,TypeError,KeyError,RecursionError) as error:
        return {'status':'invalid','verified':False,'generatedCode':None,'expectedSource':None,'sourceMap':{},'nodeTypes':{},'diagnostics':[{'severity':'error','message':str(error),**compiler.location}]}
