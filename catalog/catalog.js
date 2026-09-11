import { renderTagEditor, mountEditBar, effectiveKind, effectiveUses, onChange as onTagEdit } from './tag-edits.js';

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

// Kind ids are paths (obj-container-jug): the parent is the id minus its last segment.
const kindParent = (id) => (id.includes('-') ? id.slice(0, id.lastIndexOf('-')) : null);
const kindChain = (id) => {
  const chain = [];
  for (let k = id; k; k = kindParent(k)) chain.unshift(k);
  return chain;
};
const ROOT_ORDER = ['obj', 'char', 'env', 'str', 'assy', 'scene'];
const rootRank = (id) => ROOT_ORDER.indexOf(id.split('-')[0]);

const MODEL_PATH = 'kits/workfiles';

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

// size is measured at build (F1); the vocabulary entries only name and describe it
const SIZE_CLASSES = [
  { id: 's', sign: 'S', short: 'Small', hint: 'small — under half a unit' },
  { id: 'm', sign: 'M', short: 'Medium', hint: 'medium — half to one and a half units' },
  { id: 'l', sign: 'L', short: 'Large', hint: 'large — over one and a half units' },
];

const sizeClass = (model) => ({
  ...(SIZE_CLASSES.find((k) => k.id === model.size) ?? SIZE_CLASSES.at(-1)),
  longest: Math.max(...model.wdh),
});

let budgetPerUnit = 2000;

const number = new Intl.NumberFormat('en-GB');

const panel = document.querySelector('#paneel');
const emptyMessage = document.querySelector('#leeg');
const summary = document.querySelector('#samenvatting');
const detail = document.querySelector('#detail');

const cards = [];
const sections = [];

let grouping = 'kind2';
let sorting = 'naam';

const chosenPaths = new Set();
const cardsPerPath = new Map();
const familyPerPath = new Map();

let lastChoice = null;
let selectMode = false;
let swipe = null;

const colorState = new Map();
const sizeState = new Map();
const kindState = new Map([['assy', 'not']]);
const useState = new Map();

const tagState = new Map();

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

