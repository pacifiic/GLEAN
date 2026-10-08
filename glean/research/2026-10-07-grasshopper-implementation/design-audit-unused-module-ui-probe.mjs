// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {initTypedEditor} from '../../prototype/web/typed-editor.mjs';
import {typedDemo} from '../../prototype/web/typed-model.mjs';
class Element{constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.textContent='';this.style={};this.dataset={};this.listeners={};this.classes=new Set();this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),contains:c=>this.classes.has(c),toggle:(c,on)=>{if(on??!this.classes.has(c))this.classes.add(c);else this.classes.delete(c);}};}append(...children){for(const c of children){if(c&&typeof c==='object')c.parentElement=this;this.children.push(c);}}replaceChildren(...children){this.children=[];this.append(...children);}addEventListener(t,fn){(this.listeners[t]??=[]).push(fn);}setAttribute(k,v){this[k]=v;}setCustomValidity(m){this.validationMessage=m;}getBoundingClientRect(){return{left:0,top:0,width:1000,height:700};}remove(){this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}closest(selector){let n=this;while(n){if(selector==='button'&&n.tagName==='button')return n;n=n.parentElement;}return null;}async trigger(t,target=this){const e={target,preventDefault(){},stopPropagation(){this.stopped=true;},button:0,clientX:0,clientY:0};let n=this;while(n){for(const fn of n.listeners[t]??[])await fn(e);if(e.stopped)break;n=n.parentElement;}}get selectedOptions(){return this.children.filter(c=>c.selected);}dispatchEvent(e){return this.trigger(e.type);}}
const all=r=>[r,...r.children.flatMap(c=>c instanceof Element?all(c):[])],find=(r,p)=>all(r).find(p);
globalThis.document={createElement:t=>new Element(t),createElementNS:(ns,t)=>{const e=new Element(t);e.namespaceURI=ns;return e;}};globalThis.window={addEventListener(){}};

const {fixture,result}=JSON.parse(readFileSync(new URL('design-audit-unused-module-retest.json',import.meta.url),'utf8'));
const editor=initTypedEditor({host:new Element(),properties:new Element()});
editor.open({kind:'graph',graph:fixture});editor.restoreResult(result);
editor.jumpKey('root/valid/out');const root=editor.inspectionSnapshot();
editor.jumpKey('module/unfinished/proof/out');const unfinished=editor.inspectionSnapshot();
assert.equal(result.status,'valid');assert.equal(result.verified,true);
assert.equal(root.verification,'verified-document');assert.deepEqual(root.audit.axioms,[]);
assert.equal(unfinished.verification,'incomplete-component');assert.equal(unfinished.audit.hasSorry,true);
console.log(JSON.stringify({actualResult:{status:result.status,verified:result.verified,audit:result.audit},root,unfinished,passed:true},null,2));editor.close();
