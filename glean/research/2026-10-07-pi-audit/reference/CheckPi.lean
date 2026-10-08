/-
Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
-/
import Mathlib.Analysis.Real.Pi.Irrational

/-! Research harness: reuse the downloaded pi irrationality theorem and inspect its axioms. -/

theorem glean_irrational_pi : Irrational Real.pi := by
  exact irrational_pi

theorem glean_pi_ne_three : Real.pi ≠ (3 : ℝ) := by
  exact irrational_pi.ne_nat 3

#print axioms irrational_pi
#print axioms glean_irrational_pi
#print axioms glean_pi_ne_three
