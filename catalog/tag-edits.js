// Manual tag edits made from catalog.html or swipe.html, staged locally until exported.
// Shape: { [tagId]: { add: [modelId, …], remove: [modelId, …] } } — a diff against
// tags.json's per-tag "models" arrays, so it can be reviewed and merged in by hand.
const STORAGE_KEY = 'taaleiland-tagedits-v1';

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (stored && typeof stored === 'object') return stored;
  } catch {}
  return {};
}

let edits = load();
const listeners = [];

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
  if (e && e.add.length === 0 && e.remove.length === 0) delete edits[tagId];
}

export function onChange(fn) {
  listeners.push(fn);
}

// The catalogue's own tags plus whatever this browser has staged on top, minus whatever
// it has staged off.
export function effectiveTags(model) {
  const tags = new Set(model.tags ?? []);
  for (const [tagId, e] of Object.entries(edits)) {
    if (e.add.includes(model.id)) tags.add(tagId);
    if (e.remove.includes(model.id)) tags.delete(tagId);
  }
  return [...tags];
}

export function hasPendingEdit(model) {
  return Object.values(edits).some((e) => e.add.includes(model.id) || e.remove.includes(model.id));
}

// Flips one tag on one model and stages the change. Returns whether the tag is now on.
export function toggleTag(model, tagId) {
  const hadBase = (model.tags ?? []).includes(tagId);
  const e = (edits[tagId] ??= { add: [], remove: [] });
  const nowHas = hadBase ? !e.remove.includes(model.id) : e.add.includes(model.id);

  if (nowHas) {
    if (hadBase) e.remove.push(model.id);
    else e.add = e.add.filter((id) => id !== model.id);
  } else {
    if (hadBase) e.remove = e.remove.filter((id) => id !== model.id);
    else e.add.push(model.id);
  }

  prune(tagId);
  save();
  notify();
  return !nowHas;
}

export function pendingCount() {
  return Object.values(edits).reduce((n, e) => n + e.add.length + e.remove.length, 0);
}

export function clearEdits() {
  edits = {};
  save();
  notify();
}

const timeStamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

export function exportEdits() {
  const tags = Object.fromEntries(
    Object.entries(edits)
      .filter(([, e]) => e.add.length || e.remove.length)
      .map(([id, e]) => [id, { add: [...e.add].sort(), remove: [...e.remove].sort() }]),
  );
  const content = {
    tool: 'catalog tag editor',
    created: new Date().toISOString(),
    note: 'Diff against catalog/tags.json — for each tag, add its "add" ids to "models" and drop its "remove" ids.',
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

// Renders the effective tags of one model as removable chips, plus a search box to add
// any tag from the catalogue that isn't on the model yet. Rebuilds itself on every change.
export function renderTagEditor(container, model, tagsById, { onChange: onEdit } = {}) {
  container.replaceChildren();
  const redraw = () => renderTagEditor(container, model, tagsById, { onChange: onEdit });

  const chips = document.createElement('div');
  chips.className = 'tagedit-chips';
  const current = effectiveTags(model);
  for (const id of current) {
    const tag = tagsById.get(id);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'keuzechip tagedit-chip';
    chip.textContent = `${tag?.name ?? id} ×`;
    chip.title = tag?.description ? `${tag.description} — click to remove` : 'Click to remove this tag';
    chip.addEventListener('click', () => {
      toggleTag(model, id);
      redraw();
      onEdit?.();
    });
    chips.append(chip);
  }
  if (current.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'tagedit-leeg';
    empty.textContent = 'No tags yet.';
    chips.append(empty);
  }
  container.append(chips);

  const picker = document.createElement('div');
  picker.className = 'tagedit-picker';
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'tagedit-zoek';
  input.placeholder = '+ add a tag…';

  const currentSet = new Set(current);
  function renderList() {
    const q = input.value.trim().toLowerCase();
    const options = [...tagsById.values()]
      .filter((t) => !currentSet.has(t.id))
      .filter((t) => !q || t.name.toLowerCase().includes(q) || t.id.includes(q))
      .slice(0, 40);
    openSharedList(input, options, (t) => {
      toggleTag(model, t.id);
      redraw();
      onEdit?.();
    });
  }

  input.addEventListener('input', renderList);
  input.addEventListener('focus', renderList);
  input.addEventListener('blur', hideSharedList);

  picker.append(input);
  container.append(picker);
}

// One dropdown, shared by every tag editor on the page, reparented on each open to
// wherever the active input actually lives. Keeping a single instance — instead of one
// per card, nested under it — means it is never clipped by an ancestor's `overflow:
// hidden` or trapped by an ancestor's `transform` (which would otherwise make that
// ancestor the containing block for a `position: fixed` descendant): both the swipe card
// itself and its scaled-down preview card behind it rely on exactly that combination.
// Inside an open <dialog> (catalog.html's detail view) it has to stay a descendant of
// that dialog instead of moving to <body>: an open dialog paints in the browser's own
// "top layer", above all regular content regardless of z-index, so a body-level sibling
// of it would end up hidden behind the dialog rather than floating above it.
let sharedList = null;

function getSharedList(host) {
  if (!sharedList) {
    sharedList = document.createElement('div');
    sharedList.className = 'tagedit-lijst';
    sharedList.hidden = true;
  }
  if (sharedList.parentElement !== host) host.append(sharedList);
  return sharedList;
}

function openSharedList(input, options, onPick) {
  const host = input.closest('dialog[open]') ?? document.body;
  const list = getSharedList(host);
  list.replaceChildren();
  for (const t of options) {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'tagedit-optie';
    opt.textContent = t.name;
    if (t.description) opt.title = t.description;
    opt.addEventListener('mousedown', (e) => e.preventDefault());
    opt.addEventListener('click', () => onPick(t));
    list.append(opt);
  }
  list.hidden = options.length === 0;
  if (list.hidden) return;
  const rect = input.getBoundingClientRect();
  list.style.left = `${rect.left}px`;
  list.style.top = `${rect.bottom + 4}px`;
  list.style.width = `${rect.width}px`;
}

function hideSharedList() {
  if (sharedList) sharedList.hidden = true;
}

// Wires up the small floating bar (count · Download JSON · Clear) shared by catalog.html
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
