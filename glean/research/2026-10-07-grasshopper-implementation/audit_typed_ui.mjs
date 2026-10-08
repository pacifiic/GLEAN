// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
// Event/model probes only. These are not browser rendering or kernel acceptance evidence.
import {writeFileSync} from 'node:fs';
import {initTypedEditor} from '../../prototype/web/typed-editor.mjs';
import {typedDemo,batchCalls} from '../../prototype/web/typed-model.mjs';

class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.textContent='';this.style={};this.dataset={};this.listeners={};this.classes=new Set();this.classList={add:(c)=>this.classes.add(c),remove:(c)=>this.classes.delete(c),contains:c=>this.classes.has(c),toggle:(c,on)=>{if(on??!this.classes.has(c))this.classes.add(c);else this.classes.delete(c);}};}
  append(...children){for(const child of children){if(child&&typeof child==='object')child.parentElement=this;this.children.push(child);}}
  replaceChildren(...children){this.children=[];this.append(...children);}
  addEventListener(type,fn){this.listeners[type]=fn;}
  setAttribute(key,value){this[key]=value;}
  getBoundingClientRect(){return {left:0,top:0,width:1000,height:700};}
  remove(){this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}
  closest(){return null;}
  async trigger(type){let stopped=false;const event={target:this,preventDefault(){},stopPropagation(){stopped=true;},button:0,clientX:0,clientY:0};for(let current=this;current&&!stopped;current=current.parentElement)await current.listeners[type]?.(event);}
}
const all=root=>[root,...root.children.flatMap(c=>c instanceof Element?all(c):[])];
const find=(root,predicate)=>all(root).find(predicate);
globalThis.document={createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>{const e=new Element(tag);e.namespaceURI=ns;return e;}};
globalThis.window={addEventListener(){}};
const calls=[];
globalThis.fetch=async(path,options)=>{const body=JSON.parse(options.body);calls.push({path,body});return {ok:true,json:async()=>({status:'ready',verified:false,preview:true,generatedCode:'',sourceMap:{},diagnostics:[]})};};
const host=new Element(),properties=new Element(),statuses=[],changes=[];
const editor=initTypedEditor({host,properties,onStatus:(...s)=>statuses.push(s),onChange:()=>changes.push(editor.current())});
const output={};

editor.open({kind:'graph',graph:typedDemo()});
await find(host,n=>n.tagName==='article'&&n.dataset.id==='zero').trigger('click');
const body=find(properties,n=>n.tagName==='textarea'&&n.value==='by rfl');
body.value='by exact True.intro';await body.trigger('input');
await editor.check(true);
output.pendingBody={visibleBody:body.value,savedBody:editor.current().graph.nodes.find(n=>n.id==='zero').body,
  checkedBody:calls.at(-1).body.graph.nodes.find(n=>n.id==='zero').body,onChangeCount:changes.length};
editor.close();

const g=typedDemo();g.modules=[{id:'m',name:'M',inputs:[{id:'x',name:'x',type:'Nat'}],outputType:'Nat',
  nodes:[{id:'x',kind:'input',ref:'x'}],edges:[],result:{node:'x',output:'out'}}];
g.nodes.push({id:'call',kind:'module',ref:'m'});
editor.open({kind:'graph',graph:g});
await find(properties,n=>n.tagName==='button'&&n.textContent==='ƒ M').trigger('click');
await find(properties,n=>n.tagName==='button'&&n.textContent==='시그니처 적용').trigger('click');
output.signatureStatus={affectedCard:find(properties,n=>n.tagName==='pre'&&n.textContent.startsWith('이번 변경의 영향 호출'))?.textContent,lastVisibleStatus:statuses.at(-1)};
editor.close();

const branch={nodes:[{id:'a',kind:'nat',value:'1'},{id:'b',kind:'nat',value:'2'}],edges:[],result:{node:'a',output:'out'}};
const before=JSON.stringify(branch);
try{const created=batchCalls(branch,{kind:'module',ref:'m'},'map',[{node:'a',output:'out'},{node:'b',output:'out'}],[],['x'],'map',g);output.branchModuleBatch={accepted:true,count:created.length,sources:created.map(n=>n.provenance.items[0].node)};}
catch(error){output.branchModuleBatch={accepted:false,error:error.message,unchanged:JSON.stringify(branch)===before};}

writeFileSync(new URL('typed-ui-probe.json',import.meta.url),JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
