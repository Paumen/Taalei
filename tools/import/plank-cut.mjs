import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives } from './mesh-edit.mjs';

const HELP = `plank-cut.mjs [--gap <n>] [--out <file>] --cut <spec> [--cut <spec> ...] <workfile.glb>
plank-cut.mjs --list <workfile.glb>

Splits welded planks so each one is its own part. A cut is a plane in mesh space:
x=<v>, y=<v>, z=<v>, or n=<a>,<b>,<c>@<d> for the plane n·p = d. Every part the
plane crosses is cut through, both cut faces are closed, and the two halves move
apart so a gap of --gap (0.001) opens between them. Add in=<x0:x1>,<y0:y1>,<z0:z1>
to cut only the parts whose box centre lies in that box; an empty end is open.
A face lying on the plane stays with the half it faces away from, so a rail welded
onto a post comes off at the post's face. Cuts run in the order given. --list
prints the parts with their triangles and mesh-space bounds.`;

const r6 = (v) => Math.round(v * 1e6) / 1e6;

function parseCut(spec) {
  const [plane, region] = spec.split(/\s+in=/);
  let n; let d;
  const axis = plane.match(/^([xyz])=(-?[\d.e-]+)$/);
  if (axis) {
    n = [0, 0, 0]; n['xyz'.indexOf(axis[1])] = 1; d = Number(axis[2]);
  } else {
    const m = plane.match(/^n=(-?[\d.e-]+),(-?[\d.e-]+),(-?[\d.e-]+)@(-?[\d.e-]+)$/);
    if (!m) throw new Error(`bad cut: ${spec}`);
    n = [Number(m[1]), Number(m[2]), Number(m[3])];
    const len = Math.hypot(...n);
    n = n.map((v) => v / len); d = Number(m[4]) / len;
  }
  const box = region ? region.split(',').map((r) => {
    const [lo, hi] = r.split(':');
    return [lo === '' ? -Infinity : Number(lo), hi === '' || hi === undefined ? Infinity : Number(hi)];
  }) : null;
  return { n, d, box, spec };
}

