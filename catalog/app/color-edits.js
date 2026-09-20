const STORAGE_KEY = 'taaleiland-kleurmerken-v1';

export const VERDICTS = ['partial', 'wrong'];
const LABEL = { partial: 'partly wrong', wrong: 'wrong', add: 'proposed, not on the model' };

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (stored && typeof stored === 'object') return stored;
  } catch {}
  return {};
}

let marks = load();
const listeners = [];

let bands = [];
const bandName = new Map();

export function setBands(list) {
  bands = list;
  bandName.clear();
  for (const band of list) bandName.set(band.hex, band.name);
}

export const bandLabel = (hex) => {
  const name = bandName.get(hex);
  return name ? `${name} — ${hex}` : hex;
};

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
  } catch {}
}

function notify() {
  for (const fn of listeners) fn();
}

export function onChange(fn) {
  listeners.push(fn);
}

export const verdictOf = (model, hex) => marks[model.id]?.[hex] ?? null;
export const verdictLabel = (verdict) => LABEL[verdict] ?? 'as the rules ask';

function set(model, hex, verdict) {
  const own = (marks[model.id] ??= {});
  if (verdict) own[hex] = verdict;
  else delete own[hex];
  if (Object.keys(own).length === 0) delete marks[model.id];
  save();
  notify();
}

export function proposeBand(model, hex) {
  set(model, hex, 'add');
}

export const proposedBands = (model) =>
  Object.entries(marks[model.id] ?? {}).filter(([, v]) => v === 'add').map(([hex]) => hex);

export function cycleVerdict(model, hex) {
  const current = verdictOf(model, hex);
  if (current === 'add') {
    set(model, hex, null);
    return null;
  }
  const next = VERDICTS[VERDICTS.indexOf(current) + 1] ?? null;
  set(model, hex, next);
  return next;
}

export function markCount() {
  return Object.values(marks).reduce((n, own) => n + Object.keys(own).length, 0);
}

export function clearMarks() {
  marks = {};
  save();
  notify();
}

export const allMarks = () =>
  Object.fromEntries(
    Object.entries(marks)
      .filter(([, own]) => Object.keys(own).length)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, own]) => [
        id,
        Object.fromEntries(Object.entries(own).sort(([a], [b]) => a.localeCompare(b))),
      ]),
  );

export function colorSwatches(model, { onChange: onEdit } = {}) {
  if (!model.colors?.length && !bands.length) return null;
  const strip = document.createElement('div');
  strip.className = 'detail-stalen';

  const redraw = () => {
    const fresh = colorSwatches(model, { onChange: onEdit });
    if (fresh) strip.replaceWith(fresh);
    onEdit?.();
  };

  const swatch = (hex) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'detail-staal';
    dot.style.setProperty('--staal-kleur', hex);
    const verdict = verdictOf(model, hex);
    dot.title = `${bandLabel(hex)} — ${verdictLabel(verdict)} (tap to change)`;
    if (verdict) dot.dataset.oordeel = verdict;
    dot.addEventListener('click', () => {
      cycleVerdict(model, hex);
      redraw();
    });
    return dot;
  };

  for (const hex of model.colors ?? []) strip.append(swatch(hex));
  for (const hex of proposedBands(model)) {
    if (!model.colors?.includes(hex)) strip.append(swatch(hex));
  }

  if (bands.length) strip.append(bandPicker(model, redraw));
  return strip;
}

function bandPicker(model, redraw) {
  const picker = document.createElement('select');
  picker.className = 'detail-staal-keuze';
  picker.setAttribute('aria-label', 'Propose a band this model should carry');
  picker.title = 'Propose a band this model should carry';
  const placeholder = new Option('+', '');
  placeholder.disabled = true;
  placeholder.selected = true;
  picker.append(placeholder);
  for (const band of bands) picker.append(new Option(band.name, band.hex));
  picker.addEventListener('change', () => {
    if (!picker.value) return;
    proposeBand(model, picker.value);
    redraw();
  });
  return picker;
}
