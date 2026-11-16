import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';

const HELP = `ceramic-shade.mjs [--move <band>=<band>,...] <workfile.glb> [...]

Shades the ceramic bands of a pot by facing: a face pointing up takes the top
of the band's range, a side the middle, a face pointing down the bottom. The
bands are the ones the model's ceramic tags name in catalog/build/catalog.json;
the ranges are ceramic.ranges in lint/variables.json. --move first moves a band
into another, as ivory=terracotta, and shades what it moved as well; several
moves happen at once, so sienna=ivory,ivory=sienna swaps the two.
Check with node lint/ceramic.mjs.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const json = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
const moveAt = args.indexOf('--move');
const moves = new Map(moveAt === -1 ? [] : args[moveAt + 1].split(',').map((pair) => pair.split('=')));
const files = args.filter((a) => a.endsWith('.glb'));

const MATERIALS = json('lint/materials.json');
const { ranges } = json('lint/variables.json').ceramic;
const { models } = json('catalog/build/catalog.json');
const bandOfTag = new Map();
(function walk(nodes) {
  for (const node of nodes) {
    if (node.id.startsWith('ceramic-')) bandOfTag.set(node.id, node.bands[0]);
    walk(node.children ?? []);
  }
})(MATERIALS.materials);
const cellOf = (band) => MATERIALS.bands[band].split(',').map(Number);
const bandOfCell = new Map(Object.keys(ranges).map((band) => [MATERIALS.bands[band], band]));
for (const band of moves.keys()) bandOfCell.set(MATERIALS.bands[band], band);

for (const file of files) {
  const path = resolve(file), kit = basename(dirname(path)), name = basename(path, '.glb');
  const model = models.find((m) => m.kit === kit && m.name === name);
  const tagged = new Set((model?.tags ?? []).filter((t) => bandOfTag.has(t)).map((t) => bandOfTag.get(t)));
  const glb = readGlb(path), bin = Buffer.from(glb.bin), world = worldMatrices(glb.json), seen = new Set();
  let shaded = 0;
  glb.json.nodes.forEach((node, ni) => {
    if (node.mesh === undefined) return;
    const w = world[ni];
    for (const p of glb.json.meshes[node.mesh].primitives) {
      const index = p.attributes.TEXCOORD_0;
      if (seen.has(index)) continue;
      seen.add(index);
      const accessor = glb.json.accessors[index], view = glb.json.bufferViews[accessor.bufferView];
      const at = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), stride = view.byteStride ?? 8;
      const normal = readAccessor(glb, p.attributes.NORMAL).data;
      const min = [Infinity, Infinity], max = [-Infinity, -Infinity];
      for (let i = 0; i < accessor.count; i++) {
        let u = bin.readFloatLE(at + i * stride), v = bin.readFloatLE(at + i * stride + 4);
        const col = Math.min(15, Math.floor(u * 16)), row = Math.min(3, Math.floor(v * 4));
        const from = bandOfCell.get(`${col},${row}`);
        const to = moves.get(from) ?? (tagged.has(from) ? from : null);
        if (to) {
          const [a, b, c] = [normal[3 * i], normal[3 * i + 1], normal[3 * i + 2]];
          const n = [w[0] * a + w[4] * b + w[8] * c, w[1] * a + w[5] * b + w[9] * c, w[2] * a + w[6] * b + w[10] * c];
          const [toCol, toRow] = cellOf(to), [top, bottom] = ranges[to];
          u = (toCol + u * 16 - col) / 16;
          v = (toRow + top + (bottom - top) * (1 - n[1] / (Math.hypot(...n) || 1)) / 2) / 4;
          bin.writeFloatLE(u, at + i * stride);
          bin.writeFloatLE(v, at + i * stride + 4);
          shaded++;
        }
        min[0] = Math.min(min[0], u); max[0] = Math.max(max[0], u);
        min[1] = Math.min(min[1], v); max[1] = Math.max(max[1], v);
      }
      if (accessor.min) accessor.min = min.map(Math.fround);
      if (accessor.max) accessor.max = max.map(Math.fround);
    }
  });
  writeGlb(path, glb.json, bin, writeFileSync);
  console.log(`${kit}/${name}: ${shaded} vertices shaded`);
}
