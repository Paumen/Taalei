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
  footprint centre. Parts of one model that carry different materials cannot be cut
  together: the result would draw twice.`;

const [id, list, name] = process.argv.slice(2);
if (!id) {
  console.log(HELP);
  process.exit(1);
}

const path = join(ROOT, 'kits', 'workfiles', `${id}.glb`);
const glb = readGlb(path);
const { json } = glb;
if (json.animations?.length || json.skins?.length) throw new Error(`${id}: animated or skinned models are not cut`);

const parts = meshParts(glb, Infinity);

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
if (picked.some((p) => p.prim !== picked[0].prim)) throw new Error(`${id}: those parts carry different materials`);

const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
if (roots.length !== 1) throw new Error(`${id}: wants one root node, found ${roots.length}`);
const root = json.nodes[roots[0]];
if (root.matrix || root.rotation) throw new Error(`${id}: root node carries a matrix or a rotation`);

const out = join(ROOT, 'kits', 'workfiles', dirname(id), `${name}.glb`);
if (existsSync(out)) throw new Error(`${name}: already a workfile of this kit`);

const { prim } = picked[0];
const source = {
  position: readAccessor(glb, prim.attributes.POSITION),
  normal: readAccessor(glb, prim.attributes.NORMAL),
  uv: readAccessor(glb, prim.attributes.TEXCOORD_0),
};

const taken = [];
const seat = new Map();
const indices = [];
for (const part of picked) {
  for (const v of part.indices) {
    if (!seat.has(v)) { seat.set(v, taken.length); taken.push(v); }
    indices.push(seat.get(v));
  }
}

const position = new Float32Array(taken.length * 3);
const normal = new Float32Array(taken.length * 3);
const uv = new Float32Array(taken.length * 2);
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
taken.forEach((v, i) => {
  for (let k = 0; k < 3; k++) {
    const c = source.position.data[v * 3 + k];
    position[i * 3 + k] = c;
    normal[i * 3 + k] = source.normal.data[v * 3 + k];
    if (c < min[k]) min[k] = c;
    if (c > max[k]) max[k] = c;
  }
  uv[i * 2] = source.uv.data[v * 2];
  uv[i * 2 + 1] = source.uv.data[v * 2 + 1];
});

const scale = root.scale ?? [1, 1, 1];
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
    extras: { taaleiland: { ...json.asset.extras?.taaleiland, bronmodel: undefined } },
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
  materials: [json.materials[prim.material]],
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
