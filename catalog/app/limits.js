import { drawFamily, loadModel } from './scale-draw.js?v=1a4089f5a1';
import { stamped } from './stamps.js?v=04e3ee3113';
import { WORKFILES, kindChain, readStore, writeStore, saveFile, unit } from './shared.js?v=06861d7ddb';
import './bouwstempel.js?v=964f9eed53';

const STORE_KEY = 'taaleiland-kind-limits-v1';
const MIN_MODELS = 3;
const MIN_KITS = 2;
const WIDTH = 1800;

const el = (s) => document.querySelector(s);
const load = (path) => fetch(stamped(path)).then((r) => r.json());

const [catalog, kindsFile, vars] = await Promise.all([
  load('../build/catalog.json'),
  load('../../lint/kinds.json'),
  load('../../lint/variables.json'),
]);

const kindNames = new Map((catalog.tags ?? []).filter((t) => t.type === 'kind').map((t) => [t.id, t.name]));
const kindLabel = (id) => kindChain(id).map((k) => kindNames.get(k) ?? k).join(' › ');
const kitNames = new Map((catalog.kits ?? []).map((k) => [k.slug, k.name]));
const DEFAULTS = kindsFile.defaults ?? {};

const under = (kind, root) => kind === root || kind.startsWith(`${root}-`);
const exempt = (m) =>
  vars.exemptKinds.some((k) => under(m.kind, k)) ||
  (m.tags ?? []).some((t) => vars.exemptTags.includes(t) || t.startsWith('scale-'));

const perKind = new Map();
for (const m of catalog.models ?? []) {
  if (!m.kind || exempt(m)) continue;
  if (!perKind.has(m.kind)) perKind.set(m.kind, []);
  perKind.get(m.kind).push(m);
}

const valueOf = (m, measure) => (measure === 'high' ? m.wdh[2] : Math.max(...m.wdh));

const ownLimit = (limits, field) => {
  const v = limits?.[field];
  return Number.isFinite(v) && v !== DEFAULTS[field] ? v : null;
};

const currentOf = (kind) => {
  const limits = catalog.limits?.[kind];
  for (const measure of ['longest', 'high']) {
    const min = ownLimit(limits, `${measure}.min`);
    const max = ownLimit(limits, `${measure}.max`);
    if (min !== null || max !== null) return { measure, min, max };
  }
  return null;
};

const kinds = [...perKind]
  .map(([kind, models]) => ({ kind, models, kits: new Set(models.map((m) => m.collection ?? m.kit)) }))
  .filter((k) => k.models.length >= MIN_MODELS && k.kits.size >= MIN_KITS)
  .sort((a, b) => a.kind.localeCompare(b.kind));
for (const k of kinds) k.current = currentOf(k.kind);

const stored = readStore(STORE_KEY);
const choices = new Map(Object.entries(stored.choices ?? {}));
const history = Array.isArray(stored.history) ? stored.history.filter((id) => choices.has(id)) : [];
const save = () => writeStore(STORE_KEY, { choices: Object.fromEntries(choices), history });

const round = (v) => (v < 0.1 ? Math.max(Math.round(v * 100) / 100, 0.01) : Math.round(v * 20) / 20);
const format = (v) => (v === null || v === undefined ? '—' : unit.format(v));

let index = -1;
let state = null;

const canvas = el('#doek canvas');
const strip = el('#strip');
const minInput = el('#min');
const maxInput = el('#max');

const nextOpen = (from = 0) => {
  for (let i = 0; i < kinds.length; i++) {
    const at = (from + i) % kinds.length;
    if (!choices.has(kinds[at].kind)) return at;
  }
  return -1;
};

function showProgress() {
  const saved = [...choices.values()].filter((c) => !c.skip).length;
  el('#voortgang').textContent = `${choices.size}/${kinds.length} · ${saved} saved · ${choices.size - saved} skipped`;
}

