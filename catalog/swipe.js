import { renderTagEditor, effectiveKind } from './tag-edits.js?v=9e888b8bf6';
import { makeChipStrip, layoutChips, syncChips, showChipState as showState, chipName } from './chiprij.js?v=9e888b8bf6';
import { renderCommentBox } from './comments.js?v=9e888b8bf6';
import { mountExtractBar, setPageParts, downloadExtract } from './extract.js?v=9e888b8bf6';
import './bouwstempel.js?v=9e888b8bf6';

const DIRECTIONS = [
  { id: 'links', sign: '←', name: 'Left', default: 'Discard' },
  { id: 'rechts', sign: '→', name: 'Right', default: 'Keep' },
  { id: 'omhoog', sign: '↑', name: 'Up', default: 'Tag' },
  { id: 'omlaag', sign: '↓', name: 'Down', default: 'Later' },
];

const DIRECTION_IDS = DIRECTIONS.map((r) => r.id);

const SOURCES = {
  catalogus: { file: 'catalog.json', title: 'Swipe models', labels: null },
  missing: {
    file: 'missing.json',
    title: 'Swipe what is missing',
    labels: { links: 'Rightly left out', rechts: 'Wants adding', omhoog: 'Wrong style', omlaag: 'Look again' },
  },
  lint: {
    file: 'catalog.json',
    title: 'Swipe the size lint',
    key: 'lint',
    onlyLint: true,
    labels: { links: 'Retag', rechts: 'Add tag', omhoog: 'Flag rescale', omlaag: 'TBD' },
  },
};

const PARAMS = new URLSearchParams(location.search);
const SOURCE = SOURCES[PARAMS.get('source')] ?? SOURCES.catalogus;
const KIT_PARAM = PARAMS.get('kit')?.trim() || null;
const STORAGE_KEY =
  `taaleiland-swipe-v1${SOURCE.key ? `-${SOURCE.key}` : SOURCE === SOURCES.catalogus ? '' : '-missing'}`
  + `${KIT_PARAM ? `-${KIT_PARAM}` : ''}`;
const threshold = () => Math.max(48, Math.min(96, innerWidth * 0.2));
const FLAT_ENVIRONMENT = 'effen-omgeving.png';
const SOFT_ENVIRONMENT = 'zachte-omgeving.png';

let limitsPerKind = {};
let longestKinds = new Set();
let drawAtScale = null;

const lintText = (f) =>
  `${f.level} · ${f.measure} ${f.value} ${f.bound === 'min' ? 'under min' : 'over max'} ${f.limit} (${f.from})`;

const number = new Intl.NumberFormat('en-GB');
const unit = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

