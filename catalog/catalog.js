const KIT_COLORS = {
  'survival-kit': '#6cb588',
  'pirate-kit': '#474a58',
  'modular-cave-kit': '#8a5d4b',
  'mini-forest': '#3da679',
  'fantasy-town-kit': '#995a41',
  'platformer-kit': '#ffb349',
  'onderwater-kit': '#2fa39b',
  'modulair-terrein': '#4f7a3a',
  props: '#b7946e',
  rocks: '#8a91ae',
};

const GROUP_ALIASES = {
  bouw: 'structures',
  mechaniek: 'items',
  terrein: 'ground',
  reisgerei: 'items',
  kamp: 'furniture',
};

const MODEL_PATH = 'kits/workfiles';

// De catalogusversie hangt ook aan de .glb's. Zonder die stempel houdt een
// bezoeker het model dat hij ooit ophaalde: catalog.json ververst wel (die
// draagt de stempel al), dus dan meldt de kaart een animatie of een kleur die
// het gecachte bestand niet heeft.
const CATALOG_VERSION = document.querySelector('meta[name="catalogus-versie"]')?.content ?? '';
const modelUrl = (path) => (CATALOG_VERSION ? `${path}?v=${CATALOG_VERSION}` : path);

function hydrate(m) {
  m.id = `${m.kit}/${m.name}`;
  m.path = `${MODEL_PATH}/${m.kit}/${m.name}.glb`;
  return m;
}

function colorName(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  if (saturation < 0.18) {
    if (lightness > 0.8) return 'white';
    if (lightness > 0.45) return 'light grey';
    if (lightness > 0.25) return 'grey';
    return 'dark grey';
  }

  let tint = 0;
  if (max === r) tint = ((g - b) / delta) % 6;
  else if (max === g) tint = (b - r) / delta + 2;
  else tint = (r - g) / delta + 4;
  tint = (tint * 60 + 360) % 360;

  const base =
    tint < 15 || tint >= 345 ? 'red'
    : tint < 40 ? (lightness < 0.45 ? 'brown' : 'orange')
    : tint < 50 ? (lightness < 0.5 ? 'brown' : 'orange')
    : tint < 70 ? 'yellow'
    : tint < 165 ? 'green'
    : tint < 200 ? 'turquoise'
    : tint < 260 ? 'blue'
    : tint < 300 ? 'purple'
    : 'pink';

  if (lightness < 0.3) return `dark ${base}`;
  if (lightness > 0.75) return `light ${base}`;
  return base;
}

function collectColors(models) {
  const counts = new Map();
  for (const model of models) {
    for (const hex of model.colors ?? []) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts]
    .map(([hex, count]) => ({ hex, count, name: colorName(hex) }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));
}

const HEAVY_FROM = 5000;

const SIZE_CLASSES = [
  { id: 'small', sign: 'S', short: 'Small', limit: 0.5, hint: 'small — under half a unit' },
  { id: 'medium', sign: 'M', short: 'Medium', limit: 1.5, hint: 'medium — half to one and a half units' },
  { id: 'large', sign: 'L', short: 'Large', limit: Infinity, hint: 'large — over one and a half units' },
];

function sizeClass(wdh) {
  const longest = Math.max(...wdh);
  const cls = SIZE_CLASSES.find((k) => longest < k.limit) ?? SIZE_CLASSES.at(-1);
  return { ...cls, longest };
}

let budgetPerUnit = 1000;

const number = new Intl.NumberFormat('en-GB');

const panel = document.querySelector('#paneel');
const emptyMessage = document.querySelector('#leeg');
const summary = document.querySelector('#samenvatting');
const detail = document.querySelector('#detail');

const cards = [];
const sections = [];

let grouping = 'groep';
let sorting = 'naam';

const chosenPaths = new Set();
const cardsPerPath = new Map();

let lastChoice = null;
let selectMode = false;
let swipe = null;

