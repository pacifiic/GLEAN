import test from 'node:test';import assert from 'node:assert/strict';
import {ComputeGate} from './compute-gate.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('manual edits preview only and automatic edits coalesce; mode switch cancels pending work',async()=>{
 const calls=[];const gate=new ComputeGate({delay:5,run:mode=>calls.push(mode)});
 gate.changed();gate.changed();await delay(20);assert.deepEqual(calls,['preview']);
 gate.setMode('auto');gate.changed();gate.changed();await delay(20);assert.deepEqual(calls,['preview','kernel']);
 gate.changed();gate.setMode('manual');await delay(20);assert.deepEqual(calls,['preview','kernel']);
 gate.dispose();
});
test('cancel prevents delayed work',async()=>{let calls=0;const gate=new ComputeGate({delay:5,run:()=>calls++});gate.changed();gate.cancel();await delay(20);assert.equal(calls,0);});
