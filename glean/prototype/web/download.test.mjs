// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
test('downloads click an attached anchor and release DOM and object URL resources afterward',()=>{
 const source=readFileSync(new URL('./app.js',import.meta.url),'utf8'),start=source.indexOf('function download('),end=source.indexOf('\nfunction renderExamples',start),events=[],timers=[];
 const anchor={hidden:false,connected:false,click(){assert.equal(this.connected,true);assert.equal(this.download,'Original.lean');assert.equal(this.href,'blob:original');events.push('click');},remove(){this.connected=false;events.push('remove');}};
 const context={Blob,element:()=>anchor,document:{createElement:()=>anchor,body:{append(node){node.connected=true;events.push('append');}}},URL:{createObjectURL:()=> 'blob:original',revokeObjectURL:()=>events.push('revoke')},setTimeout:callback=>timers.push(callback)};
 runInNewContext(source.slice(start,end)+';download("Original.lean","theorem t : True := True.intro","text/plain");',context);
 assert.deepEqual(events,['append','click','remove']);assert.equal(anchor.connected,false);assert.equal(timers.length,1);timers[0]();assert.deepEqual(events,['append','click','remove','revoke']);
});
