import { readStore, writeStore } from './shared.js?v=edc551c3ed';

const STORAGE_KEY = 'taalei-flags-v1';

const flags = new Set(Object.keys(readStore(STORAGE_KEY)));
const listeners = [];

export const isFlagged = (id) => flags.has(id);

export const flagCount = () => flags.size;

export function onChange(fn) {
  listeners.push(fn);
}

export function setFlag(id, on) {
  if (on) flags.add(id);
  else flags.delete(id);
  writeStore(STORAGE_KEY, Object.fromEntries([...flags].sort().map((f) => [f, true])));
  for (const fn of listeners) fn();
}
