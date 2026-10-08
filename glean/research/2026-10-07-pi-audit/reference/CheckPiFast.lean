/-
Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
-/
import Mathlib.Analysis.Real.Pi.Irrational

/-! Minimal wrapper to measure theorem reuse separately from the axiom audit. -/

theorem glean_irrational_pi_fast : Irrational Real.pi := by
  exact irrational_pi