function open(at) {
  index = at;
  showProgress();
  if (at < 0) {
    el('#kaart').hidden = true;
    showResults();
    return;
  }
  const k = kinds[at];
  const earlier = choices.get(k.kind);
  const from = earlier && !earlier.skip ? earlier : k.current;
  state = {
    k,
    measure: from?.measure ?? 'longest',
    min: from?.min ?? null,
    max: from?.max ?? null,
  };
  el('#kind-naam').textContent = kindLabel(k.kind);
  el('#kind-feiten').textContent = `${k.kind} · ${k.models.length} models · ${k.kits.size} kits`;
  const cur = k.current;
  el('#nu').textContent = cur ? `current: ${cur.measure} ${format(cur.min)}–${format(cur.max)}` : 'current: none';
  for (const m of k.models) loadModel(`${WORKFILES}/${m.kit}/${m.name}.glb`, m.hash).catch(() => {});
  el('#uitslag').hidden = true;
  el('#kaart').hidden = false;
  refresh(true);
}

function refresh(redraw) {
  for (const b of document.querySelectorAll('[data-maat]')) b.setAttribute('aria-pressed', String(b.dataset.maat === state.measure));
  minInput.value = state.min ?? '';
  maxInput.value = state.max ?? '';
  drawStrip();
  scheduleDraw(redraw);
}

let drawToken = 0;
let drawTimer = null;
function scheduleDraw(now) {
  clearTimeout(drawTimer);
  drawTimer = setTimeout(draw, now ? 0 : 120);
}

async function draw() {
  const token = ++drawToken;
  const { k, measure, min, max } = state;
  const limits = {};
  if (min !== null) limits[`${measure}.min`] = min;
  if (max !== null) limits[`${measure}.max`] = max;
  const group = {
    name: kindLabel(k.kind),
    byLongest: measure === 'longest',
    limits,
    items: [...k.models]
      .sort((a, b) => valueOf(a, measure) - valueOf(b, measure))
      .map((m) => ({
        path: `${WORKFILES}/${m.kit}/${m.name}.glb`,
        hash: m.hash,
        model: m.name,
        kit: (kitNames.get(m.collection ?? m.kit) ?? m.kit).replace(/\s+Kit$/, ''),
        tags: m.tags,
      })),
  };
  el('#doek').classList.add('bezig');
  try {
    await drawFamily(group, canvas, WIDTH);
  } catch (error) {
    console.error('line-up failed', k.kind, error);
  }
  if (token === drawToken) el('#doek').classList.remove('bezig');
}

const SVG = 'http://www.w3.org/2000/svg';
const STRIP_H = 64;
const PAD = 14;

function scaleFor(values) {
  const lo = Math.min(...values) / 1.4;
  const hi = Math.max(...values) * 1.4;
  const w = strip.clientWidth || 500;
  const toX = (v) => PAD + ((Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (w - PAD * 2);
  const fromX = (x) => Math.exp(Math.log(lo) + ((x - PAD) / (w - PAD * 2)) * (Math.log(hi) - Math.log(lo)));
  return { lo, hi, w, toX, fromX };
}

const niceTicks = (lo, hi) => {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const f of [1, 2, 5]) {
      const v = f * 10 ** e;
      if (v >= lo && v <= hi) out.push(v);
    }
  }
  return out;
};

