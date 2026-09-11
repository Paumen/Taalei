// Manual tag edits made from index.html or swipe.html, staged locally until exported.
// Shape: { [tagId]: { add: [modelId, …], remove: [modelId, …] } } — a diff against
// tags.json's per-tag "models" arrays, so it can be reviewed and merged in by hand.
// Kind and use are fields on the model in catalog.json but entries in tags.json like any
// other, so they travel in the same diff: a kind is `obj-container-jug`, a use is `use:food`.
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

// Material families opened by hand in the editor. Per-session view state, never an edit.
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
  if (e && e.add.length === 0 && e.remove.length === 0) delete edits[tagId];
}

export function onChange(fn) {
  listeners.push(fn);
}

export const isKindId = (id, tagsById) => tagsById?.get(id)?.type === 'kind';
export const useId = (u) => `use:${u}`;

// Every id the model carries in tags.json terms: its tags, its kind and its uses.
const baseIds = (model) => [
  ...(model.tags ?? []),
  ...(model.kind ? [model.kind] : []),
  ...(model.use ?? []).map(useId),
];

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
    note: 'Diff against catalog/tags.json — for each tag, add its "add" ids to "models" and drop its "remove" ids. Kinds and uses (use:…) are entries there like any other tag.',
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
const kindChain = (id) => {
  const chain = [];
  for (let k = id; k; k = kindParent(k)) chain.unshift(k);
  return chain;
};

function chip(text, pressed, title, action, count) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'keuzechip';
  button.append(document.createTextNode(text));
  if (count !== undefined) {
    const n = document.createElement('span');
    n.className = 'keuzechip-aantal';
    n.textContent = count;
    button.append(n);
  }
  button.setAttribute('aria-pressed', String(pressed));
  if (title) button.title = title;
  button.addEventListener('click', action);
  return button;
}

function heading(panel, text) {
  const label = document.createElement('p');
  label.className = 'tagedit-groep';
  label.textContent = text;
  panel.append(label);
}

// Kind is picked by walking down the tree: one row per level, the chosen node pressed,
// the next row its children. Pressing a branch is a valid stop (K2: the parent is the
// "other" level); pressing the chosen node again clears the kind.
function renderKindPicker(panel, model, tagsById, redraw, onEdit) {
  const kinds = [...tagsById.values()].filter((t) => t.type === 'kind');
  const childrenOf = (id) => kinds.filter((t) => kindParent(t.id) === id);
  const current = effectiveKind(model, tagsById);
  const chain = current ? kindChain(current) : [];

  heading(panel, current ? `Kind — ${chain.map((id) => tagsById.get(id)?.name ?? id).join(' › ')}` : 'Kind — none');

  const pick = (id) => {
    setKind(model, id === current ? null : id, tagsById);
    redraw();
    onEdit?.();
  };

  let level = kinds.filter((t) => !kindParent(t.id));
  for (let depth = 0; level.length; depth++) {
    const row = document.createElement('div');
    row.className = 'tagedit-chips tagedit-niveau';
    row.dataset.diepte = String(depth);
    const chosen = chain[depth] ?? null;
    for (const tag of level) {
      row.append(chip(tag.name, tag.id === chosen, tag.description, () => pick(tag.id), tag.count));
    }
    panel.append(row);
    level = chosen ? childrenOf(chosen) : [];
  }
}

// Materials collapse to their families: 21 chips, with metal, wood and stone opening a
// tray of subtypes. A family the model actually carries is open and has no caret — hiding
// a pressed chip would be worse than the extra row.
function renderMaterials(panel, model, tagsById, on, redraw, onEdit) {
  const mats = [...tagsById.values()].filter((t) => t.type === 'material');
  if (!mats.length) return;
  heading(panel, 'Materials');

  const row = document.createElement('div');
  row.className = 'tagedit-chips';
  const flip = (id) => { toggleTag(model, id); redraw(); onEdit?.(); };

  for (const tag of mats.filter((t) => !t.parent)) {
    const kids = mats.filter((k) => k.parent === tag.id);
    const carried = kids.some((k) => on.has(k.id));
    const open = kids.length > 0 && (carried || expanded.has(tag.id));
    const button = chip(tag.name, on.has(tag.id), tag.description, () => flip(tag.id), tag.count);
    row.append(button);
    if (!kids.length) continue;

    button.classList.toggle('keuzechip-ouder', open);
    if (!carried) {
      const caret = document.createElement('span');
      caret.className = 'keuzechip-pijl';
      caret.textContent = open ? '▾' : '▸';
      caret.title = `${open ? 'Hide' : 'Show'} the ${tag.name.toLowerCase()} subtypes`;
      caret.addEventListener('click', (e) => {
        e.stopPropagation();
        if (expanded.has(tag.id)) expanded.delete(tag.id);
        else expanded.add(tag.id);
        redraw();
      });
      button.append(caret);
    }
    if (!open) continue;

    const tray = document.createElement('span');
    tray.className = 'tagedit-bak';
    for (const kid of kids) {
      const sub = chip(kid.name, on.has(kid.id), kid.description, () => {
        // keep the family open across the toggle, or the chip just clicked would vanish
        expanded.add(tag.id);
        flip(kid.id);
      }, kid.count);
      sub.classList.add('keuzechip-subtype');
      tray.append(sub);
    }
    row.append(tray);
  }
  panel.append(row);
}

// Renders the five fields as toggles: pressed means the model carries it. Kind as a tree
// walk, use as its eight, materials as families, then the open tags. Rebuilds on every change.
export function renderTagEditor(container, model, tagsById, { onChange: onEdit } = {}) {
  container.replaceChildren();
  const redraw = () => renderTagEditor(container, model, tagsById, { onChange: onEdit });
  const on = new Set(effectiveTags(model));

  const panel = document.createElement('div');
  panel.className = 'tagedit-toggles';

  renderKindPicker(panel, model, tagsById, redraw, onEdit);

  // use and tag are short closed sets with no parents, so they stay flat
  for (const [type, label] of [['use', 'Use'], ['tag', 'Tags']]) {
    const tags = [...tagsById.values()].filter((t) => (t.type ?? 'tag') === type);
    if (tags.length === 0) continue;
    if (type === 'tag') renderMaterials(panel, model, tagsById, on, redraw, onEdit);
    heading(panel, label);
    const row = document.createElement('div');
    row.className = 'tagedit-chips';
    for (const tag of tags) {
      row.append(chip(tag.name ?? tag.id, on.has(tag.id), tag.description, () => {
        toggleTag(model, tag.id);
        redraw();
        onEdit?.();
      }, tag.count));
    }
    panel.append(row);
  }

  container.append(panel);
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
