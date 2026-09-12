

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPng } from '../catalog/tools/png.mjs';

const COLUMNS = 16;
const ROWS = 4;
const ROOT = new URL('..', import.meta.url).pathname;

const BANDS = {
  'light grey': '15,3',
  'dark grey': '13,3',
  'blue-grey': '6,1',
  'light blue-grey': '3,2',
  blue: '4,2',
  'off-white': '5,2',
  taupe: '14,3',
  terracotta: '5,0',
  yellow: '6,0',
  'dark red': '8,0',
  'dark green': '1,1',
  'light green': '3,1',
  'light brown': '0,0',
  'mid brown': '1,0',
  'dark brown': '2,0',
  bark: '3,0',
};

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
const band = (name) => HEX[name];
const bands = (...names) => names.map(band);

const MAX_ACCENT_SIZE = 0.5;
const BUSY = 4;
const looksLikeAccent = (m) =>
  (Math.max(...m.wdh) <= MAX_ACCENT_SIZE && m.colors.length >= 2) || m.colors.length >= BUSY;

// Kind and use are fields of §7; the predicates below key on them, never on a name.
const kindIs = (m, ...prefixes) => prefixes.some((p) => m.kind === p || m.kind?.startsWith(`${p}-`));
const usedFor = (m, ...uses) => uses.some((u) => m.use?.includes(u));

// Kinds that need no material tag: what grows or swims is coloured by M1-M5 and M32,
// not by what it is made of (N1).
const STANDS_IN_FOR_MATERIAL = ['env-flora', 'env-fungi', 'env-fauna', 'env-terrain'];

// Parents and subtypes both count: a model carries the subtype it is, and the parent
// only where no subtype fits, so `metal` + `metal-gold` is two materials, not one.
const MATERIAL_TAGS = ['wood', 'wood-planks', 'wood-worked', 'wood-beam', 'wood-log', 'wood-bark',
  'metal', 'metal-iron', 'metal-iron-steel', 'metal-iron-wrought', 'metal-iron-cast',
  'metal-gold', 'metal-silver', 'metal-copper',
  'stone', 'stone-masonry', 'stone-rock', 'stone-soil',
  'paper', 'textile', 'leather', 'ceramic', 'bone', 'food', 'wax', 'wick', 'glass', 'rope', 'cork',
  'gemstone', 'foliage', 'liquid', 'emissive', 'special', 'plastic', 'vegetation', 'skin'];

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

const isSkeleton = (m) => /skeleton/.test(m.name);
const isCopper = (m) => has(m, 'metal-copper');
const isKey = (m) => m.kind === 'obj-pocketitem-key';

const isContainer = (m) => kindIs(m, 'obj-container-barrel', 'obj-container-chest', 'obj-container-bucket', 'obj-container-crate');
const isLog = (m) => has(m, 'wood-log') || kindIs(m, 'env-flora-deadwood');
const isBottle = (m) => m.kind === 'obj-container-bottle';
const isBook = (m) => kindIs(m, 'obj-pocketitem-book', 'obj-weapon-magic') && has(m, 'paper');

const isRigged = (m) => /(^|-)(mast|ship|sail)(s|-|$)/.test(m.name) && has(m, 'textile');

const bandOnlyFor = ({ id, text, severity, color, tags, kinds = [], accent = false, unless = null }) => ({
  id, text, severity, band: band(color),
  check: (m) => {
    if (!uses(m, band(color))) return null;
    if (anyColour(m)) return null;
    if (has(m, ...tags)) return null;
    if (kindIs(m, ...kinds)) return null;
    if (unless?.(m)) return null;
    if (accent && looksLikeAccent(m)) return null;
    return `uses ${color} ${BANDS[color]} but carries ${materials(m).length ? materials(m).join(', ') : 'no material'}`;
  },
});

const materialTakes = ({ id, text, severity, tag, colors, when = null, unless = null }) => ({
  id, text, severity,
  check: (m) => {
    if (when ? !when(m) : !has(m, tag)) return null;
    if (unless?.(m)) return null;
    const allowed = colors.map((c) => (c === 'clear glass' ? CLEAR : band(c)));
    if (uses(m, ...allowed)) return null;
    return `is ${tag ?? id} but uses ${m.colors.map((h) => bandName[h] ?? h).join(', ')} — none of ${colors.join(', ')}`;
  },
});

