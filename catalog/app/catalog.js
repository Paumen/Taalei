import { renderTagEditor, effectiveKind, onChange as onTagEdit } from './tag-edits.js?v=ea3d5a4505';
import {
  layoutChips, chipName, keysWithState as keysWith, matchesState as matches,
  buildColorBar, buildChipRow as chipRow, syncSubtypes as syncChipStates, clearStates,
} from './chiprij.js?v=0f98fb02f2';
import { colorSwatches, setBands } from './color-edits.js?v=7b9619fe4c';
import { renderCommentBox, hasComment, onChange as onComment } from './comments.js?v=b702908fd9';
import { mountExtractBar, setPageParts } from './extract.js?v=e034d4dfc2';
import { stamped, withHash } from './stamps.js?v=04e3ee3113';
import {
  number, unit, readableBytes, dimensions, longest, kindParent, kindChain, rootRank,
  SIZE_CLASSES, LINT_LEVELS, LINT_CHECKS, lintLevels, lintChecks, lintText, TAG_TYPES,
  withParents as withParentsIn, collectColors, hydrate, WORKFILES, modelUrl, foldVariants as foldVariantsBy,
  span, glyph, flatMode, setLighting, attachViewer, watchViewers,
  makeSelection, choiceChip as makeChoiceChip, copyPathsOnClick,
} from './shared.js?v=401e058e54';
import './bouwstempel.js?v=2d49c008a7';

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

const THUMB_PATH = 'catalog/build/thumbs';

const thumbs = new Map();
const sheets = new Map();

const HEAVY_FROM = 5000;

const sizeClass = (model) => ({
  ...(SIZE_CLASSES.find((k) => k.id === model.size) ?? SIZE_CLASSES.at(-1)),
  longest: longest(model),
});

const panel = document.querySelector('#paneel');
const emptyMessage = document.querySelector('#leeg');
const summary = document.querySelector('#samenvatting');
const detail = document.querySelector('#detail');

const cards = [];
const sections = [];

let grouping = 'kind7';
let sorting = 'naam';

const selection = makeSelection(() => updateSelection());
const { chosen: chosenPaths, cardsPerPath, set: setSelection } = selection;
const familyPerPath = new Map();

let lastChoice = null;
let selectMode = false;
let filtersOpen = false;
let swipe = null;
let refreshExtract = () => {};
let commentDirty = false;

const colorState = new Map();
let colorKeys = [];
const sizeState = new Map();
const kindState = new Map([['set', 'not']]);

const tagState = new Map();
const lintState = new Map();
const checkState = new Map();

const chipButtons = [];

let catalog = null;
let totals = { models: 0, kits: 0 };

const observer = watchViewers();

const thumbSrc = (box) => {
  const sheet = sheets.get(box.dataset.thumb);
  return withHash(`${THUMB_PATH}/${box.dataset.thumb}${flatMode.on ? '.flat' : ''}.webp`, flatMode.on ? sheet.f : sheet.v);
};

function showThumb(box, at) {
  const { cols } = sheets.get(box.dataset.thumb);
  const image = document.createElement('img');
  image.className = 'sprite';
  image.src = thumbSrc(box);
  image.alt = box.dataset.alt;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.style.setProperty('--cols', cols);
  image.style.setProperty('--col', at % cols);
  image.style.setProperty('--row', Math.floor(at / cols));
  box.replaceChildren(image);
}

