// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
// Independent notebook model/storage/import checks using an actual kernel record for A.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {saveVariant,restoreVariant,normalizeNotebook,compareVariants} from '../../prototype/web/notebook.mjs';
import {parseDocument,validateDocument} from '../../prototype/web/document.mjs';
import {DraftStore} from '../../prototype/web/draft.mjs';

const actual=JSON.parse(readFileSync(new URL('declaration-results.json',import.meta.url))).cases.find(c=>c.id==='R03-Lean-reference').result;
assert.equal(actual.verified,true);assert.equal(actual.kernelAccepted,true);
const a={kind:'lean',filename:'A.lean',source:actual.generatedCode,projectId:'glean',target:'glean_proof',policy:'standard',verified:true,kernelAccepted:true};
const b={...a,filename:'B.lean',source:a.source.replace('Nat.add_zero','Nat.zero_add'),policy:'strict'};
let state=saveVariant({},'정상 A',a,actual);state=saveVariant(state,'편집 B',b,null);
const doc={...b,review:{documentId:'audit-notebook',watches:[],notebook:state}};
assert.equal(validateDocument(doc),null);
const parsed=parseDocument('glean-notebook.json',JSON.stringify(doc));
const diff=compareVariants(parsed.review.notebook);
assert.ok(diff.fields.some(c=>c.path==='source'&&c.before!==c.after));
assert.ok(diff.source.some(c=>c.before.includes('Nat.add_zero')&&c.after.includes('Nat.zero_add')));
assert.equal(diff.policyChanged,true);
const recorded=parsed.review.notebook.variants.find(v=>v.name==='정상 A').provenance;
assert.equal(recorded.sourceHash,actual.sourceHash);assert.equal(recorded.environment.environmentHash,actual.environment.environmentHash);
assert.match(recorded.environment.leanVersion,/4\.34\.1/);assert.deepEqual(recorded.audit.axioms,actual.audit.axioms);
const storage={data:new Map(),getItem(k){return this.data.get(k)??null;},setItem(k,v){this.data.set(k,v);}};
const drafts=new DraftStore({storage,validate:validateDocument});assert.equal(drafts.save(parsed).ok,true);
const recovered=drafts.load().document;assert.deepEqual(recovered.review.notebook,state);
const poisoned=structuredClone(recovered.review.notebook);for(const v of poisoned.variants){v.document.verified=true;v.document.kernelAccepted=true;v.provenance.verified=true;v.provenance.kernelAccepted=true;v.provenance.audit??={};v.provenance.audit.verified=true;v.provenance.observedStatus='valid';}
const normalized=normalizeNotebook(poisoned);const restoredA=restoreVariant(normalized,'정상 A');
assert.equal(restoredA.source,a.source);assert.equal(restoredA.verified,undefined);assert.equal(restoredA.kernelAccepted,undefined);
assert.equal(normalized.variants[0].provenance.historical,true);assert.equal(normalized.variants[0].provenance.verified,undefined);assert.equal(normalized.variants[0].provenance.audit.verified,undefined);
const report={actualRecordUsed:{verified:actual.verified,sourceHash:actual.sourceHash,environmentHash:actual.environment.environmentHash,leanVersion:actual.environment.leanVersion},
  names:normalized.variants.map(v=>v.name),diff,roundtrip:true,autoRecovery:true,poisonedGreenStripped:true,
  restoredADocument:restoredA};
writeFileSync(new URL('notebook-model-results.json',import.meta.url),JSON.stringify(report,null,2));
console.log('R14 actual provenance retention, named A/B diff, import/export, recovery, poisoned verification downgrade PASS (model only)');