// M62-M68 key the iron subtype to the kind. M67 lets a model carry a second subtype on
// top, so what is checked is that the kind's own subtype is present -- never that the
// others are absent. A model with no iron at all is none of these rules' business.
const IRON = ['steel', 'wrought', 'cast'];
const ironOf = (m) => IRON.filter((s) => has(m, `metal-iron-${s}`));
const ironIs = ({ id, text, severity, want, kinds, unless = null }) => ({
  id, text, severity,
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
const LANE_OF_NAME = new Map(Object.entries(BANDS).map(([name, lane]) => [name, lane]));
const reasonBand = (model) => {
  const reason = SPECIAL_REASONS[model] ?? '';
  for (const [name, lane] of LANE_OF_NAME) if (reason.startsWith(`${name} ${lane}`)) return band(name);
  if (reason.startsWith('clear glass')) return CLEAR;
  return null;
};

// W2 counts in UV position down the cell, the unit `spread` is stored in, not in L.
const MAX_SPREAD = 0.9;

const LANE_NAME = Object.fromEntries(Object.entries(BANDS).map(([name, lane]) => [lane, name]));
const POSITION_STEP = 0.01; // UV positions are quantised to the atlas pixel row (1/128) and stored at 3 decimals

const halfOf = ({ id, text, severity, lane, low, high, when }) => ({
  id, text, severity,
  check: (m) => {
    if (!when(m)) return null;
    const range = m.spread?.[BANDS[lane]];
    if (!range) return null;
    const [min, max] = range;
    if (min >= low - POSITION_STEP && max <= high + POSITION_STEP) return null;
    return `${lane} ${BANDS[lane]} spans ${min.toFixed(2)}-${max.toFixed(2)}, outside ${low.toFixed(2)}-${high.toFixed(2)}`;
  },
});

const RULES = [

  { id: 'G1', text: 'Objects with distinctive moving features, or with glass, draw in two or more calls. All others in one.',
    severity: 'warning', noJoker: true,
    check: (m) => {
      if (!(m.calls > 1) || has(m, 'animation', 'glass')) return null;
      return `${m.calls} draw calls with no animation or glass tag`;
    } },

  { id: 'S4', text: 'Only the PO assigns the tag. A special records which band it covers and why; one without a stated reason is a finding on the tag.',
    severity: 'error', noJoker: true,
    check: (m) => {
      if (!has(m, 'special')) return null;
      const reason = SPECIAL_REASONS[`${m.kit}/${m.name}`];
      return reason?.trim() ? null : 'carries special but catalog/tags.json records no band and reason for it';
    } },

  materialTakes({ id: 'M1', text: 'Trees are dark green.', severity: 'error',
    tag: 'tree', colors: ['dark green'],
    when: (m) => kindIs(m, 'env-flora-tree') && m.kind !== 'env-flora-tree-palm' }),
  materialTakes({ id: 'M2', text: 'Palm fronds are light green.', severity: 'error',
    tag: 'palm', colors: ['light green'], when: (m) => m.kind === 'env-flora-tree-palm' }),
  materialTakes({ id: 'M3', text: 'Grass is light green.', severity: 'error',
    tag: 'grass', colors: ['light green'], when: (m) => m.kind === 'env-flora-plant-grass' }),
  materialTakes({ id: 'M4', text: 'Stems and leaves are light green.', severity: 'error',
    tag: 'foliage', colors: ['light green'],
    when: (m) => has(m, 'foliage') && !kindIs(m, 'env-flora-tree') && m.kind !== 'env-flora-plant-grass' }),
  materialTakes({ id: 'M6', text: 'Wood is any of the three brown bands; wood-bark is bark 3,0.',
    severity: 'error', tag: 'wood', colors: ['light brown', 'mid brown', 'dark brown'],
    when: (m) => has(m, 'wood', 'wood-planks', 'wood-worked', 'wood-beam') }),
  materialTakes({ id: 'M6-bark', text: 'Wood is any of the three brown bands; wood-bark is bark 3,0.',
    severity: 'error', tag: 'wood-bark', colors: ['bark'] }),
  materialTakes({ id: 'M8', text: 'stone-masonry — walls, bricks, floors — is taupe 14,3, blue-grey 6,1 or light grey 15,3.',
    severity: 'error', tag: 'stone-masonry', colors: ['taupe', 'blue-grey', 'light grey'] }),
  materialTakes({ id: 'M9', text: 'stone-rock is light grey 15,3, secondarily taupe 14,3.',
    severity: 'error', tag: 'stone-rock', colors: ['light grey', 'taupe'] }),
  materialTakes({ id: 'M10', text: 'stone-soil — sand and dirt — is taupe 14,3.', severity: 'error',
    tag: 'stone-soil', colors: ['taupe'] }),

  materialTakes({ id: 'M11', text: 'metal-iron-steel is light grey 15,3.',
    severity: 'error', tag: 'metal-iron-steel', colors: ['light grey'],
    unless: (m) => isCopper(m) || isKey(m) }),
  materialTakes({ id: 'M12-wrought', text: 'metal-iron-wrought is dark grey 13,3; metal-iron-cast is blue-grey 6,1.',
    severity: 'error', tag: 'metal-iron-wrought', colors: ['dark grey'],
    unless: (m) => isCopper(m) || isKey(m) }),
  materialTakes({ id: 'M12-cast', text: 'metal-iron-wrought is dark grey 13,3; metal-iron-cast is blue-grey 6,1.',
    severity: 'error', tag: 'metal-iron-cast', colors: ['blue-grey'],
    unless: (m) => isCopper(m) || isKey(m) }),
  materialTakes({ id: 'M13', text: 'metal-gold is gold 6,0; metal-silver is silver 3,2.', severity: 'error',
    tag: 'metal-gold', colors: ['yellow'], unless: isKey }),
  materialTakes({ id: 'M13-silver', text: 'metal-gold is gold 6,0; metal-silver is silver 3,2.', severity: 'error',
    tag: 'metal-silver', colors: ['light blue-grey'], unless: isKey }),
  materialTakes({ id: 'M14', text: 'metal-copper is terracotta 5,0 and takes no other metal subtype.',
    severity: 'error', tag: 'metal-copper', colors: ['terracotta'] }),
  { id: 'M14-only', text: 'metal-copper is terracotta 5,0 and takes no other metal subtype.',
    severity: 'error',
    check: (m) => {
      if (!isCopper(m)) return null;
      const other = ['metal', 'metal-iron', 'metal-iron-steel', 'metal-iron-wrought', 'metal-iron-cast',
        'metal-gold', 'metal-silver'].filter((t) => has(m, t));
      return other.length ? `carries metal-copper alongside ${other.join(', ')}` : null;
    } },
  materialTakes({ id: 'M15', text: 'Keys take the colour of any metal subtype.', severity: 'error',
    tag: 'key', colors: ['light grey', 'dark grey', 'blue-grey', 'yellow', 'light blue-grey', 'terracotta'],
    when: isKey }),
  materialTakes({ id: 'M17', text: 'The bands on container group: barrels, chests, buckets, kegs, crates and boxes are metal-iron-wrought, dark grey 13,3.',
    severity: 'error', tag: 'metal-iron-wrought', colors: ['dark grey'],
    when: (m) => isContainer(m) && has(m, 'metal-iron-wrought') }),
  materialTakes({ id: 'M18', text: 'Textile is off-white, taupe 14,3, dark green 1,1 or dark red 8,0.',
    severity: 'error', tag: 'textile',
    colors: ['off-white', 'taupe', 'dark green', 'dark red'],
    unless: (m) => isRigged(m) && uses(m, band('blue-grey')) }),

  { id: 'M18b', text: 'The flags and sails of a rigged ship are off-white, dark green 1,1, dark red 8,0 or blue-grey 6,1 — never taupe 14,3.',
    severity: 'error',
    // Bands are counted per model, so a ship that carries rope has taupe explained
    // by M22 and is left alone; the rule bites on a rigged model with no rope on it.
    check: (m) => (isRigged(m) && uses(m, band('taupe')) && !has(m, 'rope'))
      ? 'is rigged and uses taupe 14,3, which no flag or sail may take'
      : null },

  halfOf({ id: 'M19', text: 'Wrapped grips and bindings on tools and weapons are always taupe 14,3, light half 0.02-0.40.',
    severity: 'warning', lane: 'taupe', low: 0.02, high: 0.40,
    when: (m) => usedFor(m, 'tool', 'weapon') && has(m, 'textile') && uses(m, band('taupe')) }),
  materialTakes({ id: 'M20', text: 'Leather is bark.', severity: 'error',
    tag: 'leather', colors: ['bark'] }),
  materialTakes({ id: 'M22', text: 'Rope is taupe 14,3.', severity: 'error',
    tag: 'rope', colors: ['taupe'] }),
  materialTakes({ id: 'M23', text: 'All cork is taupe 14,3.', severity: 'error',
    tag: 'cork', colors: ['taupe'] }),
  materialTakes({ id: 'M24', text: 'Glass is transparent, dark green or dark red.',
    severity: 'error', tag: 'glass', colors: ['clear glass', 'dark green', 'dark red'] }),
  materialTakes({ id: 'M25', text: 'Ceramics are terracotta, off-white, taupe or dark red.',
    severity: 'error', tag: 'ceramic', colors: ['terracotta', 'off-white', 'taupe', 'dark red'] }),
  { id: 'M26', text: 'Bottles are glass or ceramic.', severity: 'error',
    check: (m) => (isBottle(m) && !has(m, 'glass', 'ceramic'))
      ? `is a bottle but carries ${materials(m).length ? materials(m).join(', ') : 'no material'}` : null },
  materialTakes({ id: 'M27', text: 'The glass bottles exists in red and green.', severity: 'error',
    tag: 'glass', colors: ['dark red', 'dark green'], when: (m) => isBottle(m) && has(m, 'glass') }),
  materialTakes({ id: 'M28', text: 'A liquid is dark red 8,0, dark green 1,1 or blue 4,2.',
    severity: 'error', tag: 'liquid', colors: ['dark red', 'dark green', 'blue'] }),
  materialTakes({ id: 'M29', text: 'Bones and skulls are off-white.', severity: 'error',
    tag: 'bone', colors: ['off-white'], when: (m) => has(m, 'bone') || m.kind === 'env-remains-bones' }),
  materialTakes({ id: 'M30', text: 'Paper is off-white.', severity: 'error',
    tag: 'paper', colors: ['off-white'] }),
  materialTakes({ id: 'M31', text: 'Meat is terracotta 5,0, dark half 0.55-1.00.', severity: 'error',
    tag: 'meat', colors: ['terracotta'], when: (m) => m.kind === 'obj-food-meat' }),
  halfOf({ id: 'M31-half', text: 'Meat is terracotta 5,0, dark half 0.55-1.00.',
    severity: 'warning', lane: 'terracotta', low: 0.55, high: 1.00,
    when: (m) => m.kind === 'obj-food-meat' && uses(m, band('terracotta')) }),
  materialTakes({ id: 'M33', text: 'Flames and glow are yellow 6,0.', severity: 'error',
    tag: 'emissive', colors: ['yellow'] }),
  materialTakes({ id: 'M34', text: 'Candle wax are off-white 5,2.', severity: 'error',
    tag: 'wax', colors: ['off-white'] }),
  materialTakes({ id: 'M35', text: 'Wicks are dark grey 13,3.', severity: 'warning',
    tag: 'wick', colors: ['dark grey'] }),
  materialTakes({ id: 'M36', text: 'Gemstones are dark red 8,0, dark green 1,1 or blue 4,2.',
    severity: 'error', tag: 'gemstone', colors: ['dark red', 'dark green', 'blue'] }),
  materialTakes({ id: 'M37', text: 'Book covers are bark, dark red 8,0, dark green 1,1 or blue-grey 6,1.',
    severity: 'error', tag: 'book', colors: ['bark', 'dark red', 'dark green', 'blue-grey'],
    when: isBook }),
  { id: 'M38', text: 'Roofs are ceramic, dark red.', severity: 'error',
    check: (m) => {
      if (!isRoof(m)) return null;
      if (!has(m, 'ceramic')) return `is a roof but carries ${materials(m).length ? materials(m).join(', ') : 'no material'}`;
      if (!uses(m, band('dark red'))) return `is a roof but uses ${m.colors.map((h) => bandName[h] ?? h).join(', ')} — no dark red`;
      return null;
    } },
  { id: 'M39', text: 'Chests, barrels, kegs, buckets, boxes and crates are mainly wood, often with metal-iron accents.',
    severity: 'error',
    check: (m) => (isContainer(m) && !has(m, ...WOOD_TAGS))
      ? `is a container but carries ${materials(m).length ? materials(m).join(', ') : 'no material'}` : null },
  materialTakes({ id: 'M41', text: 'Plastic is dark red 8,0 or yellow/gold 6,0.', severity: 'error',
    tag: 'plastic', colors: ['dark red', 'yellow'] }),

  materialTakes({ id: 'M43', text: 'Skin is light brown 0,0, taupe 14,3 or bark 3,0.', severity: 'error',
    tag: 'skin', colors: ['light brown', 'taupe', 'bark'] }),

  materialTakes({ id: 'M44', text: 'Vegetation is a plant\'s non-green matter: dried stalks taupe 14,3, grain straw light brown (M51), stems off-white 5,2, blooms any colour.', severity: 'error',
    tag: 'vegetation', colors: ['taupe', 'light brown', 'off-white', 'terracotta', 'dark red', 'yellow', 'blue', 'blue-grey', 'light blue-grey'] }),

  materialTakes({ id: 'M42-planks', text: 'Wood subtypes take their band: wood-planks 0,0, wood-worked 1,0, wood-beam 2,0. wood-log and wood-bark follow M6.', severity: 'error',
    tag: 'wood-planks', colors: ['light brown'] }),
  materialTakes({ id: 'M42-worked', text: 'Wood subtypes take their band: wood-planks 0,0, wood-worked 1,0, wood-beam 2,0. wood-log and wood-bark follow M6.', severity: 'error',
    tag: 'wood-worked', colors: ['mid brown'] }),
  materialTakes({ id: 'M42-beam', text: 'Wood subtypes take their band: wood-planks 0,0, wood-worked 1,0, wood-beam 2,0. wood-log and wood-bark follow M6.', severity: 'error',
    tag: 'wood-beam', colors: ['dark brown'] }),

  ironIs({ id: 'M62', text: 'obj-weapon, obj-equipment, obj-kitchenware-tableware and obj-tool are metal-iron-steel.',
    severity: 'warning', want: ['steel'],
    kinds: ['obj-weapon', 'obj-equipment', 'obj-kitchenware-tableware', 'obj-tool'],
    // the wrought carve-out of M63 and the cast cannon of M64 sit inside these kinds
    unless: (m) => kindIs(m, 'obj-tool-supplies', 'obj-weapon-cannon') }),
  ironIs({ id: 'M63', text: 'obj-tool-supplies is metal-iron-wrought; its parent kind stays steel.',
    severity: 'warning', want: ['wrought'], kinds: ['obj-tool-supplies'] }),
  ironIs({ id: 'M64', text: 'obj-weapon-cannon and every str model with iron carry metal-iron-cast; another subtype may sit on top.',
    severity: 'warning', want: ['cast'], kinds: ['obj-weapon-cannon', 'str'] }),
  ironIs({ id: 'M65', text: 'Metal cookware always exists as both steel and cast, paired as variants; a model keeps the iron it is.',
    severity: 'warning', want: ['cast', 'steel'], kinds: ['obj-kitchenware-cookware'] }),
  ironIs({ id: 'M66', text: 'All other iron is metal-iron-wrought.',
    severity: 'warning', want: ['wrought'], kinds: ['obj', 'env', 'assy'],
    unless: (m) => kindIs(m, ...CLAIMED) && !kindIs(m, ...CLAIMED_BUT_WROUGHT) }),
  { id: 'M65-pair', text: 'Metal cookware always exists as both steel and cast, paired as variants; a model keeps the iron it is.',
    severity: 'warning',
    check: (m) => {
      if (!kindIs(m, 'obj-kitchenware-cookware') || !ironOf(m).length) return null;
      const irons = variantIrons(m);
      if (irons.has('steel') && irons.has('cast')) return null;
      if (!m.variant) return 'is metal cookware in no variant group, so it has no recorded counterpart';
      return `variant ${m.variant} carries only ${[...irons].join(', ')} — cookware exists as both`;
    } },
  { id: 'M67', text: 'A model may carry more than one iron subtype; each counts under N2. Never merge two iron bands into one.',
    severity: 'warning',
    check: (m) => {
      const got = ironOf(m);
      if (got.length < 2) return null;
      const missing = got.filter((subtype) => !(BANDS[IRON_BAND[subtype]] in (m.spread ?? {})));
      if (!missing.length) return null;
      return `carries ${got.join(' + ')} but ${missing.map((s) => `metal-iron-${s}`).join(', ')} has no band of its own`;
    } },
  ironIs({ id: 'M68', text: 'char iron is metal-iron-steel. An assembly answers per part; until it does, M66 stands.',
    severity: 'warning', want: ['steel'], kinds: ['char'] }),

  bandOnlyFor({ id: 'C1', text: 'Light grey 15,3: metal-iron-steel, stone and rock only.',
    severity: 'error', color: 'light grey',
    tags: ['metal', 'metal-iron-steel', 'stone', 'stone-masonry', 'stone-rock'], unless: isKey }),
  bandOnlyFor({ id: 'C2', text: 'Blue-grey 6,1: cast iron (M12), worked stone (M8), book covers (M37), and the flags and sails of a rigged ship (M18).',
    severity: 'error', color: 'blue-grey', tags: ['metal', 'metal-iron-cast', 'stone', 'stone-masonry'],
    unless: (m) => isBook(m) || isRigged(m) }),
  bandOnlyFor({ id: 'C15', text: 'Dark grey 13,3: metal-iron-wrought (M12) and wicks (M35).',
    severity: 'warning', color: 'dark grey', tags: ['metal', 'metal-iron-wrought', 'wick'], unless: isKey }),
  bandOnlyFor({ id: 'C3', text: 'Light blue-grey 3,2: silver (M13).',
    severity: 'error', color: 'light blue-grey', tags: ['metal', 'metal-silver'], unless: isKey }),
  bandOnlyFor({ id: 'C4', text: 'Blue 4,2: sparingly, minor accents only.',
    severity: 'error', color: 'blue', tags: [], accent: true }),
  bandOnlyFor({ id: 'C5', text: 'Yellow: metal-gold, emissive, fire and plastic (M41).',
    severity: 'error', color: 'yellow', tags: ['metal', 'metal-gold', 'emissive', 'plastic'],
    kinds: ['obj-lighting', 'obj-pocketitem-coin'], unless: isKey }),
  bandOnlyFor({ id: 'C6', text: 'Dark red: ceramics, glass, roofs, plastic (M41), textile (M18), gemstones (M36), minor accents.',
    severity: 'error', color: 'dark red', tags: ['ceramic', 'gemstone', 'glass', 'plastic', 'textile'],
    accent: true, unless: isRoof }),
  bandOnlyFor({ id: 'C7', text: 'Dark green: foliage, glass, textile only on character clothing or weapons (M18), and minor accents.',
    severity: 'error', color: 'dark green', tags: ['foliage', 'glass'], accent: true,
    unless: (m) => has(m, 'textile') && (m.kind === 'char' || usedFor(m, 'weapon')) }),
  bandOnlyFor({ id: 'C8', text: 'Light green: nature only — flora, including grass and weed accents growing on objects and structures.',
    // foliage is the green matter itself, so a weed accent on a floor tile carries it
    severity: 'error', color: 'light green', tags: ['foliage'], kinds: ['env-flora', 'env-fungi'] }),

  bandOnlyFor({ id: 'C9-light', text: 'Browns 0,0 1,0 2,0: wood and grain food (M51); skin may take light brown 0,0 (M43).',
    severity: 'error', color: 'light brown', tags: [...WOOD_TAGS, 'skin'], kinds: ['obj-food-grain'] }),
  bandOnlyFor({ id: 'C9-middle', text: 'Browns 0,0 1,0 2,0: wood and grain food (M51); skin may take light brown 0,0 (M43).',
    severity: 'error', color: 'mid brown', tags: WOOD_TAGS, kinds: ['obj-food-grain'] }),
  bandOnlyFor({ id: 'C9-dark', text: 'Browns 0,0 1,0 2,0: wood and grain food (M51); skin may take light brown 0,0 (M43).',
    severity: 'error', color: 'dark brown', tags: WOOD_TAGS, kinds: ['obj-food-grain'] }),
  bandOnlyFor({ id: 'C10', text: 'Darkest brown: wood-bark, leather, skin, and a log or trunk.',
    severity: 'error', color: 'bark', tags: ['wood-bark', 'leather', 'skin'], unless: isLog }),

  { id: 'C11', text: 'Transparent: glass only.', severity: 'error',
    check: (m) => (uses(m, CLEAR) && !has(m, 'glass')) ? 'uses the clear glass but carries no glass' : null },

  bandOnlyFor({ id: 'C12', text: 'Taupe 14,3: soil, rock (M9), masonry (M8), textile (M18), rope, cork, skin, dried vegetation (M44) and grips (M19).',
    severity: 'warning', color: 'taupe',
    tags: ['stone', 'stone-soil', 'stone-rock', 'stone-masonry', 'textile', 'rope', 'cork', 'skin', 'vegetation'],
    accent: true }),
  bandOnlyFor({ id: 'C13', text: 'Off-white 5,2: bone, paper, wax, ceramics (M25), textile (M18) and mushroom stems (M44).',
    severity: 'warning', color: 'off-white',
    tags: ['bone', 'paper', 'wax', 'ceramic', 'textile', 'vegetation'], kinds: ['env-remains-bones'], accent: true }),
  bandOnlyFor({ id: 'C14', text: 'Terracotta 5,0: copper (M14), ceramics (M25), meat (M31) and blooms and caps (M44).',
    severity: 'warning', color: 'terracotta',
    tags: ['metal-copper', 'ceramic', 'vegetation'], kinds: ['obj-food-meat'], accent: true }),

  { id: 'N1', text: 'A model has at least one material.', severity: 'error', noJoker: true,
    check: (m) => {
      if (materials(m).length) return null;
      if (kindIs(m, ...STANDS_IN_FOR_MATERIAL)) return null;
      return `has no material tag (kind ${m.kind})`;
    } },

  { id: 'N2', text: 'A model uses at least as many bands as it has materials. Every material tag counts, subtypes included.',
    severity: 'error', noJoker: true,
    check: (m) => {
      const mats = counting(m);
      if (!mats.length || m.colors.length >= mats.length) return null;
      return `${m.colors.length} band(s) for ${mats.length} (${mats.join(', ')})`;
    } },

  { id: 'N3', text: 'A model uses at most twice as many bands as materials; food, fauna and vegetation may use three times, a decorated food five.',
    severity: 'error', noJoker: true,
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

  { id: 'N4', text: 'Ceiling: 6 bands for a human character or a decorated food, 5 for anything else. A skeleton takes the 5; an assembly answers per part.',
    severity: 'error',
    check: (m) => {
      const bands = m.colors.length;
      // N5 lifts the ceiling to 6 for a size-l model carrying five material tags
      const ceiling = (m.kind === 'char' && !isSkeleton(m)) || isDecoratedFood(m)
        || (m.size === 'l' && counting(m).length >= 5) ? 6 : 5;
      if (bands <= ceiling) return null;
      return `${bands} bands, ceiling ${ceiling} (kind ${m.kind})`;
    } },

  { id: 'W2', text: 'No band spreads over more than 0.90 of its cell, light end to dark end.', severity: 'warning', noJoker: true,
    check: (m) => {
      if (!m.spread) return null;
      const wide = [];
      for (const [lane, [lo, hi]] of Object.entries(m.spread)) {
        if (hi - lo > MAX_SPREAD) wide.push(`${LANE_NAME[lane] ?? 'band'} ${lane} ${(hi - lo).toFixed(3)}`);
      }
      return wide.length ? wide.join(', ') : null;
    } },
];

const BLOCK_ORDER = ['G', 'S', 'M', 'C', 'N', 'W'];
const rank = (id) => {
  const [, block, number, rest] = id.match(/^([A-Z])(\d+)(.*)$/);
  return [BLOCK_ORDER.indexOf(block), Number(number), rest];
};
RULES.sort((a, b) => {
  const [ba, na, ra] = rank(a.id);
  const [bb, nb, rb] = rank(b.id);
  return ba - bb || na - nb || ra.localeCompare(rb);
});

const args = process.argv.slice(2);
let kitFilter = null, ruleFilter = null, severityFilter = null, jsonPath = null;
let limit = 5, listRules = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--kit') kitFilter = args[++i];
  else if (args[i] === '--rule') ruleFilter = args[++i];
  else if (args[i] === '--severity') severityFilter = args[++i];
  else if (args[i] === '--limit') limit = Number(args[++i]);
  else if (args[i] === '--json') jsonPath = args[++i];
  else if (args[i] === '--rules') listRules = true;
  else throw new Error(`unknown argument: ${args[i]}`);
}

if (listRules) {
  for (const r of RULES) console.log(`${r.id.padEnd(10)} ${r.severity.padEnd(6)} ${r.text}`);
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

let findings = [];
for (const rule of RULES) {
  if (ruleFilter && rule.id !== ruleFilter) continue;
  if (severityFilter && rule.severity !== severityFilter) continue;
  for (const m of models) {
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

console.log(`${models.length} models, ${findings.length} findings\n`);
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
    rules: RULES.map(({ id, text, severity }) => ({ id, text, severity })),
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
