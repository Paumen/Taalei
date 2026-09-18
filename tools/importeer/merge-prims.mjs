#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FLOAT = 5126;
const ATTRIBUTES = ['POSITION', 'NORMAL', 'TEXCOORD_0'];
const WIDTH = { POSITION: 3, NORMAL: 3, TEXCOORD_0: 2 };

const HELP = `merge-prims.mjs <kit>/<model> [--flatten]
  Folds the primitives of one mesh that share a material into one primitive in
  kits/workfiles/<kit>/<model>.glb. Nodes are left as they are, so a part on its
  own node keeps its own draw call.
  --flatten  first bake every child node into the mesh of its root node and drop
             the child, so those parts fold too. Refused on a model that carries
             animations or skins.`;

const args = process.argv.slice(2);
const flatten = args.includes('--flatten');
const [id] = args.filter((a) => !a.startsWith('--'));
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

const baked = new Map();

const matrixOf = (node) => {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  if (Math.abs(sx - sy) > 1e-6 || Math.abs(sx - sz) > 1e-6) throw new Error(`${id}: non-uniform scale on a node is not flattened`);
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
};

const times = (a, b) => {
  const r = new Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) r[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
    }
  }
  return r;
};

const bakePrim = (prim, m) => {
  const position = Array.from(readAccessor(glb, prim.attributes.POSITION).data);
  const normal = Array.from(readAccessor(glb, prim.attributes.NORMAL).data);
  for (let i = 0; i < position.length; i += 3) {
    const [x, y, z] = [position[i], position[i + 1], position[i + 2]];
    position[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    position[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    position[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  for (let i = 0; i < normal.length; i += 3) {
    const [x, y, z] = [normal[i], normal[i + 1], normal[i + 2]];
    const v = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
    const len = Math.hypot(...v) || 1;
    for (let k = 0; k < 3; k++) normal[i + k] = v[k] / len;
  }
  baked.set(prim, {
    POSITION: position,
    NORMAL: normal,
    TEXCOORD_0: Array.from(readAccessor(glb, prim.attributes.TEXCOORD_0).data),
  });
  return prim;
};

let dropped = 0;
if (flatten) {
  const scene = json.scenes[json.scene ?? 0];
  for (const root of scene.nodes) {
    const node = json.nodes[root];
    const moved = [];
    const walk = (index, m) => {
      const child = json.nodes[index];
      const at = times(m, matrixOf(child));
      if (child.mesh !== undefined) {
        for (const prim of json.meshes[child.mesh].primitives) moved.push(bakePrim(structuredClone(prim), at));
      }
      for (const next of child.children ?? []) walk(next, at);
      dropped += 1;
    };
    for (const index of node.children ?? []) walk(index, new Array(16).fill(0).map((_, i) => (i % 5 === 0 ? 1 : 0)));
    if (!moved.length) continue;
    delete node.children;
    if (node.mesh === undefined) {
      json.meshes.push({ name: node.name, primitives: moved });
      node.mesh = json.meshes.length - 1;
    } else {
      json.meshes[node.mesh].primitives.push(...moved);
    }
  }

  const keep = new Set(json.scenes.flatMap((s) => s.nodes ?? []));
  const nodeIndex = new Map([...keep].map((index, at) => [index, at]));
  const meshes = [...new Set([...keep].map((index) => json.nodes[index].mesh).filter((m) => m !== undefined))];
  const meshIndex = new Map(meshes.map((index, at) => [index, at]));
  json.nodes = [...keep].map((index) => {
    const node = json.nodes[index];
    return node.mesh === undefined ? node : { ...node, mesh: meshIndex.get(node.mesh) };
  });
  json.meshes = meshes.map((index) => json.meshes[index]);
  for (const s of json.scenes) s.nodes = (s.nodes ?? []).map((index) => nodeIndex.get(index));
}

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
      for (const a of ATTRIBUTES) data[a].push(...(baked.get(prim)?.[a] ?? readAccessor(glb, prim.attributes[a]).data));
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

if (!folded && !dropped) throw new Error(`${id}: no mesh holds two primitives on one material`);

json.accessors = accessors;
json.bufferViews = bufferViews;
const bin = Buffer.concat(chunks);
json.buffers = [{ byteLength: bin.length }];

writeGlb(path, json, bin, writeFileSync);
console.log(`${id}: ${folded} primitive(s) folded${dropped ? `, ${dropped} node(s) baked in` : ''}`);