function makeCard(model, kits, variants = []) {
  const kit = kits.get(model.group);

  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'kaart';
  card.style.setProperty('--merk-kleur', KIT_COLORS[model.group] ?? 'currentColor');

  const box = document.createElement('div');
  box.className = 'kaart-viewer';
  box.dataset.src = modelUrl(model);
  box.dataset.alt = `3D model ${model.name} from ${kit?.name ?? model.group}`;
  const thumb = thumbs.get(model.id);
  if (thumb) {
    box.dataset.thumb = thumb.kind;
    showThumb(box, thumb.at);
  }

  const size = sizeClass(model);
  const glyphs = span('kaart-glyfen');
  glyphs.append(glyph('maat', size.sign, `${size.hint} (longest axis ${size.longest.toFixed(2)})`));
  if (model.anim?.length) {
    glyphs.append(glyph('animatie', '▶', `${model.anim.length} animation${model.anim.length > 1 ? 's' : ''} — playable in the model panel`));
  }
  const levels = lintLevels(model);
  if (levels.length) {
    glyphs.append(glyph(levels.includes('error') ? 'lint-fout' : 'lint-waarschuwing', '⚠',
      model.lint.map(lintText).join('\n')));
  }
  if (hasComment(model)) {
    glyphs.append(glyph('opmerking', '✎', 'Carries a comment — read it in the model panel'));
  }
  if (variants.length) {
    glyphs.append(glyph('variant', `⧉ ${variants.length + 1}`,
      `${variants.length + 1} variants of the same model — viewable in the model panel`));
  }

  const text = document.createElement('div');
  text.className = 'kaart-tekst';
  const meta = span('kaart-meta');
  meta.append(
    span('kaart-merk', kit?.name ?? model.group),
    span('kaart-grootte', readableBytes(model.bytes)),
  );
  text.append(span('kaart-naam', model.name), meta);

  card.append(box, glyphs, text);

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
    sizes: [...new Set(family.map((m) => m.size))],
    lint: [...new Set(family.flatMap(lintLevels))],
    checks: [...new Set(family.flatMap(lintChecks))],
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
  if (!thumb) observer.observe(box);
  return item;
}

function cardUnder(x, y) {
  return document.elementFromPoint(x, y)?.closest('.kaart-houder[data-pad]');
}

panel.addEventListener('pointerdown', (e) => {
  if (!selectMode || e.button !== 0) return;
  if (e.target.closest('.kaart-kies')) return;
  const holder = e.target.closest('.kaart-houder[data-pad]');
  if (!holder) return;
  const path = holder.dataset.pad;
  swipe = { on: !chosenPaths.has(path), done: new Set([path]) };
  setSelection(familyPerPath.get(path) ?? [path], swipe.on);
  lastChoice = cardsPerPath.get(path)?.[0] ?? lastChoice;
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
    setSelection(visible.flatMap((k) => k.paths), on);
  });
  head.append(all);

  const grid = document.createElement('div');
  grid.className = 'rooster';
  section.append(head, grid);
  return { section, grid, countEl };
}

const num = (v) => v ?? 0;
const bool = (v) => (v ? 1 : 0);

