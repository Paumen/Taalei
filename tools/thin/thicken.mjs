#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor, thinnestWall } from '../../catalog/tools/glb.mjs';
import {
  repack, fixBounds, welder, editablePrimitives, primitiveMatrix, vertexAdder, rawRows,
  sub, dot, cross, catalogTubeNeed,
} from '../import/mesh-edit.mjs';

const HELP = `thicken.mjs <in.glb> [--out <file>] [--to <n>] [--parts <i,j>] [--mode around|base] [--list]

Thickens thin parts (welded shells) of a model to a wall of --to, in
catalogue units (default: the kind's thin.min, at least 0.006).
  --list   print every part with its wall, area and centre; change nothing
  --parts  only these part numbers (from --list); default every part under --to
  --mode   around: both sides grow by half (default)
           no face grows past half the gap to another part; parts held
           back that way are listed as short. A part lying on a
           thickened part (a pattern, clock hands) moves out with it
           base: the side touching another part stays, the other side grows
A closed part is offset face by face, a flat one straight through. An open
sheet (a card, or a two-sided card) becomes a closed slab of --to, its sides
keeping the edge's colour; one lying flat on another part is a layer and is
left.
Writes --out (default: overwrites in.glb) and prints each part's wall before
and the model's minWall after.`;

const SHARE = 0.2;
const FACING = -0.9;
const MIN_PART = 0.002;

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!file || args.includes('--help')) { console.log(HELP); process.exit(file ? 0 : 1); }
const out = flag('--out', file);
const mode = flag('--mode', 'around');
const only = flag('--parts', null)?.split(',').map(Number);
const target = Math.max(0.006, Number(flag('--to', catalogTubeNeed(file) ?? 0.006)));

const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const unit = (a) => { const l = Math.hypot(...a); return l > 0 ? scale3(a, 1 / l) : [0, 0, 0]; };

function ray(o, d, [a, b, c]) {
  const e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
  if (Math.abs(det) < 1e-14) return null;
  const s = sub(o, a), u = dot(s, h) / det;
  if (u < -1e-6 || u > 1 + 1e-6) return null;
  const q = cross(s, e1), v = dot(d, q) / det;
  if (v < -1e-6 || u + v > 1 + 1e-6) return null;
  return dot(e2, q) / det;
}

function solve3(A, b) {
  const [[a, b1, c], [d, e, f], [g, h, i]] = A;
  const det = a * (e * i - f * h) - b1 * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-18) return null;
  const col = (k) => A.map((r, j) => r.map((x, m) => (m === k ? b[j] : x)));
  const D = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  return [0, 1, 2].map((k) => D(col(k)) / det);
}

function analyse(glb, prim) {
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const idx = Array.from(readAccessor(glb, prim.indices).data);
  const { weld } = welder(pos);
  const count = pos.length / 3;
  const w = Array.from({ length: count }, (_, v) => weld(v));
  const at = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const point = new Map();
  for (let v = 0; v < count; v++) if (!point.has(w[v])) point.set(w[v], at(v));
  const faces = [];
  const seen = new Map();
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const vs = [idx[t], idx[t + 1], idx[t + 2]];
    const ws = vs.map((v) => w[v]);
    if (new Set(ws).size < 3) continue;
    const p = ws.map((x) => point.get(x));
    const n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const len = Math.hypot(...n);
    if (len < 1e-14) continue;
    const key = [...ws].sort((a, b) => a - b).join(',');
    const face = { t, vs, ws, p, n: scale3(n, 1 / len), area: len / 2, twin: seen.get(key) ?? null };
    if (face.twin) face.twin.twin = face;
    else seen.set(key, face);
    faces.push(face);
  }
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const f of faces) for (const x of f.ws) if (!parent.has(x)) parent.set(x, x);
  for (const f of faces) for (const x of f.ws.slice(1)) { const a = find(f.ws[0]), b = find(x); if (a !== b) parent.set(b, a); }
  const groups = new Map();
  for (const f of faces) { const r = find(f.ws[0]); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); }
  const total = faces.reduce((s, f) => s + f.area, 0);
  const parts = [...groups.values()].map((own, id) => {
    const area = own.reduce((s, f) => s + f.area, 0);
    const kept = own.filter((f) => !f.twin || f.twin.t > f.t);
    const edges = new Map();
    for (const f of kept) f.ws.forEach((a, k) => { const b = f.ws[(k + 1) % 3]; const e = a < b ? `${a},${b}` : `${b},${a}`; edges.set(e, (edges.get(e) ?? 0) + 1); });
    const open = [...edges.values()].some((c) => c === 1) || kept.length < own.length;
    const centre = scale3(own.reduce((s, f) => add3(s, scale3(add3(add3(f.p[0], f.p[1]), f.p[2]), f.area / 3)), [0, 0, 0]), 1 / area);
    const wall = wallOf(own, open);
    return { id, own, kept, area, open: open && wall === 0, centre, wall, small: area < MIN_PART * total };
  });
  return { pos, idx, w, faces, parts };
}

