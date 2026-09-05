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
// a judgement, not a measurement. Rules M34 and M37 and the first half of M27 name
// a part of a model — a buckle, a book cover, the band round a barrel — and the
// catalogue records a model's bands, not which triangle carries which; what is
// checkable of them is checked (a container's metal has to be light grey, a book has
// to hold one of the cover bands), the rest is a judgement too.
//
// SEVERITY is the table below and nothing else: `error` fails the run, `warn`
// only prints. It is now a ratchet: a rule with nothing left to report is an error,
// so the catalogue cannot drift back across a line it has already been brought over.
// That is a stricter reading than Appendix A's own wording — the appendix says "only"
// through the C block but "usually" for much of the M block, and a rule that says
// "usually" and fails the run is the tool holding a line the prose leaves open. The
// one that still prints is the last of the N block's counts: N3 has findings, and
// dropping a rule back to `warn` because a new model trips it is the one move this
// ratchet forbids — the model is what has to change.
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
// `light` is one too, for the same reason: rule M24 gives the flame and the glow a
// colour of their own, so a lit candle counts its flame beside its wax rather than
// spending a second band on one material.
const MATERIAL_TAGS = ['timber', 'bark', 'metal', 'paper', 'stone', 'rock', 'soil', 'textile',
  'leather', 'ceramic', 'bone', 'food', 'wax', 'glass', 'rope', 'cork', 'precious-metal',
  'gemstone', 'foliage', 'liquid', 'light', 'special'];

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

// Rule M27's containers and rule M37's books, both read off the name: nothing in the
// catalogue records that a model is a barrel or that it has a cover. `book` catches the
// spellbook and the journal; a scroll, a map and loose parchment have no cover and stay
// out, and so does the shelf of books, which is furniture.
const isContainer = (m) =>
  /(^|-)(barrel|chest|bucket|trunk|keg|crate|box|boxes|crates)(s|-|$)/.test(m.name);
