import { readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';

export const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
export const PARTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

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

export const WELD = 1e-5;

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

export function meshScale(json, prim) {
  const m = primitiveMatrix(json, prim);
  return Math.cbrt(Math.abs(
    m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]),
  )) || 1;
}

export function sceneTriangles(glb) {
  const { json } = glb;
  const world = worldMatrices(json);
  const out = [];
  (json.nodes ?? []).forEach((node, i) => {
    if (node.mesh === undefined || !world[i]) return;
    const m = world[i];
    for (const prim of json.meshes[node.mesh].primitives ?? []) {
      if ((prim.mode ?? 4) !== 4 || prim.attributes.POSITION === undefined) continue;
      const pos = readAccessor(glb, prim.attributes.POSITION).data;
      const count = pos.length / 3;
      const idx = prim.indices !== undefined ? readAccessor(glb, prim.indices).data : Array.from({ length: count }, (_, k) => k);
      for (const v of idx) {
        const [x, y, z] = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
        out.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
      }
    }
  });
  return Float64Array.from(out);
}

export function writeVec3(glb, accessorIndex, i, values) {
  const accessor = glb.json.accessors[accessorIndex];
  const view = glb.json.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  new Float32Array(glb.bin.buffer, glb.bin.byteOffset + start + i * (view.byteStride ?? 12), 3).set(values);
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