const SORTINGS = {
  naam: (a, b) => a.name.localeCompare(b.name, 'en') || a.group.localeCompare(b.group) || a.kit.localeCompare(b.kit),
  groot: (a, b) => longest(b) - longest(a),
  klein: (a, b) => longest(a) - longest(b),
  zwaar: (a, b) => b.tris - a.tris,
  licht: (a, b) => a.tris - b.tris,
  dichtste: (a, b) => num(b.tpu) - num(a.tpu),
  ijlste: (a, b) => num(a.tpu) - num(b.tpu),
  bestand: (a, b) => b.bytes - a.bytes,
  bestandKlein: (a, b) => a.bytes - b.bytes,
  meesteVtx: (a, b) => b.vtx - a.vtx,
  minsteVtx: (a, b) => a.vtx - b.vtx,
  grofsteFacet: (a, b) => num(b.avgTri) - num(a.avgTri),
  fijnsteFacet: (a, b) => num(a.avgTri) - num(b.avgTri),
  kleinsteRand: (a, b) => num(a.minEdge) - num(b.minEdge),
  grootsteRand: (a, b) => num(b.minEdge) - num(a.minEdge),
  meestOpRaster: (a, b) => num(b.anglePct) - num(a.anglePct),
  minstOpRaster: (a, b) => num(a.anglePct) - num(b.anglePct),
  dunsteVsSoort: (a, b) => (a.thickRel ?? Infinity) - (b.thickRel ?? Infinity),
  diksteVsSoort: (a, b) => num(b.thickRel) - num(a.thickRel),
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

const KIND_DEPTH = { kindauto: 2, kind1: 1, kind2: 2, kind3: 3, kind4: 4, kind5: 5, kind6: 6, kind7: 7 };

const KIND_SPLIT_OVER = { kindauto: 48 };

function kindSections(models, depth, splitOver = 0) {
  const bucket = new Map();
  const perNode = new Map();
  const cutOf = new Map();
  for (const model of models) {
    const chain = model.kind ? kindChain(model.kind) : [];
    for (const id of chain) perNode.set(id, (perNode.get(id) ?? 0) + 1);
    const key = chain[Math.min(depth, chain.length) - 1] ?? WITHOUT;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(model);
  }
  for (let split = Boolean(splitOver); split; ) {
    split = false;
    for (const [key, group] of [...bucket]) {
      const cut = cutOf.get(key) ?? depth;
      if (key === WITHOUT || group.length <= splitOver) continue;
      if (!group.some((m) => kindChain(m.kind).length > cut)) continue;
      bucket.delete(key);
      for (const model of group) {
        const chain = kindChain(model.kind);
        const deeper = chain[Math.min(cut + 1, chain.length) - 1];
        if (!bucket.has(deeper)) bucket.set(deeper, []);
        bucket.get(deeper).push(model);
        cutOf.set(deeper, cut + 1);
      }
      split = true;
    }
  }
  const rank = (id) => {
    if (id === WITHOUT) return [99];
    const chain = kindChain(id);
    return [rootRank(id), ...chain.slice(1).map((k) => perNode.get(k) ?? 0)];
  };
  const compare = (a, b) => {
    const ra = rank(a), rb = rank(b);
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
    id, title: title(id), color: color(id), models: bucket.get(id),
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
      (m) => [m.group],
      catalog.kits.map((k) => ({
        id: k.slug,
        title: k.name,
        color: KIT_COLORS[k.slug],
        hint: k.note,
        source: sourceFor(k.url),
      })),
    );
  }

  if (KIND_DEPTH[type]) return kindSections(inView, KIND_DEPTH[type], KIND_SPLIT_OVER[type] ?? 0);

  if (type === 'lint') {
    return perKey(
      (m) => (lintLevels(m).length ? lintLevels(m) : [WITHOUT]),
      [...LINT_LEVELS.map((k) => ({ id: k.id, title: k.name, hint: k.hint })), { id: WITHOUT, title: 'Clean' }],
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
    (m) => [m.size],
    SIZE_CLASSES.map((k) => ({ id: k.id, title: k.short, hint: k.hint })),
  );
}

const byKindPath = (a, b) => (a.kind ?? '~').localeCompare(b.kind ?? '~') || SORTINGS.naam(a, b);

let variantMain = new Map();

const foldVariants = (models) => foldVariantsBy(models, variantMain);

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

const parentOf = new Map();
const childrenOf = new Map();
const withParents = (ids) => withParentsIn(ids, parentOf);

const marked = (model, field, text) =>
  span((model.mark ?? []).includes(field) ? 'feit-fout' : '', text);

function placing(model) {
  const box = span('');
  box.append(
    marked(model, null, model.gridMod ? '✓' : '—'),
    ' / ',
    marked(model, 'grounded', model.grounded ? '✓' : '—'),
    ' / ',
    marked(model, 'centered', model.centered ? '✓' : '—'),
  );
  return box;
}

function fillFacts(lines) {
  const data = document.querySelector('#detail-gegevens');
  data.replaceChildren();
  for (const facts of lines) {
    const line = document.createElement('div');
    line.className = 'feitrij';
    for (const { kop, vol, waarde, element } of facts) {
      const name = document.createElement('dt');
      name.textContent = kop;
      if (vol) name.title = vol;
      const valueEl = document.createElement('dd');
      if (element) valueEl.append(element);
      else valueEl.textContent = waarde;
      line.append(name, valueEl);
    }
    data.append(line);
  }
}

function showDetail(model) {
  const kit = register.kits.get(model.group);
  activePath = model.path;
  document.querySelector('#detail-naam').textContent = model.name;
  document.querySelector('#detail-herkomst').textContent = kit?.name ?? model.group;

  const lines = [
    [{ kop: 'Size', vol: 'Size (w × d × h)', waarde: dimensions(model.wdh) }],
    [
      {
        kop: 'Tris',
        vol: 'Triangles',
        waarde: `${number.format(model.tris)}${model.tris >= HEAVY_FROM ? ' (heavy)' : ''}`,
      },
      {
        kop: '/ unit',
        vol: 'Triangles per unit',
        waarde: Number.isFinite(model.tpu) ? number.format(model.tpu) : '—',
      },
    ],
    [
      { kop: 'Calls', vol: 'Draw calls', waarde: model.calls === undefined ? '—' : number.format(model.calls) },
      { kop: 'Mats', vol: 'Materials', waarde: number.format(model.mat) },
      {
        kop: 'Bands',
        vol: 'Colour bands the model uses — the clear glass is a material, not a band',
        waarde: model.bands === undefined ? '—' : number.format(model.bands),
      },
    ],
    [
      { kop: 'Verts', vol: 'Vertices', waarde: number.format(model.vtx) },
      { kop: '/ tri', vol: 'Vertices per triangle', waarde: model.vpt === undefined ? '—' : unit.format(model.vpt) },
      { kop: 'Min edge', waarde: `${(model.minEdge * 100).toFixed(1)} cm` },
      { kop: 'Avg facet', vol: 'Average facet', waarde: `${(model.avgTri * 10000).toFixed(1)} cm²` },
      { kop: 'On-angle', vol: 'On-angle facets', waarde: `${model.anglePct}%` },
      {
        kop: 'Thick',
        vol: 'Mean depth of the visible solid over the middle extent, then against the kind median',
        waarde: model.thick === undefined ? '—' : `${unit.format(model.thick)}${model.thickRel === undefined ? '' : ` · ${unit.format(model.thickRel)}×`}`,
      },
      {
        kop: 'Gradient',
        vol: 'Gradient spread within the colour band',
        element: marked(model, 'grad', model.grad === undefined ? '—' : unit.format(model.grad)),
      },
    ],
    [
      {
        kop: 'Colours',
        vol: 'Colour bands the model uses — tap a band to mark it partly wrong, then wrong',
        waarde: '—',
        element: colorSwatches(model),
      },
      {
        kop: 'Grid/gnd/ctr',
        vol: 'Grid-modular / grounded / centered',
        element: placing(model),
      },
    ],
  ];
  fillFacts(lines);

  const download = document.querySelector('#detail-download');
  download.href = modelUrl(model);
  download.setAttribute('download', `${model.name}.glb`);

  const viewer = document.createElement('model-viewer');
  viewer.src = modelUrl(model);
  viewer.alt = `3D model ${model.name}`;
  viewer.setAttribute('camera-controls', '');
  viewer.setAttribute('camera-orbit', '35deg 68deg auto');
  viewer.setAttribute('shadow-softness', '0.9');
  setLighting(viewer, '0.7');

  const clips = model.anim ?? [];
  viewer.setAttribute('auto-rotate', '');
  viewer.setAttribute('rotation-per-second', '18deg');
  // the distance model-viewer frames the model at, kept so a later orbit can be read
  // as a zoom factor rather than a bare number of metres
  viewer.addEventListener('load', () => {
    const orbit = viewer.getCameraOrbit?.();
    if (orbit) viewer.dataset.framedRadius = String(orbit.radius);
  }, { once: true });
  // auto-rotate picks up again a few seconds after a drag ends, so the camera at the
  // moment a note is saved is wherever the spin reached. Keep the last one the reader
  // actually drove instead.
  viewer.addEventListener('camera-change', (e) => {
    if (e.detail?.source !== 'user-interaction') return;
    const orbit = viewer.getCameraOrbit?.();
    if (!orbit) return;
    viewer.dataset.lastLook = [orbit.theta, orbit.phi, orbit.radius].join(' ');
    showViewHint?.();
  });

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

  const lintBlock = document.querySelector('#detail-lint');
  const lintList = document.querySelector('#detail-lint-lijst');
  lintBlock.hidden = !model.lint?.length;
  lintList.replaceChildren(...(model.lint ?? []).map((f) => {
    const row = document.createElement('li');
    row.className = `lintregel lint-${f.level}`;
    row.textContent = lintText(f);
    return row;
  }));

  renderTagEditor(document.querySelector('#detail-tags'), model, register.tags);
  ({ showView: showViewHint } = renderCommentBox(document.querySelector('#detail-opmerking'), model, { readView: panelView }));

  detail.showModal();
  updateSelection();
}

const OFF = '';

const choiceChip = (text, active, action, container, path) =>
  makeChoiceChip(text, active, action, container, path, selection);

// What the panel is showing, in the terms tools/renders/render.mjs takes. model-viewer
// counts phi down from straight up and render.mjs counts elevation up from the
// horizon, so one is ninety degrees minus the other; azimuth already agrees.
// framedRadius is the distance model-viewer chose when the model loaded, so the ratio
// against it is how far the view has been zoomed in since. It is not render.mjs's
// --fit: model-viewer frames the bounding sphere and render.mjs frames the silhouette,
// and how far those two differ depends on the model and the angle. zoom says whether
// a note was written on a detail or on the whole model; the framing is set by eye.
let showViewHint = null;
function panelView() {
  const viewer = detailViewer.querySelector('model-viewer');
  if (!viewer?.getCameraOrbit) return null;
  let orbit;
  const driven = viewer.dataset.lastLook?.split(' ').map(Number);
  if (driven?.length === 3 && driven.every(Number.isFinite)) {
    orbit = { theta: driven[0], phi: driven[1], radius: driven[2] };
  } else {
    try {
      orbit = viewer.getCameraOrbit();
    } catch {
      return null;
    }
  }
  if (!orbit) return null;
  const degrees = (radians) => (radians * 180) / Math.PI;
  const az = Math.round(((degrees(orbit.theta) % 360) + 360) % 360);
  // straight up or straight down leaves render.mjs no way to tell which way round the
  // picture goes, and it drops the azimuth. A tenth of a degree off keeps both.
  const el = Math.min(89.9, Math.max(-89.9, Math.round(90 - degrees(orbit.phi))));
  const framed = Number(viewer.dataset.framedRadius);
  const zoom = framed > 0 && orbit.radius > 0 ? framed / orbit.radius : null;
  return {
    view: `${az}/${el}`,
    ...(zoom ? { zoom: Math.round(zoom * 100) / 100 } : {}),
    orbit: `${az}deg ${Math.round(degrees(orbit.phi))}deg ${orbit.radius.toFixed(3)}m`,
    fov: Math.round(viewer.getFieldOfView?.() ?? 0),
  };
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

detail.addEventListener('close', () => {
  detailViewer.replaceChildren();
  if (!commentDirty) return;
  commentDirty = false;
  refresh();
});

onComment(() => {
  refreshExtract();
  if (detail.open) commentDirty = true;
  else refresh();
});
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
  refreshExtract();
  if (detail.open) {
    const on = chosenPaths.has(activePath);
    detailSelect.textContent = on ? 'Remove from selection' : 'Add to selection';
    detailSelect.setAttribute('aria-pressed', String(on));
  }
}

copyPathsOnClick(selectionCopy, chosenPaths);

document.querySelector('#selectie-alles').addEventListener('click', () => {
  setSelection(visibleCards().flatMap((k) => k.paths), true);
});

document.querySelector('#selectie-wis').addEventListener('click', () => {
  setSelection([...chosenPaths], false);
  lastChoice = null;
});

detailSelect.addEventListener('click', () => {
  setSelection(familyPerPath.get(activePath) ?? [activePath], !chosenPaths.has(activePath));
});

const reorder = () => layoutChips(chipButtons);

const syncSubtypes = (counts = null) => syncChipStates(chipButtons, {
  countOf: counts ? (chip) => counts.get(`${chip.field}|${chip.id}`) ?? 0 : null,
  skip: (chip) => chip.extra && !filtersOpen && chip.state.get(chip.id) === undefined,
});

const buildChipRow = (container, head, items, state, field, options) =>
  chipRow(chipButtons, container, head, items, state, field, (id) => {
    if (items.find((i) => i.id === id)?.parent || items.some((i) => i.parent === id)) { refresh(); return; }
    syncSubtypes();
    reorder();
    filter();
  }, options);

function buildTagBar(tags) {
  const container = document.querySelector('#tagbalk');

  const kinds = tags.filter((t) => t.type === 'kind');
  const shape = buildChipRow(
    container,
    'Kind',
    [
      ...kinds.map((t) => ({ id: t.id, name: chipName(t), full: t.name, hint: t.description, parent: kindParent(t.id) })),
      { id: WITHOUT, name: 'No kind', hint: 'Models the migration could not resolve to a kind — tag them in the model panel' },
    ],
    kindState,
    'kinds',
  );
  buildChipRow(
    container,
    'Size',
    SIZE_CLASSES.map((k) => ({ id: k.id, name: k.sign, hint: k.hint })),
    sizeState,
    'sizes',
    { shareRow: shape, extra: true },
  );
  const lintRow = buildChipRow(
    container,
    'Lint',
    LINT_LEVELS.map((k) => ({ id: k.id, name: k.name, hint: k.hint, dot: true })),
    lintState,
    'lint',
    { extra: true },
  );
  buildChipRow(
    container,
    'Check',
    LINT_CHECKS.map((k) => ({ id: k.id, name: k.name, hint: k.hint, dot: true })),
    checkState,
    'checks',
    { shareRow: lintRow, extra: true },
  );

  for (const { type, head, extra = false } of TAG_TYPES) {
    const own = tags.filter((t) => (t.type ?? 'tag') === type);
    if (own.length === 0) continue;
    buildChipRow(
      container,
      head,
      own.map((t) => ({ id: t.id, name: chipName(t), full: t.name, hint: t.description, parent: t.parent ?? null })),
      tagState,
      'tags',
      { byCount: true, extra },
    );
  }
}

function refresh() {
  buildPanel();

  const counts = new Map();
  const bump = (key) => counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const card of cards) {
    for (const model of card.family) {
      bump(`sizes|${model.size}`);
      for (const id of (model.kind ? kindChain(model.kind) : [WITHOUT])) bump(`kinds|${id}`);
      for (const id of withParents(model.tags ?? [])) bump(`tags|${id}`);
      for (const id of lintLevels(model)) bump(`lint|${id}`);
      for (const id of lintChecks(model)) bump(`checks|${id}`);
    }
  }
  syncSubtypes(counts);
  syncSubtypes();
  reorder();
  document.querySelector('#alles-wis').hidden = filtersOff();

  filter();
}

