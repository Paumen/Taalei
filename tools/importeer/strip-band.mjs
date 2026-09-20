#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { BANDEN } from './leerbanden.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COLUMNS = 16;
const ROWS = 4;
const UINT16_MAX = 65535;
const GRID = 1e4;

const HELP = `strip-band.mjs <kit>/<model> <band>
  Takes every triangle that sits wholly on <band> out of kits/workfiles/<kit>/<model>.glb
  and closes the rims that leaves, bridging them with the surface the band interrupted.
  For a strap, a wrap or a collar modelled into a wall that should read as bare. The rims
  it closes are the ones the cut opens: an edge the model already left open stays open.
  Bands: ${Object.keys(BANDEN).join(' ')}`;

const [id, band] = process.argv.slice(2);
if (!id || !band) {
  console.log(HELP);
  process.exit(1);
}
if (!BANDEN[band]) throw new Error(`band not known: ${band}`);

const path = join(ROOT, 'kits', 'workfiles', `${id}.glb`);
const glb = readGlb(path);
const { json } = glb;
if (json.meshes?.length !== 1 || json.meshes[0].primitives.length !== 1) throw new Error(`${id}: wants one mesh of one primitive`);

const prim = json.meshes[0].primitives[0];
const pos = readAccessor(glb, prim.attributes.POSITION);
const nrm = readAccessor(glb, prim.attributes.NORMAL);
const uv = readAccessor(glb, prim.attributes.TEXCOORD_0);
const idx = readAccessor(glb, prim.indices);

const at = (v) => [pos.data[v * 3], pos.data[v * 3 + 1], pos.data[v * 3 + 2]];
const keyOf = (v) => at(v).map((c) => Math.round(c * GRID)).join(',');
const place = (k) => k.split(',').map((c) => Number(c) / GRID);
const onBand = (v) => Math.floor(uv.data[v * 2] * COLUMNS) === BANDEN[band][0]
  && Math.floor(uv.data[v * 2 + 1] * ROWS) === BANDEN[band][1];

const faces = [];
const stripped = [];
for (let t = 0; t + 2 < idx.count; t += 3) {
  const face = [idx.data[t], idx.data[t + 1], idx.data[t + 2]];
  (face.every(onBand) ? stripped : faces).push(face);
}
if (!stripped.length) throw new Error(`${id}: no triangle sits wholly on ${band}`);

const rim = (set) => {
  const edges = new Map();
  for (const face of set) for (let i = 0; i < 3; i++) {
    const a = keyOf(face[i]);
    const b = keyOf(face[(i + 1) % 3]);
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    edges.set(k, (edges.get(k) ?? 0) + 1);
  }
  return new Set([...edges].filter(([, n]) => n === 1).map(([k]) => k));
};

const before = rim([...faces, ...stripped]);
const opened = [...rim(faces)].filter((k) => !before.has(k));

const neighbours = new Map();
for (const edge of opened) {
  const [a, b] = edge.split('|');
  if (!neighbours.has(a)) neighbours.set(a, []);
  if (!neighbours.has(b)) neighbours.set(b, []);
  neighbours.get(a).push(b);
  neighbours.get(b).push(a);
}
const walked = new Set();
const loops = [];
for (const start of neighbours.keys()) {
  if (walked.has(start)) continue;
  const loop = [];
  let node = start;
  while (node && !walked.has(node)) {
    walked.add(node);
    loop.push(node);
    node = neighbours.get(node).find((n) => !walked.has(n));
  }
  loops.push(loop);
}
if (loops.length % 2) throw new Error(`${id}: ${loops.length} rims opened, so they do not pair up`);

const centreOf = (loop) => loop.reduce((c, k) => place(k).map((v, a) => c[a] + v / loop.length), [0, 0, 0]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };

const pairs = [];
const spent = new Set();
for (let i = 0; i < loops.length; i++) {
  if (spent.has(i)) continue;
  let mate = -1;
  let best = Infinity;
  for (let j = i + 1; j < loops.length; j++) {
    if (spent.has(j) || loops[j].length !== loops[i].length) continue;
    const d = Math.hypot(...sub(centreOf(loops[j]), centreOf(loops[i])));
    if (d < best) { best = d; mate = j; }
  }
  if (mate === -1) throw new Error(`${id}: a rim of ${loops[i].length} vertices has no match`);
  spent.add(i); spent.add(mate);
  pairs.push([loops[i], loops[mate]]);
}

