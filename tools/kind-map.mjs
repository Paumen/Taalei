// Migrates catalog/tags.json to the §7 fields: reads the kind tree from Appendix B of the
// style guide, resolves one kind per model (current tags first, then the pinned
// per-model list, then the model name against the glossary nouns, then the old group as
// a branch only), seeds `use`, retires the tags the new fields absorb, and writes a
// report of everything it could not settle on a leaf.
//
//   node tools/kind-map.mjs                 writes catalog/tags.json and docs/kind_migration_report.md
//   node tools/kind-map.mjs --dry           report only
//   node tools/kind-map.mjs --from x.json   read models, old tags and old groups from that catalog.json
//
// Re-runnable: a model already carrying a kind in tags.json keeps it (curation wins);
// pass --reset to resolve everything afresh. A reset needs the catalogue as it was before
// the migration (--from), because the rebuilt one no longer carries the old fields.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const GUIDE = join(ROOT, 'docs/asset_style_guide.md');
const TAGS = join(ROOT, 'catalog/tags.json');
const CATALOG = join(ROOT, 'catalog/catalog.json');
const REPORT = join(ROOT, 'docs/kind_migration_report.md');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const RESET = args.includes('--reset');
const FROM = args.includes('--from') ? args[args.indexOf('--from') + 1] : CATALOG;

import { readKindTree, kindName, kindDepth, kindRoot, kindIs as isOrUnder, kindDescription, KIND_COLORS as COLORS, USES, USE_NAME, USE_TEXT, kindFromName, ROOT_ORDER } from '../catalog/tools/kinds.mjs';

// ─── resolution tables ────────────────────────────────────────────────────────────────

// Current tag → kind. A branch here means the name decides the leaf inside it.
const TAG_KIND = {
  palms: 'env-flora-tree-palm', conifer: 'env-flora-tree-conifer', cacti: 'env-flora-plant-cactus',
  flowers: 'env-flora-plant-flower', grass: 'env-flora-plant-grass', fungi: 'env-fungi',
  fauna: 'env-fauna', skull: 'env-remains-bones', branch: 'env-flora-deadwood', flora: 'env-flora',
  barrel: 'obj-container-barrel', chest: 'obj-container-chest', bag: 'obj-container-bag',
  bottles: 'obj-container-bottle', jugs: 'obj-container-jug', container: 'obj-container',
  pans: 'obj-kitchenware-cookware', tableware: 'obj-kitchenware-tableware',
  tables: 'obj-furniture-table', seating: 'obj-furniture-seating', furniture: 'obj-furniture',
  meat: 'obj-food-meat', grain: 'obj-food-grain', coconut: 'obj-food',
  key: 'obj-pocketitem-key', coins: 'obj-pocketitem-coin', scroll: 'obj-pocketitem-scroll',
  lamp: 'obj-lighting-lantern', fire: 'obj-lighting',
  boats: 'obj-transport-boat', ships: 'obj-transport-ship',
  weapons: 'obj-weapon', tools: 'obj-tool',
  doors: 'str-building-door', floor: 'str-building-floor', roofs: 'str-building-roof',
  window: 'str-building-window', fences: 'str-barrier', stairs: 'str-access-stairs',
  ladder: 'str-access-ladder', signs: 'str-marker-sign', flags: 'str-marker-flag',
  character: 'char', assembly: 'assy',
};

// Old group → the branch it stood for. Never a leaf: a group never pins a leaf.
const GROUP_BRANCH = {
  rocks: 'env-rock', ground: 'env-terrain', ocean: 'env-fauna', plants: 'env-flora-plant',
  grass: 'env-flora-plant-grass', flowers: 'env-flora-plant-flower', trees: 'env-flora-tree',
  'bare-trees': 'env-flora-deadwood', bones: 'env-remains-bones',
  'building-kit': 'str-building', structures: 'str', connections: 'str-access', fences: 'str-barrier',
  signs: 'str-marker', characters: 'char', assemblies: 'assy',
  transport: 'obj-transport', weapons: 'obj-weapon', tools: 'obj-tool', furniture: 'obj-furniture',
  storage: 'obj-container', 'bottles-jugs': 'obj-container', food: 'obj-food',
  cooking: 'obj-kitchenware', 'plates-bowls': 'obj-kitchenware-tableware', lights: 'obj-lighting',
  'books-scrolls': 'obj-pocketitem', items: 'obj-pocketitem', 'keys-locks': 'obj-pocketitem',
  'coins-jewelry': 'obj-pocketitem', resources: 'obj', timber: 'obj',
  cave: 'str-building', 'cave-terrain': 'env-terrain',
};

