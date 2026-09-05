// Checks the catalogue against the material and colour rules of Appendix A in
// docs/asset_style_guide.md: does every model take the colour bands its materials
// are allowed, and does every band it uses belong to a material it carries.
//
//   node tools/color-lint.mjs [--kit dungeon] [--rule C10] [--severity error]
//                             [--limit 8] [--rules] [--json path.json]
//
// Reads catalog/catalog.json — `colors` there is already resolved from the UVs
// against kits/colormap.png by build-catalog.mjs, and `tags` are the manually set
// material tags from catalog/tags.json. Those tags are exhaustive: every material
// present in a model carries its tag, so a band without its material is a finding
// and not a gap in the tagging.
//
// Two things Appendix A states that this tool cannot see. The lane and gradient
// rules (the G block) live in the UVs of the individual triangles and in the
// source model, not in the catalogue — they need their own tool. And the rules
// that ask what an object looks like (M1, M12, M15, M16, M18, M28, M29 and G6) are
// a judgement, not a measurement.
//
// SEVERITY is the table below and nothing else: `error` fails the run, `warn`
// only prints. Appendix A says "only" through the C block and "usually" for much
// of the M block, so the wording is written out per rule — flipping one is a word.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPng } from '../catalog/tools/png.mjs';

const COLUMNS = 16;
const ROWS = 4;
const ROOT = new URL('..', import.meta.url).pathname;

// The band ids of Appendix A, column,row in kits/colormap.png. The hexes are read
// from the image at startup, so a change to the colormap moves the rules with it.
const BANDS = {
  'light grey': '15,3',
  'dark grey': '10,0',
  'blue-grey': '6,1',
  'light blue-grey': '3,2',
  blue: '4,2',
  'off-white': '5,2',
  taupe: '14,3',
  salmon: '13,0',
  khaki: '14,0',
  terracotta: '5,0',
  yellow: '6,0',
  'dark red': '8,0',
  'dark green': '1,1',
  'light green': '3,1',
  'wood light': '0,0',
  'wood middle': '1,0',
  bark: '2,0',
};

// Rule M17: the one transparent glass colour is a material of its own, not a band.
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

// The accent approximation. Rules C10, C9, C7 and C8 allow a band as a very minor
// detail; the catalogue records that a band is used, not how much of the model it
// covers. Stand-in: small models that mix at least two bands, and busy models of
// any size. Both are shapes where one band is unlikely to be a whole surface.
const MAX_ACCENT_SIZE = 0.5;
const BUSY = 4;
const looksLikeAccent = (m) =>
  (Math.max(...m.wdh) <= MAX_ACCENT_SIZE && m.colors.length >= 2) || m.colors.length >= BUSY;

const STANDS_IN_FOR_MATERIAL = { flowers: 'flora', grass: 'flora', plants: 'flora', ground: 'flora', ocean: 'fauna' };

// Every tag of type `material` in tags.json. `foliage` is one of them: the greenery
// itself is a material the way timber is, and the green it takes is a band of its own
// — a palm counts its trunk and its fronds, not one lane against three bands.
// `flora` is not: it covers the bare trunks and stumps too, which have no colour of
// their own, so counting it would read a single-band grass patch as short a band.
const MATERIAL_TAGS = ['timber', 'bark', 'metal', 'paper', 'stone', 'rock', 'soil', 'textile',
  'leather', 'ceramic', 'bone', 'food', 'candle', 'glass', 'rope', 'cork', 'precious-metal',
  'foliage', 'liquid'];

const has = (m, ...tags) => tags.some((t) => m.tags?.includes(t));
const uses = (m, ...hexes) => hexes.some((h) => m.colors?.includes(h));
const materials = (m) => MATERIAL_TAGS.filter((t) => m.tags?.includes(t));
// A roof in the sense of rule M19 is a tiled roof, and those carry the ceramic tag.
// The name alone is not enough: the ridge and rake trim and the thatched
// structure-roof are timber pieces that happen to have "roof" in the name.
const isRoof = (m) =>
  (m.name.startsWith('roof') || m.name.includes('-roof')) && has(m, 'ceramic');

// Rule M1 stands on its own: a flower may be any colour, so no rule in the C block
// reaches one. The flowers group is not the whole set — the cactus flowers are filed
// under plants with the cactus they sit on — so the name counts as well.
const isFlower = (m) => m.gr === 'flowers' || /(^|-)flower/.test(m.name);

// Ocean fauna are not linted at all (PO decision). They carry no material — `fauna`
// is not a material tag and Appendix A gives the group none — so the C block reads
// every band on a fish as a band whose material is missing, and M26 cannot stand in
// for it: it passes on `uses(...allowed)`, which asks for at least one fauna colour
// and not that every band is one. Rather than a half-guard, they are out.
// The fauna tag is the condition, not the group alone — an anchor or a net filed
// under ocean is an object and stays in, N1 included.
const isOceanFauna = (m) => m.gr === 'ocean' && (m.tags?.includes('fauna') ?? false);