function wallOf(own, open) {
  const hits = [];
  for (const t of own) {
    const o = scale3(add3(add3(t.p[0], t.p[1]), t.p[2]), 1 / 3);
    const d = scale3(t.n, -1);
    let wall = Infinity;
    for (const b of own) {
      if (b === t || dot(b.n, t.n) > FACING || b.ws.some((x) => t.ws.includes(x))) continue;
      const r = ray(o, d, b.p);
      if (r !== null && r > 1e-5 && r < wall) wall = r;
    }
    if (wall < Infinity) hits.push({ wall, area: t.area });
  }
  if (open && hits.reduce((sum, h) => sum + h.area, 0) < 0.5 * own.reduce((sum, f) => sum + f.area, 0)) return 0;
  if (!hits.length) return Infinity;
  hits.sort((a, b) => a.wall - b.wall);
  const sum = hits.reduce((s, h) => s + h.area, 0);
  let acc = 0;
  for (const h of hits) { acc += h.area; if (acc >= SHARE * sum) return h.wall; }
  return hits[hits.length - 1].wall;
}

function gap(face, others, dir, far) {
  const o = scale3(add3(add3(face.p[0], face.p[1]), face.p[2]), 1 / 3);
  let best = far;
  for (const b of others) { const r = ray(o, dir, b.p); if (r !== null && r > 1e-5 && r < best) best = r; }
  return best;
}

function flatAxis(faces) {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const f of faces) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += f.area * f.n[i] * f.n[j];
  let v = [1, 0.7, 0.3];
  for (let i = 0; i < 50; i++) v = unit(M.map((r) => dot(r, v)));
  const area = faces.reduce((sum, f) => sum + f.area, 0);
  const along = faces.reduce((sum, f) => sum + (Math.abs(dot(f.n, v)) > 0.9 ? f.area : 0), 0);
  return along >= 0.9 * area ? v : null;
}

function layered(part, faces, reach) {
  const others = faces.filter((f) => !part.own.includes(f));
  let held = 0;
  for (const f of part.kept) {
    const o = scale3(add3(add3(f.p[0], f.p[1]), f.p[2]), 1 / 3);
    if ([f.n, scale3(f.n, -1)].some((d) => others.some((b) => { const r = ray(o, d, b.p); return r !== null && r > -1e-5 && r < reach; }))) held += f.area;
  }
  return held >= 0.5 * part.kept.reduce((sum, f) => sum + f.area, 0);
}

function touching(face, others, reach) {
  const o = scale3(add3(add3(face.p[0], face.p[1]), face.p[2]), 1 / 3);
  return others.some((b) => { const r = ray(o, face.n, b.p); return r !== null && r > -1e-5 && r < reach; });
}

function offsets(faces, move) {
  const sums = new Map();
  for (const f of faces) for (const x of f.ws) {
    if (!sums.has(x)) sums.set(x, { A: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b: [0, 0, 0], n: [0, 0, 0], d: 0, c: 0 });
    const s = sums.get(x), d = move.get(f);
    for (let i = 0; i < 3; i++) { s.b[i] += d * f.n[i]; s.n[i] += f.n[i]; for (let j = 0; j < 3; j++) s.A[i][j] += f.n[i] * f.n[j]; }
    s.d += d; s.c++;
  }
  const result = new Map();
  for (const [x, s] of sums) {
    const eps = 0.05 * s.c, n = unit(s.n), d = s.d / s.c;
    const A = s.A.map((r, i) => r.map((v, j) => v + (i === j ? eps : 0)));
    const o = solve3(A, s.b.map((v, i) => v + eps * d * n[i])) ?? scale3(n, d);
    const cap = 3 * Math.max(...[...move.values()].map(Math.abs));
    const l = Math.hypot(...o);
    result.set(x, l > cap ? scale3(o, cap / l) : o);
  }
  return result;
}

const short = [];
function report(part, move, full) {
  const total = part.own.reduce((sum, f) => sum + (move.has(f) ? f.area : 0), 0);
  const held = part.own.reduce((sum, f) => sum + (move.has(f) && move.get(f) < full - 1e-9 ? f.area : 0), 0);
  if (total && held / total > 0.05) short.push(`part ${part.number}: ${Math.round((100 * held) / total)}% of its faces held back by a gap to another part`);
}

