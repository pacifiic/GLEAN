# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Controlled budget/cancellation experiments; never invokes Lean."""
import hashlib
import json
import sys
import tempfile
import threading
import time
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request, urlopen
from glean.prototype.source_check import SourceCheckService
from glean.prototype.graph_jobs import GraphCheckService
from glean.prototype import server

SOURCE = 'theorem budget_goal : True := True.intro\n'
REQUEST = {'source': SOURCE, 'filename': 'Budget.lean', 'target': 'budget_goal', 'projectId': 'glean', 'policy': 'strict'}
CONTEXT = {'version': 1, 'module': 'GleanUploadedSource', 'source': SOURCE, 'filename': 'Budget.lean',
           'sourceHash': hashlib.sha256(SOURCE.encode()).hexdigest(), 'environmentHash': 'a'*64, 'projectId': 'glean'}

def main():
    rows = []
    def check(name, passed, evidence=None):
        row = {'case': name, 'pass': bool(passed), 'evidence': evidence}
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)

    service = SourceCheckService()
    try:
        with patch.object(service, '_worker'):
            ordinary = service.start({**REQUEST, 'timeoutSeconds': 9999})
            compound = service.start(REQUEST, source_context=CONTEXT, expected_source='def glean_expected_type := True')
            normal_job = service._jobs[ordinary['jobId']]
            compound_job = service._jobs[compound['jobId']]
            check('ordinary_budget_120_and_client_override_ignored', ordinary['timeoutSeconds'] == normal_job.timeout_seconds == 120, ordinary['timeoutSeconds'])
            check('context_budget_360_is_per_job', compound['timeoutSeconds'] == compound_job.timeout_seconds == 360 and service.timeout_seconds == 120, compound['timeoutSeconds'])
            check('strict_policy_unchanged', ordinary['policy'] == compound['policy'] == normal_job.request['policy'] == compound_job.request['policy'] == 'strict')
            rejected = []
            for value in [0, -1, 361, float('inf'), float('nan'), '360', None]:
                try:
                    SourceCheckService(source_context_timeout_seconds=value)
                except ValueError:
                    rejected.append(str(value))
            check('source_context_configuration_bounded_to_360', len(rejected) == 7, rejected)
            try:
                service.start(REQUEST)
                slot_blocked = False
            except RuntimeError:
                slot_blocked = True
            check('two_active_slots_unchanged', slot_blocked and service.max_jobs == 2)

            with tempfile.TemporaryDirectory(prefix='glean-budget-acceptance-') as directory:
                directory = Path(directory)
                command = [sys.executable, '-c', 'import time; time.sleep(.2)']
                for name, job, age, expected in [
                    ('ordinary_job_past_120_times_out', normal_job, 120.5, 'timeout'),
                    ('compound_job_past_240_still_runs', compound_job, 240.5, 'complete'),
                    ('compound_job_past_360_times_out', compound_job, 360.5, 'timeout')]:
                    job.started = time.monotonic() - age
                    started = job.started
                    try:
                        result = service._run_process(job, command, directory, directory/'output.txt')
                        actual = 'complete' if result == 0 else 'bad_exit'
                    except TimeoutError:
                        actual = 'timeout'
                    check(name, actual == expected and job.started == started and job.process is None, actual)
                service.cancel(compound['jobId'])
                try:
                    service._run_process(compound_job, command, directory, directory/'cancelled.txt')
                    interrupted = False
                except InterruptedError:
                    interrupted = True
                check('cancelled_compound_job_cannot_start_another_phase', interrupted)
                service._finish(compound_job, status='valid', verified=True)
                cancelled = service.get(compound['jobId'])
                check('late_finish_cannot_verify_cancelled_job', cancelled['status'] == 'cancelled' and cancelled['verified'] is False)
            replacement = service.start(REQUEST)
            check('cancel_releases_slot_without_changing_normal_budget', replacement['timeoutSeconds'] == 120)
    finally:
        service.shutdown()

    cancellation_service = SourceCheckService()
    try:
        with patch.object(cancellation_service, '_worker'), tempfile.TemporaryDirectory(prefix='glean-budget-cancel-') as directory:
            snapshot = cancellation_service.start(REQUEST, source_context=CONTEXT)
            job = cancellation_service._jobs[snapshot['jobId']]
            outcome = []
            def run_child():
                try:
                    outcome.append(cancellation_service._run_process(job, [sys.executable, '-c', 'import time; time.sleep(30)'], Path(directory), Path(directory)/'cancel.txt'))
                except InterruptedError:
                    outcome.append('interrupted')
                except Exception as error:
                    outcome.append({'exception': type(error).__name__, 'message': str(error)})
            runner = threading.Thread(target=run_child)
            runner.start()
            deadline = time.monotonic() + 3
            while job.process is None and runner.is_alive() and time.monotonic() < deadline:
                time.sleep(.01)
            child = job.process
            cancellation_service.cancel(snapshot['jobId'])
            runner.join(timeout=3)
            result = cancellation_service.get(snapshot['jobId'])
            check('cancel_stops_running_compound_child_process', child is not None and child.poll() is not None and not runner.is_alive()
                and job.process is None and result['status'] == 'cancelled' and result['verified'] is False, outcome)
    finally:
        cancellation_service.shutdown()

    http_service = SourceCheckService()
    graph_service = GraphCheckService(http_service)
    httpd = server.create_server(port=0)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        with patch.object(http_service, '_worker'), patch.object(server, 'SOURCE_CHECKS', http_service), patch.object(server, 'GRAPH_CHECKS', graph_service):
            endpoint = 'http://127.0.0.1:' + str(httpd.server_address[1])
            def post(route, data):
                request = Request(endpoint+route, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'}, method='POST')
                with urlopen(request, timeout=5) as response:
                    result = json.load(response)
                http_service.cancel(result['jobId'])
                return result
            result = post('/api/lean/check/start', {**REQUEST, 'timeoutSeconds': 360, 'sourceContext': CONTEXT})
            check('raw_source_POST_cannot_select_compound_budget', result['timeoutSeconds'] == 120 and result['policy'] == 'strict', result['timeoutSeconds'])
            graph = {'version': 3, 'name': 'budget', 'projectId': 'glean', 'imports': [], 'policy': 'strict', 'inputs': [], 'goal': 'True', 'modules': [],
                'nodes': [{'id': 'call', 'kind': 'script', 'inputs': [], 'outputType': 'True', 'body': 'True.intro', 'x': 0, 'y': 0}],
                'edges': [], 'result': {'node': 'call', 'output': 'out'}, 'timeoutSeconds': 360}
            result = post('/api/graph/check/start', {'graph': graph, 'timeoutSeconds': 360})
            check('ordinary_graph_POST_cannot_select_compound_budget', result['timeoutSeconds'] == 120 and result['policy'] == 'strict', result['timeoutSeconds'])
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=2)
        http_service.shutdown()

    result = {'kind': 'controlled budget acceptance; no Lean invocation', 'passed': sum(row['pass'] for row in rows), 'total': len(rows), 'cases': rows}
    Path(__file__).with_name('budget-acceptance-360s-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    if not all(row['pass'] for row in rows):
        raise SystemExit(1)

if __name__ == '__main__':
    main()
