/- Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0. -/
import Lean
set_option autoImplicit false
set_option linter.defProp false
open Lean Elab Term in
elab "gleanTerm% " text:str : term <= expectedType => do
  let stx ← match Parser.runParserCategory (← getEnv) `term text.getString with
    | .ok parsed => pure parsed
    | .error message => throwError message
  let stx := stx.rewriteBottomUp (Syntax.setInfo text.raw.getHeadInfo)
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

noncomputable def glean_component_1 (n : (gleanTerm% "Nat")) : (gleanTerm% "n + 0 = n") :=
  (gleanTerm% "by\n  rfl")

noncomputable def glean_module_0 (n : (gleanTerm% "Nat")) : (gleanTerm% "n + 0 = n") :=
  let glean_component_2 := glean_component_1 (n)
  glean_component_2

noncomputable def glean_module_1 (n : (gleanTerm% "Nat")) : (gleanTerm% "n + 0 = n") :=
  let glean_component_3 := glean_module_0 (n)
  glean_component_3

noncomputable def glean_module_2 (n : (gleanTerm% "Nat")) : (gleanTerm% "n + 0 = n") :=
  let glean_component_4 := glean_module_1 (n)
  glean_component_4

noncomputable def glean_component_9 (pa : (gleanTerm% "3 + 0 = 3")) (pb : (gleanTerm% "5 + 0 = 5")) : (gleanTerm% "(3 + 0 = 3) ∧ (5 + 0 = 5)") :=
  (gleanTerm% "And.intro pa pb")

theorem glean_proof  : (gleanTerm% "(3 + 0 = 3) ∧ (5 + 0 = 5)") :=
  let glean_component_5 : Nat := 3
  let glean_component_6 : Nat := 5
  let glean_component_7 := glean_module_2 (glean_component_5)
  let glean_component_8 := glean_module_2 (glean_component_6)
  let glean_component_10 := glean_component_9 (glean_component_7) (glean_component_8)
  glean_component_10