const glb = readGlb(file);
const { json } = glb;
const replaced = new Map();
let changed = 0;
let number = 0;
const picks = new Map();
for (const prim of editablePrimitives(json)) {
  const m = primitiveMatrix(json, prim);
  const s = Math.cbrt(Math.abs(m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]))) || 1;
  const want = target / s;
  const a = analyse(glb, prim);
  const picked = [];
  for (const part of a.parts) {
    part.number = number++;
    if (args.includes('--list')) {
      console.log(`part ${part.number}  wall ${part.open ? 'open sheet' : (part.wall * s).toFixed(4)}  area ${(part.area * s * s).toFixed(5)}  centre ${part.centre.map((v) => (v * s).toFixed(3)).join(' ')}${part.small ? '  (tiny, not linted)' : ''}`);
      continue;
    }
    if (!only && part.open && layered(part, a.faces, 0.01 / s)) { console.log(`part ${part.number}: open sheet lying on another part, left as a layer`); continue; }
    if (only ? only.includes(part.number) : !part.small && part.wall < want) picked.push(part);
  }
  for (const part of picked) { picks.set(part.number, want); picks.set(part.number + 0.5, s); }
  if (!picked.length) continue;
  const posRows = rawRows(glb, prim.attributes.POSITION);
  const write = (v, p) => Buffer.from(Float32Array.from(p).buffer).copy(posRows.row(v));
  const moved = new Map();
  const adder = vertexAdder(glb, prim);
  const indices = a.idx.slice();
  const drop = new Set();
  const riders = new Map();
  const near = 0.004 / s;
  for (const support of picked) for (const q of a.parts) {
    if (q === support || riders.has(q)) continue;
    const hits = [];
    let held = 0;
    for (const f of q.own) {
      const o = scale3(add3(add3(f.p[0], f.p[1]), f.p[2]), 1 / 3);
      let best = null;
      for (const dir of [f.n, scale3(f.n, -1)]) for (const b of support.own) {
        const facing = dot(b.n, dir);
        if (Math.abs(facing) < 0.5) continue;
        const r = ray(o, dir, b.p);
        if (r !== null && r > -1e-5 && r < near && (!best || r < best.r)) best = { r, b, front: facing < 0 };
      }
      if (best) { hits.push(best); held += f.area; }
    }
    if (held >= 0.3 * q.area) riders.set(q, { support, hits });
  }
  const shift = new Map();
  const carryOf = (q) => {
    const hits = riders.get(q)?.hits ?? [];
    const sum = hits.reduce((acc, h) => { const sh = shift.get(h.b); return sh ? add3(acc, h.front ? sh.front : sh.back) : acc; }, [0, 0, 0]);
    return hits.length ? scale3(sum, 1 / hits.length) : [0, 0, 0];
  };
  picked.sort((p, q) => riders.has(p) - riders.has(q));
  for (const part of picked) {
    const carry = carryOf(part);
    if (Math.hypot(...carry) > 1e-9) console.log(`part ${part.number}: lies on part ${riders.get(part).support.number}, moved out with it`);
    const others = a.faces.filter((f) => !part.own.includes(f) && riders.get(a.parts.find((q) => q.own.includes(f)))?.support !== part);
    const reach = want + 0.002 / s;
    const room = 0.0005 / s;
    console.log(`part ${part.number}: wall ${part.open ? 'open sheet' : (part.wall * s).toFixed(4)} -> ${target}`);
    if (!part.open) {
      const delta = Math.max(0, want - part.wall);
      const base = mode === 'base' ? part.own.filter((f) => touching(f, others, reach)) : [];
      const move = new Map(part.own.map((f) => {
        const d = base.length ? (base.includes(f) ? 0 : delta) : delta / 2;
        return [f, Math.min(d, Math.max(0, gap(f, others, f.n, Infinity) / 2 - room))];
      }));
      report(part, move, base.length ? delta : delta / 2);
      for (const f of part.own) shift.set(f, { front: scale3(f.n, move.get(f)), back: [0, 0, 0] });
      const axis = flatAxis(part.own);
      if (axis) {
        const side = new Map();
        for (const f of part.own) for (const x of f.ws) {
          const k = dot(f.n, axis) >= 0 ? 1 : -1;
          const d = move.get(f);
          const prev = side.get(x);
          side.set(x, prev && prev.k === k ? { k, d: Math.min(prev.d, d) } : prev && Math.abs(dot(f.n, axis)) < 0.9 ? prev : { k, d });
        }
        for (const [x, { k, d }] of side) moved.set(x, add3(scale3(axis, k * d), carry));
      } else for (const [x, o] of offsets(part.own, move)) moved.set(x, add3(o, carry));
      continue;
    }
    for (const f of part.own) if (!part.kept.includes(f)) drop.add(f.t);
    const kept = part.kept;
    const base = mode === 'base' ? kept.filter((f) => touching(f, others, reach)).length > kept.length / 2 : false;
    const front = base ? want : want / 2, back = base ? 0 : want / 2;
    const upMove = new Map(kept.map((f) => [f, Math.min(front, Math.max(0, gap(f, others, f.n, Infinity) / 2 - room))]));
    const downMove = new Map(kept.map((f) => [f, Math.min(back, Math.max(0, gap(f, others, scale3(f.n, -1), Infinity) / 2 - room))]));
    report(part, new Map([...upMove].map(([f, d]) => [f, d + downMove.get(f)])), want);
    for (const f of kept) shift.set(f, { front: scale3(f.n, upMove.get(f)), back: scale3(f.n, -downMove.get(f)) });
    const up = new Map([...offsets(kept, upMove)].map(([x, o]) => [x, add3(o, carry)]));
    const down = new Map([...offsets(kept, downMove)].map(([x, o]) => [x, sub(o, carry)]));
    for (const [x, o] of up) moved.set(x, o);
    const copy = new Map();
    const normals = readAccessor(glb, prim.attributes.NORMAL).data;
    const copyOf = (v) => {
      if (!copy.has(v)) {
        const x = a.w[v];
        const p = sub([a.pos[v * 3], a.pos[v * 3 + 1], a.pos[v * 3 + 2]], down.get(x));
        copy.set(v, adder.add(v, { POSITION: p, NORMAL: [-normals[v * 3], -normals[v * 3 + 1], -normals[v * 3 + 2]] }));
      }
      return copy.get(v);
    };
    for (const f of kept) indices.push(copyOf(f.vs[0]), copyOf(f.vs[2]), copyOf(f.vs[1]));
    const edges = new Map();
    for (const f of kept) f.ws.forEach((x, k) => {
      const y = f.ws[(k + 1) % 3];
      const key = x < y ? `${x},${y}` : `${y},${x}`;
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push({ f, k });
    });
    for (const list of edges.values()) {
      if (list.length !== 1) continue;
      const { f, k } = list[0];
      const va = f.vs[k], vb = f.vs[(k + 1) % 3];
      const pa = add3(f.p[k], up.get(f.ws[k])), pb = add3(f.p[(k + 1) % 3], up.get(f.ws[(k + 1) % 3]));
      const qa = sub(f.p[k], down.get(f.ws[k])), qb = sub(f.p[(k + 1) % 3], down.get(f.ws[(k + 1) % 3]));
      const side = unit(cross(sub(pb, pa), f.n));
      const v = [adder.add(va, { POSITION: pa, NORMAL: side }), adder.add(vb, { POSITION: pb, NORMAL: side }), adder.add(vb, { POSITION: qb, NORMAL: side }), adder.add(va, { POSITION: qa, NORMAL: side })];
      const g = cross(sub(pb, pa), sub(qb, pa));
      if (dot(g, side) >= 0) indices.push(v[0], v[1], v[2], v[0], v[2], v[3]);
      else indices.push(v[0], v[2], v[1], v[0], v[3], v[2]);
    }
  }
  for (const [q] of riders) {
    if (picked.includes(q)) continue;
    const carry = carryOf(q);
    if (Math.hypot(...carry) < 1e-9) continue;
    for (const x of new Set(q.own.flatMap((f) => f.ws))) moved.set(x, add3(moved.get(x) ?? [0, 0, 0], carry));
    console.log(`part ${q.number}: lies on part ${riders.get(q).support.number}, moved out with it`);
  }
  for (let v = 0; v < a.w.length; v++) {
    const o = moved.get(a.w[v]);
    if (o) write(v, add3([a.pos[v * 3], a.pos[v * 3 + 1], a.pos[v * 3 + 2]], o));
  }
  const kept = [];
  for (let t = 0; t + 2 < indices.length; t += 3) if (!drop.has(t)) kept.push(indices[t], indices[t + 1], indices[t + 2]);
  adder.commit(kept, replaced);
  changed += picked.length;
}

if (!args.includes('--list')) {
  if (!changed) { console.log(`nothing under ${target}`); process.exit(0); }
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(out, json, glb.bin, writeFileSync);
  console.log(`${changed} part(s) thickened; minWall now ${thinnestWall(readGlb(out))?.toFixed(4)}`);
  for (const line of short) console.log(`short: ${line}`);
  const after = readGlb(out);
  let n = 0;
  for (const prim of editablePrimitives(after.json)) for (const part of analyse(after, prim).parts) {
    if (picks.has(n) && part.wall < picks.get(n) * 0.98) console.log(`under: part ${n} still at ${part.open ? 'open sheet' : (part.wall * picks.get(n + 0.5)).toFixed(4)}`);
    n++;
  }
}
