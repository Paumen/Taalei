import { makeChipStrip, layoutChips, syncChips, showChipState as showState, chipName } from './chiprij.js?v=6561a5e435';
import { drawFamily, loadModel, version } from './scale-draw.js?v=6561a5e435';
import './bouwstempel.js?v=6561a5e435';

const MODEL_PATH = 'kits/workfiles';

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

const CATEGORY = document.querySelector('meta[name=scale-category]')?.content || null;

const [allGroups, catalogData] = await Promise.all([
  fetch(`../build/scale-groups.json?v=${version}`).then((r) => r.json()),
  fetch(`../build/catalog.json?v=${version}`).then((r) => r.json()).catch(() => ({})),
]);

const TABS = CATEGORY ? CATEGORY.split(',') : null;
const groups = TABS ? allGroups.filter((g) => TABS.includes(g.category)) : allGroups;

const kitsMap = new Map((catalogData.kits ?? []).map((k) => [k.slug, k]));
const shortKit = (slug) => (kitsMap.get(slug)?.name ?? slug).replace(/\s+Kit$/, '');

for (const group of groups) {
  for (const item of group.items) {
    item.path = `${MODEL_PATH}/${item.slug}/${item.model}.glb`;
    item.kit = shortKit(item.slug);
  }
}

const content = document.getElementById('inhoud');

const SIZE_CLASSES = [
  { id: 's', sign: 'S', short: 'Small', limit: 0.5, hint: 'small — under half a unit' },
  { id: 'm', sign: 'M', short: 'Medium', limit: 1.5, hint: 'medium — half to one and a half units' },
  { id: 'l', sign: 'L', short: 'Large', limit: Infinity, hint: 'large — over one and a half units' },
];

const sizeOf = (item) => {
  const longest = Math.max(...item.wdh);
  return (SIZE_CLASSES.find((k) => longest < k.limit) ?? SIZE_CLASSES.at(-1)).id;
};

const TAG_TYPES = [
  { type: 'material', head: 'Material' },
  { type: 'attribute', head: 'Storeys' },
  { type: 'tag', head: 'Tags' },
  { type: 'theme', head: 'Theme' },
  { type: 'artist', head: 'Artist' },
];

const parentOf = new Map();
for (const tag of catalogData.tags ?? []) {
  if (tag.parent) parentOf.set(tag.id, tag.parent);
}

const withParents = (ids) => {
  const own = new Set(ids);
  for (const id of ids) {
    for (let p = parentOf.get(id); p && !own.has(p); p = parentOf.get(p)) own.add(p);
  }
  return [...own];
};

const allItems = groups.flatMap((g) => g.items);
for (const item of allItems) {
  item.tagIds = withParents(item.tags ?? []);
  item.sizeId = sizeOf(item);
}

const KIT_IDS = [...new Set(allItems.map((i) => i.slug))];
const SIZE_IDS = SIZE_CLASSES.map((k) => k.id);

const colorState = new Map();
const sizeState = new Map();
const tagState = new Map();
const kitState = new Map();

const chipButtons = [];

const NEXT = { undefined: 'only', only: 'not', not: undefined };

function rotateState(state, key, button) {
  const next = NEXT[state.get(key)];
  if (next) state.set(key, next);
  else state.delete(key);
  showState(button, next);
  return next;
}

const keysWith = (state, value) => [...state].filter(([, v]) => v === value).map(([k]) => k);

function matches(own, state, { any = [] } = {}) {
  const only = keysWith(state, 'only');
  const either = only.filter((e) => any.includes(e));
  const all = only.filter((e) => !any.includes(e));
  if (either.length && !own.some((e) => either.includes(e))) return false;
  if (!all.every((e) => own.includes(e))) return false;
  const not = keysWith(state, 'not');
  return !own.some((e) => not.includes(e));
}

const STORAGE_KEY = 'taaleiland-scale-filters-v1';
const STORED_STATES = { color: colorState, tag: tagState, size: sizeState, kit: kitState };

function saveStates() {
  try {
    const out = Object.entries(STORED_STATES)
      .filter(([, state]) => state.size)
      .map(([name, state]) => [name, Object.fromEntries(state)]);
    if (out.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(out)));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function loadStates() {
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return;
  }
  if (!stored || typeof stored !== 'object') return;
  for (const [name, state] of Object.entries(STORED_STATES)) {
    for (const [id, value] of Object.entries(stored[name] ?? {})) {
      if (value === 'only' || value === 'not') state.set(id, value);
    }
  }
}

loadStates();

const passesFilter = (item) =>
  matches(item.colors ?? [], colorState) &&
  matches(item.tagIds, tagState) &&
  matches([item.sizeId], sizeState, { any: SIZE_IDS }) &&
  matches([item.slug], kitState, { any: KIT_IDS });

const filtered = () =>
  groups.map((g) => ({ ...g, items: g.items.filter(passesFilter) })).filter((g) => g.items.length);

