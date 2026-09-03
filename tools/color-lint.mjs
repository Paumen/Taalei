// Checks the catalogue against the material and colour rules of Appendix A in
// docs/asset_style_guide.md: does every model take the colour bands its materials
// are allowed, and does every band it uses belong to a material it carries.
//
//   node tools/color-lint.mjs [--kit dungeon] [--rule AH] [--severity error]
//                             [--limit 8] [--rules] [--json path.json]
//
// Reads catalog/catalog.json — `colors` there is already resolved from the UVs
// against kits/colormap.png by build-catalog.mjs, and `tags` are the manually set
// material tags from catalog/tags.json. Those tags are exhaustive: every material
// present in a model carries its tag, so a band without its material is a finding
// and not a gap in the tagging.
//
// Two things Appendix A states that this tool cannot see. The lane and gradient
// rules (M, N, O, P, Y) live in the UVs of the individual triangles and in the
// source model, not in the catalogue — they need their own tool. And the rules
// that ask what an object looks like (A, I, L, S, U, AF, AG, AR) are a judgement,
// not a measurement.
//
// SEVERITY is the table below and nothing else: `error` fails the run, `warn`
// only prints. Appendix A says "only" for AH-AQ and "usually" for most of the
// rest, so the wording is written out per rule — flipping one is a single word.
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

// Rule J: the one transparent glass colour is a material of its own, not a band.
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

// The accent approximation. Rules AH, AI, AM and AN allow a band as a very minor
// detail; the catalogue records that a band is used, not how much of the model it
// covers. Stand-in: small models that mix at least two bands, and busy models of
// any size. Both are shapes where one band is unlikely to be a whole surface.
const MAX_ACCENT_SIZE = 0.5;
const BUSY = 4;
const looksLikeAccent = (m) =>
  (Math.max(...m.wdh) <= MAX_ACCENT_SIZE && m.colors.length >= 2) || m.colors.length >= BUSY;

const MATERIAL_TAGS = ['timber', 'bark', 'metal', 'paper', 'stone', 'rock', 'textile',
  'leather', 'ceramic', 'bone', 'candle', 'glass', 'rope', 'precious-metal'];

const has = (m, ...tags) => tags.some((t) => m.tags?.includes(t));
const uses = (m, ...hexes) => hexes.some((h) => m.colors?.includes(h));
const materials = (m) => MATERIAL_TAGS.filter((t) => m.tags?.includes(t));
const isRoof = (m) => m.name.startsWith('roof') || m.name.includes('-roof');

// A band is only used for the materials listed. Fires when the model uses the band
// and carries none of them. `accent` exempts the models the approximation above
// reads as a detail; `unless` is an extra escape a rule spells out itself.
const bandOnlyFor = ({ id, text, severity, color, tags, accent = false, unless = null }) => ({
  id, text, severity,
  check: (m) => {
    if (!uses(m, band(color))) return null;
    if (has(m, ...tags)) return null;
    if (unless?.(m)) return null;
    if (accent && looksLikeAccent(m)) return null;
    return `uses ${color} ${BANDS[color]} but carries ${materials(m).length ? materials(m).join(', ') : 'no material'}`;
  },
});

// A material takes one of these bands. Fires when the model carries the material
// and uses none of them — the model has to get that material's colour somewhere.
const materialTakes = ({ id, text, severity, tag, colors, when = null }) => ({
  id, text, severity,
  check: (m) => {
    if (when ? !when(m) : !has(m, tag)) return null;
    const allowed = colors.map((c) => (c === 'clear glass' ? CLEAR : band(c)));
    if (uses(m, ...allowed)) return null;
    return `is ${tag ?? id} but uses ${m.colors.map((h) => bandName[h] ?? h).join(', ')} — none of ${colors.join(', ')}`;
  },
});

