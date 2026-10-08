// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';import assert from 'node:assert/strict';import {bodyOffset} from './code-editor.mjs';
test('Lean Unicode columns jump to UTF-16 editor positions without shifting astral characters',()=>{const body='by\n  have α𝒙 := "😺"\n  exact α𝒙\n';const row=body.split('\n')[1],column=[...row].indexOf('😺')+1,offset=bodyOffset(body,2,column);assert.equal(body.slice(offset,offset+2),'😺');assert.equal(bodyOffset(body,4,1),body.length);});
