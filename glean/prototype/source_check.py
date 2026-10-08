# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Bounded source jobs: elaborate, replay the kernel, then inspect constant dependencies.

Lean metaprograms execute during elaboration; this is a local developer tool, not
an OS sandbox. Submitted stdout never determines verification. The audit reader
loads serialized constants without extensions or initializers and replays them
using the same kernel API as Lean's official leanchecker.
"""

from copy import deepcopy
from dataclasses import dataclass, field
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import threading
import time
import uuid

from .lean_policy import evaluate_axioms, parse_audit

from .limits import MAX_SOURCE_BYTES
MAX_OUTPUT_BYTES = 256 * 1024
TERMINAL = {'valid', 'invalid', 'incomplete', 'error', 'cancelled', 'analyzed'}

# This program is created only after source elaboration has finished. It does not
# import the user's module through the elaborator and does not execute its hooks.
AUDITOR_LEAN = r'''import Lean
import Lean.Replay
open Lean

private def axiomsOf (env : Kernel.Environment) (target : Name) : IO (Array Name) := do
  let mut pending := [target]
  let mut seen : NameSet := {}
  let mut axioms : NameSet := {}
  while !pending.isEmpty do
    let name := pending.head!
    pending := pending.tail!
    unless seen.contains name do
      seen := seen.insert name
      let some ci := env.find? name
        | throw <| IO.userError s!"Missing constant while auditing: {name}"
      if ci matches .axiomInfo _ then
        axioms := axioms.insert name
      for dependency in ci.getUsedConstantsAsSet do
        pending := dependency :: pending
  return axioms.toArray.qsort Name.lt

private def normalizeGraphExpr (declarations : Std.HashMap Name ConstantInfo) (input : Expr) : MetaM Expr :=
  Meta.transform input (pre := fun expr => do
    let mut reduced := expr
    let mut fuel := 32768
    while fuel > 0 do
      fuel := fuel - 1
      Core.checkSystem "graph metadata normalization"
      match reduced with
      | .mdata _ body => reduced := body; continue
      | .letE _ _ value body _ => reduced := body.instantiate1 value; continue
      | .fvar id =>
        if let some value := (← id.getDecl).value? then reduced := value; continue
      | _ => pure ()
      let fn := reduced.getAppFn
      if let .const name levels := fn then
        if name.toString.startsWith "glean_component_" || name.toString.startsWith "glean_module_" then
          let some info := declarations[name]? | throwError "Missing audited graph helper {name}"
          reduced := (info.instantiateValueLevelParams! levels).beta reduced.getAppArgs
          continue
      if fn.isLambda && reduced.isApp then reduced := fn.beta reduced.getAppArgs; continue
      return .continue (some reduced)
    throwError "Graph metadata normalization exceeded its 32768 head reduction budget") (post := fun expr => do
      if let some reduced ← Meta.reduceProj? expr then return .visit reduced
      return .done expr)

private def dependenciesOf (declarations : Std.HashMap Name ConstantInfo) (input : Expr) : MetaM (Array String) := do
  let mut pending := (collectFVars {} (← normalizeGraphExpr declarations input)).fvarIds.toList
  let mut seen : FVarIdSet := {}
  let mut names := #[]
  while !pending.isEmpty do
    let id := pending.head!
    pending := pending.tail!
    unless seen.contains id do
      seen := seen.insert id
      let decl ← id.getDecl
      pending := (collectFVars {} (← normalizeGraphExpr declarations decl.type)).fvarIds.toList ++ pending
      if let some value := decl.value? then
        pending := (collectFVars {} (← normalizeGraphExpr declarations value)).fvarIds.toList ++ pending
      else
        names := names.push decl.userName.toString
  return names.qsort (· < ·)

private partial def graphLets {α : Type} (known : NameSet) (owner : Name) (variables : Array Expr) (body : Expr) (k : Array Expr → Expr → MetaM α) (fuel : Nat := 512) : MetaM α := do
  match body with
  | .mdata _ value => graphLets known owner variables value k fuel
  | .letE name type value next nondep =>
    if fuel > 0 && known.contains (Name.mkSimple (owner.toString ++ "/" ++ name.toString)) then
      Meta.withLetDecl name type value (nondep := nondep) fun x =>
        graphLets known owner (variables.push x) (next.instantiate1 x) k (fuel - 1)
    else k variables body
  | _ => k variables body

private def graphTelescope {α : Type} (known : NameSet) (owner : Name) (value : Expr) (k : Array Expr → Expr → MetaM α) : MetaM α :=
  Meta.lambdaTelescope value fun variables body => graphLets known owner variables body k

unsafe def main (args : List String) : IO UInt32 := do
  let [directory, moduleString, targetString, nonce, destination, expectedModule, bindingsFile, contextModule] := args
    | throw <| IO.userError "Expected audit directory, module, target, nonce, destination"
  initSearchPath (← findSysroot)
  searchPathRef.modify fun paths => System.FilePath.mk directory :: paths
  let moduleName := moduleString.toName
  let target := targetString.toName
  let knownBindings := ((← IO.FS.readFile bindingsFile).splitOn "\n").foldl (fun (set : NameSet) value => if value.isEmpty then set else set.insert (Name.mkSimple value)) {}
  let mFile ← findOLean moduleName
  let mut filenames := #[mFile]
  for level in [OLeanLevel.server, OLeanLevel.private] do
    let path := level.adjustFileName mFile
    if ← path.pathExists then filenames := filenames.push path
  let parts ← readModuleDataParts filenames
  if h : parts.size = 0 then throw <| IO.userError "No serialized module data" else
  let (mod, _) := parts[0]
  let mut baseImports := mod.imports
  let mut sourceDeclarations : Std.HashMap Name ConstantInfo := {}
  if contextModule != "-" then
    let sourceFile ← findOLean contextModule.toName
    let mut sourceFiles := #[sourceFile]
    for level in [OLeanLevel.server, OLeanLevel.private] do
      let path := level.adjustFileName sourceFile
      if ← path.pathExists then sourceFiles := sourceFiles.push path
    let sourceParts ← readModuleDataParts sourceFiles
    if h : sourceParts.size = 0 then throw <| IO.userError "Preserved source module missing" else
    let (sourceMod, _) := sourceParts[0]
    baseImports := (baseImports.filter (fun item => item.module != contextModule.toName)) ++ sourceMod.imports
    for name in sourceParts[sourceParts.size - 1].1.constNames, ci in sourceParts[sourceParts.size - 1].1.constants do
      sourceDeclarations := sourceDeclarations.insert name ci
  let (_, imports) ← importModulesCore baseImports |>.run
  let env ← finalizeImport imports baseImports {} 0 false false (isModule := true)
  let mut declarations : Std.HashMap Name ConstantInfo := {}
  for name in parts[parts.size - 1].1.constNames, ci in parts[parts.size - 1].1.constants do
    declarations := declarations.insert name ci
  let some (.thmInfo _) := declarations[target]?
    | throw <| IO.userError s!"Target is not a theorem declared in this source: {target}"
  let sourceChecked ← try env.toKernelEnv.replay sourceDeclarations catch e => throw <| IO.userError s!"Preserved source replay: {e}"
  let checked ← try sourceChecked.replay declarations catch e => throw <| IO.userError s!"Graph replay: {e}"
  if expectedModule != "-" then
    let expectedFile ← findOLean expectedModule.toName
    let expectedParts ← readModuleDataParts #[expectedFile]
    if h : expectedParts.size = 0 then throw <| IO.userError "Expected signature module missing" else
    let mut expectedDecls : Std.HashMap Name ConstantInfo := {}
    for ci in expectedParts[expectedParts.size - 1].1.constants do
      expectedDecls := expectedDecls.insert ci.name ci
    let some (.defnInfo expected) := expectedDecls[`glean_expected_type]?
      | throw <| IO.userError "Expected signature declaration missing"
    let combined ← try checked.replay expectedDecls catch e => throw <| IO.userError s!"Expected signature replay: {e}"
    let some actual := combined.find? target
      | throw <| IO.userError "Target declaration missing"
    let equalTypes ← try pure <| Kernel.isDefEqGuarded (Environment.ofKernelEnv combined) {} actual.type expected.value catch e => throw <| IO.userError s!"Expected signature equality: {e}"
    unless equalTypes do
      throw <| IO.userError "Target type does not match the graph's independently compiled expected signature"
  let axioms ← try axiomsOf checked target catch e => throw <| IO.userError s!"Axiom closure: {e}"
  let mut bindingTypes : List (String × Json) := []
  let mut bindingUsage : List (String × Json) := []
  let mut bindingDependencies : List (String × Json) := []
  let mut bindingInputTypes : List (String × Json) := []
  let mut constantAxioms : List (String × Json) := []
  -- Meta lookup needs async entries for kernel-local constants. Register only
  -- declarations already accepted by replay; acceptance still uses `checked`.
  let mut inspectedEnv := Environment.ofKernelEnv checked
  for (name, ci) in checked.constants.map₂.toList do
    let registration ← inspectedEnv.addConstAsync name (.ofConstantInfo ci) (reportExts := false)
    registration.commitConst inspectedEnv (info? := some ci)
    registration.commitCheckEnv inspectedEnv
    inspectedEnv := registration.mainEnv
  for (name, ci) in declarations.toList do
    if (name == target || name.toString.startsWith "glean_component_" || name.toString.startsWith "glean_module_") &&
        !ci.isUnsafe && !ci.isPartial && (checked.find? name).isSome then
      constantAxioms := (name.toString, toJson ((← axiomsOf checked name).map Name.toString)) :: constantAxioms
      if let some value := ci.value? (allowOpaque := true) then
        let task : MetaM (Array (String × Json)) := graphTelescope knownBindings name value fun variables _ => do
          variables.mapM fun localValue => do
            let localDecl ← localValue.fvarId!.getDecl
            let rendered ← Meta.ppExpr (← Meta.inferType localValue)
            return (name.toString ++ "/" ++ localDecl.userName.toString, toJson rendered.pretty)
        let entries ← try task.run'.toIO' {fileName := "graph-audit", fileMap := default} {env := inspectedEnv} catch e => throw <| IO.userError s!"Binding type inspection: {e}"
        bindingTypes := entries.toList ++ bindingTypes
        let usageTask : MetaM (Json × Array (String × Json) × Array (String × Json)) := graphTelescope knownBindings name value fun variables body => do
          let used ← dependenciesOf declarations body
          let mut dependencies := #[]
          let mut inputTypes := #[]
          for localValue in variables do
            let decl ← localValue.fvarId!.getDecl
            let key := name.toString ++ "/" ++ decl.userName.toString
            let inspected := decl.value?.getD localValue
            dependencies := dependencies.push (key, toJson (← dependenciesOf declarations inspected))
            if let some application := decl.value? then
              let fn := application.getAppFn
              if let .const fnName levels := fn then
                if fnName.toString.startsWith "glean_component_" || fnName.toString.startsWith "glean_module_" then
                  let some info := declarations[fnName]? | throwError "Missing audited graph function {fnName}"
                  let mut functionType := info.instantiateTypeLevelParams levels
                  let mut arguments := #[]
                  for arg in application.getAppArgs do
                    let .forallE _ domain body _ ← Meta.whnf functionType | break
                    arguments := arguments.push (← Meta.ppExpr domain).pretty
                    functionType := body.instantiate1 arg
                  inputTypes := inputTypes.push (key, toJson arguments)
          return (toJson used, dependencies, inputTypes)
        let (used, dependencies, inputTypes) ← try usageTask.run'.toIO' {fileName := "graph-audit", fileMap := default} {env := inspectedEnv} catch e => throw <| IO.userError s!"Binding dependency inspection: {e}"
        bindingUsage := (name.toString, used) :: bindingUsage
        bindingDependencies := dependencies.toList ++ bindingDependencies
        bindingInputTypes := inputTypes.toList ++ bindingInputTypes
  let result := Json.mkObj [
    ("schema", toJson (1 : Nat)), ("target", toJson targetString),
    ("nonce", toJson nonce), ("kernelAccepted", toJson true),
    ("isTheorem", toJson true), ("sourceContextKernelAccepted",toJson (contextModule != "-")), ("bindingTypes", Json.mkObj bindingTypes), ("bindingUsage", Json.mkObj bindingUsage), ("bindingDependencies", Json.mkObj bindingDependencies), ("bindingInputTypes", Json.mkObj bindingInputTypes), ("constantAxioms", Json.mkObj constantAxioms), ("axioms", toJson (axioms.map Name.toString))]
  IO.FS.writeFile destination result.compress
  env.freeRegions
  return 0
'''


def validate_request(request):
    if not isinstance(request, dict):
        raise ValueError('Lean source request must be an object')
    source = request.get('source')
    if not isinstance(source, str) or not source.strip() or len(source.encode('utf-8')) > MAX_SOURCE_BYTES:
        raise ValueError('Lean source must be nonempty and at most 8 MiB')
    filename = request.get('filename', 'Source.lean')
    if (not isinstance(filename, str) or Path(filename).name != filename or '\\' in filename
            or not filename.endswith('.lean') or len(filename) > 120
            or any(ord(char) < 32 for char in filename)):
        raise ValueError('filename must be a Lean basename')
    target = request.get('target')
    if (not isinstance(target, str) or not target or len(target) > 200
            or any(not part.replace("'", '_').isidentifier() for part in target.split('.'))):
        raise ValueError('target must be an explicit Lean theorem name')
    project = request.get('projectId', 'glean')
    if not isinstance(project, str) or project not in {'glean', 'mathlib'}:
        raise ValueError('Unknown Lean project')
    policy = request.get('policy', 'standard')
    evaluate_axioms([], policy)
    return {'source':source, 'filename':filename, 'target':target, 'projectId':project, 'policy':policy}


def parse_source_diagnostics(output, filename, *, line_count=None):
    """Read navigable display messages; these never affect kernel/axiom acceptance."""
    header = re.compile(r'^' + re.escape(filename) + r':(\d+):(\d+): (error|warning|information|info)(?:\([^)]*\))?: ?(.*)$')
    boundary = re.compile(r'^.+:\d+:\d+: (?:error|warning|information|info)(?:\([^)]*\))?:')
    diagnostics = []
    current = None

    def finish():
        if current is not None and len(diagnostics) < 40:
            current['message'] = current['message'].rstrip()[:8192]
            diagnostics.append(current)

    for text in output.splitlines():
        if boundary.match(text):
            finish()
            current = None
        match = header.match(text)
        if match:
            line, column = int(match[1]), int(match[2])
            if line < 1 or column > 1_000_000 or (line_count is not None and line > line_count):
                continue
            current = {'filename':filename, 'line':line, 'column':column + 1,
                       'severity':'info' if match[3] == 'information' else match[3],
                       'message':match[4]}
        elif current is not None and len(current['message']) < 8192:
            current['message'] += '\n' + text
    finish()
    return diagnostics


@dataclass
class _Job:
    request: dict
    snapshot: dict
    started: float = field(default_factory=time.monotonic)
    cancel_event: threading.Event = field(default_factory=threading.Event)
    process: object = None
    process_stop_lock: threading.Lock = field(default_factory=threading.Lock)
    stopped_process: object = None
    thread: object = None
    source_path: object = None
    module_directory: object = None
    timeout_seconds: float = 120


class SourceCheckService:
    def __init__(self, timeout_seconds=120, max_jobs=2, source_context_timeout_seconds=360):
        self.timeout_seconds = timeout_seconds
        if not isinstance(source_context_timeout_seconds,(int,float)) or not 0 < source_context_timeout_seconds <= 360:
            raise ValueError("Source-backed graph time budget must be positive and at most 360 seconds")
        self.source_context_timeout_seconds = source_context_timeout_seconds
        self.max_jobs = min(2, max_jobs)
        self._jobs = {}
        self._lock = threading.RLock()

    def profiles(self):
        from .lean_project import list_projects
        return list_projects()

    def start(self, request, *, expected_source=None, required_environment=None, metadata_bindings=None, source_context=None):
        request = validate_request(request)
        if expected_source is not None:
            if not isinstance(expected_source,str) or len(expected_source.encode())>MAX_SOURCE_BYTES:
                raise ValueError("Expected signature source exceeds limits")
            request["expectedSource"]=expected_source
        if required_environment is not None:
            request['requiredEnvironment']=required_environment
        if metadata_bindings is not None:
            if not isinstance(metadata_bindings,list) or len(metadata_bindings)>512 or any(not isinstance(name,str) or not re.fullmatch(r'(?:glean_proof|glean_module_[0-9]+|glean_component_[0-9]+)/glean_component_[0-9]+',name) for name in metadata_bindings):
                raise ValueError('Invalid graph metadata binding manifest')
            request['metadataBindings']=metadata_bindings
        if source_context is not None:
            from .source_context import validate_source_context
            request['sourceContext']=validate_source_context(source_context,request['projectId'])
        timeout_seconds=self.source_context_timeout_seconds if source_context is not None else self.timeout_seconds
        job_id = uuid.uuid4().hex
        snapshot = {'jobId':job_id, 'status':'queued', 'phase':'preparing', 'verified':False,
                    'kernelAccepted':False, 'audit':None, 'diagnostics':[],
                    'filename':request['filename'], 'projectId':request['projectId'],
                    'target':request['target'], 'policy':request['policy'], 'timeoutSeconds':timeout_seconds,
                    'sourceHash':hashlib.sha256(request['source'].encode()).hexdigest(),
                    'lean':{'output':'', 'durationMs':0}}
        with self._lock:
            if sum(job.snapshot['status'] not in TERMINAL for job in self._jobs.values()) >= self.max_jobs:
                raise RuntimeError('Lean 검사 2개가 실행 중입니다. 완료하거나 취소한 뒤 다시 시도해 주세요.')
            while len(self._jobs) >= 50:
                old = next((key for key, job in self._jobs.items() if job.snapshot['status'] in TERMINAL), None)
                if old is None:
                    break
                del self._jobs[old]
            job = _Job(request, snapshot, timeout_seconds=timeout_seconds)
            self._jobs[job_id] = job
            job.thread = threading.Thread(target=self._worker, args=(job,), daemon=True)
            job.thread.start()
            return deepcopy(snapshot)

    def get(self, job_id):
        if not isinstance(job_id, str):
            return None
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            result = deepcopy(job.snapshot)
            if result['status'] not in TERMINAL:
                result['lean']['durationMs'] = round((time.monotonic() - job.started) * 1000)
            return result

    def cancel(self, job_id):
        if not isinstance(job_id, str):
            return None
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            if job.snapshot['status'] not in TERMINAL:
                job.cancel_event.set()
                job.snapshot.update(status='cancelled', phase='cancelled', verified=False)
                job.snapshot['lean']['durationMs'] = round((time.monotonic() - job.started) * 1000)
                process = job.process
            else:
                process = None
        if process:
            self._stop_job_process(job, process)
        return self.get(job_id)

    def shutdown(self):
        for job_id in list(self._jobs):
            self.cancel(job_id)
        for job in list(self._jobs.values()):
            if job.thread and job.thread.is_alive():
                job.thread.join(timeout=2)

    def _update(self, job, **fields):
        with self._lock:
            if not job.cancel_event.is_set():
                job.snapshot.update(fields)

    def _finish(self, job, **fields):
        with self._lock:
            job.snapshot['lean']['durationMs'] = round((time.monotonic() - job.started) * 1000)
            if job.cancel_event.is_set():
                job.snapshot.update(status='cancelled', phase='cancelled', verified=False)
            else:
                if time.monotonic()-job.started >= job.timeout_seconds:
                    fields.update(status='error',verified=False,diagnostics=[*fields.get('diagnostics',[]),{'severity':'error','message':f'Lean 검사가 전체 {job.timeout_seconds:g}초 제한을 초과했습니다.'}])
                job.snapshot.update(phase='complete', **fields)

    @staticmethod
    def _stop_process(process):
        try:
            # The leader may have exited while its children still hold the group.
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=.3)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=2)
        except (ProcessLookupError, ChildProcessError):
            pass
        except PermissionError:
            if process.poll() is None:
                raise

    def _stop_job_process(self, job, process):
        # Cancellation and worker finalization can arrive for the same child.
        with job.process_stop_lock:
            if job.stopped_process is process:
                return
            self._stop_process(process)
            job.stopped_process = process

    def _run_process(self, job, command, cwd, output_path):
        if job.cancel_event.is_set():
            raise InterruptedError('Lean check cancelled')
        environment = os.environ.copy()
        environment['PATH'] = str(Path(command[0]).parent) + os.pathsep + environment.get('PATH', '')
        if job.module_directory:environment['LEAN_PATH']=str(job.module_directory)+os.pathsep+environment.get('LEAN_PATH','')
        with output_path.open('wb') as output:
            process = subprocess.Popen(command, cwd=cwd, env=environment, stdout=output,
                                       stderr=subprocess.STDOUT, start_new_session=True)
            with self._lock:
                job.process = process
            try:
                while process.poll() is None:
                    if job.cancel_event.is_set():
                        raise InterruptedError('Lean check cancelled')
                    if time.monotonic() - job.started >= job.timeout_seconds:
                        raise TimeoutError(f'Lean 검사가 {job.timeout_seconds:g}초를 초과했습니다.')
                    if output_path.stat().st_size > MAX_OUTPUT_BYTES:
                        raise RuntimeError('Lean 출력이 256 KiB 제한을 초과했습니다.')
                    job.cancel_event.wait(.1)
                return process.returncode
            finally:
                try:
                    self._stop_job_process(job, process)
                finally:
                    with self._lock:
                        job.process = None
                        text = output_path.read_bytes()[:MAX_OUTPUT_BYTES].decode('utf-8', errors='replace')
                        if job.source_path:
                            text = text.replace(str(job.source_path), job.request['filename'])
                        job.snapshot['lean']['output'] += text

    def _worker(self, job):
        try:
            from .lean_project import toolchain
            command, cwd = toolchain(job.request['projectId'])
            from .project_provenance import environment_provenance
            environment = environment_provenance(job.request['projectId'])
            required=job.request.get('requiredEnvironment') or job.request.get('sourceContext',{}).get('environmentHash')
            if required and required!=environment['environmentHash']:
                self._finish(job,status='invalid',verified=False,diagnostics=[{'severity':'error','message':'선언 참조의 Lean 환경이 변경되었습니다. 시그니처를 다시 조회하세요.'}])
                return
            self._update(job, environment=environment)
            self._update(job, status='running', phase='elaborating')
            with tempfile.TemporaryDirectory(prefix='glean-source-') as temporary:
                directory = Path(temporary)
                job.module_directory=directory
                context_module='-'
                if job.request.get('sourceContext'):
                    context=job.request['sourceContext'];context_module=context['module']
                    context_file=directory/(context_module+'.lean')
                    context_file.write_text(context['source'],encoding='utf-8')
                    self._update(job,phase='source-context-elaboration')
                    context_code=self._run_process(job,command+['-R',str(directory),'-o',str(directory/(context_module+'.olean')),str(context_file)],cwd,directory/'source-context.log')
                    if context_code:
                        self._finish(job,status='invalid',verified=False,diagnostics=[{'severity':'error','message':'The preserved Lean source module did not elaborate; return to the original source and reanalyze.'}])
                        return
                    self._update(job,phase='elaborating')
                module = 'GleanSource' + uuid.uuid4().hex
                source = directory / (module + '.lean')
                job.source_path = source
                source.write_text(job.request['source'], encoding='utf-8')
                result = self._run_process(job, command + ['-R', str(directory), '-o',
                    str(directory / (module + '.olean')), str(source)], cwd, directory / 'compile.log')
                source_diagnostics = parse_source_diagnostics(
                    job.snapshot['lean']['output'], job.request['filename'],
                    line_count=len(job.request['source'].splitlines()))
                self._update(job, diagnostics=source_diagnostics)
                if result:
                    self._finish(job, status='invalid', verified=False, diagnostics=source_diagnostics or [{
                        'severity':'error', 'message':'Lean이 소스를 거부했습니다. Lean 출력에서 원인을 확인해 주세요.'}])
                    return
                expected_module = '-'
                if 'expectedSource' in job.request:
                    self._update(job,phase='expected-signature-elaboration')
                    expected_module = 'GleanExpected' + uuid.uuid4().hex
                    expected_file = directory / (expected_module + '.lean')
                    expected_file.write_text(job.request['expectedSource'], encoding='utf-8')
                    expected_result = self._run_process(job, command + ['-R', str(directory), '-o',
                        str(directory / (expected_module + '.olean')), str(expected_file)], cwd, directory / 'expected.log')
                    if expected_result:
                        self._finish(job,status='invalid',verified=False,diagnostics=[{'severity':'error','message':'The expected graph signature did not elaborate.'}])
                        return
                self._update(job, phase='kernel-audit')
                # Generate both the trusted program and result destination after submitted
                # code has exited; source stdout cannot supply this result.
                nonce = uuid.uuid4().hex
                audit_program = directory / ('Audit' + nonce + '.lean')
                audit_program.write_text(AUDITOR_LEAN, encoding='utf-8')
                audit_result = directory / ('result-' + nonce + '.json')
                binding_file=directory / 'graph-bindings.txt'
                binding_file.write_text('\n'.join(job.request.get('metadataBindings',[])),encoding='utf-8')
                result = self._run_process(job, command + ['--run', str(audit_program), str(directory),
                    module, job.request['target'], nonce, str(audit_result), expected_module, str(binding_file), context_module], cwd, directory / 'audit.log')
                if result or not audit_result.is_file():
                    self._finish(job, status='invalid', verified=False, diagnostics=[{
                        'severity':'error', 'message':'독립 커널 재검사 또는 대상 정리의 공리 검사에 실패했습니다.'}])
                    return
                axioms = parse_audit(audit_result.read_text(), target=job.request['target'], nonce=nonce)
                audit = evaluate_axioms(axioms, job.request['policy'])
                accepted = audit['policyAccepted']
                status = 'valid' if accepted else ('incomplete' if audit['hasSorry'] else 'invalid')
                diagnostics = [] if accepted else [{'severity':'warning' if audit['hasSorry'] else 'error',
                    'message':'대상 정리에 sorry로 남겨 둔 증명이 있습니다.' if audit['hasSorry'] else '대상 정리가 선택한 정책에서 허용하지 않는 공리를 사용합니다.'}]
                current_environment = environment_provenance(job.request['projectId'])
                if current_environment['environmentHash'] != environment['environmentHash']:
                    self._finish(job,status='error',verified=False,kernelAccepted=True,audit=audit,
                        diagnostics=[{'severity':'error','message':'Lean 환경이 검사 도중 변경되었습니다. 현재 환경에서 다시 검사하세요.'}])
                    return
                metadata=json.loads(audit_result.read_text()).get('bindingTypes',{})
                self._finish(job, status=status, verified=accepted, kernelAccepted=True,
                             audit=audit, sourceContextKernelAccepted=json.loads(audit_result.read_text()).get('sourceContextKernelAccepted',False), bindingTypes=metadata,bindingUsage=json.loads(audit_result.read_text()).get('bindingUsage',{}), bindingDependencies=json.loads(audit_result.read_text()).get('bindingDependencies',{}), bindingInputTypes=json.loads(audit_result.read_text()).get('bindingInputTypes',{}), constantAxioms=json.loads(audit_result.read_text()).get('constantAxioms',{}), diagnostics=source_diagnostics + diagnostics)
        except InterruptedError:
            self._finish(job, status='cancelled', verified=False)
        except Exception as exc:
            # Keep asynchronous failures visible and release the job slot.
            self._finish(job, status='error', verified=False,
                         diagnostics=[{'severity':'error', 'message':str(exc)}])
