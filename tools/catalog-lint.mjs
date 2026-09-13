// Checks catalog/catalog.json against the rules of docs/asset_style_guide.md. Rule text,
// ids and the band table come from the guide (catalog/tools/rules.mjs); this file holds
// only the checks. A check's id is its guide id, or the guide id plus a `-suffix` when
// one rule takes several checks (M42-planks). `coverage` records how far the check
// proves the rule: 'full', or 'partial' when it reads a proxy tag, a name or one clause.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPng } from '../catalog/tools/png.mjs';
import { readGuide, referencedIds } from '../catalog/tools/rules.mjs';
import { readKindTree } from '../catalog/tools/kinds.mjs';

const COLUMNS = 16;
const ROWS = 4;
const ROOT = new URL('..', import.meta.url).pathname;

const GUIDE = readGuide();
const RULE_TEXT = GUIDE.rules;
const BAND_TABLE = GUIDE.bands;
const BANDS = Object.fromEntries([...BAND_TABLE.values()].map((b) => [b.name, b.lane]));
const BAND_NAMES = Object.keys(BANDS);

const CLEAR = '#ffffff';

const ATLAS = readPng(join(ROOT, 'kits/colormap.png'));

function readBands() {
  const atlas = ATLAS;
  const cellWidth = atlas.width / COLUMNS;
  const cellHeight = atlas.height / ROWS;
  const hexes = {};
  for (const [name, lane] of Object.entries(BANDS)) {
    const [column, row] = lane.split(',').map(Number);
    const x = Math.floor(column * cellWidth + cellWidth / 2);
    const y = Math.floor(row * cellHeight + cellHeight / 2);
    const i4 = (y * atlas.width + x) * 4;
    hexes[name] = '#' + [atlas.pixels[i4], atlas.pixels[i4 + 1], atlas.pixels[i4 + 2]]
      .map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  return hexes;
}

const HEX = readBands();
const bandName = Object.fromEntries(Object.entries(HEX).map(([name, hex]) => [hex, name]));
bandName[CLEAR] = 'clear glass';
const band = (name) => {
  if (!(name in HEX)) throw new Error(`band "${name}" is not in the Appendix A band table`);
  return HEX[name];
};
const lane = (name) => BANDS[name];

const MAX_ACCENT_SIZE = 0.5;
const BUSY = 4;
const looksLikeAccent = (m) =>
  (Math.max(...m.wdh) <= MAX_ACCENT_SIZE && m.colors.length >= 2) || m.colors.length >= BUSY;

// Kind and use are fields of §7; the predicates below key on them, never on a name,
// except where no kind exists for what the rule names (isSkeleton).
const kindIs = (m, ...prefixes) => prefixes.some((p) => m.kind === p || m.kind?.startsWith(`${p}-`));
const usedFor = (m, ...uses) => uses.some((u) => m.use?.includes(u));

// Kinds that need no material tag: what grows or swims is coloured by M1-M5 and M32,
// not by what it is made of (N1).
const STANDS_IN_FOR_MATERIAL = ['env-flora', 'env-fungi', 'env-fauna', 'env-terrain'];

// Parents and subtypes both count: a model carries the subtype it is, and the parent
// only where no subtype fits, so `metal` + `metal-gold` is two materials, not one.
export const MATERIAL_TAGS = ['wood', 'wood-planks', 'wood-worked', 'wood-beam', 'wood-log', 'wood-bark',
  'metal', 'metal-iron', 'metal-iron-steel', 'metal-iron-wrought', 'metal-iron-cast',
  'metal-gold', 'metal-silver', 'metal-copper',
  'stone', 'stone-masonry', 'stone-rock', 'stone-soil',
  'paper', 'textile', 'leather', 'ceramic', 'bone', 'food', 'wax', 'wick', 'glass', 'rope', 'cork',
  'gemstone', 'foliage', 'liquid', 'emissive', 'special', 'vegetation', 'skin'];

const WOOD_TAGS = MATERIAL_TAGS.filter((t) => t === 'wood' || t.startsWith('wood-'));

const has = (m, ...tags) => tags.some((t) => m.tags?.includes(t));
const uses = (m, ...hexes) => hexes.some((h) => m.colors?.includes(h));
const materials = (m) => MATERIAL_TAGS.filter((t) => m.tags?.includes(t));

const counting = (m) => materials(m).filter((t) => t !== 'special');

const isRoof = (m) => m.kind === 'str-part-roof';

// M5: flowers may be any colour, cactus flowers too — a cactus with non-green matter is one in bloom
const isFlower = (m) => m.kind === 'env-flora-plant-flower' || (m.kind === 'env-flora-plant-cactus' && has(m, 'vegetation'));
const isFauna = (m) => m.kind === 'env-fauna';
const isFood = (m) => has(m, 'food') || kindIs(m, 'obj-food');
// M45 gives food the freedom M32 gives fauna: what it is made of says nothing about its band.
const anyColour = (m) => isFlower(m) || isFauna(m) || isFood(m);
const isDecoratedFood = (m) => isFood(m) && has(m, 'decorated');

// no kind separates a skeleton from other char models (Appendix B), so the name decides
const isSkeleton = (m) => /skeleton/.test(m.name);
const isCopper = (m) => has(m, 'metal-copper');
const isKey = (m) => m.kind === 'obj-pocketitem-key';

const CONTAINER_KINDS = ['obj-container-barrel', 'obj-container-chest', 'obj-container-bucket', 'obj-container-crate'];
const isContainer = (m) => kindIs(m, ...CONTAINER_KINDS);
const isLog = (m) => has(m, 'wood-log') || kindIs(m, 'env-flora-deadwood');
const isBottle = (m) => m.kind === 'obj-container-bottle';
const isBook = (m) => kindIs(m, 'obj-pocketitem-book', 'obj-weapon-magic') && has(m, 'paper');

// a rigged vessel or its rigging: ship, boat, mast or sail (Appendix B) carrying textile
const RIGGED_KINDS = ['obj-transport-ship', 'obj-transport-boat', 'obj-transport-accessory'];
const isRigged = (m) => kindIs(m, ...RIGGED_KINDS) && has(m, 'textile');

const describe = (m) => materials(m).length ? materials(m).join(', ') : 'no material';
const bandsOf = (m) => m.colors.map((h) => bandName[h] ?? h).join(', ');

// Each factory records what the check touches (`subjects`) and what it proves (`tests`),
// for --explain and --index.
const bandOnlyFor = ({ id, coverage, severity, color, tags, kinds = [], accent = false, unless = null, also = [] }) => ({
  id, coverage, severity, band: band(color),
  subjects: { bands: [color], tags, kinds },
  tests: `models using ${color} ${lane(color)} carry one of ${[...tags.map((t) => `\`${t}\``), ...kinds.map((k) => `kind ${k}`), ...also].join(', ') || 'nothing'}${accent ? ', or the band is a minor accent' : ''}`,
  check: (m) => {
    if (!uses(m, band(color))) return null;
    if (anyColour(m)) return null;
    if (has(m, ...tags)) return null;
    if (kindIs(m, ...kinds)) return null;
    if (unless?.(m)) return null;
    if (accent && looksLikeAccent(m)) return null;
    return `uses ${color} ${lane(color)} but carries ${describe(m)}`;
  },
});

const materialTakes = ({ id, coverage, severity, tag, colors, when = null, unless = null, kinds = [], subject = null }) => ({
  id, coverage, severity,
  subjects: { bands: colors.filter((c) => c !== 'clear glass'), tags: MATERIAL_TAGS.includes(tag) ? [tag] : [], kinds },
  tests: `${subject ?? `models tagged \`${tag}\``} use at least one of ${colors.join(', ')}`,
  check: (m) => {
    if (when ? !when(m) : !has(m, tag)) return null;
    if (unless?.(m)) return null;
    const allowed = colors.map((c) => (c === 'clear glass' ? CLEAR : band(c)));
    if (uses(m, ...allowed)) return null;
    return `is ${tag ?? id} but uses ${bandsOf(m)} — none of ${colors.join(', ')}`;
  },
});

// M62-M68 key the iron subtype to the kind. M67 lets a model carry a second subtype on
// top, so what is checked is that the kind's own subtype is present -- never that the
// others are absent. A model with no iron at all is none of these rules' business.
const IRON = ['steel', 'wrought', 'cast'];
const ironOf = (m) => IRON.filter((s) => has(m, `metal-iron-${s}`));
const ironIs = ({ id, coverage, severity, want, kinds, unless = null }) => ({
  id, coverage, severity,
  subjects: { bands: want.map((w) => IRON_BAND[w]), tags: want.map((w) => `metal-iron-${w}`), kinds },
  tests: `models of kind ${kinds.join(', ')} carrying iron carry ${want.map((w) => `\`metal-iron-${w}\``).join(' or ')}`,
  check: (m) => {
    if (!kindIs(m, ...kinds)) return null;
    if (unless?.(m)) return null;
    const got = ironOf(m);
    if (!got.length) return null;
    if (want.some((w) => got.includes(w))) return null;
    return `${m.kind} carries metal-iron-${got.join(', metal-iron-')} but takes ${want.map((w) => `metal-iron-${w}`).join(' or ')}`;
  },
});

const IRON_BAND = { steel: 'light grey', wrought: 'dark grey', cast: 'blue-grey' };

// M65's pairing clause is the one rule that cannot be answered from a single model: the
// counterpart is another row. The index is built on first use, after `models` exists.
let cookwareIrons = null;
const variantIrons = (m) => {
  if (!cookwareIrons) {
    cookwareIrons = new Map();
    for (const other of models) {
      if (!other.variant || !kindIs(other, 'obj-kitchenware-cookware')) continue;
      const seen = cookwareIrons.get(other.variant) ?? new Set();
      for (const subtype of ironOf(other)) seen.add(subtype);
      cookwareIrons.set(other.variant, seen);
    }
  }
  return (m.variant && cookwareIrons.get(m.variant)) || new Set();
};

// M66 is the fallback, so it owns every kind the rules above do not name.
const CLAIMED = ['obj-weapon', 'obj-equipment', 'obj-kitchenware-tableware', 'obj-tool',
  'str', 'obj-kitchenware-cookware', 'char'];
// M63's kind sits inside CLAIMED but wants wrought, which is what M66 says anyway
const CLAIMED_BUT_WROUGHT = ['obj-tool-supplies'];

const jokerBand = new Map();

const TAGS = JSON.parse(readFileSync(join(ROOT, 'catalog/tags.json'), 'utf8')).tags;
const SPECIAL_REASONS = TAGS.find((t) => t.id === 'special')?.reasons ?? {};

// S1: the joker covers one band across every rule that band trips, and S5 says the
// reason on the tag names it. Fall back to the first joker-eligible finding's band
// for a reason that names none, which keeps the old behaviour for those.
const reasonBand = (model) => {
  const reason = SPECIAL_REASONS[model] ?? '';
  for (const [name, id] of Object.entries(BANDS)) if (reason.startsWith(`${name} ${id}`)) return band(name);
  if (reason.startsWith('clear glass')) return CLEAR;
  return null;
};

const POSITION_STEP = 0.01; // UV positions are quantised to the atlas pixel row (1/128) and stored at 3 decimals

const halfOf = ({ id, coverage, severity, color, low, high, when, subject, tags = [] }) => ({
  id, coverage, severity,
  subjects: { bands: [color], tags, kinds: [] },
  tests: `${subject} keep ${color} ${lane(color)} within ${low.toFixed(2)}-${high.toFixed(2)} of the band`,
  check: (m) => {
    if (!when(m)) return null;
    const range = m.spread?.[lane(color)];
    if (!range) return null;
    const [min, max] = range;
    if (min >= low - POSITION_STEP && max <= high + POSITION_STEP) return null;
    return `${color} ${lane(color)} spans ${min.toFixed(2)}-${max.toFixed(2)}, outside ${low.toFixed(2)}-${high.toFixed(2)}`;
  },
});

// A rule with no check of its own, whose severity and pass/fail follow another's.
const follows = (id, other, coverage = 'full') => ({ id, coverage, follows: other, tests: `judged by ${other}` });

const CHECKS = [

  { id: 'G1', coverage: 'partial', severity: 'warning', noJoker: true,
    subjects: { bands: [], tags: ['animation', 'glass'], kinds: [] },
    tests: 'models drawing in more than one call carry `animation` or `glass`',
    check: (m) => {
      if (!(m.calls > 1) || has(m, 'animation', 'glass')) return null;
      return `${m.calls} draw calls with no animation or glass tag`;
    } },

  follows('S1', 'M1', 'partial'),
  follows('S2', 'M1', 'partial'),
  follows('S3', 'M1', 'partial'),
  { id: 'S4', coverage: 'full', severity: 'error', noJoker: true,
    subjects: { bands: [], tags: ['special'], kinds: [] },
    tests: 'models tagged `special` have a band and reason recorded in catalog/tags.json',
    check: (m) => {
      if (!has(m, 'special')) return null;
      const reason = SPECIAL_REASONS[`${m.kit}/${m.name}`];
      return reason?.trim() ? null : 'carries special but catalog/tags.json records no band and reason for it';
    } },
  follows('S5', 'M1', 'partial'),

  materialTakes({ id: 'M1', coverage: 'full', severity: 'error',
    tag: 'tree', colors: ['dark green'], kinds: ['env-flora-tree'], subject: 'env-flora-tree models other than palms',
    when: (m) => kindIs(m, 'env-flora-tree') && m.kind !== 'env-flora-tree-palm' }),
  materialTakes({ id: 'M2', coverage: 'full', severity: 'error',
    tag: 'palm', colors: ['light green'], kinds: ['env-flora-tree-palm'], subject: 'env-flora-tree-palm models',
    when: (m) => m.kind === 'env-flora-tree-palm' }),
  materialTakes({ id: 'M3', coverage: 'full', severity: 'error',
    tag: 'grass', colors: ['light green'], kinds: ['env-flora-plant-grass'], subject: 'env-flora-plant-grass models',
    when: (m) => m.kind === 'env-flora-plant-grass' }),
  materialTakes({ id: 'M4', coverage: 'partial', severity: 'error',
    tag: 'foliage', colors: ['light green'], subject: 'models tagged `foliage` that are neither tree nor grass',
    when: (m) => has(m, 'foliage') && !kindIs(m, 'env-flora-tree') && m.kind !== 'env-flora-plant-grass' }),
  materialTakes({ id: 'M6', coverage: 'full', severity: 'error',
    tag: 'wood', colors: ['light brown', 'mid brown', 'dark brown'],
    subject: 'models tagged `wood`, `wood-planks`, `wood-worked` or `wood-beam`',
    when: (m) => has(m, 'wood', 'wood-planks', 'wood-worked', 'wood-beam') }),
  materialTakes({ id: 'M6-bark', coverage: 'full', severity: 'error', tag: 'wood-bark', colors: ['bark'] }),
  materialTakes({ id: 'M8', coverage: 'partial', severity: 'error',
    tag: 'stone-masonry', colors: ['taupe', 'blue-grey', 'light grey'] }),
  materialTakes({ id: 'M9', coverage: 'full', severity: 'error', tag: 'stone-rock', colors: ['light grey', 'taupe'] }),
  materialTakes({ id: 'M10', coverage: 'full', severity: 'error', tag: 'stone-soil', colors: ['taupe'] }),

  materialTakes({ id: 'M11', coverage: 'partial', severity: 'error',
    tag: 'metal-iron-steel', colors: ['light grey'],
    unless: (m) => isCopper(m) || isKey(m) }),
  materialTakes({ id: 'M12-wrought', coverage: 'partial', severity: 'error',
    tag: 'metal-iron-wrought', colors: ['dark grey'],
    unless: (m) => isCopper(m) || isKey(m) }),
  materialTakes({ id: 'M12-cast', coverage: 'partial', severity: 'error',
    tag: 'metal-iron-cast', colors: ['blue-grey'],
    unless: (m) => isCopper(m) || isKey(m) }),
  materialTakes({ id: 'M13', coverage: 'full', severity: 'error',
    tag: 'metal-gold', colors: ['yellow'], unless: isKey }),
  materialTakes({ id: 'M13-silver', coverage: 'full', severity: 'error',
    tag: 'metal-silver', colors: ['light blue-grey'], unless: isKey }),
  materialTakes({ id: 'M14', coverage: 'full', severity: 'error', tag: 'metal-copper', colors: ['terracotta'] }),
  { id: 'M14-only', coverage: 'full', severity: 'error',
    subjects: { bands: [], tags: ['metal-copper'], kinds: [] },
    tests: 'models tagged `metal-copper` carry no other metal tag',
    check: (m) => {
      if (!isCopper(m)) return null;
      const other = ['metal', 'metal-iron', 'metal-iron-steel', 'metal-iron-wrought', 'metal-iron-cast',
        'metal-gold', 'metal-silver'].filter((t) => has(m, t));
      return other.length ? `carries metal-copper alongside ${other.join(', ')}` : null;
    } },
  materialTakes({ id: 'M15', coverage: 'partial', severity: 'error',
    tag: 'key', colors: ['dark grey', 'yellow'], kinds: ['obj-pocketitem-key'], subject: 'obj-pocketitem-key models', when: isKey }),
  materialTakes({ id: 'M17', coverage: 'partial', severity: 'error',
    tag: 'metal-iron-wrought', colors: ['dark grey'], kinds: CONTAINER_KINDS,
    subject: 'container models (barrel, chest, bucket, crate) tagged `metal-iron-wrought`',
    when: (m) => isContainer(m) && has(m, 'metal-iron-wrought') }),
  materialTakes({ id: 'M18', coverage: 'partial', severity: 'error',
    tag: 'textile', colors: ['off-white', 'taupe', 'dark green', 'dark red'],
    unless: (m) => isRigged(m) && uses(m, band('blue-grey')) }),

  { id: '18b', coverage: 'partial', severity: 'error',
    subjects: { bands: ['taupe'], tags: ['textile', 'rope'], kinds: RIGGED_KINDS },
    tests: 'rigged models (ship, boat or rigging with `textile`) carrying no `rope` do not use taupe 14,3',
    // Bands are counted per model, so a ship that carries rope has taupe explained
    // by M22 and is left alone; the rule bites on a rigged model with no rope on it.
    check: (m) => (isRigged(m) && uses(m, band('taupe')) && !has(m, 'rope'))
      ? 'is rigged and uses taupe 14,3, which no flag or sail may take'
      : null },

  halfOf({ id: 'M19', coverage: 'partial', severity: 'warning', color: 'taupe', low: 0.02, high: 0.40,
    tags: ['textile'], subject: 'models used as tool or weapon, tagged `textile` and using taupe,',
    when: (m) => usedFor(m, 'tool', 'weapon') && has(m, 'textile') && uses(m, band('taupe')) }),
  materialTakes({ id: 'M20', coverage: 'full', severity: 'error', tag: 'leather', colors: ['bark'] }),
  materialTakes({ id: 'M22', coverage: 'full', severity: 'error', tag: 'rope', colors: ['taupe'] }),
  materialTakes({ id: 'M23', coverage: 'full', severity: 'error', tag: 'cork', colors: ['taupe'] }),
  materialTakes({ id: 'M24', coverage: 'full', severity: 'error',
    tag: 'glass', colors: ['clear glass', 'dark green', 'dark red'] }),
  materialTakes({ id: 'M25', coverage: 'full', severity: 'error',
    tag: 'ceramic', colors: ['terracotta', 'off-white', 'taupe', 'dark red'] }),
  { id: 'M26', coverage: 'partial', severity: 'error',
    subjects: { bands: [], tags: ['glass', 'ceramic'], kinds: ['obj-container-bottle'] },
    tests: 'obj-container-bottle models carry `glass` or `ceramic`',
    check: (m) => (isBottle(m) && !has(m, 'glass', 'ceramic')) ? `is a bottle but carries ${describe(m)}` : null },
  materialTakes({ id: 'M27', coverage: 'partial', severity: 'error',
    tag: 'glass', colors: ['dark red', 'dark green', 'clear glass'], kinds: ['obj-container-bottle'],
    subject: 'obj-container-bottle models tagged `glass`', when: (m) => isBottle(m) && has(m, 'glass') }),
  materialTakes({ id: 'M28', coverage: 'full', severity: 'error',
    tag: 'liquid', colors: ['dark red', 'dark green', 'blue'] }),
  materialTakes({ id: 'M29', coverage: 'full', severity: 'error',
    tag: 'bone', colors: ['off-white'], kinds: ['env-remains-bones'],
    subject: 'models tagged `bone` or of kind env-remains-bones',
    when: (m) => has(m, 'bone') || m.kind === 'env-remains-bones' }),
  materialTakes({ id: 'M30', coverage: 'full', severity: 'error', tag: 'paper', colors: ['off-white'] }),
  materialTakes({ id: 'M31', coverage: 'full', severity: 'error',
    tag: 'meat', colors: ['dark red'], kinds: ['obj-food-meat'], subject: 'obj-food-meat models',
    when: (m) => m.kind === 'obj-food-meat' }),
  materialTakes({ id: 'M33', coverage: 'full', severity: 'error', tag: 'emissive', colors: ['yellow'] }),
  materialTakes({ id: 'M34', coverage: 'full', severity: 'error', tag: 'wax', colors: ['off-white'] }),
  materialTakes({ id: 'M35', coverage: 'full', severity: 'warning', tag: 'wick', colors: ['dark grey'] }),
  materialTakes({ id: 'M36', coverage: 'full', severity: 'error',
    tag: 'gemstone', colors: ['dark red', 'dark green', 'blue'] }),
  materialTakes({ id: 'M37', coverage: 'partial', severity: 'error',
    tag: 'book', colors: ['bark', 'dark red', 'dark green', 'blue-grey'],
    kinds: ['obj-pocketitem-book', 'obj-weapon-magic'],
    subject: 'obj-pocketitem-book and obj-weapon-magic models tagged `paper`', when: isBook }),
  { id: 'M38', coverage: 'partial', severity: 'error',
    subjects: { bands: ['dark red'], tags: ['ceramic'], kinds: ['str-part-roof'] },
    tests: 'str-part-roof models carry `ceramic` and use dark red 8,0',
    check: (m) => {
      if (!isRoof(m)) return null;
      if (!has(m, 'ceramic')) return `is a roof but carries ${describe(m)}`;
      if (!uses(m, band('dark red'))) return `is a roof but uses ${bandsOf(m)} — no dark red`;
      return null;
    } },
  { id: 'M39', coverage: 'partial', severity: 'error',
    subjects: { bands: [], tags: WOOD_TAGS, kinds: CONTAINER_KINDS },
    tests: 'container models (barrel, chest, bucket, crate) carry a wood tag',
    check: (m) => (isContainer(m) && !has(m, ...WOOD_TAGS)) ? `is a container but carries ${describe(m)}` : null },
  materialTakes({ id: 'M43', coverage: 'full', severity: 'error',
    tag: 'skin', colors: ['light brown', 'taupe', 'bark'] }),

  materialTakes({ id: 'M44', coverage: 'partial', severity: 'error',
    tag: 'vegetation', colors: ['taupe', 'light brown', 'off-white', 'terracotta', 'dark red', 'yellow', 'blue', 'blue-grey', 'light blue-grey', 'mid brown'] }),

  materialTakes({ id: 'M42-planks', coverage: 'full', severity: 'error', tag: 'wood-planks', colors: ['light brown'] }),
  materialTakes({ id: 'M42-worked', coverage: 'full', severity: 'error', tag: 'wood-worked', colors: ['mid brown'] }),
  materialTakes({ id: 'M42-beam', coverage: 'full', severity: 'error', tag: 'wood-beam', colors: ['dark brown'] }),

  ironIs({ id: 'M62', coverage: 'partial', severity: 'warning', want: ['steel'],
    kinds: ['obj-weapon', 'obj-equipment', 'obj-kitchenware-tableware', 'obj-tool'],
    // the wrought carve-out of M63 and the cast cannon of M64 sit inside these kinds
    unless: (m) => kindIs(m, 'obj-tool-supplies', 'obj-weapon-cannon') }),
  ironIs({ id: 'M63', coverage: 'partial', severity: 'warning', want: ['wrought'], kinds: ['obj-tool-supplies'] }),
  ironIs({ id: 'M64', coverage: 'partial', severity: 'warning', want: ['cast'], kinds: ['obj-weapon-cannon', 'str'] }),
  ironIs({ id: 'M65', coverage: 'partial', severity: 'warning', want: ['cast', 'steel'], kinds: ['obj-kitchenware-cookware'] }),
  ironIs({ id: 'M66', coverage: 'partial', severity: 'warning', want: ['wrought'], kinds: ['obj', 'env', 'assy'],
    unless: (m) => kindIs(m, ...CLAIMED) && !kindIs(m, ...CLAIMED_BUT_WROUGHT) }),
  { id: 'M65-pair', coverage: 'partial', severity: 'warning',
    subjects: { bands: [], tags: ['metal-iron-steel', 'metal-iron-cast'], kinds: ['obj-kitchenware-cookware'] },
    tests: 'obj-kitchenware-cookware models with iron sit in a variant group that carries both steel and cast',
    check: (m) => {
      if (!kindIs(m, 'obj-kitchenware-cookware') || !ironOf(m).length) return null;
      const irons = variantIrons(m);
      if (irons.has('steel') && irons.has('cast')) return null;
      if (!m.variant) return 'is metal cookware in no variant group, so it has no recorded counterpart';
      return `variant ${m.variant} carries only ${[...irons].join(', ')} — cookware exists as both`;
    } },
  { id: 'M67', coverage: 'partial', severity: 'warning',
    subjects: { bands: Object.values(IRON_BAND), tags: IRON.map((s) => `metal-iron-${s}`), kinds: [] },
    tests: 'models carrying two or more iron subtypes use a band for each',
    check: (m) => {
      const got = ironOf(m);
      if (got.length < 2) return null;
      const missing = got.filter((subtype) => !(lane(IRON_BAND[subtype]) in (m.spread ?? {})));
      if (!missing.length) return null;
      return `carries ${got.join(' + ')} but ${missing.map((s) => `metal-iron-${s}`).join(', ')} has no band of its own`;
    } },
  ironIs({ id: 'M68', coverage: 'partial', severity: 'warning', want: ['steel'], kinds: ['char'] }),

  bandOnlyFor({ id: 'C1', coverage: 'partial', severity: 'error', color: 'light grey',
    tags: ['metal', 'metal-iron-steel', 'stone', 'stone-masonry', 'stone-rock'], unless: isKey, also: ['keys'] }),
  bandOnlyFor({ id: 'C2', coverage: 'partial', severity: 'error', color: 'blue-grey',
    tags: ['metal', 'metal-iron-cast', 'stone', 'stone-masonry'],
    unless: (m) => isBook(m) || isRigged(m), also: ['books', 'rigged models'] }),
  bandOnlyFor({ id: 'C15', coverage: 'full', severity: 'warning', color: 'dark grey',
    tags: ['metal', 'metal-iron-wrought', 'wick'], unless: isKey, also: ['keys'] }),
  bandOnlyFor({ id: 'C3', coverage: 'full', severity: 'error', color: 'light blue-grey',
    tags: ['metal', 'metal-silver'], unless: isKey, also: ['keys'] }),
  bandOnlyFor({ id: 'C4', coverage: 'partial', severity: 'error', color: 'blue', tags: [], accent: true }),
  bandOnlyFor({ id: 'C5', coverage: 'partial', severity: 'error', color: 'yellow',
    tags: ['metal', 'metal-gold', 'emissive'],
    kinds: ['obj-lighting', 'obj-pocketitem-coin'], unless: isKey, also: ['keys'] }),
  bandOnlyFor({ id: 'C6', coverage: 'partial', severity: 'error', color: 'dark red',
    tags: ['ceramic', 'gemstone', 'glass', 'textile'], kinds: ['env-fungi'],
    accent: true, unless: isRoof, also: ['roofs'] }),
  bandOnlyFor({ id: 'C7', coverage: 'partial', severity: 'error', color: 'dark green',
    tags: ['foliage', 'glass'], accent: true, also: ['textile on char or weapon models'],
    unless: (m) => has(m, 'textile') && (m.kind === 'char' || usedFor(m, 'weapon')) }),
  bandOnlyFor({ id: 'C8', coverage: 'full', severity: 'error', color: 'light green',
    // foliage is the green matter itself, so a weed accent on a floor tile carries it
    tags: ['foliage'], kinds: ['env-flora', 'env-fungi'] }),

  bandOnlyFor({ id: 'C9-light', coverage: 'full', severity: 'error', color: 'light brown',
    tags: [...WOOD_TAGS, 'skin', 'vegetation'], kinds: ['obj-food-grain'] }),
  bandOnlyFor({ id: 'C9-middle', coverage: 'full', severity: 'error', color: 'mid brown',
    tags: WOOD_TAGS, kinds: ['obj-food-grain', 'env-fungi'] }),
  bandOnlyFor({ id: 'C9-dark', coverage: 'full', severity: 'error', color: 'dark brown',
    tags: WOOD_TAGS, kinds: ['obj-food-grain'] }),
  bandOnlyFor({ id: 'C10', coverage: 'full', severity: 'error', color: 'bark',
    tags: ['wood-bark', 'leather', 'skin'], unless: isLog, also: ['logs (`wood-log` or env-flora-deadwood)'] }),

  { id: 'C11', coverage: 'full', severity: 'error',
    subjects: { bands: [], tags: ['glass'], kinds: [] },
    tests: 'models using the clear glass colour carry `glass`',
    check: (m) => (uses(m, CLEAR) && !has(m, 'glass')) ? 'uses the clear glass but carries no glass' : null },

  bandOnlyFor({ id: 'C12', coverage: 'partial', severity: 'warning', color: 'taupe',
    tags: ['stone', 'stone-soil', 'stone-rock', 'stone-masonry', 'textile', 'rope', 'cork', 'skin', 'vegetation'],
    accent: true }),
  bandOnlyFor({ id: 'C13', coverage: 'partial', severity: 'warning', color: 'off-white',
    tags: ['bone', 'paper', 'wax', 'ceramic', 'textile', 'vegetation'], kinds: ['env-remains-bones'], accent: true }),
  bandOnlyFor({ id: 'C14', coverage: 'partial', severity: 'warning', color: 'terracotta',
    tags: ['metal-copper', 'ceramic', 'vegetation'], accent: true }),

  { id: 'N1', coverage: 'full', severity: 'error', noJoker: true,
    subjects: { bands: [], tags: [], kinds: STANDS_IN_FOR_MATERIAL },
    tests: `models carry a material tag, unless of kind ${STANDS_IN_FOR_MATERIAL.join(', ')}`,
    check: (m) => {
      if (materials(m).length) return null;
      if (kindIs(m, ...STANDS_IN_FOR_MATERIAL)) return null;
      return `has no material tag (kind ${m.kind})`;
    } },

  { id: 'N2', coverage: 'full', severity: 'error', noJoker: true,
    subjects: { bands: [], tags: [], kinds: [] },
    tests: 'a model uses at least as many bands as it carries material tags, `special` not counted',
    check: (m) => {
      const mats = counting(m);
      if (!mats.length || m.colors.length >= mats.length) return null;
      return `${m.colors.length} band(s) for ${mats.length} (${mats.join(', ')})`;
    } },

  { id: 'N3', coverage: 'full', severity: 'error', noJoker: true,
    subjects: { bands: [], tags: ['food', 'vegetation', 'decorated'], kinds: ['obj-food', 'env-fauna'] },
    tests: 'bands per material tag stay within 2, or 3 for food, fauna and vegetation, or 5 for decorated food',
    check: (m) => {
      const n = counting(m).length;
      // S5: N3 leaves the joker's band out of its count, and the reason on the tag
      // names that band — a joker that trips no band rule has none in jokerBand.
      const joker = reasonBand(`${m.kit}/${m.name}`) ?? jokerBand.get(m);
      const used = m.colors.filter((hex) => hex !== joker).length;
      const per = isDecoratedFood(m) ? 5 : isFood(m) || isFauna(m) || has(m, 'vegetation') ? 3 : 2;
      if (!n || used <= per * n) return null;
      return `${used} bands for ${n} material(s) (${counting(m).join(', ')}), ceiling ${per * n}`;
    } },

  { id: 'N4', coverage: 'full', severity: 'error',
    subjects: { bands: [], tags: ['decorated'], kinds: ['char', 'obj-food'] },
    tests: 'a model uses at most 5 bands, or 6 for a non-skeleton char, a decorated food, or a size-l model with five material tags (N5)',
    check: (m) => {
      const bands = m.colors.length;
      // N5 lifts the ceiling to 6 for a size-l model carrying five material tags
      const ceiling = (m.kind === 'char' && !isSkeleton(m)) || isDecoratedFood(m)
        || (m.size === 'l' && counting(m).length >= 5) ? 6 : 5;
      if (bands <= ceiling) return null;
      return `${bands} bands, ceiling ${ceiling} (kind ${m.kind})`;
    } },
  follows('N5', 'N4'),
];

// A check's guide rule: the id up to the first `-`, with the guide's own id kept for
// ids that carry no block letter (18b).
export const guideIdOf = (id) => id.split('-')[0];

for (const c of CHECKS) {
  c.guide = guideIdOf(c.id);
  const rule = RULE_TEXT.get(c.guide);
  if (!rule) throw new Error(`check ${c.id} has no rule ${c.guide} in the style guide`);
  c.text = rule.plain;
}
const RULES = CHECKS.filter((c) => c.check);

const BLOCK_ORDER = ['G', 'S', 'M', 'C', 'N', 'D', 'W'];
const rank = (id) => {
  const [, block, number, rest] = id.match(/^([A-Z]?)(\d+)(.*)$/);
  return [block ? BLOCK_ORDER.indexOf(block) : BLOCK_ORDER.indexOf('M'), Number(number), rest];
};
const byRank = (a, b) => {
  const [ba, na, ra] = rank(a.id);
  const [bb, nb, rb] = rank(b.id);
  return ba - bb || na - nb || ra.localeCompare(rb);
};
CHECKS.sort(byRank);
RULES.sort(byRank);

const args = process.argv.slice(2);
let kitFilter = null, ruleFilter = null, severityFilter = null, modelFilter = null, jsonPath = null, explainId = null;
let limit = 5, listRules = false, index = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--kit') kitFilter = args[++i];
  else if (args[i] === '--rule') ruleFilter = args[++i];
  else if (args[i] === '--severity') severityFilter = args[++i];
  else if (args[i] === '--model') modelFilter = args[++i];
  else if (args[i] === '--limit') limit = Number(args[++i]);
  else if (args[i] === '--json') jsonPath = args[++i];
  else if (args[i] === '--rules') listRules = true;
  else if (args[i] === '--explain') explainId = args[++i];
  else if (args[i] === '--index') index = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
  else throw new Error(`unknown argument: ${args[i]}`);
}

// `--rule M42` takes M42 and M42-planks; `--rule M` takes the whole block.
const ruleMatches = (id) => !ruleFilter || id === ruleFilter || id.startsWith(`${ruleFilter}-`)
  || (/^[A-Z]$/.test(ruleFilter) && id.startsWith(ruleFilter));

const status = (id) => {
  const rule = RULE_TEXT.get(id);
  return rule ? `${rule.code} ${rule.light}` : '?? ⚪';
};

if (listRules) {
  for (const r of CHECKS) {
    console.log(`${r.id.padEnd(11)} ${status(r.guide)} ${r.severity?.padEnd(7) ?? 'follows'} ${r.coverage.padEnd(7)} ${r.text}`);
  }
  process.exit(0);
}

if (explainId) {
  const rule = RULE_TEXT.get(guideIdOf(explainId));
  if (!rule) { console.error(`no rule ${explainId} in the style guide`); process.exit(2); }
  console.log(`${rule.id}  ${rule.code} ${rule.light}  ${rule.block || rule.section}  (docs/asset_style_guide.md:${rule.line})`);
  console.log(`  ${rule.plain}`);
  const refs = referencedIds(rule.plain).filter((id) => RULE_TEXT.has(id));
  if (refs.length) console.log(`  refers to: ${refs.join(', ')}`);
  const own = CHECKS.filter((c) => c.guide === rule.id && (c.id === explainId || guideIdOf(explainId) === explainId));
  if (!own.length) console.log('  not automated: nothing measures it');
  for (const c of own) {
    console.log(`  ${c.id}: ${c.follows ? `follows ${c.follows}` : `${c.severity}, ${c.coverage}`} — ${c.tests}`);
  }
  const followers = CHECKS.filter((c) => c.follows === rule.id);
  if (followers.length) console.log(`  judged with it: ${followers.map((c) => c.id).join(', ')}`);
  process.exit(0);
}

const catalog = JSON.parse(readFileSync(join(ROOT, 'catalog/catalog.json'), 'utf8'));

// N4: an assembly answers per part, so the whole is not read here.
const SKIP_KINDS = ['assy'];

const inCatalog = catalog.models
  .filter((m) => m.colors?.length)
  .filter((m) => !SKIP_KINDS.includes(m.kind))
  .filter((m) => !kitFilter || m.kit === kitFilter);

const models = inCatalog;

if (index) {
  const out = buildIndex();
  if (index === true) console.log(out);
  else { writeFileSync(index, out); console.log(`→ ${index}`); }
  process.exit(0);
}

const unknown = new Set();
for (const m of models) for (const hex of m.colors) if (!bandName[hex]) unknown.add(hex);

for (const m of models) {
  if (!m.tags?.includes('special')) continue;
  for (const rule of RULES) {
    if (rule.noJoker) continue;
    if (!rule.check(m)) continue;
    if (rule.band) jokerBand.set(m, rule.band);
    break;
  }
}

const modelMatches = (m) => !modelFilter || `${m.kit}/${m.name}` === modelFilter || m.name === modelFilter;

let findings = [];
for (const rule of RULES) {
  if (!ruleMatches(rule.id)) continue;
  if (severityFilter && rule.severity !== severityFilter) continue;
  for (const m of models) {
    if (!modelMatches(m)) continue;
    const detail = rule.check(m);
    if (detail) findings.push({ rule: rule.id, severity: rule.severity, model: `${m.kit}/${m.name}`, detail, joker: !rule.noJoker && (m.tags?.includes('special') ?? false) });
  }
}

const ruleById = new Map(RULES.map((r) => [r.id, r]));
const jokerLane = new Map();
for (const f of findings) {
  if (!f.joker || jokerLane.has(f.model)) continue;
  jokerLane.set(f.model, reasonBand(f.model) ?? ruleById.get(f.rule)?.band ?? null);
}
const modelByName = new Map(models.map((m) => [`${m.kit}/${m.name}`, m]));
// A reason that names no band (it names only a rule) cannot say which band to cover,
// so it keeps the old behaviour and spends the joker on a single finding.
const spent = new Set();
findings = findings.filter((f) => {
  if (!f.joker) return true;
  const lane = jokerLane.get(f.model);
  if (!lane) {
    if (spent.has(f.model)) return true;
    spent.add(f.model);
    return false;
  }
  const ruleBand = ruleById.get(f.rule)?.band;
  // A band rule is covered only when it names the joker's band; a material rule is
  // covered when the model actually carries that band, which is what the joker excuses.
  if (ruleBand ? ruleBand === lane : uses(modelByName.get(f.model), lane)) return false;
  return true;
});

const perRule = new Map();
for (const f of findings) perRule.set(f.rule, [...(perRule.get(f.rule) ?? []), f]);

const read = modelFilter ? models.filter(modelMatches) : models;
console.log(`${read.length} models, ${findings.length} findings\n`);
for (const rule of RULES) {
  const hits = perRule.get(rule.id);
  if (!hits) continue;
  console.log(`${rule.id} — ${rule.severity} — ${hits.length} × ${rule.text}`);
  for (const f of hits.slice(0, limit)) console.log(`    ${f.model.padEnd(44)} ${f.detail}`);
  if (hits.length > limit) console.log(`    … ${hits.length - limit} more`);
  console.log();
}

const errors = findings.filter((f) => f.severity === 'error').length;
console.log(`per rule: ${RULES.filter((r) => perRule.has(r.id)).map((r) => `${r.id} ${perRule.get(r.id).length}`).join(' · ') || 'none'}`);
console.log(`${errors} error(s), ${findings.length - errors} warning(s)`);
if (unknown.size) console.log(`colours outside the colormap: ${[...unknown].join(', ')}`);

if (jsonPath) {
  // The colormap lives in a PNG only this tool reads, so the band table travels with the
  // findings: the catalogue page has no other way to name a band or offer one to pick.
  writeFileSync(jsonPath, JSON.stringify({
    rules: CHECKS.map(({ id, guide, text, severity, coverage, follows: f }) => ({ id, guide, text, severity, coverage, ...(f ? { follows: f } : {}) })),
    accent: { maxSize: MAX_ACCENT_SIZE, busy: BUSY },
    bands: [
      ...Object.entries(BANDS).map(([name, lane]) => ({ name, lane, hex: HEX[name] })),
      { name: 'clear glass', lane: null, hex: CLEAR },
    ],
    findings,
  }, null, 1) + '\n');
  console.log(`→ ${jsonPath}`);
}

process.exit(errors ? 1 : 0);

// Every rule of the guide by the material tags, bands and kinds it concerns: what a
// check declares in `subjects`, plus what the rule text names — a tag id, a band name,
// a kind id, or a glossary noun of Appendix B (K8: every noun resolves to one kind).
function buildIndex() {
  const kinds = readKindTree();
  const nounToKind = new Map();
  for (const [kind, nouns] of kinds) {
    for (const raw of nouns.split(',')) {
      const noun = raw.replace(/\(.*?\)/g, '').trim().toLowerCase();
      if (noun && !nounToKind.has(noun)) nounToKind.set(noun, kind);
    }
  }
  const byTag = new Map(), byBand = new Map(), byKind = new Map();
  const add = (map, key, id) => map.set(key, new Set([...(map.get(key) ?? []), id]));
  const wordIn = (text, word) => new RegExp(`(?<![\\w-])${word.replace(/[-/()]/g, '\\$&')}(?:s|es)?(?![\\w-])`, 'i').test(text);
  for (const rule of RULE_TEXT.values()) {
    const text = rule.plain;
    for (const tag of MATERIAL_TAGS) if (wordIn(text, tag)) add(byTag, tag, rule.id);
    for (const b of BAND_TABLE.values()) for (const name of [b.name, ...b.aliases]) if (wordIn(text, name)) add(byBand, b.name, rule.id);
    if (/clear glass|transparent/i.test(text)) add(byBand, 'clear glass', rule.id);
    for (const kind of kinds.keys()) if (wordIn(text, kind)) add(byKind, kind, rule.id);
    for (const [noun, kind] of nounToKind) if (noun.length > 2 && wordIn(text, noun)) add(byKind, kind, rule.id);
  }
  for (const c of CHECKS) {
    for (const tag of c.subjects?.tags ?? []) if (MATERIAL_TAGS.includes(tag)) add(byTag, tag, c.guide);
    for (const b of c.subjects?.bands ?? []) add(byBand, b, c.guide);
    for (const k of c.subjects?.kinds ?? []) add(byKind, k, c.guide);
  }
  const ruleSort = (a, b) => byRank({ id: a }, { id: b });
  const section = (title, map, order) => [`## ${title}`, '',
    ...order.filter((k) => map.has(k)).map((k) => `- \`${k}\`: ${[...map.get(k)].sort(ruleSort).join(', ')}`), ''];
  return [
    '# Style guide rule index', '',
    'Generated by `node tools/catalog-lint.mjs --index`; rules by what they name. Do not edit.', '',
    ...section('By material tag', byTag, MATERIAL_TAGS),
    ...section('By band', byBand, [...BAND_NAMES, 'clear glass']),
    ...section('By kind', byKind, [...kinds.keys()].sort()),
  ].join('\n');
}
