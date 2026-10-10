import {
  layoutChips, chipName, matchesState as matches, buildColorBar, buildChipRow as chipRow, syncSubtypes as syncChipStates, clearStates,
} from './chiprij.js?v=4df0d30fe4';
import { drawFamily, loadModel } from './scale-draw.js?v=1a4089f5a1';
import { stamped } from './stamps.js?v=04e3ee3113';
import { WORKFILES, SIZE_CLASSES, TAG_TYPES, withParents, collectColors, readStore } from './shared.js?v=06861d7ddb';
import './bouwstempel.js?v=964f9eed53';

const CATEGORY = document.querySelector('meta[name=scale-category]')?.content || null;

const [allGroups, catalogData, curveData] = await Promise.all([
  fetch(stamped('../build/scale-groups.json')).then((r) => r.json()),
  fetch(stamped('../build/catalog.json')).then((r) => r.json()).catch(() => ({})),
  fetch(stamped('../build/size-curves.json')).then((r) => r.json()).catch(() => ({})),
]);

const curveKinds = new Map((curveData.kinds ?? []).map((k) => [k.kind, k]));
const curveOf = (slug) => {
  const [, kind, scale] = slug.match(/^(.*?)(?:-scale-(small|big))?$/);
  const row = curveKinds.get(kind);
  if (!row) return { in: false, why: 'not in the curve table' };
  if (!row.curve) return { in: false, why: row.reason };
  if (scale && row.scale?.[scale] === undefined) return { in: false, why: `no real size for scale-${scale}` };
  return { in: true, why: 'in the size curves' };
};

const TABS = CATEGORY ? CATEGORY.split(',') : null;
const groups = TABS ? allGroups.filter((g) => TABS.includes(g.category)) : allGroups;

const bandNames = new Map((catalogData.bands ?? []).map((b) => [b.hex, b.name]));
const kitsMap = new Map((catalogData.kits ?? []).map((k) => [k.slug, k]));
const shortKit = (slug) => (kitsMap.get(slug)?.name ?? slug).replace(/\s+Kit$/, '');

for (const group of groups) {
  for (const item of group.items) {
    item.path = `${WORKFILES}/${item.slug}/${item.model}.glb`;
    item.group = item.collection ?? item.slug;
    item.kit = shortKit(item.group);
  }
}

const content = document.getElementById('inhoud');

const sizePerModel = new Map((catalogData.models ?? []).map((m) => [`${m.kit}/${m.name}`, m.size]));

const parentOf = new Map();
for (const tag of catalogData.tags ?? []) {
  if (tag.parent) parentOf.set(tag.id, tag.parent);
}

const allItems = groups.flatMap((g) => g.items);
for (const item of allItems) {
  item.tagIds = withParents(item.tags ?? [], parentOf);
  item.sizeId = sizePerModel.get(`${item.slug}/${item.model}`);
}

const KIT_IDS = [...new Set(allItems.map((i) => i.group))];
const SIZE_IDS = SIZE_CLASSES.map((k) => k.id);

const colorState = new Map();
const sizeState = new Map();
const tagState = new Map();
const kitState = new Map();

const chipButtons = [];

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
  const stored = readStore(STORAGE_KEY);
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
  matches([item.group], kitState, { any: KIT_IDS });

const filtered = () =>
  groups.map((g) => ({ ...g, items: g.items.filter(passesFilter) })).filter((g) => g.items.length);

const filtersOff = () => colorState.size + tagState.size + sizeState.size + kitState.size === 0;

const reorder = () => layoutChips(chipButtons);

const syncSubtypes = () => syncChipStates(chipButtons);

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
    const curve = curveOf(group.slug);
    section.innerHTML = `<h2><span class="curve-stip${curve.in ? ' in' : ''}" title="${curve.why}" aria-label="${curve.why}"></span>${group.name}</h2><div class="familie-doek"><canvas width="${WIDTH}" height="400"></canvas></div>`;
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
      for (const item of group.items) loadModel(item.path, item.hash).catch(() => {});
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

const buildChipRow = (container, head, items, state, field, options) =>
  chipRow(chipButtons, container, head, items, state, field, apply, options);

function onClear() {
  clearStates([colorState, tagState, sizeState, kitState], chipButtons);
  apply();
}

function buildFilters() {
  const count = (f) => allItems.filter(f).length;

  buildColorBar(collectColors(allItems, bandNames), colorState, apply);

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
      KIT_IDS.map((slug) => ({ id: slug, name: shortKit(slug), count: count((i) => i.group === slug) })),
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
