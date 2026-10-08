// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import {normalizePresentation,occurrenceView,occurrenceKey} from '../../prototype/web/presentation.mjs';
const module={id:'M',nodes:[{id:'inside',kind:'nat',value:'1'}],edges:[]};
const a=[{scopeId:'root',nodeId:'callA',definitionId:'M'}],b=[{scopeId:'root',nodeId:'callB',definitionId:'M'}],key=occurrenceKey('module/M',a);
const doc={kind:'graph',graph:{nodes:[{id:'callA',kind:'module',ref:'M'},{id:'callB',kind:'module',ref:'M'}],edges:[],modules:[module]},presentation:{version:1,scopes:{},occurrenceViews:{[key]:{scopeId:'module/M',trail:b,view:{hidden:['n:inside'],containers:[]}}}}};
const normalized=normalizePresentation(doc),requested=occurrenceView(normalized.value,key,'module/M',a);
normalized.value.occurrenceViews[key]={scopeId:'module/M',trail:b,view:{hidden:['n:inside'],containers:[]}};
let liveMismatch=null;try{occurrenceView(normalized.value,key,'module/M',a);}catch(e){liveMismatch=e.message;}
console.log(JSON.stringify({warnings:normalized.warnings,recoveryPreserved:JSON.stringify(normalized.original)===JSON.stringify(doc.presentation),requestedAHidden:requested.hidden,liveMismatchRejected:!!liveMismatch,liveMismatch,expectedHidden:[]},null,2));
