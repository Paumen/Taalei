import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor, thinnestWall } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix } from '../import/mesh-edit.mjs';

const HELP = `thicken.mjs <in.glb> --to <wall> [--out <out.glb>] [--parts ids] [--list]
Grows every closed part whose wall is under <wall> by pushing each face out
along its normal, so the part keeps its triangles and shape. Single sheets and
thin layers lying on another part are left alone and listed.
--list prints parts and walls only. --parts limits the change to those ids.
--away grows only the faces turned away from the model's centre, so inner
parts are not covered.
--sheet moves each point only along its biggest face's normal, so thin
sheets and blades get thicker without growing wider or losing sharp edges.`;

const LAYER = 0.026, GAP = 0.002, SHARE = 0.2, FACING = -0.9, MIN_AREA = 0.002;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function ray(o, d, [a, b, c]) {
  const e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
  if (Math.abs(det) < 1e-14) return null;
  const s = sub(o, a), u = dot(s, h) / det;
  if (u < -1e-6 || u > 1 + 1e-6) return null;
  const q = cross(s, e1), v = dot(d, q) / det;
  if (v < -1e-6 || u + v > 1 + 1e-6) return null;
  return dot(e2, q) / det;
}

function solve(normals, delta) {
  const A = [[1e-6, 0, 0], [0, 1e-6, 0], [0, 0, 1e-6]], b = [0, 0, 0];
  for (const { n, d } of normals) for (let i = 0; i < 3; i++) {
    b[i] += n[i] * d;
    for (let j = 0; j < 3; j++) A[i][j] += n[i] * n[j];
  }
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  const x = [0, 1, 2].map((k) => det(A.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)))) / D);
  const len = Math.hypot(...x), cap = 2.5 * delta;
  return len > cap ? x.map((v) => (v * cap) / len) : x;
}

function model(glb) {
  const prims = editablePrimitives(glb.json);
  if (prims.length !== 1) throw new Error('expects one editable primitive');
  const prim = prims[0];
  const M = primitiveMatrix(glb.json, prim);
  if ([0, 4, 8].some((c) => Math.abs(Math.hypot(M[c], M[c + 1], M[c + 2]) - 1) > 1e-4)) throw new Error('expects no scale on the mesh node');
  const local = readAccessor(glb, prim.attributes.POSITION).data;
  const pos = new Float64Array(local.length);
  for (let i = 0; i < local.length; i += 3) for (let r = 0; r < 3; r++) pos[i + r] = M[r] * local[i] + M[4 + r] * local[i + 1] + M[8 + r] * local[i + 2] + M[12 + r];
  const idx = readAccessor(glb, prim.indices).data;
  const ids = new Map();
  const vid = Array.from({ length: pos.length / 3 }, (_, i) => {
    const k = [0, 1, 2].map((j) => Math.round(pos[i * 3 + j] * 1e4)).join(',');
    if (!ids.has(k)) ids.set(k, ids.size);
    return ids.get(k);
  });
  const P = [];
  vid.forEach((w, i) => { P[w] ??= [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]; });
  const tris = [];
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const w = [vid[idx[t]], vid[idx[t + 1]], vid[idx[t + 2]]];
    if (new Set(w).size < 3) continue;
    const n = cross(sub(P[w[1]], P[w[0]]), sub(P[w[2]], P[w[0]]));
    const l = Math.hypot(...n);
    if (l < 1e-12) continue;
    tris.push({ w, n: n.map((x) => x / l), area: l / 2 });
  }
  const parent = P.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (const t of tris) for (const k of [1, 2]) { const a = find(t.w[0]), b = find(t.w[k]); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
  const parts = new Map();
  for (const t of tris) {
    t.part = find(t.w[0]);
    if (!parts.has(t.part)) parts.set(t.part, []);
    parts.get(t.part).push(t);
  }
  return { prim, M, vid, P, tris, parts };
}