const colorState = new Map();
const sizeState = new Map();

const tagState = new Map([['assembly', 'not']]);

const NEXT = { undefined: 'only', only: 'not', not: undefined };

function rotateState(cardState, key, button) {
  const next = NEXT[cardState.get(key)];
  if (next) cardState.set(key, next);
  else cardState.delete(key);
  showState(button, next);
  return next;
}

function showState(button, state) {
  button.setAttribute('aria-pressed', String(state === 'only'));
  if (state === 'not') button.dataset.uit = '';
  else delete button.dataset.uit;
}

const keysWith = (cardState, value) =>
  [...cardState].filter(([, v]) => v === value).map(([k]) => k);

function matches(own, cardState) {
  const only = keysWith(cardState, 'only');
  if (only.length && !own.some((e) => only.includes(e))) return false;
  const not = keysWith(cardState, 'not');
  return !own.some((e) => not.includes(e));
}

const chipButtons = [];

let catalog = null;

const readableBytes = (bytes) =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} kB`;

const unit = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

const dimensions = (wdh) =>
  Array.isArray(wdh) ? `${wdh.map((v) => unit.format(v)).join(' × ')} units` : '—';

function span(className, text = '') {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
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

function demoClip(clips) {
  return clips.find((name) => name === 'open-close' || name === 'toggle') ?? clips[0];
}

const FLAT_ENVIRONMENT = 'catalog/effen-omgeving.png';
const flatMode = { on: false };

function setLighting(viewer, shadow) {
  if (flatMode.on) {
    viewer.setAttribute('environment-image', FLAT_ENVIRONMENT);
    viewer.setAttribute('shadow-intensity', '0');
    viewer.setAttribute('exposure', '1.3');
  } else {
    viewer.setAttribute('environment-image', 'neutral');
    viewer.setAttribute('shadow-intensity', shadow);
    viewer.setAttribute('exposure', '1.05');
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

function glyph(kind, sign, hint) {
  const el = span(`glyf glyf-${kind}`, sign);
  el.title = hint;
  return el;
}

function makeCard(model, kits, groups, variants = []) {
  const kit = kits.get(model.kit);
  const group = groups.get(model.gr);

  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'kaart';
  card.style.setProperty('--merk-kleur', KIT_COLORS[model.kit] ?? 'currentColor');

  const box = document.createElement('div');
  box.className = 'kaart-viewer';
  box.dataset.src = modelUrl(model.path);
  box.dataset.alt = `3D model ${model.name} from ${kit?.name ?? model.kit}`;

  const size = sizeClass(model.wdh);
  const glyphs = span('kaart-glyfen');
  glyphs.append(glyph('maat', size.sign, `${size.hint} (longest axis ${size.longest.toFixed(2)})`));
  if (model.anim?.length) {
    glyphs.append(glyph('animatie', '▶', `${model.anim.length} animation${model.anim.length > 1 ? 's' : ''} — playable in the model panel`));
  }
  if (variants.length) {
    glyphs.append(glyph('variant', `⧉ ${variants.length + 1}`,
      `${variants.length + 1} variants of the same model — viewable in the model panel`));
  }

  const text = document.createElement('div');
  text.className = 'kaart-tekst';
  const meta = span('kaart-meta');
  meta.append(
    span('kaart-merk', kit?.name ?? model.kit),
    span('kaart-grootte', readableBytes(model.bytes)),
  );
  text.append(span('kaart-naam', model.name), meta);

  card.append(box, glyphs, text);
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
  holder.append(card, pick);

  const family = [model, ...variants];

  const item = {
    element: holder,
    checkbox,
    path: model.path,
    colors: [...new Set(family.flatMap((m) => m.colors ?? []))],
    tags: [...new Set(family.flatMap((m) => m.tags ?? []))],
    sizes: [...new Set(family.map((m) => sizeClass(m.wdh).id))],
  };
  cards.push(item);

  const siblings = cardsPerPath.get(model.path);
  if (siblings) siblings.push(item);
  else cardsPerPath.set(model.path, [item]);

  checkbox.addEventListener('click', (e) => {
    if (e.shiftKey && lastChoice && lastChoice !== item) pickRange(item, checkbox.checked);
    else setSelection([model.path], checkbox.checked);
    lastChoice = item;
  });

  holder.dataset.pad = model.path;
  observer.observe(box);
  return item;
}

function cardUnder(x, y) {
  return document.elementFromPoint(x, y)?.closest('.kaart-houder[data-pad]');
}

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

function makeSection({ id, type, title, count, color, hint, source }) {
  const section = document.createElement('section');
  section.className = 'sectie';
  section.id = id;
  section.dataset.soort = type;
  if (color) section.style.setProperty('--sectie-kleur', color);

  const head = document.createElement('div');
  head.className = 'sectie-kop';

  const titleEl = document.createElement('h2');
  titleEl.textContent = title;

  const countEl = document.createElement('span');
  countEl.className = 'aantal';
  countEl.textContent = number.format(count);

  head.append(titleEl, countEl);

  if (hint) {
    const p = document.createElement('p');
    p.className = 'uitleg';
    p.textContent = hint;
    head.append(p);
  }

  if (source) {
    const link = document.createElement('a');
    link.className = 'bron';
    link.href = source.href;
    link.textContent = source.text;
    link.rel = 'noopener';
    head.append(link);
  }

  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'sectie-alles';
  all.textContent = 'Select all';
  all.addEventListener('click', () => {
    const own = sections.find((s) => s.element === section);
    if (!own) return;
    const visible = own.cards.filter((k) => !k.element.hidden);
    const on = !visible.every((k) => chosenPaths.has(k.path));
    setSelection(visible.map((k) => k.path), on);
  });
  head.append(all);

  const grid = document.createElement('div');
  grid.className = 'rooster';
  section.append(head, grid);
  return { section, grid, countEl };
}

const longest = (m) => Math.max(...m.wdh);

const num = (v) => v ?? 0;
const bool = (v) => (v ? 1 : 0);

const SORTINGS = {
  naam: (a, b) => a.name.localeCompare(b.name, 'en') || a.kit.localeCompare(b.kit),
  groot: (a, b) => longest(b) - longest(a),
  klein: (a, b) => longest(a) - longest(b),
  zwaar: (a, b) => b.tris - a.tris,
  licht: (a, b) => a.tris - b.tris,
  bestand: (a, b) => b.bytes - a.bytes,
  bestandKlein: (a, b) => a.bytes - b.bytes,
  meesteVtx: (a, b) => b.vtx - a.vtx,
  minsteVtx: (a, b) => a.vtx - b.vtx,
  grofsteFacet: (a, b) => num(b.avgTri) - num(a.avgTri),
  fijnsteFacet: (a, b) => num(a.avgTri) - num(b.avgTri),
  dichtste: (a, b) => num(b.dens) - num(a.dens),
  ijlste: (a, b) => num(a.dens) - num(b.dens),
  kleinsteRand: (a, b) => num(a.minEdge) - num(b.minEdge),
  grootsteRand: (a, b) => num(b.minEdge) - num(a.minEdge),
  meestOpRaster: (a, b) => num(b.anglePct) - num(a.anglePct),
  minstOpRaster: (a, b) => num(a.anglePct) - num(b.anglePct),
  nietRasterEerst: (a, b) => bool(a.gridMod) - bool(b.gridMod),
  nietGeaardEerst: (a, b) => bool(a.grounded) - bool(b.grounded),
  nietGecentreerdEerst: (a, b) => bool(a.centered) - bool(b.centered),
};

const WITHOUT = '_zonder';

const groupingType = () => grouping;

function sectionsFor(models) {
  const inView = models;

  const sourceFor = (url) =>
    url ? { href: url, text: `${new URL(url).host.replace(/^www\./, '')} ↗` } : null;

  const perKey = (keys, order) => {
    const bucket = new Map(order.map((v) => [v.id, []]));
    for (const model of inView) {
      for (const key of keys(model)) {
        if (!bucket.has(key)) bucket.set(key, []);
        bucket.get(key).push(model);
      }
    }
    return order
      .map((v) => ({ ...v, models: bucket.get(v.id) ?? [] }))
      .filter((v) => v.models.length);
  };

  const type = groupingType();

  if (type === 'geen') {
    return inView.length ? [{ id: 'alles', title: 'All models', models: inView }] : [];
  }

  if (type === 'kit') {
    return perKey(
      (m) => [m.kit],
      catalog.kits.map((k) => ({
        id: k.slug,
        title: k.name,
        color: KIT_COLORS[k.slug],
        hint: k.note,
        source: sourceFor(k.url),
      })),
    );
  }

  if (type === 'groep') {
    return perKey(
      (m) => [m.gr],
      catalog.groups.map((g) => ({ id: g.id, title: g.name, color: g.color })),
    );
  }

  if (type === 'tag') {
    const own = catalog.tags;
    const ids = new Set(own.map((t) => t.id));
    return perKey(
      (m) => {
        const hit = (m.tags ?? []).filter((id) => ids.has(id));
        return hit.length ? hit : [WITHOUT];
      },
      [
        ...own.map((t) => ({ id: t.id, title: t.name, hint: t.description })),
        { id: WITHOUT, title: 'No tag' },
      ],
    );
  }

  return perKey(
    (m) => [sizeClass(m.wdh).id],
    SIZE_CLASSES.map((k) => ({ id: k.id, title: k.short, hint: k.hint })),
  );
}

let variantMain = new Map();

function foldVariants(models) {
  const perGroup = new Map();
  const out = [];
  for (const model of models) {
    const existing = model.variant ? perGroup.get(model.variant) : null;
    if (existing) {
      if (model.id === variantMain.get(model.variant)) {
        existing.variants.push(existing.model);
        existing.model = model;
      } else {
        existing.variants.push(model);
      }
      continue;
    }
    const item = { model, variants: [] };
    if (model.variant) perGroup.set(model.variant, item);
    out.push(item);
  }
  return out;
}

function buildPanel() {
  observer.disconnect();
  cards.length = 0;
  sections.length = 0;
  cardsPerPath.clear();
  lastChoice = null;
  panel.replaceChildren();

  const order = SORTINGS[sorting] ?? SORTINGS.naam;

  for (const part of sectionsFor(catalog.models)) {
    const sorted = [...part.models].sort(order);
    const { section, grid, countEl } = makeSection({
      id: `${groupingType()}-${part.id}`,
      type: groupingType(),
      title: part.title,
      count: sorted.length,
      color: part.color,
      hint: part.hint,
      source: part.source,
    });

    const own = [];
    for (const { model, variants } of foldVariants(sorted)) {
      const item = makeCard(model, register.kits, register.groups, variants);
      grid.append(item.element);
      own.push(item);
    }
    panel.append(section);
    sections.push({ element: section, cards: own, countEl });
  }
}

const detailViewer = document.querySelector('#detail-viewer');
const detailCopy = document.querySelector('#detail-kopieer');
const detailAnimation = document.querySelector('#detail-animatie');
const detailAnimationChoice = document.querySelector('#detail-animatie-keuze');
const detailVariant = document.querySelector('#detail-variant');
const detailVariantChoice = document.querySelector('#detail-variant-keuze');
let activePath = '';

const register = { models: new Map(), kits: new Map(), groups: new Map(), variants: new Map(), tags: new Map() };

const TYPE_TAGS = ['object', 'structure', 'nature'];

const SHORT_NAME = {
  'precious-metal': 'Precious',
  animation: 'Anim',
  structure: 'Struct',
  qua: 'Quat',
  assembly: 'Asmbly',
  ceramic: 'Cerm',
  textile: 'Textil',
  foliage: 'Foliag',
};

const chipName = (tag) => SHORT_NAME[tag.id] ?? tag.name;

const TAG_TYPES = [
  { type: 'material', head: 'Material' },
  { type: 'tag', head: 'Tags' },
];

function tagRows(model) {
  if (!model.tags?.length) return [];
  const names = (type) =>
    model.tags
      .filter((id) => (register.tags.get(id)?.type ?? 'tag') === type)
      .map((id) => register.tags.get(id)?.name ?? id);

  return TAG_TYPES.map(({ type, head }) => [head, names(type).join(', ')]).filter(
    ([, value]) => value,
  );
}

function showDetail(model) {
  const kit = register.kits.get(model.kit);
  const group = register.groups.get(model.gr);
  activePath = model.path;
  document.querySelector('#detail-naam').textContent = model.name;
  document.querySelector('#detail-herkomst').textContent =
    `${kit?.name ?? model.kit} · ${group?.name ?? model.gr}`;

  const rows = [
    ['Size (w × d × h)', dimensions(model.wdh)],
    ['Triangles', `${number.format(model.tris)}${model.tris >= HEAVY_FROM ? ' (heavy)' : ''}`],
    [
      'Triangles per unit',
      !Number.isFinite(model.tpu)
        ? '—'
        : `${number.format(model.tpu)}${model.tpu > budgetPerUnit ? ` (over budget of ${number.format(budgetPerUnit)})` : ''}`,
    ],
    ['Draw calls', model.calls === undefined ? '—' : number.format(model.calls)],
    ['Materials', number.format(model.mat)],
    ['Vertices', number.format(model.vtx)],
    ['Min edge', `${(model.minEdge * 100).toFixed(1)} cm`],
    ['Average facet', `${(model.avgTri * 10000).toFixed(1)} cm²`],
    ['Density', number.format(model.dens)],
    ['On-angle facets', `${model.anglePct}%`],
    ['Grid / grounded / centered', [model.gridMod, model.grounded, model.centered].map((v) => (v ? '✓' : '—')).join(' / ')],
    ...(model.anim?.length
      ? [[`Animations (${model.anim.length})`, model.anim.join(', ')]]
      : []),
    ...tagRows(model),
  ];
  const data = document.querySelector('#detail-gegevens');
  data.replaceChildren();
  for (const [key, value] of rows) {
    const name = document.createElement('dt');
    name.textContent = key;
    const valueEl = document.createElement('dd');
    valueEl.textContent = value;
    data.append(name, valueEl);
  }

  const download = document.querySelector('#detail-download');
  download.href = modelUrl(model.path);
  download.setAttribute('download', `${model.name}.glb`);

  const viewer = document.createElement('model-viewer');
  viewer.src = modelUrl(model.path);
  viewer.alt = `3D model ${model.name}`;
  viewer.setAttribute('camera-controls', '');
  viewer.setAttribute('camera-orbit', '35deg 68deg auto');
  viewer.setAttribute('shadow-softness', '0.9');
  setLighting(viewer, '0.7');

  const clips = model.anim ?? [];
  viewer.setAttribute('auto-rotate', '');
  viewer.setAttribute('rotation-per-second', '18deg');

  detailAnimation.hidden = clips.length === 0;
  detailAnimationChoice.replaceChildren(
    ...[[OFF, 'off'], ...clips.map((name) => [name, name])].map(([value, text]) =>
      choiceChip(text, value === OFF, () => setAnimation(value), detailAnimationChoice),
    ),
  );

  const members = (register.variants.get(model.variant) ?? [])
    .map((id) => register.models.get(id))
    .filter(Boolean);
  detailVariant.hidden = members.length < 2;
  detailVariantChoice.replaceChildren(
    ...members.map((v) =>
      choiceChip(
        v.kit === model.kit ? v.name : `${v.name} (${v.kit})`,
        v.id === model.id,
        () => showDetail(v),
        detailVariantChoice,
        v.path,
      ),
    ),
  );

  detailViewer.replaceChildren(viewer);

  detail.showModal();
  updateSelection();
}

const OFF = '';

function choiceChip(text, active, action, container, path) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'keuzechip';
  chip.textContent = text;
  chip.setAttribute('aria-pressed', String(active));
  chip.addEventListener('click', () => {
    for (const sibling of container.querySelectorAll('.keuzechip')) sibling.setAttribute('aria-pressed', 'false');
    chip.setAttribute('aria-pressed', 'true');
    action();
  });
  if (path) {
    const pick = document.createElement('input');
    pick.type = 'checkbox';
    pick.className = 'keuzechip-kies';
    pick.checked = chosenPaths.has(path);
    pick.setAttribute('aria-label', `Select ${text}`);
    pick.addEventListener('click', (e) => {
      e.stopPropagation();
      setSelection([path], pick.checked);
    });
    chip.prepend(pick);
  }
  return chip;
}

function setAnimation(clip) {
  const viewer = detailViewer.querySelector('model-viewer');
  if (!viewer) return;
  if (clip === OFF) {
    viewer.pause();
    viewer.removeAttribute('animation-name');
    viewer.setAttribute('auto-rotate', '');
  } else {
    viewer.removeAttribute('auto-rotate');
    viewer.setAttribute('animation-name', clip);
    viewer.play();
  }
}

detail.addEventListener('close', () => detailViewer.replaceChildren());
document.querySelector('#detail-sluit').addEventListener('click', () => detail.close());
detail.addEventListener('click', (e) => { if (e.target === detail) detail.close(); });

detailCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(activePath);
    detailCopy.textContent = 'Copied';
  } catch {
    detailCopy.textContent = activePath;
  }
  setTimeout(() => { detailCopy.textContent = 'Copy path'; }, 1600);
});

const selectionBar = document.querySelector('#selectiebalk');
const selectionCount = document.querySelector('#selectiebalk-telling');
const selectionCopy = document.querySelector('#selectie-kopieer');
const detailSelect = document.querySelector('#detail-selecteer');

const visibleCards = () => cards.filter((k) => !k.element.hidden);

function setSelection(paths, on) {
  for (const path of paths) {
    if (on) chosenPaths.add(path);
    else chosenPaths.delete(path);
    for (const sibling of cardsPerPath.get(path) ?? []) sibling.checkbox.checked = on;
  }
  updateSelection();
}

function pickRange(to, on) {
  const list = visibleCards();
  const from = list.indexOf(lastChoice);
  const target = list.indexOf(to);
  if (from === -1 || target === -1) return setSelection([to.path], on);
  const range = list.slice(Math.min(from, target), Math.max(from, target) + 1);
  setSelection(range.map((k) => k.path), on);
}

function updateSelection() {
  const count = chosenPaths.size;
  selectionBar.hidden = count === 0;
  selectionCount.textContent = `${count} selected`;
  if (detail.open) {
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

document.querySelector('#selectie-alles').addEventListener('click', () => {
  setSelection(visibleCards().map((k) => k.path), true);
});

document.querySelector('#selectie-wis').addEventListener('click', () => {
  setSelection([...chosenPaths], false);
  lastChoice = null;
});

detailSelect.addEventListener('click', () => {
  setSelection([activePath], !chosenPaths.has(activePath));
});

function checkColor(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#2f2a26' : '#ffffff';
}

function buildColorBar(colors) {
  const container = document.querySelector('#kleurbalk-stalen');
  const swatches = document.createElement('div');
  swatches.className = 'kleurgroep-stalen';
  swatches.setAttribute('role', 'group');
  swatches.setAttribute('aria-label', 'Filter by colour');

  for (const color of colors) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'staal';
    button.dataset.sleutel = color.hex;
    button.style.setProperty('--staal-kleur', color.hex);
    button.style.setProperty('--vink', checkColor(color.hex));
    button.setAttribute('aria-pressed', 'false');
    button.title = `${color.name} ${color.hex} — ${color.count} models`;
    button.setAttribute('aria-label', `${color.name} ${color.hex}, ${color.count} models`);

    button.addEventListener('click', () => {
      rotateState(colorState, color.hex, button);
      filter();
    });

    swatches.append(button);
  }

  const group = document.createElement('div');
  group.className = 'kleurgroep';
  group.append(swatches);
  container.append(group);
}

function reorder() {
  for (const strip of new Set(chipButtons.map((c) => c.strip))) {
    const own = chipButtons
      .filter((c) => c.strip === strip)
      .sort((a, b) => Number(b.state.has(b.id)) - Number(a.state.has(a.id)) || a.order - b.order);
    for (const chip of own) strip.append(chip.element);
  }
}

function buildChipRow(container, head, items, state, field) {
  const row = document.createElement('div');
  row.className = 'kleurbalk tagrij';
  const strip = document.createElement('div');
  strip.className = 'tagbalk-knoppen';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', `Filter by ${head.toLowerCase()}`);

  const ownIds = items.map((i) => i.id);

  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tagknop';
    button.dataset.tag = item.id;
    button.title = item.hint ?? item.name;
    showState(button, state.get(item.id));
    const countEl = span('tagknop-aantal');
    button.append(document.createTextNode(item.name), countEl);

    button.addEventListener('click', () => {
      rotateState(state, item.id, button);
      reorder();
      filter();
    });

    strip.append(button);
    chipButtons.push({ id: item.id, element: button, countEl, row, ownIds, state, field, strip, order: chipButtons.length });
  }

  row.append(strip);
  container.append(row);
}

function buildTagBar(tags) {
  const container = document.querySelector('#tagbalk');

  buildChipRow(
    container,
    'Size',
    SIZE_CLASSES.map((k) => ({ id: k.id, name: k.short, hint: k.hint })),
    sizeState,
    'sizes',
  );

  const types = TYPE_TAGS.map((id) => tags.find((t) => t.id === id)).filter(Boolean);
  if (types.length) {
    buildChipRow(container, 'Type', types.map((t) => ({ id: t.id, name: chipName(t), hint: t.description })), tagState, 'tags');
  }

  for (const { type, head } of TAG_TYPES) {
    const own = tags.filter((t) => (t.type ?? 'tag') === type && !TYPE_TAGS.includes(t.id));
    if (own.length === 0) continue;
    buildChipRow(
      container,
      head,
      own.map((t) => ({ id: t.id, name: chipName(t), hint: t.description })),
      tagState,
      'tags',
    );
  }
}

function refresh() {
  buildPanel();

  const counts = new Map();
  for (const card of cards) {
    for (const field of ['tags', 'sizes']) {
      for (const id of card[field]) counts.set(`${field}|${id}`, (counts.get(`${field}|${id}`) ?? 0) + 1);
    }
  }
  for (const { id, element, countEl, state, field } of chipButtons) {
    const count = counts.get(`${field}|${id}`) ?? 0;
    element.hidden = count === 0;
    countEl.textContent = count;
    if (count === 0 && state.get(id) === 'only') {
      state.delete(id);
      showState(element, undefined);
    }
  }
  reorder();
  for (const { row } of chipButtons) {
    row.hidden = !chipButtons.some((c) => c.row === row && !c.element.hidden);
  }
  document.querySelector('#alles-wis').hidden = colorState.size + tagState.size + sizeState.size === 0;

  filter();
}

function onClear() {
  colorState.clear();
  tagState.clear();
  sizeState.clear();
  for (const button of document.querySelectorAll('.staal')) showState(button, undefined);
  for (const { element } of chipButtons) showState(element, undefined);
  reorder();
  filter();
}

function filter() {
  document.querySelector('#alles-wis').hidden =
    colorState.size + tagState.size + sizeState.size === 0;
  let visible = 0;

  for (const card of cards) {
    const hit =
      matches(card.colors, colorState) && matches(card.tags, tagState) && matches(card.sizes, sizeState);
    card.element.hidden = !hit;
    if (hit) visible++;
  }

  for (const section of sections) {
    const count = section.cards.filter((k) => !k.element.hidden).length;

    section.element.hidden = count === 0;
    section.countEl.textContent = number.format(count);
  }

  emptyMessage.hidden = visible > 0;
}

async function start() {
  const response = await fetch(modelUrl('catalog/catalog.json'));
  if (!response.ok) throw new Error(`catalog/catalog.json not found (${response.status})`);
  const data = await response.json();
  data.models.forEach(hydrate);

  if (Number.isFinite(data.budgetPerUnit)) budgetPerUnit = data.budgetPerUnit;

  const kits = new Map(data.kits.map((k) => [k.slug, k]));
  const groups = new Map(data.groups.map((g) => [g.id, g]));

  register.kits = kits;
  register.groups = groups;
  register.models = new Map(data.models.map((m) => [m.id, m]));
  register.variants = new Map((data.variants ?? []).map((v) => [v.id, v.members]));

  const groupsInUse = new Set(data.models.map((m) => m.gr));
  summary.textContent =
    `${data.models.length} models · ${data.kits.length} kits · ` +
    `${data.groups.filter((g) => groupsInUse.has(g.id)).length} groups`;

  variantMain = new Map((data.variants ?? []).map((v) => [v.id, v.main]));
  catalog = data;

  register.tags = new Map((data.tags ?? []).map((t) => [t.id, t]));

  buildColorBar(collectColors(data.models));
  buildTagBar(data.tags ?? []);

  document.querySelector('#alles-wis').addEventListener('click', onClear);

  const selectButton = document.querySelector('#kiesmodus');
  selectButton.addEventListener('click', () => {
    selectMode = !selectMode;
    selectButton.setAttribute('aria-pressed', String(selectMode));
    document.body.classList.toggle('kiesmodus', selectMode);
  });

  const lightButton = document.querySelector('#licht');
  lightButton.addEventListener('click', () => {
    flatMode.on = !flatMode.on;
    lightButton.setAttribute('aria-pressed', String(flatMode.on));

    for (const box of document.querySelectorAll('.kaart-viewer')) {
      delete box.dataset.momentopname;
      const viewer = box.querySelector('model-viewer');
      if (viewer) setLighting(viewer, '0.6');
      else if (box.querySelector('img')) attachViewer(box);
    }
    const detailViewerEl = detailViewer.querySelector('model-viewer');
    if (detailViewerEl) setLighting(detailViewerEl, '0.7');
  });

  const aliases = new Map(
    Object.entries(GROUP_ALIASES).map(([old, next]) => [`groep-${old}`, `groep-${next}`]),
  );

  const groupingChoice = document.querySelector('#groepering');
  const sortingChoice = document.querySelector('#sortering');
  groupingChoice.value = grouping;
  sortingChoice.value = sorting;
  groupingChoice.addEventListener('change', () => {
    grouping = groupingChoice.value;
    refresh();
  });
  sortingChoice.addEventListener('change', () => {
    sorting = sortingChoice.value;
    refresh();
  });

  const raw = location.hash.slice(1);
  const anchor = aliases.get(raw) ?? raw;
  refresh();
  document.getElementById(anchor)?.scrollIntoView();
}

start().catch((error) => {
  summary.textContent = `Could not load the catalogue: ${error.message}`;
  console.error(error);
});
