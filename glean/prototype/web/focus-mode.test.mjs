// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { initGraphFocus } from './focus-mode.js';

class FakeElement extends EventTarget {
  constructor(doc) {
    super();
    this.doc = doc;
    this.textContent = '전체화면';
    this.attrs = new Map();
    this.isConnected = true;
    const classes = new Set();
    this.classList = {
      toggle(name, value) { value ? classes.add(name) : classes.delete(name); },
      contains(name) { return classes.has(name); },
    };
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  removeAttribute(name) { this.attrs.delete(name); }
  focus() { this.doc.activeElement = this; }
  click() { this.dispatchEvent(new Event('click')); }
}

function fixture() {
  const doc = new EventTarget();
  doc.defaultView = { CustomEvent };
  doc.body = new FakeElement(doc);
  const button = new FakeElement(doc);
  const editor = new FakeElement(doc);
  const originalFocus = new FakeElement(doc);
  doc.activeElement = originalFocus;
  doc.fullscreenElement = null;
  doc.getElementById = id => id === 'fullscreen-button' ? button : null;
  doc.querySelector = selector => selector === '.editor-panel' ? editor : null;
  const changes = [];
  doc.addEventListener('glean:focuschange', event => changes.push(event.detail.active));
  const setFullscreen = element => {
    doc.fullscreenElement = element;
    doc.dispatchEvent(new Event('fullscreenchange'));
  };
  return { doc, button, editor, originalFocus, changes, setFullscreen };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('initialization is idempotent and does not require fullscreen support', () => {
  const f = fixture();
  const focus = initGraphFocus(f.doc);
  assert.equal(initGraphFocus(f.doc), focus);
  f.button.click();
  assert.equal(focus.active, true);
  assert.equal(f.doc.body.classList.contains('graph-focused'), true);
  assert.equal(f.button.textContent, '전체화면 닫기');
  assert.equal(f.button.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(f.changes, [true]);
  f.button.click();
  assert.equal(focus.active, false);
  assert.equal(f.button.textContent, '전체화면');
  assert.equal(f.doc.body.classList.contains('graph-focused'), false);
  assert.deepEqual(f.changes, [true, false]);
  assert.equal(f.doc.activeElement, f.originalFocus);
});

test('Escape leaves graph focus, consumes the event, and restores keyboard focus', () => {
  const f = fixture();
  const focus = initGraphFocus(f.doc);
  focus.enter();
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value: 'Escape' });
  f.doc.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(focus.active, false);
  assert.equal(f.doc.activeElement, f.originalFocus);
});
test('Escape first cancels editor interaction while preserving fullscreen, then exits',()=>{
 const f=fixture();let pending=true;
 const focus=initGraphFocus(f.doc,{cancelInteraction:()=>{const consumed=pending;pending=false;return consumed;}});focus.enter();
 const escape=()=>{const e=new Event('keydown',{cancelable:true});Object.defineProperty(e,'key',{value:'Escape'});f.doc.dispatchEvent(e);return e;};
 assert.equal(escape().defaultPrevented,true);assert.equal(focus.active,true);assert.equal(escape().defaultPrevented,true);assert.equal(focus.active,false);
});

test('native fullscreen is requested within the click and browser exit restores the workspace', async () => {
  const f = fixture();
  let requests = 0;
  f.editor.requestFullscreen = () => {
    requests++;
    f.setFullscreen(f.editor);
    return Promise.resolve();
  };
  const focus = initGraphFocus(f.doc);
  f.button.click();
  assert.equal(requests, 1);
  await settle();
  f.setFullscreen(null);
  assert.equal(focus.active, false);
  assert.deepEqual(f.changes, [true, false]);
});

test('fullscreen rejection and synchronous failure both retain usable viewport focus', async () => {
  for (const request of [() => Promise.reject(new Error('denied')), () => { throw new Error('unsupported'); }]) {
    const f = fixture();
    f.editor.requestFullscreen = request;
    const focus = initGraphFocus(f.doc);
    focus.enter();
    await settle();
    assert.equal(focus.active, true);
    assert.equal(f.doc.body.classList.contains('graph-focused'), true);
    assert.deepEqual(f.changes, [true]);
    focus.exit();
    assert.equal(focus.active, false);
  }
});

test('late native enter is undone after the user has already closed focus mode', async () => {
  const f = fixture();
  const pending = deferred();
  f.editor.requestFullscreen = () => pending.promise;
  let exits = 0;
  f.doc.exitFullscreen = () => { exits++; f.setFullscreen(null); return Promise.resolve(); };
  const focus = initGraphFocus(f.doc);
  focus.enter();
  focus.exit();
  f.setFullscreen(f.editor);
  pending.resolve();
  await settle();
  assert.equal(exits, 1);
  assert.equal(focus.active, false);
  assert.equal(f.doc.fullscreenElement, null);
});

test('closing and reopening during a pending enter honors the most recent intent', async () => {
  const f = fixture();
  const pending = deferred();
  let requests = 0;
  f.editor.requestFullscreen = () => { requests++; return pending.promise; };
  const focus = initGraphFocus(f.doc);
  focus.enter();
  focus.exit();
  focus.enter();
  f.setFullscreen(f.editor);
  pending.resolve();
  await settle();
  assert.equal(requests, 1);
  assert.equal(focus.active, true);
  assert.equal(f.doc.fullscreenElement, f.editor);
});

test('reopening during native exit keeps viewport focus after that exit completes', async () => {
  const f = fixture();
  const pendingExit = deferred();
  f.editor.requestFullscreen = () => { f.setFullscreen(f.editor); return Promise.resolve(); };
  f.doc.exitFullscreen = () => pendingExit.promise;
  const focus = initGraphFocus(f.doc);
  focus.enter();
  await settle();
  focus.exit();
  focus.enter();
  f.setFullscreen(null);
  pendingExit.resolve();
  await settle();
  assert.equal(focus.active, true);
  assert.equal(f.doc.body.classList.contains('graph-focused'), true);
});

test('failed native exit restores the exit control and matching focus state', async () => {
  const f = fixture();
  f.editor.requestFullscreen = () => { f.setFullscreen(f.editor); return Promise.resolve(); };
  f.doc.exitFullscreen = () => Promise.reject(new Error('exit denied'));
  const focus = initGraphFocus(f.doc);
  focus.enter();
  await settle();
  focus.exit();
  await settle();
  assert.equal(focus.active, true);
  assert.equal(f.button.textContent, '전체화면 닫기');
  assert.equal(f.doc.body.classList.contains('graph-focused'), true);
});

test('fullscreen owned by another element is neither requested nor exited', () => {
  const f = fixture();
  f.doc.fullscreenElement = new FakeElement(f.doc);
  f.editor.requestFullscreen = () => { assert.fail('must not replace another fullscreen element'); };
  f.doc.exitFullscreen = () => { assert.fail('must not exit another fullscreen element'); };
  const focus = initGraphFocus(f.doc);
  focus.enter();
  focus.exit();
  assert.equal(focus.active, false);
});

test('no DOM replacement, storage access, or inline layout writes are needed', () => {
  const f = fixture();
  for (const target of [f.doc, f.doc.defaultView, f.editor, f.button, f.doc.body]) {
    for (const property of ['localStorage', 'innerHTML', 'style']) {
      Object.defineProperty(target, property, {
        get() { assert.fail(`${property} read`); },
        set() { assert.fail(`${property} write`); },
      });
    }
  }
  const focus = initGraphFocus(f.doc);
  focus.enter();
  focus.exit();
});
