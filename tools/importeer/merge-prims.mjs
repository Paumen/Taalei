#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FLOAT = 5126;
const ATTRIBUTES = ['POSITION', 'NORMAL', 'TEXCOORD_0'];
const WIDTH = { POSITION: 3, NORMAL: 3, TEXCOORD_0: 2 };

const HELP = `merge-prims.mjs <kit>/<model>
  Folds the primitives of one mesh that share a material into one primitive in
  kits/workfiles/<kit>/<model>.glb. Nodes are left as they are, so a part on its
  own node keeps its own draw call.`;

const [id] = process.argv.slice(2);
if (!id) {
  console.log(HELP);
  process.exit(1);
}

const path = join(ROOT, 'kits', 'workfiles', `${id}.glb`);
const glb = readGlb(path);
const { json } = glb;
if (json.animations?.length || json.skins?.length) throw new Error(`${id}: animated or skinned models are not folded`);

const chunks = [];
const bufferViews = [];
const accessors = [];
let length = 0;

const add = (data, target, componentType, type, count, bounds) => {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const padding = (4 - (length % 4)) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); length += padding; }
  bufferViews.push({ buffer: 0, byteOffset: length, byteLength: buf.length, target });
  chunks.push(buf);
  length += buf.length;
  accessors.push({ bufferView: bufferViews.length - 1, componentType, count, type, ...bounds });
  return accessors.length - 1;
};

const bounds = (data, width) => {
  const min = new Array(width).fill(Infinity);
  const max = new Array(width).fill(-Infinity);
  for (let i = 0; i < data.length; i++) {
    const k = i % width;
    if (data[i] < min[k]) min[k] = data[i];
    if (data[i] > max[k]) max[k] = data[i];
  }
  return { min, max };
};

const indicesOf = (prim) => {
  const position = json.accessors[prim.attributes.POSITION];
  if (prim.indices === undefined) return Array.from({ length: position.count }, (_, i) => i);
  return Array.from(readAccessor(glb, prim.indices).data);
};

let folded = 0;
for (const mesh of json.meshes ?? []) {
  const groups = new Map();
  for (const prim of mesh.primitives ?? []) {
    if ((prim.mode ?? 4) !== 4) throw new Error(`${id}: primitive mode ${prim.mode} is not triangles`);
    const missing = ATTRIBUTES.filter((a) => prim.attributes[a] === undefined);
    if (missing.length) throw new Error(`${id}: primitive without ${missing.join(', ')}`);
    const key = String(prim.material ?? '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(prim);
  }

  const primitives = [];
  for (const prims of groups.values()) {
    const data = Object.fromEntries(ATTRIBUTES.map((a) => [a, []]));
    const indices = [];
    let offset = 0;
    for (const prim of prims) {
      for (const a of ATTRIBUTES) data[a].push(...readAccessor(glb, prim.attributes[a]).data);
      for (const i of indicesOf(prim)) indices.push(i + offset);
      offset += json.accessors[prim.attributes.POSITION].count;
    }
    const attributes = {};
    for (const a of ATTRIBUTES) {
      const width = WIDTH[a];
      attributes[a] = add(
        Float32Array.from(data[a]), 34962, FLOAT, width === 3 ? 'VEC3' : 'VEC2', data[a].length / width,
        a === 'POSITION' ? bounds(data[a], width) : {},
      );
    }
    const narrow = offset <= 0xffff;
    const index = add(
      narrow ? Uint16Array.from(indices) : Uint32Array.from(indices),
      34963, narrow ? 5123 : 5125, 'SCALAR', indices.length, {},
    );
    primitives.push({ ...prims[0], attributes, indices: index });
    folded += prims.length - 1;
  }
  mesh.primitives = primitives;
}

if (!folded) throw new Error(`${id}: no mesh holds two primitives on one material`);

json.accessors = accessors;
json.bufferViews = bufferViews;
const bin = Buffer.concat(chunks);
json.buffers = [{ byteLength: bin.length }];

writeGlb(path, json, bin, writeFileSync);
console.log(`${id}: ${folded} primitive(s) folded`);
