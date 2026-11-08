#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { editablePrimitives, primitiveMatrix, vertexAdder, vec3View, repack, fixBounds, catalogTubeNeed } from '../import/mesh-edit.mjs';

const HELP = `swell.mjs <in.glb> [--out <file>] [--to <n>] [--margin <f>] [--list]

Makes the thin bits of a model thicker, to --to (default: the kind's
thin.min, for a file in kits/workfiles) times --margin (default 1.15, room
for the lint's grid), and leaves the rest alone.
  holes         an open end of a solid part (a tube without a bottom) and the
                open rim of a domed sheet (a mushroom cap) get a flat cap
  solid parts   each face thinner than the goal moves out along its normal
                by half of what is missing, so both sides grow and the middle
                stays; thick faces stay put. A face never takes more than 30%
                of the gap in front of it, so slots and gaps stay open
  two-sided     a card made of two close sheets is pulled apart and closed
                with a rim
  open sheets   a single flat sheet (a leaf) gets a back side and a rim
Writes --out (default <in>-swell.glb) and prints what it did and the
triangles before and after. --list prints each part and changes nothing.`;

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const file = args.find((a, i) => !a.startsWith('--') && !['--out', '--to', '--margin'].includes(args[i - 1]));
if (!file || args.includes('--help')) { console.log(HELP); process.exit(file ? 0 : 1); }
const limit = Number(flag('--to') ?? catalogTubeNeed(file) ?? NaN);
if (!(limit > 0)) { console.error('no limit known for this file: pass --to'); process.exit(1); }
const goal = limit * Number(flag('--margin') ?? 1.15);
const out = flag('--out') ?? file.replace(/\.glb$/, '-swell.glb');

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const neg = (a) => [-a[0], -a[1], -a[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a); return l > 0 ? a.map((x) => x / l) : [0, 0, 0]; };
const apply = (m, p, w = 1) => [0, 1, 2].map((i) => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i] * w);
const det3 = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);

function invert(m) {
  const M = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
  const D = det3(M);
  const r = [0, 1, 2].map((i) => [0, 1, 2].map((j) => {
    const minor = M.filter((_, a) => a !== j).map((row) => row.filter((_, b) => b !== i));
    return ((i + j) % 2 ? -1 : 1) * (minor[0][0] * minor[1][1] - minor[0][1] * minor[1][0]) / D;
  }));
  const lin = [r[0][0], r[1][0], r[2][0], 0, r[0][1], r[1][1], r[2][1], 0, r[0][2], r[1][2], r[2][2], 0, 0, 0, 0, 1];
  const back = apply(lin, [m[12], m[13], m[14]], 0);
  return [...lin.slice(0, 12), -back[0], -back[1], -back[2], 1];
}

const glb = readGlb(file);
const prims = editablePrimitives(glb.json).map((prim) => {
  const m = primitiveMatrix(glb.json, prim);
  const nor = prim.attributes.NORMAL === undefined ? null : readAccessor(glb, prim.attributes.NORMAL).data;
  return { prim, m, inv: invert(m), idx: Array.from(readAccessor(glb, prim.indices).data), pos: readAccessor(glb, prim.attributes.POSITION).data, nor };
});

const verts = [];
const tris = [];
for (const [pi, P] of prims.entries()) {
  const base = verts.length;
  for (let v = 0; v < P.pos.length / 3; v++) verts.push({ pi, v, p: apply(P.m, [P.pos[v * 3], P.pos[v * 3 + 1], P.pos[v * 3 + 2]]) });
  for (let k = 0; k + 2 < P.idx.length; k += 3) tris.push({ pi, k, v: [0, 1, 2].map((j) => base + P.idx[k + j]) });
}
const originalTris = tris.length;
let extent = 0;
for (const { p } of verts) extent = Math.max(extent, ...p.map(Math.abs));
const eps = Math.max(1e-7, extent * 1e-5);
const keys = new Map();
const weld = (p) => { const k = p.map((x) => Math.round(x / eps)).join(','); if (!keys.has(k)) keys.set(k, keys.size); return keys.get(k); };
for (const vert of verts) vert.w = weld(vert.p);