const filtersOff = () => colorState.size + tagState.size + sizeState.size + kitState.size === 0;

const reorder = () => layoutChips(chipButtons);

function syncSubtypes() {
  syncChips(chipButtons, {
    stateOf: (id, chip) => chip.state.get(id),
    onHide: (chip) => { chip.state.delete(chip.id); },
  });
  for (const chip of chipButtons) {
    if (chip.count === 0 && chip.state.get(chip.id) === 'only') chip.state.delete(chip.id);
  }
}

function apply() {
  syncSubtypes();
  reorder();
  saveStates();
  document.querySelector('#alles-wis').hidden = filtersOff();
  buildSections();
}

const WIDTH = 1800;

let watcher = null;
let queue = Promise.resolve();

function buildSections() {
  watcher?.disconnect();
  content.replaceChildren();
  const visible = filtered();

  for (const group of visible) {
    const section = document.createElement('section');
    section.className = 'familie';
    section.id = group.slug;
    section.innerHTML = `<h2>${group.name}</h2><div class="familie-doek"><canvas width="${WIDTH}" height="400"></canvas></div>`;
    content.appendChild(section);
  }

  watcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      watcher.unobserve(entry.target);
      const section = entry.target;
      const group = visible.find((g) => g.slug === section.id);
      const canvas = section.querySelector('canvas');
      section.classList.add('bezig');
      for (const item of group.items) loadModel(item.path).catch(() => {});
      queue = queue.then(async () => {
        try {
          const out = await drawFamily(group, canvas, group.wideRow ? WIDTH * 2 : WIDTH);
          if (!out) section.classList.add('mislukt');
        } catch (error) {
          console.error('family failed', section.id, error);
          section.classList.add('mislukt');
        } finally {
          section.classList.remove('bezig');
        }
      });
    }
  }, { rootMargin: '600px 0px' });

  for (const section of content.querySelectorAll('.familie')) watcher.observe(section);
}

function collectColors(items) {
  const counts = new Map();
  for (const item of items) {
    for (const hex of item.colors ?? []) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts]
    .map(([hex, count]) => ({ hex, count, name: colorName(hex) }))
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));
}

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
    showState(button, colorState.get(color.hex));
    button.title = `${color.name} ${color.hex} — ${color.count} models`;
    button.setAttribute('aria-label', `${color.name} ${color.hex}, ${color.count} models`);

    button.addEventListener('click', () => {
      rotateState(colorState, color.hex, button);
      apply();
    });

    swatches.append(button);
  }

  const group = document.createElement('div');
  group.className = 'kleurgroep';
  group.append(swatches);
  container.append(group);
}

function buildChipRow(container, head, items, state, field, { shareRow = null, byCount = false } = {}) {
  const { row, chips } = makeChipStrip({
    label: `Filter by ${head.toLowerCase()}`,
    items, container, shareRow, byCount, hideEmpty: true,
    stateOf: (id) => state.get(id),
    onPick: (id, button) => {
      rotateState(state, id, button);
      apply();
    },
  });
  for (const chip of chips) { chip.state = state; chip.field = field; }
  chipButtons.push(...chips);
  return row;
}

function onClear() {
  colorState.clear();
  tagState.clear();
  sizeState.clear();
  kitState.clear();
  for (const button of document.querySelectorAll('.staal')) showState(button, undefined);
  for (const { element } of chipButtons) showState(element, undefined);
  apply();
}

function buildFilters() {
  const count = (f) => allItems.filter(f).length;

  buildColorBar(collectColors(allItems));

  const container = document.querySelector('#tagbalk');

  buildChipRow(
    container,
    'Size',
    SIZE_CLASSES.map((k) => ({
      id: k.id, name: k.sign, full: k.short, hint: k.hint, dot: true,
      count: count((i) => i.sizeId === k.id),
    })),
    sizeState,
    'sizes',
  );

  for (const { type, head } of TAG_TYPES) {
    const own = (catalogData.tags ?? []).filter((t) => (t.type ?? 'tag') === type);
    if (own.length === 0) continue;
    buildChipRow(
      container,
      head,
      own.map((t) => ({
        id: t.id, name: chipName(t), full: t.name, hint: t.description, parent: t.parent ?? null,
        count: count((i) => i.tagIds.includes(t.id)),
      })),
      tagState,
      'tags',
      { byCount: true },
    );
  }

  if (KIT_IDS.length > 1) {
    buildChipRow(
      container,
      'Kit',
      KIT_IDS.map((slug) => ({ id: slug, name: shortKit(slug), count: count((i) => i.slug === slug) })),
      kitState,
      'kits',
      { byCount: true },
    );
  }

  document.querySelector('#alles-wis').addEventListener('click', onClear);
}

buildFilters();
syncSubtypes();
reorder();
document.querySelector('#alles-wis').hidden = filtersOff();
buildSections();
