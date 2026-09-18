import { readFileSync } from 'node:fs';

export function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`not a valid GLB: ${path}`);
  }
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`first chunk is not JSON: ${path}`);

  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));

  let bin = null;
  let offset = 20 + jsonLength;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    if (type === 0x004e4942) bin = buf.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length;
  }

  return { json, bin };
}

export function writeGlb(path, json, bin, writeFile) {
  const padding = (n) => (4 - (n % 4)) % 4;
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(padding(jsonBuf.length), 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc(padding(bin.length), 0)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  writeFile(path, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]));
}

const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiplyMatrix(a, b) {
  const r = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
      r[column * 4 + row] = sum;
    }
  }
  return r;
}

function nodeMatrix(node) {
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
}

const multiplyPoint = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const PARTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function readAccessor({ json, bin }, index) {
  const accessor = json.accessors[index];
  if (accessor.sparse) throw new Error('sparse accessor is not supported');

  const Type = COMPONENT[accessor.componentType];
  const width = PARTS[accessor.type];
  const bufferView = json.bufferViews[accessor.bufferView];
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const step = bufferView.byteStride ?? width * Type.BYTES_PER_ELEMENT;

  const out = new Float64Array(accessor.count * width);
  for (let i = 0; i < accessor.count; i++) {
    const row = new Type(bin.buffer, bin.byteOffset + start + i * step, width);
    for (let k = 0; k < width; k++) out[i * width + k] = row[k];
  }
  return { data: out, width, count: accessor.count };
}

// The UV-carrying primitives of a model, in file order, each with the vertex groups
// its index buffer ties together. A shell is one such group: flat shading splits
// vertices along every hard edge, so a part is many shells, not one. The lowest
// member vertex names a shell, so the numbering follows the file rather than the
// order the groups happened to close in, and stays the same between tools.
export function meshShells(glb) {
  const { json } = glb;
  const out = [];
  const seen = new Set();
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const uv = prim.attributes?.TEXCOORD_0;
      if (uv === undefined || seen.has(uv)) continue;
      seen.add(uv);
      const count = json.accessors[uv].count;
      const parent = new Int32Array(count);
      for (let i = 0; i < count; i++) parent[i] = i;
      const find = (i) => {
        while (parent[i] !== i) i = parent[i] = parent[parent[i]];
        return i;
      };
      const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
      };
      if (prim.indices !== undefined) {
        const idx = readAccessor(glb, prim.indices);
        for (let t = 0; t + 2 < idx.count; t += 3) {
          union(idx.data[t], idx.data[t + 1]);
          union(idx.data[t + 1], idx.data[t + 2]);
        }
      }
      const groups = new Map();
      for (let i = 0; i < count; i++) {
        const root = find(i);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(i);
      }
      const members = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, m]) => m);
      out.push({ mesh: mesh.name ?? '', prim, uv, count, members });
    }
  }
  return out;
}

