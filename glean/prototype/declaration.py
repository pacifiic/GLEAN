# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Read real declaration telescopes from a fixed Lean project using the Meta API."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from .lean_project import toolchain
from .typed_graph import _QUALIFIED, _KEYWORDS

_QUERY=r'''open Lean Elab Meta in
run_elab do
  let name := DECLARATION.toName
  let ci ← getConstInfo name
  let env ← getEnv
  let moduleName := match env.getModuleIdxFor? name with
    | some index => (env.header.moduleNames[index]!).toString
    | none => "current"
  let ranges ← findDeclarationRanges? name
  let location := match ranges with
    | some ranges => Json.mkObj [("startLine",toJson ranges.range.pos.line),("endLine",toJson ranges.range.endPos.line),("character",toJson ranges.range.charUtf16)]
    | none => Json.null
  let result ← forallTelescopeReducing ci.type fun args result => do
    let mut lctx ← getLCtx
    let mut names : NameSet := {}
    let mut originalNames := #[]
    for index in [:args.size] do
      let d ← args[index]!.fvarId!.getDecl
      let original := d.userName.toString
      originalNames := originalNames.push original
      let safe := !original.isEmpty && original.toList.all (fun c => c.toNat < 128 && (c.isAlphanum || c == '_' || c == '\'')) && original.toList.head!.isAlpha && original.length <= 64 && !original.startsWith "glean_" && !(KEYWORDS : List String).contains original
      let mut alias := if safe && !names.contains d.userName then original else "arg" ++ toString index
      while names.contains alias.toName do alias := alias ++ "_"
      names := names.insert alias.toName
      lctx := lctx.setUserName args[index]!.fvarId! alias.toName
    withLCtx lctx (← getLocalInstances) do
      let mut inputs := #[]
      for index in [:args.size] do
        let d ← args[index]!.fvarId!.getDecl
        inputs := inputs.push <| Json.mkObj [
          ("name", toJson d.userName.toString), ("originalName",toJson originalNames[index]!), ("type",toJson (← ppExpr d.type).pretty),
          ("implicit",toJson (!d.binderInfo.isExplicit)), ("instance",toJson d.binderInfo.isInstImplicit)]
      return Json.mkObj [("name",toJson ci.name.toString), ("module",toJson moduleName),
        ("type",toJson (← ppExpr ci.type).pretty), ("inputs",toJson inputs), ("sourceRange",location),
        ("outputType",toJson (← ppExpr result).pretty), ("universes",toJson (ci.levelParams.map Name.toString))]
  IO.FS.writeFile DESTINATION result.compress
'''

def lookup_declaration(project_id, imports, declaration):
    if not isinstance(declaration,str) or len(declaration)>200 or not _QUALIFIED.fullmatch(declaration):
        raise ValueError('Enter a qualified Lean declaration name')
    if not isinstance(imports,list) or len(imports)>16 or any(not isinstance(name,str) or len(name)>200 or not _QUALIFIED.fullmatch(name) for name in imports):
        raise ValueError('Invalid import list')
    from .project_provenance import environment_provenance
    environment=environment_provenance(project_id)
    command,cwd=toolchain(project_id)
    with tempfile.TemporaryDirectory(prefix='glean-declaration-') as temporary:
        directory=Path(temporary);destination=directory/'result.json';source=directory/'Query.lean'
        query=_QUERY.replace('KEYWORDS',json.dumps(sorted(_KEYWORDS))).replace('DECLARATION',json.dumps(declaration)).replace('DESTINATION',json.dumps(str(destination)))
        source.write_text('\n'.join(['import Lean',*['import '+name for name in imports], 'set_option pp.fullNames true', query]))
        checked=subprocess.run(command+[str(source)],cwd=cwd,capture_output=True,text=True,timeout=45)
        if checked.returncode or not destination.is_file():raise ValueError((checked.stdout+checked.stderr)[-8192:] or 'Declaration lookup failed')
        result=json.loads(destination.read_text())
    current=environment_provenance(project_id)
    if current['environmentHash']!=environment['environmentHash']:raise ValueError('Lean 환경이 조회 중 변경되었습니다. 다시 조회하세요.')
    relative=Path(*result['module'].split('.')).with_suffix('.lean')
    roots=[cwd,*[Path(item['root']) for item in environment.get('dependencies',[]) if item.get('root')]]
    roots.extend(Path(item).parents[1]/'src'/'lean' for item in environment.get('leanSearchPaths',[]) if Path(item).name=='lean')
    result['sourcePath']=next((str((root/relative).resolve()) for root in roots if (root/relative).is_file()),None)
    result['environment']=environment
    result['projectId']=project_id;result['imports']=imports
    for index,item in enumerate(result['inputs']):item['id']='arg'+str(index)
    result['signatureHash']=hashlib.sha256(json.dumps(result,sort_keys=True).encode()).hexdigest()
    if result['universes']:
        result['unsupported']='This first typed graph version requires a monomorphic declaration; unresolved universe parameters must be instantiated in a LeanScript node.'
    return result


def declaration_source(project_id, imports, declaration):
    result=lookup_declaration(project_id,imports,declaration)
    path=result.get('sourcePath')
    if not path or not result.get('sourceRange'):
        raise ValueError('이 선언의 설치된 소스 위치를 찾지 못했습니다.')
    source=Path(path).read_text(encoding='utf-8')
    lines=source.splitlines();start=max(1,result['sourceRange']['startLine']);end=max(start,result['sourceRange']['endLine'])
    excerpt='\n'.join(lines[max(0,start-2):min(len(lines),end+1)])
    return {'path':path,'source':excerpt,'startLine':max(1,start-1),'sourceRange':result['sourceRange'],'name':result['name'],'environment':result['environment']}
