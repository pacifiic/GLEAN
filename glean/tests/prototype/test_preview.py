"""Inference previews expose required port types without launching Lean."""
import unittest
from unittest.mock import patch
from glean.prototype.graph import compile_graph
from glean.prototype.server import preview_graph
from glean.tests.prototype.test_graph import composition

class PreviewTests(unittest.TestCase):
    def test_required_port_types_survive_wrong_connection(self):
        graph=composition()
        graph['edges'][1]['source']='g'
        result=compile_graph(graph)
        self.assertEqual(result['portTypes']['a1']['arg'],'P')
        self.assertEqual(result['portTypes']['goal']['proof'],'R')
        self.assertEqual(result['status'],'invalid')
    def test_preview_never_launches_lean_or_claims_kernel_verification(self):
        with patch('glean.prototype.server._toolchain',side_effect=AssertionError('Lean launched')):
            result=preview_graph(composition())
        self.assertEqual(result['status'],'ready')
        self.assertTrue(result['preview'])
        self.assertFalse(result['verified'])
        self.assertIn('theorem glean_proof',result['generatedCode'])
