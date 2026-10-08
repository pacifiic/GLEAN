// Copyright (c) 2026 GLEAN contributors. Released under Apache 2.0.
import { cloneDocument, documentKey } from './history.mjs';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const errorText = error => error instanceof Error ? error.message : String(error);

/** Store both recovery points in one write so failed autosaves preserve the last good draft. */
export class DraftStore {
  #storage;
  #key;
  #validate;
  #now;
  lastError = null;

  constructor({ storage, key = 'glean.draft.v1', validate = () => null, now = () => Date.now() } = {}) {
    this.#storage = storage;
    this.#key = key;
    this.#validate = validate;
    this.#now = now;
  }

  #getStorage() {
    const storage = this.#storage ?? globalThis.localStorage;
    if (!storage) throw new Error('이 브라우저에서 자동 저장을 사용할 수 없습니다.');
    return storage;
  }

  #validEntry(entry) {
    if (!record(entry) || !record(entry.document) || !Number.isFinite(entry.savedAt) || entry.savedAt < 0) return false;
    try { return !this.#validate(entry.document); } catch { return false; }
  }

  #readEnvelope(storage) {
    const raw = storage.getItem(this.#key);
    if (raw === null) return null;
    let envelope;
    try { envelope = JSON.parse(raw); } catch { return null; }
    return record(envelope) && envelope.version === 1 ? envelope : null;
  }

  #read(previousOnly) {
    this.lastError = null;
    try {
      const envelope = this.#readEnvelope(this.#getStorage());
      if (!envelope) return null;
      const currentValid = !previousOnly && this.#validEntry(envelope.current);
      const entry = currentValid ? envelope.current : this.#validEntry(envelope.previous) ? envelope.previous : null;
      return entry ? { document: cloneDocument(entry.document), savedAt: entry.savedAt, recoveredPrevious: !currentValid } : null;
    } catch (error) {
      this.lastError = errorText(error);
      return null;
    }
  }

  load() { return this.#read(false); }

  recoverPrevious() { return this.#read(true); }

  save(document) {
    this.lastError = null;
    try {
      const snapshot = cloneDocument(document);
      const invalid = this.#validate(snapshot);
      if (invalid) throw new Error(typeof invalid === 'string' ? invalid : '복구 문서의 형식이 올바르지 않습니다.');
      const savedAt = this.#now();
      if (!Number.isFinite(savedAt) || savedAt < 0) throw new Error('저장 시간을 확인할 수 없습니다.');
      const storage = this.#getStorage();
      const envelope = this.#readEnvelope(storage);
      const current = this.#validEntry(envelope?.current) ? envelope.current : null;
      const prior = this.#validEntry(envelope?.previous) ? envelope.previous : null;
      const previous = current && documentKey(current.document) !== documentKey(snapshot) ? current : prior;
      storage.setItem(this.#key, JSON.stringify({ version: 1, current: { document: snapshot, savedAt }, previous }));
      return { ok: true };
    } catch (error) {
      this.lastError = errorText(error);
      return { ok: false, error: this.lastError };
    }
  }

  clear() {
    this.lastError = null;
    try {
      this.#getStorage().removeItem(this.#key);
      return { ok: true };
    } catch (error) {
      this.lastError = errorText(error);
      return { ok: false, error: this.lastError };
    }
  }
}
