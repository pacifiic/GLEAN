/-
Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
-/
import Lean

/-! Read actual current-file declaration metadata from Lean command state.
This analysis probe never claims independent proof verification.
-/
open Lean Elab Frontend

unsafe def main (args : List String) : IO UInt32 := do
  initSearchPath (← findSysroot)
  enableInitializersExecution
  let input ← IO.FS.readFile args[0]!
  let inputCtx := Parser.mkInputContext input args[0]!
  let (header, parserState, messages) ← Parser.parseHeader inputCtx
  let opts := ({} : Options).setBool `Elab.async false
  let (env, messages) ← Elab.processHeader header opts messages inputCtx (mainModule := `GleanAuditSource)
  let state ← Elab.IO.processCommands inputCtx parserState (Command.mkState env messages opts)
  let action : FrontendM Json := runCommandElabM do
    let env ← getEnv
    let mut items := #[]
    for pending in ← env.getLocalConstantInfos do
      let ci := pending.toConstantInfo
      let ranges ← findDeclarationRanges? ci.name
      let type ← Command.liftTermElabM do
        return (← Meta.ppExpr ci.type).pretty
      let range := ranges.map fun r => Json.mkObj [
        ("startLine", toJson r.range.pos.line), ("startCharacter", toJson r.range.charUtf16),
        ("endLine", toJson r.range.endPos.line), ("endCharacter", toJson r.range.endCharUtf16)]
      let dependencies := ci.getUsedConstantsAsSet.toArray.map Name.toString
      items := items.push <| Json.mkObj [
        ("name", toJson ci.name.toString), ("kind", toJson (toString (repr pending.kind))),
        ("type", toJson type), ("range", range.getD Json.null),
        ("directDependencies", toJson dependencies), ("private", toJson (isPrivateName ci.name))]
    return Json.mkObj [("adapter", toJson "lean-4.34.1-command-state-poc"),
      ("verified", toJson false), ("declarations", toJson items)]
  let (metadata, _) ← StateRefT'.run (action.run {inputCtx}) state
  let mut diagnostics := #[]
  for msg in state.commandState.messages.toList do
    diagnostics := diagnostics.push <| Json.mkObj [
      ("line", toJson msg.pos.line), ("column", toJson msg.pos.column),
      ("severity", toJson (match msg.severity with | .error => "error" | .warning => "warning" | .information => "information")),
      ("message", toJson (← msg.data.toString))]
  let output := Json.mkObj [("metadata", metadata), ("diagnostics", toJson diagnostics),
    ("hasErrors", toJson state.commandState.messages.hasErrors)]
  IO.FS.writeFile args[1]! output.pretty
  return 0
