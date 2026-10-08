"""Lean document endpoints preserve the loopback boundary and validate requests."""
import http.client
import json
import threading
import unittest
from unittest.mock import patch
from glean.prototype import server

class LeanHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd=server.create_server(port=0);cls.port=cls.httpd.server_address[1]
        cls.worker=threading.Thread(target=cls.httpd.serve_forever,daemon=True);cls.worker.start()
    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown();cls.httpd.server_close();cls.worker.join()
    def request(self,path,body=None,headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.port,timeout=20)
        conn.request('GET' if body is None else 'POST',path,body=None if body is None else json.dumps(body),headers=headers or {'Content-Type':'application/json'})
        response=conn.getresponse();result=(response.status,json.loads(response.read()));conn.close();return result
    def test_fixed_project_profiles_and_pi_reference(self):
        status,data=self.request('/api/lean/projects');self.assertEqual(status,200)
        self.assertEqual({p['id'] for p in data['projects']},{'glean','mathlib'})
        status,data=self.request('/api/lean/reference/pi');self.assertEqual(status,200)
        self.assertEqual(data['filename'],'Irrational.lean');self.assertEqual(len(data['source'].splitlines()),311)
        self.assertEqual(data['target'],'irrational_pi')
    def test_lean_routes_reject_foreign_origins_and_bad_input(self):
        status,_=self.request('/api/lean/open',{}, {'Content-Type':'application/json','Origin':'https://outside.example'})
        self.assertEqual(status,403)
        status,data=self.request('/api/lean/open',{'projectId':'../../etc','source':'x','filename':'x.lean'})
        self.assertEqual(status,400);self.assertFalse(data.get('verified',False))
        status,data=self.request('/api/lean/context',{'sessionId':'missing','line':0,'character':0,'version':1})
        self.assertEqual(status,404)
        self.assertEqual(data['code'],'not_found')
    def test_job_start_poll_cancel_routes(self):
        with patch.object(server.SOURCE_CHECKS,'start',return_value={'jobId':'test','status':'queued'}) as start:
            status,data=self.request('/api/lean/check/start',{'source':'x'})
            self.assertEqual(status,200);self.assertEqual(data['jobId'],'test');start.assert_called_once()
        with patch.object(server.SOURCE_CHECKS,'get',return_value={'jobId':'test','status':'running'}):
            self.assertEqual(self.request('/api/lean/check/poll',{'jobId':'test'})[1]['status'],'running')
        with patch.object(server.SOURCE_CHECKS,'cancel',return_value={'jobId':'test','status':'cancelled'}):
            self.assertEqual(self.request('/api/lean/check/cancel',{'jobId':'test'})[1]['status'],'cancelled')
    def test_unknown_graph_scope_is_rejected(self):
        status,data=self.request('/api/check',{'graph':{},'scope':'skip-validation'})
        self.assertEqual(status,400)
        self.assertFalse(data.get('verified',False))
