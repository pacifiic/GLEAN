# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Real HTTP transport/preview boundaries; this intentionally starts no Lean jobs."""
from copy import deepcopy
import hashlib
import http.client
import json
from pathlib import Path
import time
import urllib.error
import urllib.request
HERE = Path(__file__).resolve().parent
graph = json.loads((HERE/'fixtures/code-body-1m.glean.json').read_text())['graph']
cases = []
for label in ('full-1m-preview', 'over-body-limit', 'over-http-limit'):
    data = deepcopy(graph)
    if label == 'over-body-limit':
        data['nodes'][1]['body'] = 'x'*(1024*1024+1)
    elif label == 'over-http-limit':
        data['nodes'][1]['body'] = 'x'*(24*1024*1024+1)
    original = data['nodes'][1]['body']
    encoded = json.dumps({'graph':data}, ensure_ascii=False).encode()
    request = urllib.request.Request('http://127.0.0.1:8765/api/preview', data=encoded, headers={'Content-Type':'application/json'}, method='POST')
    start = time.monotonic()
    try:
        if label == 'over-http-limit':
            connection = http.client.HTTPConnection('127.0.0.1',8765,timeout=15)
            connection.putrequest('POST','/api/preview')
            connection.putheader('Content-Type','application/json')
            connection.putheader('Content-Length',str(len(encoded)))
            connection.endheaders()
            response = connection.getresponse()
            status = response.status
            result = json.loads(response.read())
            connection.close()
        else:
            with urllib.request.urlopen(request, timeout=15) as response:
                status = response.status
                result = json.loads(response.read())
    except urllib.error.HTTPError as error:
        status = error.code
        result = json.loads(error.read())
    item = {'id':label, 'requestBytes':len(encoded), 'headerOnly':label=='over-http-limit', 'bodyBytes':len(original.encode()), 'bodyHash':hashlib.sha256(original.encode()).hexdigest(), 'httpStatus':status, 'status':result.get('status'), 'verified':result.get('verified'), 'preview':result.get('preview'), 'diagnostics':result.get('diagnostics'), 'error':result.get('error'), 'wallSeconds':round(time.monotonic()-start,3), 'callerBodyUnchanged':original==data['nodes'][1]['body']}
    if label == 'full-1m-preview':
        item['fullEscapedBodyPresent'] = json.dumps(original,ensure_ascii=False) in result.get('generatedCode','')
        item['generatedBytes'] = len(result.get('generatedCode','').encode())
        item['pass'] = status==200 and result.get('status')=='ready' and result.get('verified') is False and item['fullEscapedBodyPresent']
    elif label == 'over-body-limit':
        item['pass'] = status==200 and result.get('status')=='invalid' and result.get('verified') is False and bool(result.get('diagnostics'))
    else:
        item['pass'] = status==413
    cases.append(item)
report = {'kind':'actual localhost HTTP preview/limit requests; no Lean jobs; full body and caller preservation checked', 'cases':cases}
(HERE/'long-http-preview-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
if not all(case['pass'] for case in cases):
    raise SystemExit(1)
