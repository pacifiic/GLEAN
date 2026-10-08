"""Typed graphs independently audit the intended final theorem signature."""
import time
import unittest
from glean.prototype.source_check import SourceCheckService
class ExpectedTypeTests(unittest.TestCase):
    def test_kernel_type_mismatch_cannot_become_verified(self):
        service=SourceCheckService()
        try:
            for expected,status in [('True','valid'),('False','invalid')]:
                result=service.start({'source':'theorem glean_proof : True := True.intro','filename':'Graph.lean','target':'glean_proof'},expected_source='def glean_expected_type : Prop := '+expected)
                deadline=time.monotonic()+30
                while result['status'] not in {'valid','invalid','error','cancelled','incomplete'}:
                    self.assertLess(time.monotonic(),deadline,result);time.sleep(.05);result=service.get(result['jobId'])
                self.assertEqual(result['status'],status,result)
        finally:service.shutdown()
