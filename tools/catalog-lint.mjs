

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPng } from '../catalog/tools/png.mjs';

const COLUMNS = 16;
const ROWS = 4;
const ROOT = new URL('..', import.meta.url).pathname;

const BANDS = {
  'light grey': '15,3',
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
  'wood light': '0,0',
  'wood middle': '1,0',
  'wood dark': '2,0',
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

const STANDS_IN_FOR_MATERIAL = { flowers: 'flora', grass: 'flora', plants: 'flora', ground: 'flora', ocean: 'fauna' };

// Parents and subtypes both count: a model carries the subtype it is, and the parent
// only where no subtype fits, so `metal` + `metal-gold` is two materials, not one.
const MATERIAL_TAGS = ['wood', 'wood-planks', 'wood-worked', 'wood-beam', 'wood-log', 'wood-bark',
  'metal', 'metal-iron', 'metal-gold', 'metal-silver', 'metal-copper',
  'stone', 'stone-masonry', 'stone-rock', 'stone-soil',
  'paper', 'textile', 'leather', 'ceramic', 'bone', 'food', 'wax', 'glass', 'rope', 'cork',
  'gemstone', 'foliage', 'liquid', 'emissive', 'special', 'plastic', 'vegetation', 'skin'];

const WOOD_TAGS = MATERIAL_TAGS.filter((t) => t === 'wood' || t.startsWith('wood-'));

const has = (m, ...tags) => tags.some((t) => m.tags?.includes(t));
const uses = (m, ...hexes) => hexes.some((h) => m.colors?.includes(h));
const materials = (m) => MATERIAL_TAGS.filter((t) => m.tags?.includes(t));

const counting = (m) => materials(m).filter((t) => t !== 'special');

const isRoof = (m) =>
  has(m, 'roofs') || ((m.name.startsWith('roof') || m.name.includes('-roof')) && has(m, 'ceramic'));

const isFlower = (m) => m.gr === 'flowers' || /(^|-)flower/.test(m.name);
const isFauna = (m) => has(m, 'fauna');
const isFood = (m) => has(m, 'food');
// M45 gives food the freedom M32 gives fauna: what it is made of says nothing about its band.
const anyColour = (m) => isFlower(m) || isFauna(m) || isFood(m);
const isDecoratedFood = (m) => isFood(m) && has(m, 'decorated');

const isSkeleton = (m) => /skeleton/.test(m.name);
const isCopper = (m) => has(m, 'metal-copper');
const isKey = (m) => has(m, 'key');

const isContainer = (m) =>
  /(^|-)(barrel|chest|bucket|keg|crate|box|boxes|crates)(s|-|$)/.test(m.name);
const isLog = (m) => has(m, 'wood-log') || /(^|-)(log|trunk|stump)(s|-|$)/.test(m.name);
const isBottle = (m) => /(^|-)bottle/.test(m.name);
const isBook = (m) => /(^|-)(book|spellbook|journal)(-|$)/.test(m.name) && has(m, 'paper');

const isRigged = (m) => /(^|-)(mast|ship|sail)(s|-|$)/.test(m.name) && has(m, 'textile');

const bandOnlyFor = ({ id, text, severity, color, tags, groups = [], accent = false, unless = null }) => ({
  id, text, severity, band: band(color),
  check: (m) => {
    if (!uses(m, band(color))) return null;
    if (anyColour(m)) return null;
    if (has(m, ...tags)) return null;
    if (groups.includes(m.gr)) return null;
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

const jokerBand = new Map();

const TAGS = JSON.parse(readFileSync(join(ROOT, 'catalog/tags.json'), 'utf8')).tags;
const SPECIAL_REASONS = TAGS.find((t) => t.id === 'special')?.reasons ?? {};

// OKLab lightness of the colormap down one lane: position 0 = light top, 1 = dark bottom.
const toLinear = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
function lightnessAt(lane, position) {
  const [column, row] = lane.split(',').map(Number);
  const cellWidth = ATLAS.width / COLUMNS;
  const cellHeight = ATLAS.height / ROWS;
  const x = Math.floor(column * cellWidth + cellWidth / 2);
  const y = Math.min(Math.floor((row + position) * cellHeight), ATLAS.height - 1);
  const i4 = (y * ATLAS.width + x) * 4;
  const [r, g, b] = [ATLAS.pixels[i4], ATLAS.pixels[i4 + 1], ATLAS.pixels[i4 + 2]].map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * q;
}
const WOOD_LANES = ['wood light', 'wood middle', 'wood dark', 'bark'].map((n) => BANDS[n]);
const MIN_WOOD_SPREAD_L = 0.03;
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

  { id: 'G1', text: 'A model draws in one call; only moving features (animation tag) or glass earn more (guide §5).',
    severity: 'warning', noJoker: true,
    check: (m) => {
      if (!(m.calls > 1) || has(m, 'animation', 'glass')) return null;
      return `${m.calls} draw calls with no animation or glass tag`;
    } },

  { id: 'S4', text: 'A special records which band it covers and why; one without a stated reason is a finding on the tag.',
    severity: 'error', noJoker: true,
    check: (m) => {
      if (!has(m, 'special')) return null;
      const reason = SPECIAL_REASONS[`${m.kit}/${m.name}`];
      return reason?.trim() ? null : 'carries special but catalog/tags.json records no band and reason for it';
    } },

  materialTakes({ id: 'M1', text: 'Trees are dark green.', severity: 'error',
    tag: 'tree', colors: ['dark green'],
    when: (m) => m.gr === 'trees' && !has(m, 'palms') }),
  materialTakes({ id: 'M2', text: 'Palm fronds are light green.', severity: 'error',
    tag: 'palms', colors: ['light green'] }),
  materialTakes({ id: 'M3', text: 'Grass is light green.', severity: 'error',
    tag: 'grass', colors: ['light green'], when: (m) => m.gr === 'grass' }),
  materialTakes({ id: 'M4', text: 'Stems and leaves are light green.', severity: 'error',
    tag: 'foliage', colors: ['light green'],
    when: (m) => has(m, 'foliage') && m.gr !== 'trees' && m.gr !== 'grass' }),
  materialTakes({ id: 'M6', text: 'Wood is any of the three wood bands; wood-bark is bark 3,0.',
    severity: 'error', tag: 'wood', colors: ['wood light', 'wood middle', 'wood dark'],
    when: (m) => has(m, 'wood', 'wood-planks', 'wood-worked', 'wood-beam') }),
  materialTakes({ id: 'M6-bark', text: 'Wood is any of the three wood bands; wood-bark is bark 3,0.',
    severity: 'error', tag: 'wood-bark', colors: ['bark'] }),
  materialTakes({ id: 'M8', text: 'Worked stone — walls, bricks, floors — is taupe 14,3, blue-grey 6,1 or light grey 15,3.',
    severity: 'error', tag: 'stone-masonry', colors: ['taupe', 'blue-grey', 'light grey'] }),
  materialTakes({ id: 'M9', text: 'Rocks are light grey 15,3, secondarily taupe 14,3.',
    severity: 'error', tag: 'stone-rock', colors: ['light grey', 'taupe'] }),
  materialTakes({ id: 'M10', text: 'Sand and dirt are taupe 14,3.', severity: 'error',
    tag: 'stone-soil', colors: ['taupe'] }),

  materialTakes({ id: 'M11-M12', text: 'Metal is light grey 15,3. Steel and cast iron may be blue-grey 6,1.',
    severity: 'error', tag: 'metal-iron', colors: ['light grey', 'blue-grey'],
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
      const other = ['metal', 'metal-iron', 'metal-gold', 'metal-silver'].filter((t) => has(m, t));
      return other.length ? `carries metal-copper alongside ${other.join(', ')}` : null;
    } },
  materialTakes({ id: 'M15', text: 'Keys take the colour of any metal subtype.', severity: 'error',
    tag: 'key', colors: ['light grey', 'blue-grey', 'yellow', 'light blue-grey', 'terracotta'],
    when: isKey }),
  materialTakes({ id: 'M17', text: 'The bands on container group: barrels, chests, buckets, kegs, crates and boxes are metal, light grey 15,3.',
    severity: 'error', tag: 'metal-iron', colors: ['light grey'],
    when: (m) => isContainer(m) && has(m, 'metal-iron') }),
  materialTakes({ id: 'M18', text: 'Textile is off-white, taupe 14,3, brown 2,0, dark green 1,1 or dark red 8,0. Flags and sails of a rigged ship may also be blue-grey 6,1.',
    severity: 'error', tag: 'textile',
    colors: ['off-white', 'taupe', 'wood dark', 'dark green', 'dark red'],
    unless: (m) => isRigged(m) && uses(m, band('blue-grey')) }),

  halfOf({ id: 'M19', text: 'Wrapped grips and bindings on tools and weapons are always taupe 14,3, light half 0.02-0.40.',
    severity: 'warning', lane: 'taupe', low: 0.02, high: 0.40,
    when: (m) => m.gr === 'tools' && has(m, 'textile') && uses(m, band('taupe')) }),
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
    tag: 'bone', colors: ['off-white'], when: (m) => has(m, 'bone', 'skull') }),
  materialTakes({ id: 'M30', text: 'Paper is off-white.', severity: 'error',
    tag: 'paper', colors: ['off-white'] }),
  materialTakes({ id: 'M31', text: 'Meat is terracotta 5,0, dark half 0.55-1.00.', severity: 'error',
    tag: 'meat', colors: ['terracotta'] }),
  halfOf({ id: 'M31-half', text: 'Meat is terracotta 5,0, dark half 0.55-1.00.',
    severity: 'warning', lane: 'terracotta', low: 0.55, high: 1.00,
    when: (m) => has(m, 'meat') && uses(m, band('terracotta')) }),
  materialTakes({ id: 'M33', text: 'Flames and glow are yellow 6,0.', severity: 'error',
    tag: 'emissive', colors: ['yellow'] }),
  materialTakes({ id: 'M34', text: 'Candle wax are off-white 5,2.', severity: 'error',
    tag: 'wax', colors: ['off-white'] }),
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
  { id: 'M39', text: 'Chests, barrels, kegs, buckets, boxes and crates are mainly timber, often with metal accents.',
    severity: 'error',
    check: (m) => (isContainer(m) && !has(m, ...WOOD_TAGS))
      ? `is a container but carries ${materials(m).length ? materials(m).join(', ') : 'no material'}` : null },
  materialTakes({ id: 'M41', text: 'Plastic is dark red 8,0 or yellow/gold 6,0.', severity: 'error',
    tag: 'plastic', colors: ['dark red', 'yellow'] }),

  materialTakes({ id: 'M43', text: 'Skin is wood light 0,0, taupe 14,3 or bark 3,0.', severity: 'error',
    tag: 'skin', colors: ['wood light', 'taupe', 'bark'] }),

  materialTakes({ id: 'M44', text: 'Vegetation is a plant\'s non-green matter: dried stalks and husks taupe 14,3, mushroom stems off-white 5,2, blooms and caps any colour.', severity: 'error',
    tag: 'vegetation', colors: ['taupe', 'off-white', 'terracotta', 'dark red', 'yellow', 'blue', 'blue-grey', 'light blue-grey'] }),

  materialTakes({ id: 'M42-planks', text: 'Wood subtypes take their band: wood-planks 0,0.', severity: 'error',
    tag: 'wood-planks', colors: ['wood light'] }),
  materialTakes({ id: 'M42-worked', text: 'Wood subtypes take their band: wood-worked 1,0.', severity: 'error',
    tag: 'wood-worked', colors: ['wood middle'] }),
  materialTakes({ id: 'M42-beam', text: 'Wood subtypes take their band: wood-beam 2,0.', severity: 'error',
    tag: 'wood-beam', colors: ['wood dark'] }),

  bandOnlyFor({ id: 'C1', text: 'Light grey 15,3: metal, stone and rock only.',
    severity: 'error', color: 'light grey',
    tags: ['metal', 'metal-iron', 'stone', 'stone-masonry', 'stone-rock'], unless: isKey }),
  bandOnlyFor({ id: 'C2', text: 'Blue-grey 6,1: steel and cast iron (M12), worked stone (M8), wicks (M35), book covers (M37), and the flags and sails of a rigged ship (M18).',
    severity: 'error', color: 'blue-grey', tags: ['metal', 'metal-iron', 'stone', 'stone-masonry', 'wax'],
    unless: (m) => isBook(m) || isRigged(m) }),
  bandOnlyFor({ id: 'C3', text: 'Light blue-grey 3,2: silver (M13).',
    severity: 'error', color: 'light blue-grey', tags: ['metal', 'metal-silver'], unless: isKey }),
  bandOnlyFor({ id: 'C4', text: 'Blue 4,2: sparingly, minor accents only.',
    severity: 'error', color: 'blue', tags: [], accent: true }),
  bandOnlyFor({ id: 'C5', text: 'Yellow: precious metal, emissive, fire and plastic (M41).',
    severity: 'error', color: 'yellow', tags: ['metal', 'metal-gold', 'emissive', 'fire', 'plastic'],
    groups: ['coins-jewelry', 'lights'], unless: isKey }),
  bandOnlyFor({ id: 'C6', text: 'Dark red: ceramics, glass, roofs, plastic (M41), minor accents.',
    severity: 'error', color: 'dark red', tags: ['ceramic', 'glass', 'plastic'],
    accent: true, unless: isRoof }),
  bandOnlyFor({ id: 'C7', text: 'Dark green: foliage, glass, and minor accents.',
    severity: 'error', color: 'dark green', tags: ['foliage', 'glass'], accent: true }),
  bandOnlyFor({ id: 'C8', text: 'Light green: nature only — flora, including grass and weed accents growing on objects and structures.',
    severity: 'error', color: 'light green', tags: ['flora'] }),

  bandOnlyFor({ id: 'C9-light', text: 'Lighter browns: wood only; skin may take wood light 0,0 (M43).',
    severity: 'error', color: 'wood light', tags: [...WOOD_TAGS, 'skin'] }),
  bandOnlyFor({ id: 'C9-middle', text: 'Lighter browns: wood only.',
    severity: 'error', color: 'wood middle', tags: WOOD_TAGS }),
  bandOnlyFor({ id: 'C9-dark', text: 'Lighter browns: wood only (textile may take brown 2,0 per M18).',
    severity: 'error', color: 'wood dark', tags: [...WOOD_TAGS, 'textile'] }),
  bandOnlyFor({ id: 'C10', text: 'Darkest brown: wood-bark, leather, skin, and a log or trunk.',
    severity: 'error', color: 'bark', tags: ['wood-bark', 'leather', 'skin'], unless: isLog }),

  { id: 'C11', text: 'Transparent: glass only.', severity: 'error',
    check: (m) => (uses(m, CLEAR) && !has(m, 'glass')) ? 'uses the clear glass but carries no glass' : null },

  { id: 'N1', text: 'A model has at least one material.', severity: 'error', noJoker: true,
    check: (m) => {
      if (materials(m).length) return null;
      const stand_in = STANDS_IN_FOR_MATERIAL[m.gr];
      if (!stand_in) return `has no material tag (group ${m.gr})`;
      return has(m, stand_in) ? null : `group ${m.gr} but no ${stand_in} tag`;
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
      const used = m.colors.filter((hex) => hex !== jokerBand.get(m)).length;
      const per = isDecoratedFood(m) ? 5 : has(m, 'food', 'fauna', 'vegetation') ? 3 : 2;
      if (!n || used <= per * n) return null;
      return `${used} bands for ${n} material(s) (${counting(m).join(', ')}), ceiling ${per * n}`;
    } },

  { id: 'N4', text: 'Ceiling: 6 bands for a human character or a decorated food, 5 for anything else. A skeleton takes the 5.',
    severity: 'error',
    check: (m) => {
      const bands = m.colors.length;
      const ceiling = (m.gr === 'characters' && !isSkeleton(m)) || isDecoratedFood(m) ? 6 : 5;
      if (bands <= ceiling) return null;
      return `${bands} bands, ceiling ${ceiling} (group ${m.gr})`;
    } },

  { id: 'W1', text: 'Every wood gradient band spreads over at least 0.03 L.', severity: 'warning', noJoker: true,
    check: (m) => {
      if (!m.spread) return null;
      const thin = [];
      for (const lane of WOOD_LANES) {
        const range = m.spread[lane];
        if (!range) continue;
        const spread = lightnessAt(lane, range[0]) - lightnessAt(lane, range[1]);
        if (spread < MIN_WOOD_SPREAD_L) thin.push(`${LANE_NAME[lane]} ${lane} ${spread.toFixed(3)} L`);
      }
      return thin.length ? thin.join(', ') : null;
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

const SKIP_GROUPS = ['assemblies'];

const inCatalog = catalog.models
  .filter((m) => m.colors?.length)
  .filter((m) => !SKIP_GROUPS.includes(m.gr))
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

const jokerSpent = new Set();
findings = findings.filter((f) => {
  if (!f.joker) return true;
  if (jokerSpent.has(f.model)) return true;
  jokerSpent.add(f.model);
  return false;
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
  writeFileSync(jsonPath, JSON.stringify({
    rules: RULES.map(({ id, text, severity }) => ({ id, text, severity })),
    accent: { maxSize: MAX_ACCENT_SIZE, busy: BUSY },
    findings,
  }, null, 1) + '\n');
  console.log(`→ ${jsonPath}`);
}

process.exit(errors ? 1 : 0);
