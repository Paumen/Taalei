#!/usr/bin/env node
import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor, meshParts } from '../../catalog/tools/glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UINT16_MAX = 65535;

const HELP = `extract-part.mjs <kit>/<model> [<part>[,<part>...] <name>]
  Cuts parts out of kits/workfiles/<kit>/<model>.glb into kits/workfiles/<kit>/<name>.glb.
  Parts are numbered as tools/renders/render.mjs --isolate tiles them when --parts is at
  least the part count; with no part list this prints that numbering instead of writing.
  The cut keeps the model's scale, material and UVs, and is grounded at y=0 on its own
  footprint centre. Parts that carry different materials cannot be cut together: the
  result would draw twice.
  A rigged model is cut at its bind pose, which is where its parts actually sit; the
  piece carries neither the rig nor the animations.`;

const [id, list, name] = process.argv.slice(2);
if (!id) {
  console.log(HELP);
  process.exit(1);
}

const path = join(ROOT, 'kits', 'workfiles', `${id}.glb`);
const glb = readGlb(path);
const { json } = glb;

// meshParts orders by size across the whole model; render.mjs --isolate tiles a part
// where its primitive sits in the scene. Numbering follows the sheet, so a model of
// several meshes is picked from by the tile it shows rather than by a second order.
const order = new Map();
for (const mesh of json.meshes ?? []) for (const prim of mesh.primitives) if (!order.has(prim)) order.set(prim, order.size);
const parts = meshParts(glb, Infinity)
  .map((part, i) => ({ part, prim: order.get(part.prim), seen: i }))
  .sort((a, b) => a.prim - b.prim || a.seen - b.seen)
  .map(({ part }) => part);

if (!list) {
  parts.forEach((part, i) => {
    const span = part.hi.map((v, k) => (v - part.lo[k]).toFixed(3)).join(' x ');
    console.log(`${String(i + 1).padStart(3)}  ${String(part.indices.length / 3).padStart(5)} tris  ${span}`);
  });
  process.exit(0);
}
if (!name) throw new Error(HELP);

const picked = list.split(',').map((n) => {
  const i = Number(n);
  if (!Number.isInteger(i) || i < 1 || i > parts.length) throw new Error(`${id}: no part ${n}; the model has ${parts.length}`);
  return parts[i - 1];
});
if (picked.some((p) => p.prim.material !== picked[0].prim.material)) throw new Error(`${id}: those parts carry different materials`);

const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
if (roots.length !== 1) throw new Error(`${id}: wants one root node, found ${roots.length}`);
const root = json.nodes[roots[0]];
if (root.matrix || root.rotation) throw new Error(`${id}: root node carries a matrix or a rotation`);
const scale = root.scale ?? [1, 1, 1];
if (scale.some((v) => Math.abs(v - scale[0]) > 1e-9)) throw new Error(`${id}: root node scale is not uniform`);

const out = join(ROOT, 'kits', 'workfiles', dirname(id), `${name}.glb`);
if (existsSync(out)) throw new Error(`${name}: already a workfile of this kit`);

const multiply = (a, b) => {
  const r = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let w = 0; w < 4; w++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + w] * b[c * 4 + k];
    r[c * 4 + w] = s;
  }
  return r;
};
const localMatrix = (node) => {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
};
const apply = (m, p, w) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] * w,
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] * w,
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] * w,
];

