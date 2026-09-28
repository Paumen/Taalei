import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';
import { MeshoptSimplifier } from './vendor/meshoptimizer/meshopt_simplifier.js';

const HELP = `simplify.mjs [--error <fraction>] [--list] <workfile.glb> [...]

Removes triangles while no surface moves more than --error (0.01 by default) of
the model's longest extent. Open edges, colour-band seams and normals are kept.
A result is refused where it opens a hole, makes an edge carry more than two
faces, flips a face against its normals, or leaves a face more than 78° off one
of its vertex normals; the vertices under such a spot are locked and the pass
runs again, up to 12 times, after which the model is left as it was. Models with
a skin, an animation or morph targets are left alone. --list prints the counts
and changes nothing.`;

const PASSES = 12;
const WEIGHT_NORMAL = 1;
const WEIGHT_UV = 1;
const STREAK = 0.2;

const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const PARTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
let error = 0.01;
let list = false;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--error') error = Number(args[++i]);
  else if (args[i] === '--list') list = true;
  else files.push(args[i]);
}
if (!(error > 0 && error < 1)) throw new Error('--error needs a fraction between 0 and 1');

await MeshoptSimplifier.ready;

function rawRows(glb, index) {
  const accessor = glb.json.accessors[index];
  const Type = COMPONENT[accessor.componentType];
  const size = PARTS[accessor.type] * Type.BYTES_PER_ELEMENT;
  const view = glb.json.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const step = view.byteStride ?? size;
  return { size, row: (i) => glb.bin.subarray(start + i * step, start + i * step + size) };
}

function weldMap(glb, prim, count) {
  const rows = Object.values(prim.attributes).map((a) => rawRows(glb, a));
  const seen = new Map();
  const map = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const key = rows.map((r) => r.row(i).toString('base64')).join('|');
    if (!seen.has(key)) seen.set(key, i);
    map[i] = seen.get(key);
  }
  return map;
}

function positionIds(pos) {
  const ids = new Map();
  const id = new Int32Array(pos.length / 3);
  for (let i = 0; i < id.length; i++) {
    const key = `${pos[i * 3].toFixed(5)},${pos[i * 3 + 1].toFixed(5)},${pos[i * 3 + 2].toFixed(5)}`;
    if (!ids.has(key)) ids.set(key, ids.size);
    id[i] = ids.get(key);
  }
  return id;
}

function faceNormal(pos, a, b, c) {
  const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
  const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  return l < 1e-12 ? null : [nx / l, ny / l, nz / l];
}

function inspect(idx, pos, nrm, id) {
  const edges = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = id[idx[t + e]], b = id[idx[t + (e + 1) % 3]];
      if (a === b) continue;
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  const open = new Set(), crowded = new Set();
  for (const [k, c] of edges) {
    if (c === 1) open.add(k);
    else if (c > 2) crowded.add(k);
  }
  const flip = [], streak = [];
  if (nrm) {
    for (let t = 0; t < idx.length; t += 3) {
      const f = faceNormal(pos, idx[t], idx[t + 1], idx[t + 2]);
      if (!f) continue;
      let sx = 0, sy = 0, sz = 0, worst = 1;
      for (let k = 0; k < 3; k++) {
        const v = idx[t + k];
        sx += nrm[v * 3]; sy += nrm[v * 3 + 1]; sz += nrm[v * 3 + 2];
        worst = Math.min(worst, f[0] * nrm[v * 3] + f[1] * nrm[v * 3 + 1] + f[2] * nrm[v * 3 + 2]);
      }
      if (f[0] * sx + f[1] * sy + f[2] * sz < 0) flip.push(t);
      else if (worst < STREAK) streak.push(t);
    }
  }
  return { open, crowded, flip, streak };
}

function lockUnder(lock, idx, pos, tris, tolerance) {
  const n = pos.length / 3;
  for (const t of tris) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const f = faceNormal(pos, a, b, c);
    if (!f) continue;
    const e0 = [0, 1, 2].map((k) => pos[b * 3 + k] - pos[a * 3 + k]);
    const e1 = [0, 1, 2].map((k) => pos[c * 3 + k] - pos[a * 3 + k]);
    const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
    const d00 = dot(e0, e0), d01 = dot(e0, e1), d11 = dot(e1, e1);
    const den = d00 * d11 - d01 * d01;
    lock[a] = lock[b] = lock[c] = 1;
    if (Math.abs(den) < 1e-18) continue;
    for (let i = 0; i < n; i++) {
      if (lock[i]) continue;
      const p = [0, 1, 2].map((k) => pos[i * 3 + k] - pos[a * 3 + k]);
      if (Math.abs(dot(p, f)) > tolerance) continue;
      const d20 = dot(p, e0), d21 = dot(p, e1);
      const v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den;
      if (v >= -0.05 && w >= -0.05 && v + w <= 1.05) lock[i] = 1;
    }
  }
}

