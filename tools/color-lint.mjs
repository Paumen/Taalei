

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
  salmon: '13,0',
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

function readBands() {
  const atlas = readPng(join(ROOT, 'kits/colormap.png'));
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

const MATERIAL_TAGS = ['timber', 'bark', 'metal', 'paper', 'stone', 'rock', 'soil', 'textile',
  'leather', 'ceramic', 'bone', 'food', 'wax', 'glass', 'rope', 'cork', 'precious-metal',
  'gemstone', 'foliage', 'liquid', 'light', 'special', 'plastic'];

const has = (m, ...tags) => tags.some((t) => m.tags?.includes(t));
const uses = (m, ...hexes) => hexes.some((h) => m.colors?.includes(h));
const materials = (m) => MATERIAL_TAGS.filter((t) => m.tags?.includes(t));

const counting = (m) => materials(m).filter((t) => t !== 'special');

const isRoof = (m) =>
  (m.name.startsWith('roof') || m.name.includes('-roof')) && has(m, 'ceramic');

const isFlower = (m) => m.gr === 'flowers' || /(^|-)flower/.test(m.name);

const isOceanFauna = (m) => m.gr === 'ocean' && (m.tags?.includes('fauna') ?? false);

const isSkeleton = (m) => /skeleton/.test(m.name);
const isCopper = (m) => /(^|-)copper(-|$)/.test(m.name);
const isKey = (m) => /(^|-)key/.test(m.name);

const isContainer = (m) =>
  /(^|-)(barrel|chest|bucket|trunk|keg|crate|box|boxes|crates)(s|-|$)/.test(m.name);
const isBook = (m) => /(^|-)(book|spellbook|journal)(-|$)/.test(m.name) && has(m, 'paper');

const isRigged = (m) => /(^|-)(mast|ship|sail)(s|-|$)/.test(m.name) && has(m, 'textile');

const bandOnlyFor = ({ id, text, severity, color, tags, groups = [], accent = false, unless = null }) => ({
  id, text, severity, band: band(color),
  check: (m) => {
    if (!uses(m, band(color))) return null;
    if (isFlower(m)) return null;
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

const RULES = [

  materialTakes({ id: 'M1', text: 'Trees are dark green.', severity: 'error',
    tag: 'tree', colors: ['dark green'],
    when: (m) => m.gr === 'trees' && !m.name.includes('palm') }),
  materialTakes({ id: 'M2', text: 'Palm fronds are light green.', severity: 'error',
    tag: 'palms', colors: ['light green'] }),
  materialTakes({ id: 'M3', text: 'Grass is light green.', severity: 'error',
    tag: 'grass', colors: ['light green'], when: (m) => m.gr === 'grass' }),
  materialTakes({ id: 'M6', text: 'Timber is wood light 0,0, wood middle 1,0, wood dark 2,0 or bark 3,0.', severity: 'error',
    tag: 'timber', colors: ['wood light', 'wood middle', 'wood dark', 'bark'] }),
  materialTakes({ id: 'M7', text: 'Bark is bark 2,0.', severity: 'error',
    tag: 'bark', colors: ['bark'] }),
  materialTakes({ id: 'M8', text: 'Worked stone — walls, bricks, floors — is taupe 14,3, blue-grey 6,1 or light grey 15,3.',
    severity: 'error', tag: 'stone', colors: ['taupe', 'blue-grey', 'light grey'] }),
  materialTakes({ id: 'M9', text: 'Rocks are light grey 15,3, secondarily taupe 14,3.',
    severity: 'error', tag: 'rock', colors: ['light grey', 'taupe'] }),

  materialTakes({ id: 'M10', text: 'Sand and dirt are taupe 14,3.', severity: 'error',
    tag: 'soil', colors: ['taupe'] }),

  materialTakes({ id: 'M11-M12', text: 'Metal is light grey 15,3. Steel and cast iron may be blue-grey 6,1.',
    severity: 'error', tag: 'metal', colors: ['light grey', 'blue-grey'],
    unless: (m) => isCopper(m) || isKey(m) }),
  materialTakes({ id: 'M13', text: 'Precious metal is gold 6,0 or silver 3,2.', severity: 'error',
    tag: 'precious-metal', colors: ['yellow', 'light blue-grey'],
    unless: isCopper }),
  materialTakes({ id: 'M14', text: 'Copper is terracotta 5,0.', severity: 'error',
    tag: 'metal', colors: ['terracotta'], when: isCopper }),
  materialTakes({ id: 'M15', text: 'Keys take any metal or precious-metal colour.', severity: 'error',
    tag: 'key', colors: ['light grey', 'blue-grey', 'yellow', 'light blue-grey', 'terracotta'],
    when: isKey }),

  materialTakes({ id: 'M17', text: 'The bands on barrels, chests, buckets, trunks, kegs, crates and boxes are metal, light grey 15,3.',
    severity: 'error', tag: 'metal', colors: ['light grey'],
    when: (m) => isContainer(m) && has(m, 'metal') }),
  materialTakes({ id: 'M18', text: 'Textile is off-white, taupe 14,3, brown 2,0, dark green 1,1 or dark red 8,0.',
    severity: 'error', tag: 'textile',
    colors: ['off-white', 'taupe', 'wood dark', 'dark green', 'dark red'] }),

  materialTakes({ id: 'M20', text: 'Leather is bark 2,0.', severity: 'error',
    tag: 'leather', colors: ['bark'] }),
  materialTakes({ id: 'M22', text: 'Rope is taupe 14,3, never the light wood lane.', severity: 'error',
    tag: 'rope', colors: ['taupe'] }),
  materialTakes({ id: 'M23', text: 'All cork is taupe 14,3.', severity: 'error',
    tag: 'cork', colors: ['taupe'] }),
  materialTakes({ id: 'M24', text: 'Glass is its own material: transparent, dark green or dark red.',
    severity: 'error', tag: 'glass', colors: ['clear glass', 'dark green', 'dark red'] }),
  materialTakes({ id: 'M25', text: 'Ceramics are terracotta, off-white, taupe or dark red.',
    severity: 'error', tag: 'ceramic', colors: ['terracotta', 'off-white', 'taupe', 'dark red'] }),

  materialTakes({ id: 'M28', text: 'A liquid is dark red 8,0, dark green 1,1 or blue 4,2.',
    severity: 'error', tag: 'liquid', colors: ['dark red', 'dark green', 'blue'] }),

  { id: 'M26', text: 'Bottles are glass or ceramic.', severity: 'error',
    check: (m) => (/(^|-)bottle/.test(m.name) && !has(m, 'glass', 'ceramic'))
      ? `is a bottle but carries ${materials(m).length ? materials(m).join(', ') : 'no material'}` : null },
  materialTakes({ id: 'M29', text: 'Bones and skulls are off-white.', severity: 'error',
    tag: 'bone', colors: ['off-white'] }),
  materialTakes({ id: 'M30', text: 'Paper is off-white.', severity: 'error',
    tag: 'paper', colors: ['off-white'] }),

  materialTakes({ id: 'M31', text: 'Meat is terracotta 5,0, dark half 0.55-1.00.', severity: 'error',
    tag: 'meat', colors: ['terracotta'] }),
  materialTakes({ id: 'M32', text: 'Fauna are naturalistic: off-white, salmon, taupe. Fish may also be blue 4,2 or light blue-grey 3,2.',
    severity: 'error', tag: 'fauna', colors: ['off-white', 'salmon', 'taupe', 'blue', 'light blue-grey'],
    when: (m) => has(m, 'fauna') }),
  materialTakes({ id: 'M33-M34', text: 'Flames and glow are yellow 6,0. Candle wax and lampshades are off-white 5,2.',
    severity: 'error', tag: 'light', colors: ['yellow', 'off-white'],
    when: (m) => has(m, 'light', 'wax') }),

  materialTakes({ id: 'M36', text: 'Gemstones are dark red 8,0, dark green 1,1 or blue 4,2.',
    severity: 'error', tag: 'gemstone', colors: ['dark red', 'dark green', 'blue'] }),
  materialTakes({ id: 'M37', text: 'Book covers are bark 2,0, dark red 8,0, dark green 1,1 or blue-grey 6,1.',
    severity: 'error', tag: 'book', colors: ['bark', 'dark red', 'dark green', 'blue-grey'],
    when: isBook }),
  materialTakes({ id: 'M38', text: 'Roofs are ceramic, dark red.', severity: 'error',
    tag: 'roof', colors: ['dark red'], when: isRoof }),
  materialTakes({ id: 'M41', text: 'Plastic is dark red 8,0 or yellow/gold 6,0.', severity: 'error',
    tag: 'plastic', colors: ['dark red', 'yellow'] }),

  materialTakes({ id: 'M42-planks', text: 'Planks are wood light 0,0.', severity: 'error',
    tag: 'planks', colors: ['wood light'], when: (m) => has(m, 'planks') && has(m, 'timber') }),
  materialTakes({ id: 'M42-worked-planks', text: 'Worked planks are wood middle 1,0.', severity: 'error',
    tag: 'worked-planks', colors: ['wood middle'], when: (m) => has(m, 'worked-planks') && has(m, 'timber') }),
  materialTakes({ id: 'M42-beam', text: 'Beams are wood dark 2,0.', severity: 'error',
    tag: 'beam', colors: ['wood dark'], when: (m) => has(m, 'beam') && has(m, 'timber') }),

  bandOnlyFor({ id: 'C1', text: 'Light grey 15,3: metal, stone and rock only.',
    severity: 'error', color: 'light grey', tags: ['metal', 'precious-metal', 'stone', 'rock'] }),
  bandOnlyFor({ id: 'C2', text: 'Blue-grey 6,1: steel and cast iron (M12), worked stone (M8), wicks (M35), book covers (M37), and the flags and sails of a rigged ship (M18).',
    severity: 'error', color: 'blue-grey', tags: ['metal', 'stone', 'wax'],
    unless: (m) => isBook(m) || isRigged(m) }),
  bandOnlyFor({ id: 'C3', text: 'Light blue-grey 3,2: silver (M13).',
    severity: 'error', color: 'light blue-grey', tags: ['precious-metal'] }),
  bandOnlyFor({ id: 'C4', text: 'Blue 4,2: sparingly, minor accents only.',
    severity: 'error', color: 'blue', tags: [], accent: true }),
  bandOnlyFor({ id: 'C5', text: 'Yellow: precious metal, light, fire and plastic (M41).',
    severity: 'error', color: 'yellow', tags: ['precious-metal', 'light', 'wax', 'plastic'],
    groups: ['coins-jewelry', 'lights'] }),
  bandOnlyFor({ id: 'C6', text: 'Dark red: ceramics, glass, roofs, plastic (M41), minor accents.',
    severity: 'error', color: 'dark red', tags: ['ceramic', 'glass', 'plastic'],
    accent: true, unless: isRoof }),
  bandOnlyFor({ id: 'C7', text: 'Dark green: foliage, glass, and minor accents.',
    severity: 'error', color: 'dark green', tags: ['foliage', 'glass'], accent: true }),

  bandOnlyFor({ id: 'C8', text: 'Light green: nature only — flora, including grass and weed accents growing on objects and structures.',
    severity: 'error', color: 'light green', tags: ['flora'] }),

  bandOnlyFor({ id: 'C9-light', text: 'Lighter browns: timber only.',
    severity: 'error', color: 'wood light', tags: ['timber'] }),
  bandOnlyFor({ id: 'C9-middle', text: 'Lighter browns: timber only.',
    severity: 'error', color: 'wood middle', tags: ['timber'] }),
  bandOnlyFor({ id: 'C9-dark', text: 'Lighter browns: timber only.',
    severity: 'error', color: 'wood dark', tags: ['timber', 'textile'] }),
  bandOnlyFor({ id: 'C10', text: 'Darkest brown: bark, leather and the timber of a log or trunk.',
    severity: 'error', color: 'bark', tags: ['bark', 'leather', 'timber'] }),

  { id: 'C11', text: 'Clear glass: glass only.', severity: 'error',
    check: (m) => (uses(m, CLEAR) && !has(m, 'glass')) ? 'uses the clear glass but carries no glass' : null },

  { id: 'N1', text: 'A model has at least one material.', severity: 'error',
    check: (m) => {
      if (materials(m).length) return null;
      const stand_in = STANDS_IN_FOR_MATERIAL[m.gr];
      if (!stand_in) return `has no material tag (group ${m.gr})`;
      return has(m, stand_in) ? null : `group ${m.gr} but no ${stand_in} tag`;
    } },

  { id: 'N2', text: 'A model uses at least as many bands as it has materials, and timber counts for its band tags.', severity: 'error',
    check: (m) => {
      const mats = counting(m);
      if (!mats.length) return null;
      const bandTags = ['planks', 'worked-planks', 'beam', 'logs'].filter((t) => has(m, t));
      const owed = mats.includes('timber') ? mats.length - 1 + Math.max(1, bandTags.length) : mats.length;
      if (m.colors.length >= owed) return null;
      const why = mats.includes('timber') && bandTags.length > 1
        ? `${mats.join(', ')} with timber on ${bandTags.join('+')}`
        : mats.join(', ');
      return `${m.colors.length} band(s) for ${owed} (${why})`;
    } },

  { id: 'N3', text: 'A model uses at most twice as many bands as materials; food and fauna may use three times.',
    severity: 'error',
    check: (m) => {
      const n = counting(m).length;
      const used = m.colors.filter((hex) => hex !== jokerBand.get(m)).length;
      const per = has(m, 'food', 'fauna') ? 3 : 2;
      if (!n || used <= per * n) return null;
      return `${used} bands for ${n} material(s) (${counting(m).join(', ')}), ceiling ${per * n}`;
    } },

  { id: 'N4', text: 'Ceiling: 6 bands for a human character, 5 for anything else.',
    severity: 'error', noJoker: true,
    check: (m) => {
      const bands = m.colors.filter((hex) => hex !== CLEAR).length;
      const ceiling = m.gr === 'characters' && !isSkeleton(m) ? 6 : 5;
      if (bands <= ceiling) return null;
      return `${bands} bands, ceiling ${ceiling} (group ${m.gr})`;
    } },
];

const BLOCK_ORDER = ['M', 'C', 'N'];
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

const models = inCatalog.filter((m) => !isOceanFauna(m));

const counted = inCatalog;

const unknown = new Set();
for (const m of models) for (const hex of m.colors) if (!bandName[hex]) unknown.add(hex);

for (const m of counted) {
  if (!m.tags?.includes('special')) continue;
  for (const rule of RULES) {
    if (rule.id.startsWith('N')) break;
    if (!rule.check(m)) continue;
    if (rule.band) jokerBand.set(m, rule.band);
    break;
  }
}

let findings = [];
for (const rule of RULES) {
  if (ruleFilter && rule.id !== ruleFilter) continue;
  if (severityFilter && rule.severity !== severityFilter) continue;
  for (const m of rule.noJoker ? counted : models) {
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