// The parts of a model, for a file that names none. Flat shading splits a vertex along
// every hard edge, so shells of one object still share exact positions while two objects
// that only intersect in space share none: welding shells by position separates the
// arrows from the shield they are stuck in. What that leaves is every peg and stud on a
// tile of its own, so the smallest part joins the one it sits nearest -- by the gap
// between their boxes, a part inside another scoring zero -- until `want` are left. A
// part never crosses a primitive: merging across one would make it draw in two
// materials, so a model with more primitives than `want` keeps one part each.
export function meshParts(glb, want = 8) {
  const parts = [];
  for (const group of meshShells(glb)) {
    const pos = readAccessor(glb, group.prim.attributes.POSITION);
    const idx = readAccessor(glb, group.prim.indices);
    const key = (i) => [0, 1, 2].map((k) => Math.round(pos.data[i * 3 + k] * 1e4)).join(',');
    const parent = group.members.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    const owner = new Map();
    group.members.forEach((members, s) => {
      for (const v of members) {
        const k = key(v);
        if (owner.has(k)) {
          const a = find(owner.get(k)); const b = find(s);
          if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
        } else owner.set(k, s);
      }
    });
    const of = new Map();
    group.members.forEach((members, s) => { for (const v of members) of.set(v, find(s)); });
    const byRoot = new Map();
    for (let t = 0; t + 2 < idx.count; t += 3) {
      const root = of.get(idx.data[t]);
      if (!byRoot.has(root)) byRoot.set(root, []);
      byRoot.get(root).push(idx.data[t], idx.data[t + 1], idx.data[t + 2]);
    }
    for (const [, indices] of byRoot) parts.push({ prim: group.prim, pos, indices });
  }

  const measure = (p) => {
    const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    for (const v of new Set(p.indices)) for (let k = 0; k < 3; k++) {
      const c = p.pos.data[v * 3 + k];
      if (c < lo[k]) lo[k] = c;
      if (c > hi[k]) hi[k] = c;
    }
    p.lo = lo; p.hi = hi;
    p.span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  };
  parts.forEach(measure);

  const gap = (a, b) => {
    let d = 0;
    for (let k = 0; k < 3; k++) {
      const over = Math.max(a.lo[k] - b.hi[k], b.lo[k] - a.hi[k], 0);
      d += over * over;
    }
    return Math.sqrt(d);
  };

  let left = parts;
  while (left.length > want) {
    left.sort((a, b) => a.span - b.span);
    // the smallest part of a primitive that holds only it has nowhere to go; the next
    // smallest still might, so pass over it rather than stopping the whole merge
    const small = left.find((p) => left.some((q) => q !== p && q.prim === p.prim));
    if (!small) break;
    const hosts = left.filter((p) => p !== small && p.prim === small.prim);
    const host = hosts.reduce((best, p) => {
      const d = gap(small, p); const bd = gap(small, best);
      if (d < bd - 1e-6) return p;
      return d < bd + 1e-6 && p.span > best.span ? p : best;
    }, hosts[0]);
    host.indices.push(...small.indices);
    measure(host);
    left = left.filter((p) => p !== small);
  }
  return left.sort((a, b) => b.indices.length - a.indices.length);
}

const STRICT_ANGLES = [0, 30, 45, 60, 90];
const STRICT_TOLERANCE = 2;

function isStrictAngle(component) {
  const degrees = Math.acos(Math.min(1, Math.abs(component))) * (180 / Math.PI);
  return STRICT_ANGLES.some((a) => Math.abs(degrees - a) < STRICT_TOLERANCE);
}

