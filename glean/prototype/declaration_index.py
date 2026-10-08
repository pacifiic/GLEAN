# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Cancellable current-file command-state analysis; never independent verification."""
import json
from copy import deepcopy
from pathlib import Path
import tempfile
from .source_check import SourceCheckService
from .typed_graph import _KEYWORDS

INDEX_LEAN = r'''import Lean
open Lean Elab Frontend
unsafe def main (args : List String) : IO UInt32 := do
  initSearchPath (← findSysroot)
  enableInitializersExecution
  let input ← IO.FS.readFile args[0]!
  let inputCtx := Parser.mkInputContext input args[0]!
  let (header, parserState, messages) ← Parser.parseHeader inputCtx
  let opts := ({} : Options).setBool `Elab.async false
  let (env, messages) ← Elab.processHeader header opts messages inputCtx (mainModule := `GleanUploadedSource)
  let state ← Elab.IO.processCommands inputCtx parserState (Command.mkState env messages opts)
  let action : FrontendM Json := runCommandElabM do
    let env ← getEnv
    let mut items := #[]
    for pending in ← env.getLocalConstantInfos do
      if items.size >= 4096 then throwError "Current-file analysis supports at most 4096 declarations"
      let ci := pending.toConstantInfo
      let ranges ← findDeclarationRanges? ci.name
      let (type, inputs, outputType, isProp, displayOutputType) ← Command.liftTermElabM do
        withOptions (fun _ =>
          let opts : Options := {}
          let opts := opts.setBool `pp.fullNames true
          let opts := opts.setBool `pp.notation false
          let opts := opts.setBool `pp.privateNames true
          let opts := opts.setBool `pp.explicit true
          let opts := opts.setBool `pp.universes true
          let opts := opts.setBool `pp.proofs true
          let opts := opts.setBool `pp.funBinderTypes true
          let opts := opts.setBool `pp.deepTerms true
          opts.set `pp.maxSteps (100000 : Nat)) do
        Meta.forallTelescope ci.type fun args result => do
          let mut lctx ← getLCtx
          let mut names : NameSet := {}
          let mut originals := #[]
          for index in [:args.size] do
            let d ← args[index]!.fvarId!.getDecl
            let original := d.userName.toString
            originals := originals.push original
            let safe := !original.isEmpty && original.toList.all (fun c => c.toNat < 128 && (c.isAlphanum || c == '_' || c == '\'')) && original.toList.head!.isAlpha && original.length <= 64 && !original.startsWith "glean_" && !(KEYWORDS : List String).contains original
            let mut alias := if safe && !names.contains d.userName then original else "arg" ++ toString index
            while names.contains alias.toName do alias := alias ++ "_"
            names := names.insert alias.toName
            lctx := lctx.setUserName args[index]!.fvarId! alias.toName
          Meta.withLCtx lctx (← Meta.getLocalInstances) do
            let mut inputs := #[]
            for index in [:args.size] do
              let d ← args[index]!.fvarId!.getDecl
              inputs := inputs.push <| Json.mkObj [("id",toJson ("arg" ++ toString index)),("name",toJson d.userName.toString),("originalName",toJson originals[index]!), ("type",toJson (← Meta.ppExpr d.type).pretty),("displayType",toJson (← withOptions (fun _ => {}) (Meta.ppExpr d.type)).pretty),("implicit",toJson (!d.binderInfo.isExplicit)),("instance",toJson d.binderInfo.isInstImplicit)]
            return ((← Meta.ppExpr ci.type).pretty, inputs, (← Meta.ppExpr result).pretty, ← Meta.isProp result, (← withOptions (fun _ => {}) (Meta.ppExpr result)).pretty)
      let range := ranges.map fun r => Json.mkObj [("startLine", toJson r.range.pos.line),("startCharacter", toJson r.range.charUtf16),("endLine", toJson r.range.endPos.line),("endCharacter", toJson r.range.endCharUtf16)]
      let mut dependencyModules : List (String × Json) := []
      for dependency in ci.getUsedConstantsAsSet do
        if let some index := env.getModuleIdxFor? dependency then
          dependencyModules := (dependency.toString,toJson env.header.moduleNames[index]!.toString) :: dependencyModules
      items := items.push <| Json.mkObj [("name", toJson ci.name.toString),("kind", toJson (toString (repr pending.kind))),("type", toJson type),("inputs",toJson inputs),("outputType",toJson outputType),("displayOutputType",toJson displayOutputType),("universes",toJson (ci.levelParams.map Name.toString)),("range", range.getD Json.null),("dependencyModules",Json.mkObj dependencyModules),("directDependencies", toJson (ci.getUsedConstantsAsSet.toArray.map Name.toString)),("private", toJson (isPrivateName ci.name)),("isProp",toJson isProp),("unsafe",toJson ci.isUnsafe),("partial",toJson ci.isPartial),("privateSignatureDependencies",toJson (ci.type.getUsedConstants.filter isPrivateName |>.map Name.toString))]
    return Json.mkObj [("adapter", toJson "lean-4.34.1-command-state"),("verified", toJson false),("declarations", toJson items),("imports",toJson (env.header.imports.map (fun item => item.module.toString)))]
  let (metadata, _) ← StateRefT'.run (action.run {inputCtx}) state
  let mut diagnostics := #[]
  for msg in state.commandState.messages.toList do
    diagnostics := diagnostics.push <| Json.mkObj [("line", toJson msg.pos.line),("column", toJson (msg.pos.column+1)),("columnEncoding",toJson "unicode"),("severity", toJson (match msg.severity with | .error => "error" | .warning => "warning" | .information => "information")),("message", toJson (← msg.data.toString))]
  IO.FS.writeFile args[1]! <| (Json.mkObj [("metadata", metadata),("diagnostics", toJson diagnostics),("hasErrors", toJson state.commandState.messages.hasErrors)]).compress
  return 0
'''

