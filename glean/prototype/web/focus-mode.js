// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.

const instances = new WeakMap();

export function initGraphFocus(doc = document, {cancelInteraction=()=>false} = {}) {
  if (instances.has(doc)) return instances.get(doc);
  const editor = doc.querySelector('.editor-panel');
  const button = doc.getElementById('fullscreen-button');
  if (!editor || !button) return null;

  const originalText = button.textContent;
  const originalTitle = button.getAttribute('title');
  const EventClass = doc.defaultView?.CustomEvent ?? CustomEvent;
  let active = false;
  let returnFocus = null;
  let nativeOwned = false;
  let entering = null;
  let exiting = null;

  const fullscreenElement = () => doc.fullscreenElement ?? null;

  function updateButton() {
    const label = active ? '전체화면 닫기' : originalText;
    button.textContent = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('title', active ? '전체화면 닫기 (Esc)' : originalTitle ?? '그래프만 전체화면으로 보기');
  }

  function setActive(value) {
    if (active === value) return;
    if (value) returnFocus = doc.activeElement;
    active = value;
    doc.body.classList.toggle('graph-focused', active);
    updateButton();
    if (active) button.focus({ preventScroll: true });
    else if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    doc.dispatchEvent(new EventClass('glean:focuschange', { detail: { active }, bubbles: true }));
  }

  function exitNative() {
    if (fullscreenElement() !== editor || exiting) return;
    const exit = doc.exitFullscreen;
    if (!exit) {
      setActive(true);
      return;
    }
    const request = {};
    exiting = request;
    const finished = () => {
      if (exiting !== request) return;
      exiting = null;
      nativeOwned = fullscreenElement() === editor;
      // A failed browser exit must retain a working exit affordance.
      if (nativeOwned && !active) setActive(true);
    };
    try {
      Promise.resolve(exit.call(doc)).then(finished, finished);
    } catch {
      finished();
    }
  }

  function enter() {
    if (active) return;
    setActive(true);
    if (entering || exiting || fullscreenElement()) return;
    const requestFullscreen = editor.requestFullscreen;
    if (!requestFullscreen || doc.fullscreenEnabled === false) return;
    const request = {};
    entering = request;
    const finished = () => {
      if (entering !== request) return;
      entering = null;
      if (fullscreenElement() === editor) {
        nativeOwned = true;
        // A pending request can complete after the user has already pressed Esc.
        if (!active) exitNative();
      }
    };
    try {
      // Keep the request in the click's user activation; rejection leaves CSS focus active.
      Promise.resolve(requestFullscreen.call(editor)).then(finished, finished);
    } catch {
      finished();
    }
  }

  function exit() {
    setActive(false);
    exitNative();
  }

  function onFullscreenChange() {
    if (fullscreenElement() === editor) {
      nativeOwned = true;
      if (!active) exitNative();
    } else if (nativeOwned) {
      nativeOwned = false;
      // An old explicit exit may finish after a newer enter selected viewport focus.
      if (!exiting) setActive(false);
    }
  }

  button.addEventListener('click', () => active ? exit() : enter());
  doc.addEventListener('fullscreenchange', onFullscreenChange);
  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(cancelInteraction())return;
    exit();
  }, true);

  const controller = { enter, exit, get active() { return active; } };
  instances.set(doc, controller);
  updateButton();
  return controller;
}