function drawStrip() {
  const { k, measure, min, max } = state;
  const values = k.models.map((m) => valueOf(m, measure));
  const sc = scaleFor([...values, ...[min, max, k.current?.measure === measure ? k.current.min : null,
    k.current?.measure === measure ? k.current.max : null].filter((v) => v > 0)]);
  state.scale = sc;
  strip.setAttribute('viewBox', `0 0 ${sc.w} ${STRIP_H}`);
  strip.replaceChildren();
  const add = (tag, attrs, text) => {
    const n = document.createElementNS(SVG, tag);
    for (const [a, v] of Object.entries(attrs)) n.setAttribute(a, v);
    if (text !== undefined) n.textContent = text;
    strip.appendChild(n);
    return n;
  };
  const axis = 34;
  add('line', { x1: PAD, x2: sc.w - PAD, y1: axis, y2: axis, class: 'as' });
  for (const t of niceTicks(sc.lo, sc.hi)) {
    add('line', { x1: sc.toX(t), x2: sc.toX(t), y1: axis, y2: axis + 4, class: 'as' });
    add('text', { x: sc.toX(t), y: axis + 15, class: 'tik' }, unit.format(t));
  }
  if (min !== null || max !== null) {
    const a = sc.toX(min ?? sc.lo);
    const b = sc.toX(max ?? sc.hi);
    add('rect', { x: Math.min(a, b), y: 8, width: Math.abs(b - a), height: axis - 8, class: 'bereik' });
  }
  let below = 0;
  let above = 0;
  k.models.forEach((m, i) => {
    const v = values[i];
    const out = (min !== null && v < min) || (max !== null && v > max);
    if (min !== null && v < min) below++;
    if (max !== null && v > max) above++;
    const dot = add('circle', { cx: sc.toX(v), cy: axis - 8 - (i % 3) * 7, r: 4, class: out ? 'stip buiten' : 'stip' });
    const title = document.createElementNS(SVG, 'title');
    title.textContent = `${m.kit}/${m.name} · ${unit.format(v)}`;
    dot.appendChild(title);
    dot.dataset.v = v;
  });
  for (const [which, v] of [['min', min], ['max', max]]) {
    if (v === null) continue;
    const x = sc.toX(v);
    add('line', { x1: x, x2: x, y1: 4, y2: axis + 2, class: 'greep-lijn' });
    add('rect', { x: x - 7, y: 0, width: 14, height: 12, rx: 3, class: 'greep', 'data-greep': which });
  }
  el('#buiten').textContent = below + above ? `${below} below · ${above} above` : 'all inside';
}

const setLimit = (which, v) => {
  state[which] = v === null ? null : round(v);
  if (state.min !== null && state.max !== null && state.min > state.max) {
    [state.min, state.max] = [state.max, state.min];
  }
  refresh(false);
};

const svgX = (e) => {
  const r = strip.getBoundingClientRect();
  return ((e.clientX - r.left) / r.width) * state.scale.w;
};

let dragging = null;
strip.addEventListener('pointerdown', (e) => {
  const x = svgX(e);
  const handle = e.target.dataset?.greep;
  if (e.target.classList.contains('stip') && !handle) {
    const v = Number(e.target.dataset.v);
    const nearest = state.min === null ? 'min' : state.max === null ? 'max'
      : Math.abs(Math.log(v / state.min)) <= Math.abs(Math.log(v / state.max)) ? 'min' : 'max';
    setLimit(nearest, v);
    return;
  }
  const near = ['min', 'max']
    .filter((w) => state[w] !== null)
    .map((w) => ({ w, d: Math.abs(state.scale.toX(state[w]) - x) }))
    .sort((a, b) => a.d - b.d)[0];
  if (handle || (near && near.d < 16)) {
    dragging = handle ?? near.w;
    strip.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
});
strip.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const v = Math.min(Math.max(state.scale.fromX(svgX(e)), state.scale.lo), state.scale.hi);
  state[dragging] = round(v);
  minInput.value = state.min ?? '';
  maxInput.value = state.max ?? '';
  drawStrip();
});
const endDrag = () => {
  if (!dragging) return;
  dragging = null;
  setLimit('min', state.min);
};
strip.addEventListener('pointerup', endDrag);
strip.addEventListener('pointercancel', endDrag);

const fromInput = (input) => (input.value === '' ? null : Math.max(Number(input.value), 0.01));
minInput.addEventListener('change', () => setLimit('min', fromInput(minInput)));
maxInput.addEventListener('change', () => setLimit('max', fromInput(maxInput)));

function setMeasure(measure) {
  if (state.measure === measure) return;
  state.measure = measure;
  const cur = state.k.current;
  if (cur?.measure === measure) {
    state.min = cur.min;
    state.max = cur.max;
  } else {
    fitAll();
    return;
  }
  refresh(true);
}

function fitAll() {
  const values = state.k.models.map((m) => valueOf(m, state.measure));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  state.min = lo < 0.1 ? Math.max(Math.floor(lo * 100) / 100, 0.01) : Math.floor(lo * 20) / 20;
  state.max = hi < 0.1 ? Math.ceil(hi * 100) / 100 : Math.ceil(hi * 20) / 20;
  refresh(true);
}