function shape(t, at = (v) => verts[v].p) {
  t.p = t.v.map(at);
  const c = cross(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0]));
  t.area = len(c) / 2;
  t.n = unit(c);
  t.c = [0, 1, 2].map((i) => (t.p[0][i] + t.p[1][i] + t.p[2][i]) / 3);
  t.lo = [0, 1, 2].map((i) => Math.min(t.p[0][i], t.p[1][i], t.p[2][i]));
  t.hi = [0, 1, 2].map((i) => Math.max(t.p[0][i], t.p[1][i], t.p[2][i]));
}

let live = [];
function line(o, d, keep = () => true) {
  const hits = [];
  for (const t of live) {
    if (!keep(t)) continue;
    const [a, b, c] = t.p;
    const e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
    if (Math.abs(det) < 1e-18) continue;
    const s = sub(o, a), u = dot(s, h) / det;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    const q = cross(s, e1), v = dot(d, q) / det;
    if (v < -1e-9 || u + v > 1 + 1e-9) continue;
    hits.push({ s: dot(e2, q) / det, t, cos: dot(t.n, d) });
  }
  return hits.sort((x, y) => x.s - y.s);
}

const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
let edges, bodies, sideOf;
function analyse() {
  tris.forEach((t, i) => { t.i = i; shape(t); });
  live = tris.filter((t) => t.area > eps * eps);
  edges = new Map();
  for (const t of tris) for (let j = 0; j < 3; j++) {
    const a = verts[t.v[j]].w, b = verts[t.v[(j + 1) % 3]].w;
    if (a === b) continue;
    if (!edges.has(edgeKey(a, b))) edges.set(edgeKey(a, b), []);
    edges.get(edgeKey(a, b)).push({ t, j });
  }
  const group = (most) => {
    const parent = tris.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    for (const list of edges.values()) for (const x of list) for (const y of list) {
      if (x.t.i < y.t.i && dot(x.t.n, y.t.n) > most) parent[find(x.t.i)] = find(y.t.i);
    }
    return tris.map((_, i) => find(i));
  };
  const bodyOf = group(-0.999);
  sideOf = group(-0.5);
  const byRoot = new Map();
  for (const t of tris) {
    if (!byRoot.has(bodyOf[t.i])) byRoot.set(bodyOf[t.i], { id: byRoot.size, tris: [], area: 0, backed: 0, decal: 0, twin: new Map() });
    t.B = byRoot.get(bodyOf[t.i]);
    t.B.tris.push(t);
    t.B.area += t.area;
  }
  bodies = [...byRoot.values()];
  for (const t of live) {
    const first = line(add(t.c, t.n, eps), neg(t.n), (u) => u !== t).filter((h) => h.s > eps / 2);
    const [hit] = first;
    t.tw = 0;
    if (hit && hit.s < goal + eps && hit.t.B !== t.B && hit.cos > 0.9) {
      t.tw = Math.max(0, hit.s - eps);
      t.B.twin.set(hit.t.B, (t.B.twin.get(hit.t.B) ?? 0) + t.area);
    } else if (hit && hit.s < goal / 2 + eps && hit.t.B !== t.B && hit.cos < -0.9) t.B.decal += t.area;
    else if (first.find((h) => h.t.B === t.B)?.cos > 0) t.B.backed += t.area;
  }
  for (const b of bodies) {
    const [twin, area] = [...b.twin].sort((x, y) => y[1] - x[1])[0] ?? [null, 0];
    b.kind = b.backed >= 0.5 * b.area ? 'solid' : area >= 0.5 * b.area ? 'card' : b.decal >= 0.5 * b.area ? 'decal' : 'sheet';
    b.partner = b.kind === 'card' ? twin : null;
  }
}

function loops(b) {
  const next = new Map();
  for (const list of edges.values()) {
    const mine = list.filter((e) => e.t.B === b);
    if (mine.length !== 1) continue;
    const { t, j } = mine[0];
    const from = verts[t.v[j]].w;
    if (next.has(from)) return [];
    next.set(from, { t, j, to: verts[t.v[(j + 1) % 3]].w });
  }
  const found = [];
  while (next.size) {
    const [start] = next.keys();
    const loop = [];
    for (let w = start; next.has(w);) { const e = next.get(w); next.delete(w); loop.push(e); w = e.to; }
    if (loop.length >= 3 && loop.at(-1).to === start) found.push(loop);
  }
  return found;
}

function plane(pts) {
  const c = [0, 1, 2].map((i) => pts.reduce((s, p) => s + p[i], 0) / pts.length);
  let n = [0, 0, 0], edge = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    n = add(n, cross(sub(q, c), sub(p, c)));
    edge += len(sub(q, p));
  });
  return { c, n: unit(n), flat: len(n) < 1e-3 * edge * edge };
}