const filtersOff = () =>
  colorState.size + tagState.size + sizeState.size + kindState.size
  + lintState.size + checkState.size === 0;

function onClear() {
  clearStates([colorState, tagState, sizeState, kindState, lintState, checkState], chipButtons);
  syncSubtypes();
  reorder();
  filter();
}

function filter() {
  document.querySelector('#alles-wis').hidden = filtersOff();
  let visible = 0;

  const onlyKinds = keysWith(kindState, 'only');
  const deepest = onlyKinds.filter((k) => !onlyKinds.some((o) => o !== k && o.startsWith(`${k}-`)));
  const notKinds = keysWith(kindState, 'not');
  const kindHit = (own) =>
    (!deepest.length || own.some((k) => deepest.includes(k))) && !own.some((k) => notKinds.includes(k));
  const shown = new Set();
  for (const card of cards) {
    const hit =
      matches(card.colors, colorState, { any: colorKeys }) &&
      kindHit(card.kinds) &&
      matches(card.tags, tagState) &&
      matches(card.sizes, sizeState, { any: SIZE_CLASSES.map((k) => k.id) }) &&
      matches(card.lint, lintState, { any: LINT_LEVELS.map((k) => k.id) }) &&
      matches(card.checks, checkState, { any: LINT_CHECKS.map((k) => k.id) });
    card.element.hidden = !hit;
    if (hit) {
      visible++;
      for (const model of card.family) shown.add(model.id);
    }
  }

  summary.textContent =
    `${number.format(shown.size)} / ${number.format(totals.models)} models · ${totals.kits} kits`;

  for (const section of sections) {
    const count = section.cards.filter((k) => !k.element.hidden).length;

    section.element.hidden = count === 0;
    section.countEl.textContent = number.format(count);
  }

  emptyMessage.hidden = visible > 0;
}

