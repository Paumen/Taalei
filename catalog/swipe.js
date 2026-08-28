const DIRECTIONS = [
  { id: 'links', sign: '←', name: 'Left', default: 'Discard' },
  { id: 'rechts', sign: '→', name: 'Right', default: 'Keep' },
  { id: 'omhoog', sign: '↑', name: 'Up', default: 'Tag' },
  { id: 'omlaag', sign: '↓', name: 'Down', default: 'Later' },
];

const DIRECTION_IDS = DIRECTIONS.map((r) => r.id);

// ?source=missing swipes the second catalogue: everything a source pack holds that the
// catalogue doesn't. There the question isn't which models to keep but why each one was
// left out, so the directions start out named after reasons — all four are editable
// under Settings either way. The two decks keep their own choices.
const SOURCES = {
  catalogus: { file: 'catalog.json', title: 'Swipe models', labels: null },
  missing: {
    file: 'missing.json',
    title: 'Swipe what is missing',
    labels: { links: 'Rightly left out', rechts: 'Wants adding', omhoog: 'Wrong style', omlaag: 'Look again' },
  },
};

const SOURCE = SOURCES[new URLSearchParams(location.search).get('source')] ?? SOURCES.catalogus;
const STORAGE_KEY = `taaleiland-swipe-v1${SOURCE === SOURCES.catalogus ? '' : '-missing'}`;
const threshold = () => Math.max(48, Math.min(96, innerWidth * 0.2));
const FLAT_ENVIRONMENT = 'effen-omgeving.png';

const number = new Intl.NumberFormat('en-GB');
const unit = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

const readableBytes = (bytes) =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} kB`;

const dimensions = (wdh) =>
  Array.isArray(wdh) ? `${wdh.map((v) => unit.format(v)).join(' × ')} units` : '—';

// waar de .glb's van de gekozen catalogus staan; missing.json zegt het zelf
let modelPath = 'kits/workfiles';

// Zelfde stempel als op catalog.json, anders blijft een gecachte .glb hangen.
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

const register = { models: [], perId: new Map(), kits: new Map(), groups: new Map(), tags: new Map() };

const labelDefault = (direction) => SOURCE.labels?.[direction.id] ?? direction.default;

const state = {
  filters: { search: '', kits: [], groups: [], tags: [], shuffle: false },
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

function matches(model) {
  const { search, kits, groups, tags = [] } = state.filters;
  if (kits.length && !kits.includes(model.kit)) return false;
  if (groups.length && !groups.includes(model.gr)) return false;
  if (tags.length && !(model.tags ?? []).some((t) => tags.includes(t))) return false;
  if (search) {
    const needle = search.toLowerCase();
    if (!`${model.name} ${model.kit} ${model.gr}`.toLowerCase().includes(needle)) return false;
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

function checklist(container, items, chosen) {
  container.replaceChildren();
  for (const item of items) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = item.id;
    checkbox.checked = chosen.includes(item.id);
    const name = document.createElement('span');
    name.textContent = item.name;
    const count = document.createElement('span');
    count.className = 'aantal-mee';
    count.textContent = number.format(item.count);
    label.append(checkbox, name, count);
    container.append(label);
  }
}

function chosenValues(container) {
  return [...container.querySelectorAll('input:checked')].map((v) => v.value);
}

function setupFilters() {
  return {
    search: el('#zoek').value.trim(),
    kits: chosenValues(el('#kitlijst')),
    groups: chosenValues(el('#groeplijst')),
    tags: chosenValues(el('#taglijst')),
    shuffle: el('#schud').checked,
  };
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
  const kits = [...register.kits.values()]
    .map((k) => ({ id: k.slug, name: k.name, count: register.models.filter((m) => m.kit === k.slug).length }))
    .filter((k) => k.count > 0);
  const groups = [...register.groups.values()]
    .map((g) => ({ id: g.id, name: g.name, count: register.models.filter((m) => m.gr === g.id).length }))
    .filter((g) => g.count > 0);

  const tags = [...register.tags.values()]
    .map((t) => ({ id: t.id, name: t.name, count: register.models.filter((m) => (m.tags ?? []).includes(t.id)).length }))
    .filter((t) => t.count > 0);

  checklist(el('#kitlijst'), kits, state.filters.kits);
  checklist(el('#groeplijst'), groups, state.filters.groups);
  checklist(el('#taglijst'), tags, state.filters.tags ?? []);
  el('#zoek').value = state.filters.search;
  el('#schud').checked = state.filters.shuffle;
  for (const direction of DIRECTIONS) el(`#label-${direction.id}`).value = state.labels[direction.id];
  setupCount();
}

