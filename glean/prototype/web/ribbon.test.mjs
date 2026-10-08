// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { initRibbon } from './ribbon.mjs';

class Control extends EventTarget {
  constructor(dataset = {}) { super(); this.dataset = dataset; this.attrs = new Map(); this.hidden = false; this.disabled = false; this.focused = false; this.clicks = 0; }
  setAttribute(key, value) { this.attrs.set(key, String(value)); }
  focus() { this.focused = true; }
  click() { if (!this.disabled) { this.clicks++; this.dispatchEvent(new Event('click')); } }
}
function fixture() {
  const categories = ['all', 'params', 'logic', 'proof'].map(ribbonCategory => new Control({ ribbonCategory }));
  const groups = ['params', 'logic', 'proof'].map(ribbonGroup => new Control({ ribbonGroup }));
  const commands = ['assumption', 'context', 'verify', 'source', 'examples'].map(ribbonCommand => new Control({ ribbonCommand }));
  const targets = Object.fromEntries(['add-assumption-node', 'check-button'].map(id => [id, new Control()]));
  const doc = { querySelectorAll: selector => ({ '[data-ribbon-category]': categories, '[data-ribbon-group]': groups, '[data-ribbon-command]': commands })[selector], getElementById: id => targets[id] };
  const revealed = [];
  return { doc, categories, groups, commands, targets, revealed, workspace: { reveal: id => revealed.push(id) } };
}
test('category selection shows the matching tools and exposes the selected state', () => {
  const f = fixture(); initRibbon(f.doc, f.workspace);
  assert.ok(f.groups.every(group => !group.hidden));
  f.categories[2].click();
  assert.deepEqual(f.groups.map(group => group.hidden), [true, false, true]);
  assert.deepEqual(f.categories.map(button => button.attrs.get('aria-pressed')), ['false', 'false', 'true', 'false']);
  f.categories[0].click();
  assert.ok(f.groups.every(group => !group.hidden));
});
test('category keyboard navigation wraps and moves focus to the visible selection', () => {
  const f = fixture(); initRibbon(f.doc, f.workspace);
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value: 'ArrowLeft' });
  f.categories[0].dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(f.categories[3].focused, true);
  assert.deepEqual(f.groups.map(group => group.hidden), [true, true, false]);
});
test('commands reuse existing editor actions and reveal closed panels', () => {
  const f = fixture(); initRibbon(f.doc, f.workspace);
  f.commands.forEach(button => button.click());
  assert.equal(f.targets['add-assumption-node'].clicks, 1);
  assert.equal(f.targets['check-button'].clicks, 1);
  assert.deepEqual(f.revealed, ['context', 'source', 'examples']);
});
test('disabled editor actions cannot be triggered from the ribbon', () => {
  const f = fixture(); initRibbon(f.doc, f.workspace);
  f.targets['check-button'].disabled = true;
  f.commands[2].click();
  assert.equal(f.targets['check-button'].clicks, 0);
});
test('reinitialization does not attach duplicate command listeners', () => {
  const f = fixture();
  assert.equal(initRibbon(f.doc, f.workspace), initRibbon(f.doc, f.workspace));
  f.commands[0].click();
  assert.equal(f.targets['add-assumption-node'].clicks, 1);
});