const readableBytes = (bytes) =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} kB`;

const dimensions = (wdh) =>
  Array.isArray(wdh) ? `${wdh.map((v) => unit.format(v)).join(' × ')} units` : '—';

let modelPath = 'kits/workfiles';

const CATALOG_VERSION = document.querySelector('meta[name="catalogus-versie"]')?.content ?? '';
const modelUrl = (path) => (CATALOG_VERSION ? `${path}?v=${CATALOG_VERSION}` : path);

function hydrate(m) {
  m.id = `${m.kit}/${m.name}`;
  m.path = `${modelPath}/${m.kit}/${m.name}.glb`;
  return m;
}

const el = (sel) => document.querySelector(sel);

const setup = el('#opzet');
const deck = el('#dek');
const results = el('#uitslag');
const stack = el('#stapel');
const notice = el('#melding');
const summary = el('#samenvatting');

const flatMode = { on: false };

let refreshExtract = () => {};

const register = { models: [], perId: new Map(), kits: new Map(), kinds: new Map(), tags: new Map() };

const WITHOUT = '_zonder';
const kindParent = (id) => (id.includes('-') ? id.slice(0, id.lastIndexOf('-')) : null);
const kindChain = (id) => {
  const chain = [];
  for (let k = id; k; k = kindParent(k)) chain.unshift(k);
  return chain;
};
const kindLabel = (id) => (id ? kindChain(id).map((k) => register.kinds.get(k)?.name ?? k).join(' › ') : '—');

const parentOf = new Map();
const tagCache = new WeakMap();

function tagsOf(model) {
  if (!tagCache.has(model)) {
    const own = new Set(model.tags ?? []);
    for (const id of model.tags ?? []) {
      for (let p = parentOf.get(id); p && !own.has(p); p = parentOf.get(p)) own.add(p);
    }
    tagCache.set(model, [...own]);
  }
  return tagCache.get(model);
}

const labelDefault = (direction) => SOURCE.labels?.[direction.id] ?? direction.default;

const FILTER_FIELDS = ['kits', 'kinds', 'tags'];

const asState = (value) => {
  if (Array.isArray(value)) return Object.fromEntries(value.map((id) => [id, 'only']));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).filter(([, v]) => v === 'only' || v === 'not'),
    );
  }
  return {};
};

const state = {
  filters: { search: '', kits: {}, kinds: {}, tags: {}, shuffle: false },
  labels: Object.fromEntries(DIRECTIONS.map((r) => [r.id, labelDefault(r)])),
  order: [],
  choices: [],
  started: false,
};

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function load() {
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return;
  }
  if (!stored || typeof stored !== 'object') return;

  Object.assign(state.filters, stored.filters ?? {});
  for (const field of FILTER_FIELDS) state.filters[field] = asState(state.filters[field]);
  for (const direction of DIRECTION_IDS) {
    if (typeof stored.labels?.[direction] === 'string') state.labels[direction] = stored.labels[direction];
  }
  state.order = (stored.order ?? []).filter((id) => register.perId.has(id));
  state.choices = (stored.choices ?? []).filter(
    (k) => register.perId.has(k?.id) && DIRECTION_IDS.includes(k?.direction),
  );
  state.started = Boolean(stored.started) && state.order.length > 0;
}

const labelFor = (direction) =>
  state.labels[direction]?.trim() || labelDefault(DIRECTIONS.find((r) => r.id === direction));

const choicePerId = () => new Map(state.choices.map((k) => [k.id, k.direction]));

function remaining() {
  const decided = choicePerId();
  return state.order.filter((id) => !decided.has(id));
}

const keysWith = (own, value) => Object.keys(own).filter((id) => own[id] === value);

function passes(mine, own) {
  const only = keysWith(own, 'only');
  if (only.length && !mine.some((id) => only.includes(id))) return false;
  const not = keysWith(own, 'not');
  return !mine.some((id) => not.includes(id));
}

function matches(model) {
  const { search, kits, kinds, tags } = state.filters;
  if (!passes([model.kit], kits)) return false;
  const chain = model.kind ? kindChain(model.kind) : [WITHOUT];
  if (!passes(chain, kinds)) return false;
  if (!passes(tagsOf(model), tags)) return false;
  if (search) {
    const needle = search.toLowerCase();
    if (!`${model.name} ${model.kit} ${model.kind ?? ''}`.toLowerCase().includes(needle)) return false;
  }
  return true;
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function show(screen) {
  document.body.dataset.scherm = screen;
  setup.hidden = screen !== 'opzet';
  deck.hidden = screen !== 'dek';
  results.hidden = screen !== 'uitslag';
  if (screen === 'dek') drawDeck();
  if (screen === 'uitslag') drawResults();
  updateSummary();
}

function updateSummary() {
  refreshExtract();
  const total = state.order.length;
  if (!total) {
    summary.textContent = 'No models in this selection — adjust the settings.';
    return;
  }
  const done = state.choices.length;
  const parts = DIRECTIONS.map((r) => {
    const count = state.choices.filter((k) => k.direction === r.id).length;
    return `${r.sign} ${labelFor(r.id)} ${count}`;
  });
  summary.textContent = `${number.format(done)} of ${number.format(total)} judged · ${parts.join(' · ')}`;
}

const draft = { kits: {}, kinds: {}, tags: {} };
const filterChips = [];

const NEXT = { undefined: 'only', only: 'not', not: undefined };

function setupFilters() {
  return {
    search: el('#zoek').value.trim(),
    kits: { ...draft.kits },
    kinds: { ...draft.kinds },
    tags: { ...draft.tags },
    shuffle: el('#schud').checked,
  };
}

function syncFilterChips() {
  syncChips(filterChips, {
    stateOf: (id, chip) => draft[chip.field][id],
    onHide: (chip) => { delete draft[chip.field][chip.id]; },
  });
  layoutChips(filterChips);
  for (const block of document.querySelectorAll('.opzet-rij')) {
    const strip = block.querySelector('.opzet-rij-strook');
    block.classList.toggle('opzet-rij-past', strip.scrollHeight <= strip.clientHeight + 1);
  }
}

function filterRow(container, head, items, field, { byCount = false } = {}) {
  const block = document.createElement('div');
  block.className = 'opzet-rij';

  const title = document.createElement('span');
  title.className = 'opzet-rij-kop';
  title.textContent = head;

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'opzet-meer';
  more.textContent = 'more';
  more.setAttribute('aria-expanded', 'false');
  more.addEventListener('click', () => {
    const open = block.classList.toggle('opzet-rij-open');
    more.textContent = open ? 'less' : 'more';
    more.setAttribute('aria-expanded', String(open));
  });

  const strip = document.createElement('div');
  strip.className = 'opzet-rij-strook';

  block.append(title, strip, more);
  container.append(block);

  const { chips } = makeChipStrip({
    label: `Filter by ${head.toLowerCase()}`,
    items, container: strip, byCount, hideEmpty: true,
    stateOf: (id) => draft[field][id],
    onPick: (id, button) => {
      const next = NEXT[draft[field][id]];
      if (next) draft[field][id] = next;
      else delete draft[field][id];
      showState(button, next);
      syncFilterChips();
      setupCount();
    },
  });
  for (const chip of chips) chip.field = field;
  filterChips.push(...chips);
}

function filterItems() {
  const count = (belongs) => register.models.filter(belongs).length;

  const kits = [...register.kits.values()]
    .map((k) => ({
      id: k.slug,
      name: (k.name ?? k.slug).replace(/\s+Kit$/, ''),
      full: k.name,
      count: count((m) => m.kit === k.slug),
    }))
    .filter((k) => k.count > 0);

  const kinds = [...register.kinds.values()]
    .map((k) => ({
      id: k.id,
      name: chipName(k),
      full: k.name,
      hint: k.description,
      parent: kindParent(k.id),
      count: count((m) => m.kind && kindChain(m.kind).includes(k.id)),
    }))
    .filter((k) => k.count > 0);
  const noKind = count((m) => !m.kind);
  if (noKind) kinds.push({ id: WITHOUT, name: 'No kind', count: noKind });

  const tags = [...register.tags.values()]
    .filter((t) => t.type !== 'kind' && t.type !== 'size')
    .map((t) => ({
      id: t.id,
      name: chipName(t),
      full: t.name,
      hint: t.description,
      parent: t.parent ?? null,
      count: count((m) => tagsOf(m).includes(t.id)),
    }))
    .filter((t) => t.count > 0);

  return { kits, kinds, tags };
}

function buildFilterRows() {
  const container = el('#opzet-filters');
  container.replaceChildren();
  filterChips.length = 0;
  const items = filterItems();
  if (items.kits.length > 1) filterRow(container, 'Kit', items.kits, 'kits', { byCount: true });
  filterRow(container, 'Kind', items.kinds, 'kinds');
  if (items.tags.length) filterRow(container, 'Tag', items.tags, 'tags', { byCount: true });
}

function setupCount() {
  const previous = state.filters;
  state.filters = setupFilters();
  const count = register.models.filter(matches).length;
  state.filters = previous;
  el('#opzet-telling').textContent = `${number.format(count)} model${count === 1 ? '' : 's'} in this selection`;
  el('#opzet-start').disabled = count === 0;
}

function fillSetup() {
  for (const field of FILTER_FIELDS) draft[field] = { ...state.filters[field] };
  if (!filterChips.length) buildFilterRows();
  syncFilterChips();
  el('#zoek').value = state.filters.search;
  el('#schud').checked = state.filters.shuffle;
  for (const direction of DIRECTIONS) el(`#label-${direction.id}`).value = state.labels[direction.id];
  setupCount();
}