function setLighting(viewer) {
  if (flatMode.on) {
    viewer.setAttribute('environment-image', FLAT_ENVIRONMENT);
    viewer.setAttribute('shadow-intensity', '0');
    viewer.setAttribute('exposure', '1.3');
  } else {
    viewer.setAttribute('environment-image', 'neutral');
    viewer.setAttribute('shadow-intensity', '0.7');
    viewer.setAttribute('exposure', '1.05');
  }
}

function makeCard(model, depth) {
  const kit = register.kits.get(model.kit);
  const group = register.groups.get(model.gr);

  const card = document.createElement('article');
  card.className = 'swipe-kaart';
  card.dataset.diepte = String(depth);
  card.dataset.id = model.id;

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
  origin.textContent = `${kit?.name ?? model.kit} · ${group?.name ?? model.gr}`;
  const meta = document.createElement('p');
  meta.className = 'meta';
  meta.textContent = [
    dimensions(model.wdh),
    `${number.format(model.tris)} triangles`,
    `${number.format(model.mat)} material${model.mat === 1 ? '' : 's'}`,
    readableBytes(model.bytes),
  ].join(' · ');
  const path = document.createElement('p');
  path.className = 'pad';
  path.textContent = model.path;
  text.append(name, origin, meta, path);

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
    if (e.target.closest('button')) return;
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
      group: model.gr,
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

function exportJson() {
  const all = rows();
  const content = {
    tool: 'catalog/swipe.html',
    source: SOURCE.file,
    created: new Date().toISOString(),
    filters: state.filters,
    directions: Object.fromEntries(
      DIRECTIONS.map((r) => [
        r.id,
        { label: labelFor(r.id), paths: all.filter((x) => x.direction === r.id).map((x) => x.path) },
      ]),
    ),
    choices: all,
    stillToDo: remaining().map((id) => register.perId.get(id).path),
  };
  file(`swipe-${timeStamp()}.json`, JSON.stringify(content, null, 1) + '\n', 'application/json');
}

function exportCsv() {
  const cell = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const rowsOut = [
    ['direction', 'label', 'id', 'name', 'kit', 'group', 'path'],
    ...rows().map((r) => [r.direction, r.label, r.id, r.name, r.kit, r.group, r.path]),
  ];
  file(`swipe-${timeStamp()}.csv`, rowsOut.map((row) => row.map(cell).join(',')).join('\n') + '\n', 'text/csv');
}

async function start() {
  const response = await fetch(SOURCE.file);
  if (!response.ok) throw new Error(`${SOURCE.file} not found (${response.status})`);
  const data = await response.json();
  modelPath = data.modelPath ?? modelPath;
  data.models.forEach(hydrate);

  document.title = `Taaleiland — ${SOURCE.title}`;
  const kop = el('.kop-titel h1 .breed');
  if (kop) kop.textContent = SOURCE.title;

  register.models = data.models;
  register.perId = new Map(data.models.map((m) => [m.id, m]));
  register.kits = new Map(data.kits.map((k) => [k.slug, k]));
  register.groups = new Map(data.groups.map((g) => [g.id, g]));
  register.tags = new Map((data.tags ?? []).map((t) => [t.id, t]));

  load();

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

  el('#opzet-formulier').addEventListener('input', setupCount);
  el('#opzet-annuleer').addEventListener('click', () => show('dek'));
  el('#instellingen').addEventListener('click', () => { fillSetup(); show('opzet'); });
  el('#naar-uitslag').addEventListener('click', () => show('uitslag'));
  el('#verder').addEventListener('click', () => show('dek'));
  el('#terug').addEventListener('click', () => undo());
  el('#download-json').addEventListener('click', exportJson);
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
    state.order = register.models.map((m) => m.id);
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