// Two metals Appendix A gives their own rule, so rule M9-M10 does not reach them.
// Both are read off the name: copper and the keys carry the plain `metal` tag, and
// nothing in the catalogue records that a bar is copper or a shape is a key.
// `keyring` is in: a ring of keys is keys.
const isCopper = (m) => /(^|-)copper(-|$)/.test(m.name);
const isKey = (m) => /(^|-)key/.test(m.name);

// A band is only used for the materials listed. Fires when the model uses the band
// and carries none of them. `groups` names semantic groups the band is equally for,
// where what a model is says more than what it is made of; `accent` exempts the
// models the approximation above reads as a detail; `unless` is an extra escape a
// rule spells out itself.
const bandOnlyFor = ({ id, text, severity, color, tags, groups = [], accent = false, unless = null }) => ({
  id, text, severity,
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

// A material takes one of these bands. Fires when the model carries the material
// and uses none of them — the model has to get that material's colour somewhere.
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

const RULES = [
  // Material -> colour, the M block. Appendix A says "are" for M6, M7 and M23 and
  // "usually" for most of the rest; the severity column is where that lands.
  materialTakes({ id: 'M6', text: 'Bones and skulls are off-white.', severity: 'error',
    tag: 'bone', colors: ['off-white'] }),
  materialTakes({ id: 'M7', text: 'Paper is off-white.', severity: 'warn',
    tag: 'paper', colors: ['off-white'] }),
  materialTakes({ id: 'M8', text: 'Ceramics are usually terracotta, off-white, taupe, or dark red.',
    severity: 'error', tag: 'ceramic', colors: ['terracotta', 'off-white', 'taupe', 'dark red'] }),
  // Copper (rule M11) and keys (rule M12) are metal too, but Appendix A gives each
  // its own colours; they are checked by those rules below instead.
  materialTakes({ id: 'M9-M10', text: 'Metal is usually light grey 15,3. Steel/cast iron can be dark grey 10,0.',
    severity: 'warn', tag: 'metal', colors: ['light grey', 'dark grey'],
    unless: (m) => isCopper(m) || isKey(m) }),
  materialTakes({ id: 'M12', text: 'Keys can be any metal or precious-metal colour.', severity: 'warn',
    tag: 'key', colors: ['light grey', 'dark grey', 'yellow', 'light blue-grey', 'terracotta'],
    when: isKey }),
  materialTakes({ id: 'M13', text: 'Textile: off-white, salmon 13,0, khaki 14,0 or brown 1,0.',
    severity: 'error', tag: 'textile', colors: ['off-white', 'salmon', 'khaki', 'wood middle'] }),
  materialTakes({ id: 'M17', text: 'Glass is a special own material: transparent, or dark green or dark red.',
    severity: 'warn', tag: 'glass', colors: ['clear glass', 'dark green', 'dark red'] }),
  materialTakes({ id: 'M19', text: 'Roofs are usually dark red.', severity: 'warn',
    tag: 'roof', colors: ['dark red'], when: isRoof }),
  materialTakes({ id: 'M11', text: 'Coins and metal in jewellery are usually gold 6,0, alternatively silver 3,2. Copper is terracotta 5,0.',
    severity: 'error', tag: 'precious-metal', colors: ['yellow', 'light blue-grey', 'terracotta'],
    when: (m) => has(m, 'precious-metal') || isCopper(m) }),
  materialTakes({ id: 'M4', text: 'Grass is light green.', severity: 'warn',
    tag: 'grass', colors: ['light green'], when: (m) => m.gr === 'grass' }),
  materialTakes({ id: 'M5', text: 'Trees are usually dark green. Palms are the exception: their fronds are light green.',
    severity: 'warn', tag: 'tree', colors: ['dark green'],
    when: (m) => m.gr === 'trees' && !m.name.includes('palm') }),
  materialTakes({ id: 'M20', text: 'Stone (worked stone: walls, bricks, floors) is taupe 14,3, blue-grey 6,1, or light grey 15,3.',
    severity: 'warn', tag: 'stone', colors: ['taupe', 'blue-grey', 'light grey'] }),
  materialTakes({ id: 'M21', text: 'Rocks are light grey 15,3, secondarily taupe 14,3.',
    severity: 'warn', tag: 'rock', colors: ['light grey', 'taupe'] }),
  // Sand and dirt, not everything on the ground: the soil tag carries the rule, so a
  // grass patch (flora on the ground) and the laid and raw stone stay out of it.
  materialTakes({ id: 'M22', text: 'Sand and dirt are taupe 14,3, khaki 14,0, or salmon 13,0.',
    severity: 'warn', tag: 'soil', colors: ['taupe', 'khaki', 'salmon'] }),
  materialTakes({ id: 'M30', text: 'Food is naturalistic — off-white, khaki 14,0, salmon 13,0, terracotta 5,0, dark red 8,0 or taupe 14,3; cheese is the one yellow 6,0.',
    severity: 'warn', tag: 'food',
    colors: ['off-white', 'khaki', 'salmon', 'terracotta', 'dark red', 'taupe', 'yellow'] }),
  materialTakes({ id: 'M24', text: 'Light: flames and glow are yellow 6,0; candles and lampshades are off-white 5,2.',
    severity: 'warn', tag: 'light', colors: ['yellow', 'off-white'],
    when: (m) => has(m, 'light', 'candle') }),
  materialTakes({ id: 'M14', text: 'Rope is wood light 0,0 or khaki 14,0.', severity: 'error',
    tag: 'rope', colors: ['wood light', 'khaki'] }),
  materialTakes({ id: 'M26', text: 'Fauna use naturalistic colours — off-white, salmon, taupe, khaki; fish may also be blue 4,2 or light blue-grey 3,2.',
    severity: 'warn', tag: 'fauna', colors: ['off-white', 'salmon', 'taupe', 'khaki', 'blue', 'light blue-grey'],
    when: (m) => has(m, 'fauna') }),

  // Colour -> material, the C block. Appendix A says "only" throughout it.
  // Rule M31: the liquid in a flask takes its own colour, so `liquid` stands beside the
  // materials in every band a potion can be. The flask and its stopper are not exempt —
  // they carry glass and cork, and those rules still have to answer for their own bands.
  bandOnlyFor({ id: 'C10', text: 'Blue 4,2 is used sparingly: fish (rule M26) and otherwise only minor details or accents.',
    severity: 'warn', color: 'blue', tags: ['fauna', 'liquid'], accent: true }),
  bandOnlyFor({ id: 'C9', text: 'Light green is only used for flora, and very minor details or accents.',
    severity: 'error', color: 'light green', tags: ['flora', 'foliage', 'liquid'], accent: true }),
  // Read literally: the rule forbids terracotta on timber, and names copper (R) and
  // ceramics as what may carry it. It says nothing about other materials.
  bandOnlyFor({ id: 'C3', text: 'Terracotta is not used for timber (copper, rule M11, is the exception outside ceramics).',
    severity: 'warn', color: 'terracotta', tags: ['ceramic', 'metal', 'precious-metal'],
    unless: (m) => !has(m, 'timber', 'bark') }),
  // M30 names cheese as the one yellow food, and the cheese wedge is the only model
  // the food tag brings in here. The coins-jewelry and lights groups carry the other
  // half of the rule's own wording: a gold-trimmed chest and a street lamp are the
  // thing the band is for, whatever material tag they happen to hold.
  bandOnlyFor({ id: 'C6', text: 'Yellow is usually only used for coins, jewellery, light, or fire.',
    severity: 'warn', color: 'yellow', tags: ['precious-metal', 'light', 'candle', 'liquid'],
    groups: ['coins-jewelry', 'lights'],
    unless: (m) => has(m, 'food') && m.name.includes('cheese') }),
  bandOnlyFor({ id: 'C5', text: 'Dark grey 10,0 is only used for cast iron, stone, and wicks.',
    severity: 'warn', color: 'dark grey', tags: ['metal', 'stone', 'candle'] }),
  bandOnlyFor({ id: 'C7', text: 'Dark red is only used for ceramics, glass, roofs, and very minor details or accents.',
    severity: 'warn', color: 'dark red', tags: ['ceramic', 'glass', 'liquid'], accent: true, unless: isRoof }),
  bandOnlyFor({ id: 'C8', text: 'Dark green is only used for foliage, glass, and very minor details or accents.',
    severity: 'error', color: 'dark green', tags: ['foliage', 'glass', 'liquid'], accent: true }),
  bandOnlyFor({ id: 'C2', text: 'Darkest brown is only used for bark and leather.',
    severity: 'warn', color: 'bark', tags: ['bark', 'leather'] }),
  // "Lighter browns" is the light and middle lane of rule G1; rule M14 puts rope on
  // the light lane too, so rope is not a violation here.
  bandOnlyFor({ id: 'C1-light', text: 'Lighter browns are only used for timber.',
    severity: 'warn', color: 'wood light', tags: ['timber', 'rope'] }),
  bandOnlyFor({ id: 'C1-middle', text: 'Lighter browns are only used for timber.',
    severity: 'warn', color: 'wood middle', tags: ['timber', 'textile'] }),
  bandOnlyFor({ id: 'C4', text: 'Light grey 15,3 is only used for metal, stone, and rock.',
    severity: 'warn', color: 'light grey', tags: ['metal', 'precious-metal', 'stone', 'rock'] }),

  // Counting, the N block. `mat` in catalog.json is the glTF material count and is 1 for all but
  // 25 models, so "materials" here is the material tags — the thing the model is
  // made of, which is what Appendix A is talking about.
  // N1. What stands in for a material depends on the group. Flowers, grass and
  // plants are carried by the flora tag and ocean by fauna — those groups have no
  // material of their own in tags.json and Appendix A gives them none, so the tag
  // is what there is to check. Everywhere else it has to be a material.
  // The stand-in is a fallback, not a replacement: the ground group holds the grass
  // patches beside the mountains, paths and sand, which carry rock, stone and soil.
  { id: 'N1', text: 'A model usually has at least one material.', severity: 'warn',
    check: (m) => {
      if (materials(m).length) return null;
      const stand_in = STANDS_IN_FOR_MATERIAL[m.gr];
      if (!stand_in) return `has no material tag (group ${m.gr})`;
      return has(m, stand_in) ? null : `group ${m.gr} but no ${stand_in} tag`;
    } },
  { id: 'N2', text: 'A model usually uses equal or more color bands than materials.', severity: 'error',
    check: (m) => {
      const n = materials(m).length;
      if (!n || m.colors.length >= n) return null;
      return `${m.colors.length} band(s) for ${n} materials (${materials(m).join(', ')})`;
    } },
  { id: 'N3', text: 'A model usually does not use more than twice as many color bands than materials.',
    severity: 'warn',
    check: (m) => {
      const n = materials(m).length;
      if (!n || m.colors.length <= 2 * n) return null;
      return `${m.colors.length} bands for ${n} material(s) (${materials(m).join(', ')})`;
    } },
  // N4. The ceiling of rule N4, counted in bands and not in entries of `colors`:
  // rule M17 makes the clear glass a material of its own rather than a band, so a
  // model does not spend part of its ceiling on having windows. N5 says how a model
  // over the ceiling is brought under, which is a method and not a measurement.
  { id: 'N4', text: 'A model uses at most eight colour bands in the characters group, six elsewhere.',
    severity: 'warn', alsoSpecial: true,
    check: (m) => {
      const bands = m.colors.filter((hex) => hex !== CLEAR).length;
      const ceiling = m.gr === 'characters' ? 8 : 6;
      if (bands <= ceiling) return null;
      return `${bands} bands, ceiling ${ceiling} (group ${m.gr})`;
    } },

  // M3. Dark green is the tree band; the small flora takes light green. No accent
  // escape here — the rule is about which green these groups are drawn in, and the
  // stems and leaves it covers are not a minor detail.
  { id: 'M3', text: 'Flowers, grass and plants do not use dark green: that band is for trees and foliage, their green is light green.',
    severity: 'warn',
    check: (m) => {
      if (!['flowers', 'grass', 'plants'].includes(m.gr)) return null;
      if (!uses(m, band('dark green'))) return null;
      return `group ${m.gr} uses dark green 1,1`;
    } },
];

// Report in the order of the guide: the M block, then C, then N, each by number.
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
// Assemblies are scenes built from other catalogued models — a decorated barrel is
// the barrel plus what stands on it. Their colours are the sum of their parts and
// every part is linted on its own, so linting the assembly again only reports the
// same colour twice, against a material list that is the union of everything in it.
const SKIP_GROUPS = ['assemblies'];

const inCatalog = catalog.models
  .filter((m) => m.colors?.length)
  .filter((m) => !SKIP_GROUPS.includes(m.gr))
  .filter((m) => !kitFilter || m.kit === kitFilter);

const models = inCatalog
  // Rule S1: a model the PO has approved as an exception is not linted at all.
  .filter((m) => !m.tags?.includes('special'))
  .filter((m) => !isOceanFauna(m));

// Rule N4 is the one rule of the appendix that `special` does not switch off, and
// it says why: special excuses a model from being told which colour a material
// takes, not from being told how many it may spend. Ocean fauna are out of the C
// and M blocks for want of a material, which is no reason to let them off a count.
// A rule opts in with `alsoSpecial`; everything else keeps the narrower list.
const modelsWithSpecial = inCatalog;

const unknown = new Set();
for (const m of models) for (const hex of m.colors) if (!bandName[hex]) unknown.add(hex);

const findings = [];
for (const rule of RULES) {
  if (ruleFilter && rule.id !== ruleFilter) continue;
  if (severityFilter && rule.severity !== severityFilter) continue;
  for (const m of rule.alsoSpecial ? modelsWithSpecial : models) {
    const detail = rule.check(m);
    if (detail) findings.push({ rule: rule.id, severity: rule.severity, model: `${m.kit}/${m.name}`, detail });
  }
}

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
