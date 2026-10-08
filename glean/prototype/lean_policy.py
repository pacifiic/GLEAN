# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Explicit proof policies for structured, independently produced Lean audits."""

import json

STANDARD_AXIOMS = frozenset({'propext', 'Classical.choice', 'Quot.sound'})


def evaluate_axioms(axioms, policy='standard'):
    if not isinstance(policy, str) or policy not in {'standard', 'strict'}:
        raise ValueError('Unknown axiom policy')
    if not isinstance(axioms, list) or any(not isinstance(item, str) or not item for item in axioms):
        raise ValueError('Malformed axiom list')
    names = sorted(set(axioms))
    standard = [name for name in names if name in STANDARD_AXIOMS]
    custom = [name for name in names if name not in STANDARD_AXIOMS and name != 'sorryAx']
    sorry = 'sorryAx' in names
    return {'axioms': names, 'standardAxioms': standard, 'customAxioms': custom,
            'hasSorry': sorry, 'policy': policy,
            'policyAccepted': not sorry and not custom and (policy != 'strict' or not names)}


def parse_audit(text, *, target, nonce):
    """Parse only the trusted reader's private result file, never submitted stdout."""
    try:
        data = json.loads(text)
    except (ValueError, TypeError) as exc:
        raise ValueError('Lean audit is not valid JSON') from exc
    if (not isinstance(data, dict) or data.get('schema') != 1 or data.get('target') != target
            or data.get('nonce') != nonce or data.get('kernelAccepted') is not True
            or data.get('isTheorem') is not True):
        raise ValueError('Lean audit target or provenance mismatch')
    evaluate_axioms(data.get('axioms'))
    return data['axioms']
