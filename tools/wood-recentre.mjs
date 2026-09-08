#!/usr/bin/env node
// Slides a model's wood-band UVs down or up their colormap cell so the faces a viewer
// sees sit at the middle of the band (guide W3), keeping the model's own spread: every
// vertex of the band moves by the same amount. Positions that would leave the
// 0.05-0.95 window of the cell are clamped to it; those are the faces the reference
// camera does not see, or the shift would not have been needed.
//   node tools/wood-recentre.mjs [--all | kit/name ...] [--dry] [--target 0.5] [--low 0.4 --high 0.6]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor, visibleLaneCentres } from '../catalog/tools/glb.mjs';
import { readPng } from '../catalog/tools/png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLUMNS = 16, ROWS = 4;
const WOOD_LANES = ['0,0', '1,0', '2,0', '3,0'];
const WINDOW = [0.05, 0.95];
const FLOAT = 5126;

const options = { all: false, dry: false, target: 0.5, low: 0.4, high: 0.6, models: [] };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--all') options.all = true;
  else if (a === '--dry') options.dry = true;
  else if (a === '--target') options.target = Number(argv[++i]);
  else if (a === '--low') options.low = Number(argv[++i]);
  else if (a === '--high') options.high = Number(argv[++i]);
  else if (a.startsWith('--')) { console.error(`unknown flag: ${a}`); process.exit(2); }
  else options.models.push(a);
}
if (!options.all && !options.models.length) { console.error('give kit/name ids, or --all for every model outside the window'); process.exit(2); }

const atlases = new Map();
const atlasFor = (path) => {
  if (!existsSync(path)) return null;
  if (!atlases.has(path)) atlases.set(path, readPng(path));
  return atlases.get(path);
};

const catalog = JSON.parse(readFileSync(join(ROOT, 'catalog/catalog.json'), 'utf8'));
const ids = options.all
  ? catalog.models.filter((m) => m.vis && WOOD_LANES.some((l) => m.vis[l] !== undefined && (m.vis[l] < options.low || m.vis[l] > options.high))).map((m) => `${m.kit}/${m.name}`)
  : options.models;

let changed = 0;
for (const id of ids) {
  const file = join(ROOT, 'kits/workfiles', `${id}.glb`);
  if (!existsSync(file)) { console.error(`! ${id}: no such model`); continue; }
  const glb = readGlb(file);
  const { json, bin } = glb;
  const dir = dirname(file);
  const before = visibleLaneCentres(glb, dir, atlasFor);
  const shifts = new Map();
  for (const lane of WOOD_LANES) {
    const centre = before.get(lane);
    if (centre === undefined || (centre >= options.low && centre <= options.high)) continue;
    shifts.set(lane, options.target - centre);
  }
  if (!shifts.size) { console.log(`  ${id}: within window`); continue; }

  // One shift per lane, applied to every vertex whose UV lands in that cell.
  const touched = new Set();
  let clamped = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const index = prim.attributes?.TEXCOORD_0;
      if (index === undefined || touched.has(index)) continue;
      touched.add(index);
      const material = json.materials?.[prim.material];
      const texIndex = material?.pbrMetallicRoughness?.baseColorTexture?.index;
      const source = json.images?.[json.textures?.[texIndex]?.source]?.uri;
      const atlas = source ? atlasFor(join(dir, decodeURIComponent(source))) : null;
      if (!atlas) continue;
      const accessor = json.accessors[index];
      if (accessor.componentType !== FLOAT || accessor.type !== 'VEC2') throw new Error(`${id}: TEXCOORD_0 is not float VEC2`);
      const view = json.bufferViews[accessor.bufferView];
      const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const step = view.byteStride ?? 8;
      const cellWidth = atlas.width / COLUMNS, cellHeight = atlas.height / ROWS;
      const uv = readAccessor(glb, index);
      for (let v = 0; v < uv.count; v++) {
        const u = uv.data[v * 2], vv = uv.data[v * 2 + 1];
        const x = Math.min(Math.max(Math.floor(u * atlas.width), 0), atlas.width - 1);
        const y = Math.min(Math.max(Math.floor(vv * atlas.height), 0), atlas.height - 1);
        const row = Math.floor(y / cellHeight);
        const lane = `${Math.floor(x / cellWidth)},${row}`;
        const shift = shifts.get(lane);
        if (shift === undefined) continue;
        const position = vv * ROWS - row;
        let next = position + shift;
        if (next < WINDOW[0] || next > WINDOW[1]) { next = Math.min(Math.max(next, WINDOW[0]), WINDOW[1]); clamped++; }
        bin.writeFloatLE((row + next) / ROWS, start + v * step + 4);
      }
      if (accessor.min && accessor.max) {
        const fresh = readAccessor(glb, index);
        accessor.min[1] = Math.min(...Array.from({ length: fresh.count }, (_, v) => fresh.data[v * 2 + 1]));
        accessor.max[1] = Math.max(...Array.from({ length: fresh.count }, (_, v) => fresh.data[v * 2 + 1]));
      }
    }
  }
  const after = visibleLaneCentres(glb, dir, atlasFor);
  const report = [...shifts].map(([lane, shift]) => `${lane} ${before.get(lane).toFixed(2)} -> ${after.get(lane).toFixed(2)} (shift ${shift >= 0 ? '+' : ''}${shift.toFixed(2)})`).join(', ');
  console.log(`${options.dry ? '  ' : '* '}${id}: ${report}${clamped ? `, ${clamped} uv clamped` : ''}`);
  if (!options.dry) { writeGlb(file, json, bin, writeFileSync); changed++; }
}
console.log(`${changed} model(s) written${options.dry ? ' (dry run)' : ''}`);