function setLighting(viewer) {
  viewer.setAttribute('tone-mapping', 'neutral');
  if (flatMode.on) {
    viewer.setAttribute('environment-image', FLAT_ENVIRONMENT);
    viewer.setAttribute('shadow-intensity', '0');
    viewer.setAttribute('exposure', '1.3');
  } else {
    viewer.setAttribute('environment-image', SOFT_ENVIRONMENT);
    viewer.setAttribute('shadow-intensity', '0.7');
    viewer.setAttribute('exposure', '1.5');
  }
}

function makeCard(model, depth) {
  const kit = register.kits.get(model.kit);

  const card = document.createElement('article');
  card.className = 'swipe-kaart';
  card.dataset.diepte = String(depth);
  card.dataset.id = model.id;

  const findings = SOURCE.onlyLint ? (model.lint ?? []) : [];

  const box = document.createElement('div');
  box.className = 'swipe-viewer';
  const viewer = document.createElement('model-viewer');
  viewer.src = modelUrl(`../${model.path}`);
  viewer.alt = `3D model ${model.name} from ${kit?.name ?? model.kit}`;
  viewer.setAttribute('camera-orbit', '35deg 68deg auto');
  viewer.setAttribute('shadow-softness', '0.9');
  viewer.setAttribute('interaction-prompt', 'none');
  viewer.setAttribute('loading', 'eager');
  setLighting(viewer);
  box.append(viewer);

  const text = document.createElement('div');
  text.className = 'swipe-tekst';
  const name = document.createElement('h2');
  name.textContent = model.name;
  const origin = document.createElement('p');
  origin.className = 'herkomst';
  origin.textContent = `${kit?.name ?? model.kit} · ${kindLabel(model.kind)}`;
  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = [
    dimensions(model.wdh),
    `${number.format(model.tris)} triangles`,
    `${number.format(model.mat)} glTF material${model.mat === 1 ? '' : 's'}`,
    readableBytes(model.bytes),
  ].join(' · ');
  const path = document.createElement('p');
  path.className = 'pad';
  path.textContent = model.path;

  const lint = document.createElement('ul');
  lint.className = 'lintlijst';
  lint.replaceChildren(...findings.map((f) => {
    const row = document.createElement('li');
    row.className = `lintregel lint-${f.level}`;
    row.textContent = lintText(f);
    return row;
  }));
  const tags = document.createElement('div');
  tags.className = 'swipe-tags';
  renderTagEditor(tags, model, register.tags, {
    onChange: () => { origin.textContent = `${kit?.name ?? model.kit} · ${kindLabel(effectiveKind(model, register.tags))}`; },
  });
  const schaal = document.createElement('div');
  schaal.className = 'swipe-schaal';
  if (findings.length) {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 300;
    schaal.append(canvas);
    drawScaleCard(model, canvas).catch((error) => {
      console.error('scale draw failed', model.id, error);
      schaal.remove();
    });
  }

  const note = document.createElement('div');
  note.className = 'swipe-opmerking';
  renderCommentBox(note, model);

  text.append(name, origin, meta, path, ...(findings.length ? [lint, schaal] : []), tags, note);

  const rotate = document.createElement('button');
  rotate.type = 'button';
  rotate.className = 'knop draaiknop';
  rotate.textContent = '⟲ Rotate';
  rotate.title = 'Temporarily disable dragging so you can spin the model';
  rotate.setAttribute('aria-pressed', 'false');
  rotate.addEventListener('click', () => {
    const on = !viewer.hasAttribute('camera-controls');
    viewer.toggleAttribute('camera-controls', on);
    card.toggleAttribute('data-draaien', on);
    rotate.setAttribute('aria-pressed', String(on));
    rotate.textContent = on ? '⟲ Rotating' : '⟲ Rotate';
  });

  const stamp = document.createElement('span');
  stamp.className = 'stempel';

  card.append(box, text, rotate, stamp);
  if (depth === 0) makeDraggable(card);
  return card;
}