function matches(own, cardState, { any = [] } = {}) {
  const only = keysWith(cardState, 'only');
  const either = only.filter((e) => any.includes(e));
  const all = only.filter((e) => !any.includes(e));
  if (either.length && !own.some((e) => either.includes(e))) return false;
  if (!all.every((e) => own.includes(e))) return false;
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

function makeCard(model, kits, variants = []) {
  const kit = kits.get(model.kit);

  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'kaart';
  card.style.setProperty('--merk-kleur', KIT_COLORS[model.kit] ?? 'currentColor');

  const box = document.createElement('div');
  box.className = 'kaart-viewer';
  box.dataset.src = modelUrl(model.path);
  box.dataset.alt = `3D model ${model.name} from ${kit?.name ?? model.kit}`;

  const size = sizeClass(model);
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

  // The variants folded into this card come along with it: the card promises
  // "⧉ n variants", so a tick on it means all n, not just the one on the front.
  const family = [model, ...variants];
  const familyPaths = family.map((m) => m.path);
  familyPerPath.set(model.path, familyPaths);

  card.addEventListener('click', () => {
    if (selectMode) setSelection(familyPaths, !chosenPaths.has(model.path));
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

  const item = {
    element: holder,
    checkbox,
    path: model.path,
    paths: familyPaths,
    family,
    colors: [...new Set(family.flatMap((m) => m.colors ?? []))],
    tags: withParents(family.flatMap((m) => m.tags ?? [])),
    kinds: [...new Set(family.flatMap((m) => (m.kind ? kindChain(m.kind) : [WITHOUT])))],
    uses: [...new Set(family.flatMap((m) => (m.use?.length ? m.use : [WITHOUT])))],
    sizes: [...new Set(family.map((m) => m.size))],
  };
  cards.push(item);

  const siblings = cardsPerPath.get(model.path);
  if (siblings) siblings.push(item);
  else cardsPerPath.set(model.path, [item]);

  checkbox.addEventListener('click', (e) => {
    if (e.shiftKey && lastChoice && lastChoice !== item) pickRange(item, checkbox.checked);
    else setSelection(familyPaths, checkbox.checked);
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
  setSelection(familyPerPath.get(holder.dataset.pad) ?? [holder.dataset.pad], swipe.on);
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
  breedsteVerloop: (a, b) => num(b.grad) - num(a.grad),
  smalsteVerloop: (a, b) => num(a.grad) - num(b.grad),
  meesteBanden: (a, b) => num(b.bands) - num(a.bands),
  minsteBanden: (a, b) => num(a.bands) - num(b.bands),
  meesteMats: (a, b) => num(b.mat) - num(a.mat),
  minsteMats: (a, b) => num(a.mat) - num(b.mat),
  nietRasterEerst: (a, b) => bool(a.gridMod) - bool(b.gridMod),
  nietGeaardEerst: (a, b) => bool(a.grounded) - bool(b.grounded),
  nietGecentreerdEerst: (a, b) => bool(a.centered) - bool(b.centered),
};

const WITHOUT = '_zonder';

const groupingType = () => grouping;

// Sections by kind, cut at the chosen depth: a model shallower than the cut keys on the
// kind it has. Roots in a fixed order, then the smaller sections first at every level.
const KIND_DEPTH = { kind1: 1, kind2: 2, kind3: 3 };

function kindSections(models, depth) {
  const bucket = new Map();
  const perNode = new Map();
  for (const model of models) {
    const chain = model.kind ? kindChain(model.kind) : [];
    for (const id of chain) perNode.set(id, (perNode.get(id) ?? 0) + 1);
    const key = chain[Math.min(depth, chain.length) - 1] ?? WITHOUT;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(model);
  }
  const rank = (id) => {
    if (id === WITHOUT) return [99];
    const chain = kindChain(id);
    return [rootRank(id), ...chain.slice(1).map((k) => perNode.get(k) ?? 0)];
  };
  const compare = (a, b) => {
    const ra = rank(a), rb = rank(b);
    // a model on the branch itself is the "other" bucket and closes its branch
    for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
      const d = (ra[i] ?? Infinity) - (rb[i] ?? Infinity);
      if (d) return d;
    }
    return a.localeCompare(b);
  };
  const title = (id) => {
    if (id === WITHOUT) return 'No kind';
    const chain = kindChain(id);
    const names = chain.map((k) => register.kinds.get(k)?.name ?? k);
    return chain.length === 1 ? names[0] : names.slice(1).join(' › ');
  };
  const color = (id) => {
    if (id === WITHOUT) return null;
    for (const k of [...kindChain(id)].reverse()) {
      const c = register.kinds.get(k)?.color;
      if (c) return c;
    }
    return null;
  };
  return [...bucket.keys()].sort(compare).map((id) => ({
    id, title: title(id), color: color(id), hint: register.kinds.get(id)?.description, models: bucket.get(id),
  }));
}

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

  if (KIND_DEPTH[type]) return kindSections(inView, KIND_DEPTH[type]);

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
    (m) => [m.size],
    SIZE_CLASSES.map((k) => ({ id: k.id, title: k.short, hint: k.hint })),
  );
}

// Inside a kind section the deeper kinds cluster first, then the name: a barrel row
// reads barrel, barrel, keg rather than alphabetically across the whole container branch.
const byKindPath = (a, b) => (a.kind ?? '~').localeCompare(b.kind ?? '~') || SORTINGS.naam(a, b);

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

// While a material parent is picked, its subtypes lead the order within every section:
// asking for Wood is asking to see the planks together, then the worked, then the beams.
// A model on the bare parent has no subtype and sorts last.
function subtypeRank() {
  const ranked = new Map();
  for (const [id, state] of tagState) {
    if (state !== 'only') continue;
    for (const child of childrenOf.get(id) ?? []) ranked.set(child, ranked.size);
  }
  if (!ranked.size) return null;
  return (model) => {
    let best = Infinity;
    for (const id of model.tags ?? []) {
      const rank = ranked.get(id);
      if (rank !== undefined && rank < best) best = rank;
    }
    return best;
  };
}

function buildPanel() {
  observer.disconnect();
  cards.length = 0;
  sections.length = 0;
  cardsPerPath.clear();
  lastChoice = null;
  panel.replaceChildren();

  const chosen = sorting === 'naam' && KIND_DEPTH[groupingType()] ? byKindPath : SORTINGS[sorting] ?? SORTINGS.naam;
  const rank = subtypeRank();
  const order = rank ? (a, b) => rank(a) - rank(b) || chosen(a, b) : chosen;

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
      const item = makeCard(model, register.kits, variants);
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

const register = { models: new Map(), kits: new Map(), kinds: new Map(), variants: new Map(), tags: new Map() };

// A material may name a parent. A model carries the subtype it is and never the parent on
// top, so the filter adds the parent here — selecting Wood has to find every wood-beam.
const parentOf = new Map();
const childrenOf = new Map();
const withParents = (ids) => {
  const own = new Set(ids);
  for (const id of ids) { const p = parentOf.get(id); if (p) own.add(p); }
  return [...own];
};

const SHORT_NAME = {
  'metal-iron': 'Iron',
  'metal-gold': 'Gold',
  'metal-silver': 'Silver',
  'metal-copper': 'Copper',
  'stone-masonry': 'Masonry',
  'stone-rock': 'Rock',
  'stone-soil': 'Soil',
  'wood-planks': 'Planks',
  'wood-worked': 'Worked',
  'wood-beam': 'Beam',
  'wood-log': 'Log',
  'wood-bark': 'Bark',
  animation: 'Anim',
  structure: 'Struct',
  qua: 'Quat',
  assembly: 'Asmbly',
  ceramic: 'Cerm',
  textile: 'Textil',
  leather: 'Leathr',
  foliage: 'Foliag',
};

const chipName = (tag) => SHORT_NAME[tag.id] ?? tag.name;

const TAG_TYPES = [
  { type: 'material', head: 'Material' },
  { type: 'tag', head: 'Tags' },
];

const kindBreadcrumb = (id) => (id ? kindChain(id).map((k) => register.kinds.get(k)?.name ?? k).join(' › ') : '—');

// The five fields of §7, kind and use first. The material ids carry the family
// themselves — metal-iron, wood-planks — so the panel prints them as they stand.
function tagRows(model) {
  const own = (type) =>
    (model.tags ?? []).filter((id) => (register.tags.get(id)?.type ?? 'tag') === type);

  const uses = effectiveUses(model);
  const rows = [
    { kop: 'Kind', vol: 'What it is — Appendix B', waarde: kindBreadcrumb(effectiveKind(model, register.tags)) },
    { kop: 'Use', vol: 'What it is for — U1', waarde: uses.length ? uses.join(', ') : '—' },
  ];
  for (const { type, head } of TAG_TYPES) {
    const ids = own(type);
    if (!ids.length) continue;
    rows.push({
      kop: head,
      waarde: (type === 'material' ? ids : ids.map((id) => register.tags.get(id)?.name ?? id)).join(', '),
    });
  }
  return rows;
}

function colorSwatches(colors) {
  if (!colors?.length) return null;
  const strip = document.createElement('div');
  strip.className = 'detail-stalen';
  for (const hex of colors) {
    const dot = document.createElement('span');
    dot.className = 'detail-staal';
    dot.style.setProperty('--staal-kleur', hex);
    // de hex blijft bereikbaar voor wie hem nodig heeft, zonder hem te tonen
    dot.title = hex;
    strip.append(dot);
  }
  return strip;
}

function fillFacts(model, rows = null) {
  const data = document.querySelector('#detail-gegevens');
  if (!rows) {
    rows = [...data.querySelectorAll('dt')].map((dt) => ({
      kop: dt.textContent, vol: dt.title || undefined, breed: dt.className === 'breed',
      element: dt.nextElementSibling.firstElementChild ?? null, waarde: dt.nextElementSibling.textContent,
    }));
    const fresh = new Map(tagRows(model).map((r) => [r.kop, r]));
    rows = rows.filter((r) => !['Material', 'Tags'].includes(r.kop) || fresh.has(r.kop));
    for (const r of rows) if (fresh.has(r.kop)) { r.waarde = fresh.get(r.kop).waarde; fresh.delete(r.kop); }
    for (const r of fresh.values()) rows.push({ ...r, breed: true });
  }
  data.replaceChildren();
  for (const { kop, vol, waarde, breed, element } of rows) {
    const name = document.createElement('dt');
    name.textContent = kop;
    if (vol) name.title = vol;
    const valueEl = document.createElement('dd');
    if (element) valueEl.append(element);
    else valueEl.textContent = waarde;
    if (breed) { name.className = 'breed'; valueEl.className = 'breed'; }
    data.append(name, valueEl);
  }
}

function showDetail(model) {
  const kit = register.kits.get(model.kit);
  activePath = model.path;
  document.querySelector('#detail-naam').textContent = model.name;
  document.querySelector('#detail-herkomst').textContent =
    `${kit?.name ?? model.kit} · ${kindBreadcrumb(effectiveKind(model, register.tags))}`;

  const rows = [
    { kop: 'Size', vol: 'Size (w × d × h)', waarde: dimensions(model.wdh), breed: true },
    {
      kop: 'Tris',
      vol: 'Triangles',
      waarde: `${number.format(model.tris)}${model.tris >= HEAVY_FROM ? ' (heavy)' : ''}`,
      breed: model.tris >= HEAVY_FROM,
    },
    {
      kop: 'Tris / unit',
      vol: 'Triangles per unit',
      waarde: !Number.isFinite(model.tpu)
        ? '—'
        : `${number.format(model.tpu)}${model.tpu > budgetPerUnit ? ` (> ${number.format(budgetPerUnit)})` : ''}`,
      breed: Number.isFinite(model.tpu) && model.tpu > budgetPerUnit,
    },
    { kop: 'Calls', vol: 'Draw calls', waarde: model.calls === undefined ? '—' : number.format(model.calls) },
    { kop: 'Mats', vol: 'Materials', waarde: number.format(model.mat) },
    { kop: 'Verts', vol: 'Vertices', waarde: number.format(model.vtx) },
    { kop: 'Verts / tri', vol: 'Vertices per triangle', waarde: model.vpt === undefined ? '—' : unit.format(model.vpt) },
    { kop: 'Min edge', waarde: `${(model.minEdge * 100).toFixed(1)} cm` },
    { kop: 'Avg facet', vol: 'Average facet', waarde: `${(model.avgTri * 10000).toFixed(1)} cm²` },
    { kop: 'Density', waarde: number.format(model.dens) },
    { kop: 'On-angle', vol: 'On-angle facets', waarde: `${model.anglePct}%` },
    { kop: 'Gradient', vol: 'Gradient spread within the colour band', waarde: model.grad === undefined ? '—' : unit.format(model.grad) },
    {
      kop: 'Bands',
      vol: 'Colour bands the model uses — the clear glass is a material, not a band',
      waarde: model.bands === undefined ? '—' : number.format(model.bands),
    },
    {
      kop: 'Colours',
      vol: 'Colour bands the model uses',
      waarde: '—',
      element: colorSwatches(model.colors),
      breed: true,
    },
    {
      kop: 'Grid/gnd/ctr',
      vol: 'Grid-modular / grounded / centered',
      waarde: [model.gridMod, model.grounded, model.centered].map((v) => (v ? '✓' : '—')).join(' / '),
    },
    ...tagRows(model).map((row) => ({ ...row, breed: true })),
  ];
  fillFacts(model, rows);

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

  renderTagEditor(document.querySelector('#detail-tags'), model, register.tags, {
    onChange: () => {
      document.querySelector('#detail-herkomst').textContent =
        `${kit?.name ?? model.kit} · ${kindBreadcrumb(effectiveKind(model, register.tags))}`;
      fillFacts(model);
    },
  });

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
  if (from === -1 || target === -1) return setSelection(to.paths, on);
  const range = list.slice(Math.min(from, target), Math.max(from, target) + 1);
  setSelection(range.flatMap((k) => k.paths), on);
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
  setSelection(visibleCards().flatMap((k) => k.paths), true);
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

// Chips nest to any depth: a parent's tray holds its children, and a child with children
// of its own hangs its tray inside that one. Materials go one level, kinds up to four.
function reorder() {
  for (const strip of new Set(chipButtons.map((c) => c.strip))) {
    const all = chipButtons.filter((c) => c.strip === strip);
    const sorted = (list) => list.sort((a, b) => (a.byCount
      ? b.count - a.count || a.order - b.order
      : Number(b.state.has(b.id)) - Number(a.state.has(a.id)) || a.order - b.order));
    const mount = (container, parent) => {
      for (const chip of sorted(all.filter((c) => (c.parent ?? null) === parent))) {
        container.append(chip.element);
        const kids = all.filter((c) => c.parent === chip.id);
        if (!kids.length) continue;
        const tray = kids[0].tray;
        mount(tray, chip.id);
        tray.hidden = kids.every((c) => c.element.hidden);
        chip.element.classList.toggle('tagknop-ouder', !tray.hidden);
        container.append(tray);
      }
    };
    mount(strip, null);
  }
}

// A subtype waits behind its parent: it appears once every ancestor is picked, and drops
// its own state again when one is let go, so nothing keeps filtering out of sight.
const chipHidden = (chip, count = chip.count) =>
  count === 0 || chip.ancestors.some((id) => chip.state.get(id) !== 'only');

function syncSubtypes() {
  for (const chip of chipButtons) {
    if (!chip.parent) continue;
    const hidden = chipHidden(chip);
    if (hidden && chip.state.has(chip.id)) {
      chip.state.delete(chip.id);
      showState(chip.element, undefined);
    }
    chip.element.hidden = hidden;
  }
}

function buildChipRow(container, head, items, state, field, { shareRow = null, byCount = false } = {}) {
  const row = shareRow ?? document.createElement('div');
  if (!shareRow) row.className = 'kleurbalk tagrij';
  const strip = document.createElement('div');
  strip.className = 'tagbalk-knoppen';
  strip.setAttribute('role', 'group');
  strip.setAttribute('aria-label', `Filter by ${head.toLowerCase()}`);

  const ownIds = items.map((i) => i.id);

  // A subtype sits in a tray hung off its parent chip: the tray keeps the family together
  // when the row wraps, which adjacency alone does not.
  const trays = new Map();
  for (const parent of new Set(items.map((i) => i.parent).filter(Boolean))) {
    const tray = document.createElement('span');
    tray.className = 'tagbak';
    tray.dataset.parent = parent;
    trays.set(parent, tray);
  }

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
      if (item.parent || childrenOf.has(item.id)) { refresh(); return; }
      syncSubtypes();
      reorder();
      filter();
    });

    if (item.dot) button.classList.add('tagknop-punt');

    const tray = item.parent ? trays.get(item.parent) : null;
    if (tray) { button.classList.add('tagknop-subtype'); tray.append(button); } else { strip.append(button); }

    const ancestors = [];
    for (let p = item.parent; p; p = items.find((i) => i.id === p)?.parent ?? null) ancestors.push(p);
    chipButtons.push({ id: item.id, element: button, countEl, row, ownIds, state, field, strip, byCount, count: 0, order: chipButtons.length, parent: item.parent ?? null, ancestors, tray });
  }

  row.append(strip);
  if (!shareRow) container.append(row);
  return row;
}

function buildTagBar(tags) {
  const container = document.querySelector('#tagbalk');

  // Kind first: the closed tree, one chip per node, children in a tray behind the parent.
  // "No kind" is the curation queue: what the migration could not settle.
  const kinds = tags.filter((t) => t.type === 'kind');
  buildChipRow(
    container,
    'Kind',
    [
      ...kinds.map((t) => ({ id: t.id, name: t.name, hint: t.description, parent: kindParent(t.id) })),
      { id: WITHOUT, name: 'No kind', hint: 'Models the migration could not resolve to a kind — tag them in the model panel' },
    ],
    kindState,
    'kinds',
  );

  // Use and size share one row: both are short closed sets.
  const uses = tags.filter((t) => t.type === 'use');
  const shape = buildChipRow(
    container,
    'Use',
    [
      ...uses.map((t) => ({ id: t.id.replace(/^use:/, ''), name: t.name, hint: t.description })),
      { id: WITHOUT, name: 'No use', hint: 'Carries none of the eight uses' },
    ],
    useState,
    'uses',
  );
  buildChipRow(
    container,
    'Size',
    SIZE_CLASSES.map((k) => ({ id: k.id, name: k.sign, hint: k.hint, dot: true })),
    sizeState,
    'sizes',
    { shareRow: shape },
  );

  for (const { type, head } of TAG_TYPES) {
    const own = tags.filter((t) => (t.type ?? 'tag') === type);
    if (own.length === 0) continue;
    buildChipRow(
      container,
      head,
      own.map((t) => ({ id: t.id, name: chipName(t), hint: t.description, parent: t.parent ?? null })),
      tagState,
      'tags',
      { byCount: true },
    );
  }
}

function refresh() {
  buildPanel();

  // Counted per model, variants included, not per card — a card folds a whole family of
  // variants into one tile, but the chip count promises how many models actually match.
  const counts = new Map();
  const bump = (key) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const card of cards) {
    for (const model of card.family) {
      bump(`sizes|${model.size}`);
      for (const id of (model.kind ? kindChain(model.kind) : [WITHOUT])) bump(`kinds|${id}`);
      for (const id of (model.use?.length ? model.use : [WITHOUT])) bump(`uses|${id}`);
      for (const id of withParents(model.tags ?? [])) bump(`tags|${id}`);
    }
  }
  for (const chip of chipButtons) {
    const { id, element, countEl, state, field } = chip;
    const count = counts.get(`${field}|${id}`) ?? 0;
    chip.count = count;
    element.hidden = chipHidden(chip, count);
    countEl.textContent = count;
    if (count === 0 && state.get(id) === 'only') {
      state.delete(id);
      showState(element, undefined);
    }
  }
  syncSubtypes();
  reorder();
  for (const { row } of chipButtons) {
    row.hidden = !chipButtons.some((c) => c.row === row && !c.element.hidden);
  }
  document.querySelector('#alles-wis').hidden = filtersOff();

  filter();
}

