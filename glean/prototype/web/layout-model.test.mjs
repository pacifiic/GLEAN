// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PANEL_IDS, AREAS, createDefaultLayout, normalizeLayout, movePanel,
  setPanelVisible, activatePanel, resizeDock, setFloatingRect, clampFloatingRect, compactDockSizes,
} from './layout-model.mjs';

const ordered = (layout, area, visibleOnly = false) => PANEL_IDS
  .filter(id => layout.panels[id].area === area && (!visibleOnly || layout.panels[id].visible))
  .sort((a, b) => layout.panels[a].order - layout.panels[b].order);

test('compact open docks reserve content space and keep the canvas controls uncovered',()=>{
 const occupied={left:true,right:true,top:false,bottom:false};
 assert.deepEqual(compactDockSizes({width:735,height:600},occupied,'right'),{left:38,right:318,top:0,bottom:0});
 const narrow=compactDockSizes({width:560,height:600},occupied,'right');assert.equal(560-narrow.left-narrow.right,240);
 const closed=compactDockSizes({width:735,height:600},occupied,null);assert.equal(closed.right,38);
});

function freeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) freeze(child);
  }
  return value;
}

test('default layout has the requested docks and initially hides help', () => {
  const layout = createDefaultLayout();
  assert.deepEqual(PANEL_IDS, ['context', 'components', 'verification', 'examples', 'source', 'help', 'modules', 'inspector']);
  assert.deepEqual(AREAS, ['left', 'right', 'top', 'bottom', 'floating']);
  assert.deepEqual(ordered(layout, 'left'), ['context', 'components']);
  assert.deepEqual(ordered(layout, 'right'), ['verification', 'examples', 'help', 'modules', 'inspector']);
  assert.deepEqual(ordered(layout, 'bottom'), ['source']);
  assert.equal(layout.panels.help.visible, false);
  assert.equal(layout.panels.modules.visible, false);
  assert.deepEqual(layout.active, { left: 'context', right: 'verification', top: null, bottom: 'source' });
  assert.deepEqual(layout.sizes, { left: 260, right: 280, top: 190, bottom: 220 });
  layout.panels.context.visible = false;
  assert.equal(createDefaultLayout().panels.context.visible, true);
});

test('unknown or incompatible persisted values restore a complete default', () => {
  for (const value of [null, [], true, '', 1, {}, { version: 2 }, { version: '1' }]) {
    assert.deepEqual(normalizeLayout(value), createDefaultLayout());
  }
  assert.deepEqual(normalizeLayout({ version: 1 }), createDefaultLayout());
});

test('normalization repairs invalid fields without dropping valid preferences', () => {
  const input = createDefaultLayout();
  input.panels.context = { area: 'ceiling', visible: 'false', order: NaN, x: -Infinity, y: '12', width: -5, height: 1e100 };
  input.panels.help = { ...input.panels.help, visible: true, area: 'top', x: 145, y: 91 };
  input.sizes = { left: '200', right: Infinity, top: -20, bottom: 90000 };
  input.active = { left: 'missing', right: 'source', top: 'help', bottom: 'help' };
  const actual = normalizeLayout(input);
  assert.equal(actual.panels.context.area, 'left');
  assert.equal(actual.panels.context.visible, true);
  assert.equal(actual.panels.context.x, createDefaultLayout().panels.context.x);
  assert.equal(actual.panels.context.y, createDefaultLayout().panels.context.y);
  assert.equal(actual.panels.context.width, 180);
  assert.equal(actual.panels.context.height, 1200);
  assert.equal(actual.panels.help.x, 145);
  assert.equal(actual.panels.help.y, 91);
  assert.deepEqual(actual.active, { left: 'context', right: 'verification', top: 'help', bottom: 'source' });
  assert.deepEqual(actual.sizes, { left: 260, right: 280, top: 120, bottom: 480 });
});

test('persisted unknown and prototype-related keys cannot enter the normalized state', () => {
  const payload = JSON.parse('{"version":1,"panels":{"__proto__":{"polluted":true},"constructor":{"area":"floating"},"context":{"area":"__proto__","visible":false,"order":0,"x":"calc(1px)","width":"100vw","extra":"<script>"}},"active":{"left":"__proto__","floating":"help"},"sizes":{"left":true},"extra":true}');
  const actual = normalizeLayout(payload);
  assert.deepEqual(Object.keys(actual), ['version', 'panels', 'active', 'sizes']);
  assert.deepEqual(Object.keys(actual.panels), [...PANEL_IDS]);
  assert.deepEqual(Object.keys(actual.panels.context), ['area', 'visible', 'order', 'x', 'y', 'width', 'height']);
  assert.equal(actual.panels.context.area, 'left');
  assert.equal(actual.panels.context.visible, false);
  assert.equal(actual.active.left, 'components');
  assert.equal(actual.sizes.left, 260);
  assert.equal(Object.prototype.polluted, undefined);
  const inherited = Object.create({ version: 1, panels: { context: { visible: false } } });
  assert.deepEqual(normalizeLayout(inherited), createDefaultLayout());
});