async function drawScaleCard(model, canvas) {
  if (!drawAtScale) ({ drawFamily: drawAtScale } = await import('./scale-draw.js?v=9e888b8bf6'));
  const limits = limitsPerKind[model.kind] ?? {};
  const high = model.wdh[2];
  const longest = Math.max(...model.wdh);
  const reach = Math.max(high, longest, ...Object.values(limits).filter((v) => v <= longest * 4));
  const step = 0.2;
  const rulerHeight = Math.max(step, Math.ceil((reach * 1.25) / step) * step);
  await drawAtScale(
    {
      slug: model.kind,
      name: model.kind,
      limits,
      byLongest: longestKinds.has(model.kind) || undefined,
      rulerHeight,
      rowWidth: Math.max(model.wdh[0] * 4, reach * 1.1),
      items: [{ slug: model.kit, model: model.name, wdh: model.wdh, tags: model.tags, path: model.path }],
    },
    canvas,
    canvas.width,
  );
}

function drawDeck() {
  const queue = remaining();
  el('#voortgang-vulling').style.width =
    state.order.length ? `${(state.choices.length / state.order.length) * 100}%` : '0';
  el('#voortgang-tekst').textContent = `${number.format(state.choices.length)} / ${number.format(state.order.length)}`;
  el('#terug').disabled = state.choices.length === 0;

  for (const direction of DIRECTIONS) {
    const label = labelFor(direction.id);
    el(`.dek-rand-${direction.id} span`).textContent = label;
    el(`.richtingknop[data-richting="${direction.id}"] span`).textContent = label;
  }

  if (queue.length === 0) {
    stack.replaceChildren();
    const done = document.createElement('p');
    done.className = 'bak-leeg';
    done.textContent = 'All judged — check out the results.';
    stack.append(done);
    if (state.order.length) show('uitslag');
    return;
  }

  const wanted = queue.slice(0, 2);
  const alive = [...stack.querySelectorAll('.swipe-kaart:not(.weg)')];
  const current = alive.map((k) => k.dataset.id).reverse();

  if (current.join() !== wanted.join()) {
    const reuse = new Map(alive.map((k) => [k.dataset.id, k]));
    const cards = wanted.map((id, i) => {
      const card = reuse.get(id) ?? makeCard(register.perId.get(id), i);
      card.dataset.diepte = String(i);
      if (i === 0) {
        card.classList.remove('veert');
        card.style.transform = '';
        makeDraggable(card);
      }
      return card;
    });
    stack.replaceChildren(...cards.reverse());
  }
  updateSummary();
}

