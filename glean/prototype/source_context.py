# Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
"""Preserved upload modules for editable declaration-call graphs."""
import base64
import hashlib
import re
from copy import deepcopy
from pathlib import Path
from .limits import MAX_SOURCE_BYTES

SOURCE_MODULE='GleanUploadedSource'
HASH=re.compile(r'[a-f0-9]{64}\Z')

def validate_source_context(context, project):
    if not isinstance(context,dict) or context.get('version')!=1 or context.get('module')!=SOURCE_MODULE:
        raise ValueError('Invalid source-backed graph module')
    source=context.get('source');filename=context.get('filename')
    if not isinstance(source,str) or not source.strip() or len(source.encode())>MAX_SOURCE_BYTES:
        raise ValueError('Preserved Lean source must be nonempty and at most 8 MiB')
    if not isinstance(filename,str) or Path(filename).name!=filename or '\\' in filename or not filename.endswith('.lean') or len(filename)>120 or any(ord(c)<32 for c in filename):
        raise ValueError('Invalid preserved source filename')
    if context.get('projectId')!=project or project not in {'glean','mathlib'}:
        raise ValueError('Preserved source project does not match the graph')
    if context.get('sourceHash')!=hashlib.sha256(source.encode()).hexdigest():
        raise ValueError('Preserved source changed: reanalyze and convert the Lean document again')
    if not isinstance(context.get('environmentHash'),str) or not HASH.fullmatch(context['environmentHash']):
        raise ValueError('Invalid preserved source environment identity')
    if context.get('policy','standard') not in {'standard','strict'}:raise ValueError('Invalid preserved source axiom policy')
    origin=context.get('sourceOrigin')
    if origin is not None:
        try:
            raw=base64.b64decode(origin['bytesBase64'],validate=True)
            if origin.get('version')!=1 or origin.get('decoding')!='utf-8' or len(raw)>MAX_SOURCE_BYTES or len(raw)!=origin.get('byteLength') or hashlib.sha256(raw).hexdigest()!=origin.get('sha256') or origin.get('bom')!=raw.startswith(b'\xef\xbb\xbf'):
                raise ValueError()
            raw.decode('utf-8',errors='strict')
        except (ValueError,KeyError,TypeError,UnicodeError) as exc:
            raise ValueError('Invalid original Lean bytes or source provenance') from exc
    return deepcopy(context)

def make_source_context(request, analysis, origin=None):
    context={'version':1,'module':SOURCE_MODULE,'filename':request['filename'],'source':request['source'],
             'projectId':request['projectId'],'sourceHash':analysis['sourceHash'],
             'environmentHash':analysis['environment']['environmentHash']}
    if origin is not None:context['sourceOrigin']=origin
    return validate_source_context(context,request['projectId'])

def source_document(context):
    return {'kind':'lean','filename':context['filename'],'source':context['source'],
            'projectId':context['projectId'],'target':context.get('declaration',''),'policy':context.get('policy','standard'),
            **({'sourceOrigin':deepcopy(context['sourceOrigin'])} if 'sourceOrigin' in context else {})}