test('orders are compact and deterministic with duplicate and invalid persisted orders', () => {
  const input = createDefaultLayout();
  input.panels.context.order = 100;
  input.panels.components.order = 0;
  input.panels.verification.order = 42;
  input.panels.examples.order = 42;
  input.panels.help.order = Infinity;
  const actual = normalizeLayout(input);
  assert.deepEqual(ordered(actual, 'left'), ['components', 'context']);
  assert.deepEqual(ordered(actual, 'right'), ['help', 'modules', 'inspector', 'verification', 'examples']);
  for (const area of AREAS) {
    assert.deepEqual(ordered(actual, area).map(id => actual.panels[id].order), ordered(actual, area).map((_, i) => i));
  }
  assert.deepEqual(normalizeLayout(actual), actual);
});

test('moving between docks repairs the source active tab and selects the destination', () => {
  const original = freeze(createDefaultLayout());
  const actual = movePanel(original, 'context', 'right', { index: 1 });
  assert.deepEqual(ordered(actual, 'left'), ['components']);
  assert.deepEqual(ordered(actual, 'right'), ['verification', 'context', 'examples', 'help', 'modules', 'inspector']);
  assert.equal(actual.active.left, 'components');
  assert.equal(actual.active.right, 'context');
  assert.equal(actual.panels.context.visible, true);
  assert.deepEqual(original, createDefaultLayout());
});

test('dock insertion indexes refer to visible tabs while preserving hidden panel placement', () => {
  let layout = setPanelVisible(createDefaultLayout(), 'examples', false);
  layout = movePanel(layout, 'source', 'right', { index: 1 });
  assert.deepEqual(ordered(layout, 'right'), ['verification', 'examples', 'help', 'modules', 'inspector', 'source']);
  assert.deepEqual(ordered(layout, 'right', true), ['verification', 'source']);
  layout = setPanelVisible(layout, 'examples', true);
  assert.deepEqual(ordered(layout, 'right', true), ['verification', 'examples', 'source']);
  assert.equal(layout.active.right, 'examples');
});

test('reordering in one dock is stable and a move without an index retains its order', () => {
  let layout = movePanel(createDefaultLayout(), 'components', 'left', { index: 0 });
  assert.deepEqual(ordered(layout, 'left'), ['components', 'context']);
  layout = movePanel(layout, 'components', 'left');
  assert.deepEqual(ordered(layout, 'left'), ['components', 'context']);
  layout = movePanel(layout, 'components', 'left', { index: 999 });
  assert.deepEqual(ordered(layout, 'left'), ['context', 'components']);
  layout = movePanel(layout, 'components', 'left', { index: -99 });
  assert.deepEqual(ordered(layout, 'left'), ['components', 'context']);
});

test('closing and reopening preserves last dock order and floating geometry', () => {
  let layout = movePanel(createDefaultLayout(), 'context', 'floating', { x: 123, y: 222 });
  layout = setFloatingRect(layout, 'context', { width: 455, height: 366 });
  const previous = { ...layout.panels.context };
  layout = setPanelVisible(layout, 'context', false);
  assert.deepEqual(layout.panels.context, { ...previous, visible: false });
  layout = setPanelVisible(layout, 'context', true);
  assert.deepEqual(layout.panels.context, previous);
  layout = movePanel(layout, 'context', 'left', { index: 0 });
  layout = setPanelVisible(layout, 'context', false);
  assert.equal(layout.active.left, 'components');
  layout = setPanelVisible(layout, 'context', true);
  assert.deepEqual(ordered(layout, 'left'), ['context', 'components']);
  assert.equal(layout.active.left, 'context');
  assert.equal(layout.panels.context.width, 455);
});

test('the last hidden tab empties its dock active selection and reopening restores it', () => {
  const layout = setPanelVisible(createDefaultLayout(), 'source', false);
  assert.equal(layout.active.bottom, null);
  assert.equal(layout.panels.source.area, 'bottom');
  const reopened = setPanelVisible(layout, 'source', true);
  assert.equal(reopened.active.bottom, 'source');
});

test('activation changes only the selected dock tab and never reopens a hidden panel', () => {
  const original = createDefaultLayout();
  const layout = activatePanel(original, 'examples');
  assert.equal(layout.active.right, 'examples');
  assert.deepEqual(layout.panels, original.panels);
  assert.deepEqual(layout.sizes, original.sizes);
  assert.deepEqual(activatePanel(original, 'help'), original);
  assert.deepEqual(activatePanel(movePanel(original, 'source', 'floating'), 'source'), movePanel(original, 'source', 'floating'));
});

