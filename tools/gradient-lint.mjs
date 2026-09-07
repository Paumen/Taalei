import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, readAccessor } from '../catalog/tools/glb.mjs';
import { readPng } from '../catalog/tools/png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLUMNS = 16;
const ROWS = 4;

const WOOD = { '0,0': 'wood light', '1,0': 'wood middle', '2,0': 'wood dark', '3,0': 'bark' };
const CELL = { '0,0': 0, '1,0': 1, '2,0': 2, '3,0': 3 };

const SPREAD_MIN_TRIANGLES = 8;

const EDGE = 0.001;

const RULES = {
  G2: { severity: 'warn', window: [0.71, 0.78], text: 'planks and end grain (wood light 0,0) sit at mean L 0.71-0.78' },
  G8: { severity: 'warn', window: [0.61, 0.67], text: 'worked planks (wood middle 1,0) sit at mean L 0.61-0.67' },
  G3: { severity: 'warn', window: [0.49, 0.55], text: 'beams and structure (wood dark 2,0) sit at mean L 0.49-0.55' },
  G4: { severity: 'warn', window: [0.406, 0.425], text: 'bark sits at mean L 0.406-0.425' },
  G5: { severity: 'warn', window: [0.425, 0.46], text: 'leather sits at mean L 0.425-0.46' },
  G7: { severity: 'warn', spread: 0.03, text: 'every wood band spreads over at least 0.03 L' },
};

function parseArgs(argv) {
  const o = { kit: null, group: null, rule: null, limit: 6, rules: false, strict: false, json: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--rules') o.rules = true;
    else if (a === '--strict') o.strict = true;
    else if (a === '--kit') o.kit = argv[++i];
    else if (a === '--group') o.group = argv[++i];
    else if (a === '--rule') o.rule = argv[++i].toUpperCase();
    else if (a === '--limit') o.limit = Number(argv[++i]);
    else if (a === '--json') o.json = argv[++i];
    else { console.error(`unknown flag: ${a}`); process.exit(2); }
  }
  return o;
}

const toLinear = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);

function lightness(r, g, b) {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a, b) {
  const r = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
      r[column * 4 + row] = sum;
    }
  }
  return r;
}

function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const scale = node.scale ?? [1, 1, 1];
  const m = [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ];
  for (let column = 0; column < 3; column++) {
    for (let row = 0; row < 3; row++) m[column * 4 + row] *= scale[column];
  }
  return [...m.slice(0, 12), tx, ty, tz, 1];
}

const point = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

const atlases = new Map();
function readAtlas(path) {
  if (!atlases.has(path)) atlases.set(path, readPng(path));
  return atlases.get(path);
}

function readBands(path, dir) {
  const glb = readGlb(path);
  const { json } = glb;
  const nodes = json.nodes ?? [];
  const world = new Array(nodes.length).fill(null);
  const walk = (index, parent) => {
    if (world[index]) return;
    const node = nodes[index];
    if (!node) return;
    world[index] = multiply(parent, nodeMatrix(node));
    for (const child of node.children ?? []) walk(child, world[index]);
  };
  for (const index of json.scenes?.[json.scene ?? 0]?.nodes ?? []) walk(index, IDENTITY);

  const bands = new Map();
  let totalArea = 0;

  nodes.forEach((node, index) => {
    if (node.mesh === undefined || !world[index]) return;
    for (const prim of json.meshes[node.mesh].primitives ?? []) {
      if ((prim.mode ?? 4) !== 4) continue;
      const position = readAccessor(glb, prim.attributes.POSITION);
      const vertices = new Array(position.count);
      for (let v = 0; v < position.count; v++) {
        vertices[v] = point(world[index], position.data[v * 3], position.data[v * 3 + 1], position.data[v * 3 + 2]);
      }
      const indices = prim.indices !== undefined ? readAccessor(glb, prim.indices) : null;
      const at = (i) => (indices ? indices.data[i] : i);
      const count = indices ? indices.count : position.count;

      const material = json.materials?.[prim.material];
      const texture = material?.pbrMetallicRoughness?.baseColorTexture?.index;
      const source = texture === undefined ? null : json.images?.[json.textures?.[texture]?.source]?.uri;
      const textured = source && prim.attributes?.TEXCOORD_0 !== undefined;
      const atlas = textured ? readAtlas(join(dir, decodeURIComponent(source))) : null;
      const uv = textured ? readAccessor(glb, prim.attributes.TEXCOORD_0) : null;

      for (let i = 0; i + 2 < count; i += 3) {
        const [a, b, c] = [vertices[at(i)], vertices[at(i + 1)], vertices[at(i + 2)]];
        const nx = (c[1] - b[1]) * (a[2] - b[2]) - (c[2] - b[2]) * (a[1] - b[1]);
        const ny = (c[2] - b[2]) * (a[0] - b[0]) - (c[0] - b[0]) * (a[2] - b[2]);
        const nz = (c[0] - b[0]) * (a[1] - b[1]) - (c[1] - b[1]) * (a[0] - b[0]);
        const area = Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
        totalArea += area;
        if (!atlas) continue;

        let u = 0;
        let v = 0;
        for (const k of [i, i + 1, i + 2]) {
          u += uv.data[at(k) * 2] / 3;
          v += uv.data[at(k) * 2 + 1] / 3;
        }
        const x = Math.min(Math.max(Math.floor(u * atlas.width), 0), atlas.width - 1);
        const y = Math.min(Math.max(Math.floor(v * atlas.height), 0), atlas.height - 1);
        const i4 = (y * atlas.width + x) * 4;
        if (atlas.pixels[i4] === 0 && atlas.pixels[i4 + 1] === 0 && atlas.pixels[i4 + 2] === 0) continue;

        const cellWidth = atlas.width / COLUMNS;
        const cellHeight = atlas.height / ROWS;
        const row = Math.floor(y / cellHeight);
        const lane = `${Math.floor(x / cellWidth)},${row}`;
        if (!(lane in WOOD)) continue;

        const p = (y - row * cellHeight) / cellHeight;
        if (!bands.has(lane)) bands.set(lane, { area: 0, weighted: 0, min: p, max: p, triangles: 0, atlas });
        const band = bands.get(lane);
        band.area += area;
        band.weighted += p * area;
        band.triangles++;
        if (p < band.min) band.min = p;
        if (p > band.max) band.max = p;
      }
    }
  });

  for (const band of bands.values()) {
    band.mean = band.area > 0 ? band.weighted / band.area : 0;
    band.share = totalArea > 0 ? band.area / totalArea : 0;
  }
  return bands;
}

