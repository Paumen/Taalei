import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor, thinnestWall, thinnestPart } from '../../catalog/tools/glb.mjs';
import { editablePrimitives, primitiveMatrix, buildTree, hitBox, hitTriangle, dot, sub, cross, repack, fixBounds } from '../import/mesh-edit.mjs';
import { buildKindFields, withKindFields, measureFindingsFor, materialIdsOf } from '../../lint/rules.mjs';
import { read, VARS } from '../../lint/report.mjs';

export const FLOOR = 0.006;
const floor4 = (v) => (v === null || v === undefined ? null : Math.floor(v * 1e4) / 1e4);

export function loadMesh(file) {
  const glb = readGlb(file);
  const prim = editablePrimitives(glb.json)[0];
  const M = primitiveMatrix(glb.json, prim);
  const L = readAccessor(glb, prim.attributes.POSITION).data;
  const idx = Array.from(readAccessor(glb, prim.indices).data);
  const P = [];
  for (let i = 0; i < L.length; i += 3) P.push([0, 1, 2].map((r) => M[r] * L[i] + M[4 + r] * L[i + 1] + M[8 + r] * L[i + 2] + M[12 + r]));
  const key = (p) => p.map((x) => Math.round(x * 1e4)).join(',');
  const ids = new Map();
  const vid = P.map((p) => { const k = key(p); if (!ids.has(k)) ids.set(k, ids.size); return ids.get(k); });
  const parent = [...ids.keys()].map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const tris = [];
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const w = [idx[t], idx[t + 1], idx[t + 2]];
    const p = w.map((i) => P[i]);
    const n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const len = Math.hypot(...n);
    if (len < 1e-12) continue;
    tris.push({ at: t / 3, w, p, n: n.map((x) => x / len), area: len / 2, k: w.map((i) => vid[i]), c: [0, 1, 2].map((r) => (p[0][r] + p[1][r] + p[2][r]) / 3) });
  }
  for (const t of tris) for (const j of [1, 2]) { const a = find(t.k[0]), b = find(t.k[j]); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
  const parts = new Map();
  for (const t of tris) { t.part = find(t.k[0]); (parts.get(t.part) ?? parts.set(t.part, []).get(t.part)).push(t); }
  const tree = buildTree(tris.map((t) => t.p));
  return { file, glb, prim, M, P, idx, vid, tris, parts, tree };
}

export function hits(mesh, o, d, far = Infinity) {
  const inv = d.map((x) => 1 / x);
  const out = [];
  const stack = [mesh.tree.root];
  while (stack.length) {
    const node = stack.pop();
    if (!hitBox(node.b, o, inv, far)) continue;
    if (node.left) { stack.push(node.left, node.right); continue; }
    for (let i = node.start; i < node.end; i++) {
      const t = mesh.tris[mesh.tree.order[i]];
      const at = hitTriangle(o, d, t.p);
      if (at > 1e-6 && at < far) out.push([at, t]);
    }
  }
  return out;
}

export function faceWall(mesh, t, far = 0.05) {
  const d = t.n.map((x) => -x);
  let wall = Infinity;
  for (const [at, b] of hits(mesh, t.c, d, far)) {
    if (b === t || b.part !== t.part || dot(b.n, t.n) > -0.9 || b.k.some((k) => t.k.includes(k))) continue;
    if (at < wall) wall = at;
  }
  return wall;
}

export function directions(count) {
  const out = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const r = Math.sqrt(1 - y * y);
    out.push([Math.cos(golden * i) * r, y, Math.sin(golden * i) * r]);
  }
  return out;
}

const SAMPLES = [[1, 1, 1], [8, 1, 1], [1, 8, 1], [1, 1, 8], [4, 4, 1], [1, 4, 4], [4, 1, 4], [3, 3, 1], [1, 3, 3], [3, 1, 3], [6, 2, 1], [1, 6, 2], [2, 1, 6]].map((w) => { const s = w[0] + w[1] + w[2]; return w.map((x) => x / s); });

export function isVisible(mesh, t, dirs, extent) {
  for (const [a, b, c] of SAMPLES) {
    const q = [0, 1, 2].map((r) => a * t.p[0][r] + b * t.p[1][r] + c * t.p[2][r] + t.n[r] * 1e-6);
    for (const d of dirs) {
      if (dot(d, t.n) <= 0.02) continue;
      if (!hits(mesh, q, d, extent).some(([, h]) => h !== t)) return true;
    }
  }
  return false;
}

export function extentOf(mesh) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of mesh.P) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  return { lo, hi, size: hi.map((x, k) => x - lo[k]), diag: Math.hypot(...hi.map((x, k) => x - lo[k])) };
}

export function measure(file) {
  const glb = readGlb(file);
  return { minWall: floor4(thinnestWall(glb)), minTube: floor4(thinnestPart(glb)) };
}

let lintCache = null;
function lintSetup() {
  if (lintCache) return lintCache;
  const { rows } = read(VARS.measures);
  const materials = read(VARS.materials);
  lintCache = {
    rows: rows.filter((r) => r.id === 'G27'),
    kindFields: buildKindFields(read(VARS.kinds)),
    models: read(VARS.models).models,
    materialIds: materialIdsOf(materials),
    lanes: new Map(Object.entries(materials.bands)),
  };
  return lintCache;
}

