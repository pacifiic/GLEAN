import Lean
import Std.WP

set_option experimental.vcgen true
set_option grind.warning false

/-!
# The guard of the `Frames` side goal

A framed spec application at the goal `pre ⊑ wp prog Q E s⃗` leaves the side goal
`WP.Frames op prog F P` with the guard `P := fun t⃗ => ⌜t⃗ = s⃗⌝ ⊓ pre`. A program whose footprint
depends on the state frames a resource only in some states, and the guard names the state at the
call site.

The program `[setPtr 3, poke 1]` runs over the state `St`. `poke v` writes `v` at `mem ptr`, so
it frames `fun s => s.mem 5 = 7` exactly in the states with `ptr ≠ 5`. At `poke 1` the state is
the updated state `{ s with ptr := 3 }`, and the side goal carries the point guard of that state.
-/

open Lean Order Std WP

structure St where
  ptr : Nat
  mem : Nat → Nat

inductive Instr where
  | setPtr (p : Nat)
  | poke (v : Nat)

def Instr.step : Instr → St → St
  | .setPtr p, s => { s with ptr := p }
  | .poke v, s => { s with mem := fun a => if a = s.ptr then v else s.mem a }

def run : List Instr → St → St
  | [], s => s
  | i :: p, s => run p (i.step s)

instance : WP Instr Unit (St → Prop) Unit where
  trans i := ⟨fun Q _ s => Q () (i.step s)⟩
  trans_monotone _ := fun _ _ _ _ _ hQ _ h => hQ () _ h

instance : WP (List Instr) Unit (St → Prop) Unit where
  trans p := ⟨fun Q _ s => Q () (run p s)⟩
  trans_monotone _ := fun _ _ _ _ _ hQ _ h => hQ () _ h

section
variable {Q : Unit → St → Prop} {E : Unit}

@[spec] theorem nil_spec : ⦃ fun s => Q () s ⦄ ([] : List Instr) ⦃ Q; E ⦄ := ⟨fun _ h => h⟩

@[spec] theorem cons_spec (i : Instr) (p : List Instr) :
    ⦃ wp i (fun _ => wp p Q E) E ⦄ (i :: p) ⦃ Q; E ⦄ := ⟨fun _ h => h⟩

@[spec] theorem setPtr_spec (p : Nat) :
    ⦃ fun s => Q () { s with ptr := p } ⦄ Instr.setPtr p ⦃ Q; E ⦄ := ⟨fun _ h => h⟩

/-- Lossy spec: says nothing about `mem` outside `p`. -/
@[spec] theorem poke_spec (p v : Nat) :
    ⦃ fun s => s.ptr = p ⦄ Instr.poke v ⦃ fun _ s => s.mem p = v ⦄ :=
  ⟨fun s h => by simp [wp, WP.trans, Instr.step, h]⟩

theorem poke_frames {v : Nat} {F P : St → Prop} (hF : F = fun s => s.mem 5 = 7)
    (h : ∀ t, P t ⊑ ⌜t.ptr ≠ 5⌝) : WP.Frames meet (Instr.poke v) F P := by
  subst hF
  constructor
  intro Q E s hs
  simp only [meet_apply, meet_prop_eq_and] at hs
  obtain ⟨hP, hF, hwp⟩ := hs
  have hne := h s hP
  simp only [CompleteLattice.ofProp_prop_eq] at hne
  show ((fun s => s.mem 5 = 7) ⊓ Q ()) (Instr.step (.poke v) s)
  simp only [meet_apply, meet_prop_eq_and, Instr.step]
  exact ⟨by simp [Ne.symm hne, hF], hwp⟩

end

/-! The side goal guards the frame by the point frame of `{ s with ptr := 3 }`, and `grind` closes
every goal from the local context. -/

/--
trace: s✝ : St
a✝ : s✝.mem 5 = 7
⊢ WP.Frames meet (Instr.poke 1) (fun s => s.mem 5 = 7) fun t => ⌜t = { ptr := 3, mem := s✝.mem }⌝
-/
#guard_msgs (trace) in
theorem guard_point_frame :
    ⦃ fun s => s.mem 5 = 7 ⦄ [Instr.setPtr 3, Instr.poke 1]
    ⦃ fun _ s => s.mem 5 = 7 ∧ s.mem 3 = 1 ⦄ := by
  vcgen frames | Instr.poke _ => fun s => s.mem 5 = 7
  case vc1 => trace_state; grind [poke_frames]
  all_goals grind

/-! ## Two state arguments and an opaque precondition

With two state arguments the guard is the conjunction of both point equations. A precondition
other than `⊤` stays in the guard. -/

@[irreducible] def bumpIn [Monad m] : StateT Nat (StateT Nat m) Unit := modify (· + 1)

@[spec] theorem bumpIn_spec [Monad m] [Assertion Pred] [Assertion EPosts] [WPMonad m Pred EPosts] :
    ⦃ fun s _ => ⌜s = n⌝ ⦄ (bumpIn : StateT Nat (StateT Nat m) Unit)
    ⦃ fun _ s _ => ⌜s = n + 1⌝ ⦄ := by
  unfold bumpIn; vcgen <;> simp_all

/--
trace: s✝¹ s✝ : Nat
a✝ : s✝¹ = 0 ∧ s✝ = 7
⊢ WP.Frames meet bumpIn (fun x u => ⌜u = 7⌝) fun t t_1 => ⌜t = s✝¹ ∧ t_1 = s✝⌝
-/
#guard_msgs (trace, drop warning) in
example : ⦃ fun s u => ⌜s = 0 ∧ u = 7⌝ ⦄ (bumpIn : StateT Nat (StateT Nat Id) Unit)
    ⦃ fun _ s u => ⌜s = 1 ∧ u = 7⌝ ⦄ := by
  vcgen frames | bumpIn => fun _ u => ⌜u = 7⌝
  case vc1 => trace_state; sorry
  all_goals sorry

@[irreducible] def bump [Monad m] : StateT Nat m Unit := modify (· + 1)

@[spec] theorem bump_spec [Monad m] [Assertion Pred] [Assertion EPosts] [WPMonad m Pred EPosts] :
    ⦃ fun s => ⌜s = n⌝ ⦄ (bump : StateT Nat m Unit) ⦃ fun _ s => ⌜s = n + 1⌝ ⦄ := by
  unfold bump; vcgen <;> simp_all

/--
trace: m : Type → Type u_1
Pred : Type u_2
inst✝³ : Monad m
inst✝² : Assertion Pred
inst✝¹ : WPMonad m Pred PUnit
inst✝ : ∀ (a : Pred), PreservesSup (meet a)
G : Pred
s✝ : Nat
a✝ : s✝ = 0
⊢ WP.Frames meet bump (fun x => G) fun t => ⌜t = s✝⌝ ⊓ G
-/
#guard_msgs (trace, drop warning) in
example [Monad m] [Assertion Pred] [WPMonad m Pred EStack⟨⟩] [∀ a : Pred, PreservesSup (meet a)]
    (G : Pred) :
    ⦃ fun s => ⌜s = 0⌝ ⊓ G ⦄ (bump : StateT Nat m Unit) ⦃ fun _ s => ⌜s = 1⌝ ⊓ G ⦄ := by
  vcgen frames | bump => fun _ => G
  case vc1 => trace_state; sorry
  all_goals sorry
