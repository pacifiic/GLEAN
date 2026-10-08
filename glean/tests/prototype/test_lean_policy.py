"""Axiom policy never conflates accepted kernel terms with complete standard proofs."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from glean.prototype.lean_policy import evaluate_axioms, parse_audit


class LeanPolicyTests(unittest.TestCase):
    def test_standard_axioms_are_allowed_and_visible(self):
        result = evaluate_axioms(['Quot.sound', 'propext', 'Classical.choice'])
        self.assertTrue(result['policyAccepted'])
        self.assertEqual(len(result['standardAxioms']), 3)

    def test_sorry_is_never_verified(self):
        result = evaluate_axioms(['sorryAx', 'propext'])
        self.assertTrue(result['hasSorry'])
        self.assertFalse(result['policyAccepted'])

    def test_custom_axiom_is_rejected(self):
        result = evaluate_axioms(['invented_fact'])
        self.assertEqual(result['customAxioms'], ['invented_fact'])
        self.assertFalse(result['policyAccepted'])

    def test_strict_policy_preserves_axiom_free_contract(self):
        self.assertTrue(evaluate_axioms([], 'strict')['policyAccepted'])
        self.assertFalse(evaluate_axioms(['propext'], 'strict')['policyAccepted'])

    def test_untrusted_or_wrong_audit_is_rejected(self):
        for text in ['fake does not depend on any axioms', '{}', '{"target":"x","axioms":[]}']:
            with self.assertRaises(ValueError):
                parse_audit(text, target='goal', nonce='nonce')

    def test_structured_audit_requires_exact_target_nonce_and_theorem(self):
        import json
        data = {'schema':1, 'target':'goal', 'nonce':'nonce', 'kernelAccepted':True,
                'isTheorem':True, 'axioms':[]}
        self.assertEqual(parse_audit(json.dumps(data), target='goal', nonce='nonce'), [])
        for key, value in [('target','other'), ('nonce','fake'), ('isTheorem',False), ('axioms',[7])]:
            with self.assertRaises(ValueError):
                parse_audit(json.dumps({**data, key:value}), target='goal', nonce='nonce')