const world = new Map();
const owner = new Map();
const walk = (i, parent) => {
  const node = json.nodes[i];
  const m = multiply(parent, localMatrix(node));
  world.set(i, m);
  if (node.mesh !== undefined) for (const prim of json.meshes[node.mesh].primitives) owner.set(prim, i);
  for (const child of node.children ?? []) walk(child, m);
};
walk(roots[0], [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// The bind pose puts a rigged model's parts where they belong, and the mesh alone does
// not: the skin is what moves them there. Baked back through the root's scale, so the
// piece keeps the kit's factor on its own node like every other workfile.
const sources = new Map();
const sourceOf = (prim) => {
  if (sources.has(prim)) return sources.get(prim);
  const node = json.nodes[owner.get(prim)];
  const source = {
    position: readAccessor(glb, prim.attributes.POSITION),
    normal: readAccessor(glb, prim.attributes.NORMAL),
    uv: readAccessor(glb, prim.attributes.TEXCOORD_0),
    matrix: world.get(owner.get(prim)),
  };
  if (node.skin !== undefined) {
    const skin = json.skins[node.skin];
    source.skin = {
      joints: readAccessor(glb, prim.attributes.JOINTS_0),
      weights: readAccessor(glb, prim.attributes.WEIGHTS_0),
      bind: readAccessor(glb, skin.inverseBindMatrices),
      nodes: skin.joints,
    };
  }
  sources.set(prim, source);
  return source;
};

const shrink = 1 / scale[0];
const posed = (prim, v) => {
  const source = sourceOf(prim);
  const p = [0, 1, 2].map((k) => source.position.data[v * 3 + k]);
  const n = [0, 1, 2].map((k) => source.normal.data[v * 3 + k]);
  const matrices = [];
  if (source.skin) {
    for (let k = 0; k < 4; k++) {
      const weight = source.skin.weights.data[v * 4 + k];
      if (!weight) continue;
      const joint = source.skin.joints.data[v * 4 + k];
      const bind = Array.from(source.skin.bind.data.slice(joint * 16, joint * 16 + 16));
      matrices.push([weight, multiply(world.get(source.skin.nodes[joint]), bind)]);
    }
  }
  if (!matrices.length) matrices.push([1, source.matrix]);
  const position = [0, 0, 0];
  const normal = [0, 0, 0];
  for (const [weight, m] of matrices) {
    const wp = apply(m, p, 1);
    const wn = apply(m, n, 0);
    for (let k = 0; k < 3; k++) { position[k] += weight * wp[k]; normal[k] += weight * wn[k]; }
  }
  const length = Math.hypot(...normal) || 1;
  return { position: position.map((c) => c * shrink), normal: normal.map((c) => c / length),
    uv: [source.uv.data[v * 2], source.uv.data[v * 2 + 1]] };
};

const taken = [];
const seat = new Map();
const indices = [];
for (const part of picked) {
  for (const v of part.indices) {
    const key = `${owner.get(part.prim)}:${v}`;
    if (!seat.has(key)) { seat.set(key, taken.length); taken.push({ prim: part.prim, v }); }
    indices.push(seat.get(key));
  }
}

const position = new Float32Array(taken.length * 3);
const normal = new Float32Array(taken.length * 3);
const uv = new Float32Array(taken.length * 2);
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
taken.forEach((t, i) => {
  const vertex = posed(t.prim, t.v);
  for (let k = 0; k < 3; k++) {
    position[i * 3 + k] = vertex.position[k];
    normal[i * 3 + k] = vertex.normal[k];
    if (vertex.position[k] < min[k]) min[k] = vertex.position[k];
    if (vertex.position[k] > max[k]) max[k] = vertex.position[k];
  }
  uv[i * 2] = vertex.uv[0];
  uv[i * 2 + 1] = vertex.uv[1];
});

const index = taken.length > UINT16_MAX ? new Uint32Array(indices) : new Uint16Array(indices);
const views = [Buffer.from(position.buffer), Buffer.from(normal.buffer), Buffer.from(uv.buffer), Buffer.from(index.buffer)];
const bin = Buffer.concat(views.map((v) => Buffer.concat([v, Buffer.alloc((4 - (v.length % 4)) % 4, 0)])));

let offset = 0;
const bufferViews = views.map((v, i) => {
  const view = { buffer: 0, byteOffset: offset, byteLength: v.length, target: i === 3 ? 34963 : 34962 };
  offset += v.length + ((4 - (v.length % 4)) % 4);
  return view;
});

const cut = {
  asset: {
    generator: 'tools/importeer/extract-part.mjs',
    version: '2.0',
    extras: { taaleiland: { ...json.asset.extras?.taaleiland, bronmodel: undefined, bronNaam: undefined } },
  },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{
    name,
    mesh: 0,
    scale,
    translation: [
      Math.fround(-((min[0] + max[0]) / 2) * scale[0]),
      Math.fround(-min[1] * scale[1]),
      Math.fround(-((min[2] + max[2]) / 2) * scale[2]),
    ],
  }],
  meshes: [{ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
  materials: [json.materials[picked[0].prim.material]],
  textures: json.textures,
  samplers: json.samplers,
  images: json.images,
  buffers: [{ byteLength: bin.length }],
  bufferViews,
  accessors: [
    { bufferView: 0, componentType: 5126, count: taken.length, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: taken.length, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: taken.length, type: 'VEC2' },
    { bufferView: 3, componentType: index.BYTES_PER_ELEMENT === 4 ? 5125 : 5123, count: indices.length, type: 'SCALAR' },
  ],
};

writeGlb(out, JSON.parse(JSON.stringify(cut)), bin, writeFileSync);
const size = [0, 1, 2].map((k) => ((max[k] - min[k]) * scale[k]).toFixed(3)).join(' x ');
console.log(`${dirname(id)}/${name}: ${indices.length / 3} tris, ${size}`);
