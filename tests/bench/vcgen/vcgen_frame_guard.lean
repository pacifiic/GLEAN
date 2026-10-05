/-
Copyright (c) 2026 Lean FRO LLC. All rights reserved.
Released under Apache 2.0 license as described in the file LICENSE.
Authors: Sebastian Graf
-/
import Cases.FrameGuard
import Driver

set_option experimental.vcgen true

open Lean Order Parser Meta Elab Tactic Sym Std WP
open FrameGuard

#eval runBenchUsingTactic ``Goal [``prog] `(tactic| vcgen) `(tactic| sorry)
  [50, 100, 150]
