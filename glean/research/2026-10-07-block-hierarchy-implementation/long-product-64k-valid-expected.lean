import Lean
set_option autoImplicit false
set_option linter.defProp false
open Lean Elab Term in
elab "gleanExpectedTerm% " location:str text:str : term <= expectedType => do
  let filename := if location.getString.isEmpty then "<input>" else location.getString
  let stx ← match Parser.runParserCategory (← getEnv) `term text.getString filename with
    | .ok parsed => pure parsed
    | .error message => throwError message
  let stx := if location.getString.isEmpty then stx.rewriteBottomUp (Syntax.setInfo text.raw.getHeadInfo) else stx
  let elaborate : TermElabM Expr := do
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
  if location.getString.isEmpty then elaborate
  else withTheReader Core.Context (fun ctx => { ctx with fileName := filename, fileMap := FileMap.ofString text.getString }) elaborate

def glean_expected_type : Prop := ∀ (n : (gleanExpectedTerm% "" "Nat")), (gleanExpectedTerm% "" "n + 0 = n")