function cap(loop) {
  const { n, flat } = plane(loop.map(({ t, j }) => t.p[j]));
  if (flat) return 0;
  const ids = loop.map(({ t, j }) => {
    verts.push({ pi: t.pi, v: verts[t.v[j]].v, p: t.p[j], w: verts[t.v[j]].w, normal: n, uv: verts[loop[0].t.v[loop[0].j]].v });
    return verts.length - 1;
  });
  for (let i = 1; i + 1 < ids.length; i++) tris.push({ pi: loop[0].t.pi, k: null, v: [ids[0], ids[i + 1], ids[i]] });
  return 1;
}

analyse();
let capped = 0;
for (const b of bodies) {
  if (b.kind !== 'solid' && b.kind !== 'sheet') continue;
  const found = loops(b);
  if (b.kind === 'sheet') {
    if (found.length !== 1) continue;
    const pts = found[0].map(({ t, j }) => t.p[j]);
    const { c, n } = plane(pts);
    const depth = Math.max(...b.tris.flatMap((t) => t.p.map((p) => Math.abs(dot(sub(p, c), n)))));
    if (depth < goal || Math.max(...pts.map((p) => Math.abs(dot(sub(p, c), n)))) > depth / 3) continue;
  }
  for (const loop of found) capped += cap(loop);
}
if (capped) analyse();
for (const t of tris) t.n0 = t.n;
const solid = (t) => t.B.kind === 'solid';

const nodes = new Map();
for (const t of tris) {
  t.nodes = [0, 1, 2].map((j) => {
    const k = `${solid(t) ? sideOf[t.i] : `b${t.B.id}`}:${verts[t.v[j]].w}`;
    if (!nodes.has(k)) nodes.set(k, { p: verts[t.v[j]].p, d: [0, 0, 0], faces: [] });
    const nd = nodes.get(k);
    const a = unit(sub(t.p[(j + 1) % 3], t.p[j])), b = unit(sub(t.p[(j + 2) % 3], t.p[j]));
    nd.faces.push({ t, w: t.area > eps * eps ? Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) : 0 });
    return nd;
  });
}
const placed = (nd) => add(nd.p, nd.d);
const behind = (nd) => sub(nd.p, nd.d);
const nodeAt = (t, w) => t.nodes[t.v.findIndex((v) => verts[v].w === w)];

function solve(nd, want) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0], mean = [0, 0, 0];
  let sum = 0, most = 0;
  for (const { t, w } of nd.faces) {
    if (!w) continue;
    const d = want(t);
    most = Math.max(most, d);
    sum += w;
    for (let i = 0; i < 3; i++) {
      mean[i] += w * t.n[i];
      b[i] += w * d * t.n[i];
      for (let j = 0; j < 3; j++) A[i][j] += w * t.n[i] * t.n[j];
    }
  }
  if (!most || len(mean) < 0.35 * sum) return [0, 0, 0];
  for (let i = 0; i < 3; i++) A[i][i] += 1e-3 * sum;
  const D = det3(A);
  const x = [0, 1, 2].map((c) => det3(A.map((row, r) => row.map((v, k) => (k === c ? b[r] : v)))) / D);
  const l = len(x);
  return l > 1.75 * most ? x.map((v) => (v * 1.75 * most) / l) : x;
}

const samples = (t) => [t.c, ...t.p.map((p) => add(t.c, sub(p, t.c), 0.6))];
const thickness = (t) => samples(t).map((o) => through(t, o)).sort((a, b) => a - b)[1];
function through(t, o) {
  const hits = line(o, t.n, (u) => u !== t && solid(u));
  hits.push({ s: 0, t, cos: 1 });
  hits.sort((x, y) => x.s - y.s);
  const seg = new Array(hits.length + 1).fill(0);
  for (let i = hits.length - 1; i >= 0; i--) seg[i] = seg[i + 1] + (hits[i].cos > 0 ? 1 : -1);
  const at = hits.findIndex((h) => h.t === t);
  if (seg[at] <= 0) return Infinity;
  let lo = at, hi = at + 1;
  while (lo > 0 && seg[lo - 1] > 0) lo--;
  if (seg[hi] > 0) while (seg[hi + 1] > 0) hi++;
  return (seg[at + 1] > 0 ? hits[hi].s : 0) - (lo > 0 ? hits[lo - 1].s : -Infinity);
}
function gap(t) {
  const touching = (u) => t.v.some((v) => u.v.some((x) => verts[x].w === verts[v].w));
  const gaps = samples(t).map((o) => line(add(o, t.n, eps), t.n, (u) => u !== t && !touching(u)).find((h) => h.s > 0)?.s ?? Infinity);
  return gaps.sort((a, b) => a - b)[2] + eps;
}

