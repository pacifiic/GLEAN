"""Asynchronous source-check jobs are bounded and cannot trust submitted stdout."""
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from glean.prototype.source_check import SourceCheckService, validate_request, parse_source_diagnostics
from glean.prototype.limits import MAX_SOURCE_BYTES


class SourceRequestTests(unittest.TestCase):
    def request(self, **changes):
        return {'source':'theorem goal : True := True.intro', 'filename':'Proof.lean',
                'projectId':'glean', 'target':'goal', **changes}

    def test_valid_source_is_retained(self):
        self.assertEqual(validate_request(self.request())['target'], 'goal')

    def test_target_injection_and_file_escape_rejected(self):
        for change in [{'target':'goal\n#eval 2'}, {'target':'a;exit'}, {'filename':'../Proof.lean'},
                       {'projectId':'/tmp'}, {'source':'x' * (MAX_SOURCE_BYTES+1)}, {'target':''}]:
            with self.assertRaises(ValueError):
                validate_request(self.request(**change))

    def test_accepts_unicode_safe_lean_names(self):
        self.assertEqual(validate_request(self.request(target='Real.π_ne_zero'))['target'], 'Real.π_ne_zero')


class SourceDiagnosticTests(unittest.TestCase):
    def test_maps_zero_based_lean_column_and_multiline_message(self):
        output = ('Proof.lean:3:2: error: Type mismatch\n  hn\nhas type\n  P\n'
                  'but is expected to have type\n  False\n'
                  'Dependency.lean:4:0: warning: unrelated\n')
        result = parse_source_diagnostics(output, 'Proof.lean', line_count=5)
        self.assertEqual(len(result), 1)
        self.assertEqual((result[0]['line'], result[0]['column']), (3, 3))
        self.assertEqual(result[0]['filename'], 'Proof.lean')
        self.assertIn('False', result[0]['message'])
        self.assertNotIn('unrelated', result[0]['message'])

    def test_ignores_malformed_out_of_range_and_other_file_positions(self):
        output = ('Proof.lean:no:2: error: malformed\n'
                  'Proof.lean:0:0: error: impossible\n'
                  'Proof.lean:99:0: error: outside source\n'
                  'Proof.lean:2:-3: error: negative column\n'
                  'Other.lean:2:0: error: not our source\n'
                  "'goal' does not depend on any axioms\n")
        self.assertEqual(parse_source_diagnostics(output, 'Proof.lean', line_count=5), [])

    def test_preserves_warning_severity_and_escaped_filename(self):
        result = parse_source_diagnostics('My proof.lean:1:0: warning: declaration uses sorry\n',
                                          'My proof.lean', line_count=1)
        self.assertEqual(result[0]['severity'], 'warning')
        self.assertEqual(result[0]['column'], 1)


class SourceJobTests(unittest.TestCase):
    def request(self):
        return {'source':'theorem goal : True := True.intro','filename':'Proof.lean',
                'projectId':'glean','target':'goal'}

    def test_cancelled_job_never_becomes_verified(self):
        service = SourceCheckService(timeout_seconds=5)
        def worker(job):
            job.cancel_event.wait(2)
            service._finish(job, status='valid', verified=True)
        with patch.object(service, '_worker', side_effect=worker):
            job = service.start(self.request())
            service.cancel(job['jobId'])
            time.sleep(.05)
            result = service.get(job['jobId'])
        self.assertEqual(result['status'], 'cancelled')
        self.assertFalse(result['verified'])
        service.shutdown()

    def test_maximum_two_active_jobs(self):
        service = SourceCheckService(timeout_seconds=5)
        def worker(job):
            job.cancel_event.wait(2)
            service._finish(job, status='cancelled', verified=False)
        with patch.object(service, '_worker', side_effect=worker):
            first = service.start(self.request()); second = service.start(self.request())
            with self.assertRaises(RuntimeError):
                service.start(self.request())
            service.cancel(first['jobId']); service.cancel(second['jobId'])
        service.shutdown()

    def test_unknown_job_returns_none(self):
        self.assertIsNone(SourceCheckService().get('missing'))

    def test_subprocess_timeout_and_output_are_bounded(self):
        service = SourceCheckService(timeout_seconds=.3)
        with patch.object(service, '_worker'):
            snapshot = service.start(self.request())
        job = service._jobs[snapshot['jobId']]
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(TimeoutError):
                service._run_process(job, [sys.executable,'-c','import time; time.sleep(20)'],
                                     Path(directory), Path(directory)/'output.txt')
        service.shutdown()


