import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('explicit verification ensures its panel is open while automatic previews do not change docks',async()=>{
 const source=readFileSync(new URL('./app.js',import.meta.url),'utf8'),start=source.indexOf('async function checkGraph('),end=source.indexOf('\nfunction displayGraphResult',start),command=source.slice(start,end);
 for(const mode of ['typed','lean']){const opened=[],calls=[],context={mode,verificationEpoch:0,computeGate:{cancel(){}},workspace:{reveal:id=>opened.push(id)},typedEditor:{check:preview=>calls.push(preview)},leanEditor:{current:()=>null,check:()=>calls.push(false)}};runInNewContext(command+';this.execute=checkGraph;',context);await context.execute();assert.deepEqual(opened,['verification']);assert.equal(calls.length,1);opened.length=0;await context.execute(true);assert.deepEqual(opened,[]);}
});
