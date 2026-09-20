#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UINT16_MAX = 65535;
const GRID = 1e4;

const HELP = `cap-rims.mjs <kit>/<model> [--list]
  Closes every rim kits/workfiles/<kit>/<model>.glb leaves open, with a fan from the
  rim's own centre, so a part cut off a larger model is solid rather than a tube the
  camera can see into. --list counts the rims and changes nothing.`;

const argv = process.argv.slice(2);
const listOnly = argv.includes('--list');
const id = argv.find((a) => !a.startsWith('--'));
if (!id) {
  console.log(HELP);
  process.exit(1);
}

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
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
const mean = (list) => list.reduce((c, p) => p.map((v, i) => c[i] + v / list.length), [0, 0, 0]);

const faces = [];
for (let t = 0; t + 2 < idx.count; t += 3) faces.push([idx.data[t], idx.data[t + 1], idx.data[t + 2]]);

// Kept as the triangle walks them: an edge only one triangle holds is a rim, and the
// cap that closes it has to walk that edge the other way round to face the same way as
// the surface it continues. Nothing else says which side of a hole is the outside.
const edges = new Map();
for (const face of faces) for (let i = 0; i < 3; i++) {
  const a = keyOf(face[i]);
  const b = keyOf(face[(i + 1) % 3]);
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  const seen = edges.get(k);
  edges.set(k, seen ? { ...seen, count: seen.count + 1 } : { from: a, to: b, count: 1 });
}
const ahead = new Map();
for (const [, edge] of edges) if (edge.count === 1) ahead.set(edge.from, edge.to);

const walked = new Set();
const rims = [];
for (const start of ahead.keys()) {
  if (walked.has(start)) continue;
  const rim = [];
  let node = start;
  while (node !== undefined && !walked.has(node)) {
    walked.add(node);
    rim.push(node);
    node = ahead.get(node);
  }
  rims.push(rim);
}

if (listOnly || !rims.length) {
  console.log(`${id}: ${rims.length} open rim(s)${rims.length ? `: ${rims.map((r) => r.length).join(', ')} vertices` : ''}`);
  process.exit(0);
}

const uvAt = new Map();
for (const face of faces) for (const v of face) if (!uvAt.has(keyOf(v))) uvAt.set(keyOf(v), [uv.data[v * 2], uv.data[v * 2 + 1]]);

const caps = [];
for (const rim of rims) {
  const centre = mean(rim.map(place));
  const uvMean = mean(rim.map((k) => [...uvAt.get(k), 0])).slice(0, 2);
  for (const a of rim) {
    const b = ahead.get(a);
    const tri = [{ position: centre, uv: uvMean }, { position: place(b), uv: uvAt.get(b) }, { position: place(a), uv: uvAt.get(a) }];
    const normal = norm(cross(sub(tri[1].position, tri[0].position), sub(tri[2].position, tri[0].position)));
    caps.push(tri.map((v) => ({ ...v, normal })));
  }
}

const taken = [];
const seat = new Map();
const indices = [];
for (const face of faces) for (const v of face) {
  if (!seat.has(v)) { seat.set(v, taken.length); taken.push(v); }
  indices.push(seat.get(v));
}
const fresh = [];
for (const tri of caps) for (const vertex of tri) {
  indices.push(taken.length + fresh.length);
  fresh.push(vertex);
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
console.log(`${id}: ${rims.length} rim(s) closed with ${caps.length} triangles`);
