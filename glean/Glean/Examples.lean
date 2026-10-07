/-
Copyright (c) 2026 GLEAN contributors. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
-/
module

/-! Reference proof terms for the first GLEAN node-editor operations. -/

public section

namespace Glean.Examples

/-- Connect the output of one implication to the input of another. -/
theorem compose {P Q R : Prop} (hp : P) (f : P → Q) (g : Q → R) : R :=
  g (f hp)

/-- Split a conjunction and reconnect its outputs in the opposite order. -/
theorem swapConjunction {P Q : Prop} (h : P ∧ Q) : Q ∧ P :=
  And.intro h.right h.left

/-- The proof input depends on the value supplied at the witness input. -/
theorem packWitness {α : Type} {P : α → Prop} (x : α) (hx : P x) : ∃ y, P y :=
  Exists.intro x hx

end Glean.Examples