// A branch-level tag with no leaf found inside it falls back to this leaf.
const BRANCH_DEFAULT = { 'str-barrier': 'str-barrier-fence' };

// Pinned per model where neither a tag nor the name lands on the right glossary line.
const OVERRIDES = {
  'graveyard-kit/gravestone-roof': 'str-marker-tombstone',
  'graveyard-kit/crypt-small-roof': 'str-building',
  'quaternius-nature/wheat': 'obj-food-grain',
  'rpgtools/knife': 'obj-tool-hand',
  'rpgtools/axe': 'obj-tool-hand',
  'survival-kit/campfire-stand': 'obj-kitchenware-cookware',
  'survival-kit/campfire-fishing-stand': 'obj-kitchenware-cookware',
  'resources/parts-cog': 'obj-resource',
  'resources/parts-pile-large': 'obj-resource',
  'resources/parts-pile-medium': 'obj-resource',
  'resources/parts-pile-small': 'obj-resource',
  'small-props/skin-hang-a': 'obj-resource',
  'taalei-kit/lighthouse': 'str-building',
  'taalei-kit/balloon': 'obj-transport',
  'taalei-kit/balloon-basket-round': 'obj-transport',
  'taalei-kit/balloon-basket-square': 'obj-transport',
  'dungeon/weapon-rack': 'obj',
  'dungeon/spell-book': 'obj-weapon-magic',
  'pirate-kit/cannon': 'obj-weapon',
  'pirate-kit/cannon-mobile': 'obj-weapon',
  'pirate-quaternius/cannon': 'obj-weapon',
  'pirate-kit/cannon-ball': 'obj-weapon-ranged-accessory',
  'pirate-quaternius/cannonball': 'obj-weapon-ranged-accessory',
  'platformer-kit/lock': 'obj',
  'rpg-quaternius/padlock': 'obj',
  'village-kit/bell-a': 'obj',
  'dungeon-quaternius/statue-horse': 'obj',
  'dungeon-quaternius/pedestal-2': 'str-platform',
  'graveyard-kit/pillar-obelisk': 'str-marker-tombstone',
  'fantasy-town-kit/blade': 'str-building',
  'village-kit/windmill-blades': 'str-building',
  'mini-forest/building-structure': 'str-building',
  'survival-kit/tent': 'str-building',
  'survival-kit/tent-canvas': 'str-building',
  'survival-kit/tent-canvas-half': 'str-building',
  'fantasy-props/chain-coil': 'obj-tool-supplies',
  'dungeon/floor-tile-small-decorated': 'assy',
  'dungeon/shelves': 'assy',
  'restaurant/food-dinner': 'assy',
  'village-kit/well-plaza': 'assy',
  'halloween/bench-decorated': 'assy',
  'halloween/tree-dead-large-decorated': 'assy',
  'halloween/plaque-candles': 'assy',
  'halloween/shrine-candles': 'assy',
  'halloween/skull-candle': 'assy',
  'halloween/post-lantern': 'assy',
  'halloween/post-skull': 'assy',
  'halloween/post-lantern-lantern': 'obj-lighting-lantern',
  'halloween/post-skull-skull': 'env-remains-bones',
  'dungeon/shelf-small-candles': 'assy',
  'props/plate-food-a': 'obj-food',
  'dungeon/plate-full': 'obj-food',
  'dungeon/plate-half': 'obj-food',
  'food-quaternius/fish-bone': 'env-remains-bones',
  'food-quaternius/fish': 'obj-food',
  'small-props/dried-fish-1-a': 'obj-food',
  'pirate-kit/tool-paddle': 'obj-transport-accessory',
  'small-props/wheel-a': 'obj-transport-accessory',
  'fantasy-town-kit/wheel': 'obj-transport-accessory',
  'small-props/boat-frame-a': 'obj-transport-boat',
  'natuur/campfire-star': 'obj-lighting',
  'natuur/campfire-teepee': 'obj-lighting',
  'modulair-terrein/hilly-prop-camp-campfire': 'obj-lighting',
  'modulair-terrein/hilly-prop-camp-wood-pile': 'env-flora-deadwood-branch',
  'small-props/fireplace-1-1-a': 'str',
  'village-kit/well-base-cobblestone': 'str',
  'village-kit/well-base-dirt': 'str',
  'village-kit/well-base-grass': 'str',
  'village-kit/well-inside': 'str',
  'modular-cave-kit/template-floor-layer': 'str-building-floor',
  'modular-cave-kit/template-floor-layer-hole': 'str-building-floor',
  'modular-cave-kit/template-floor-layer-raised': 'str-building-floor',
  'pirate-kit/hole': 'str-building-floor',
  'dungeon-quaternius/cobweb': 'env',
  'dungeon-quaternius/cobweb-2': 'env',
  'dungeon/artifact': 'obj-pocketitem',
  'pirate-quaternius/chest-gold': 'assy',
  'dungeon-quaternius/chest-gold': 'assy',
  'dungeon/chest-gold': 'assy',
  'pirate-quaternius/gold-bag': 'obj-container-bag',
  'pirate-kit/patch-sand-foliage': 'env-terrain-ground',
  'pirate-kit/patch-grass-foliage': 'env-terrain-ground',
  'mini-forest/patch-grass': 'env-terrain-ground',
  'mini-forest/patch-dirt': 'env-terrain-ground',
  'pirate-kit/patch-sand': 'env-terrain-ground',
  'pirate-kit/patch-grass': 'env-terrain-ground',
  'dungeon/wall-cracked': 'str-building-wall',
  'small-props/cut-wood-1-a': 'env-flora-deadwood-branch',
  'survival-kit/resource-planks': 'obj',
  'pirate-kit/platform-planks': 'obj',
  'resources/pallet-wood': 'obj',
  'skeletons/spellbook': 'obj-weapon-magic',
  'adventurers/spellbook-closed': 'obj-weapon-magic',
  'adventurers/spellbook-open': 'obj-weapon-magic',
};

