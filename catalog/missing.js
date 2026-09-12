const number = new Intl.NumberFormat('en-GB');
const unit = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

const readableBytes = (bytes) =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} kB`;

const CATALOG_VERSION = document.querySelector('meta[name="catalogus-versie"]')?.content ?? '';
const modelUrl = (path) => (CATALOG_VERSION ? `${path}?v=${CATALOG_VERSION}` : path);

const el = (sel) => document.querySelector(sel);

function span(className, text) {
  const node = document.createElement('span');
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ─── the models ──────────────────────────────────────────────────────────────────────

const register = { models: [], packs: new Map(), kinds: new Map() };

const kindParent = (id) => (id.includes('-') ? id.slice(0, id.lastIndexOf('-')) : null);
const kindChain = (id) => {
  const chain = [];
  for (let k = id; k; k = kindParent(k)) chain.unshift(k);
  return chain;
};
const kindLabel = (id) => (id ? kindChain(id).map((k) => register.kinds.get(k)?.name ?? k).join(' › ') : 'No kind');
const ROOT_ORDER = ['obj', 'char', 'env', 'str', 'assy', 'scene'];
const cards = [];
let sections = [];

const state = { search: '', pack: '', state: '', grouping: 'bron', sorting: 'naam' };

const chosenPaths = new Set();
const cardsPerPath = new Map();
let lastChoice = null;
let selectMode = false;
let swipe = null;

const nooitIngevoerd = (model) => !register.packs.get(model.kit)?.kit;

function matches(model) {
  if (state.pack && model.kit !== state.pack) return false;
  if (state.state === 'nooit' && !nooitIngevoerd(model)) return false;
  if (state.state === 'uit' && nooitIngevoerd(model)) return false;
  if (state.search) {
    const needle = state.search.toLowerCase();
    const pack = register.packs.get(model.kit)?.name ?? model.kit;
    if (!`${model.name} ${pack} ${model.kind ?? ''}`.toLowerCase().includes(needle)) return false;
  }
  return true;
}

const longest = (m) => Math.max(...m.wdh);

const SORTINGS = {
  naam: (a, b) => a.name.localeCompare(b.name, 'en') || a.kit.localeCompare(b.kit),
  groot: (a, b) => longest(b) - longest(a),
  klein: (a, b) => longest(a) - longest(b),
  zwaar: (a, b) => b.tris - a.tris,
  licht: (a, b) => a.tris - b.tris,
};

// ─── viewers ─────────────────────────────────────────────────────────────────────────

const FLAT_ENVIRONMENT = 'effen-omgeving.png';
const SOFT_ENVIRONMENT = 'zachte-omgeving.png';
const flatMode = { on: false };

function setLighting(viewer, shadow) {
  viewer.setAttribute('tone-mapping', 'neutral');
  if (flatMode.on) {
    viewer.setAttribute('environment-image', FLAT_ENVIRONMENT);
    viewer.setAttribute('shadow-intensity', '0');
    viewer.setAttribute('exposure', '1.3');
  } else {
    viewer.setAttribute('environment-image', SOFT_ENVIRONMENT);
    viewer.setAttribute('shadow-intensity', shadow);
    viewer.setAttribute('exposure', '1.15');
  }
}

function attachViewer(box) {
  if (box.querySelector('model-viewer')) return;
  const viewer = document.createElement('model-viewer');
  viewer.src = box.dataset.src;
  viewer.alt = box.dataset.alt;
  viewer.setAttribute('camera-orbit', '35deg 68deg auto');
  viewer.setAttribute('shadow-softness', '0.9');
  setLighting(viewer, '0.6');
  viewer.setAttribute('interaction-prompt', 'none');
  viewer.setAttribute('disable-zoom', '');
  viewer.setAttribute('loading', 'eager');
  box.replaceChildren(viewer);
}

const soon = globalThis.requestIdleCallback ?? ((f) => setTimeout(f, 1));

// A card that scrolls away hands in a still of itself, so scrolling back doesn't mean
// re-loading and re-rendering a thousand models.
function detachViewer(box) {
  const viewer = box.querySelector('model-viewer');
  if (!viewer) return;

  if (viewer.loaded && !box.dataset.momentopname) {
    soon(() => {
      if (box.dataset.momentopname || !viewer.loaded) return;
      try {
        box.dataset.momentopname = viewer.toDataURL('image/webp', 0.72);
        if (!box.contains(viewer)) showSnapshot(box);
      } catch {}
    });
  }

  if (box.dataset.momentopname) showSnapshot(box);
  else box.replaceChildren();
}

function showSnapshot(box) {
  const image = document.createElement('img');
  image.src = box.dataset.momentopname;
  image.alt = box.dataset.alt;
  image.loading = 'lazy';
  box.replaceChildren(image);
}

const observer = new IntersectionObserver(
  (observations) => {
    for (const { target, isIntersecting } of observations) {
      if (isIntersecting) attachViewer(target);
      else detachViewer(target);
    }
  },
  { rootMargin: '800px 0px' },
);

// ─── detail ──────────────────────────────────────────────────────────────────────────

const dialog = el('#detail');
const detailSelect = el('#detail-selecteer');
let activePath = null;

function fact(list, name, value, wide) {
  if (value === undefined || value === null) return;
  const dt = document.createElement('dt');
  dt.textContent = name;
  const dd = document.createElement('dd');
  dd.textContent = value;
  if (wide) dt.className = dd.className = 'breed';
  list.append(dt, dd);
}

function showDetail(model) {
  const pack = register.packs.get(model.kit);
  activePath = model.path;
  el('#detail-naam').textContent = model.name;
  el('#detail-herkomst').textContent = nooitIngevoerd(model)
    ? `${pack?.name ?? model.kit} — this pack was never imported`
    : `${pack?.name ?? model.kit} — imported as “${pack?.kit}”, but this model is not in the catalogue`;

  const viewer = document.createElement('model-viewer');
  viewer.src = modelUrl(`../${model.path}`);
  viewer.alt = `3D model ${model.name} from ${pack?.name ?? model.kit}`;
  viewer.setAttribute('camera-orbit', '35deg 68deg auto');
  viewer.setAttribute('camera-controls', '');
  viewer.setAttribute('shadow-softness', '0.9');
  setLighting(viewer, '0.7');
  el('#detail-viewer').replaceChildren(viewer);

  const list = el('#detail-gegevens');
  list.replaceChildren();
  fact(list, 'Kind', `${kindLabel(model.kind)} (guessed from the name)`, true);
  fact(
    list,
    'Size',
    `${model.wdh.map((v) => unit.format(v)).join(' × ')} ${model.scaled ? 'units' : 'source units'}`,
    true,
  );
  fact(list, 'Triangles', number.format(model.tris));
  fact(list, 'Meshes', number.format(model.mat));
  fact(list, 'Preview', readableBytes(model.bytes));
  fact(list, 'Source file', model.file, true);
  fact(list, 'Path', model.path, true);

  el('#detail-download').href = modelUrl(`../${model.path}`);
  el('#detail-download').setAttribute('download', `${model.name}.glb`);
  el('#detail-kopieer').onclick = async (e) => {
    const button = e.currentTarget;
    const old = button.textContent;
    try {
      await navigator.clipboard.writeText(model.path);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Copy failed';
    }
    setTimeout(() => { button.textContent = old; }, 1400);
  };

  updateSelection();
  dialog.showModal();
}

dialog.addEventListener('close', () => {
  el('#detail-viewer').replaceChildren();
  activePath = null;
});
el('#detail-sluit').addEventListener('click', () => dialog.close());

detailSelect.addEventListener('click', () => {
  if (activePath) setSelection([activePath], !chosenPaths.has(activePath));
});

// ─── selection ───────────────────────────────────────────────────────────────────────

const selectionBar = el('#selectiebalk');
const selectionCount = el('#selectiebalk-telling');
const selectionCopy = el('#selectie-kopieer');

function setSelection(paths, on) {
  for (const path of paths) {
    if (on) chosenPaths.add(path);
    else chosenPaths.delete(path);
    for (const sibling of cardsPerPath.get(path) ?? []) sibling.checkbox.checked = on;
  }
  updateSelection();
}

function pickRange(to, on) {
  const from = cards.indexOf(lastChoice);
  const target = cards.indexOf(to);
  if (from === -1 || target === -1) return setSelection(to.paths, on);
  const range = cards.slice(Math.min(from, target), Math.max(from, target) + 1);
  setSelection(range.flatMap((k) => k.paths), on);
}

function updateSelection() {
  const count = chosenPaths.size;
  selectionBar.hidden = count === 0;
  selectionCount.textContent = `${count} selected`;
  if (dialog.open) {
    const on = chosenPaths.has(activePath);
    detailSelect.textContent = on ? 'Remove from selection' : 'Add to selection';
    detailSelect.setAttribute('aria-pressed', String(on));
  }
}

async function toClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}

  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;top:0;left:-9999px';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

selectionCopy.addEventListener('click', async () => {
  const count = chosenPaths.size;
  const ok = await toClipboard([...chosenPaths].join('\n'));
  selectionCopy.textContent = ok
    ? `${count} path${count === 1 ? '' : 's'} copied`
    : 'Copy failed';
  setTimeout(() => { selectionCopy.textContent = 'Copy paths'; }, 1600);
});

el('#selectie-alles').addEventListener('click', () => {
  setSelection(cards.flatMap((k) => k.paths), true);
});

el('#selectie-wis').addEventListener('click', () => {
  setSelection([...chosenPaths], false);
  lastChoice = null;
});

// ─── drawing ─────────────────────────────────────────────────────────────────────────

function makeCard(model) {
  const pack = register.packs.get(model.kit);

  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'kaart';

  const box = document.createElement('div');
  box.className = 'kaart-viewer';
  box.dataset.src = modelUrl(`../${model.path}`);
  box.dataset.alt = `3D model ${model.name} from ${pack?.name ?? model.kit}`;

  const text = document.createElement('div');
  text.className = 'kaart-tekst';
  const meta = span('kaart-meta');
  meta.append(
    span('kaart-merk', pack?.short ?? model.kit),
    span('kaart-grootte', `${number.format(model.tris)} tri`),
  );
  const name = span('kaart-naam', model.name.replace(/_/g, '_\u200b'));
  name.title = model.name;
  text.append(name, meta);

  card.append(box, text);
  card.addEventListener('click', () => {
    if (selectMode) setSelection([model.path], !chosenPaths.has(model.path));
    else showDetail(model);
  });

  const pick = document.createElement('label');
  pick.className = 'kaart-kies';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = chosenPaths.has(model.path);
  checkbox.setAttribute('aria-label', `Select ${model.name}`);
  pick.append(checkbox);

  const holder = document.createElement('div');
  holder.className = 'kaart-houder';
  holder.dataset.pad = model.path;
  holder.append(card, pick);

  observer.observe(box);
  const item = { element: holder, checkbox, path: model.path, paths: [model.path], model, box };
  cards.push(item);

  const siblings = cardsPerPath.get(model.path);
  if (siblings) siblings.push(item);
  else cardsPerPath.set(model.path, [item]);

  checkbox.addEventListener('click', (e) => {
    if (e.shiftKey && lastChoice && lastChoice !== item) pickRange(item, checkbox.checked);
    else setSelection([model.path], checkbox.checked);
    lastChoice = item;
  });

  return item;
}

function makeSection({ title, hint, count }) {
  const section = document.createElement('section');
  section.className = 'sectie';

  const head = document.createElement('div');
  head.className = 'sectie-kop';
  const titleEl = document.createElement('h2');
  titleEl.textContent = title;
  const countEl = span('aantal', number.format(count));
  head.append(titleEl, countEl);

  if (hint) {
    const p = document.createElement('p');
    p.className = 'uitleg';
    p.textContent = hint;
    head.append(p);
  }

  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'sectie-alles';
  all.textContent = 'Select all';
  all.addEventListener('click', () => {
    const own = sections.find((s) => s.element === section);
    if (!own) return;
    const on = !own.cards.every((k) => chosenPaths.has(k.path));
    setSelection(own.cards.flatMap((k) => k.paths), on);
  });
  head.append(all);

  const grid = document.createElement('div');
  grid.className = 'rooster';
  section.append(head, grid);
  return { section, grid, countEl };
}

function groupsFor(models) {
  if (state.grouping === 'geen') return [{ key: '', title: 'All models', models }];

  if (state.grouping === 'kind') {
    // by kind branch, roots in the catalogue's order, the smaller sections first
    const per = new Map();
    for (const model of models) {
      const chain = model.kind ? kindChain(model.kind) : [];
      const key = chain[Math.min(2, chain.length) - 1] ?? '';
      if (!per.has(key)) per.set(key, []);
      per.get(key).push(model);
    }
    const rank = (id) => (id ? ROOT_ORDER.indexOf(id.split('-')[0]) : 99);
    return [...per]
      .map(([id, own]) => ({ key: id, title: id ? kindLabel(id) : 'No kind', models: own }))
      .sort((a, b) => rank(a.key) - rank(b.key) || a.models.length - b.models.length || a.title.localeCompare(b.title));
  }

  const per = new Map();
  for (const model of models) {
    if (!per.has(model.kit)) per.set(model.kit, []);
    per.get(model.kit).push(model);
  }
  return [...per].map(([slug, own]) => {
    const pack = register.packs.get(slug);
    return {
      key: slug,
      title: pack?.name ?? slug,
      hint: pack?.kit
        ? `${pack.missing} of ${pack.inSource} models in this pack are not in the catalogue — the other ${pack.inCatalog} were imported as “${pack.kit}”.`
        : `This pack was never imported: none of its ${pack?.inSource ?? own.length} models are in the catalogue.`,
      models: own,
    };
  }).sort((a, b) => a.models.length - b.models.length || a.title.localeCompare(b.title));
}

function draw() {
  const panel = el('#paneel');
  observer.disconnect();
  cards.length = 0;
  sections = [];
  cardsPerPath.clear();
  lastChoice = null;

  const gekozen = register.models.filter(matches).sort(SORTINGS[state.sorting]);
  panel.replaceChildren();

  for (const group of groupsFor(gekozen)) {
    if (group.models.length === 0) continue;
    const { section, grid } = makeSection({ title: group.title, hint: group.hint, count: group.models.length });
    const own = [];
    for (const model of group.models) {
      const item = makeCard(model);
      grid.append(item.element);
      own.push(item);
    }
    panel.append(section);
    sections.push({ element: section, cards: own });
  }

  el('#leeg').hidden = gekozen.length > 0;
  const total = register.models.length;
  el('#samenvatting').textContent =
    gekozen.length === total
      ? `${number.format(total)} models in a source pack but not in the catalogue, from ${register.packs.size} packs`
      : `${number.format(gekozen.length)} of ${number.format(total)} models shown`;

  const filtered = Boolean(state.search || state.pack || state.state);
  el('#alles-wis').hidden = !filtered;
}

// ─── start ───────────────────────────────────────────────────────────────────────────

async function start() {
  const response = await fetch('missing.json');
  if (!response.ok) throw new Error(`missing.json not found (${response.status}) — run node catalog/tools/build-missing.mjs`);
  const data = await response.json();

  const modelPath = data.modelPath ?? 'kits/missing';
  for (const model of data.models) model.path = `${modelPath}/${model.kit}/${model.name}.glb`;

  register.models = data.models;
  register.kinds = new Map((data.kinds ?? []).map((k) => [k.id, k]));
  register.packs = new Map(
    data.sources.map((s) => [s.slug, { ...s, short: s.name.replace(/\s+(Kit|Pack)$/, '') }]),
  );

  const packChoice = el('#filter-bron');
  for (const pack of [...register.packs.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const option = document.createElement('option');
    option.value = pack.slug;
    option.textContent = `${pack.name} (${pack.missing})`;
    packChoice.append(option);
  }

  el('#zoek').addEventListener('input', (e) => { state.search = e.target.value.trim(); draw(); });
  packChoice.addEventListener('change', (e) => { state.pack = e.target.value; draw(); });
  el('#filter-staat').addEventListener('change', (e) => { state.state = e.target.value; draw(); });
  el('#groepering').addEventListener('change', (e) => { state.grouping = e.target.value; draw(); });
  el('#sortering').addEventListener('change', (e) => { state.sorting = e.target.value; draw(); });
  el('#alles-wis').addEventListener('click', () => {
    state.search = '';
    state.pack = '';
    state.state = '';
    el('#zoek').value = '';
    packChoice.value = '';
    el('#filter-staat').value = '';
    draw();
  });

  const selectButton = el('#kiesmodus');
  selectButton.addEventListener('click', () => {
    selectMode = !selectMode;
    selectButton.setAttribute('aria-pressed', String(selectMode));
    document.body.classList.toggle('kiesmodus', selectMode);
  });

  const panel = el('#paneel');
  const cardUnder = (x, y) => document.elementFromPoint(x, y)?.closest('.kaart-houder[data-pad]');

  panel.addEventListener('pointerdown', (e) => {
    if (!selectMode || e.button !== 0) return;
    const holder = e.target.closest('.kaart-houder[data-pad]');
    if (!holder) return;
    swipe = { on: !chosenPaths.has(holder.dataset.pad), done: new Set() };
    panel.setPointerCapture(e.pointerId);
  });

  panel.addEventListener('pointermove', (e) => {
    if (!swipe) return;
    const holder = cardUnder(e.clientX, e.clientY);
    if (!holder || swipe.done.has(holder.dataset.pad)) return;
    swipe.done.add(holder.dataset.pad);
    setSelection([holder.dataset.pad], swipe.on);
  });

  for (const name of ['pointerup', 'pointercancel']) {
    panel.addEventListener(name, () => { swipe = null; });
  }

  const lightButton = el('#licht');
  lightButton.addEventListener('click', () => {
    flatMode.on = !flatMode.on;
    lightButton.setAttribute('aria-pressed', String(flatMode.on));
    // a stored still carries the old lighting, so it has to go
    for (const card of cards) {
      delete card.box.dataset.momentopname;
      const viewer = card.box.querySelector('model-viewer');
      if (viewer) setLighting(viewer, '0.6');
      else if (card.box.querySelector('img')) card.box.replaceChildren();
    }
    for (const viewer of document.querySelectorAll('.detail-viewer model-viewer')) setLighting(viewer, '0.7');
  });

  draw();
}

start().catch((error) => {
  el('#leeg').hidden = false;
  el('#leeg').textContent = `Could not load: ${error.message}`;
  el('#samenvatting').textContent = 'Could not load the list.';
  console.error(error);
});
