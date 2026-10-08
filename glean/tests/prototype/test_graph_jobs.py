"""Graph jobs share cancellable trusted source checks and retain compiler diagnostics."""
import unittest
from unittest.mock import Mock
from glean.prototype.graph_jobs import GraphCheckService
from glean.tests.prototype.test_graph import composition
class GraphJobTests(unittest.TestCase):
    def test_compile_then_start_and_cancel_actual_source_job(self):
        source=Mock();source.start.return_value={'jobId':'j','status':'queued','verified':False};source.get.return_value={'jobId':'j','status':'valid','verified':True,'audit':{'axioms':[]}};source.cancel.return_value={'jobId':'j','status':'cancelled','verified':False}
        service=GraphCheckService(source);started=service.start({'graph':composition()})
        self.assertEqual(started['jobId'],'j');self.assertEqual(source.start.call_args.args[0]['target'],'glean_proof')
        self.assertIn('sourceMap',service.get('j'));self.assertTrue(service.get('j')['verified'])
        self.assertFalse(service.cancel('j')['verified']);source.cancel.assert_called_with('j')
    def test_incomplete_graph_never_starts_job(self):
        source=Mock();graph=composition();graph['edges'].pop()
        result=GraphCheckService(source).start({'graph':graph})
        self.assertEqual(result['status'],'incomplete');source.start.assert_not_called()

class ActualTypedMetadataTests(unittest.TestCase):
    def test_user_local_generated_like_name_is_not_compiler_owned_metadata(self):
        import time
        from glean.prototype.source_check import SourceCheckService
        from glean.tests.prototype.test_typed_graph import nat_identity
        sources=SourceCheckService();service=GraphCheckService(sources)
        graph=nat_identity();graph['nodes'][1]['body']='by\n  let glean_component_2 : Bool := true\n  exact Nat.add_zero x'
        try:
            result=service.start({'graph':graph});deadline=time.monotonic()+60
            while result['status'] not in {'valid','invalid','error','cancelled','incomplete'}:
                self.assertLess(time.monotonic(),deadline,result);time.sleep(.1);result=service.get(result['jobId'])
            self.assertTrue(result['verified'],result)
            self.assertNotIn('glean_component_1/glean_component_2',result['bindingTypes'])
            self.assertIn('root/s/out',result['typedNodeTypes'])
            self.assertEqual(result['typedNodeUsage']['root/s/out'],['n'])
        finally:sources.shutdown()
    def test_serialized_outputs_and_used_arguments_come_from_lean(self):
        import time
        from glean.prototype.source_check import SourceCheckService
        from glean.tests.prototype.test_typed_graph import nat_identity
        sources=SourceCheckService();service=GraphCheckService(sources)
        try:
            graph=nat_identity();graph['nodes'][1]['body']='by rfl'
            graph['inputs'].append({'id':'unused','name':'unused','type':'Nat'})
            graph['nodes'].append({'id':'unused','kind':'input','ref':'unused'})
            graph['nodes'][1]['inputs'].append({'id':'ignored','name':'ignored','type':'Nat'})
            graph['edges'].append({'id':'unused-wire','source':'unused','output':'out','target':'s','input':'ignored'})
            result=service.start({'graph':graph});deadline=time.monotonic()+90
            while result['status'] not in {'valid','invalid','error','cancelled','incomplete'}:
                self.assertLess(time.monotonic(),deadline,result);time.sleep(.1);result=service.get(result['jobId'])
            self.assertTrue(result['verified'],result)
            self.assertEqual(result['typedNodeTypes']['root/n/out'],'Nat')
            self.assertIn('root/s/out',result['typedNodeTypes'])
            self.assertEqual(result['typedNodeUsage']['root/s/out'],['n'])
        finally:sources.shutdown()
    def test_an_unused_module_with_sorry_does_not_inherit_target_verification(self):
        import time
        from glean.prototype.source_check import SourceCheckService
        sources=SourceCheckService();service=GraphCheckService(sources)
        graph={'version':3,'name':'target separate from unused module','projectId':'glean','imports':[],'policy':'strict','inputs':[],'goal':'True','nodes':[{'id':'proof','kind':'script','inputs':[],'outputType':'True','body':'True.intro'}],'edges':[],'result':{'node':'proof','output':'out'},'modules':[{'id':'unused','name':'unused','inputs':[],'outputType':'True','nodes':[{'id':'hole','kind':'script','inputs':[],'outputType':'True','body':'by sorry'}],'edges':[],'result':{'node':'hole','output':'out'}}]}
        try:
            result=service.start({'graph':graph});deadline=time.monotonic()+90
            while result['status'] not in {'valid','invalid','error','cancelled','incomplete'}:
                self.assertLess(time.monotonic(),deadline,result);time.sleep(.1);result=service.get(result['jobId'])
            self.assertTrue(result['verified'],result)
            self.assertFalse(result['typedNodeAudit']['module/unused/hole/out']['policyAccepted'])
            self.assertTrue(result['typedNodeAudit']['module/unused/hole/out']['hasSorry'])
            self.assertTrue(result['typedNodeAudit']['root/proof/out']['policyAccepted'])
        finally:sources.shutdown()