function load(glb) {
  const prims = editablePrimitives(glb.json);
  if (prims.length !== 1 || glb.json.meshes.flatMap((m) => m.primitives).length !== 1) throw new Error('expects one editable primitive');
  const prim = prims[0];
  const names = Object.keys(prim.attributes);
  if (names.some((a) => !['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(a)) || prim.targets) throw new Error(`unsupported attributes: ${names}`);
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const nrm = readAccessor(glb, prim.attributes.NORMAL).data;
  const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
  const verts = [];
  for (let i = 0; i < pos.length / 3; i++) {
    verts.push({ p: [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], n: [nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]], uv: [uv[i * 2], uv[i * 2 + 1]] });
  }
  const idx = readAccessor(glb, prim.indices).data;
  const tris = [];
  for (let t = 0; t + 2 < idx.length; t += 3) tris.push([idx[t], idx[t + 1], idx[t + 2]]);
  return { prim, verts, tris };
}

const pkey = (p) => p.map((v) => Math.round(v * 1e5)).join(',');

function islands(verts, tris) {
  const parent = verts.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
  const owner = new Map();
  verts.forEach((v, i) => { const k = pkey(v.p); if (owner.has(k)) union(owner.get(k), i); else owner.set(k, i); });
  for (const [a, b, c] of tris) { union(a, b); union(b, c); }
  const groups = new Map();
  tris.forEach((t, i) => { const r = find(t[0]); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
  return [...groups.values()].map((list) => {
    const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    for (const t of list) for (const v of tris[t]) for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], verts[v].p[k]); hi[k] = Math.max(hi[k], verts[v].p[k]);
    }
    return { tris: list, lo, hi };
  });
}

const lerp = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const cellOf = (uv) => `${Math.floor(uv[0] * 16)},${Math.floor(uv[1] * 4)}`;

function triangulate(loops) {
  const area = (l) => { let s = 0; for (let i = 0; i < l.length; i++) { const a = l[i].q; const b = l[(i + 1) % l.length].q; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  const inside = (q, l) => {
    let c = false;
    for (let i = 0, j = l.length - 1; i < l.length; j = i++) {
      const a = l[i].q; const b = l[j].q;
      if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  const outers = loops.filter((l) => area(l) > 0);
  const holes = loops.filter((l) => area(l) < 0);
  const out = [];
  const segHit = (a, b, c, d) => {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return o(a, b, c) * o(a, b, d) < -1e-18 && o(c, d, a) * o(c, d, b) < -1e-18;
  };
  for (const outer of outers) {
    let poly = [...outer];
    const mine = holes.filter((h) => inside(h[0].q, outer)).sort((a, b) => Math.max(...b.map((p) => p.q[0])) - Math.max(...a.map((p) => p.q[0])));
    for (const hole of mine) {
      const mi = hole.reduce((best, p, i) => (p.q[0] > hole[best].q[0] ? i : best), 0);
      const m = hole[mi].q;
      const edges = [poly, ...mine].flatMap((l) => l.map((p, i) => [p.q, l[(i + 1) % l.length].q]));
      let pick = -1; let best = Infinity;
      poly.forEach((p, i) => {
        const dd = Math.hypot(p.q[0] - m[0], p.q[1] - m[1]);
        if (dd < best && !edges.some(([a, b]) => segHit(m, p.q, a, b))) { best = dd; pick = i; }
      });
      if (pick < 0) throw new Error('cannot bridge a hole in a cap');
      const h = [...hole.slice(mi), ...hole.slice(0, mi + 1)];
      poly = [...poly.slice(0, pick + 1), ...h, ...poly.slice(pick)];
    }
    const ring = [...poly];
    const crossAt = (a, b, c) => (b.q[0] - a.q[0]) * (c.q[1] - a.q[1]) - (b.q[1] - a.q[1]) * (c.q[0] - a.q[0]);
    const inTri = (p, a, b, c) => crossAt(a, b, p) > 0 && crossAt(b, c, p) > 0 && crossAt(c, a, p) > 0;
    let guard = 0;
    while (ring.length > 3 && guard++ < 10000) {
      let cut = -1;
      for (let i = 0; i < ring.length && cut < 0; i++) {
        const a = ring[(i + ring.length - 1) % ring.length]; const b = ring[i]; const c = ring[(i + 1) % ring.length];
        if (crossAt(a, b, c) <= 1e-14) continue;
        if (ring.some((p) => p !== a && p !== b && p !== c && p.key !== a.key && p.key !== b.key && p.key !== c.key && inTri(p, a, b, c))) continue;
        cut = i;
      }
      if (cut < 0) {
        const flat = ring.findIndex((b, i) => Math.abs(crossAt(ring[(i + ring.length - 1) % ring.length], b, ring[(i + 1) % ring.length])) <= 1e-14);
        if (flat < 0) throw new Error('cap triangulation failed');
        ring.splice(flat, 1);
        continue;
      }
      out.push([ring[(cut + ring.length - 1) % ring.length], ring[cut], ring[(cut + 1) % ring.length]]);
      ring.splice(cut, 1);
    }
    if (ring.length === 3 && crossAt(...ring) > 1e-14) out.push(ring);
  }
  return out;
}

function applyCut(mesh, cut, gap, warn) {
  const { verts, tris } = mesh;
  let extent = 0;
  for (const v of verts) for (const c of v.p) extent = Math.max(extent, Math.abs(c));
  const tol = Math.max(1e-7, extent * 1e-6);
  const dist = (p) => { const s = dot(cut.n, p) - cut.d; return Math.abs(s) <= tol ? 0 : s; };
  const all = islands(verts, tris);
  const chosen = all.filter((isl) => {
    if (cut.box && !cut.box.every(([lo, hi], k) => { const c = (isl.lo[k] + isl.hi[k]) / 2; return c >= lo && c <= hi; })) return false;
    let pos = false; let neg = false;
    for (const t of isl.tris) for (const v of tris[t]) { const s = dist(verts[v].p); if (s > 0) pos = true; if (s < 0) neg = true; }
    return pos && neg;
  });
  if (!chosen.length) { warn(`${cut.spec}: crosses no part`); return 0; }
  const drop = new Set();
  const added = [];
  for (const isl of chosen) {
    const side = { 1: { map: new Map(), polys: [] }, [-1]: { map: new Map(), polys: [] } };
    const copy = (s, i) => {
      const m = side[s].map;
      if (!m.has(i)) { const v = verts[i]; m.set(i, verts.push({ p: [...v.p], n: [...v.n], uv: [...v.uv], on: dist(v.p) === 0, s }) - 1); }
      return m.get(i);
    };
    const cutCache = new Map();
    const crossing = (s, a, b) => {
      const k = `${s}:${Math.min(a, b)},${Math.max(a, b)}`;
      if (!cutCache.has(k)) {
        const [i, j] = pkey(verts[a].p) < pkey(verts[b].p) ? [a, b] : [b, a];
        const di = dist(verts[i].p); const dj = dist(verts[j].p);
        const t = di / (di - dj);
        const p = lerp(verts[i].p, verts[j].p, t);
        const along = dot(cut.n, p) - cut.d;
        cutCache.set(k, verts.push({ p: p.map((c, q) => c - cut.n[q] * along), n: norm(lerp(verts[i].n, verts[j].n, t)), uv: lerp(verts[i].uv, verts[j].uv, t), on: true, s }) - 1);
      }
      return cutCache.get(k);
    };
    for (const ti of isl.tris) {
      drop.add(ti);
      const tri = tris[ti];
      const ds = tri.map((v) => dist(verts[v].p));
      if (ds.every((x) => x === 0)) {
        const [a, b, c] = tri.map((v) => verts[v].p);
        const fn = cross(b.map((x, q) => x - a[q]), c.map((x, q) => x - a[q]));
        const sd = dot(fn, cut.n) > 0 ? -1 : 1;
        side[sd].polys.push(tri.map((v) => copy(sd, v)));
        continue;
      }
      for (const s of [1, -1]) {
        if (ds.every((x) => x * s >= 0)) { side[s].polys.push(tri.map((v) => copy(s, v))); continue; }
        if (ds.every((x) => x * s <= 0)) continue;
        const poly = [];
        for (let i = 0; i < 3; i++) {
          const a = tri[i]; const b = tri[(i + 1) % 3]; const da = ds[i]; const db = ds[(i + 1) % 3];
          if (da * s >= 0) poly.push(copy(s, a));
          if (da * db < 0) poly.push(crossing(s, a, b));
        }
        if (poly.length >= 3) side[s].polys.push(poly);
      }
    }
    for (const s of [1, -1]) {
      const { polys } = side[s];
      for (const poly of polys) for (let i = 1; i + 1 < poly.length; i++) added.push([poly[0], poly[i], poly[i + 1]]);
      const edges = new Map();
      for (const poly of polys) for (let i = 0; i < poly.length; i++) {
        const a = poly[i]; const b = poly[(i + 1) % poly.length];
        if (!verts[a].on || !verts[b].on) continue;
        const ka = pkey(verts[a].p); const kb = pkey(verts[b].p);
        if (ka === kb) continue;
        const back = `${kb}>${ka}`;
        if (edges.has(back)) edges.delete(back); else edges.set(`${ka}>${kb}`, [a, b, ka, kb]);
      }
      const next = new Map();
      for (const e of edges.values()) { if (next.has(e[2])) warn(`${cut.spec}: branching cap edge`); next.set(e[2], e); }
      const loops = [];
      const used = new Set();
      for (const e of edges.values()) {
        if (used.has(e[2])) continue;
        const loop = [];
        let cur = e;
        while (cur && !used.has(cur[2])) { used.add(cur[2]); loop.push(cur[0]); cur = next.get(cur[3]); }
        if (!cur || cur !== e) { warn(`${cut.spec}: open cap edge left unfilled`); continue; }
        if (loop.length >= 3) loops.push(loop.reverse());
      }
      if (!loops.length) continue;
      const cn = cut.n.map((x) => x * -s);
      const helper = Math.abs(cn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = norm(cross(helper, cn)); const w = cross(cn, u);
      const counts = new Map();
      for (const l of loops) for (const v of l) { const c = cellOf(verts[v].uv); counts.set(c, (counts.get(c) ?? 0) + 1); }
      const cell = [...counts].sort((a, b) => b[1] - a[1])[0][0];
      const inCell = loops.flat().filter((v) => cellOf(verts[v].uv) === cell);
      const avg = [0, 1].map((k) => inCell.reduce((t, v) => t + verts[v].uv[k], 0) / inCell.length);
      const capLoops = loops.map((l) => l.map((v) => {
        const p = verts[v].p;
        const id = verts.push({ p: [...p], n: [...cn], uv: cellOf(verts[v].uv) === cell ? [...verts[v].uv] : [...avg], on: true, s }) - 1;
        return { id, key: pkey(p), q: [dot(p, u), dot(p, w)] };
      }));
      for (const [a, b, c] of triangulate(capLoops)) added.push([a.id, b.id, c.id]);
    }
    for (const s of [1, -1]) {
      for (const poly of side[s].polys) for (const v of poly) {
        if (verts[v].on) continue;
        const dd = Math.abs(dist(verts[v].p));
        if (dd < gap) warn(`${cut.spec}: a vertex sits ${r6(dd)} from the plane, closer than the gap`);
      }
    }
  }
  const moved = new Set();
  for (const t of added) for (const v of t) {
    if (moved.has(v) || !verts[v].on || verts[v].s === undefined) continue;
    moved.add(v);
    verts[v].p = verts[v].p.map((c, q) => c + cut.n[q] * verts[v].s * gap / 2);
  }
  mesh.tris = [...tris.filter((_, i) => !drop.has(i)), ...added];
  for (const v of verts) { delete v.on; delete v.s; }
  return chosen.length;
}

function simplify(mesh) {
  const { verts } = mesh;
  const q = (v, s = 1e4) => Math.round(v * s);
  const kept = [];
  const groups = new Map();
  for (const isl of islands(verts, mesh.tris)) {
    for (const ti of isl.tris) {
      const t = mesh.tris[ti];
      const [a, b, c] = t.map((v) => verts[v]);
      const raw = cross(b.p.map((x, k) => x - a.p[k]), c.p.map((x, k) => x - a.p[k]));
      const len = Math.hypot(...raw);
      const fn = raw.map((x) => x / (len || 1));
      const cells = new Set(t.map((v) => cellOf(verts[v].uv)));
      if (len < 1e-12 || cells.size > 1 || t.some((v) => dot(norm(verts[v].n), fn) < 0.9999)) { kept.push(t); continue; }
      const helper = Math.abs(fn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = norm(cross(helper, fn)); const w = cross(fn, u);
      const P = [a, b, c].map((v) => [dot(v.p, u), dot(v.p, w)]);
      const det = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
      const grad = [0, 1].map((k) => {
        const d1 = b.uv[k] - a.uv[k]; const d2 = c.uv[k] - a.uv[k];
        const gs = (d1 * (P[2][1] - P[0][1]) - d2 * (P[1][1] - P[0][1])) / det;
        const gt = (d2 * (P[1][0] - P[0][0]) - d1 * (P[2][0] - P[0][0])) / det;
        return [gs, gt, a.uv[k] - gs * P[0][0] - gt * P[0][1]];
      });
      const key = [isl.tris[0], ...fn.map((x) => q(x)), q(dot(fn, a.p), 1e5), ...grad.flat().map((x) => q(x, 1e3))].join(',');
      if (!groups.has(key)) groups.set(key, { fn, u, w, grad, tris: [] });
      groups.get(key).tris.push(t);
    }
  }
  const out = [...kept];
  const useCount = new Map();
  const note = (k, g) => { if (!useCount.has(k)) useCount.set(k, new Set()); useCount.get(k).add(g); };
  for (const t of kept) for (const v of t) note(pkey(verts[v].p), 'kept');
  const plans = [];
  for (const g of groups.values()) {
    const edges = new Map();
    for (const t of g.tris) for (let i = 0; i < 3; i++) {
      const a = t[i]; const b = t[(i + 1) % 3];
      const ka = pkey(verts[a].p); const kb = pkey(verts[b].p);
      note(ka, g);
      const back = `${kb}>${ka}`;
      if (edges.has(back)) edges.delete(back); else edges.set(`${ka}>${kb}`, [a, b, ka, kb]);
    }
    const next = new Map(); let ok = true;
    for (const e of edges.values()) { if (next.has(e[2])) ok = false; next.set(e[2], e); }
    const loops = [];
    const used = new Set();
    for (const e of edges.values()) {
      if (!ok || used.has(e[2])) continue;
      const loop = []; let cur = e;
      while (cur && !used.has(cur[2])) { used.add(cur[2]); loop.push(cur[0]); cur = next.get(cur[3]); }
      if (cur !== e) ok = false; else loops.push(loop);
    }
    plans.push({ g, ok, loops, boundary: new Set([...edges.values()].map((e) => e[2])) });
  }
  for (const plan of plans) {
    if (!plan.ok) continue;
    for (const t of plan.g.tris) for (const v of t) {
      const k = pkey(verts[v].p);
      if (!plan.boundary.has(k) && useCount.get(k).size > 1) plan.ok = false;
    }
  }
  const removable = new Map();
  const mark = (k, val) => removable.set(k, (removable.get(k) ?? true) && val);
  for (const t of kept) for (const v of t) mark(pkey(verts[v].p), false);
  for (const { g, ok, loops } of plans) {
    if (!ok) { for (const t of g.tris) for (const v of t) mark(pkey(verts[v].p), false); continue; }
    for (const loop of loops) loop.forEach((v, i) => {
      const a = verts[loop[(i + loop.length - 1) % loop.length]].p; const b = verts[v].p; const c = verts[loop[(i + 1) % loop.length]].p;
      const ab = b.map((x, k) => x - a[k]); const bc = c.map((x, k) => x - b[k]);
      mark(pkey(b), Math.hypot(...cross(ab, bc)) <= 1e-6 * Math.hypot(...ab) * Math.hypot(...bc) && dot(ab, bc) > 0);
    });
  }
  for (const { g, ok, loops } of plans) {
    if (!ok) { out.push(...g.tris); continue; }
    const uvAt = (p) => { const s = dot(p, g.u); const t = dot(p, g.w); return g.grad.map(([gs, gt, c]) => gs * s + gt * t + c); };
    const ring = loops.map((l) => l.filter((v) => !removable.get(pkey(verts[v].p))).map((v) => {
      const p = verts[v].p;
      const id = verts.push({ p: [...p], n: [...g.fn], uv: uvAt(p) }) - 1;
      return { id, key: pkey(p), q: [dot(p, g.u), dot(p, g.w)] };
    })).filter((l) => l.length >= 3);
    let tris = null;
    try { tris = triangulate(ring).map((t) => t.map((p) => p.id)); } catch { tris = null; }
    out.push(...(tris && tris.length && tris.length <= g.tris.length ? tris : g.tris));
  }
  mesh.tris = out;
}

function save(glb, mesh, out) {
  const used = new Map();
  const verts = [];
  const tris = mesh.tris.map((t) => t.map((v) => { if (!used.has(v)) { used.set(v, verts.length); verts.push(mesh.verts[v]); } return used.get(v); }));
  const { json } = glb; const { prim } = mesh;
  const replaced = new Map();
  const put = (index, rows) => {
    const a = json.accessors[index];
    if (a.componentType !== 5126 || a.normalized) throw new Error('expects float attributes');
    const data = Float32Array.from(rows.flat());
    a.count = rows.length;
    replaced.set(index, Buffer.from(data.buffer));
  };
  put(prim.attributes.POSITION, verts.map((v) => v.p));
  put(prim.attributes.NORMAL, verts.map((v) => norm(v.n)));
  put(prim.attributes.TEXCOORD_0, verts.map((v) => v.uv));
  const ia = json.accessors[prim.indices];
  const flat = tris.flat();
  const [Type, code] = verts.length <= 65536 ? [Uint16Array, 5123] : [Uint32Array, 5125];
  const data = Type.from(flat);
  ia.componentType = code; ia.count = flat.length;
  replaced.set(prim.indices, Buffer.from(data.buffer));
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(out, glb.json, glb.bin, writeFileSync);
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(0); }
const cuts = []; let gap = 0.001; let list = false; let file; let out;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--cut') cuts.push(parseCut(args[++i]));
  else if (args[i] === '--gap') gap = Number(args[++i]);
  else if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--list') list = true;
  else file = args[i];
}
const glb = readGlb(file);
const mesh = load(glb);
if (list) {
  islands(mesh.verts, mesh.tris).forEach((isl, i) => {
    const cells = [...new Set(isl.tris.flatMap((t) => mesh.tris[t].map((v) => cellOf(mesh.verts[v].uv))))];
    console.log(`${i + 1}\t${isl.tris.length} tris\t[${isl.lo.map(r6)}] .. [${isl.hi.map(r6)}]\t${cells.join(' ')}`);
  });
  process.exit(0);
}
const warns = [];
for (const cut of cuts) applyCut(mesh, cut, gap, (m) => warns.push(m));
simplify(mesh);
for (const w of [...new Set(warns)]) console.warn(`warn ${w}`);
save(glb, mesh, out ?? file);
console.log(`${file}: ${cuts.length} cuts, ${islands(mesh.verts, mesh.tris).length} parts, ${mesh.tris.length} tris`);
