import { makeChipStrip, layoutChips, syncChips, chipName } from './chiprij.js?v=4d2713cb40';

const STORAGE_KEY = 'taaleiland-tagedits-v1';

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (stored && typeof stored === 'object') return stored;
  } catch {}
  return {};
}

let edits = load();
{
  const before = JSON.stringify(edits);
  for (const id of Object.keys(edits)) prune(id);
  if (JSON.stringify(edits) !== before) save();
}
const listeners = [];

const expanded = new Set();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
  } catch {}
}

function notify() {
  for (const fn of listeners) fn();
}

function prune(tagId) {
  const e = edits[tagId];
  if (!e) return;
  const both = e.add.filter((id) => e.remove.includes(id));
  if (both.length) {
    e.add = e.add.filter((id) => !both.includes(id));
    e.remove = e.remove.filter((id) => !both.includes(id));
  }
  if (e.add.length === 0 && e.remove.length === 0) delete edits[tagId];
}

export function onChange(fn) {
  listeners.push(fn);
}

export const isKindId = (id, tagsById) => tagsById?.get(id)?.type === 'kind';
export const useId = (u) => `use:${u}`;

const bases = new WeakMap();
const baseIds = (model) => {
  if (!bases.has(model)) {
    bases.set(model, [
      ...(model.tags ?? []),
      ...(model.kind ? [model.kind] : []),
      ...(model.use ?? []).map(useId),
    ]);
  }
  return bases.get(model);
};

export function effectiveTags(model) {
  const tags = new Set(baseIds(model));
  for (const [tagId, e] of Object.entries(edits)) {
    if (e.add.includes(model.id)) tags.add(tagId);
    if (e.remove.includes(model.id)) tags.delete(tagId);
  }
  return [...tags];
}

export const effectiveKind = (model, tagsById) =>
  effectiveTags(model).find((id) => isKindId(id, tagsById)) ?? null;

export const effectiveUses = (model) =>
  effectiveTags(model).filter((id) => id.startsWith('use:')).map((id) => id.slice(4));

export function hasPendingEdit(model) {
  return Object.values(edits).some((e) => e.add.includes(model.id) || e.remove.includes(model.id));
}

function stage(model, tagId, on) {
  const hadBase = baseIds(model).includes(tagId);
  const e = (edits[tagId] ??= { add: [], remove: [] });
  if (on) {
    if (hadBase) e.remove = e.remove.filter((id) => id !== model.id);
    else if (!e.add.includes(model.id)) e.add.push(model.id);
  } else {
    if (hadBase) { if (!e.remove.includes(model.id)) e.remove.push(model.id); }
    else e.add = e.add.filter((id) => id !== model.id);
  }
  prune(tagId);
}

export function toggleTag(model, tagId) {
  const nowHas = effectiveTags(model).includes(tagId);
  stage(model, tagId, !nowHas);
  save();
  notify();
  return !nowHas;
}

export function setKind(model, kindId, tagsById) {
  const current = effectiveKind(model, tagsById);
  if (current === kindId) return;
  if (current) stage(model, current, false);
  if (kindId) stage(model, kindId, true);
  save();
  notify();
}

export function pendingCount() {
  return Object.values(edits).reduce((n, e) => n + e.add.length + e.remove.length, 0);
}

export function clearEdits() {
  edits = {};
  save();
  notify();
}

const timeStamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);

export function exportEdits() {
  const tags = Object.fromEntries(
    Object.entries(edits)
      .filter(([, e]) => e.add.length || e.remove.length)
      .map(([id, e]) => [id, { add: [...e.add].sort(), remove: [...e.remove].sort() }]),
  );
  const content = {
    tool: 'catalog tag editor',
    created: new Date().toISOString(),
    note: 'Diff against catalog/tags.json: node tools/apply-tag-edits.mjs <this file> merges it, --dry shows what it would do first. Per tag, "add" ids join that tag\'s "models" and "remove" ids leave it; kinds and uses (use:…) are entries there like any other tag.',
    tags,
  };
  const blob = new Blob([JSON.stringify(content, null, 1) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tag-edits-${timeStamp()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const kindParent = (id) => (id.includes('-') ? id.slice(0, id.lastIndexOf('-')) : null);

export function renderTagEditor(container, model, tagsById, { onChange: onEdit } = {}) {
  container.replaceChildren();
  const redraw = () => renderTagEditor(container, model, tagsById, { onChange: onEdit });
  const on = new Set(effectiveTags(model));
  const tags = [...tagsById.values()];

  const rows = [
    { label: 'Kind', of: (t) => t.type === 'kind', parent: (t) => kindParent(t.id),
      pick: (id) => setKind(model, id === effectiveKind(model, tagsById) ? null : id, tagsById) },
    { label: 'Use', of: (t) => t.type === 'use' },
    { label: 'Materials', of: (t) => t.type === 'material', parent: (t) => t.parent ?? null },
    { label: 'Tags', of: (t) => (t.type ?? 'tag') === 'tag' },
  ];

  const parentOf = new Map();
  for (const { of, parent } of rows) {
    if (!parent) continue;
    for (const t of tags.filter(of)) parentOf.set(t.id, parent(t));
  }
  const open = new Set();
  for (const id of [...on, ...expanded]) {
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) open.add(p);
  }

  const stateOf = (id) => (on.has(id) ? 'only' : expanded.has(id) || open.has(id) ? 'open' : undefined);

  const all = [];
  for (const { label, of, parent, pick } of rows) {
    const own = tags.filter(of);
    if (!own.length) continue;
    const { chips } = makeChipStrip({
      label: `Set ${label.toLowerCase()}`,
      items: own.map((t) => ({
        id: t.id,
        name: chipName(t),
        full: t.name ?? t.id,
        hint: t.description,
        parent: parent?.(t) ?? null,
      })),
      container,
      stateOf,
      onPick: (id) => {
        if (pick) pick(id);
        else { expanded.add(id); toggleTag(model, id); }
        redraw();
        onEdit?.();
      },
    });
    all.push(...chips);
  }

  syncChips(all, { stateOf });
  layoutChips(all);
}

export function mountEditBar() {
  const bar = document.querySelector('#tagedit-balk');
  if (!bar) return;
  const label = document.querySelector('#tagedit-balk-telling');
  const downloadButton = document.querySelector('#tagedit-balk-download');
  const clearButton = document.querySelector('#tagedit-balk-wis');

  function refresh() {
    const n = pendingCount();
    bar.hidden = n === 0;
    if (label) label.textContent = `${n} tag edit${n === 1 ? '' : 's'} pending`;
  }

  downloadButton?.addEventListener('click', () => exportEdits());
  clearButton?.addEventListener('click', () => {
    if (pendingCount() === 0) return;
    if (!confirm('Clear all pending tag edits? This does not undo anything in tags.json.')) return;
    clearEdits();
  });

  onChange(refresh);
  refresh();
}
