import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor, thinnestWall } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix } from '../import/mesh-edit.mjs';

const HELP = `thicken.mjs <in.glb> --to <wall> [--out <out.glb>] [--parts ids] [--list]
Grows every closed part whose wall is under <wall> by pushing each face out
along its normal, so the part keeps its triangles and shape. Single sheets and
thin layers lying on another part are left alone and listed.
--list prints parts and walls only. --parts limits the change to those ids.
--away grows only the faces turned away from the model's centre, so inner
parts are not covered. --inward grows only the faces turned towards it, so
a hollow shell gets thicker without its outline growing.
--sheet moves each point only along its biggest face's normal, so thin
sheets and blades get thicker without growing wider or losing sharp edges.
--local grows only the faces whose own wall is under <wall>, so thick tips,
spouts and straws on a thin part keep their shape.
--flat moves each point only along the part's thinnest axis, so a flat
fork, blade or slotted spatula gets thicker while its outline, tines and
slots stay exactly as they were. --widen also widens, within that plane,
the narrow strips of a flat part (tines, wires) that are under <wall>
across, which narrows the gaps between them. --carry moves small parts
lying on or through a grown part (gems, rivets, decals) with its surface.
--radial makes --away and --inward judge sides from the upright centre
line, not the centre point, so cups and glasses grow only in or out.`;

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

function faceWall(own, t, P) {
  const p = t.w.map((w) => P[w]);
  const o = [0, 1, 2].map((k) => (p[0][k] + p[1][k] + p[2][k]) / 3);
  const d = t.n.map((x) => -x);
  let wall = Infinity;
  for (const b of own) {
    if (b === t || dot(b.n, t.n) > FACING || b.w.some((w) => t.w.includes(w))) continue;
    const r = ray(o, d, b.w.map((w) => P[w]));
    if (r !== null && r > 1e-5 && r < wall) wall = r;
  }
  return wall;
}

function thinAxis(pts) {
  const c = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i][j] += (p[i] - c[i]) * (p[j] - c[j]);
  const tr = A[0][0] + A[1][1] + A[2][2] + 1e-12;
  const B = A.map((r, i) => r.map((v, j) => (i === j ? tr : 0) - v));
  let v = [0.3, 0.5, 0.8];
  for (let it = 0; it < 200; it++) {
    const w = [0, 1, 2].map((i) => B[i][0] * v[0] + B[i][1] * v[1] + B[i][2] * v[2]);
    const l = Math.hypot(...w);
    v = w.map((x) => x / l);
  }
  return v;
}

function grow(m, list, to, only, away, sheet, local, flat, widen, carry, radial) {
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
      const side = radial ? t.n[0] * (mid[0] - centre[0]) + t.n[2] * (mid[2] - centre[2]) : dot(t.n, sub(mid, centre));
      const thick = local && faceWall(parts.get(p.key), t, P) >= to;
      const level = radial && Math.hypot(t.n[0], t.n[2]) < 0.3;
      const d = thick ? 0 : level ? delta : away === 'away' ? (side > 0 ? 2 * delta : 0) : away === 'inward' ? (side < 0 ? 2 * delta : 0) : delta;
      for (const w of t.w) {
        const list = normals.get(w) ?? [];
        if (!list.some((x) => dot(x.n, t.n) > 0.999)) list.push({ n: t.n, d, area: t.area });
        normals.set(w, list);
      }
    }
    if (flat) {
      const axis = thinAxis([...normals.keys()].map((w) => P[w]));
      if (widen) {
        const own = parts.get(p.key), cons = new Map();
        for (const t of own) {
          const a = dot(t.n, axis);
          let c;
          if (Math.abs(a) > 0.5) c = { n: axis.map((v) => v * Math.sign(a)), d: delta };
          else {
            const q = t.n.map((v, k) => v - a * axis[k]), l = Math.hypot(...q), fw = faceWall(own, t, P);
            c = { n: q.map((v) => v / l), d: fw < to ? Math.max(0, (to * 1.04 - fw) / 2) : 0 };
          }
          for (const w of t.w) {
            const list = cons.get(w) ?? [];
            if (!list.some((x) => dot(x.n, c.n) > 0.999)) list.push(c);
            cons.set(w, list);
          }
        }
        for (const [w, cs] of cons) moved.set(w, solve(cs, delta + to));
        done.push({ id: p.id, from: p.wall, delta });
        continue;
      }
      for (const [w, ns] of normals) {
        const face = ns.filter((x) => Math.abs(dot(x.n, axis)) > 0.5 && x.d > 0);
        if (!face.length) continue;
        const s = Math.sign(face.reduce((a, x) => a + dot(x.n, axis) * x.area, 0));
        const d = Math.max(...face.map((x) => x.d));
        moved.set(w, axis.map((v) => v * s * d));
      }
      done.push({ id: p.id, from: p.wall, delta });
      continue;
    }
    for (const [w, ns] of normals) {
      if (!sheet) { moved.set(w, solve(ns, delta)); continue; }
      const big = ns.reduce((a, b) => (b.area > a.area ? b : a));
      moved.set(w, big.n.map((v) => v * big.d));
    }
    done.push({ id: p.id, from: p.wall, delta });
  }
  if (carry) {
    const grown = new Set(done.map((d) => list.find((p) => p.id === d.id).key));
    const faces = tris.filter((t) => grown.has(t.part));
    const zero = [0, 0, 0];
    const onFace = (q) => {
      let best = null, bd = Infinity;
      for (const t of faces) {
        const [a, b, c] = t.w.map((w) => P[w]);
        const dist = dot(sub(q, a), t.n);
        if (Math.abs(dist) >= bd) continue;
        const r = q.map((x, k) => x - dist * t.n[k]);
        const e0 = sub(b, a), e1 = sub(c, a), e2 = sub(r, a);
        const d00 = dot(e0, e0), d01 = dot(e0, e1), d11 = dot(e1, e1), d20 = dot(e2, e0), d21 = dot(e2, e1), den = d00 * d11 - d01 * d01;
        if (Math.abs(den) < 1e-18) continue;
        const v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den, u = 1 - v - w;
        if (u < -0.01 || v < -0.01 || w < -0.01) continue;
        const m = [u, v, w].map((k, i) => (moved.get(t.w[i]) ?? zero).map((x) => x * k));
        best = [0, 1, 2].map((k) => m[0][k] + m[1][k] + m[2][k]);
        bd = Math.abs(dist);
      }
      return { shift: best, bd };
    };
    for (const [key, own] of parts) {
      if (grown.has(key)) continue;
      const vs = [...new Set(own.flatMap((t) => t.w))];
      const near = vs.map((v) => ({ v, ...onFace(P[v]) }));
      if (near.filter((x) => x.shift && x.bd < 0.004).length < vs.length / 3) continue;
      for (const { v, shift } of near) if (shift) moved.set(v, shift);
    }
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
const side = args.includes('--away') ? 'away' : args.includes('--inward') ? 'inward' : null;
const { next, done } = grow(m, list, to, only, side, args.includes('--sheet'), args.includes('--local'), args.includes('--flat'), args.includes('--widen'), args.includes('--carry'), args.includes('--radial'));
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
