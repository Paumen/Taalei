import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';
import { buildKindFields, withKindFields, tubeNeed } from '../../lint/rules.mjs';
import { buildTree, throughDepth } from './mesh-edit.mjs';

const HELP = `thicken-walls.mjs [--min <thickness>] [--list] <workfile.glb> [...]

Pushes every wall thinner than --min out on both sides, along the surface normal, until
it is just over --min: blades, leaves, shells, wires and strands. Thickness at a vertex
is the distance to the far side of the solid, straight in against its normal. Walls at
or above --min do not move. Without --min each model takes the diameter G27 asks of it,
from its kind in lint/kinds.json. --list prints how many positions are thin and changes
nothing. Skinned meshes are left alone.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

const MARGIN = 1.02;

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const xf = (m, p) => [0, 1, 2].map((k) => m[k] * p[0] + m[4 + k] * p[1] + m[8 + k] * p[2] + m[12 + k]);

function inverseLinear(m) {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((x) => x / det);
}
const timesLinear = (m, p) => [0, 1, 2].map((k) => m[k] * p[0] + m[3 + k] * p[1] + m[6 + k] * p[2]);

function writer(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  if (accessor.componentType !== 5126 || accessor.type !== 'VEC3' || accessor.sparse) throw new Error('expects float VEC3');
  const view = glb.json.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const step = view.byteStride ?? 12;
  return (i) => new Float32Array(glb.bin.buffer, glb.bin.byteOffset + start + i * step, 3);
}

function thicken(glb, min, list) {
  const { json } = glb;
  const world = worldMatrices(json);
  const prims = [];
  (json.nodes ?? []).forEach((node, n) => {
    if (node.mesh === undefined || !world[n] || node.skin !== undefined) return;
    for (const prim of json.meshes[node.mesh].primitives ?? []) {
      if ((prim.mode ?? 4) !== 4) continue;
      const count = json.accessors[prim.attributes.POSITION].count;
      const position = writer(glb, prim.attributes.POSITION);
      const indices = prim.indices !== undefined ? readAccessor(glb, prim.indices).data : Array.from({ length: count }, (_, i) => i);
      const points = Array.from({ length: count }, (_, v) => xf(world[n], position(v)));
      prims.push({ prim, count, position, indices, points, back: inverseLinear(world[n]) });
    }
  });

  const tris = [], normals = [];
  const clusters = new Map();
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  prims.forEach((p, pi) => {
    for (let t = 0; t + 2 < p.indices.length; t += 3) {
      const corners = [p.indices[t], p.indices[t + 1], p.indices[t + 2]];
      const tri = corners.map((v) => p.points[v]);
      const n = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
      const len = Math.hypot(...n);
      tris.push(tri);
      normals.push(len ? n.map((x) => x / len) : [0, 0, 0]);
      for (const v of corners) {
        const at = p.points[v];
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], at[k]); hi[k] = Math.max(hi[k], at[k]); }
        const key = at.map((x) => Math.round(x * 1e5)).join(',');
        if (!clusters.has(key)) clusters.set(key, { at, normal: [0, 0, 0], members: [] });
        const cluster = clusters.get(key);
        cluster.members.push([pi, v]);
        for (let k = 0; k < 3; k++) cluster.normal[k] += n[k];
      }
    }
  });
  const longest = Math.max(...hi.map((h, k) => h - lo[k]));
  const tree = buildTree(tris);
  const need = min * MARGIN;
  const eps = longest * 1e-6;

  const shift = new Map();
  for (const cluster of clusters.values()) {
    const len = Math.hypot(...cluster.normal);
    if (!len) continue;
    const n = cluster.normal.map((x) => x / len);
    const d = n.map((x) => -x);
    const depth = throughDepth(tree, tris, normals, cluster.at.map((x, k) => x + d[k] * eps), d, longest * 2, eps);
    if (depth === null || depth + eps >= need) continue;
    const out = n.map((x) => (x * (need - depth - eps)) / 2);
    for (const [pi, v] of cluster.members) shift.set(`${pi}:${v}`, out);
  }
  if (list) return shift.size;

  prims.forEach((p, pi) => {
    let moved = false;
    for (let v = 0; v < p.count; v++) {
      const s = shift.get(`${pi}:${v}`);
      if (!s) continue;
      moved = true;
      const at = p.position(v);
      const local = timesLinear(p.back, s);
      for (let k = 0; k < 3; k++) at[k] += local[k];
    }
    if (!moved) return;
    if (p.prim.attributes.NORMAL !== undefined) {
      const normal = writer(glb, p.prim.attributes.NORMAL);
      const sum = Array.from({ length: p.count }, () => [0, 0, 0]);
      for (let t = 0; t + 2 < p.indices.length; t += 3) {
        const corners = [p.indices[t], p.indices[t + 1], p.indices[t + 2]];
        const [a, b, c] = corners.map((v) => p.position(v));
        const n = cross(sub(b, a), sub(c, a));
        for (const v of corners) for (let k = 0; k < 3; k++) sum[v][k] += n[k];
      }
      sum.forEach((n, v) => {
        const len = Math.hypot(...n);
        if (!len) return;
        const out = normal(v);
        for (let k = 0; k < 3; k++) out[k] = n[k] / len;
      });
    }
    const accessor = json.accessors[p.prim.attributes.POSITION];
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < p.count; v++) {
      const at = p.position(v);
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], at[k]); max[k] = Math.max(max[k], at[k]); }
    }
    Object.assign(accessor, { min, max });
  });
  return shift.size;
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
let min = null;
let list = false;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--min') min = Number(args[++i]);
  else if (args[i] === '--list') list = true;
  else files.push(args[i]);
}
if (min !== null && !(min > 0)) throw new Error('--min needs a positive number');

let models = null;
let kindFields = null;
function minOf(file) {
  if (min !== null) return min;
  if (!models) {
    models = new Map(readJson('catalog/build/catalog.json').models.map((m) => [`${m.kit}/${m.name}`, m]));
    kindFields = buildKindFields(readJson('lint/kinds.json'));
  }
  const id = `${basename(dirname(resolve(file)))}/${basename(file, '.glb')}`;
  if (!models.has(id)) throw new Error(`${file}: not in the catalogue, give --min`);
  return tubeNeed(withKindFields(models.get(id), kindFields));
}

for (const file of files) {
  const need = minOf(file);
  const glb = readGlb(file);
  glb.bin = Buffer.from(glb.bin);
  const thin = thicken(glb, need, list);
  if (list || !thin) {
    console.log(`${file}  ${thin} position(s) thinner than ${need}`);
    continue;
  }
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  console.log(`${file}: pushed out ${thin} position(s) to ${need}`);
}
