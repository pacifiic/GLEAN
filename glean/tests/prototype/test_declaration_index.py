"""Current-file command analysis retains partial files and never grants verification."""
import unittest
from glean.prototype.declaration_index import DeclarationIndexService
class DeclarationIndexTests(unittest.TestCase):
    def test_invalid_analysis_request_rejects_before_a_process_and_uses_bounded_file_identity(self):
        service=DeclarationIndexService()
        for request in [{'source':'x','filename':'../Escape.lean','projectId':'glean'}, {'source':'x','filename':'File.lean','projectId':'arbitrary'}]:
            with self.assertRaises(ValueError):service.start(request)
        self.assertEqual(service._jobs,{})

    def test_actual_commands_keep_namespaces_macro_private_and_valid_declarations_after_an_error(self):
        import time,hashlib
        source='''import Lean
namespace Indexed
private def hidden : Nat := 2
macro "make_indexed" : command => `(def generated : Nat := 3)
make_indexed
theorem zero (n : Nat) : n + 0 = n := Nat.add_zero n
end Indexed
def broken : Nat := True.intro
def after_error : Nat := 4
'''
        service=DeclarationIndexService()
        try:
            result=service.start({'source':source,'filename':'Indexed.lean','projectId':'glean'});deadline=time.monotonic()+90
            while result['status'] not in {'analyzed','error','cancelled'}:
                self.assertLess(time.monotonic(),deadline);time.sleep(.1);result=service.get(result['jobId'])
            self.assertEqual(result['status'],'analyzed',result)
            self.assertFalse(result['verified']);self.assertFalse(result['kernelAccepted']);self.assertTrue(result['hasErrors'])
            items={item['name']:item for item in result['declarations']}
            self.assertTrue(any(name.startswith('Indexed.generated') for name in items));self.assertIn('after_error',items)
            self.assertTrue(any(item['private'] and name.endswith('Indexed.hidden') for name,item in items.items()))
            self.assertIn('Nat.add_zero',items['Indexed.zero']['directDependencies'])
            self.assertEqual(items['Indexed.zero']['inputs'][0]['name'],'n');self.assertIsNotNone(items['Indexed.zero']['range'])
            self.assertEqual(result['sourceHash'],hashlib.sha256(source.encode()).hexdigest())
        finally:service.shutdown()
