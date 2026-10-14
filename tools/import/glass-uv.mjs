import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder, welder, primitiveMatrix } from './mesh-edit.mjs';

const HELP = `glass-uv.mjs [--band <band>] <workfile.glb> [...]

Maps every glass piece in <band> (default glass) of kits/colormap.png onto a
short run down one column of its cell that holds a single wide streak, by
where each point lies along a fixed diagonal through the model. Each piece
then carries one soft stripe that runs on unbroken over every fold and curve.
A piece is a run of triangles in the band that share edges.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const CELL_PX = [32, 128];
const SPAN_PX = [24, 54];
const COLUMN_PX = 16;
const SWEEP = (() => {
  const d = [1, -1.5, -1];
  const l = Math.hypot(...d);
  return d.map((x) => x / l);
})();

function layout(file, cell) {
  const glb = readGlb(file);
  const replaced = new Map();
  let pieces = 0;
  const inCell = (u, v) => Math.floor(u * 16) === cell[0] && Math.floor(v * 4) === cell[1];
  for (const prim of editablePrimitives(glb.json)) {
    if (prim.attributes.TEXCOORD_0 === undefined) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const tris = [];
    for (let t = 0; t < idx.length / 3; t++) {
      const c = [0, 1, 2].map((k) => idx[t * 3 + k]);
      if (c.every((v) => inCell(uv[v * 2], uv[v * 2 + 1]))) tris.push(t);
    }
    if (!tris.length) continue;
    const m = primitiveMatrix(glb.json, prim);
    const along = (v) => {
      const [x, y, z] = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
      const w = [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
      return w[0] * SWEEP[0] + w[1] * SWEEP[1] + w[2] * SWEEP[2];
    };
    const { weld } = welder(pos);
    const parent = new Map();
    const find = (a) => (parent.get(a) === a ? a : (parent.set(a, find(parent.get(a))), parent.get(a)));
    for (const t of tris) {
      const w = [0, 1, 2].map((k) => weld(idx[t * 3 + k]));
      for (const a of w) if (!parent.has(a)) parent.set(a, a);
      parent.set(find(w[1]), find(w[0]));
      parent.set(find(w[2]), find(w[0]));
    }
    const range = new Map();
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const v = idx[t * 3 + k];
        const r = find(weld(v));
        const s = along(v);
        const [lo, hi] = range.get(r) ?? [s, s];
        range.set(r, [Math.min(lo, s), Math.max(hi, s)]);
      }
    }
    pieces += range.size;
    const target = (v) => {
      const [lo, hi] = range.get(find(weld(v)));
      const py = SPAN_PX[0] + ((along(v) - lo) / (hi - lo || 1)) * (SPAN_PX[1] - SPAN_PX[0]);
      return [(cell[0] * CELL_PX[0] + COLUMN_PX) / (16 * CELL_PX[0]), (cell[1] * CELL_PX[1] + py) / (4 * CELL_PX[1])];
    };
    const inBand = new Set(tris);
    const shared = new Set();
    for (let t = 0; t < idx.length / 3; t++) if (!inBand.has(t)) for (let k = 0; k < 3; k++) shared.add(idx[t * 3 + k]);
    const adder = vertexAdder(glb, prim);
    const copies = new Map();
    const writes = new Map();
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const v = idx[t * 3 + k];
        if (!shared.has(v)) { writes.set(v, target(v)); continue; }
        if (!copies.has(v)) copies.set(v, adder.add(v, { TEXCOORD_0: target(v) }));
        idx[t * 3 + k] = copies.get(v);
      }
    }
    const accessor = glb.json.accessors[prim.attributes.TEXCOORD_0];
    if (accessor.componentType !== 5126) throw new Error(`${file}: UVs are not float`);
    const view = glb.json.bufferViews[accessor.bufferView];
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const step = view.byteStride ?? 8;
    for (const [v, value] of writes) new Float32Array(glb.bin.buffer, glb.bin.byteOffset + start + v * step, 2).set(value);
    adder.commit(idx, replaced);
  }
  if (!pieces) return 0;
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  return pieces;
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help')) {
  console.log(HELP);
  process.exit(argv.length ? 0 : 1);
}
const options = {};
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) options[argv[i].slice(2)] = argv[++i];
  else files.push(argv[i]);
}
const band = options.band ?? 'glass';
if (!BANDS[band]) throw new Error(`no such band: ${band}`);
const cell = BANDS[band].split(',').map(Number);
for (const file of files) console.log(`${file}: ${layout(file, cell)} pieces`);
