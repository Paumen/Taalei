import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';
import { buildKindFields, withKindFields, tubeNeed } from '../../lint/rules.mjs';

const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const PARTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

export function rawRows(glb, index) {
  const accessor = glb.json.accessors[index];
  const Type = COMPONENT[accessor.componentType];
  const size = PARTS[accessor.type] * Type.BYTES_PER_ELEMENT;
  const view = glb.json.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const step = view.byteStride ?? size;
  return { size, row: (i) => glb.bin.subarray(start + i * step, start + i * step + size) };
}

export function repack(glb, replaced) {
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
  const whole = (index) => {
    const view = json.bufferViews[index];
    return push(Buffer.from(glb.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)), view);
  };
  for (const image of json.images ?? []) {
    if (image.bufferView !== undefined) image.bufferView = whole(image.bufferView);
  }
  json.accessors.forEach((accessor, index) => {
    if (accessor.sparse && accessor.bufferView !== undefined) throw new Error('sparse accessor on a bufferView is not supported');
    if (accessor.sparse) {
      accessor.sparse.indices.bufferView = whole(accessor.sparse.indices.bufferView);
      accessor.sparse.values.bufferView = whole(accessor.sparse.values.bufferView);
      return;
    }
    if (accessor.bufferView === undefined) return;
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

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);

export const faceNormal = (p, a, b, c) => {
  const u = [0, 1, 2].map((k) => p[b * 3 + k] - p[a * 3 + k]);
  const v = [0, 1, 2].map((k) => p[c * 3 + k] - p[a * 3 + k]);
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
};

export function fixBounds(glb) {
  let fixed = 0;
  glb.json.accessors.forEach((accessor, index) => {
    if (accessor.bufferView === undefined || (!accessor.min && !accessor.max)) return;
    const { data, width, count } = readAccessor(glb, index);
    const min = new Array(width).fill(Infinity);
    const max = new Array(width).fill(-Infinity);
    for (let i = 0; i < count; i++) for (let k = 0; k < width; k++) {
      min[k] = Math.min(min[k], data[i * width + k]);
      max[k] = Math.max(max[k], data[i * width + k]);
    }
    const same = (a, b) => a && a.length === b.length && a.every((v, k) => v === b[k]);
    if (same(accessor.min, min) && same(accessor.max, max)) return;
    if (accessor.min) accessor.min = min;
    if (accessor.max) accessor.max = max;
    fixed++;
  });
  return fixed;
}

const WELD = 1e-5;

export function welder(pos) {
  let extent = 0;
  for (const v of pos) extent = Math.max(extent, Math.abs(v));
  const eps = Math.max(1e-7, extent * WELD);
  const ids = new Map();
  const weld = (v) => {
    const key = [0, 1, 2].map((k) => Math.round(pos[v * 3 + k] / eps)).join(',');
    if (!ids.has(key)) ids.set(key, ids.size);
    return ids.get(key);
  };
  return { eps, weld };
}

export function editablePrimitives(json) {
  const prims = (json.meshes ?? []).flatMap((m) => m.primitives ?? []);
  const uses = new Map();
  const accessorsOf = (prim) => [prim.indices, ...Object.values(prim.attributes), ...(prim.targets ?? []).flatMap((t) => Object.values(t))];
  for (const prim of prims) for (const a of accessorsOf(prim)) uses.set(a, (uses.get(a) ?? 0) + 1);
  return prims.filter((prim) => (prim.mode ?? 4) === 4
    && prim.indices !== undefined
    && json.accessors[prim.attributes.POSITION]?.componentType === 5126
    && accessorsOf(prim).every((a) => uses.get(a) === 1 && json.accessors[a].bufferView !== undefined && !json.accessors[a].sparse));
}

export function primitiveMatrix(json, prim) {
  const world = worldMatrices(json);
  const meshIndex = json.meshes.findIndex((m) => m.primitives.includes(prim));
  const node = (json.nodes ?? []).findIndex((n, i) => n.mesh === meshIndex && world[i]);
  return node < 0 ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] : world[node];
}

