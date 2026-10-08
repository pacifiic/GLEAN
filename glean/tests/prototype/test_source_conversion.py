# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Source-backed theorem conversion preserves declarations and independent kernel checks."""
import copy
import hashlib
import time
import unittest
from glean.prototype.declaration_index import DeclarationIndexService
from glean.prototype.graph_jobs import GraphCheckService
from glean.prototype.source_check import SourceCheckService
from glean.prototype.typed_graph import compile_typed_graph

SOURCE = '''import Lean
namespace Uploaded
abbrev Size := Nat
section
variable (n : Size) (i : Fin n)
theorem reflexive : i = i := rfl
end
end Uploaded
'''

def wait(service, result):
    deadline=time.monotonic()+100
    while result['status'] not in {'analyzed','valid','invalid','incomplete','error','cancelled'}:
        if time.monotonic()>deadline:raise AssertionError(result)
        time.sleep(.05);result=service.get(result['jobId'])
    return result

class SourceConversionTests(unittest.TestCase):
    def setUp(self):
        self.index=DeclarationIndexService();self.sources=SourceCheckService();self.graphs=GraphCheckService(self.sources)
    def tearDown(self):self.index.shutdown();self.sources.shutdown()
    def index_source(self,source=SOURCE):
        result=wait(self.index,self.index.start({'source':source,'filename':'Upload.lean','projectId':'glean'}))
        self.assertEqual(result['status'],'analyzed',result);return result
    def convert(self,result,name='Uploaded.reflexive',**changes):
        return self.index.convert({'jobId':result['jobId'],'declaration':name,'sourceHash':result['sourceHash'],'environmentHash':result['environment']['environmentHash'],**changes})
    def test_dependent_source_types_create_real_editable_wires_and_check_then_reject_bad_body(self):
        result=self.index_source();doc=self.convert(result);graph=doc['graph']
        self.assertEqual(graph['sourceContext']['source'],SOURCE)
        self.assertEqual(len(graph['inputs']),2);self.assertEqual(len(graph['edges']),2)
        self.assertEqual(graph['nodes'][-1]['kind'],'script');self.assertIn('@Uploaded.reflexive',graph['nodes'][-1]['body'])
        compiled=compile_typed_graph(graph);self.assertEqual(compiled['status'],'ready',compiled)
        self.assertIn('import GleanUploadedSource',compiled['generatedCode']);self.assertIn('import GleanUploadedSource',compiled['expectedSource'])
        checked=wait(self.graphs,self.graphs.start({'graph':graph}));self.assertEqual(checked['status'],'valid',checked)
        self.assertTrue(checked['kernelAccepted']);self.assertTrue(checked['sourceContextKernelAccepted'])
        graph['nodes'][-1]['body']='by exact True.intro'
        checked=wait(self.graphs,self.graphs.start({'graph':graph}));self.assertEqual(checked['status'],'invalid',checked)
    def test_stale_identity_private_polymorphic_and_errored_files_are_explicitly_rejected(self):
        result=self.index_source()
        for changes in [{'sourceHash':'0'*64},{'environmentHash':'0'*64}]:
            with self.assertRaises(ValueError):self.convert(result,**changes)
        source='private theorem hidden : True := True.intro\ntheorem poly {α : Type u} (a : α) : a = a := rfl\ndef value : Nat := 2\n'
        result=self.index_source(source)
        for item in result['declarations']:
            if item['private'] or item['name'] in {'poly','value'}:
                with self.assertRaises(ValueError):self.convert(result,item['name'])
        result=self.index_source('theorem good : True := True.intro\ndef broken : Nat := True.intro\n')
        with self.assertRaises(ValueError):self.convert(result,'good')
    def test_canonical_instance_arguments_and_private_signature_policy_are_preserved(self):
        source='import Lean\nset_option pp.proofs false\nset_option pp.maxSteps 1\nnamespace N\nprivate abbrev Hidden := Nat\ntheorem hidden_signature (n : Hidden) : n = n := rfl\nprivate def helper (n : Nat) := n\ntheorem private_body (n : Nat) : n = n := by exact Eq.refl (helper n)\ntheorem good [inst : Inhabited Nat] : (default : Nat) = default := rfl\nend N\n'
        result=self.index_source(source)
        with self.assertRaisesRegex(ValueError,'private type'):self.convert(result,'N.hidden_signature')
        graph=self.convert(result,'N.good',policy='strict')['graph']
        self.assertEqual(graph['policy'],'strict');self.assertEqual(graph['sourceContext']['policy'],'strict')
        self.assertIn('inst',graph['goal']);self.assertNotIn('⋯',graph['goal'])
        checked=wait(self.graphs,self.graphs.start({'graph':graph}));self.assertEqual(checked['status'],'valid',checked)
        graph=self.convert(result,'N.private_body')['graph']
        checked=wait(self.graphs,self.graphs.start({'graph':graph}));self.assertEqual(checked['status'],'valid',checked)
    def test_source_axioms_and_sorry_are_not_hidden_by_importing_the_original(self):
        for source,status in [('theorem imported : True := by sorry\n','incomplete'),('axiom evil : False\ntheorem imported : True := False.elim evil\n','invalid')]:
            graph=self.convert(self.index_source(source),'imported')['graph']
            checked=wait(self.graphs,self.graphs.start({'graph':graph}));self.assertEqual(checked['status'],status,checked)
            self.assertTrue(checked['kernelAccepted']);self.assertFalse(checked['verified'])

    def test_saved_context_mutation_and_source_origin_mismatch_fail_before_verification(self):
        graph=self.convert(self.index_source())['graph']
        graph['sourceContext']['source']+='\n-- edited'
        self.assertEqual(compile_typed_graph(graph)['status'],'invalid')
        result=self.index_source()
        with self.assertRaises(ValueError):self.convert(result,sourceOrigin={'decoding':'invalid-utf8'})