function laneLightness(atlas, lane, p) {
  const [column, row] = lane.split(',').map(Number);
  const cellWidth = atlas.width / COLUMNS;
  const cellHeight = atlas.height / ROWS;
  const x = Math.floor(column * cellWidth + cellWidth / 2);
  const y = Math.min(Math.floor(row * cellHeight + p * cellHeight), Math.ceil((row + 1) * cellHeight) - 1);
  const i4 = (y * atlas.width + x) * 4;
  return lightness(atlas.pixels[i4], atlas.pixels[i4 + 1], atlas.pixels[i4 + 2]);
}

const options = parseArgs(process.argv.slice(2));

if (options.rules) {
  for (const [id, rule] of Object.entries(RULES)) console.log(`${id}  ${rule.severity.padEnd(5)}  ${rule.text}`);
  process.exit(0);
}

const catalog = JSON.parse(readFileSync(join(ROOT, 'catalog/catalog.json'), 'utf8'));
const findings = [];
const counted = { models: 0, bands: 0, skipped: 0 };

for (const model of catalog.models) {
  if (options.kit && model.kit !== options.kit) continue;
  if (options.group && model.gr !== options.group) continue;
  const dir = join(ROOT, 'kits/workfiles', model.kit);
  const path = join(dir, `${model.name}.glb`);
  if (!existsSync(path)) { counted.skipped++; continue; }

  let bands;
  try { bands = readBands(path, dir); } catch { counted.skipped++; continue; }
  if (bands.size === 0) continue;
  counted.models++;

  const id = `${model.kit}/${model.name}`;
  const tags = model.tags ?? [];
  const report = (rule, band, lane, detail) => {
    const L = laneLightness(band.atlas, lane, band.mean);
    findings.push({
      rule, model: id, lane, band: WOOD[lane], detail,
      mean: Math.round(band.mean * 100) / 100,
      spread: Math.round((band.max - band.min) * 100) / 100,
      lightness: Math.round(L * 1000) / 1000,
      share: Math.round(band.share * 100) / 100,
    });
  };

  for (const [lane, band] of bands) {
    counted.bands++;
    const cell = CELL[lane];
    const L = laneLightness(band.atlas, lane, band.mean);
    const spreadL = Math.abs(laneLightness(band.atlas, lane, band.min) - laneLightness(band.atlas, lane, band.max));

    let rule = null;
    if (cell === 0) rule = 'G2';
    else if (cell === 1) rule = 'G8';
    else if (cell === 2) rule = 'G3';
    else if (tags.includes('bark')) rule = 'G4';
    else if (tags.includes('leather')) rule = 'G5';

    if (rule) {
      const [low, high] = RULES[rule].window;
      if (L < low - EDGE || L > high + EDGE) {
        const side = L > high ? 'too light' : 'too dark';
        report(rule, band, lane, `mean L ${L.toFixed(3)} outside ${low}-${high} — ${side}`);
      }
    }
    if (band.triangles >= SPREAD_MIN_TRIANGLES && spreadL < RULES.G7.spread) {
      report('G7', band, lane, `spread ${spreadL.toFixed(3)} L over ${band.triangles} triangles — no baked shading`);
    }
  }
}

const wanted = options.rule ? findings.filter((f) => f.rule === options.rule) : findings;
const byRule = new Map();
for (const f of wanted) {
  if (!byRule.has(f.rule)) byRule.set(f.rule, []);
  byRule.get(f.rule).push(f);
}

console.log(`${counted.models} models with wood, ${counted.bands} wood bands${counted.skipped ? `, ${counted.skipped} skipped` : ''}`);
for (const [rule, list] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${rule}  ${RULES[rule].severity}  ${RULES[rule].text}`);
  console.log(`  ${list.length} finding${list.length === 1 ? '' : 's'}`);
  for (const f of list.slice(0, options.limit)) {
    console.log(`    ${f.model.padEnd(44)} ${f.band.padEnd(12)} ${f.detail}  (L ${f.lightness.toFixed(3)}, ${Math.round(f.share * 100)}% of surface)`);
  }
  if (list.length > options.limit) console.log(`    … ${list.length - options.limit} more`);
}

const models = new Set(wanted.map((f) => f.model)).size;
console.log(`\n${wanted.length} findings on ${models} models`);

if (options.json) {
  writeFileSync(options.json, JSON.stringify({ counted, findings: wanted }, null, 2));
  console.log(`wrote ${options.json}`);
}

const failing = wanted.filter((f) => RULES[f.rule].severity === 'error');
if (failing.length || (options.strict && wanted.length)) process.exit(1);
