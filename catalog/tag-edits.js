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

// Renders every tag in the catalogue as a toggle: pressed means the model carries it.
// Grouped materials first, then the rest, in a scrolling panel. Rebuilds on every change.
export function renderTagEditor(container, model, tagsById, { onChange: onEdit } = {}) {
  container.replaceChildren();
  const redraw = () => renderTagEditor(container, model, tagsById, { onChange: onEdit });
  const on = new Set(effectiveTags(model));

  const panel = document.createElement('div');
  panel.className = 'tagedit-toggles';

  const groups = [['material', 'Materials'], ['tag', 'Tags']];
  for (const [type, heading] of groups) {
    const tags = [...tagsById.values()].filter((t) => (t.type ?? 'tag') === type);
    if (tags.length === 0) continue;

    const label = document.createElement('p');
    label.className = 'tagedit-groep';
    label.textContent = heading;
    panel.append(label);

    const row = document.createElement('div');
    row.className = 'tagedit-chips';
    for (const tag of tags) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'keuzechip';
      chip.textContent = tag.name ?? tag.id;
      chip.setAttribute('aria-pressed', String(on.has(tag.id)));
      if (tag.description) chip.title = tag.description;
      chip.addEventListener('click', () => {
        toggleTag(model, tag.id);
        redraw();
        onEdit?.();
      });
      row.append(chip);
    }
    panel.append(row);
  }

  container.append(panel);
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