export function vec3View(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  if (accessor.componentType !== 5126 || accessor.type !== 'VEC3' || accessor.sparse) throw new Error('expects float VEC3');
  const view = glb.json.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const step = view.byteStride ?? 12;
  return (i) => new Float32Array(glb.bin.buffer, glb.bin.byteOffset + start + i * step, 3);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
let catalogModels = null;
let kindFields = null;

export function catalogTubeNeed(file) {
  if (!catalogModels) {
    catalogModels = new Map(readJson('catalog/build/catalog.json').models.map((m) => [`${m.kit}/${m.name}`, m]));
    kindFields = buildKindFields(readJson('lint/kinds.json'));
  }
  const model = catalogModels.get(`${basename(dirname(resolve(file)))}/${basename(file, '.glb')}`);
  return model ? tubeNeed(withKindFields(model, kindFields)) : null;
}

export function vertexAdder(glb, prim) {
  const { json } = glb;
  const base = json.accessors[prim.attributes.POSITION].count;
  const added = [];
  return {
    add(from, set = {}) {
      added.push({ from, set });
      return base + added.length - 1;
    },
    commit(indices, replaced) {
      const write = (index, name) => {
        const accessor = json.accessors[index];
        const { size, row } = rawRows(glb, index);
        const bytes = Buffer.alloc(size * (base + added.length));
        for (let i = 0; i < base; i++) row(i).copy(bytes, i * size);
        added.forEach(({ from, set }, k) => {
          const at = (base + k) * size;
          const value = name && set[name];
          if (value === undefined) row(from).copy(bytes, at);
          else if (Number.isInteger(value)) row(value).copy(bytes, at);
          else Buffer.from(Float32Array.from(value).buffer).copy(bytes, at);
        });
        accessor.count = base + added.length;
        replaced.set(index, bytes);
      };
      if (added.length) {
        for (const [name, index] of Object.entries(prim.attributes)) write(index, name);
        for (const target of prim.targets ?? []) for (const index of Object.values(target)) write(index, null);
      }
      const accessor = json.accessors[prim.indices];
      const count = base + added.length;
      const [Type, code] = accessor.componentType === 5121 && count <= 256 ? [Uint8Array, 5121]
        : accessor.componentType !== 5125 && count <= 65536 ? [Uint16Array, 5123] : [Uint32Array, 5125];
      const data = Type.from(indices);
      accessor.componentType = code;
      accessor.count = data.length;
      replaced.set(prim.indices, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    },
  };
}


export function buildTree(tris) {
  const box = (i) => {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const p of tris[i]) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], p[k]); b[3 + k] = Math.max(b[3 + k], p[k]); }
    return b;
  };
  const boxes = tris.map((_, i) => box(i));
  const order = tris.map((_, i) => i);
  const build = (start, end) => {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i++) for (let k = 0; k < 3; k++) {
      b[k] = Math.min(b[k], boxes[order[i]][k]);
      b[3 + k] = Math.max(b[3 + k], boxes[order[i]][3 + k]);
    }
    const node = { b, start, end };
    if (end - start <= 6) return node;
    const extent = [0, 1, 2].map((k) => b[3 + k] - b[k]);
    const axis = extent.indexOf(Math.max(...extent));
    const mid = (i) => boxes[i][axis] + boxes[i][3 + axis];
    const part = order.slice(start, end).sort((p, q) => mid(p) - mid(q));
    order.splice(start, end - start, ...part);
    const half = (start + end) >> 1;
    node.left = build(start, half);
    node.right = build(half, end);
    return node;
  };
  return { root: build(0, tris.length), order };
}

export function hitBox(b, o, inv, far) {
  let near = 0;
  for (let k = 0; k < 3; k++) {
    let t0 = (b[k] - o[k]) * inv[k], t1 = (b[3 + k] - o[k]) * inv[k];
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    if (near > far) return false;
  }
  return true;
}

export function hitTriangle(o, d, [a, b, c]) {
  const e1 = sub(b, a), e2 = sub(c, a);
  const p = cross(d, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-18) return -1;
  const s = sub(o, a);
  const u = dot(s, p) / det;
  if (u < 0 || u > 1) return -1;
  const q = cross(s, e1);
  const v = dot(d, q) / det;
  if (v < 0 || u + v > 1) return -1;
  return dot(e2, q) / det;
}

export function throughDepth(tree, tris, normals, o, d, far, near) {
  const inv = d.map((x) => 1 / x);
  const hits = [];
  const stack = [tree.root];
  while (stack.length) {
    const node = stack.pop();
    if (!hitBox(node.b, o, inv, far)) continue;
    if (node.left) { stack.push(node.left, node.right); continue; }
    for (let i = node.start; i < node.end; i++) {
      const t = tree.order[i];
      const at = hitTriangle(o, d, tris[t]);
      const facing = dot(normals[t], d);
      if (at > near && Math.abs(facing) > 1e-9) hits.push([at, facing]);
    }
  }
  hits.sort((a, b) => a[0] - b[0]);
  let depth = 1;
  for (const [at, facing] of hits) {
    depth += facing > 0 ? -1 : 1;
    if (depth === 0) return at;
  }
  return null;
}