const RULES = [
  // Material -> colour. Appendix A says "are" for C, D and Q and "usually" for the
  // rest of this block; the severity column is where that distinction lands.
  materialTakes({ id: 'C', text: 'Bones and skulls are off-white.', severity: 'warn',
    tag: 'bone', colors: ['off-white'] }),
  materialTakes({ id: 'D', text: 'Paper is off-white.', severity: 'warn',
    tag: 'paper', colors: ['off-white'] }),
  materialTakes({ id: 'E', text: 'Ceramics are usually terracotta, off-white, taupe, or dark red.',
    severity: 'warn', tag: 'ceramic', colors: ['terracotta', 'off-white', 'taupe', 'dark red'] }),
  materialTakes({ id: 'FG', text: 'Metal is usually light grey 15,3. Steel/cast iron can be dark grey 10,0.',
    severity: 'warn', tag: 'metal', colors: ['light grey', 'dark grey'] }),
  materialTakes({ id: 'H', text: 'Textile: off-white, salmon 13,0, khaki 14,0 or brown 1,0.',
    severity: 'warn', tag: 'textile', colors: ['off-white', 'salmon', 'khaki', 'wood middle'] }),
  materialTakes({ id: 'J', text: 'Glass is a special own material: transparent, or dark green or dark red.',
    severity: 'warn', tag: 'glass', colors: ['clear glass', 'dark green', 'dark red'] }),
  materialTakes({ id: 'K', text: 'Roofs are usually dark red.', severity: 'warn',
    tag: 'roof', colors: ['dark red'], when: isRoof }),
  materialTakes({ id: 'R', text: 'Coins and metal in jewellery are usually gold 6,0, alternatively silver 3,2. Copper is terracotta 5,0.',
    severity: 'warn', tag: 'precious-metal', colors: ['yellow', 'light blue-grey', 'terracotta'] }),
  materialTakes({ id: 'W', text: 'Grass is light green.', severity: 'warn',
    tag: 'grass', colors: ['light green'], when: (m) => m.gr === 'grass' }),
  materialTakes({ id: 'X', text: 'Trees are usually dark green.', severity: 'warn',
    tag: 'tree', colors: ['dark green'], when: (m) => m.gr === 'trees' }),
  materialTakes({ id: 'Z', text: 'Stone (worked stone: walls, bricks, floors) is taupe 14,3, blue-grey 6,1, or light grey 15,3.',
    severity: 'warn', tag: 'stone', colors: ['taupe', 'blue-grey', 'light grey'] }),
  materialTakes({ id: 'AA', text: 'Rocks are light grey 15,3, secondarily taupe 14,3.',
    severity: 'warn', tag: 'rock', colors: ['light grey', 'taupe'] }),
  materialTakes({ id: 'AB', text: 'Sand and dirt are taupe 14,3, khaki 14,0, or salmon 13,0.',
    severity: 'warn', tag: 'ground', colors: ['taupe', 'khaki', 'salmon'],
    when: (m) => m.gr === 'ground' && !has(m, 'stone', 'rock') }),
  materialTakes({ id: 'AC', text: 'Light: flames and glow are yellow 6,0; candles and lampshades are off-white 5,2.',
    severity: 'warn', tag: 'light', colors: ['yellow', 'off-white'],
    when: (m) => has(m, 'light', 'candle') }),
  materialTakes({ id: 'AD', text: 'Rope is wood light 0,0 or khaki 14,0.', severity: 'warn',
    tag: 'rope', colors: ['wood light', 'khaki'] }),
  materialTakes({ id: 'AE', text: 'Fauna use naturalistic colours — off-white, salmon, taupe, khaki; fish may also be blue 4,2 or light blue-grey 3,2.',
    severity: 'warn', tag: 'fauna', colors: ['off-white', 'salmon', 'taupe', 'khaki', 'blue', 'light blue-grey'],
    when: (m) => has(m, 'fauna') }),

  // Colour -> material. Appendix A says "only" throughout this block.
  bandOnlyFor({ id: 'AH', text: 'Blue 4,2 is used sparingly: fish (rule AE) and otherwise only minor details or accents.',
    severity: 'warn', color: 'blue', tags: ['fauna'], accent: true }),
  bandOnlyFor({ id: 'AI', text: 'Light green is only used for flora, and very minor details or accents.',
    severity: 'warn', color: 'light green', tags: ['flora', 'foliage'], accent: true }),
  // Read literally: the rule forbids terracotta on timber, and names copper (R) and
  // ceramics as what may carry it. It says nothing about other materials.
  bandOnlyFor({ id: 'AJ', text: 'Terracotta is not used for timber (copper, rule R, is the exception outside ceramics).',
    severity: 'warn', color: 'terracotta', tags: ['ceramic', 'metal', 'precious-metal'],
    unless: (m) => !has(m, 'timber', 'bark') }),
  bandOnlyFor({ id: 'AK', text: 'Yellow is usually only used for coins, jewellery, light, or fire.',
    severity: 'warn', color: 'yellow', tags: ['precious-metal', 'light', 'candle'] }),
  bandOnlyFor({ id: 'AL', text: 'Dark grey 10,0 is only used for cast iron, stone, and wicks.',
    severity: 'warn', color: 'dark grey', tags: ['metal', 'stone', 'candle'] }),
  bandOnlyFor({ id: 'AM', text: 'Dark red is only used for ceramics, glass, roofs, and very minor details or accents.',
    severity: 'warn', color: 'dark red', tags: ['ceramic', 'glass'], accent: true, unless: isRoof }),
  bandOnlyFor({ id: 'AN', text: 'Dark green is only used for foliage, glass, and very minor details or accents.',
    severity: 'warn', color: 'dark green', tags: ['foliage', 'glass'], accent: true }),
  bandOnlyFor({ id: 'AO', text: 'Darkest brown is only used for bark and leather.',
    severity: 'warn', color: 'bark', tags: ['bark', 'leather'] }),
  // "Lighter browns" is the light and middle lane of rule M; rule AD puts rope on
  // the light lane too, so rope is not a violation here.
  bandOnlyFor({ id: 'AP-light', text: 'Lighter browns are only used for timber.',
    severity: 'warn', color: 'wood light', tags: ['timber', 'rope'] }),
  bandOnlyFor({ id: 'AP-middle', text: 'Lighter browns are only used for timber.',
    severity: 'warn', color: 'wood middle', tags: ['timber', 'textile'] }),
  bandOnlyFor({ id: 'AQ', text: 'Light grey 15,3 is only used for metal, stone, and rock.',
    severity: 'warn', color: 'light grey', tags: ['metal', 'precious-metal', 'stone', 'rock'] }),

  // Counting. `mat` in catalog.json is the glTF material count and is 1 for all but
  // 25 models, so "materials" here is the material tags — the thing the model is
  // made of, which is what Appendix A is talking about.
  { id: 'AS', text: 'A model usually has at least one material.', severity: 'warn',
    check: (m) => (materials(m).length === 0 ? `has no material tag (group ${m.gr})` : null) },
  { id: 'AT', text: 'A model usually uses equal or more color bands than materials.', severity: 'warn',
    check: (m) => {
      const n = materials(m).length;
      if (!n || m.colors.length >= n) return null;
      return `${m.colors.length} band(s) for ${n} materials (${materials(m).join(', ')})`;
    } },
  { id: 'AU', text: 'A model usually does not use more than twice as many color bands than materials.',
    severity: 'warn',
    check: (m) => {
      const n = materials(m).length;
      if (!n || m.colors.length <= 2 * n) return null;
      return `${m.colors.length} bands for ${n} material(s) (${materials(m).join(', ')})`;
    } },
];

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
const models = catalog.models
  .filter((m) => m.colors?.length)
  .filter((m) => !kitFilter || m.kit === kitFilter);

const unknown = new Set();
for (const m of models) for (const hex of m.colors) if (!bandName[hex]) unknown.add(hex);

const findings = [];
for (const rule of RULES) {
  if (ruleFilter && rule.id !== ruleFilter) continue;
  if (severityFilter && rule.severity !== severityFilter) continue;
  for (const m of models) {
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
