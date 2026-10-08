// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';import assert from 'node:assert/strict';
import {validateDocument,parseDocument} from './document.mjs';
import {typedDemo} from './typed-model.mjs';
const context=()=>({version:1,module:'GleanUploadedSource',filename:'Original.lean',source:'theorem good : True := True.intro\n',sourceHash:'a'.repeat(64),environmentHash:'b'.repeat(64),projectId:'glean',declaration:'good'});
test('source-backed graph JSON saves the full raw source and restores its independent module identity',()=>{const doc={kind:'graph',graph:typedDemo()};doc.graph.sourceContext=context();assert.equal(validateDocument(doc),null);const saved=parseDocument('saved.json',JSON.stringify(doc));assert.deepEqual(saved.graph.sourceContext,doc.graph.sourceContext);});
test('invalid module paths, provenance, source limits and corrupt raw bytes are refused on restore',()=>{for(const change of [c=>c.module='../Escape',c=>c.source=42,c=>c.filename='../Original.lean',c=>c.projectId='mathlib',c=>c.environmentHash='',c=>c.sourceOrigin={decoding:'invalid-utf8'},c=>c.source='x'.repeat(8*1024*1024+1)]){const doc={kind:'graph',graph:typedDemo()};doc.graph.sourceContext=context();change(doc.graph.sourceContext);assert.ok(validateDocument(doc));}});