// Use, from the tags that were really uses and from the kind (U3: stored, not implied).
const USE_OF_TAG = { container: 'container', weapons: 'weapon', tools: 'tool', lamp: 'light', fire: 'light' };
const USE_OF_KIND = [
  ['obj-container', 'container'], ['obj-weapon', 'weapon'], ['obj-tool', 'tool'], ['obj-food', 'food'],
  ['obj-lighting', 'light'], ['obj-transport', 'transport'], ['obj-equipment-armor', 'wearable'],
  ['obj-equipment-shield', 'wearable'], ['obj-equipment-clothing', 'wearable'],
];
// Tags the new fields absorb: kinds, uses and the derived roots.
const RETIRED = new Set([
  ...Object.keys(TAG_KIND), ...Object.keys(USE_OF_TAG), 'resources', 'nature', 'structure', 'object',
]);

// ─── resolve ──────────────────────────────────────────────────────────────────────────

function fromTags(model, tree) {
  const found = new Set();
  for (const tag of model.tags ?? []) if (TAG_KIND[tag]) found.add(TAG_KIND[tag]);
  // keep the deepest of every chain
  const deepest = [...found].filter((a) => ![...found].some((b) => b !== a && isOrUnder(b, a)));
  if (deepest.length <= 1) return { kind: deepest[0] ?? null, collision: null };
  // two chains: the old group says which the model was filed under
  const branch = GROUP_BRANCH[model.gr];
  const agreeing = branch ? deepest.filter((k) => isOrUnder(k, branch) || isOrUnder(branch, k)) : [];
  if (agreeing.length === 1) return { kind: agreeing[0], collision: null };
  return { kind: null, collision: deepest };
}

const fromName = (model, within = null) => kindFromName(model.name, model.wdh, within);