for (const t of live) if (solid(t)) { t.t0 = thickness(t); t.room = 0.3 * gap(t); }

if (args.includes('--list')) {
  for (const b of bodies) {
    const ts = b.tris.filter((t) => t.t0 !== undefined).map((t) => t.t0);
    console.log(`part ${b.id} ${b.kind}${b.partner ? ` with ${b.partner.id}` : ''}: ${b.tris.length} tris, area ${b.area.toFixed(4)}, at ${b.tris[0].c.map((x) => x.toFixed(3))}${ts.length ? `, thinnest ${Math.min(...ts).toFixed(4)}` : ''}`);
  }
  process.exit(0);
}

for (let round = 0; round < 8; round++) {
  let short = 0;
  for (const t of live) {
    if (!solid(t)) continue;
    if (round) shape(t, (v) => placed(t.nodes[t.v.indexOf(v)]));
    const now = round ? thickness(t) : t.t0;
    const grown = dot(add(add(t.nodes[0].d, t.nodes[1].d), t.nodes[2].d), t.n) / 3;
    t.want = Math.max(0, Math.min((goal - now) / 2, t.room - grown, (goal - t.t0) / 2 - grown));
    if (t.want > goal * 0.01) short++;
  }
  if (!short) break;
  for (const nd of nodes.values()) {
    if (!solid(nd.faces[0].t)) continue;
    const d = add(nd.d, solve(nd, (t) => t.want ?? 0));
    const most = 1.75 * Math.max(0, ...nd.faces.map(({ t }) => (goal - (t.t0 ?? goal)) / 2)), l = len(d);
    nd.d = l > most ? d.map((x) => (x * most) / l) : d;
  }
}
for (const nd of nodes.values()) {
  const { kind } = nd.faces[0].t.B;
  if (kind === 'card') nd.d = solve(nd, (t) => Math.max(0, (goal - t.tw) / 2));
  if (kind === 'sheet') nd.d = solve(nd, () => goal / 2);
}

const facing = (t, at, n0) => {
  const p = t.nodes.map(at), c = cross(sub(p[1], p[0]), sub(p[2], p[0]));
  return len(c) < eps * eps || dot(unit(c), n0) > 0;
};
for (let k = 0; k < 40; k++) {
  const back = new Set();
  for (const t of live) {
    if (!facing(t, placed, t.n0)) t.nodes.forEach((nd) => back.add(nd));
    if (t.B.kind === 'sheet' && !facing(t, behind, t.n0)) t.nodes.forEach((nd) => back.add(nd));
  }
  if (!back.size) break;
  for (const nd of back) nd.d = nd.d.map((x) => x * 0.85);
}
const grownTo = live.filter((t) => solid(t) && t.t0 < goal).map((t) => (t.t0 + 2 * Math.max(0, dot(add(add(t.nodes[0].d, t.nodes[1].d), t.nodes[2].d), t.n) / 3)) / limit).sort((a, b) => a - b);
const extra = prims.map(() => []);
const far = (a, b) => len(sub(a, b)) > eps * 10;
const rim = (t, j, A2, B2) => {
  const k = (j + 1) % 3;
  const A = { from: t.v[j], pos: placed(t.nodes[j]) }, B = { from: t.v[k], pos: placed(t.nodes[k]) };
  const a2 = { from: t.v[j], pos: A2 }, b2 = { from: t.v[k], pos: B2 };
  const n = unit(cross(sub(B.pos, A.pos), t.n));
  if ((!far(A.pos, a2.pos) && !far(B.pos, b2.pos)) || !len(n)) return;
  for (const tri of [[A, a2, B], [B, a2, b2]]) {
    if (len(cross(sub(tri[1].pos, tri[0].pos), sub(tri[2].pos, tri[0].pos))) < eps * eps) continue;
    extra[t.pi].push(tri.map((x) => ({ ...x, normal: n })));
  }
};
for (const list of edges.values()) {
  const use = list.filter(({ t }) => t.B.kind !== 'decal');
  if (use.length === 1 && use[0].t.B.kind === 'sheet') {
    const { t, j } = use[0];
    rim(t, j, behind(t.nodes[j]), behind(t.nodes[(j + 1) % 3]));
  }
  if (use.length !== 2) continue;
  const [x, y] = use;
  const w = (j) => verts[x.t.v[j]].w;
  if (x.t.B.kind === 'sheet' || y.t.B.kind === 'sheet' || x.t.nodes.includes(nodeAt(y.t, w(x.j)))) continue;
  rim(x.t, x.j, placed(nodeAt(y.t, w(x.j))), placed(nodeAt(y.t, w((x.j + 1) % 3))));
}
for (const t of tris) if (t.B.kind === 'sheet') extra[t.pi].push([2, 1, 0].map((j) => ({ from: t.v[j], pos: behind(t.nodes[j]), flip: true })));

