import Lean
set_option autoImplicit false
set_option linter.defProp false
open Lean Elab Term in
elab "gleanTerm% " location:str text:str : term <= expectedType => do
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

noncomputable def glean_component_1 (n : (gleanTerm% "" "Nat")) : (gleanTerm% "" "n + 0 = n") :=
  (gleanTerm% "GLEAN_FRAGMENT_1" "by\n  rfl")

noncomputable def glean_module_0 (n : (gleanTerm% "" "Nat")) : (gleanTerm% "" "n + 0 = n") :=
  let glean_component_2 := glean_component_1 (n)
  glean_component_2

noncomputable def glean_module_1 (n : (gleanTerm% "" "Nat")) : (gleanTerm% "" "n + 0 = n") :=
  let glean_component_3 := glean_module_0 (n)
  glean_component_3

noncomputable def glean_module_2 (n : (gleanTerm% "" "Nat")) : (gleanTerm% "" "n + 0 = n") :=
  let glean_component_4 := glean_module_1 (n)
  glean_component_4

noncomputable def glean_component_5 (x : (gleanTerm% "" "Nat")) : (gleanTerm% "" "Nat") :=
  (gleanTerm% "GLEAN_FRAGMENT_2" "x")

noncomputable def glean_module_4 (x : (gleanTerm% "" "Nat")) : (gleanTerm% "" "Nat") :=
  let glean_component_6 := glean_component_5 (x)
  glean_component_6

noncomputable def glean_component_8 (x : (gleanTerm% "" "Nat")) : (gleanTerm% "" "Nat") :=
  (gleanTerm% "GLEAN_FRAGMENT_3" "x + 0")

noncomputable def glean_module_6 (x : (gleanTerm% "" "Nat")) : (gleanTerm% "" "Nat") :=
  let glean_component_9 := glean_component_8 (x)
  glean_component_9

noncomputable def glean_component_11 (x : (gleanTerm% "" "Nat")) : (gleanTerm% "" "Nat") :=
  (gleanTerm% "GLEAN_FRAGMENT_4" "x")

noncomputable def glean_module_5 (x : (gleanTerm% "" "Nat")) : (gleanTerm% "" "Nat") :=
  let glean_component_10 := glean_module_6 (x)
  let glean_component_12 := glean_component_11 (glean_component_10)
  glean_component_12

noncomputable def glean_component_14 (x : (gleanTerm% "" "Nat")) : (gleanTerm% "" "Nat") :=
  (gleanTerm% "GLEAN_FRAGMENT_5" "x")

noncomputable def glean_module_3 (x : (gleanTerm% "" "Nat")) : (gleanTerm% "" "Nat") :=
  let glean_component_7 := glean_module_4 (x)
  let glean_component_13 := glean_module_5 (glean_component_7)
  let glean_component_15 := glean_component_14 (glean_component_13)
  glean_component_15

noncomputable def glean_component_21 (pa : (gleanTerm% "" "3 + 0 = 3")) (pb : (gleanTerm% "" "5 + 0 = 5")) : (gleanTerm% "" "(3 + 0 = 3) ∧ (5 + 0 = 5)") :=
  (gleanTerm% "GLEAN_FRAGMENT_6" "And.intro pa pb")

theorem glean_proof  : (gleanTerm% "" "(3 + 0 = 3) ∧ (5 + 0 = 5)") :=
  let glean_component_16 : Nat := 3
  let glean_component_17 : Nat := 5
  let glean_component_18 := glean_module_3 (glean_component_16)
  let glean_component_19 := glean_module_2 (glean_component_17)
  let glean_component_20 := glean_module_2 (glean_component_18)
  let glean_component_22 := glean_component_21 (glean_component_20) (glean_component_19)
  glean_component_22
