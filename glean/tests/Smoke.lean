module
import Glean

/-! Check the initial proof-composition examples and reject a mismatched proof input. -/

example (P Q R : Prop) (hp : P) (f : P → Q) (g : Q → R) : R :=
  Glean.Examples.compose hp f g

example (P Q : Prop) (h : P ∧ Q) : Q ∧ P :=
  Glean.Examples.swapConjunction h

example (α : Type) (P : α → Prop) (x : α) (hx : P x) : ∃ y, P y :=
  Glean.Examples.packWitness x hx

example (P Q : Prop) (hp : P) (_f : Q → Q) : P := by
  fail_if_success exact _f hp
  exact hp

/-- info: 'Glean.Examples.compose' does not depend on any axioms -/
#guard_msgs in
#print axioms Glean.Examples.compose

/-- info: 'Glean.Examples.swapConjunction' does not depend on any axioms -/
#guard_msgs in
#print axioms Glean.Examples.swapConjunction

/-- info: 'Glean.Examples.packWitness' does not depend on any axioms -/
#guard_msgs in
#print axioms Glean.Examples.packWitness
