const STORAGE_KEY = 'taaleiland-opmerkingen-v1';
const SAVE_AFTER = 400;

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (stored && typeof stored === 'object') return stored;
  } catch {}
  return {};
}

let notes = load();
const listeners = [];

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
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

export function setComment(model, text) {
  const trimmed = text.trim();
  if (trimmed) notes[model.id] = trimmed;
  else delete notes[model.id];
  save();
  notify();
}

export function commentCount() {
  return Object.keys(notes).length;
}

export function clearComments() {
  notes = {};
  save();
  notify();
}

export const allComments = () =>
  Object.fromEntries(Object.entries(notes).sort(([a], [b]) => a.localeCompare(b)));

export function renderCommentBox(container, model, { onChange: onEdit } = {}) {
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

  let timer = null;
  const commit = () => {
    clearTimeout(timer);
    timer = null;
    if (field.value.trim() === commentOf(model)) return;
    setComment(model, field.value);
    onEdit?.();
  };

  field.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(commit, SAVE_AFTER);
  });
  field.addEventListener('change', commit);
  field.addEventListener('blur', commit);

  container.append(head, field);
  return field;
}
