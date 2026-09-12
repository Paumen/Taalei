// Scale families for schaal.html: one row per kind, so a new asset is measured against
// its own cohort (§6) and not against the catalogue at large. A parent kind with models
// of its own is a row too — those are the ones with no leaf that fits.

import { kindName, kindAncestors, kindRoot, ROOT_ORDER } from './kinds.mjs';

const round1 = (v) => Math.max(Math.round(v * 10) / 10, 0.1);

// Rows seen from above rather than from the side: what is flat says more in plan.
const TOP_VIEW = new Set(['obj-kitchenware-tableware-plate', 'obj-kitchenware-tableware-bowl',
  'str-building-floor', 'obj-furniture', 'env-remains', 'env-terrain-ground']);

// Rows stood on their longest axis: length is the measure, and the models disagree
// about which axis they lie on, so each is turned upright on its own.
const STAND_UP = new Set(['obj-kitchenware-tableware-cutlery', 'obj-pocketitem-key',
  'obj-pocketitem-scroll']);

// Rows too wide for the standard ruler.
const WIDE_ROW = new Set(['obj-transport-ship', 'obj-transport-boat', 'str-building', 'env-terrain-mountain']);

// Skins of one hull show nothing about scale; the plain ships stand in for them.
// An open book measures its spread, not the book, so the closed ones speak for it.
const SKIP = new Set([
  'pirate-kit/ship-pirate-small', 'pirate-kit/ship-pirate-medium', 'pirate-kit/ship-pirate-large',
  'pirate-kit/ship-ghost', 'pirate-kit/ship-wreck',
  'dungeon/book-open-a', 'dungeon/book-open-b', 'rpgtools/journal-open',
  'rpg-quaternius/book-1-open', 'rpg-quaternius/book-2-open',
  'rpg-quaternius/book-3-open', 'rpg-quaternius/book-4-open',
]);

const breadcrumb = (id) => [...kindAncestors(id).reverse(), id].map(kindName).join(' › ');

export function buildScaleGroups(models) {
  const perKind = new Map();
  for (const m of models) {
    if (!m.kind || m.kind === 'assy' || m.kind === 'scene' || SKIP.has(m.id)) continue;
    if (!perKind.has(m.kind)) perKind.set(m.kind, []);
    perKind.get(m.kind).push(m);
  }

  const groups = [];
  for (const [kind, items] of perKind) {
    if (items.length < 2) continue;
    groups.push({
      slug: kind,
      name: breadcrumb(kind),
      category: kindRoot(kind),
      topView: TOP_VIEW.has(kind) || undefined,
      standUp: STAND_UP.has(kind) || undefined,
      wideRow: WIDE_ROW.has(kind) || undefined,
      items: items.map((m) => ({
        slug: m.kit,
        model: m.name,
        wdh: m.wdh.map(round1),
        tags: m.tags?.length ? m.tags : undefined,
        colors: m.colors?.length ? m.colors : undefined,
      })),
    });
  }
  return groups.sort((a, b) =>
    ROOT_ORDER.indexOf(a.category) - ROOT_ORDER.indexOf(b.category) || a.slug.localeCompare(b.slug));
}