const filtersOff = () => colorState.size + tagState.size + sizeState.size + kindState.size + useState.size === 0;

function onClear() {
  colorState.clear();
  tagState.clear();
  sizeState.clear();
  kindState.clear();
  useState.clear();
  for (const button of document.querySelectorAll('.staal')) showState(button, undefined);
  for (const { element } of chipButtons) showState(element, undefined);
  syncSubtypes();
  reorder();
  filter();
}

function filter() {
  document.querySelector('#alles-wis').hidden = filtersOff();
  let visible = 0;

  // A model has one kind, so two picked kinds mean either — and a picked leaf narrows its
  // picked parent rather than widening it. Two picked uses mean both, like materials.
  const onlyKinds = keysWith(kindState, 'only');
  const deepest = onlyKinds.filter((k) => !onlyKinds.some((o) => o !== k && o.startsWith(`${k}-`)));
  const notKinds = keysWith(kindState, 'not');
  const kindHit = (own) =>
    (!deepest.length || own.some((k) => deepest.includes(k))) && !own.some((k) => notKinds.includes(k));
  for (const card of cards) {
    const hit =
      matches(card.colors, colorState) &&
      kindHit(card.kinds) &&
      matches(card.uses, useState) &&
      matches(card.tags, tagState) &&
      matches(card.sizes, sizeState, { any: SIZE_CLASSES.map((k) => k.id) });
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

  register.kits = kits;
  register.kinds = new Map((data.tags ?? []).filter((t) => t.type === 'kind').map((t) => [t.id, t]));
  register.models = new Map(data.models.map((m) => [m.id, m]));
  register.variants = new Map((data.variants ?? []).map((v) => [v.id, v.members]));

  const kindsInUse = new Set(data.models.map((m) => m.kind).filter(Boolean));
  const noKind = data.models.filter((m) => !m.kind).length;
  summary.textContent =
    `${data.models.length} models · ${data.kits.length} kits · ${kindsInUse.size} kinds` +
    (noKind ? ` · ${noKind} without a kind` : '');

  variantMain = new Map((data.variants ?? []).map((v) => [v.id, v.main]));
  catalog = data;

  register.tags = new Map((data.tags ?? []).map((t) => [t.id, t]));
  parentOf.clear();
  childrenOf.clear();
  for (const tag of data.tags ?? []) {
    if (!tag.parent) continue;
    parentOf.set(tag.id, tag.parent);
    childrenOf.set(tag.parent, [...(childrenOf.get(tag.parent) ?? []), tag.id]);
  }

  buildColorBar(collectColors(data.models));
  buildTagBar(data.tags ?? []);
  mountEditBar();

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
  const anchor = raw;
  refresh();
  // a staged kind or use edit moves the model between sections and counts
  onTagEdit(() => {
    for (const model of register.models.values()) {
      model.kind = effectiveKind(model, register.tags);
      model.use = effectiveUses(model);
    }
    if (!detail.open) refresh();
  });
  document.getElementById(anchor)?.scrollIntoView();
}

start().catch((error) => {
  summary.textContent = `Could not load the catalogue: ${error.message}`;
  console.error(error);
});
