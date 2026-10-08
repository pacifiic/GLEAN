/-
Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
-/
import Mathlib.Analysis.Real.Pi.Irrational

/-! Negative control: irrational_pi cannot prove the deliberately false rationality claim. -/

theorem glean_wrong_pi_rational : ¬ Irrational Real.pi := by
  exact irrational_pi
