// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
const instances = new WeakMap();

export function initRibbon(doc = document, workspace) {
  if (instances.has(doc)) return instances.get(doc);
  const categories = [...doc.querySelectorAll('[data-ribbon-category]')];
  const groups = [...doc.querySelectorAll('[data-ribbon-group]')];
  const select = category => {
    for (const button of categories) button.setAttribute('aria-pressed', button.dataset.ribbonCategory === category);
    for (const group of groups) group.hidden = category !== 'all' && group.dataset.ribbonGroup !== category;
  };
  categories.forEach((button, index) => {
    button.addEventListener('click', () => select(button.dataset.ribbonCategory));
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % categories.length;
      if (event.key === 'ArrowLeft') next = (index + categories.length - 1) % categories.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = categories.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      select(categories[next].dataset.ribbonCategory);
      categories[next].focus();
    });
  });
  const actions = { assumption: 'add-assumption-node', verify: 'check-button' };
  const panels = new Set(['context', 'source', 'examples', 'modules']);
  for (const button of doc.querySelectorAll('[data-ribbon-command]')) {
    button.addEventListener('click', () => {
      const command = button.dataset.ribbonCommand;
      if (panels.has(command)) workspace?.reveal(command);
      else {
        const target = doc.getElementById(actions[command]);
        if (target && !target.disabled) target.click();
      }
    });
  }
  select('all');
  const controller = { select };
  instances.set(doc, controller);
  return controller;
}
