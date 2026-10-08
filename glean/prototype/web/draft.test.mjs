// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DraftStore } from './draft.mjs';

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), values };
}
const document = source => ({ kind: 'lean', source, projectId: 'mathlib', fileName: 'Irrational.lean' });
const validate = doc => doc?.kind === 'lean' && typeof doc.source === 'string' ? null : 'Invalid document';

test('autosave round-trips a detached document with its saved timestamp', () => {
  const memory = storage();
  const store = new DraftStore({ storage: memory, validate, now: () => 1234 });
  assert.equal(store.load(), null);
  const source = document('example : True := by trivial');
  assert.deepEqual(store.save(source), { ok: true });
  source.source = 'changed after save';
  const loaded = store.load();
  assert.deepEqual(loaded, { document: document('example : True := by trivial'), savedAt: 1234, recoveredPrevious: false });
  loaded.document.source = 'changed after load';
  assert.equal(store.load().document.source, 'example : True := by trivial');
});

test('one atomic envelope retains current and previous recovery points', () => {
  const memory = storage();
  let tick = 0;
  const store = new DraftStore({ storage: memory, validate, now: () => ++tick });
  store.save(document('first'));
  store.save(document('second'));
  const envelope = JSON.parse(memory.getItem('glean.draft.v1'));
  assert.equal(envelope.version, 1);
  assert.equal(envelope.current.document.source, 'second');
  assert.equal(envelope.previous.document.source, 'first');
  assert.equal(memory.values.size, 1);
  assert.equal(store.load().document.source, 'second');
});

test('duplicate autosaves retain the prior distinct document', () => {
  const memory = storage();
  const store = new DraftStore({ storage: memory, validate });
  store.save(document('first')); store.save(document('second')); store.save(document('second'));
  const envelope = JSON.parse(memory.getItem('glean.draft.v1'));
  assert.equal(envelope.previous.document.source, 'first');
});

test('invalid current snapshots recover a validated prior document', () => {
  const memory = storage();
  const store = new DraftStore({ storage: memory, validate });
  store.save(document('first')); store.save(document('second'));
  const envelope = JSON.parse(memory.getItem('glean.draft.v1'));
  envelope.current.document = { kind: 'graph', graph: null };
  memory.setItem('glean.draft.v1', JSON.stringify(envelope));
  assert.equal(store.load().document.source, 'first');
  assert.equal(store.load().recoveredPrevious, true);
  store.save(document('third'));
  assert.equal(JSON.parse(memory.getItem('glean.draft.v1')).previous.document.source, 'first');
});

test('malformed or unsupported recovery data never enters the editor', () => {
  const memory = storage();
  const store = new DraftStore({ storage: memory, validate });
  for (const value of ['invalid JSON', 'null', '[]', '{"version":99,"current":{}}', JSON.stringify({ version: 1, current: { document: document('bad date'), savedAt: 'yesterday' } })]) {
    memory.setItem('glean.draft.v1', value);
    assert.equal(store.load(), null);
  }
  memory.setItem('glean.draft.v1', JSON.stringify({ version: 1, current: { document: {}, savedAt: 1 }, previous: { document: {}, savedAt: 2 } }));
  assert.equal(store.load(), null);
});

test('invalid save and quota failures leave the stored recovery point intact', () => {
  const memory = storage();
  const store = new DraftStore({ storage: memory, validate });
  store.save(document('safe'));
  const saved = memory.getItem('glean.draft.v1');
  assert.equal(store.save({ kind: 'graph' }).ok, false);
  assert.equal(memory.getItem('glean.draft.v1'), saved);
  memory.setItem = () => { throw new Error('QuotaExceededError'); };
  const result = store.save(document('unsaved'));
  assert.equal(result.ok, false);
  assert.match(result.error, /QuotaExceededError/);
  assert.equal(memory.getItem('glean.draft.v1'), saved);
  assert.equal(store.load().document.source, 'safe');
});

test('unavailable storage, clone failures, and throwing validators are recoverable', () => {
  const blocked = new DraftStore({ storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } }, validate });
  assert.equal(blocked.load(), null);
  assert.match(blocked.lastError, /blocked/);
  assert.equal(blocked.save(document('text')).ok, false);
  assert.equal(blocked.clear().ok, false);
  const memory = storage();
  const store = new DraftStore({ storage: memory, validate });
  const cyclic = document('text'); cyclic.self = cyclic;
  assert.equal(store.save(cyclic).ok, false);
  const throwing = new DraftStore({ storage: memory, validate() { throw new Error('validation failed'); } });
  assert.equal(throwing.save(document('text')).ok, false);
  assert.equal(memory.values.size, 0);
});

test('draft documents can include graph wrappers and clear removes only its own key', () => {
  const memory = storage();
  memory.setItem('glean.layout.v1', 'layout');
  const store = new DraftStore({ storage: memory, validate: doc => doc?.kind === 'graph' && doc.graph?.version === 2 ? null : 'Bad graph' });
  const graphDoc = { kind: 'graph', graph: { version: 2, modules: [], groups: [], nodes: [] } };
  assert.equal(store.save(graphDoc).ok, true);
  assert.deepEqual(store.load().document, graphDoc);
  assert.deepEqual(store.clear(), { ok: true });
  assert.equal(store.load(), null);
  assert.equal(memory.getItem('glean.layout.v1'), 'layout');
});

test('manual previous recovery is read-only and validates the candidate', () => {
  const memory = storage();
  const store = new DraftStore({ storage: memory, validate });
  assert.equal(store.recoverPrevious(), null);
  store.save(document('first')); store.save(document('second'));
  const before = memory.getItem('glean.draft.v1');
  const recovery = store.recoverPrevious();
  assert.equal(recovery.document.source, 'first');
  assert.equal(recovery.recoveredPrevious, true);
  assert.equal(memory.getItem('glean.draft.v1'), before);
  assert.equal(store.load().document.source, 'second');
  const envelope = JSON.parse(before); envelope.previous.document = {};
  memory.setItem('glean.draft.v1', JSON.stringify(envelope));
  assert.equal(store.recoverPrevious(), null);
});
