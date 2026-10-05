import Lean
import Std.WP

/-!
Framed spec applications at a `σ → Prop` assertion type. Each `poke` has a lossy spec, and the
frameproc for `Instr` frames `⊤` at every `poke`, so `prog n` makes `n` frame applications, each
with a `WP.Frames` side goal guarded by the point frame of the state at the `poke`.
-/

open Lean Meta Order Std.WP Lean.Elab.Tactic.VCGen

namespace FrameGuard

set_option experimental.vcgen true

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

end

/-- Lossy spec: says nothing about `mem` outside `ptr`. -/
@[spec] theorem poke_spec (v : Nat) :
    ⦃ fun _ => True ⦄ Instr.poke v ⦃ fun _ s => s.mem s.ptr = v ⦄ :=
  ⟨fun _ _ => by simp [wp, WP.trans, Instr.step]⟩

/-- Frames `⊤` at every `poke`. -/
@[frameproc] def instrFP : FrameProc where
  prog := ``Instr
  mkOpAppM := fun info => mkAppOptM ``Lean.Order.meet #[info.Pred, none]
  mkResourceTy := fun info => pure info.Pred
  opHead := ``Lean.Order.meet
  proc := fun i => do
    let frame ← mkAppOptM ``Lean.Order.top #[i.unframedApp.Pred, none]
    return .ofFrame i frame

def prog : Nat → List Instr
  | 0 => []
  | n+1 => Instr.setPtr n :: Instr.poke n :: prog n

def Goal (n : Nat) : Prop := ⦃ fun _ => True ⦄ prog n ⦃ fun _ _ => True ⦄

end FrameGuard
