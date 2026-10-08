/-
Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
-/
import Lean

/-! Namespace/private/macro declarations and a deliberate partial-file error. -/
namespace Scoped
section
variable (n : Nat)
private def hidden : Nat := n + 1
notation "nine" => (9 : Nat)
macro "makeNat " x:ident : command => `(def $x : Nat := nine)
makeNat generated
theorem from_hidden : hidden n = n + 1 := rfl
def from_macro : Nat := generated
instance : Inhabited (Fin 2) := ⟨⟨0, by decide⟩⟩
def broken : Nat := True.intro
def valid_after_error : Nat := generated + 1
end
end Scoped
