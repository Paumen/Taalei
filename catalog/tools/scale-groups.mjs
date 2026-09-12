// Scale families for the scale pages: one row per kind, so a new asset is measured
// against its own cohort (§6) and not against the catalogue at large. A parent kind with
// models of its own is a row too — those are the ones with no leaf that fits.

import { kindName, kindAncestors, kindIs } from './kinds.mjs';

const round1 = (v) => Math.max(Math.round(v * 10) / 10, 0.1);

// One page per tab. `branches` are kind prefixes; a kind takes the tab whose matching
// branch is the longest, so obj-weapon reaches obj-equip while a bare obj falls through
// to obj-gen. Every root is a branch somewhere, so no kind is left without a page.
export const SCALE_TABS = [
  {
    id: 'obj-gen', name: 'Obj gen', file: 'scale-obj-gen.html',
    branches: ['obj', 'obj-kitchenware', 'obj-furniture', 'obj-food',
      'obj-lighting', 'obj-resource'],
  },
  { id: 'obj-container', name: 'Obj container', file: 'scale-obj-container.html', branches: ['obj-container'] },
  { id: 'obj-transport', name: 'Obj transport', file: 'scale-obj-transport.html', branches: ['obj-transport'] },
  {
    id: 'obj-equip', name: 'Obj equip', file: 'scale-obj-equip.html',
    branches: ['obj-weapon', 'obj-equipment', 'obj-tool', 'obj-pocketitem', 'char'],
  },
  { id: 'str-gen', name: 'Str gen', file: 'scale-str-gen.html', branches: ['str'] },
  { id: 'env-flora', name: 'Env flora', file: 'scale-env-flora.html', branches: ['env-flora', 'env-fungi'] },
  { id: 'env-gen', name: 'Env gen', file: 'scale-env-gen.html', branches: ['env'] },
];

const tabOf = (kind) => {
  let best = null;
  let length = -1;
  for (const tab of SCALE_TABS) {
    for (const branch of tab.branches) {
      if (kindIs(kind, branch) && branch.length > length) { best = tab; length = branch.length; }
    }
  }
  if (!best) throw new Error(`kind ${kind} belongs to no scale tab — add a branch in SCALE_TABS`);
  return best;
};

// Rows seen from above rather than from the side: what is flat says more in plan.
const TOP_VIEW = new Set(['obj-kitchenware-tableware-plate',
  'str-part-floor', 'obj-furniture', 'env-remains', 'env-terrain-ground']);

// Rows stood on their longest axis: length is the measure, and the models disagree
// about which axis they lie on, so each is turned upright on its own.
const STAND_UP = new Set(['obj-kitchenware-tableware-cutlery', 'obj-pocketitem-key',
  'obj-pocketitem-scroll', 'obj-weapon-ranged-bow', 'obj-weapon-ranged-crossbow']);

// Rows of small things: a unit-tall ruler beside a flower or a dagger is mostly empty
// grid, so these measure against 0.6 — still whole major gridlines, three instead of five.
const SHORT_RULER = new Set(['env-rock-pebble', 'env-flora-deadwood-branch',
  'env-flora-plant-flower', 'env-flora-plant-grass', 'env-fungi', 'obj-container-bottle',
  'obj-container-chest', 'obj-container-bucket', 'obj-food',
  'obj-resource', 'obj-weapon-melee-dagger', 'obj-weapon-ranged-accessory']);

// The same, named by branch: every leaf under these is small, and neither parent holds
// models of its own to draw a row for.
const SHORT_RULER_BRANCHES = ['obj-pocketitem', 'obj-kitchenware'];

const SHORT_RULER_HEIGHT = 0.6;

const rulerHeight = (kind) =>
  SHORT_RULER.has(kind) || SHORT_RULER_BRANCHES.some((b) => kindIs(kind, b))
    ? SHORT_RULER_HEIGHT
    : undefined;

// Rows too wide for the standard ruler.
const WIDE_ROW = new Set(['obj-transport-ship', 'obj-transport-boat', 'str-part', 'env-terrain-mountain']);

// Skins of one hull show nothing about scale; the plain ships stand in for them.
// An open book measures its spread, not the book, so the closed ones speak for it.
const SKIP = new Set([
  'ken-pirate/ship-pirate-small', 'ken-pirate/ship-pirate-medium', 'ken-pirate/ship-pirate-large',
  'ken-pirate/ship-ghost', 'ken-pirate/ship-wreck',
  'kay-dun-1/book-open-a', 'kay-dun-1/book-open-b', 'kay-tools/journal-open',
  'quat-rpg/book-1-open', 'quat-rpg/book-2-open',
  'quat-rpg/book-3-open', 'quat-rpg/book-4-open',
]);

// An empty potion is the filled one without its liquid — the same vessel, so the eleven
// of them say nothing the filled bottles have not already said about a bottle's size.
const SKIP_RULE = (m) => m.kind === 'obj-container-bottle' && /(^|-)empty$/.test(m.name);

const breadcrumb = (id) => [...kindAncestors(id).reverse(), id].map(kindName).join(' › ');

export function buildScaleGroups(models) {
  const perKind = new Map();
  for (const m of models) {
    if (!m.kind || m.kind === 'assy' || m.kind === 'scene' || SKIP.has(m.id)) continue;
    if (SKIP_RULE(m)) continue;
    // A stack of bars measures the stack, not the bar, so a plural (F4) sets no scale
    // for its row and reads as an outsized member of it.
    if (m.tags?.includes('plural')) continue;
    if (!perKind.has(m.kind)) perKind.set(m.kind, []);
    perKind.get(m.kind).push(m);
  }

  const groups = [];
  for (const [kind, items] of perKind) {
    if (items.length < 2) continue;
    groups.push({
      slug: kind,
      name: breadcrumb(kind),
      category: tabOf(kind).id,
      topView: TOP_VIEW.has(kind) || undefined,
      standUp: STAND_UP.has(kind) || undefined,
      wideRow: WIDE_ROW.has(kind) || undefined,
      rulerHeight: rulerHeight(kind),
      items: items.map((m) => ({
        slug: m.kit,
        model: m.name,
        wdh: m.wdh.map(round1),
        tags: m.tags?.length ? m.tags : undefined,
        colors: m.colors?.length ? m.colors : undefined,
      })),
    });
  }
  // Smallest family first: a row of three says what it says at a glance, and the pages
  // that carry a row of eighty put it last rather than in the way.
  const rank = (id) => SCALE_TABS.findIndex((t) => t.id === id);
  return groups.sort((a, b) =>
    rank(a.category) - rank(b.category)
    || a.items.length - b.items.length
    || a.slug.localeCompare(b.slug));
}
