// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
import {semanticDocument} from './presentation.mjs';

export function cloneDocument(document) {
  if (!record(document)) throw new TypeError('A document must be a JSON object.');
  return JSON.parse(JSON.stringify(document));
}

function share(value, previous) {
  if (value === previous) return previous;
  if (Array.isArray(value)) {
    const matching=Array.isArray(previous)&&value.length===previous.length;
    const result=value.map((item,index)=>share(item,matching?previous[index]:undefined));
    return matching&&result.every((item,index)=>item===previous[index])?previous:result;
  }
  if (record(value)) {
    const keys=Object.keys(value),matching=record(previous)&&keys.length===Object.keys(previous).length;
    const result=Object.fromEntries(keys.map(key=>[key,share(value[key],matching?previous[key]:undefined)]));
    return matching&&keys.every(key=>Object.hasOwn(previous,key)&&result[key]===previous[key])?previous:result;
  }
  return value;
}

/** Private immutable snapshots share unchanged subtrees; callers receive detached JSON clones. */
export function sharedSnapshot(document,previous) {return share(cloneDocument(document),previous);}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

export function documentKey(document) {
  return JSON.stringify(canonical(document));
}

function semanticScope(scope, root = false) {
  const { groups, version, nodes, modules, ...fields } = scope;
  const value = { ...fields, nodes: nodes.map(({ x, y, ...node }) => node.kind==='cases'?{...node,branches:node.branches.map(branch=>semanticScope(branch))}:node) };
  if (root) value.modules = (modules ?? []).map(definition => semanticScope(definition));
  return value;
}

/** Presentation edits share verification results; Lean source and draft form changes do not. */
export function semanticKey(document) {
  const value=semanticDocument(document);
  if(value?.kind==='graph')value.graph=semanticScope(value.graph,true);
  else if([1,2].includes(value?.version)&&Array.isArray(value.nodes))return documentKey(semanticScope(value,true));
  return documentKey(value);
}

export class DocumentHistory {
  #entries = [];
  #cursor = -1;
  #limit;

  constructor({ limit = 50 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('History limit must be between 1 and 1000.');
    this.#limit = limit;
  }

  get canUndo() { return this.#cursor > 0; }
  get canRedo() { return this.#cursor + 1 < this.#entries.length; }

  current() {
    return this.#cursor < 0 ? null : cloneDocument(this.#entries[this.#cursor].document);
  }

  reset(document) {
    const snapshot = cloneDocument(document);
    this.#entries = [{ document: snapshot }];
    this.#cursor = 0;
  }

  commit(document) {
    const previous=this.#entries[this.#cursor]?.document,snapshot=sharedSnapshot(document,previous);
    if (snapshot===previous) return false;
    this.#entries = this.#entries.slice(0, this.#cursor + 1);
    this.#entries.push({ document: snapshot });
    if (this.#entries.length > this.#limit) this.#entries.shift();
    this.#cursor = this.#entries.length - 1;
    return true;
  }

  undo() {
    if (!this.canUndo) return null;
    this.#cursor--;
    return this.current();
  }

  redo() {
    if (!this.canRedo) return null;
    this.#cursor++;
    return this.current();
  }
}
