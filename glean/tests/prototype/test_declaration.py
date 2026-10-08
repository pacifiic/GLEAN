"""Declaration signatures come from the selected Lean environment, not a fixed catalog."""
import unittest
from glean.prototype.declaration import lookup_declaration
class DeclarationTests(unittest.TestCase):
    def test_actual_nat_declaration_has_ordered_binders(self):
        result=lookup_declaration('glean',[],'Nat.add_zero')
        self.assertEqual(result['name'],'Nat.add_zero');self.assertEqual(result['inputs'][0]['type'],'Nat');self.assertIn('n + 0 = n',result['outputType']);self.assertTrue(result['module'])
    def test_missing_and_injected_names_are_rejected(self):
        for name in ['Nat.not_a_declaration','Nat.add_zero\n#eval 1']:
            with self.assertRaises(ValueError):lookup_declaration('glean',[],name)
    def test_hygienic_dependent_binders_get_safe_unique_aliases(self):
        import re
        result=lookup_declaration('glean',[],'Nat.le_trans')
        names=[port['name'] for port in result['inputs']]
        self.assertEqual(len(names),len(set(names)))
        self.assertTrue(all(re.fullmatch(r"[A-Za-z][A-Za-z0-9_']*",name) for name in names),names)
        self.assertEqual([port['implicit'] for port in result['inputs']],[True,True,True,False,False])
        self.assertEqual(result['inputs'][3]['type'],'n ≤ m')
        self.assertEqual(result['inputs'][4]['type'],'m ≤ k')
        self.assertEqual(result['outputType'],'n ≤ k')
    def test_real_declaration_source_uses_the_fixed_project_lookup(self):
        from glean.prototype.declaration import declaration_source
        result=declaration_source('glean',[],'Nat.add_zero')
        self.assertTrue(result['path'].endswith('.lean'))
        self.assertGreater(result['sourceRange']['startLine'],0)
        self.assertIn('add_zero',result['source'])
        self.assertLessEqual(result['startLine'],result['sourceRange']['startLine'])