const isBook = (m) => /(^|-)(book|spellbook|journal)(-|$)/.test(m.name) && has(m, 'paper');

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
  // Material -> colour, the M block, in the order of the appendix.
  materialTakes({ id: 'M1', text: 'Trees are dark green.', severity: 'error',
    tag: 'tree', colors: ['dark green'],
    when: (m) => m.gr === 'trees' && !m.name.includes('palm') }),
  materialTakes({ id: 'M3', text: 'Grass is light green.', severity: 'error',
    tag: 'grass', colors: ['light green'], when: (m) => m.gr === 'grass' }),
  materialTakes({ id: 'M8', text: 'Worked stone — walls, bricks, floors — is taupe 14,3, blue-grey 6,1 or light grey 15,3.',
    severity: 'error', tag: 'stone', colors: ['taupe', 'blue-grey', 'light grey'] }),
  materialTakes({ id: 'M9', text: 'Rocks are light grey 15,3, secondarily taupe 14,3.',
    severity: 'error', tag: 'rock', colors: ['light grey', 'taupe'] }),
  // Sand and dirt, not everything on the ground: the soil tag carries the rule, so a
  // grass patch (flora on the ground) and the laid and raw stone stay out of it.
  materialTakes({ id: 'M10', text: 'Sand and dirt are taupe 14,3.', severity: 'error',
    tag: 'soil', colors: ['taupe'] }),
  // Copper (rule M14) and keys (rule M15) are metal too, but the appendix gives each
  // its own colours; they are checked by those rules below instead.
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
  // Rule M17, the half that is a measurement: a container carrying metal has to take
  // light grey for it. That the bands are metal at all — and not timber or taupe — is
  // about a part of the model the catalogue cannot see.
  materialTakes({ id: 'M17', text: 'The bands on barrels, chests, buckets, trunks, kegs, crates and boxes are metal, light grey 15,3.',
    severity: 'error', tag: 'metal', colors: ['light grey'],
    when: (m) => isContainer(m) && has(m, 'metal') }),
  materialTakes({ id: 'M18', text: 'Textile is off-white, taupe 14,3, brown 1,0, dark green 1,1 or dark red 8,0.',
    severity: 'error', tag: 'textile',
    colors: ['off-white', 'taupe', 'wood middle', 'dark green', 'dark red'] }),
  // Rule M20 is the colour half of the leather exception: leather takes the bark
  // lane, with or without a bark tag, which is why the tag is not an escape here.
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
  // Rule M28 does not let a potion take any band it likes: the three below are the
  // liquid colours, and the C block names no other material on them.
  materialTakes({ id: 'M28', text: 'A liquid is dark red 8,0, dark green 1,1 or blue 4,2.',
    severity: 'error', tag: 'liquid', colors: ['dark red', 'dark green', 'blue'] }),
  materialTakes({ id: 'M29', text: 'Bones and skulls are off-white.', severity: 'error',
    tag: 'bone', colors: ['off-white'] }),
  materialTakes({ id: 'M30', text: 'Paper is off-white.', severity: 'error',
    tag: 'paper', colors: ['off-white'] }),
  materialTakes({ id: 'M32', text: 'Fauna are naturalistic: off-white, salmon, taupe. Fish may also be blue 4,2 or light blue-grey 3,2.',
    severity: 'error', tag: 'fauna', colors: ['off-white', 'salmon', 'taupe', 'blue', 'light blue-grey'],
    when: (m) => has(m, 'fauna') }),
  materialTakes({ id: 'M33-M34', text: 'Flames and glow are yellow 6,0. Candle wax and lampshades are off-white 5,2.',
    severity: 'error', tag: 'light', colors: ['yellow', 'off-white'],
    when: (m) => has(m, 'light', 'wax') }),
  // Rule M37: the cover bands. A book has to hold at least one of them; which triangles
  // are the cover and which the pages is not in the catalogue. Scrolls and maps are
  // paper all through and carry no cover, so the name is the condition and not the group.
  materialTakes({ id: 'M37', text: 'Book covers are bark 2,0, dark red 8,0, dark green 1,1 or blue-grey 6,1.',
    severity: 'error', tag: 'book', colors: ['bark', 'dark red', 'dark green', 'blue-grey'],
    when: isBook }),
  materialTakes({ id: 'M38', text: 'Roofs are ceramic, dark red.', severity: 'error',
    tag: 'roof', colors: ['dark red'], when: isRoof }),

  // Colour -> material, the C block, in the order of the band list. C2 (blue-grey)
  // and C3 (light blue-grey) have never been checked here and still are not.
  bandOnlyFor({ id: 'C1', text: 'Light grey 15,3: metal, stone and rock only.',
    severity: 'error', color: 'light grey', tags: ['metal', 'precious-metal', 'stone', 'rock'] }),
  bandOnlyFor({ id: 'C4', text: 'Blue 4,2: sparingly, minor accents only.',
    severity: 'error', color: 'blue', tags: [], accent: true }),
  bandOnlyFor({ id: 'C5', text: 'Yellow: precious metal, light and fire.',
    severity: 'error', color: 'yellow', tags: ['precious-metal', 'light', 'wax'],
    groups: ['coins-jewelry', 'lights'] }),
  bandOnlyFor({ id: 'C6', text: 'Dark red: ceramics, glass, roofs, minor accents.',
    severity: 'error', color: 'dark red', tags: ['ceramic', 'glass'],
    accent: true, unless: isRoof }),
  bandOnlyFor({ id: 'C7', text: 'Dark green: foliage, glass, and minor accents.',
    severity: 'error', color: 'dark green', tags: ['foliage', 'glass'], accent: true }),
  // Rule C8 has no accent escape: light green is nature and nothing else. Grass and
  // weeds growing on an object or a structure are in — they carry the flora tag, which
  // is the whole of what the band is for — and a green that grows nothing is a finding
  // whatever its size.
  bandOnlyFor({ id: 'C8', text: 'Light green: nature only — flora, including grass and weed accents growing on objects and structures.',
    severity: 'error', color: 'light green', tags: ['flora'] }),
  // "Lighter browns" is the light and middle lane of the wood ladder. Rope used to be
  // excused here — it sat on the light lane too — but rule M22 now sends rope to taupe,
  // so timber is the only material left that reaches this band. Textile reaches the
  // middle lane by rule M18's brown.
  bandOnlyFor({ id: 'C9-light', text: 'Lighter browns: timber only.',
    severity: 'error', color: 'wood light', tags: ['timber'] }),
  bandOnlyFor({ id: 'C9-middle', text: 'Lighter browns: timber only.',
    severity: 'error', color: 'wood middle', tags: ['timber', 'textile'] }),
  bandOnlyFor({ id: 'C10', text: 'Darkest brown: bark and leather only.',
    severity: 'error', color: 'bark', tags: ['bark', 'leather'] }),

  // Counting, the N block. `mat` in catalog.json is the glTF material count and is 1 for all but
  // 25 models, so "materials" here is the material tags — the thing the model is
  // made of, which is what the appendix is talking about.
  // N1. What stands in for a material depends on the group. Flowers, grass and
  // plants are carried by the flora tag and ocean by fauna — those groups have no
  // material of their own in tags.json and the appendix gives them none, so the tag
  // is what there is to check. Everywhere else it has to be a material.
  { id: 'N1', text: 'A model has at least one material.', severity: 'error',
    check: (m) => {
      if (materials(m).length) return null;
      const stand_in = STANDS_IN_FOR_MATERIAL[m.gr];
      if (!stand_in) return `has no material tag (group ${m.gr})`;
      return has(m, stand_in) ? null : `group ${m.gr} but no ${stand_in} tag`;
    } },
  { id: 'N2', text: 'A model uses at least as many bands as it has materials.', severity: 'error',
    check: (m) => {
      const n = materials(m).length;
      if (!n || m.colors.length >= n) return null;
      return `${m.colors.length} band(s) for ${n} materials (${materials(m).join(', ')})`;
    } },
  { id: 'N3', text: 'A model uses at most twice as many bands as materials.',
    severity: 'warn',
    check: (m) => {
      const n = materials(m).length;
      if (!n || m.colors.length <= 2 * n) return null;
      return `${m.colors.length} bands for ${n} material(s) (${materials(m).join(', ')})`;
    } },
  // N4. The ceiling, counted in bands and not in entries of `colors`: rule M24 makes
  // the clear glass a material of its own rather than a band, so a model does not
  // spend part of its ceiling on having windows.
  { id: 'N4', text: 'Ceiling: 7 bands for a character, 5 for anything else.',
    severity: 'error', noJoker: true,
    check: (m) => {
      const bands = m.colors.filter((hex) => hex !== CLEAR).length;
      const ceiling = m.gr === 'characters' ? 7 : 5;
      if (bands <= ceiling) return null;
      return `${bands} bands, ceiling ${ceiling} (group ${m.gr})`;
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

// Rule S1: `special` is a joker, not a blanket exemption, so a model carrying it is
// linted like any other and one finding is forgiven afterwards.
const models = inCatalog.filter((m) => !isOceanFauna(m));

// Ocean fauna are out of the C and M blocks for want of a material, which is no
// reason to let them off a count. A rule opts in with `noJoker`; rule N4 is the one
// that does, since S3 says the joker does not lift the ceiling.
const counted = inCatalog;

const unknown = new Set();
for (const m of models) for (const hex of m.colors) if (!bandName[hex]) unknown.add(hex);

let findings = [];
for (const rule of RULES) {
  if (ruleFilter && rule.id !== ruleFilter) continue;
  if (severityFilter && rule.severity !== severityFilter) continue;
  for (const m of rule.noJoker ? counted : models) {
    const detail = rule.check(m);
    if (detail) findings.push({ rule: rule.id, severity: rule.severity, model: `${m.kit}/${m.name}`, detail, joker: !rule.noJoker && (m.tags?.includes('special') ?? false) });
  }
}

// Rules S1 and S2: the joker covers one band under one rule and is then spent. The
// first finding a `special` model raises is the one it pays for — rule order is the
// appendix's own — and everything after it stands.
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
