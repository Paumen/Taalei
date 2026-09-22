import { kindName, kindAncestors, kindIs } from './kinds.mjs';
import { buildLimits } from '../../lint/rules.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const round1 = (v) => (v < 0.1 ? Math.max(Math.round(v * 100) / 100, 0.01) : Math.round(v * 20) / 20);

const KIND_LIMITS = JSON.parse(readFileSync(
  join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'lint', 'kinds.json'), 'utf8'));

const LIMITS = buildLimits(KIND_LIMITS);

const NODE = new Map();
const readNodes = (node) => {
  NODE.set(node.id, node);
  for (const child of node.children ?? []) readNodes(child);
};
KIND_LIMITS.kinds.forEach(readNodes);

const ownLongest = (kind) => {
  const node = NODE.get(kind) ?? {};
  const own = node['longest.min'] !== undefined || node['longest.max'] !== undefined;
  const resolved = LIMITS.get(kind) ?? {};
  const fromKind = (field) => resolved[field] !== undefined && resolved[field].from !== 'defaults';
  return own && !fromKind('high.min') && !fromKind('high.max');
};

const limitsOf = (kind) => {
  const found = Object.entries(LIMITS.get(kind) ?? {}).map(([field, { value }]) => [field, value]);
  return found.length ? Object.fromEntries(found) : undefined;
};

export const SCALE_TABS = [
  {
    id: 'obj-gen', name: 'Obj gen', file: 'scale-obj-gen.html',
    branches: ['obj', 'obj-kitchenware', 'obj-furnishing', 'obj-food',
      'obj-lighting', 'obj-resource'],
  },
  { id: 'obj-container', name: 'Obj container', file: 'scale-obj-container.html', branches: ['obj-container'] },
  { id: 'obj-transport', name: 'Obj transport', file: 'scale-obj-transport.html', branches: ['obj-transport'] },
  {
    id: 'obj-equip', name: 'Obj equip', file: 'scale-obj-equip.html',
    branches: ['obj-equipment', 'obj-tool', 'char'],
  },
  { id: 'str-gen', name: 'Str gen', file: 'scale-str-gen.html', branches: ['str'] },
  { id: 'str-part', name: 'Str part', file: 'scale-str-part.html', branches: ['str-part'] },
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

const TOP_VIEW = new Set(['obj-kitchenware-tableware-plate',
  'str-part-floor', 'obj-furnishing', 'env-remains', 'env-terrain-ground']);

export const byLongest = (kind) => ownLongest(kind) && !TOP_VIEW.has(kind);

const SHORT_RULER = new Set(['env-rock-pebble', 'env-remains-deadwood-branch',
  'env-flora-plant-flower', 'env-flora-plant-grass', 'env-fungi', 'obj-container-bottle',
  'obj-container-chest', 'obj-container-bucket', 'obj-food',
  'obj-resource', 'obj-equipment-weapon-melee-dagger', 'obj-equipment-weapon-ranged-arrow']);

const SHORT_RULER_BRANCHES = ['obj-equipment-pocketitem', 'obj-kitchenware'];

const SHORT_RULER_HEIGHT = 0.6;

const rulerHeight = (kind) =>
  SHORT_RULER.has(kind) || SHORT_RULER_BRANCHES.some((b) => kindIs(kind, b))
    ? SHORT_RULER_HEIGHT
    : undefined;

const WIDE_ROW = new Set(['obj-transport-watercraft-ship', 'obj-transport-watercraft-boat', 'str-part', 'env-terrain-mountain']);

const SKIP = new Set([
  'ken-pirate/ship-pirate-small', 'ken-pirate/ship-pirate-medium', 'ken-pirate/ship-pirate-large',
  'ken-pirate/ship-ghost', 'ken-pirate/ship-wreck',
  'kay-dun-1/book-open-a', 'kay-dun-1/book-open-b', 'kay-tools/journal-open',
  'quat-rpg/book-1-open', 'quat-rpg/book-2-open',
  'quat-rpg/book-3-open', 'quat-rpg/book-4-open',
]);

const SKIP_RULE = (m) => m.kind === 'obj-container-bottle' && /(^|-)empty$/.test(m.name);

const breadcrumb = (id) => [...kindAncestors(id).reverse(), id].map(kindName).join(' › ');

export function buildScaleGroups(models) {
  const perKind = new Map();
  for (const m of models) {
    if (!m.kind || m.kind === 'set' || SKIP.has(m.id)) continue;
    if (SKIP_RULE(m)) continue;
    if (m.tags?.includes('plural') || m.tags?.includes('pickup') || m.tags?.includes('broken')) continue;
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
      byLongest: byLongest(kind) || undefined,
      wideRow: WIDE_ROW.has(kind) || undefined,
      rulerHeight: rulerHeight(kind),
      limits: limitsOf(kind),
      items: items.map((m) => ({
        slug: m.kit,
        model: m.name,
        wdh: m.wdh.map(round1),
        tags: m.tags?.length ? m.tags : undefined,
        colors: m.colors?.length ? m.colors : undefined,
      })),
    });
  }
  const rank = (id) => SCALE_TABS.findIndex((t) => t.id === id);
  return groups.sort((a, b) =>
    rank(a.category) - rank(b.category)
    || a.items.length - b.items.length
    || a.slug.localeCompare(b.slug));
}