class DeclarationIndexService(SourceCheckService):
    def __init__(self, timeout_seconds=120):
        super().__init__(timeout_seconds=timeout_seconds,max_jobs=1)

    def start(self, request):
        if not isinstance(request,dict):raise ValueError('Current-file analysis requires a JSON object')
        return super().start({**request,'target':'glean_analysis_only','policy':'standard'})

    def convert(self, request):
        from .project_provenance import environment_provenance
        from .source_context import make_source_context
        from .typed_graph import _QUALIFIED, compile_typed_graph
        if not isinstance(request,dict):raise ValueError('Conversion requires an analyzed source job')
        with self._lock:
            job=self._jobs.get(request.get('jobId'))
            if job is None:raise ValueError('The analysis expired. Analyze the current Lean file again.')
            analysis=deepcopy(job.snapshot);source=deepcopy(job.request)
        if analysis.get('status')!='analyzed' or analysis.get('hasErrors'):
            raise ValueError('Convert only a completed, error-free current-file analysis. The original file is preserved.')
        if request.get('sourceHash')!=analysis['sourceHash'] or request.get('environmentHash')!=analysis['environment']['environmentHash']:
            raise ValueError('The source or environment identity changed. Analyze the current file again.')
        if environment_provenance(source['projectId'])['environmentHash']!=analysis['environment']['environmentHash']:
            raise ValueError('The Lean environment changed. Analyze the current file again.')
        item=next((item for item in analysis['declarations'] if item['name']==request.get('declaration')),None)
        if item is None:raise ValueError('The declaration does not belong to this uploaded source')
        reason=conversion_unsupported(item)
        if reason:raise ValueError(reason)
        from .lean_policy import evaluate_axioms
        policy=request.get('policy','standard');evaluate_axioms([],policy)
        inputs=deepcopy(item['inputs']);nodes=[{'id':'input'+str(i),'kind':'input','ref':p['id'],'x':50,'y':60+i*140} for i,p in enumerate(inputs)]
        nodes.append({'id':'source_call','kind':'script','name':item['name'].split('.')[-1],
                      'inputs':deepcopy(inputs),'outputType':item['outputType'],
                      'body':'@'+item['name']+(' '+' '.join('('+p['name']+')' for p in inputs) if inputs else ''),'x':370,'y':80})
        context=make_source_context(source,analysis,request.get('sourceOrigin'));context['declaration']=item['name'];context['policy']=policy
        graph={'version':3,'name':item['name'][:90]+' · 원문 호출','projectId':source['projectId'],
               'imports':[],'policy':policy,'inputs':inputs,'goal':item['outputType'],'modules':[],
               'nodes':nodes,'edges':[{'id':'wire'+str(i),'source':'input'+str(i),'output':'out','target':'source_call','input':p['id']} for i,p in enumerate(inputs)],
               'result':{'node':'source_call','output':'out'},'sourceContext':context}
        compiled=compile_typed_graph(graph)
        if compiled['status']!='ready':raise ValueError(compiled['diagnostics'][0]['message'])
        return {'kind':'graph','graph':graph}

    def _worker(self,job):
        try:
            from .lean_project import toolchain
            from .project_provenance import environment_provenance
            command,cwd=toolchain(job.request['projectId']);environment=environment_provenance(job.request['projectId'])
            self._update(job,status='running',phase='command-analysis',environment=environment)
            with tempfile.TemporaryDirectory(prefix='glean-index-') as temporary:
                directory=Path(temporary);source=directory/job.request['filename'];source.write_bytes(job.request['source'].encode('utf-8'));job.source_path=source
                query=directory/'ReadCommandState.lean';query.write_text(INDEX_LEAN.replace('KEYWORDS',json.dumps(sorted(_KEYWORDS))),encoding='utf-8');destination=directory/'analysis.json'
                code=self._run_process(job,command+['--run',str(query),str(source),str(destination)],cwd,directory/'analysis.log')
                if code or not destination.is_file():raise ValueError(job.snapshot['lean']['output'][-8192:] or 'Lean command analysis did not return metadata')
                if destination.stat().st_size>16*1024*1024:raise ValueError('Current-file metadata exceeds 16 MiB')
                result=json.loads(destination.read_text());metadata=result['metadata']
                if environment_provenance(job.request['projectId'])['environmentHash']!=environment['environmentHash']:raise ValueError('Lean environment changed during current-file analysis')
                self._finish(job,status='analyzed',verified=False,kernelAccepted=False,adapter=metadata['adapter'],declarations=metadata['declarations'],imports=metadata['imports'],hasErrors=result['hasErrors'],diagnostics=result['diagnostics'],sourceUnit='GleanUploadedSource',sourceAttribution='current-file')
        except InterruptedError:self._finish(job,status='cancelled',verified=False)
        except Exception as error:self._finish(job,status='error',verified=False,diagnostics=[{'severity':'error','message':str(error)}])


def conversion_unsupported(item):
    from .typed_graph import _QUALIFIED
    if item.get('private'):return 'Private declarations cannot be converted; the original source is preserved.'
    if str(item.get('kind','')).split('.')[-1]!='thm' or item.get('isProp') is not True or item.get('unsafe') or item.get('partial'):
        return 'This conversion supports public, safe theorems with a proposition result.'
    if item.get('privateSignatureDependencies'):return 'The public signature mentions a private type or definition; use the preserved Lean source instead.'
    if item.get('universes'):return 'Universe-polymorphic declarations need an explicit LeanScript instantiation.'
    if len(item.get('inputs',[]))>16:return 'The declaration exceeds the 16-input graph limit.'
    name=item.get('name','')
    if not _QUALIFIED.fullmatch(name) or name.startswith(('glean_component_','glean_module_')) or name=='glean_proof':
        return 'This declaration name is unsupported or reserved by the graph compiler.'
    return None
