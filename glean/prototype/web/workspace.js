/* Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0. */
import {
  PANEL_IDS, createDefaultLayout, normalizeLayout, movePanel, setPanelVisible,
  activatePanel, resizeDock, setFloatingRect, clampFloatingRect, compactDockSizes,
} from './layout-model.mjs';

const STORAGE_KEY = 'glean.workspace.v1';
const DOCKS = ['left', 'right', 'top', 'bottom'];
const AREA_NAMES = {left:'왼쪽', right:'오른쪽', top:'위쪽', bottom:'아래쪽', floating:'떠 있는 창'};
const PANELS = {
  context:{label:'가정과 목표', icon:'∀'}, components:{label:'논리 도구', icon:'◇'},
  verification:{label:'증명 확인', icon:'✓'}, examples:{label:'예제', icon:'▧'},
  source:{label:'Lean 코드', icon:'⌘'}, help:{label:'사용 안내', icon:'?'},
  modules:{label:'모듈 라이브러리', icon:'ƒ'}, inspector:{label:'Inspector / Watch', icon:'◉'},
};
let workspaceInstance;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(className, text, label) {
  const node = element('button', className, text);
  node.type = 'button';
  if (label) { node.setAttribute('aria-label', label); node.title = label; }
  return node;
}

export function initWorkspace() {
  if (workspaceInstance) return workspaceInstance;
  const workspace = document.querySelector('.workspace');
  if (!workspace) return null;
  const editor = workspace.querySelector('.editor-panel');
  const content = new Map(PANEL_IDS.map(id => [id, workspace.querySelector(`[data-panel="${id}"]`)]));
  if (!editor || [...content.values()].some(node => !node)) return null;
  let layout;
  try { layout = normalizeLayout(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { layout = createDefaultLayout(); }
  let compact = false;
  let compactArea = null;
  let compactOpenPending = false;
  let popover = null;
  let popoverAnchor = null;
  let drag = null;
  let interaction = null;
  let front = 10;
  const shells = new Map();
  const zones = new Map();
  const floats = element('div', 'workspace-floats');
  const parking = element('div', 'workspace-parking');
  parking.hidden = true;
  const dropLayer = element('div', 'dock-drop-layer');
  dropLayer.hidden = true;
  dropLayer.setAttribute('aria-hidden', 'true');
  const dropTargets = new Map();
  const announcer = element('div', 'workspace-sr-only');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  workspace.classList.add('dock-workspace');

  function persist() {
    if (document.body.classList.contains('graph-focused')) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch { /* Private browsing may disable storage. */ }
  }
  function visibleIn(area) {
    return PANEL_IDS.filter(id => layout.panels[id].visible && layout.panels[id].area === area)
      .sort((a, b) => layout.panels[a].order - layout.panels[b].order);
  }
  function announce(message) { announcer.textContent = message; }
  function change(next, message, openArea) {
    layout = next;
    if (compact && openArea) {compactArea = DOCKS.includes(openArea) ? openArea : null;compactOpenPending=true;queueMicrotask(()=>compactOpenPending=false);}
    render();
    persist();
    if (message) announce(message);
  }
  function hidePanel(id) {
    closePopover();
    change(setPanelVisible(layout, id, false), `${PANELS[id].label} 패널을 닫았습니다. 패널 메뉴에서 다시 열 수 있습니다.`);
    document.getElementById('panels-button')?.focus({preventScroll:true});
  }
  function relocate(id, area, options = {}) {
    closePopover();
    change(movePanel(layout, id, area, options), `${PANELS[id].label}: ${AREA_NAMES[area]}으로 이동했습니다.`, area);
  }
  function focusTab(id) {
    workspace.querySelector(`.dock-tab[data-panel-id="${id}"]`)?.focus({preventScroll:true});
  }

  for (const area of DOCKS) {
    const zone = element('section', `dock-zone dock-${area}`);
    zone.dataset.dockArea = area;
    zone.setAttribute('aria-label', `${AREA_NAMES[area]} 패널`);
    const bar = element('div', 'dock-bar');
    const tabs = element('div', 'dock-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', `${AREA_NAMES[area]} 패널 탭`);
    const actions = element('div', 'dock-actions');
    const menu = button('dock-icon-button', '⋯', `${AREA_NAMES[area]} 활성 패널 이동 메뉴`);
    menu.setAttribute('aria-haspopup', 'dialog');
    menu.addEventListener('click', () => { if (layout.active[area]) showPanelMenu(layout.active[area], menu); });
    const close = button('dock-icon-button dock-close', '×', `${AREA_NAMES[area]} 활성 패널 닫기`);
    close.addEventListener('click', () => { if (compact && compactArea === area) { compactArea = null; updateGeometry(); } else if (layout.active[area]) hidePanel(layout.active[area]); });
    actions.append(menu, close);
    bar.append(tabs, actions);
    const pages = element('div', 'dock-pages');
    zone.append(bar, pages);
    workspace.append(zone);
    const splitter = element('div', `dock-splitter splitter-${area}`);
    splitter.tabIndex = 0;
    splitter.setAttribute('role', 'separator');
    splitter.setAttribute('aria-label', `${AREA_NAMES[area]} 패널 크기`);
    splitter.setAttribute('aria-orientation', area === 'left' || area === 'right' ? 'vertical' : 'horizontal');
    splitter.addEventListener('pointerdown', event => beginDockResize(event, area));
    splitter.addEventListener('keydown', event => {
      const vertical = area === 'left' || area === 'right';
      const decrease = vertical ? 'ArrowLeft' : 'ArrowUp';
      const increase = vertical ? 'ArrowRight' : 'ArrowDown';
      if (![decrease, increase, 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const sign = area === 'right' || area === 'bottom' ? -1 : 1;
      const delta = (event.key === increase ? 1 : -1) * sign * (event.shiftKey ? 50 : 10);
      const value = event.key === 'Home' ? 0 : event.key === 'End' ? 10000 : layout.sizes[area] + delta;
      layout = resizeDock(layout, area, value);
      updateGeometry();
      persist();
    });
    workspace.append(splitter);
    zones.set(area, {zone, bar, tabs, pages, menu, close, splitter});
  }

  for (const id of PANEL_IDS) {
    const shell = element('div', 'workspace-panel');
    shell.id = `workspace-panel-${id}`;
    shell.dataset.panelId = id;
    shell.setAttribute('role', 'tabpanel');
    shell.setAttribute('aria-label', PANELS[id].label);
    const titlebar = element('div', 'floating-titlebar');
    const handle = element('div', 'floating-handle');
    handle.tabIndex = 0;
    handle.setAttribute('role', 'button');
    handle.setAttribute('aria-label', `${PANELS[id].label} 창 이동. 방향키로 이동, Enter로 위치 메뉴 열기`);
    const grip = element('span', 'dock-grip', '⠿');
    grip.setAttribute('aria-hidden', 'true');
    handle.append(grip, element('span', 'floating-title', PANELS[id].label));
    handle.addEventListener('pointerdown', event => beginDrag(event, id, handle));
    handle.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showPanelMenu(id, handle); return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 50 : 10;
      const panel = clampFloatingRect(layout.panels[id], bounds());
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      layout = setFloatingRect(layout, id, clampFloatingRect({...panel, x:panel.x + dx, y:panel.y + dy}, bounds()));
      updateGeometry(); persist();
    });
    const menu = button('dock-icon-button', '⋯', `${PANELS[id].label} 이동 메뉴`);
    menu.setAttribute('aria-haspopup', 'dialog');
    menu.addEventListener('click', () => showPanelMenu(id, menu));
    const close = button('dock-icon-button dock-close', '×', `${PANELS[id].label} 패널 닫기`);
    close.addEventListener('click', () => hidePanel(id));
    titlebar.append(handle, menu, close);
    const scroll = element('div', 'workspace-panel-content');
    scroll.append(content.get(id));
    const resize = element('div', 'floating-resize');
    resize.tabIndex = 0;
    resize.setAttribute('role', 'separator');
    resize.setAttribute('aria-label', `${PANELS[id].label} 창 크기. 방향키로 너비와 높이 조절`);
    resize.addEventListener('pointerdown', event => beginFloatingResize(event, id));
    resize.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 50 : 10;
      const panel = clampFloatingRect(layout.panels[id], bounds());
      const width = panel.width + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0);
      const height = panel.height + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
      layout = setFloatingRect(layout, id, clampFloatingRect({...panel, width, height}, bounds()));
      updateGeometry(); persist();
    });
    shell.append(titlebar, scroll, resize);
    shell.addEventListener('pointerdown', () => { if (layout.panels[id].area === 'floating') shell.style.zIndex = ++front; });
    shells.set(id, {shell, titlebar, resize});
    parking.append(shell);
  }
  workspace.querySelector('.left-panel')?.remove();
  workspace.querySelector('.right-panel')?.remove();
  for (const area of [...DOCKS, 'floating']) {
    const target = element('div', `dock-drop-target drop-${area}`);
    target.dataset.dropArea = area;
    target.append(element('span', 'drop-icon', {left:'◧', right:'◨', top:'⬒', bottom:'⬓', floating:'▣'}[area]), element('span', '', AREA_NAMES[area]));
    dropLayer.append(target);
    dropTargets.set(area, target);
  }
  workspace.append(floats, parking, dropLayer, announcer);

  function render() {
    const focused = document.activeElement;
    for (const area of DOCKS) {
      const dock = zones.get(area);
      const ids = visibleIn(area);
      dock.zone.hidden = ids.length === 0;
      dock.splitter.hidden = ids.length === 0;
      const tabs = ids.map(id => {
        const selected = layout.active[area] === id;
        const tab = button('dock-tab', '', PANELS[id].label);
        tab.id = `workspace-tab-${id}`;
        tab.dataset.panelId = id;
        tab.dataset.area = area;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(selected));
        tab.setAttribute('aria-controls', `workspace-panel-${id}`);
        tab.tabIndex = selected ? 0 : -1;
        const icon = element('span', 'dock-tab-icon', PANELS[id].icon);
        icon.setAttribute('aria-hidden', 'true');
        tab.append(icon, element('span', 'dock-tab-label', PANELS[id].label));
        tab.title = `${PANELS[id].label} · 끌어서 이동`;
        tab.addEventListener('click', event => {
          if (drag?.started) return;
          event.stopPropagation();
          compactArea = compact ? (compactArea === area && selected ? null : area) : null;
          change(activatePanel(layout, id));
          focusTab(id);
        });
        tab.addEventListener('pointerdown', event => beginDrag(event, id, tab));
        tab.addEventListener('keydown', event => {
          const previous = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
          const next = event.key === 'ArrowRight' || event.key === 'ArrowDown';
          if (!previous && !next && event.key !== 'Home' && event.key !== 'End') return;
          event.preventDefault();
          const index = ids.indexOf(id);
          const nextId = ids[event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : (index + (previous ? -1 : 1) + ids.length) % ids.length];
          change(activatePanel(layout, nextId), null, area);
          focusTab(nextId);
        });
        return tab;
      });
      dock.tabs.replaceChildren(...tabs);
      if (compactArea === area && !ids.length) compactArea = null;
    }
    for (const id of PANEL_IDS) {
      const panel = layout.panels[id];
      const {shell} = shells.get(id);
      const floating = panel.visible && panel.area === 'floating';
      const parent = !panel.visible ? parking : floating ? floats : zones.get(panel.area).pages;
      if (shell.parentElement !== parent) parent.append(shell);
      shell.classList.toggle('is-floating', floating);
      shell.hidden = !panel.visible || (!floating && layout.active[panel.area] !== id);
      if (floating) {
        shell.setAttribute('role', 'region');
        shell.removeAttribute('aria-labelledby');
        if (!shell.style.zIndex) shell.style.zIndex = ++front;
      } else {
        shell.setAttribute('role', 'tabpanel');
        shell.setAttribute('aria-labelledby', `workspace-tab-${id}`);
      }
    }
    updateGeometry();
    if (focused?.isConnected && document.activeElement !== focused && !focused.hidden && !focused.closest('[hidden]')) focused.focus({preventScroll:true});
  }

  function bounds() { return {width:workspace.clientWidth, height:workspace.clientHeight}; }
  function updateGeometry() {
    const {width, height} = bounds();
    compact = width < 920;
    workspace.classList.toggle('workspace-compact', compact);
    const occupied = Object.fromEntries(DOCKS.map(area => [area, visibleIn(area).length > 0]));
    const desired = Object.fromEntries(DOCKS.map(area => [area, occupied[area] ? layout.sizes[area] : 0]));
    const horizontal = desired.left + desired.right;
    const vertical = desired.top + desired.bottom;
    const sideBudget = Math.max(0, width - 380 - (occupied.left ? 5 : 0) - (occupied.right ? 5 : 0));
    const heightBudget = Math.max(0, height - 270 - (occupied.top ? 5 : 0) - (occupied.bottom ? 5 : 0));
    const hScale = horizontal ? Math.min(1, sideBudget / horizontal) : 1;
    const vScale = vertical ? Math.min(1, heightBudget / vertical) : 1;
    const compactSizes=compactDockSizes({width,height},occupied,compactArea);
    for (const area of DOCKS) {
      const side = area === 'left' || area === 'right';
      const pixels = compact ? compactSizes[area] : Math.round(desired[area] * (side ? hScale : vScale));
      workspace.style.setProperty(`--dock-${area}`, `${pixels}px`);
      workspace.style.setProperty(`--split-${area}`, occupied[area] && !compact ? '5px' : '0px');
      const dock = zones.get(area);
      dock.zone.classList.toggle('compact-open', compact && compactArea === area);
      dock.splitter.hidden = !occupied[area] || compact;
      dock.splitter.setAttribute('aria-valuemin', side ? '180' : '120');
      dock.splitter.setAttribute('aria-valuemax', side ? '640' : '480');
      dock.splitter.setAttribute('aria-valuenow', String(Math.round(layout.sizes[area])));
      dock.splitter.setAttribute('aria-valuetext', `${pixels} 픽셀`);
      const closeLabel = compact ? `${AREA_NAMES[area]} 패널 접기` : `${AREA_NAMES[area]} 활성 패널 닫기`;
      dock.close.setAttribute('aria-label', closeLabel);
      dock.close.title = closeLabel;
      dock.tabs.setAttribute('aria-orientation', compact && side ? 'vertical' : 'horizontal');
    }
    for (const id of visibleIn('floating')) {
      const {shell} = shells.get(id);
      const rect = clampFloatingRect(layout.panels[id], {width, height});
      Object.assign(shell.style, {left:`${rect.x}px`, top:`${rect.y}px`, width:`${rect.width}px`, height:`${rect.height}px`});
      shells.get(id).resize.setAttribute('aria-valuetext', `너비 ${Math.round(rect.width)}, 높이 ${Math.round(rect.height)} 픽셀`);
    }
    if (popover) positionPopover();
  }

  function closePopover(restoreFocus = false) {
    if (!popover) return;
    const anchor = popoverAnchor;
    popover.remove(); popover = null; popoverAnchor = null;
    anchor?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && anchor?.isConnected) anchor.focus({preventScroll:true});
  }
  function positionPopover() {
    if (!popover || !popoverAnchor?.isConnected) return;
    const anchor = popoverAnchor.getBoundingClientRect();
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const x = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
    const y = anchor.bottom + height + 8 <= window.innerHeight ? anchor.bottom + 5 : Math.max(8, anchor.top - height - 5);
    Object.assign(popover.style, {left:`${x}px`, top:`${y}px`});
  }
  function openPopover(anchor, title) {
    if (popoverAnchor === anchor) { closePopover(); return null; }
    closePopover();
    popoverAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    popover = element('div', 'workspace-popover');
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', title);
    const heading = element('div', 'workspace-popover-heading');
    heading.append(element('strong', '', title));
    const close = button('dock-icon-button', '×', '메뉴 닫기');
    close.addEventListener('click', () => closePopover(true));
    heading.append(close); popover.append(heading);
    document.body.append(popover);
    return popover;
  }
  function finishPopover() {
    positionPopover();
    popover?.querySelector('button, input, select')?.focus({preventScroll:true});
  }
  function showPanelMenu(id, anchor) {
    const menu = openPopover(anchor, PANELS[id].label);
    if (!menu) return;
    menu.append(element('p', 'workspace-menu-hint', '탭을 끌거나 아래 위치를 선택하세요.'));
    for (const area of [...DOCKS, 'floating']) {
      const option = button('workspace-menu-option', '', `${AREA_NAMES[area]}으로 이동`);
      option.append(element('span', '', AREA_NAMES[area]), element('span', 'workspace-menu-check', layout.panels[id].area === area ? '✓' : ''));
      option.addEventListener('click', () => {
        const opts = area === 'floating' ? {x:Math.max(20, (workspace.clientWidth - layout.panels[id].width) / 2), y:50} : {};
        relocate(id, area, opts);
        if (area === 'floating') shells.get(id).shell.querySelector('.floating-handle').focus({preventScroll:true});
        else focusTab(id);
      });
      menu.append(option);
    }
    const hide = button('workspace-menu-option workspace-menu-hide', '패널 닫기');
    hide.addEventListener('click', () => hidePanel(id));
    menu.append(hide); finishPopover();
  }
  function showManager(anchor) {
    const menu = openPopover(anchor, '패널과 레이아웃');
    if (!menu) return;
    menu.classList.add('workspace-manager');
    menu.append(element('p', 'workspace-menu-hint', '필요한 패널을 켜고 원하는 곳에 배치하세요.'));
    for (const id of PANEL_IDS) {
      const row = element('div', 'workspace-manager-row');
      const label = element('label', 'workspace-manager-toggle');
      const input = element('input');
      input.type = 'checkbox'; input.checked = layout.panels[id].visible;
      input.addEventListener('change', () => {
        change(setPanelVisible(layout, id, input.checked), `${PANELS[id].label} 패널 ${input.checked ? '열림' : '닫힘'}`, input.checked ? layout.panels[id].area : null);
      });
      label.append(input, element('span', 'manager-panel-icon', PANELS[id].icon), element('span', '', PANELS[id].label));
      const select = element('select', 'workspace-manager-location');
      select.setAttribute('aria-label', `${PANELS[id].label} 패널 위치`);
      for (const area of [...DOCKS, 'floating']) {
        const option = element('option', '', AREA_NAMES[area]); option.value = area; select.append(option);
      }
      select.value = layout.panels[id].area;
      select.addEventListener('change', () => {
        change(movePanel(layout, id, select.value), `${PANELS[id].label}: ${AREA_NAMES[select.value]}`, select.value);
        input.checked = true;
      });
      row.append(label, select); menu.append(row);
    }
    const reset = button('workspace-reset', '↺  기본 레이아웃 복원');
    reset.addEventListener('click', () => { closePopover(true); compactArea = null; change(createDefaultLayout(), '기본 레이아웃으로 복원했습니다.'); });
    menu.append(reset, element('p', 'workspace-menu-footnote', '배치는 이 브라우저에 자동 저장됩니다.'));
    finishPopover();
  }
  const managerButton = document.getElementById('panels-button');
  managerButton?.setAttribute('aria-haspopup', 'dialog');
  managerButton?.setAttribute('aria-expanded', 'false');
  managerButton?.addEventListener('click', () => showManager(managerButton));

  function beginDrag(event, id, handle) {
    if (event.button !== 0 || document.body.classList.contains('graph-focused')) return;
    closePopover();
    const rect = shells.get(id).shell.getBoundingClientRect();
    const floating = layout.panels[id].area === 'floating';
    drag = {id, handle, pointerId:event.pointerId, startX:event.clientX, startY:event.clientY,
      x:event.clientX, y:event.clientY, offsetX:floating ? event.clientX - rect.left : 75,
      offsetY:floating ? event.clientY - rect.top : 16, started:false, target:null};
    handle.setPointerCapture?.(event.pointerId);
  }
  function targetAt(x, y) {
    for (const [area, target] of dropTargets) {
      const rect = target.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return {area};
    }
    const hit = document.elementFromPoint(x, y);
    const tab = hit?.closest('.dock-tab');
    if (tab) {
      const ids = visibleIn(tab.dataset.area).filter(id => id !== drag.id);
      const index = ids.indexOf(tab.dataset.panelId);
      const rect = tab.getBoundingClientRect();
      const after = compact && ['left', 'right'].includes(tab.dataset.area) ? y > rect.top + rect.height / 2 : x > rect.left + rect.width / 2;
      return {area:tab.dataset.area, index:index < 0 ? visibleIn(tab.dataset.area).indexOf(drag.id) : index + (after ? 1 : 0), tab, after};
    }
    const zone = hit?.closest('.dock-zone');
    if (zone) return {area:zone.dataset.dockArea};
    const rect = workspace.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    if (x < rect.left + 24) return {area:'left'};
    if (x > rect.right - 24) return {area:'right'};
    if (y < rect.top + 24) return {area:'top'};
    if (y > rect.bottom - 24) return {area:'bottom'};
    return {area:'floating'};
  }
  function updateDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.started && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 6) return;
    event.preventDefault();
    if (!drag.started) {
      drag.started = true;
      document.body.classList.add('workspace-dragging');
      dropLayer.hidden = false;
      drag.ghost = element('div', 'dock-drag-ghost', PANELS[drag.id].label);
      document.body.append(drag.ghost);
      announce(`${PANELS[drag.id].label} 이동 중. 가장자리로 도킹하거나 중앙에 놓아 창으로 분리합니다. Escape로 취소.`);
    }
    drag.ghost.style.transform = `translate(${drag.x + 16}px, ${drag.y + 16}px)`;
    drag.target = targetAt(drag.x, drag.y);
    for (const [area, target] of dropTargets) target.classList.toggle('is-target', drag.target?.area === area);
    workspace.querySelectorAll('.drop-before, .drop-after').forEach(tab => tab.classList.remove('drop-before', 'drop-after'));
    if (drag.target?.tab) drag.target.tab.classList.add(drag.target.after ? 'drop-after' : 'drop-before');
    drag.ghost.textContent = `${PANELS[drag.id].label}  ·  ${drag.target ? AREA_NAMES[drag.target.area] : '이동 취소'}`;
  }
  function finishDrag(cancel = false) {
    if (!drag) return;
    const finished = drag;
    drag = null;
    try { finished.handle.releasePointerCapture?.(finished.pointerId); } catch { /* Pointer capture may already have ended. */ }
    finished.ghost?.remove();
    dropLayer.hidden = true;
    document.body.classList.remove('workspace-dragging');
    workspace.querySelectorAll('.drop-before, .drop-after').forEach(tab => tab.classList.remove('drop-before', 'drop-after'));
    if (!finished.started) return;
    // Suppress the click synthesized after a drag; a normal tab click still activates.
    const swallow = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    document.addEventListener('click', swallow, {capture:true, once:true});
    setTimeout(() => document.removeEventListener('click', swallow, true), 0);
    if (cancel || !finished.target) { announce('패널 이동을 취소했습니다.'); return; }
    const {area, index} = finished.target;
    const rect = workspace.getBoundingClientRect();
    const opts = area === 'floating' ? {x:Math.max(0, finished.x - rect.left - finished.offsetX), y:Math.max(0, finished.y - rect.top - finished.offsetY)} : {index};
    relocate(finished.id, area, opts);
    if (area === 'floating') shells.get(finished.id).shell.querySelector('.floating-handle').focus({preventScroll:true});
    else focusTab(finished.id);
  }

  function beginDockResize(event, area) {
    if (event.button !== 0) return;
    event.preventDefault(); closePopover();
    interaction = {kind:'dock', area, pointerId:event.pointerId, x:event.clientX, y:event.clientY, original:layout, size:layout.sizes[area]};
    document.body.classList.add('workspace-resizing', area === 'left' || area === 'right' ? 'resize-horizontal' : 'resize-vertical');
  }
  function beginFloatingResize(event, id) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); closePopover();
    const actual = clampFloatingRect(layout.panels[id], bounds());
    interaction = {kind:'floating', id, pointerId:event.pointerId, x:event.clientX, y:event.clientY, original:layout, rect:actual};
    document.body.classList.add('workspace-resizing', 'resize-diagonal');
  }
  function updateResize(event) {
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - interaction.x;
    const dy = event.clientY - interaction.y;
    if (interaction.kind === 'dock') {
      const area = interaction.area;
      const delta = area === 'left' ? dx : area === 'right' ? -dx : area === 'top' ? dy : -dy;
      layout = resizeDock(layout, area, interaction.size + delta);
    } else {
      const {id, rect} = interaction;
      layout = setFloatingRect(layout, id, clampFloatingRect({...rect, width:Math.max(180, rect.width + dx), height:Math.max(120, rect.height + dy)}, bounds()));
    }
    updateGeometry();
  }
  function finishResize(cancel = false) {
    if (!interaction) return;
    if (cancel) { layout = interaction.original; updateGeometry(); }
    interaction = null;
    document.body.classList.remove('workspace-resizing', 'resize-horizontal', 'resize-vertical', 'resize-diagonal');
    if (!cancel) persist();
  }
  document.addEventListener('pointermove', event => { updateDrag(event); updateResize(event); }, {passive:false});
  document.addEventListener('pointerup', event => {
    if (drag?.pointerId === event.pointerId) finishDrag();
    if (interaction?.pointerId === event.pointerId) finishResize();
  });
  document.addEventListener('pointercancel', event => {
    if (drag?.pointerId === event.pointerId) finishDrag(true);
    if (interaction?.pointerId === event.pointerId) finishResize(true);
  });
  document.addEventListener('pointerdown', event => {
    if (popover && !popover.contains(event.target) && !popoverAnchor?.contains(event.target)) closePopover();
  });
  document.addEventListener('click', event => {
    if(compactOpenPending)return;
    if (compactArea && !event.target.closest('.dock-zone, .workspace-popover, #panels-button, [data-ribbon-command]')) { compactArea = null; updateGeometry(); }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (drag || interaction || popover || compactArea) {
      event.preventDefault(); finishDrag(true); finishResize(true); closePopover(true);
      if (compactArea) { compactArea = null; updateGeometry(); }
    }
  });
  document.addEventListener('glean:focuschange', () => {
    closePopover(); finishDrag(true); finishResize(true); compactArea = null;
  });
  window.addEventListener('blur', () => { finishDrag(true); finishResize(); });
  window.addEventListener('resize', updateGeometry);
  const observer = new ResizeObserver(updateGeometry);
  observer.observe(workspace);
  render();
  workspaceInstance = {getLayout:() => normalizeLayout(layout), reset:() => change(createDefaultLayout()), reveal:id => {
    if (PANEL_IDS.includes(id)) change(setPanelVisible(layout, id, true), null, layout.panels[id].area);
  }};
  return workspaceInstance;
}