const uvAt = new Map();
for (const face of faces) for (const v of face) if (!uvAt.has(keyOf(v))) uvAt.set(keyOf(v), [uv.data[v * 2], uv.data[v * 2 + 1]]);

const bridge = [];
for (const [first, second] of pairs) {
  const ca = centreOf(first);
  const cb = centreOf(second);
  const axis = norm(sub(cb, ca));
  const right = norm(cross(Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], axis));
  const up = cross(axis, right);
  const angle = (k, c) => { const d = sub(place(k), c); return Math.atan2(dot(d, up), dot(d, right)); };
  const a = [...first].sort((p, q) => angle(p, ca) - angle(q, ca));
  const b = [...second].sort((p, q) => angle(p, cb) - angle(q, cb));
  let turn = 0;
  let best = Infinity;
  for (let s = 0; s < b.length; s++) {
    const d = a.reduce((sum, k, i) => sum + Math.hypot(...sub(place(b[(i + s) % b.length]), place(k))), 0);
    if (d < best) { best = d; turn = s; }
  }
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i];
    const a1 = a[(i + 1) % a.length];
    const b0 = b[(i + turn) % b.length];
    const b1 = b[(i + 1 + turn) % b.length];
    for (const tri of [[a0, a1, b1], [a0, b1, b0]]) {
      const p = tri.map(place);
      const face = norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
      const out = norm(sub(p[0], ca.map((v, k) => v + axis[k] * dot(sub(p[0], ca), axis))));
      bridge.push(dot(face, out) < 0 ? [tri[0], tri[2], tri[1]] : tri);
    }
  }
}

const taken = [];
const seat = new Map();
const indices = [];
const fresh = [];
for (const face of faces) for (const v of face) {
  if (!seat.has(v)) { seat.set(v, taken.length); taken.push(v); }
  indices.push(seat.get(v));
}
for (const tri of bridge) {
  const p = tri.map(place);
  const face = norm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
  for (let i = 0; i < 3; i++) {
    indices.push(taken.length + fresh.length);
    fresh.push({ position: p[i], normal: face, uv: uvAt.get(tri[i]) });
  }
}

const count = taken.length + fresh.length;
const position = new Float32Array(count * 3);
const normal = new Float32Array(count * 3);
const texture = new Float32Array(count * 2);
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
const put = (i, p, n, t) => {
  for (let k = 0; k < 3; k++) {
    position[i * 3 + k] = p[k];
    normal[i * 3 + k] = n[k];
    if (p[k] < min[k]) min[k] = p[k];
    if (p[k] > max[k]) max[k] = p[k];
  }
  texture[i * 2] = t[0];
  texture[i * 2 + 1] = t[1];
};
taken.forEach((v, i) => put(i, at(v), [nrm.data[v * 3], nrm.data[v * 3 + 1], nrm.data[v * 3 + 2]], [uv.data[v * 2], uv.data[v * 2 + 1]]));
fresh.forEach((v, i) => put(taken.length + i, v.position, v.normal, v.uv));

const index = count > UINT16_MAX ? new Uint32Array(indices) : new Uint16Array(indices);
const views = [Buffer.from(position.buffer), Buffer.from(normal.buffer), Buffer.from(texture.buffer), Buffer.from(index.buffer)];
const bin = Buffer.concat(views.map((v) => Buffer.concat([v, Buffer.alloc((4 - (v.length % 4)) % 4, 0)])));

let offset = 0;
json.bufferViews = views.map((v, i) => {
  const view = { buffer: 0, byteOffset: offset, byteLength: v.length, target: i === 3 ? 34963 : 34962 };
  offset += v.length + ((4 - (v.length % 4)) % 4);
  return view;
});
json.buffers = [{ byteLength: bin.length }];
json.accessors = [
  { bufferView: 0, componentType: 5126, count, type: 'VEC3', min, max },
  { bufferView: 1, componentType: 5126, count, type: 'VEC3' },
  { bufferView: 2, componentType: 5126, count, type: 'VEC2' },
  { bufferView: 3, componentType: index.BYTES_PER_ELEMENT === 4 ? 5125 : 5123, count: indices.length, type: 'SCALAR' },
];
prim.attributes = { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 };
prim.indices = 3;

writeGlb(path, json, bin, writeFileSync);
console.log(`${id}: ${stripped.length} ${band} triangles out, ${pairs.length} rim(s) closed with ${bridge.length} triangles`);
