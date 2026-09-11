// Colour verdicts made from the model panel, staged locally until exported.
// Shape: { [modelId]: { [hex]: 'partial' | 'wrong' | 'add' } } — a band the PO judges partly
// off ('partial'), plainly not the colour the rules ask for ('wrong'), or one the model
// does not carry and should ('add', picked from the band list). Purely a report:
// nothing here recolours anything, and no tool merges it back the way tag edits merge.
// It is the human counterpart of the lint findings the panel prints beside it.

const STORAGE_KEY = 'taaleiland-kleurmerken-v1';

// the cycle one tap walks on a band the model carries: clean → partial → wrong → clean
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

// A band the model does not carry but should. Proposing one twice is proposing it once.
export function proposeBand(model, hex) {
  set(model, hex, 'add');
}

// Bands proposed for this model, in the order they were picked.
export const proposedBands = (model) =>
  Object.entries(marks[model.id] ?? {}).filter(([, v]) => v === 'add').map(([hex]) => hex);

// Walks one band to the next verdict and stages it. Returns the verdict it landed on.
// A proposed band has nowhere further to walk: one tap takes the proposal back.
export function cycleVerdict(model, hex) {
  const current = verdictOf(model, hex);
  if (current === 'add') { set(model, hex, null); return null; }
  const next = VERDICTS[VERDICTS.indexOf(current) + 1] ?? null;
  const own = (marks[model.id] ??= {});
  if (next) own[hex] = next;
  else delete own[hex];
  if (Object.keys(own).length === 0) delete marks[model.id];
  save();
  notify();
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

const timeStamp = () => new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);

export function exportMarks() {
  const models = Object.fromEntries(
    Object.entries(marks)
      .filter(([, own]) => Object.keys(own).length)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, own]) => [id, Object.fromEntries(Object.entries(own).sort(([a], [b]) => a.localeCompare(b)))]),
  );
  const content = {
    tool: 'catalog colour marks',
    created: new Date().toISOString(),
    note: 'Colours a reader judged off, per model, keyed by the hex the panel shows: "partial" is partly wrong, "wrong" is the wrong colour outright, "add" is a band the model does not carry and should. A report against docs/asset_style_guide.md Appendix A — no tool merges this back.',
    models,
  };
  const blob = new Blob([JSON.stringify(content, null, 1) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `colour-marks-${timeStamp()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Wires the floating colour-mark bar (count · Download JSON · Clear). It sits beside the
// tag-edit bar and is hidden until something is marked, so a page with neither shows none.
export function mountMarkBar() {
  const bar = document.querySelector('#kleurmerk-balk');
  if (!bar) return;
  const label = bar.querySelector('#kleurmerk-balk-telling');
  const downloadButton = bar.querySelector('#kleurmerk-balk-download');
  const clearButton = bar.querySelector('#kleurmerk-balk-wis');

  function refresh() {
    const n = markCount();
    bar.hidden = n === 0;
    if (label) label.textContent = `${n} colour${n === 1 ? '' : 's'} marked`;
  }

  downloadButton?.addEventListener('click', () => exportMarks());
  clearButton?.addEventListener('click', () => {
    if (markCount() === 0) return;
    if (!confirm('Clear all colour marks? Nothing in the catalogue changes either way.')) return;
    clearMarks();
  });

  onChange(refresh);
  refresh();
}
