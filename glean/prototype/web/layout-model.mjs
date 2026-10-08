// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
export const PANEL_IDS = Object.freeze(['context', 'components', 'verification', 'examples', 'source', 'help', 'modules', 'inspector']);
export const AREAS = Object.freeze(['left', 'right', 'top', 'bottom', 'floating']);
const DOCKS = AREAS.filter(area => area !== 'floating');
const DEFAULT_SIZES = { left: 260, right: 280, top: 190, bottom: 220 };
const DEFAULT_RECT = { x: 64, y: 64, width: 340, height: 300 };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key, fallback) => record(value) && Object.hasOwn(value, key) ? value[key] : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const bounded = (value, fallback, min, max) => Number.isFinite(value) ? clamp(value, min, max) : fallback;
const sorted = (layout, area) => PANEL_IDS.filter(id => layout.panels[id].area === area)
  .sort((a, b) => layout.panels[a].order - layout.panels[b].order);

function geometry(value, fallback = DEFAULT_RECT) {
  return {
    x: bounded(own(value, 'x'), fallback.x, 0, 100000),
    y: bounded(own(value, 'y'), fallback.y, 0, 100000),
    width: bounded(own(value, 'width'), fallback.width, 180, 1600),
    height: bounded(own(value, 'height'), fallback.height, 120, 1200),
  };
}

function dockSize(area, value, fallback) {
  const horizontal = area === 'left' || area === 'right';
  return bounded(value, fallback, horizontal ? 180 : 120, horizontal ? 640 : 480);
}

function repairTabs(layout) {
  for (const area of DOCKS) {
    const visible = sorted(layout, area).filter(id => layout.panels[id].visible);
    if (!visible.includes(layout.active[area])) layout.active[area] = visible[0] ?? null;
  }
  return layout;
}

function renumber(layout, area, ids = sorted(layout, area)) {
  ids.forEach((id, order) => { layout.panels[id].order = order; });
}

export function createDefaultLayout() {
  const placements = {
    context: ['left', 0], components: ['left', 1], verification: ['right', 0],
    examples: ['right', 1], source: ['bottom', 0], help: ['right', 2], modules: ['right', 3], inspector: ['right', 4],
  };
  return {
    version: 1,
    panels: Object.fromEntries(PANEL_IDS.map((id, index) => [id, {
      area: placements[id][0], visible: !['help', 'modules', 'inspector'].includes(id), order: placements[id][1],
      ...DEFAULT_RECT, x: DEFAULT_RECT.x + index * 24, y: DEFAULT_RECT.y + index * 24,
    }])),
    active: { left: 'context', right: 'verification', top: null, bottom: 'source' },
    sizes: { ...DEFAULT_SIZES },
  };
}

/** Normalize parsed JSON into a detached, fixed-schema layout. */
export function normalizeLayout(value) {
  const layout = createDefaultLayout();
  if (own(value, 'version') !== 1) return layout;
  const panels = own(value, 'panels');
  const active = own(value, 'active');
  const sizes = own(value, 'sizes');
  for (const id of PANEL_IDS) {
    const stored = own(panels, id);
    const fallback = layout.panels[id];
    const area = own(stored, 'area');
    const visible = own(stored, 'visible');
    layout.panels[id] = {
      area: AREAS.includes(area) ? area : fallback.area,
      visible: typeof visible === 'boolean' ? visible : fallback.visible,
      order: Math.trunc(bounded(own(stored, 'order'), fallback.order, 0, 100000)),
      ...geometry(stored, fallback),
    };
  }
  for (const area of AREAS) renumber(layout, area);
  for (const area of DOCKS) {
    layout.sizes[area] = dockSize(area, own(sizes, area), DEFAULT_SIZES[area]);
    const selected = own(active, area, layout.active[area]);
    layout.active[area] = PANEL_IDS.includes(selected) ? selected : null;
  }
  return repairTabs(layout);
}

/** The insertion index counts visible destination tabs after removing this panel. */
export function movePanel(value, id, area, options = {}) {
  const layout = normalizeLayout(value);
  if (!PANEL_IDS.includes(id) || !AREAS.includes(area)) return layout;
  const panel = layout.panels[id];
  const previousArea = panel.area;
  const requestedIndex = own(options, 'index');
  const reorder = previousArea !== area || Number.isFinite(requestedIndex);
  panel.area = area;
  panel.visible = true;
  if (area === 'floating') {
    panel.x = bounded(own(options, 'x'), panel.x, 0, 100000);
    panel.y = bounded(own(options, 'y'), panel.y, 0, 100000);
  }
  if (reorder) {
    const ids = sorted(layout, area).filter(other => other !== id);
    const visible = ids.filter(other => layout.panels[other].visible);
    const index = Number.isFinite(requestedIndex) ? clamp(Math.trunc(requestedIndex), 0, visible.length) : visible.length;
    const before = visible[index];
    ids.splice(before === undefined ? ids.length : ids.indexOf(before), 0, id);
    renumber(layout, area, ids);
  }
  if (previousArea !== area) renumber(layout, previousArea);
  if (DOCKS.includes(area)) layout.active[area] = id;
  return repairTabs(layout);
}

export function setPanelVisible(value, id, visible) {
  const layout = normalizeLayout(value);
  if (!PANEL_IDS.includes(id) || typeof visible !== 'boolean') return layout;
  const panel = layout.panels[id];
  panel.visible = visible;
  if (visible && DOCKS.includes(panel.area)) layout.active[panel.area] = id;
  return repairTabs(layout);
}

export function activatePanel(value, id) {
  const layout = normalizeLayout(value);
  if (!PANEL_IDS.includes(id)) return layout;
  const panel = layout.panels[id];
  if (panel.visible && DOCKS.includes(panel.area)) layout.active[panel.area] = id;
  return layout;
}

export function resizeDock(value, area, pixels) {
  const layout = normalizeLayout(value);
  if (DOCKS.includes(area)) layout.sizes[area] = dockSize(area, pixels, layout.sizes[area]);
  return layout;
}

export function setFloatingRect(value, id, rect) {
  const layout = normalizeLayout(value);
  if (PANEL_IDS.includes(id)) Object.assign(layout.panels[id], geometry(rect, layout.panels[id]));
  return layout;
}

/** Fit even below panel minima when the viewport is too small to hold them. */
export function clampFloatingRect(value, bounds) {
  const rect = geometry(value);
  const width = bounded(own(bounds, 'width'), 1024, 1, 100000);
  const height = bounded(own(bounds, 'height'), 768, 1, 100000);
  rect.width = Math.min(rect.width, width);
  rect.height = Math.min(rect.height, height);
  rect.x = clamp(rect.x, 0, width - rect.width);
  rect.y = clamp(rect.y, 0, height - rect.height);
  return rect;
}

export function compactDockSizes({width,height},occupied,openArea){
 const sizes=Object.fromEntries(['left','right','top','bottom'].map(area=>[area,occupied[area]?(area==='left'||area==='right'?38:34):0]));
 if(openArea&&occupied[openArea]){const side=openArea==='left'||openArea==='right',available=side?width-sizes.left-sizes.right-240:height-sizes.top-sizes.bottom-180;sizes[openArea]+=Math.max(0,Math.min(side?280:330,available));}
 return sizes;
}