function simplifyPrimitive(glb, prim, absError) {
  const indexData = readAccessor(glb, prim.indices).data;
  const position = readAccessor(glb, prim.attributes.POSITION);
  const n = position.count;
  const weld = weldMap(glb, prim, n);
  const idx = Uint32Array.from(indexData, (v) => weld[v]);
  const pos = Float32Array.from(position.data);
  const nrm = prim.attributes.NORMAL !== undefined ? Float32Array.from(readAccessor(glb, prim.attributes.NORMAL).data) : null;
  const uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(glb, prim.attributes.TEXCOORD_0).data : null;

  const weights = [...(nrm ? [WEIGHT_NORMAL, WEIGHT_NORMAL, WEIGHT_NORMAL] : []), ...(uv ? [WEIGHT_UV, WEIGHT_UV] : [])];
  const stride = weights.length;
  const attributes = new Float32Array(n * Math.max(stride, 1));
  for (let i = 0; i < n; i++) {
    let o = i * stride;
    if (nrm) for (let k = 0; k < 3; k++) attributes[o++] = nrm[i * 3 + k];
    if (uv) for (let k = 0; k < 2; k++) attributes[o++] = uv[i * 2 + k];
  }

  const id = positionIds(pos);
  const neighbours = new Map(), members = new Map();
  for (let i = 0; i < n; i++) {
    if (!members.has(id[i])) members.set(id[i], []);
    members.get(id[i]).push(i);
  }
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = id[idx[t + e]];
      if (!neighbours.has(a)) neighbours.set(a, new Set());
      neighbours.get(a).add(id[idx[t + (e + 1) % 3]]).add(id[idx[t + (e + 2) % 3]]);
    }
  }

  const base = inspect(idx, pos, nrm, id);
  const lock = new Uint8Array(n);
  const flags = ['LockBorder', 'ErrorAbsolute'];
  for (let pass = 0, rings = 1; pass < PASSES; pass++, rings++) {
    const [out] = stride
      ? MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attributes, stride, weights, lock, 0, absError, flags)
      : MeshoptSimplifier.simplify(idx, pos, 3, 0, absError, flags);
    const got = inspect(out, pos, nrm, id);
    const edges = [...got.open].filter((k) => !base.open.has(k)).concat([...got.crowded].filter((k) => !base.crowded.has(k)));
    const flips = got.flip.length > base.flip.length ? got.flip : [];
    const streaks = got.streak.length > base.streak.length ? got.streak : [];
    if (!edges.length && !flips.length && !streaks.length) return out.length < idx.length ? out : null;

    const before = lock.reduce((s, v) => s + v, 0);
    const bad = flips.concat(streaks);
    lockUnder(lock, out, pos, bad, absError * 4);
    let front = new Set();
    for (const t of bad) for (let k = 0; k < 3; k++) front.add(id[out[t + k]]);
    for (const k of edges) for (const v of k.split(',')) front.add(Number(v));
    const seen = new Set(front);
    for (let g = 0; g < rings; g++) {
      const next = new Set();
      for (const a of front) for (const b of neighbours.get(a) ?? []) if (!seen.has(b)) { seen.add(b); next.add(b); }
      front = next;
    }
    for (const a of seen) for (const i of members.get(a)) lock[i] = 1;
    if (lock.reduce((s, v) => s + v, 0) === before) break;
  }
  return null;
}

function repack(glb, replaced) {
  const { json } = glb;
  const chunks = [];
  let length = 0;
  const views = [];
  const push = (bytes, from) => {
    const pad = (4 - (length % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; }
    const view = { buffer: 0, byteOffset: length, byteLength: bytes.length };
    if (from?.target !== undefined) view.target = from.target;
    chunks.push(bytes);
    length += bytes.length;
    views.push(view);
    return views.length - 1;
  };
  for (const image of json.images ?? []) {
    if (image.bufferView === undefined) continue;
    const view = json.bufferViews[image.bufferView];
    image.bufferView = push(Buffer.from(glb.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)), view);
  }
  json.accessors.forEach((accessor, index) => {
    if (accessor.bufferView === undefined) return;
    if (accessor.sparse) throw new Error('sparse accessor is not supported');
    const from = json.bufferViews[accessor.bufferView];
    let bytes = replaced.get(index);
    if (!bytes) {
      const { size, row } = rawRows(glb, index);
      bytes = Buffer.alloc(size * accessor.count);
      for (let i = 0; i < accessor.count; i++) row(i).copy(bytes, i * size);
    }
    accessor.bufferView = push(bytes, from);
    delete accessor.byteOffset;
  });
  json.bufferViews = views;
  json.buffers = [{ byteLength: length }];
  glb.bin = Buffer.concat(chunks, length);
}

