// Manual tag edits made from index.html or swipe.html, staged locally until exported.
// Shape: { [tagId]: { add: [modelId, …], remove: [modelId, …] } } — a diff against
// tags.json's per-tag "models" arrays, merged by tools/apply-tag-edits.mjs.
// Kind and use are fields on the model in catalog.json but entries in tags.json like any
// other, so they travel in the same diff: a kind is `obj-container-jug`, a use is `use:food`.
import { makeChipStrip, layoutChips, syncChips, chipName } from './chiprij.js?v=c45cff68d4';

const STORAGE_KEY = 'taaleiland-tagedits-v1';

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (stored && typeof stored === 'object') return stored;
  } catch {}
  return {};
}

let edits = load();
// a diff staged before the base snapshot was fixed can hold a model in both add and
// remove for one tag; prune cancels those, and the repair is written back
{
  const before = JSON.stringify(edits);
  for (const id of Object.keys(edits)) prune(id);
  if (JSON.stringify(edits) !== before) save();
}
const listeners = [];

// Parents opened in the editor. Per-session view state, never an edit — it must not reach
// exportEdits. A parent is also opened by assigning it, which is what a tap does.
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
  // adding and removing the same model is no edit at all
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

// Every id the model carries in tags.json terms: its tags, its kind and its uses.
//
// Snapshotted per model, because the catalogue page writes the *effective* kind and use
// back onto the model so a staged edit moves its card between sections. Read live, that
// would make a staged value look like the catalogue's own: letting it go again would then
// record a remove against a tag the catalogue never had, on top of the add that put it
// there, and the export would both add and remove it.
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

// The catalogue's own ids plus whatever this browser has staged on top, minus whatever
// it has staged off.
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

// Flips one tag on one model and stages the change. Returns whether the tag is now on.
export function toggleTag(model, tagId) {
  const nowHas = effectiveTags(model).includes(tagId);
  stage(model, tagId, !nowHas);
  save();
  notify();
  return !nowHas;
}

// Exactly one kind per model (K1): setting one takes the old one off. Pass null to clear.
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

// Renders the five fields as the filter bar renders its own: one horizontally scrolling
// row per field, children in a tray behind their parent, and what the model carries
// sorted to the front so it is visible without swiping. No captions — the bar names its
// rows through aria-label alone, and the Kind row already reads as the kind path.
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

  // A chip is hidden until every ancestor is picked, so what the model carries has to open
  // its own chain — a model on obj-container-bag needs Object and Container open to show it.
  const parentOf = new Map();
  for (const { of, parent } of rows) {
    if (!parent) continue;
    for (const t of tags.filter(of)) parentOf.set(t.id, parent(t));
  }
  const open = new Set();
  for (const id of [...on, ...expanded]) {
    for (let p = parentOf.get(id); p; p = parentOf.get(p)) open.add(p);
  }

  // A filter chip narrows the view and can be let go; an editor chip assigns. So picking a
  // parent material both assigns it and opens its tray, and the tray stays open once
  // opened — otherwise the subtype chip just tapped would vanish under the finger.
  const stateOf = (id) => (on.has(id) ? 'only' : expanded.has(id) || open.has(id) ? 'open' : undefined);

  const all = [];
  for (const { label, of, parent, pick } of rows) {
    const own = tags.filter(of);
    if (!own.length) continue;
    const { chips } = makeChipStrip({
      label: `Set ${label.toLowerCase()}`,
      // No counts here: the editor says what this one model carries, and a catalogue-wide
      // tally on every chip only costs the row width the abbreviations just bought.
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

// Wires up the small floating bar (count · Download JSON · Clear) shared by index.html
// and swipe.html. Call once per page after the DOM is ready.
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