function walls(m) {
  const { P, tris, parts } = m;
  const total = tris.reduce((s, t) => s + t.area, 0);
  const pts = (t) => t.w.map((w) => P[w]);
  const out = [];
  const step = Math.max(1, Math.ceil(tris.length / 400));
  let id = 0;
  for (const [key, own] of parts) {
    const area = own.reduce((s, t) => s + t.area, 0);
    const edges = new Map();
    for (const t of own) for (let k = 0; k < 3; k++) {
      const a = t.w[k], b = t.w[(k + 1) % 3], e = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(e, (edges.get(e) ?? 0) + 1);
    }
    const open = [...edges.values()].filter((c) => c === 1).length;
    const hits = [];
    let layer = 0;
    for (let i = 0; i < own.length; i += Math.min(step, Math.max(1, Math.floor(own.length / 8)))) {
      const t = own[i], p = pts(t);
      const o = [0, 1, 2].map((k) => (p[0][k] + p[1][k] + p[2][k]) / 3);
      const d = t.n.map((x) => -x);
      let wall = Infinity;
      for (const b of own) {
        if (b === t || dot(b.n, t.n) > FACING || b.w.some((w) => t.w.includes(w))) continue;
        const r = ray(o, d, pts(b));
        if (r !== null && r > 1e-5 && r < wall) wall = r;
      }
      if (wall === Infinity) continue;
      if (wall < LAYER && tris.some((b) => b.part !== key && [[t.n, 0], [d, wall]].some(([dir, from]) => {
        const r = ray(o, dir, pts(b));
        return r !== null && r > from - 1e-5 && r < from + GAP;
      }))) { layer++; continue; }
      hits.push({ wall, area: t.area });
    }
    let wall = null;
    if (hits.length) {
      hits.sort((a, b) => a.wall - b.wall);
      const sum = hits.reduce((s, h) => s + h.area, 0);
      let acc = 0;
      wall = hits[hits.length - 1].wall;
      for (const h of hits) { acc += h.area; if (acc >= SHARE * sum) { wall = h.wall; break; } }
    }
    const counts = area >= MIN_AREA * total;
    out.push({ id: id++, key, tris: own.length, area, open, layer, wall, counts });
  }
  return out;
}

function grow(m, list, to, only, away, sheet) {
  const { P, tris, parts } = m;
  const centre = [0, 1, 2].map((k) => P.reduce((s, p) => s + p[k], 0) / P.length);
  const moved = new Map();
  const done = [];
  for (const p of list) {
    if (only && !only.includes(p.id)) continue;
    if (!p.counts || p.wall === null || p.wall >= to) continue;
    const delta = (to * 1.04 - p.wall) / 2;
    const normals = new Map();
    for (const t of parts.get(p.key)) {
      const mid = [0, 1, 2].map((k) => (P[t.w[0]][k] + P[t.w[1]][k] + P[t.w[2]][k]) / 3);
      const d = away ? (dot(t.n, sub(mid, centre)) > 0 ? 2 * delta : 0) : delta;
      for (const w of t.w) {
        const list = normals.get(w) ?? [];
        if (!list.some((x) => dot(x.n, t.n) > 0.999)) list.push({ n: t.n, d, area: t.area });
        normals.set(w, list);
      }
    }
    for (const [w, ns] of normals) {
      if (!sheet) { moved.set(w, solve(ns, delta)); continue; }
      const big = ns.reduce((a, b) => (b.area > a.area ? b : a));
      moved.set(w, big.n.map((v) => v * big.d));
    }
    done.push({ id: p.id, from: p.wall, delta });
  }
  const next = P.map((p, w) => (moved.has(w) ? p.map((v, k) => v + moved.get(w)[k]) : p));
  return { next, done, tris };
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(0); }
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const file = args[0];
const to = Number(opt('--to'));
const glb = readGlb(file);
const m = model(glb);
const list = walls(m);
const fmt = (v) => (v === null ? '-' : v.toFixed(4));
for (const p of list.filter((p) => p.counts).sort((a, b) => (a.wall ?? 9) - (b.wall ?? 9)).slice(0, 12)) {
  console.log(`part ${p.id}  tris ${p.tris}  wall ${fmt(p.wall)}${p.open ? `  open ${p.open}` : ''}${p.layer ? `  layer ${p.layer}` : ''}`);
}
if (args.includes('--list')) process.exit(0);
const only = opt('--parts')?.split(',').map(Number) ?? null;
const { next, done } = grow(m, list, to, only, args.includes('--away'), args.includes('--sheet'));
const { prim, vid, M } = m;
const accessor = glb.json.accessors[prim.attributes.POSITION];
const bytes = Buffer.alloc(accessor.count * 12);
vid.forEach((w, i) => {
  const d = next[w].map((v, r) => v - M[12 + r]);
  [0, 1, 2].forEach((k) => bytes.writeFloatLE(M[k * 4] * d[0] + M[k * 4 + 1] * d[1] + M[k * 4 + 2] * d[2], i * 12 + k * 4));
});
repack(glb, new Map([[prim.attributes.POSITION, bytes]]));
fixBounds(glb);
const out = opt('--out') ?? file;
writeGlb(out, glb.json, glb.bin, writeFileSync);
console.log(`grew ${done.length} part(s): ${done.map((d) => `${d.id} ${fmt(d.from)}`).join(', ')}`);
console.log(`minWall ${fmt(thinnestWall(readGlb(out)))}`);