function compact(glb, prim, out, replaced) {
  const { json } = glb;
  const order = [];
  const remap = new Map();
  for (const v of out) if (!remap.has(v)) { remap.set(v, order.length); order.push(v); }
  for (const index of Object.values(prim.attributes)) {
    const { size, row } = rawRows(glb, index);
    const bytes = Buffer.alloc(size * order.length);
    order.forEach((v, i) => row(v).copy(bytes, i * size));
    replaced.set(index, bytes);
    json.accessors[index].count = order.length;
  }
  const position = json.accessors[prim.attributes.POSITION];
  const data = new Float32Array(replaced.get(prim.attributes.POSITION).buffer, replaced.get(prim.attributes.POSITION).byteOffset, order.length * 3);
  position.min = [0, 1, 2].map((k) => Math.min(...order.map((_, i) => data[i * 3 + k])));
  position.max = [0, 1, 2].map((k) => Math.max(...order.map((_, i) => data[i * 3 + k])));

  const Type = order.length < 65536 ? Uint16Array : Uint32Array;
  const indices = Type.from(out, (v) => remap.get(v));
  const accessor = json.accessors[prim.indices];
  accessor.componentType = Type === Uint16Array ? 5123 : 5125;
  accessor.count = indices.length;
  delete accessor.min;
  delete accessor.max;
  replaced.set(prim.indices, Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength));
}

for (const file of files) {
  const glb = readGlb(file);
  const { json } = glb;
  const prims = (json.meshes ?? []).flatMap((m) => m.primitives ?? []);
  if (json.skins?.length || json.animations?.length || prims.some((p) => p.targets?.length)) {
    console.log(`${file}: skinned, animated or morphing, left alone`);
    continue;
  }

  const world = worldMatrices(json);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const scaleOf = new Map();
  (json.nodes ?? []).forEach((node, index) => {
    if (node.mesh === undefined || !world[index]) return;
    const m = world[index];
    const scale = Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]));
    scaleOf.set(node.mesh, Math.max(scaleOf.get(node.mesh) ?? 0, scale));
    for (const prim of json.meshes[node.mesh].primitives ?? []) {
      const p = readAccessor(glb, prim.attributes.POSITION).data;
      for (let i = 0; i < p.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          const w = m[k] * p[i] + m[4 + k] * p[i + 1] + m[8 + k] * p[i + 2] + m[12 + k];
          min[k] = Math.min(min[k], w);
          max[k] = Math.max(max[k], w);
        }
      }
    }
  });
  const longest = Math.max(...max.map((v, k) => v - min[k]));

  const uses = new Map();
  for (const prim of prims) for (const a of [prim.indices, ...Object.values(prim.attributes)]) uses.set(a, (uses.get(a) ?? 0) + 1);

  const replaced = new Map();
  let before = 0, after = 0, kept = 0;
  (json.meshes ?? []).forEach((mesh, meshIndex) => {
    const scale = scaleOf.get(meshIndex);
    for (const prim of mesh.primitives ?? []) {
      if ((prim.mode ?? 4) !== 4 || prim.indices === undefined) continue;
      const count = json.accessors[prim.indices].count / 3;
      before += count;
      const shared = [prim.indices, ...Object.values(prim.attributes)].some((a) => uses.get(a) > 1);
      const out = scale && !shared ? simplifyPrimitive(glb, prim, (error * longest) / scale) : null;
      if (!out) { after += count; kept++; continue; }
      after += out.length / 3;
      if (!list) compact(glb, prim, out, replaced);
    }
  });

  console.log(`${file}: ${before} -> ${after} triangles${kept ? `, ${kept} primitive(s) left as they were` : ''}`);
  if (list || after === before) continue;
  repack(glb, replaced);
  writeGlb(file, json, glb.bin, writeFileSync);
}
