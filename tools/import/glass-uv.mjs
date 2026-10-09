import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder, faceNormal, welder } from './mesh-edit.mjs';

const HELP = `glass-uv.mjs [--band <band>] <workfile.glb> [...]

Lays every flat pane in <band> (default glass) of kits/colormap.png out across
its cell, so the streaks painted in that cell show on the pane: each pane is
projected onto its own plane, keeps its proportions, fills the cell width (or
its height when the pane is tall) and starts at the light end of the cell.
A pane is a run of triangles in the band that share edges and face the same way.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const CELL_PX = [32, 128];
const MARGIN_PX = 2;
const SAME_FACING = Math.cos((15 * Math.PI) / 180);

const unit = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function planeAxes(n) {
  if (Math.abs(n[1]) > 0.9) return [[1, 0, 0], [0, 0, n[1] > 0 ? 1 : -1]];
  const across = unit(cross([0, 1, 0], n));
  const down = unit(cross(n, across)).map((x) => -x);
  return [across, down];
}

function layout(file, cell) {
  const glb = readGlb(file);
  const replaced = new Map();
  let panes = 0;
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
    const { weld } = welder(pos);
    const normals = new Map(tris.map((t) => [t, unit(faceNormal(pos, idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]))]));
    const edgeTris = new Map();
    for (const t of tris) {
      const w = [0, 1, 2].map((k) => weld(idx[t * 3 + k]));
      for (let k = 0; k < 3; k++) {
        const a = w[k], b = w[(k + 1) % 3];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (!edgeTris.has(key)) edgeTris.set(key, []);
        edgeTris.get(key).push(t);
      }
    }
    const parent = new Map(tris.map((t) => [t, t]));
    const find = (t) => (parent.get(t) === t ? t : (parent.set(t, find(parent.get(t))), parent.get(t)));
    for (const list of edgeTris.values()) {
      for (let i = 1; i < list.length; i++) {
        if (dot(normals.get(list[0]), normals.get(list[i])) >= SAME_FACING) parent.set(find(list[i]), find(list[0]));
      }
    }
    const groups = new Map();
    for (const t of tris) {
      const r = find(t);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(t);
    }
    const owner = new Map();
    for (let t = 0; t < idx.length / 3; t++) {
      for (let k = 0; k < 3; k++) {
        const v = idx[t * 3 + k];
        if (!owner.has(v)) owner.set(v, new Set());
        owner.get(v).add(parent.has(t) ? `g${find(t)}` : 'other');
      }
    }
    const adder = vertexAdder(glb, prim);
    const writes = new Map();
    for (const [root, group] of groups) {
      const n = unit(group.reduce((s, t) => s.map((x, k) => x + normals.get(t)[k]), [0, 0, 0]));
      const [ax, ay] = planeAxes(n);
      const verts = new Set(group.flatMap((t) => [0, 1, 2].map((k) => idx[t * 3 + k])));
      const p = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
      const coords = new Map([...verts].map((v) => [v, [dot(p(v), ax), dot(p(v), ay)]]));
      const xs = [...coords.values()].map((c) => c[0]);
      const ys = [...coords.values()].map((c) => c[1]);
      const x0 = Math.min(...xs), y0 = Math.min(...ys);
      const w = Math.max(...xs) - x0 || 1e-6, h = Math.max(...ys) - y0 || 1e-6;
      const room = [CELL_PX[0] - 2 * MARGIN_PX, CELL_PX[1] - 2 * MARGIN_PX];
      const scale = Math.min(room[0] / w, room[1] / h);
      const target = (v) => {
        const [x, y] = coords.get(v);
        const px = MARGIN_PX + (x - x0) * scale + (room[0] - w * scale) / 2;
        const py = MARGIN_PX + (y - y0) * scale;
        return [(cell[0] * CELL_PX[0] + px) / (16 * CELL_PX[0]), (cell[1] * CELL_PX[1] + py) / (4 * CELL_PX[1])];
      };
      const key = `g${root}`;
      const copies = new Map();
      for (const t of group) {
        for (let k = 0; k < 3; k++) {
          const v = idx[t * 3 + k];
          if (owner.get(v).size === 1) { writes.set(v, target(v)); continue; }
          if (!copies.has(v)) copies.set(v, adder.add(v, { TEXCOORD_0: target(v) }));
          idx[t * 3 + k] = copies.get(v);
        }
      }
      owner.forEach((set) => set.delete(key));
      panes++;
    }
    const accessor = glb.json.accessors[prim.attributes.TEXCOORD_0];
    if (accessor.componentType !== 5126) throw new Error(`${file}: UVs are not float`);
    const view = glb.json.bufferViews[accessor.bufferView];
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const step = view.byteStride ?? 8;
    for (const [v, value] of writes) new Float32Array(glb.bin.buffer, glb.bin.byteOffset + start + v * step, 2).set(value);
    adder.commit(idx, replaced);
  }
  if (!panes) return 0;
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  return panes;
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
for (const file of files) console.log(`${file}: ${layout(file, cell)} panes`);