class SourceIntegrationTests(unittest.TestCase):
    @unittest.skipUnless(__import__('os').environ.get('GLEAN_SOURCE_INTEGRATION') == '1',
                         'set GLEAN_SOURCE_INTEGRATION=1 for actual Lean kernel tests')
    def test_unrelated_unsafe_and_partial_prefix_helpers_do_not_break_metadata(self):
        service = SourceCheckService()
        try:
            result = service.start({
                'source': ('unsafe def glean_component_unsafe : Nat := 1\n'
                           'partial def glean_module_partial (n : Nat) : Nat := glean_module_partial n\n'
                           'theorem goal : True := True.intro\n'),
                'filename': 'Proof.lean', 'projectId': 'glean', 'target': 'goal'})
            deadline = time.monotonic() + 125
            while result['status'] not in {'valid', 'invalid', 'error', 'incomplete', 'cancelled'}:
                self.assertLess(time.monotonic(), deadline)
                time.sleep(.1)
                result = service.get(result['jobId'])
            self.assertEqual(result['status'], 'valid', result)
            self.assertTrue(result['verified'], result)
            self.assertNotIn('glean_component_unsafe', result['constantAxioms'])
            self.assertEqual(result['constantAxioms']['goal'], [])
        finally:
            service.shutdown()

    @unittest.skipUnless(__import__('os').environ.get('GLEAN_SOURCE_INTEGRATION') == '1',
                         'set GLEAN_SOURCE_INTEGRATION=1 for actual Lean kernel tests')
    def test_actual_kernel_and_axiom_boundaries(self):
        cases = [
            ('theorem goal : True := True.intro', 'standard', 'valid', True),
            ('theorem goal : True := by sorry', 'standard', 'incomplete', False),
            ('axiom invented : False\ntheorem goal : False := invented\n'
             '#eval IO.println "does not depend on any axioms"', 'standard', 'invalid', False),
            ('theorem goal (p : Prop) : p ∨ ¬ p := Classical.em p', 'standard', 'valid', True),
            ('theorem goal (p : Prop) : p ∨ ¬ p := Classical.em p', 'strict', 'invalid', False),
            ('theorem another : True := True.intro', 'standard', 'invalid', False),
            ("import Lean.Elab.Term\nopen Lean in\nrun_elab\n"
             "  modifyEnv fun env => Id.run do\n"
             "    let decl := .thmDecl { name := `goal, levelParams := [], type := .const ``False [], value := .const ``False [] }\n"
             "    let .ok env := env.addDeclCore (doCheck := false) 0 0 decl none |\n"
             "      let _ : Inhabited Environment := ⟨env⟩\n"
             "      unreachable!\n    env\n", 'standard', 'invalid', False),
        ]
        service = SourceCheckService()
        try:
            for source, policy, status, verified in cases:
                with self.subTest(source=source, policy=policy):
                    result = service.start({'source':source, 'filename':'Proof.lean',
                                            'projectId':'glean', 'target':'goal', 'policy':policy})
                    deadline = time.monotonic() + 125
                    while result['status'] not in {'valid','invalid','error','incomplete','cancelled'}:
                        self.assertLess(time.monotonic(), deadline)
                        time.sleep(.1)
                        result = service.get(result['jobId'])
                    self.assertEqual(result['status'], status, result)
                    self.assertEqual(result['verified'], verified, result)
        finally:
            service.shutdown()


class SourceDiagnosticIntegrationTests(unittest.TestCase):
    @unittest.skipUnless(__import__('os').environ.get('GLEAN_SOURCE_INTEGRATION') == '1',
                         'set GLEAN_SOURCE_INTEGRATION=1 for actual Lean diagnostics')
    def test_actual_bad_line_maps_back_to_original_filename(self):
        service = SourceCheckService()
        try:
            result = service.start({'source':'theorem goal : False := by\n  exact True.intro\n',
                                    'filename':'UserProof.lean', 'projectId':'glean', 'target':'goal'})
            deadline = time.monotonic() + 125
            while result['status'] not in {'valid','invalid','error','incomplete','cancelled'}:
                self.assertLess(time.monotonic(), deadline)
                time.sleep(.1)
                result = service.get(result['jobId'])
            self.assertEqual(result['status'], 'invalid', result)
            diagnostic = result['diagnostics'][0]
            self.assertEqual((diagnostic['line'], diagnostic['column']), (2, 3))
            self.assertEqual(diagnostic['filename'], 'UserProof.lean')
            self.assertIn('Type mismatch', diagnostic['message'])
            self.assertIn('UserProof.lean:2:2:', result['lean']['output'])
            self.assertNotIn('GleanSource', result['lean']['output'])
        finally:
            service.shutdown()