export function measureScene(glb) {
  const { json } = glb;
  const nodes = json.nodes ?? [];
  const scene = json.scenes?.[json.scene ?? 0];

  const world = new Array(nodes.length).fill(null);
  const setWorld = (index, parent) => {
    if (world[index]) return;
    const node = nodes[index];
    if (!node) return;
    world[index] = multiplyMatrix(parent, nodeMatrix(node));
    for (const child of node.children ?? []) setWorld(child, world[index]);
  };
  for (const index of scene?.nodes ?? []) setWorld(index, IDENTITY_MATRIX);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const grab = (p) => {
    for (let axis = 0; axis < 3; axis++) {
      if (p[axis] < min[axis]) min[axis] = p[axis];
      if (p[axis] > max[axis]) max[axis] = p[axis];
    }
  };

  let triangles = 0;
  let calls = 0;
  let vertices = 0;
  let surfaceArea = 0;
  let minEdgeSq = Infinity;
  let strictArea = 0;

  const processTriangle = (a, b, c) => {
    const abx = a[0] - b[0], aby = a[1] - b[1], abz = a[2] - b[2];
    const cbx = c[0] - b[0], cby = c[1] - b[1], cbz = c[2] - b[2];
    const cax = c[0] - a[0], cay = c[1] - a[1], caz = c[2] - a[2];

    const lenAb = abx * abx + aby * aby + abz * abz;
    const lenCb = cbx * cbx + cby * cby + cbz * cbz;
    const lenCa = cax * cax + cay * cay + caz * caz;
    if (lenAb > 0 && lenAb < minEdgeSq) minEdgeSq = lenAb;
    if (lenCb > 0 && lenCb < minEdgeSq) minEdgeSq = lenCb;
    if (lenCa > 0 && lenCa < minEdgeSq) minEdgeSq = lenCa;

    const nx = cby * abz - cbz * aby;
    const ny = cbz * abx - cbx * abz;
    const nz = cbx * aby - cby * abx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const area = len / 2;
    surfaceArea += area;
    if (area > 0 && isStrictAngle(nx / len) && isStrictAngle(ny / len) && isStrictAngle(nz / len)) {
      strictArea += area;
    }
  };

  nodes.forEach((node, index) => {
    if (node.mesh === undefined || !world[index]) return;

    for (const prim of json.meshes[node.mesh].primitives ?? []) {
      calls++;

      const count = prim.indices !== undefined
        ? json.accessors[prim.indices]
        : json.accessors[prim.attributes.POSITION];
      const isTriangles = (prim.mode ?? 4) === 4;
      if (isTriangles) triangles += Math.floor((count?.count ?? 0) / 3);

      const position = readAccessor(glb, prim.attributes.POSITION);
      vertices += position.count;
      const skin = node.skin !== undefined && prim.attributes.JOINTS_0 !== undefined
        ? json.skins[node.skin]
        : null;

      const world_ = new Array(position.count);
      if (!skin) {
        for (let v = 0; v < position.count; v++) {
          const p = multiplyPoint(world[index], position.data[v * 3], position.data[v * 3 + 1], position.data[v * 3 + 2]);
          world_[v] = p;
          grab(p);
        }
      } else {
        const bind = readAccessor(glb, skin.inverseBindMatrices);
        const joints = readAccessor(glb, prim.attributes.JOINTS_0);
        const weightsData = readAccessor(glb, prim.attributes.WEIGHTS_0);
        const skinMatrix = skin.joints.map((node, k) =>
          multiplyMatrix(world[node] ?? IDENTITY_MATRIX, Array.from(bind.data.slice(k * 16, k * 16 + 16))),
        );

        for (let v = 0; v < position.count; v++) {
          const [x, y, z] = [position.data[v * 3], position.data[v * 3 + 1], position.data[v * 3 + 2]];
          const out = [0, 0, 0];
          let sum = 0;
          for (let k = 0; k < 4; k++) {
            const weight = weightsData.data[v * 4 + k];
            if (!weight) continue;
            const m = skinMatrix[joints.data[v * 4 + k]];
            if (!m) continue;
            sum += weight;
            const p = multiplyPoint(m, x, y, z);
            for (let axis = 0; axis < 3; axis++) out[axis] += weight * p[axis];
          }
          const p = sum === 0 ? multiplyPoint(world[index], x, y, z) : out.map((v) => v / sum);
          world_[v] = p;
          grab(p);
        }
      }

      if (!isTriangles) continue;
      const indices = prim.indices !== undefined ? readAccessor(glb, prim.indices) : null;
      const at = (i) => world_[indices ? indices.data[i] : i];
      for (let i = 0; i + 2 < (indices ? indices.count : position.count); i += 3) {
        processTriangle(at(i), at(i + 1), at(i + 2));
      }
    }
  });

  const round = (v) => Math.round(v * 1000) / 1000;
  const measure = (axis) => (min[axis] === Infinity ? 0 : round(max[axis] - min[axis]));
  const size = [measure(0), measure(1), measure(2)];
  const exact = (axis) => (min[axis] === Infinity ? 0 : max[axis] - min[axis]);

  return {
    wdh: [size[0], size[2], size[1]],
    wdhExact: [exact(0), exact(2), exact(1)],
    min: min.map((v) => (Number.isFinite(v) ? round(v) : 0)),
    max: max.map((v) => (Number.isFinite(v) ? round(v) : 0)),
    triangles,
    calls,
    vertices,
    isGridModular: [size[0], size[2]].every((v) => v > 0 && (v % 0.25 < 0.02 || v % 0.25 > 0.23)),
    isGrounded: Number.isFinite(min[1]) && Math.abs(min[1]) < 0.02,
    pivotIsCenter: Number.isFinite(min[0]) && Math.abs((min[0] + max[0]) / 2) < 0.02 && Math.abs((min[2] + max[2]) / 2) < 0.02,
    minEdgeLength: minEdgeSq === Infinity ? 0 : round(Math.sqrt(minEdgeSq)),
    averageTriangleArea: triangles > 0 ? surfaceArea / triangles : 0,
    strictAnglePercent: surfaceArea > 0 ? (strictArea / surfaceArea) * 100 : 0,
  };
}

export function trianglesPerUnit(triangles, wdh) {
  if (wdh.some((size) => size === 0)) return null;
  const cells = Math.max(0.49, wdh[0] * wdh[1]) * Math.max(0.7, wdh[2]);
  return Math.round(triangles / cells);
}