function resolveKind(model, tree) {
  const id = `${model.kit}/${model.name}`;
  const tagged = fromTags(model, tree);
  if (tagged.collision) {
    const pinned = OVERRIDES[id];
    if (pinned) return { kind: pinned, by: 'override', note: `tags disagree: ${tagged.collision.join(' / ')}` };
    // the name settles a disagreement when it names exactly one of the candidates
    const named = fromName(model);
    const hit = tagged.collision.filter((k) => named && (isOrUnder(named, k) || isOrUnder(k, named)));
    if (hit.length === 1) return { kind: isOrUnder(named, hit[0]) ? named : hit[0], by: 'tag+name', note: `tags disagree: ${tagged.collision.join(' / ')}` };
    return { kind: null, by: 'collision', note: tagged.collision.join(' / ') };
  }
  if (tagged.kind) {
    const pinned = OVERRIDES[id];
    if (pinned && !isOrUnder(pinned, tagged.kind) && !isOrUnder(tagged.kind, pinned)) {
      return { kind: pinned, by: 'override', note: `tag said ${tagged.kind}` };
    }
    if (pinned) return { kind: pinned, by: 'override' };
    const leaf = fromName(model, tagged.kind);
    if (leaf) return { kind: leaf, by: 'tag+name' };
    // an umbrella tag (flora on a mushroom, fire on a birthday cake) yields to a glossary
    // noun that lands on a leaf elsewhere; a leaf tag never does
    const isLeaf = ![...tree.keys()].some((k) => k.startsWith(`${tagged.kind}-`));
    if (!isLeaf) {
      const elsewhere = fromName(model);
      if (elsewhere && kindDepth(elsewhere) >= 2) return { kind: elsewhere, by: 'name', note: `tag said ${tagged.kind}` };
      if (BRANCH_DEFAULT[tagged.kind]) return { kind: BRANCH_DEFAULT[tagged.kind], by: 'tag' };
    }
    return { kind: tagged.kind, by: 'tag' };
  }
  if (OVERRIDES[id]) return { kind: OVERRIDES[id], by: 'override' };
  const branch = GROUP_BRANCH[model.gr] ?? null;
  const named = fromName(model, branch) ?? fromName(model);
  if (named) return { kind: named, by: 'name' };
  if (branch) return { kind: branch, by: 'group' };
  return { kind: null, by: 'none' };
}

function resolveUse(model, kind) {
  const use = new Set();
  for (const tag of model.tags ?? []) if (USE_OF_TAG[tag]) use.add(USE_OF_TAG[tag]);
  if (kind) for (const [prefix, u] of USE_OF_KIND) if (isOrUnder(kind, prefix)) use.add(u);
  if ((model.tags ?? []).includes('food')) use.add('food');
  if (kind === 'assy' || kind === 'scene' || kind === 'char') use.delete('container');
  return [...use].sort();
}

// ─── run ──────────────────────────────────────────────────────────────────────────────

const tree = readKindTree();
const catalog = JSON.parse(readFileSync(FROM, 'utf8'));
if (RESET && !catalog.models.some((m) => m.gr)) throw new Error('--reset needs the pre-migration catalogue: pass --from');
const source = JSON.parse(readFileSync(TAGS, 'utf8'));
const tags = source.tags;

const kept = new Map();
if (!RESET) {
  for (const t of tags) if (t.type === 'kind') for (const id of t.models ?? []) kept.set(id, t.id);
}

const perKind = new Map([...tree.keys()].map((k) => [k, []]));
const perUse = new Map(USES.map((u) => [u, []]));
const report = { collision: [], none: [], group: [], parent: [] };

for (const model of catalog.models) {
  const id = `${model.kit}/${model.name}`;
  let kind, by, note;
  if (kept.has(id)) ({ kind, by } = { kind: kept.get(id), by: 'kept' });
  else ({ kind, by, note } = resolveKind(model, tree));
  if (kind && !tree.has(kind)) throw new Error(`${id}: ${kind} is not in Appendix B`);
  if (kind) perKind.get(kind).push(id);
  for (const u of resolveUse(model, kind)) perUse.get(u).push(id);

  const line = `${id} — ${kind ?? '—'}${note ? ` (${note})` : ''}`;
  if (by === 'collision') report.collision.push(line);
  else if (by === 'none') report.none.push(`${id} (group ${model.gr})`);
  else if (by === 'group') report.group.push(line);
  else if (kind && kindDepth(kind) === 1 && !['assy', 'scene', 'char'].includes(kind)) report.parent.push(line);
}

