# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Compound source-backed graph checks have a server-selected aggregate time budget."""
import hashlib
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import Mock, patch
from glean.prototype.source_check import SourceCheckService

SOURCE='theorem uploaded : True := True.intro'
CONTEXT={'version':1,'module':'GleanUploadedSource','filename':'Original.lean','source':SOURCE,
         'sourceHash':hashlib.sha256(SOURCE.encode()).hexdigest(),'environmentHash':'a'*64,'projectId':'glean'}
REQUEST={'source':'theorem goal : True := True.intro','filename':'Graph.lean','target':'goal','policy':'strict'}

class SourceBudgetTests(unittest.TestCase):
    def test_server_selects_120_or_360_without_client_timeout_override_or_policy_changes(self):
        service=SourceCheckService()
        with patch.object(service,'_worker',lambda job:None):
            normal=service.start({**REQUEST,'timeoutSeconds':99999})
            self.assertEqual(normal['timeoutSeconds'],120)
            compound=service.start({**REQUEST,'timeoutSeconds':99999},source_context=CONTEXT)
            self.assertEqual(compound['timeoutSeconds'],360)
            self.assertEqual(compound['policy'],'strict')
            self.assertNotIn('timeoutSeconds',service._jobs[compound['jobId']].request)
            self.assertFalse(compound['verified'])
            self.assertEqual(SourceCheckService(source_context_timeout_seconds=360).source_context_timeout_seconds,360)
            for value in (0,361,float('inf'),float('nan')):
                with self.assertRaises(ValueError):SourceCheckService(source_context_timeout_seconds=value)
            with self.assertRaises(RuntimeError):service.start(REQUEST)
        service.shutdown()
    def test_source_context_budget_is_measured_from_job_start_across_stages(self):
        service=SourceCheckService(timeout_seconds=.1,source_context_timeout_seconds=.3)
        with patch.object(service,'_worker',lambda job:None):result=service.start(REQUEST,source_context=CONTEXT)
        job=service._jobs[result['jobId']];job.started=time.monotonic()-.25
        try:
            with tempfile.TemporaryDirectory() as directory:
                started=time.monotonic()
                with self.assertRaisesRegex(TimeoutError,'0.3초'):
                    service._run_process(job,[sys.executable,'-c','import time; time.sleep(20)'],Path(directory),Path(directory)/'output.log')
                self.assertLess(time.monotonic()-started,.7)
            self.assertEqual(service.get(result['jobId'])['timeoutSeconds'],.3)
        finally:service.shutdown()

    def test_completed_kernel_result_cannot_be_published_after_the_aggregate_deadline(self):
        service=SourceCheckService(timeout_seconds=.1,source_context_timeout_seconds=.3)
        with patch.object(service,'_worker',lambda job:None):result=service.start(REQUEST,source_context=CONTEXT)
        job=service._jobs[result['jobId']];job.started=time.monotonic()-.4
        service._finish(job,status='valid',verified=True,kernelAccepted=True)
        self.assertEqual(service.get(result['jobId'])['status'],'error')
        self.assertFalse(service.get(result['jobId'])['verified'])
        service.shutdown()

    def test_repeated_termination_of_an_exited_process_group_is_harmless(self):
        child=Mock(pid=12345)
        child.poll.return_value=0
        with patch('glean.prototype.source_check.os.killpg',side_effect=PermissionError):
            SourceCheckService._stop_process(child)

    def test_permission_denied_for_a_live_process_is_not_hidden(self):
        child=Mock(pid=12345)
        child.poll.return_value=None
        with patch('glean.prototype.source_check.os.killpg',side_effect=PermissionError):
            with self.assertRaises(PermissionError):SourceCheckService._stop_process(child)

    def test_cancel_and_worker_cleanup_stop_the_same_child_only_once(self):
        service=SourceCheckService()
        with patch.object(service,'_worker',lambda job:None):result=service.start(REQUEST)
        job=service._jobs[result['jobId']];child=Mock();job.process=child
        first_entered=threading.Event();release=threading.Event()
        def stop(process):
            first_entered.set();release.wait(1)
        with patch.object(service,'_stop_process',side_effect=stop) as stopper:
            cancelling=threading.Thread(target=service.cancel,args=(result['jobId'],));cancelling.start()
            self.assertTrue(first_entered.wait(1))
            cleaning=threading.Thread(target=service._stop_job_process,args=(job,child));cleaning.start()
            release.set();cancelling.join(1);cleaning.join(1)
            self.assertFalse(cancelling.is_alive() or cleaning.is_alive())
            self.assertEqual(stopper.call_count,1)
        service.shutdown()

    def test_process_pointer_is_cleared_even_when_termination_raises(self):
        service=SourceCheckService()
        with patch.object(service,'_worker',lambda job:None):result=service.start(REQUEST)
        job=service._jobs[result['jobId']]
        with tempfile.TemporaryDirectory() as directory, patch.object(service,'_stop_process',side_effect=RuntimeError('stop failure')):
            with self.assertRaisesRegex(RuntimeError,'stop failure'):
                service._run_process(job,[sys.executable,'-c','print("done")'],Path(directory),Path(directory)/'output.log')
            self.assertIsNone(job.process)
        service.shutdown()