export function catalogModel(id) {
  const { models, kindFields } = lintSetup();
  const m = models.find((x) => `${x.kit}/${x.name}` === id);
  return m ? withKindFields(m, kindFields) : null;
}

export function catalogModels() {
  const { models, kindFields } = lintSetup();
  return models.map((m) => withKindFields(m, kindFields));
}

export function g27(model, override = {}) {
  const { rows, materialIds, kindFields, lanes } = lintSetup();
  return measureFindingsFor({ ...model, ...override }, rows, materialIds, VARS, kindFields, lanes);
}

export const targetOf = (model) => Math.max(FLOOR, model.thinmin ?? 0);

export function dropHidden(inFile, outFile, { wall = null, dirs = 1024 } = {}) {
  const mesh = loadMesh(inFile);
  const all = directions(dirs);
  const far = extentOf(mesh).diag * 2;
  const drop = new Set();
  for (const t of mesh.tris) {
    if (wall !== null && faceWall(mesh, t) >= wall) continue;
    if (!isVisible(mesh, t, all, far)) drop.add(t.at);
  }
  const keep = [];
  for (let t = 0; t * 3 + 2 < mesh.idx.length; t++) if (!drop.has(t)) keep.push(mesh.idx[t * 3], mesh.idx[t * 3 + 1], mesh.idx[t * 3 + 2]);
  const accessor = mesh.glb.json.accessors[mesh.prim.indices];
  const wide = accessor.componentType === 5125 || Math.max(...keep) > 65535;
  accessor.componentType = wide ? 5125 : 5123;
  accessor.count = keep.length;
  repack(mesh.glb, new Map([[mesh.prim.indices, Buffer.from(new (wide ? Uint32Array : Uint16Array)(keep).buffer)]]));
  fixBounds(mesh.glb);
  writeGlb(outFile, mesh.glb.json, mesh.glb.bin, writeFileSync);
  return { dropped: drop.size, tris: mesh.idx.length / 3 };
}

export function tidy(inFile, outFile, refFile) {
  const ref = loadMesh(refFile);
  const mesh = loadMesh(inFile);
  const { glb, prim } = mesh;
  let fixed = 0;
  if (prim.attributes.NORMAL !== undefined && ref.P.length === mesh.P.length) {
    const moved = mesh.P.map((p, i) => Math.hypot(...sub(p, ref.P[i])) > 1e-7);
    const L = readAccessor(glb, prim.attributes.POSITION).data;
    const acc = mesh.P.map(() => [0, 0, 0]);
    for (let t = 0; t + 2 < mesh.idx.length; t += 3) {
      const w = [mesh.idx[t], mesh.idx[t + 1], mesh.idx[t + 2]];
      if (!w.some((i) => moved[i])) continue;
      const q = w.map((i) => [L[i * 3], L[i * 3 + 1], L[i * 3 + 2]]);
      const n = cross(sub(q[1], q[0]), sub(q[2], q[0]));
      for (const i of w) for (let k = 0; k < 3; k++) acc[i][k] += n[k];
    }
    const N = Float32Array.from(readAccessor(glb, prim.attributes.NORMAL).data);
    acc.forEach((n, i) => {
      if (!moved[i]) return;
      const len = Math.hypot(...n);
      if (!(len > 0)) return;
      for (let k = 0; k < 3; k++) N[i * 3 + k] = n[k] / len;
      fixed++;
    });
    repack(glb, new Map([[prim.attributes.NORMAL, Buffer.from(N.buffer)]]));
  }
  const lo = (P) => Math.min(...P.map((p) => p[1]));
  const lift = lo(ref.P) - lo(mesh.P);
  if (Math.abs(lift) > 1e-7) {
    const meshIndex = glb.json.meshes.findIndex((m) => m.primitives.includes(prim));
    const node = glb.json.nodes.find((n) => n.mesh === meshIndex);
    if (node.matrix) node.matrix[13] += lift;
    else node.translation = [node.translation?.[0] ?? 0, (node.translation?.[1] ?? 0) + lift, node.translation?.[2] ?? 0];
  }
  fixBounds(glb);
  writeGlb(outFile, glb.json, glb.bin, writeFileSync);
  return { normals: fixed, lift };
}

export function backShare(mesh) {
  const box = extentOf(mesh);
  const centre = box.lo.map((x, k) => x + box.size[k] / 2);
  const R = box.diag / 2 + 1e-3;
  let seen = 0, back = 0;
  for (const d of directions(26)) {
    const up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = cross(d, up), ul = Math.hypot(...u);
    const e1 = u.map((x) => x / ul), e2 = cross(d, e1);
    for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) {
      const a = ((i + 0.5) / 40 - 0.5) * 2 * R, b = ((j + 0.5) / 40 - 0.5) * 2 * R;
      const o = [0, 1, 2].map((k) => centre[k] - d[k] * R * 2 + e1[k] * a + e2[k] * b);
      const h = hits(mesh, o, d, R * 4);
      if (!h.length) continue;
      const [, t] = h.reduce((m, x) => (x[0] < m[0] ? x : m));
      seen++;
      if (dot(t.n, d) > 0) back++;
    }
  }
  return seen ? back / seen : 0;
}