// vocabulary: kinds in tree order after the roots, uses, then whatever tags.json keeps
const kindEntries = [...tree].map(([id, nouns]) => ({
  id, name: kindName(id), type: 'kind',
  description: kindDescription(id, nouns),
  ...(COLORS[id] ? { color: COLORS[id] } : {}),
  models: perKind.get(id).sort(),
}));
kindEntries.sort((a, b) => ROOT_ORDER.indexOf(kindRoot(a.id)) - ROOT_ORDER.indexOf(kindRoot(b.id)) || a.id.localeCompare(b.id));

// use values share the id space with materials (food is both), so the entry is use:<value>
const useEntries = USES.map((u) => ({
  id: `use:${u}`, name: USE_NAME[u], type: 'use', description: USE_TEXT[u], models: perUse.get(u).sort(),
}));

const remaining = tags
  .filter((t) => t.type !== 'kind' && t.type !== 'use' && !RETIRED.has(t.id))
  .map((t) => (t.id === 'stacks'
    ? { ...t, id: 'plural', name: 'Plural', description: 'Several instances of one thing in one model: a stack of bars, a pile of coins, a bundle of arrows (F4).' }
    : t));

const materials = remaining.filter((t) => t.type === 'material');
const open = remaining.filter((t) => t.type !== 'material');

const output = {
  note: 'Manual tags per model, in the five fields of §7. type is material (what it is made of, closed, 33, parented — a model carries the subtype it is, never the parent on top), kind (what it is — Appendix B, exactly one per model; the id is the path, so the parent is the id minus its last segment), use (what it is for — the eight of U1, zero or more, stored and never implied by kind), or tag (anything else worth finding: theme, flags, artist). size is measured at build and never listed here. Descriptions state the membership rule, not the members: the models list is the membership. Set with catalog/swipe.html or the model panel in index.html; build-catalog.mjs attaches them to catalog.json. po: true marks a tag only the PO assigns.',
  tags: [...materials, ...kindEntries, ...useEntries, ...open],
};

const total = catalog.models.length;
const withKind = [...perKind.values()].reduce((n, l) => n + l.length, 0);
const lines = [
  '# Kind migration report',
  '',
  `Generated by \`node tools/kind-map.mjs\`. ${withKind} of ${total} models carry a kind; ${total - withKind} do not.`,
  'Fix the open ones in the model panel of index.html (filter Kind → No kind) and merge the downloaded JSON into catalog/tags.json.',
  '',
  `## Tags disagree — no kind set (${report.collision.length})`, '', ...report.collision.map((l) => `- ${l}`), '',
  `## Nothing matched — no kind set (${report.none.length})`, '', ...report.none.map((l) => `- ${l}`), '',
  `## Old group only — set to its branch, leaf open (${report.group.length})`, '', ...report.group.map((l) => `- ${l}`), '',
  `## Landed on a root — Appendix B has no leaf for these (${report.parent.length})`, '', ...report.parent.map((l) => `- ${l}`), '',
];

console.log(`${withKind}/${total} models with a kind · collisions ${report.collision.length} · none ${report.none.length} · group-only ${report.group.length} · root-only ${report.parent.length}`);
for (const e of kindEntries) if (e.models.length) console.log(`  ${String(e.models.length).padStart(4)}  ${e.id}`);
for (const e of useEntries) console.log(`  use ${e.id}: ${e.models.length}`);

if (!DRY) {
  writeFileSync(TAGS, JSON.stringify(output, null, 1) + '\n');
  writeFileSync(REPORT, lines.join('\n'));
  console.log(`→ catalog/tags.json, docs/kind_migration_report.md`);
} else {
  console.log(lines.join('\n'));
}
