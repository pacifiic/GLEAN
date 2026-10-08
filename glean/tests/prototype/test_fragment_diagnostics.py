"""Body diagnostics retain Lean positions independently of wrapper source lines."""
import unittest
import time
from glean.prototype.graph_jobs import fragment_diagnostics, merge_fragment_diagnostics
class FragmentDiagnosticTests(unittest.TestCase):
    def test_actual_type_error_logs_original_fragment_reference_without_error_recovery(self):
        from glean.prototype.graph_jobs import GraphCheckService
        from glean.prototype.source_check import SourceCheckService
        from glean.tests.prototype.test_typed_graph import nat_identity
        graph=nat_identity()
        graph['nodes'][1]['body']='by\n  have α : Nat := x\n  have h : x + 0 = x := Nat.add_zero x\n  exact α'
        sources=SourceCheckService(max_jobs=1)
        service=GraphCheckService(sources)
        try:
            result=service.start({'graph':graph});deadline=time.monotonic()+40
            while result['status'] not in {'valid','invalid','incomplete','error','cancelled'}:
                self.assertLess(time.monotonic(),deadline,result)
                time.sleep(.1);result=service.get(result['jobId'])
            self.assertEqual(result['status'],'invalid',result)
            self.assertEqual(len(result['diagnostics']),1,result)
            self.assertEqual((result['diagnostics'][0]['bodyLine'],result['diagnostics'][0]['bodyColumn']),(4,3),result)
        finally:
            sources.shutdown()
    def test_type_and_embedded_parser_errors_map_to_actual_body_lines(self):
        metadata={'GLEAN_FRAGMENT_1':{'key':'root/proof','field':'body','lineCount':4}}
        for output,line,column in [('GLEAN_FRAGMENT_1:4:2: error: Type mismatch\n  α\n',4,3),('Graph.lean:33:3: error: GLEAN_FRAGMENT_1:3:0: unexpected end of input\n',3,1)]:
            diagnostic=fragment_diagnostics(output,metadata)[0]
            self.assertEqual((diagnostic['bodyLine'],diagnostic['bodyColumn']),(line,column))
            self.assertEqual(diagnostic['graphLocation'],'root/proof')
        self.assertEqual(fragment_diagnostics('GLEAN_FRAGMENT_1:8:0: error: impossible',metadata),[])

    def test_one_underlying_body_error_is_not_counted_as_wrapper_and_fallback_errors(self):
        mapped=fragment_diagnostics('Graph.lean:33:3: error: GLEAN_FRAGMENT_1:3:0: unexpected end of input\n',{'GLEAN_FRAGMENT_1':{'key':'root/proof','field':'body','lineCount':4}})
        wrappers=[{'message':'GLEAN_FRAGMENT_1:3:0: unexpected end of input','line':33}, {'message':'Lean이 소스를 거부했습니다. Lean 출력에서 원인을 확인해 주세요.'}]
        self.assertEqual(merge_fragment_diagnostics(wrappers,mapped),mapped)
        self.assertEqual(len(merge_fragment_diagnostics([{'message':'another independent error','line':10}]+wrappers,mapped)),2)