test('moving a hidden panel makes it visible and active in its new area', () => {
  const actual = movePanel(createDefaultLayout(), 'help', 'top');
  assert.equal(actual.panels.help.visible, true);
  assert.equal(actual.panels.help.area, 'top');
  assert.equal(actual.active.top, 'help');
});

test('mutators do not change a frozen input and returned nested records are detached', () => {
  const original = freeze(createDefaultLayout());
  const outputs = [
    normalizeLayout(original), movePanel(original, 'context', 'floating'),
    setPanelVisible(original, 'context', false), activatePanel(original, 'components'),
    resizeDock(original, 'left', 400), setFloatingRect(original, 'context', { x: 123 }),
  ];
  for (const output of outputs) {
    assert.notEqual(output, original);
    assert.notEqual(output.active, original.active);
    assert.notEqual(output.sizes, original.sizes);
    assert.notEqual(output.panels, original.panels);
    for (const id of PANEL_IDS) assert.notEqual(output.panels[id], original.panels[id]);
  }
});

test('invalid commands never add panels, area keys, or unsafe numbers', () => {
  const layout = createDefaultLayout();
  for (const actual of [
    movePanel(layout, '__proto__', 'left'), movePanel(layout, 'context', '__proto__'),
    setPanelVisible(layout, '__proto__', true), setPanelVisible(layout, 'context', 'false'),
    activatePanel(layout, '__proto__'), resizeDock(layout, 'floating', 999),
    resizeDock(layout, 'left', NaN), setFloatingRect(layout, '__proto__', { x: 100 }),
  ]) assert.deepEqual(actual, layout);
  assert.deepEqual(setFloatingRect(layout, 'context', { x: NaN, y: '44', width: Infinity }), layout);
});

test('resizing clamps docks by axis and preserves other dimensions', () => {
  const layout = createDefaultLayout();
  assert.deepEqual(resizeDock(layout, 'left', 800).sizes, { ...layout.sizes, left: 640 });
  assert.equal(resizeDock(layout, 'right', 20).sizes.right, 180);
  assert.equal(resizeDock(layout, 'top', 800).sizes.top, 480);
  assert.equal(resizeDock(layout, 'bottom', 20).sizes.bottom, 120);
  assert.equal(resizeDock(layout, 'left', 301.5).sizes.left, 301.5);
});

test('floating geometry updates are partial, bounded, and keep visibility and area', () => {
  const layout = setPanelVisible(createDefaultLayout(), 'context', false);
  const actual = setFloatingRect(layout, 'context', { x: -10, y: 1e50, width: 1, height: 999999 });
  assert.deepEqual(actual.panels.context, { ...layout.panels.context, x: 0, y: 100000, width: 180, height: 1200 });
  assert.equal(setFloatingRect(layout, 'context', { width: 456 }).panels.context.height, layout.panels.context.height);
  assert.equal(movePanel(layout, 'context', 'floating', { x: -30, y: 188 }).panels.context.y, 188);
});

test('viewport clamping brings the entire floating panel inside smaller bounds', () => {
  const rect = freeze({ x: 1100, y: 800, width: 500, height: 400 });
  assert.deepEqual(clampFloatingRect(rect, { width: 900, height: 600 }), { x: 400, y: 200, width: 500, height: 400 });
  assert.deepEqual(clampFloatingRect(rect, { width: 120, height: 90 }), { x: 0, y: 0, width: 120, height: 90 });
  assert.deepEqual(clampFloatingRect({ x: -100, y: -50, width: 300, height: 250 }, { width: 900, height: 600 }), { x: 0, y: 0, width: 300, height: 250 });
});

test('viewport clamping tolerates missing geometry and zero-size or malformed bounds', () => {
  for (const bounds of [null, {}, { width: NaN, height: '600' }, { width: 0, height: 0 }, { width: -20, height: Infinity }]) {
    const rect = clampFloatingRect(null, bounds);
    for (const value of Object.values(rect)) assert.equal(Number.isFinite(value), true);
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0);
  }
  assert.deepEqual(clampFloatingRect({ x: NaN, y: Infinity, width: '600', height: null }, { width: 800, height: 600 }), { x: 64, y: 64, width: 340, height: 300 });
});

test('JSON round trips retain chosen visibility, order, tabs, dock sizes and floating geometry', () => {
  let layout = movePanel(createDefaultLayout(), 'context', 'floating', { x: 200, y: 140 });
  layout = setFloatingRect(layout, 'context', { width: 600, height: 350 });
  layout = movePanel(layout, 'source', 'top');
  layout = resizeDock(layout, 'top', 285);
  layout = setPanelVisible(layout, 'examples', false);
  layout = setPanelVisible(layout, 'help', true);
  layout = activatePanel(layout, 'verification');
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(layout))), layout);
});