function markEdge(direction) {
  for (const edge of document.querySelectorAll('.dek-rand')) {
    if (edge.dataset.richting === direction) edge.dataset.actief = '';
    else delete edge.dataset.actief;
  }
}

function directionFrom(dx, dy) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold()) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'links' : 'rechts';
  return dy < 0 ? 'omhoog' : 'omlaag';
}

function makeDraggable(card) {
  if (card.dataset.sleep) return;
  card.dataset.sleep = 'ja';
  const stamp = card.querySelector('.stempel');
  let start = null;

  const move = (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 28}deg)`;
    const direction = directionFrom(dx, dy);
    markEdge(direction);
    if (direction) {
      stamp.dataset.richting = direction;
      stamp.textContent = labelFor(direction);
      stamp.style.opacity = String(Math.min(1, Math.max(Math.abs(dx), Math.abs(dy)) / (threshold() * 1.6)));
    } else {
      stamp.style.opacity = '0';
    }
  };

  const stop = (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    card.releasePointerCapture?.(start.id);
    start = null;
    card.removeEventListener('pointermove', move);
    markEdge(null);
    const direction = directionFrom(dx, dy);
    if (direction) {
      choose(direction);
    } else {
      stamp.style.opacity = '0';
      card.classList.add('veert');
      card.style.transform = '';
      setTimeout(() => card.classList.remove('veert'), 220);
    }
  };

  card.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, input, textarea, .tagedit-toggles')) return;
    if (card.hasAttribute('data-draaien') && e.target.closest('model-viewer')) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    card.setPointerCapture(e.pointerId);
    card.addEventListener('pointermove', move);
  });
  card.addEventListener('pointerup', stop);
  card.addEventListener('pointercancel', stop);
}

const OFFSCREEN = {
  links: 'translate(-120vw, 0) rotate(-18deg)',
  rechts: 'translate(120vw, 0) rotate(18deg)',
  omhoog: 'translate(0, -120vh)',
  omlaag: 'translate(0, 120vh)',
};

function choose(direction) {
  const queue = remaining();
  const id = queue[0];
  if (!id) return;

  const card = stack.querySelector('.swipe-kaart[data-diepte="0"]:not(.weg)');
  state.choices.push({ id, direction });
  save();

  if (card) {
    card.classList.add('weg');
    card.style.transform = OFFSCREEN[direction];
    card.addEventListener('transitionend', () => card.remove(), { once: true });
    setTimeout(() => card.remove(), 400);
    setTimeout(drawDeck, 180);
  } else {
    drawDeck();
  }
  updateSummary();
}

function undo(id) {
  const index = id ? state.choices.findLastIndex((k) => k.id === id) : state.choices.length - 1;
  if (index === -1) return;
  state.choices.splice(index, 1);
  save();
  stack.replaceChildren();
  if (results.hidden) drawDeck();
  else drawResults();
  updateSummary();
}

function rows() {
  return state.choices.map(({ id, direction }) => {
    const model = register.perId.get(id);
    return {
      id,
      name: model.name,
      kit: model.kit,
      kind: model.kind ?? null,
      path: model.path,
      direction,
      label: labelFor(direction),
    };
  });
}

async function copy(text, button) {
  const old = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy failed';
  }
  setTimeout(() => { button.textContent = old; }, 1400);
}

function copyButton(text, label, list) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'knop';
  button.textContent = label;
  button.disabled = list.length === 0;
  button.addEventListener('click', () => copy(text, button));
  return button;
}

function drawResults() {
  const bins = el('#uitslag-bakken');
  bins.replaceChildren();
  const all = rows();

  for (const direction of DIRECTIONS) {
    const list = all.filter((r) => r.direction === direction.id);
    const bin = document.createElement('section');
    bin.className = 'bak';
    bin.dataset.richting = direction.id;

    const head = document.createElement('div');
    head.className = 'bak-kop';
    const title = document.createElement('h3');
    title.textContent = `${direction.sign} ${labelFor(direction.id)}`;
    const count = document.createElement('span');
    count.className = 'aantal';
    count.textContent = `${number.format(list.length)}`;
    head.append(title, count);
    bin.append(head);

    if (list.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'bak-leeg';
      empty.textContent = 'Nothing in this direction yet.';
      bin.append(empty);
    } else {
      const ul = document.createElement('ul');
      ul.className = 'bak-lijst';
      for (const row of list) {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'naam';
        name.textContent = row.name;
        name.title = row.path;
        const kit = document.createElement('span');
        kit.className = 'kit';
        kit.textContent = row.kit;
        const back = document.createElement('button');
        back.type = 'button';
        back.textContent = '↺';
        back.title = 'Put back in the stack';
        back.addEventListener('click', () => undo(row.id));
        li.append(name, kit, back);
        ul.append(li);
      }
      bin.append(ul);
    }

    const actions = document.createElement('div');
    actions.className = 'bak-acties';
    actions.append(
      copyButton(list.map((r) => r.path).join('\n'), 'Copy paths', list),
      copyButton(list.map((r) => r.id).join('\n'), 'Copy ids', list),
    );
    bin.append(actions);
    bins.append(bin);
  }

  const open = remaining().length;
  const rest = document.createElement('section');
  rest.className = 'bak';
  const restHead = document.createElement('div');
  restHead.className = 'bak-kop';
  const restTitle = document.createElement('h3');
  restTitle.textContent = 'Still to do';
  const restCount = document.createElement('span');
  restCount.className = 'aantal';
  restCount.textContent = number.format(open);
  restHead.append(restTitle, restCount);
  const restText = document.createElement('p');
  restText.className = 'bak-leeg';
  restText.textContent = open
    ? 'Keep swiping to judge these models.'
    : 'All models in this selection have been judged.';
  rest.append(restHead, restText);
  bins.append(rest);

  el('#verder').disabled = open === 0;
}

function file(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const timeStamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

function swipeSection() {
  const all = rows();
  if (!all.length) return {};
  return {
    swipe: {
      source: SOURCE.file,
      filters: state.filters,
      directions: Object.fromEntries(
        DIRECTIONS.map((r) => [
          r.id,
          { label: labelFor(r.id), paths: all.filter((x) => x.direction === r.id).map((x) => x.path) },
        ]),
      ),
      choices: SOURCE.onlyLint
        ? all.map((x) => ({ ...x, lint: register.perId.get(x.id)?.lint ?? [] }))
        : all,
      stillToDo: remaining().map((id) => register.perId.get(id).path),
    },
  };
}

function exportCsv() {
  const cell = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const rowsOut = [
    ['direction', 'label', 'id', 'name', 'kit', 'kind', 'path'],
    ...rows().map((r) => [r.direction, r.label, r.id, r.name, r.kit, r.kind, r.path]),
  ];
  file(`swipe-${timeStamp()}.csv`, rowsOut.map((row) => row.map(cell).join(',')).join('\n') + '\n', 'text/csv');
}

function markNav() {
  if (!SOURCE.key) return;
  const nav = document.querySelector('.paginabalk[aria-label="Pages"]');
  if (!nav) return;
  const current = nav.querySelector('[aria-current="page"]');
  const target = nav.querySelector(`a[href*="source=${SOURCE.key}"]`);
  if (!current || !target) return;
  const link = document.createElement('a');
  link.href = 'swipe.html';
  link.textContent = current.textContent;
  const here = document.createElement('span');
  here.setAttribute('aria-current', 'page');
  here.textContent = target.textContent;
  current.replaceWith(link);
  target.replaceWith(here);
}

async function start() {
  markNav();
  const response = await fetch(SOURCE.file);
  if (!response.ok) throw new Error(`${SOURCE.file} not found (${response.status})`);
  const data = await response.json();
  modelPath = data.modelPath ?? modelPath;
  data.models.forEach(hydrate);

  if (SOURCE.onlyLint) data.models = data.models.filter((m) => m.lint?.length);
  limitsPerKind = data.limits ?? {};
  longestKinds = new Set(data.byLongest ?? []);

  register.models = data.models;
  register.perId = new Map(data.models.map((m) => [m.id, m]));
  register.kits = new Map(data.kits.map((k) => [k.slug, k]));
  register.kinds = new Map((data.tags ?? []).filter((t) => t.type === 'kind').map((t) => [t.id, t]));
  register.tags = new Map((data.tags ?? []).map((t) => [t.id, t]));
  parentOf.clear();
  for (const tag of data.tags ?? []) {
    if (tag.parent) parentOf.set(tag.id, tag.parent);
  }

  const kit = KIT_PARAM && register.kits.has(KIT_PARAM) ? KIT_PARAM : null;
  if (KIT_PARAM && !kit) {
    notice.hidden = false;
    notice.className = 'leeg melding-fout';
    notice.textContent = `No kit ${KIT_PARAM} in ${SOURCE.file} — swiping everything instead.`;
  }
  const title = kit ? `${SOURCE.title} — ${register.kits.get(kit).name}` : SOURCE.title;
  document.title = `Taaleiland — ${title}`;
  const kop = el('.kop-titel h1 .breed');
  if (kop) kop.textContent = title;

  load();

  if (kit) {
    state.filters.kits = [kit];
    state.order = state.order.filter((id) => register.perId.get(id)?.kit === kit);
    state.choices = state.choices.filter((k) => register.perId.get(k.id)?.kit === kit);
    state.started = state.started && state.order.length > 0;
  }

  el('#opzet-formulier').addEventListener('submit', (e) => {
    e.preventDefault();
    state.filters = setupFilters();
    for (const direction of DIRECTIONS) state.labels[direction.id] = el(`#label-${direction.id}`).value.trim() || labelDefault(direction);
    const selection = register.models.filter(matches).map((m) => m.id);
    state.order = state.filters.shuffle ? shuffle(selection) : selection;
    const inSelection = new Set(state.order);
    state.choices = state.choices.filter((k) => inSelection.has(k.id));
    state.started = true;
    save();
    stack.replaceChildren();
    show('dek');
  });

  setPageParts({
    sections: swipeSection,
    counts: () => [{ n: state.choices.length, one: 'model judged', many: 'models judged' }],
  });
  refreshExtract = mountExtractBar();

  el('#opzet-formulier').addEventListener('input', setupCount);
  el('#opzet-wis').addEventListener('click', () => {
    for (const field of FILTER_FIELDS) draft[field] = {};
    el('#zoek').value = '';
    syncFilterChips();
    setupCount();
  });
  el('#opzet-annuleer').addEventListener('click', () => show('dek'));
  el('#instellingen').addEventListener('click', () => { show('opzet'); fillSetup(); });
  el('#naar-uitslag').addEventListener('click', () => show('uitslag'));
  el('#verder').addEventListener('click', () => show('dek'));
  el('#terug').addEventListener('click', () => undo());
  el('#download-json').addEventListener('click', () => downloadExtract());
  el('#download-csv').addEventListener('click', exportCsv);
  el('#wis-alles').addEventListener('click', () => {
    if (!confirm('Clear all choices?')) return;
    state.choices = [];
    save();
    drawResults();
    updateSummary();
  });

  for (const button of document.querySelectorAll('.richtingknop')) {
    button.addEventListener('click', () => choose(button.dataset.richting));
  }

  const lightButton = el('#licht');
  lightButton.addEventListener('click', () => {
    flatMode.on = !flatMode.on;
    lightButton.setAttribute('aria-pressed', String(flatMode.on));
    for (const viewer of document.querySelectorAll('model-viewer')) setLighting(viewer);
  });

  addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (!deck.hidden) {
      const perKey = {
        ArrowLeft: 'links',
        ArrowRight: 'rechts',
        ArrowUp: 'omhoog',
        ArrowDown: 'omlaag',
      };
      if (perKey[e.key]) {
        e.preventDefault();
        choose(perKey[e.key]);
        return;
      }
      if (e.key === 'z' || e.key === 'Z') return undo();
    }
    if (e.key === 'Escape' && setup.hidden) {
      e.preventDefault();
      show(results.hidden ? 'uitslag' : 'dek');
    }
  });

  if (!state.started) {
    state.order = register.models.filter((m) => !kit || m.kit === kit).map((m) => m.id);
    state.started = true;
    save();
  }
  show('dek');
}

start().catch((error) => {
  notice.hidden = false;
  notice.className = 'leeg melding-fout';
  notice.textContent = `Could not load the catalogue: ${error.message}`;
  summary.textContent = 'Could not load the catalogue.';
  console.error(error);
});
