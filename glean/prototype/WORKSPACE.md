# Dockable workspace implementation contract

Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

The proof graph remains the central editor. Existing content becomes movable
panels: `context` (가정과 목표), `components` (논리 도구), `verification` (증명 확인),
`examples` (예제), `source` (Lean 코드), `modules` (모듈 라이브러리), `inspector` (포트·Watch·기록),
and `help` (사용 안내). Each has an existing
DOM element marked `data-panel="ID"`. Move these elements without recreating their
contents so form drafts, listeners, results and source text survive docking.

## Layout state

`layout-model.mjs` exports `PANEL_IDS`, `AREAS`, `createDefaultLayout()`,
`normalizeLayout(value)`, `movePanel(layout, id, area, options={})`,
`setPanelVisible(layout, id, visible)`, `activatePanel(layout, id)`,
`resizeDock(layout, area, pixels)`, `setFloatingRect(layout,id,rect)`, and
`clampFloatingRect(rect,bounds)` (bounds = `{width,height}`). Functions return a new
layout rather than mutating their input. `normalizeLayout` accepts unknown JSON.

State: `{version:1, panels:{ID:{area,visible,order,x,y,width,height}},
active:{left,right,top,bottom}, sizes:{left,right,top,bottom}}`.
Areas are left/right/top/bottom/floating. Panel IDs and areas are fixed arrays.
Options for movePanel: `index` (insertion index within destination visible panels),
`x`, `y` (floating position). Size defaults: left260,right280,top190,bottom220.
Default panel locations: context+components left, verification+examples+help right,
source bottom. Help starts hidden. Active tabs: context,verification,source.
Closing a tab keeps its last area and geometry; reopening restores it and activates
it. IDs/areas/finite geometry/visibility/active tabs must normalize to safe values.

## DOM runtime

`workspace.js` exports `initWorkspace()` (idempotent; caller invokes once). It imports
the pure model. It initializes `.workspace`, moves marked panels into dock zones,
creates tab bars, accessible panel movement menus, and floating panel chrome.
It binds existing `#panels-button` to the panel visibility/location menu, with a
reset layout command. `workspace.css` owns dock styles and overrides legacy fixed
layout styles. The central `.editor-panel` stays intact except its source panel is
moved into the docking system. Legacy `.left-panel`/`.right-panel` wrappers are
removed after contents are moved. Root moves health status to the app header.

Panel tabs/title bars drag into visible left/right/top/bottom targets or float over
the center; dragging onto another tab inserts/reorders in that dock. Menu options
provide an equivalent non-drag interaction. Zones have keyboard-operable resize
separators. Floating panels move/resize, remain reachable after viewport shrink,
and have accessible close/dock controls. Persist layout only in localStorage under
`glean.workspace.v1`, with guarded read/write and a reset option. Never touch graph
state or verification. Escape cancels panel drag/menu. Empty areas reclaim space.
When available width is small, sizes must shrink enough to leave usable graph space.
At compact widths, a tab or ribbon panel command explicitly opens the chosen dock overlay.
The opening click cannot be consumed by outside-click dismissal after tabs are reconstructed.
On the regular layout, open docks reserve space rather than covering graph tool buttons.
Pointerdown outside a dock never changes canvas geometry before that click completes.

Root adds `<link rel="stylesheet" href="/workspace.css">`, imports initWorkspace in
app.js, and calls it before start(). Root handles canvas ResizeObserver so changes
in layout preserve the world-space center without invalidating proof verification.

## Graph focus/fullscreen

`focus-mode.js` exports `initGraphFocus()`; `focus-mode.css` owns styles. Root provides
`#fullscreen-button` in `.canvas-tools`, and `.editor-panel` contains only canvas
header, graph and footer once docking initializes. A click displays ONLY this
editor, requests browser fullscreen when supported, and otherwise uses a fixed
viewport fallback. Button toggles to `전체화면 닫기`, Esc restores the exact prior dock
layout. Do not restore focus mode on reload or write layout while in focus mode.
Fullscreen CSS should hide editor footer, extra header labels as appropriate, keep
zoom/100%/selection-fit/whole-fit/exit controls, common Hide/isolation status, global target
check/cancel/diagnostic controls and code/internal-edit entry points visible. Typed public-contract
settings open in an in-workbench drawer, so editing is reachable in fullscreen. Whole fit includes
the actual visible hidden-boundary stubs and expanded container headers. Do not recreate any graph DOM.
Escape first cancels an unfinished connection/drag/menu or closes the wide code editor, then exits
fullscreen on a subsequent press; it does not silently clear active isolation. Browser fullscreen
exit and failed requests must leave consistent state. Focus class:
`body.graph-focused`; panel manager may close transient menus in response to event
`glean:focuschange` with `detail:{active:boolean}`. Root handles canvas resize.

## File ownership

- Layout model agent: layout-model.mjs and layout-model.test.mjs only.
- Dock runtime agent: workspace.js and workspace.css only.
- Focus agent: focus-mode.js, focus-mode.css and focused tests if useful only.
- Main: index.html, app.js, model.mjs/test, docs, integration/browser review.
