const STORAGE_KEY = 'taaleiland-opmerkingen-v1';
const VIEW_KEY = 'taaleiland-opmerking-zicht-v1';
const SAVE_AFTER = 400;

function load(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (stored && typeof stored === 'object') return stored;
  } catch {}
  return {};
}

let notes = load(STORAGE_KEY);
let views = load(VIEW_KEY);
const listeners = [];

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    localStorage.setItem(VIEW_KEY, JSON.stringify(views));
  } catch {}
}

function notify() {
  for (const fn of listeners) fn();
}

export function onChange(fn) {
  listeners.push(fn);
}

export const commentOf = (model) => notes[model.id] ?? '';

export const hasComment = (model) => Boolean(notes[model.id]);

// The view is whatever the panel was showing when the note was written, so a note
// about a part carries the angle the part was visible from.
export function setComment(model, text, view = null) {
  const trimmed = text.trim();
  if (trimmed) {
    notes[model.id] = trimmed;
    if (view) views[model.id] = view;
  } else {
    delete notes[model.id];
    delete views[model.id];
  }
  save();
  notify();
}

export function commentCount() {
  return Object.keys(notes).length;
}

export function clearComments() {
  notes = {};
  views = {};
  save();
  notify();
}

export const allComments = () =>
  Object.fromEntries(Object.entries(notes).sort(([a], [b]) => a.localeCompare(b)));

export const allViews = () =>
  Object.fromEntries(
    Object.entries(views)
      .filter(([id]) => notes[id])
      .sort(([a], [b]) => a.localeCompare(b)),
  );

export function renderCommentBox(container, model, { onChange: onEdit, readView } = {}) {
  container.replaceChildren();
  container.classList.add('opmerking');

  const head = document.createElement('span');
  head.className = 'detail-keuze-kop';
  head.textContent = 'Comment';

  const field = document.createElement('textarea');
  field.className = 'opmerking-veld';
  field.rows = 2;
  field.placeholder = 'What is off about this model, or what it still needs';
  field.value = commentOf(model);
  field.setAttribute('aria-label', `Comment on ${model.name}`);

  // What the note will carry, so the angle recorded is never a surprise. It follows
  // the last camera the reader drove, not wherever auto-rotate has spun to.
  const hint = document.createElement('span');
  hint.className = 'opmerking-zicht';
  const showView = () => {
    const view = readView?.();
    hint.textContent = view
      ? `records view ${view.view}${view.zoom && view.zoom !== 1 ? ` · ${view.zoom}× in` : ''}`
      : '';
    hint.hidden = !view;
  };
  showView();

  let timer = null;
  const commit = () => {
    clearTimeout(timer);
    timer = null;
    if (field.value.trim() === commentOf(model)) return;
    setComment(model, field.value, readView?.() ?? null);
    onEdit?.();
  };

  field.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(commit, SAVE_AFTER);
    showView();
  });
  field.addEventListener('change', commit);
  field.addEventListener('blur', commit);

  container.append(head, field, hint);
  return { field, showView };
}