async function loadThumbs() {
  try {
    const response = await fetch(stamped('catalog/build/thumbs.json'));
    if (!response.ok) return;
    const data = await response.json();
    for (const [kind, sheet] of Object.entries(data.sheets ?? {})) sheets.set(kind, sheet);
    for (const [id, own] of Object.entries(data.models ?? {})) if (sheets.has(own.kind)) thumbs.set(id, own);
  } catch {}
}

async function start() {
  const response = await fetch(stamped('catalog/build/catalog.json'));
  if (!response.ok) throw new Error(`catalog/build/catalog.json not found (${response.status})`);
  const data = await response.json();
  for (const model of data.models) hydrate(model, WORKFILES);

  const kits = new Map(data.kits.map((k) => [k.slug, k]));

  register.kits = kits;
  register.kinds = new Map((data.tags ?? []).filter((t) => t.type === 'kind').map((t) => [t.id, t]));
  register.models = new Map(data.models.map((m) => [m.id, m]));
  register.variants = new Map((data.variants ?? []).map((v) => [v.id, v.members]));

  totals = { models: data.models.length, kits: data.kits.length };

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

  await loadThumbs();

  const bands = data.bands ?? [];
  const colors = collectColors(data.models, new Map(bands.map((b) => [b.hex, b.name])));
  colorKeys = colors.map((c) => c.hex);
  buildColorBar(colors, colorState, () => filter());
  setBands(bands);
  buildTagBar(data.tags ?? []);
  setPageParts();
  refreshExtract = mountExtractBar();

  document.querySelector('#alles-wis').addEventListener('click', onClear);

  const selectButton = document.querySelector('#kiesmodus');
  selectButton.addEventListener('click', () => {
    selectMode = !selectMode;
    selectButton.setAttribute('aria-pressed', String(selectMode));
    document.body.classList.toggle('kiesmodus', selectMode);
  });

  const filterButton = document.querySelector('#filterpaneel');
  filterButton.addEventListener('click', () => {
    filtersOpen = !filtersOpen;
    filterButton.setAttribute('aria-pressed', String(filtersOpen));
    filterButton.setAttribute('aria-expanded', String(filtersOpen));
    syncSubtypes();
    reorder();
    filter();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const lightButton = document.querySelector('#licht');
  lightButton.addEventListener('click', () => {
    flatMode.on = !flatMode.on;
    lightButton.setAttribute('aria-pressed', String(flatMode.on));

    for (const box of document.querySelectorAll('.kaart-viewer')) {
      if (box.dataset.thumb) {
        const image = box.querySelector('img');
        if (image) image.src = thumbSrc(box);
        continue;
      }
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
  onTagEdit(() => {
    for (const model of register.models.values()) {
      model.kind = effectiveKind(model, register.tags);
    }
    if (!detail.open) refresh();
  });
  document.getElementById(anchor)?.scrollIntoView();
}

start().catch((error) => {
  summary.textContent = `Could not load the catalog: ${error.message}`;
  console.error(error);
});
