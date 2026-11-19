import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix, vertexAdder } from './mesh-edit.mjs';

const opt = { cell: [14, 3], top: 0.25, side: [0.35, 0.65], under: 0.75, mark: 0.12, turn: 0.08, piece: 0.15, light: [-0.4, 1], lo: 0.05, hi: 0.95 };
const files = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) { const v = args[++i].split(',').map(Number); opt[a.slice(2)] = v.length > 1 ? v : v[0]; } else files.push(a);
}

const apply = (m, p) => [0, 1, 2].map((k) => m[k] * p[0] + m[4 + k] * p[1] + m[8 + k] * p[2] + m[12 + k]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ramp = (x, a, b) => clamp((x - a) / (b - a), 0, 1);
const cls = (ny) => (ny > 0.5 ? 'top' : ny < -0.5 ? 'under' : 'side');

function fit(rows) {
  if (rows.length < 2) return () => (rows[0]?.v ?? 0);
  let sw = 0, sh = 0, sv = 0, shh = 0, shv = 0;
  for (const r of rows) { sw += r.w; sh += r.w * r.h; sv += r.w * r.v; shh += r.w * r.h * r.h; shv += r.w * r.h * r.v; }
  const d = sw * shh - sh * sh;
  const b = Math.abs(d) < 1e-12 ? 0 : (sw * shv - sh * sv) / d;
  const a = (sv - b * sh) / sw;
  return (h) => a + b * h;
}

function shade(file) {
  const glb = readGlb(file);
  const [cu, cv] = opt.cell;
  const prims = editablePrimitives(glb.json).filter((p) => p.attributes.TEXCOORD_0 !== undefined && glb.json.accessors[p.attributes.TEXCOORD_0].componentType === 5126);
  const work = [];
  let y0 = Infinity, y1 = -Infinity;
  for (const prim of prims) {
    const m = primitiveMatrix(glb.json, prim);
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv = Float32Array.from(readAccessor(glb, prim.attributes.TEXCOORD_0).data);
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const w = [];
    for (let i = 0; i < pos.length / 3; i++) w.push(apply(m, [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]));
    const tris = [];
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = idx.slice(t, t + 3);
      const mine = [a, b, c].every((v) => Math.floor(uv[2 * v] * 16) === cu && Math.floor(uv[2 * v + 1] * 4) === cv);
      if (!mine) continue;
      const n = cross(sub(w[b], w[a]), sub(w[c], w[a]));
      const l = Math.hypot(...n);
      if (l < 1e-12) continue;
      tris.push({ t, n: n.map((x) => x / l), ny: n[1] / l, area: l / 2 });
      for (const v of [a, b, c]) { y0 = Math.min(y0, w[v][1]); y1 = Math.max(y1, w[v][1]); }
    }
    if (tris.length) work.push({ prim, w, uv, idx, tris });
  }
  if (!work.length) return 'no stone';
  const H = (p) => (y1 - y0 < 1e-9 ? 0.5 : (y1 - p[1]) / (y1 - y0));
  const rows = { top: [], side: [], under: [] };
  for (const s of work) for (const tr of s.tris) {
    const vs = [0, 1, 2].map((k) => s.idx[tr.t + k]);
    tr.h = vs.reduce((a, v) => a + H(s.w[v]), 0) / 3;
    tr.orig = vs.reduce((a, v) => a + s.uv[2 * v + 1] * 4 - cv, 0) / 3;
    rows[cls(tr.ny)].push({ h: tr.h, v: tr.orig, w: tr.area });
  }
  const trend = Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, fit(r)]));
  const parent = new Map();
  const find = (a) => { while (parent.get(a) !== undefined && parent.get(a) !== a) a = parent.get(a); return a; };
  const pkey = (si, v) => { const p = work[si].w[v]; return p.map((x) => Math.round(x * 1e4)).join(','); };
  work.forEach((s, si) => { for (const tr of s.tris) { const ks = [0, 1, 2].map((k) => find(pkey(si, s.idx[tr.t + k]))); for (const k of ks.slice(1)) if (k !== ks[0]) parent.set(k, ks[0]); } });
  const sum = new Map();
  work.forEach((s, si) => { for (const tr of s.tris) { tr.piece = find(pkey(si, s.idx[tr.t])); const e = sum.get(tr.piece) ?? [0, 0]; e[0] += tr.area * (tr.orig - trend[cls(tr.ny)](tr.h)); e[1] += tr.area; sum.set(tr.piece, e); } });
  const tk = new Map();
  const edges = new Map();
  work.forEach((s, si) => s.tris.forEach((tr, ti) => {
    tk.set(tr, tr);
    const ks = [0, 1, 2].map((k) => pkey(si, s.idx[tr.t + k]));
    for (let k = 0; k < 3; k++) { const e = [ks[k], ks[(k + 1) % 3]].sort().join('|'); (edges.get(e) ?? edges.set(e, []).get(e)).push(tr); }
  }));
  const fp = new Map();
  const ff = (a) => { while (fp.get(a) && fp.get(a) !== a) a = fp.get(a); return a; };
  for (const list of edges.values()) for (let i = 1; i < list.length; i++) {
    const a = list[0], b = list[i];
    if (a.n[0] * b.n[0] + a.n[1] * b.n[1] + a.n[2] * b.n[2] > 0.97) { const ra = ff(a), rb = ff(b); if (ra !== rb) fp.set(rb, ra); }
  }
  const span = new Map();
  work.forEach((s) => s.tris.forEach((tr) => {
    tr.face = ff(tr);
    const e = span.get(tr.face) ?? [Infinity, -Infinity];
    for (let k = 0; k < 3; k++) { const y = s.w[s.idx[tr.t + k]][1]; e[0] = Math.min(e[0], y); e[1] = Math.max(e[1], y); }
    span.set(tr.face, e);
  }));
  const ll = Math.hypot(...opt.light);
  const local = (tr, p) => { const [a, b] = span.get(tr.face); return b - a < 1e-9 ? 0 : (b - p[1]) / (b - a) - 0.5; };
  const dir = (tr) => { const h = Math.hypot(tr.n[0], tr.n[2]); return h < 1e-6 ? 0 : (tr.n[0] * opt.light[0] + tr.n[2] * opt.light[1]) / (h * ll); };
  const off = new Map([...sum].map(([k, [a, w]]) => [k, Math.abs(a / w) >= opt.mark ? a / w : 0]));
  const target = (ny, h) => {
    const sd = opt.side[0] + (opt.side[1] - opt.side[0]) * h;
    if (ny > 0) return sd + (opt.top - sd) * ramp(ny, 0.5, 0.9);
    return sd + (opt.under - sd) * ramp(-ny, 0.5, 0.9);
  };
  const replaced = new Map();
  let dup = 0;
  for (const s of work) {
    const add = vertexAdder(glb, s.prim);
    const base = s.uv.length / 2;
    const extra = [];
    const owner = new Map();
    const value = (v, tr) => clamp(target(tr.ny, H(s.w[v])) + off.get(tr.piece) + (1 - Math.abs(tr.ny)) * (opt.piece * local(tr, s.w[v]) - opt.turn * dir(tr)), opt.lo, opt.hi);
    const setV = (i, val) => { if (i < base) s.uv[2 * i + 1] = (cv + val) / 4; else extra[i - base][1] = (cv + val) / 4; };
    for (const tr of s.tris) for (let k = 0; k < 3; k++) {
      const v = s.idx[tr.t + k];
      const val = value(v, tr);
      const key = Math.round(val * 1000);
      const seen = owner.get(v);
      if (!seen) { owner.set(v, new Map([[key, v]])); setV(v, val); continue; }
      let to = seen.get(key);
      if (to === undefined) {
        to = add.add(v);
        extra.push([s.uv[2 * v], 0]);
        setV(to, val);
        seen.set(key, to);
        dup++;
      }
      s.idx[tr.t + k] = to;
    }
    add.commit(s.idx, replaced);
    const all = new Float32Array((base + extra.length) * 2);
    all.set(s.uv);
    extra.forEach(([u, v], k) => { all[2 * (base + k)] = u; all[2 * (base + k) + 1] = v; });
    const acc = glb.json.accessors[s.prim.attributes.TEXCOORD_0];
    acc.count = base + extra.length;
    replaced.set(s.prim.attributes.TEXCOORD_0, Buffer.from(all.buffer));
  }
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  return `${work.reduce((n, s) => n + s.tris.length, 0)} stone tris, ${dup} vertices split`;
}

for (const f of files) console.log(`${f}: ${shade(f)}`);