function resetCurrent() {
  const cur = state.k.current;
  state.measure = cur?.measure ?? state.measure;
  state.min = cur?.min ?? null;
  state.max = cur?.max ?? null;
  refresh(true);
}

function decide(skip) {
  if (index < 0) return;
  const { k, measure, min, max } = state;
  const choice = skip ? { skip: true } : { measure, min, max };
  choices.set(k.kind, choice);
  const at = history.indexOf(k.kind);
  if (at !== -1) history.splice(at, 1);
  history.push(k.kind);
  save();
  open(nextOpen(index + 1));
}

function undo() {
  const last = history.pop();
  if (!last) return;
  choices.delete(last);
  save();
  open(kinds.findIndex((k) => k.kind === last));
}

function showResults() {
  el('#kaart').hidden = true;
  const rows = el('#uitslag-rijen');
  rows.replaceChildren();
  for (const id of history) {
    const c = choices.get(id);
    const k = kinds.find((x) => x.kind === id);
    const cur = k?.current;
    const tr = document.createElement('tr');
    const cells = c.skip
      ? [kindLabel(id), 'skipped', '', '', '']
      : [kindLabel(id), c.measure, format(c.min), format(c.max)];
    if (!c.skip) cells.push(cur ? `${cur.measure} ${format(cur.min)}–${format(cur.max)}` : '—');
    for (const text of cells) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    if (c.skip) tr.classList.add('overgeslagen');
    tr.addEventListener('click', () => { if (k) open(kinds.indexOf(k)); });
    rows.appendChild(tr);
  }
  el('#uitslag').hidden = false;
}

function exportJson() {
  const out = {
    exported: new Date().toISOString(),
    scope: { minModels: MIN_MODELS, minKits: MIN_KITS, total: kinds.length },
    choices: history.map((id) => {
      const k = kinds.find((x) => x.kind === id);
      return { kind: id, ...choices.get(id), current: k?.current ?? null, models: k?.models.length, kits: k?.kits.size };
    }),
  };
  saveFile(`taalei-kind-limits-${out.exported.slice(0, 10)}.json`, `${JSON.stringify(out, null, 1)}\n`, 'application/json');
}

let swipeStart = null;
const doek = el('#doek');
doek.addEventListener('pointerdown', (e) => { swipeStart = { x: e.clientX, y: e.clientY }; });
doek.addEventListener('pointerup', (e) => {
  if (!swipeStart) return;
  const dx = e.clientX - swipeStart.x;
  const dy = e.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) decide(dx < 0);
});

for (const b of document.querySelectorAll('[data-maat]')) b.addEventListener('click', () => setMeasure(b.dataset.maat));
el('#alles').addEventListener('click', fitAll);
el('#huidig').addEventListener('click', resetCurrent);
el('#bewaar').addEventListener('click', () => decide(false));
el('#sla-over').addEventListener('click', () => decide(true));
el('#terug').addEventListener('click', undo);
el('#naar-uitslag').addEventListener('click', showResults);
el('#verder').addEventListener('click', () => open(index >= 0 && !el('#uitslag').hidden ? index : nextOpen()));
el('#download').addEventListener('click', exportJson);
el('#wis').addEventListener('click', () => {
  if (!confirm('Clear all recorded choices?')) return;
  choices.clear();
  history.length = 0;
  save();
  open(nextOpen());
});

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input') || el('#kaart').hidden) return;
  const key = e.key.toLowerCase();
  if (key === 'enter' || key === 'arrowright') decide(false);
  else if (key === 's' || key === 'arrowleft') decide(true);
  else if (key === 'z') undo();
  else if (key === 'l') setMeasure('longest');
  else if (key === 'h') setMeasure('high');
  else if (key === 'f') fitAll();
  else return;
  e.preventDefault();
});

window.addEventListener('resize', () => { if (state && !el('#kaart').hidden) drawStrip(); });

if (!kinds.length) {
  el('#melding').textContent = 'No kinds in scope.';
  el('#melding').hidden = false;
} else {
  open(nextOpen());
}
