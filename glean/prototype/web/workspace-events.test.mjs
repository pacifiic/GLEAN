// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('outside pointerdown does not move canvas buttons before their click fires',()=>{
 const source=fs.readFileSync(new URL('./workspace.js',import.meta.url),'utf8'),listeners={},state={updates:0};
 const extract=type=>{const marker=`  document.addEventListener('${type}', event => {`,start=source.lastIndexOf(marker);assert.ok(start>=0,type+' listener exists');return source.slice(start,start+source.slice(start).indexOf('\n  });')+7);};
 const context={document:{addEventListener:(type,fn)=>listeners[type]=fn},state,updateGeometry:()=>state.updates++,closePopover(){},popover:null,popoverAnchor:null};
 vm.runInNewContext("let compactArea='right',compactOpenPending=false;"+extract('pointerdown')+extract('click'),context);
 const event={target:{closest:()=>null}};listeners.pointerdown(event);assert.equal(state.updates,0);listeners.click(event);assert.equal(state.updates,1);
});
test('dock activation consumes the detached original tab click and an explicit reveal remains open for that click',()=>{
 const source=fs.readFileSync(new URL('./workspace.js',import.meta.url),'utf8'),start=source.indexOf("        tab.addEventListener('click'"),end=source.indexOf("        tab.addEventListener('pointerdown'",start),listeners={},state={stopped:false,updated:0};
 const context={tab:{addEventListener:(type,fn)=>listeners[type]=fn},drag:null,compact:true,compactArea:null,area:'left',selected:true,layout:{},id:'context',activatePanel:()=>({}),change(){},focusTab(){}};
 vm.runInNewContext(source.slice(start,end),context);listeners.click({stopPropagation:()=>state.stopped=true});assert.equal(state.stopped,true);assert.equal(context.compactArea,'left');
 const clickStart=source.lastIndexOf("  document.addEventListener('click', event => {"),clickEnd=source.indexOf('\n  });',clickStart)+7;
 vm.runInNewContext("let compactArea='left',compactOpenPending=true;"+source.slice(clickStart,clickEnd),{document:{addEventListener:(type,fn)=>listeners[type]=fn},updateGeometry:()=>state.updated++});listeners.click({target:{closest:()=>null}});assert.equal(state.updated,0);
});
test('a compact panel stays open after a ribbon command even when the pending microtask has completed',()=>{const source=fs.readFileSync(new URL('./workspace.js',import.meta.url),'utf8'),start=source.lastIndexOf("  document.addEventListener('click', event => {"),end=source.indexOf('\n  });',start)+7,listeners={},state={updated:0};vm.runInNewContext("let compactArea='left',compactOpenPending=false;"+source.slice(start,end),{document:{addEventListener:(type,fn)=>listeners[type]=fn},updateGeometry:()=>state.updated++});listeners.click({target:{closest:selector=>selector.includes('[data-ribbon-command]')?{}:null}});assert.equal(state.updated,0);});