const adders = prims.map((P) => vertexAdder(glb, P.prim));
const local = (pi, p) => apply(prims[pi].inv, p);
const localDir = (pi, d) => unit(apply(prims[pi].inv, d, 0));
const indices = prims.map((P) => P.idx.slice());
const owner = new Map();
const made = new Map();
for (const t of tris) {
  const corner = t.nodes.map((nd, j) => {
    const g = t.v[j], vert = verts[g];
    const pos = local(vert.pi, placed(nd));
    if (vert.normal) {
      if (!made.has(g)) made.set(g, adders[t.pi].add(vert.v, prims[t.pi].nor ? { POSITION: pos, NORMAL: localDir(t.pi, vert.normal), TEXCOORD_0: vert.uv } : { POSITION: pos, TEXCOORD_0: vert.uv }));
      return made.get(g);
    }
    if ((owner.get(g) ?? nd) === nd) {
      owner.set(g, nd);
      vec3View(glb, prims[vert.pi].prim.attributes.POSITION)(vert.v).set(pos);
      return vert.v;
    }
    return adders[t.pi].add(vert.v, { POSITION: pos });
  });
  if (t.k === null) indices[t.pi].push(...corner);
  else corner.forEach((v, j) => { indices[t.pi][t.k + j] = v; });
}
for (const [pi, list] of extra.entries()) {
  const P = prims[pi];
  for (const tri of list) for (const x of tri) {
    const v = verts[x.from].v;
    const set = { POSITION: local(pi, x.pos), TEXCOORD_0: verts[tri[0].from].v };
    if (P.nor && x.normal) set.NORMAL = localDir(pi, x.normal);
    if (P.nor && x.flip) set.NORMAL = [-P.nor[v * 3], -P.nor[v * 3 + 1], -P.nor[v * 3 + 2]];
    indices[pi].push(adders[pi].add(v, set));
  }
}
const replaced = new Map();
prims.forEach((P, pi) => adders[pi].commit(indices[pi], replaced));
repack(glb, replaced);
fixBounds(glb);
writeGlb(out, glb.json, glb.bin, writeFileSync);

const count = (k) => bodies.filter((b) => b.kind === k).length;
const after = indices.reduce((s, x) => s + x.length / 3, 0);
const growth = Math.round((100 * (after - originalTris)) / originalTris);
const most = grownTo.at(-1) ?? 0, p95 = grownTo[Math.floor(0.95 * (grownTo.length - 1))] ?? 0;
const short = grownTo.filter((x) => x < 1).length;
console.log(`grown solid faces now ${grownTo.length ? `${(grownTo[0]).toFixed(2)}x to ${most.toFixed(2)}x the limit (95% under ${p95.toFixed(2)}x), ${short} still under` : 'none'}${most > 1.5 ? ' OVER 1.5x' : most > 1.25 ? ' warning: over 1.25x' : ''}; sheets ${(goal / limit).toFixed(2)}x`);
console.log(`${file}: limit ${limit}, goal ${goal.toFixed(4)}; ${live.filter((t) => solid(t) && t.t0 < goal).length} thin faces on solid parts, ${capped} holes capped, ${count('card')} two-sided and ${count('sheet')} one-sided sheets; tris ${originalTris} -> ${after} (+${growth}%)${growth > 50 ? ' OVER 50%' : growth > 25 ? ' warning: over 25%' : ''}`);
