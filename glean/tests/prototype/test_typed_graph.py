"""Typed components preserve exact literals, lexical scopes, and actual Lean checking."""
import copy
import time
import unittest
from glean.prototype.typed_graph import compile_typed_graph
from glean.prototype.source_check import SourceCheckService

def nat_identity():
    return {'version':3,'name':'Nat identity','projectId':'glean','imports':[],'policy':'strict',
        'inputs':[{'id':'n','name':'n','type':'Nat'}],'goal':'n + 0 = n','modules':[],
        'nodes':[{'id':'n','kind':'input','ref':'n'}, {'id':'s','kind':'script','inputs':[{'id':'x','name':'x','type':'Nat'}],'outputType':'x + 0 = x','body':'by simp'}],
        'edges':[{'id':'e','source':'n','output':'out','target':'s','input':'x'}],'result':{'node':'s','output':'out'}}
class TypedGraphTests(unittest.TestCase):
    def test_complete_one_mebibyte_body_compiles_once_with_fragment_identity(self):
        graph=nat_identity();body='by\n'+('  have h : x + 0 = x := Nat.add_zero x\n'*25000)+'  exact Nat.add_zero x'
        self.assertLess(len(body.encode()),1024*1024)
        graph['nodes'][1]['body']=body;result=compile_typed_graph(graph)
        self.assertEqual(result['status'],'ready',result)
        self.assertEqual(next(v for v in result['fragmentSources'].values() if v['key']=='root/s')['lineCount'],len(body.splitlines()))
        self.assertIn('exact Nat.add_zero x',result['generatedCode'])
        graph['nodes'][1]['body']='x'*(1024*1024+1);self.assertEqual(compile_typed_graph(graph)['status'],'invalid')
    def test_explicit_component_generates_independent_expected_signature(self):
        result=compile_typed_graph(nat_identity());self.assertEqual(result['status'],'ready',result)
        self.assertIn('glean_expected_type',result['expectedSource']);self.assertIn('gleanTerm%',result['generatedCode']);self.assertIn('root/s',result['sourceMap'])
    def test_scope_reference_and_cycles_fail_before_elaboration(self):
        for mutation in ['foreign','cycle','duplicate','alias']:
            graph=nat_identity()
            if mutation=='foreign':graph['edges'][0]['source']='otherbranch'
            elif mutation=='cycle':graph['edges'][0]['source']='s'
            elif mutation=='duplicate':graph['nodes'].append(copy.deepcopy(graph['nodes'][0]))
            else:graph['nodes'][1]['inputs'][0]['name']='by'
            result=compile_typed_graph(graph);self.assertEqual(result['status'],'invalid',result)
    def test_natural_literals_are_exact_strings(self):
        graph=nat_identity();graph['nodes'][0]={'id':'n','kind':'nat','value':'9007199254740993'}
        result=compile_typed_graph(graph);self.assertIn('9007199254740993',result['generatedCode'])
        for value in [-1,3,'-1','1.2','01','1e3']:
            graph['nodes'][0]['value']=value;self.assertEqual(compile_typed_graph(graph)['status'],'invalid')
    def test_actual_kernel_positive_negative_and_no_fragment_breakout(self):
        service=SourceCheckService()
        try:
            for body,status in [('by rfl','valid'),('by exact True.intro','invalid'),('by sorry','incomplete'),('by exact missing','invalid'),('glean_component_1','invalid'),('by rfl\ntheorem escaped : True := True.intro','invalid')]:
                graph=nat_identity();graph['nodes'][1]['body']=body
                compiled=compile_typed_graph(graph);self.assertEqual(compiled['status'],'ready',compiled)
                result=service.start({'source':compiled['generatedCode'],'target':'glean_proof','filename':'Typed.lean','policy':'strict'},expected_source=compiled['expectedSource'])
                deadline=time.monotonic()+40
                while result['status'] not in {'valid','invalid','incomplete','error','cancelled'}:
                    self.assertLess(time.monotonic(),deadline,result);time.sleep(.05);result=service.get(result['jobId'])
                self.assertEqual(result['status'],status,result)
        finally:service.shutdown()
