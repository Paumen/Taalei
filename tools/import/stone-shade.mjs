import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix, welder, buildTree, hitBox, hitTriangle, vertexAdder } from './mesh-edit.mjs';

const HELP = `stone-shade.mjs [options] <workfile.glb> [...]

Shades the stone of one band (default taupe, cell 14,3) from flat. Every other
band stays as it is. Per vertex, v within the band is
  base + whole * (height in the model's stone, top -0.5 .. bottom +0.5)
       + piece * (height in its own piece, same scale)
       - up * upward facing + down * downward facing
       + shadow * max(recess, overhang)
       + trim step,
kept within --light .. --dark. With --band, stone walls under an eave get a
cut line --band of the model's height below it, so the shade under the eave
ends there.
recess is how closed in the spot is within --near of the stone's size,
overhang how much of the sky right above it is covered within --over of its
height, both by the whole model.

  --cell <c,r>     band cell (14,3)
  --base <f>       0.42
  --whole <f>      0.50
  --piece <f>      0.15
  --up <f>         0.12
  --down <f>       0.08
  --shadow <f>     0.20
  --trim <f>       0.08   caps and sills lighter, plinths darker
  --near <f>       0.12
  --over <f>       0.35
  --open <f>       0.45   share of closed-in view a spot may have before it darkens
  --under <f>      0.3    faces looking down are at least base + under
  --light <f>      0.15   lightest v
  --dark <f>       0.82   darkest v
  --band <f>       0.12   0 for no cut lines
  --keep <f>       1      share of the original light and dark of each face kept, against its piece's mean
  --split <0|1>    0      1: a hard edge at the cut line instead of a fade
  --flat <f>       0.97   faces this close in direction share one shadow tone
  --keep <f>       1      share of the original light and dark of each face kept, against its piece's mean
  --split <0|1>    0      1: a hard edge at the cut line instead of a fade
  --flat <f>       0.97   faces this close in direction share one shadow tone
  --budget <f>     0.08   most tris cut lines may add, as a share of the model's
  --add <0|1>      0      1: keep each vertex's own v and add the shading on top,
                          so --base and --keep do nothing
  --shift <f>      0      with --add, added to every v of the band
  --dry`;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function hemisphere(n) {
  const out = [];
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (i + 0.5) / n;
    const r = Math.sqrt(1 - z * z);
    out.push([Math.cos(g * i) * r, Math.sin(g * i) * r, z]);
  }
  return out;
}
const HEMI = hemisphere(48).map(([x, y, z]) => [x, y, Math.sqrt(z)]).map(norm);
const CONE = hemisphere(64).filter(([, , z]) => z > Math.cos((30 * Math.PI) / 180)).map(([x, y, z]) => [x, z, y]);

function frame(n) {
  const t = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const a = norm([t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]]);
  const b = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
  return (d) => [a[0] * d[0] + b[0] * d[1] + n[0] * d[2], a[1] * d[0] + b[1] * d[1] + n[1] * d[2], a[2] * d[0] + b[2] * d[1] + n[2] * d[2]];
}

function blocked(tree, tris, o, d, far) {
  const inv = d.map((x) => 1 / x);
  const stack = [tree.root];
  while (stack.length) {
    const node = stack.pop();
    if (!hitBox(node.b, o, inv, far)) continue;
    if (node.left) { stack.push(node.left, node.right); continue; }
    for (let i = node.start; i < node.end; i++) {
      const t = hitTriangle(o, d, tris[tree.order[i]]);
      if (t > 0 && t < far) return true;
    }
  }
  return false;
}

const transform = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
const turn = (m, p) => norm([m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]]);


function worldTris(glb) {
  const all = [];
  for (const prim of (glb.json.meshes ?? []).flatMap((m) => m.primitives)) {
    const m = primitiveMatrix(glb.json, prim);
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const idx = readAccessor(glb, prim.indices).data;
    const w = [];
    for (let i = 0; i < pos.length / 3; i++) w.push(transform(m, [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]));
    for (let t = 0; t < idx.length; t += 3) all.push([w[idx[t]], w[idx[t + 1]], w[idx[t + 2]]]);
  }
  return all;
}

function nearestUp(tree, tris, p, n, eps, far) {
  const o = [p[0] + n[0] * eps * 4, p[1] + eps, p[2] + n[2] * eps * 4];
  let c = 0, m = 0;
  for (const d of CONE) {
    if (d[0] * n[0] + d[1] * n[1] + d[2] * n[2] < 0) continue;
    m++;
    if (blocked(tree, tris, o, d, far)) c++;
  }
  return m ? c / m : 1;
}

function cutUnderEaves(glb, o, cu, cv) {
  const all = worldTris(glb);
  if (!all.length) return 0;
  const tree = buildTree(all);
  let yl = Infinity, yh = -Infinity, size = 0;
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (const tri of all) for (const p of tri) for (let k = 0; k < 3; k++) { low[k] = Math.min(low[k], p[k]); high[k] = Math.max(high[k], p[k]); }
  yl = low[1]; yh = high[1];
  size = Math.max(...sub(high, low));
  const eps = 1e-3 * size, band = o.band * (yh - yl);
  const replaced = new Map();
  let added = 0;
  for (const prim of editablePrimitives(glb.json)) {
    if (prim.attributes.TEXCOORD_0 === undefined || prim.targets) continue;
    const m = primitiveMatrix(glb.json, prim);
    const pos = Array.from(readAccessor(glb, prim.attributes.POSITION).data);
    const uv = Array.from(readAccessor(glb, prim.attributes.TEXCOORD_0).data);
    const nrm = prim.attributes.NORMAL !== undefined ? Array.from(readAccessor(glb, prim.attributes.NORMAL).data) : null;
    let idx = Array.from(readAccessor(glb, prim.indices).data);
    const wy = (i) => transform(m, [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]])[1];
    const mine = (t) => {
      const ku = Math.floor(((uv[2 * idx[t]] + uv[2 * idx[t + 1]] + uv[2 * idx[t + 2]]) / 3) * 16);
      const kv = Math.floor(((uv[2 * idx[t] + 1] + uv[2 * idx[t + 1] + 1] + uv[2 * idx[t + 2] + 1]) / 3) * 4);
      return ku === cu && kv === cv;
    };
    const planes = [];
    for (let t = 0; t < idx.length; t += 3) {
      if (!mine(t)) continue;
      const w = [0, 1, 2].map((k) => transform(m, [pos[3 * idx[t + k]], pos[3 * idx[t + k] + 1], pos[3 * idx[t + k] + 2]]));
      const e1 = sub(w[1], w[0]), e2 = sub(w[2], w[0]);
      const n = norm([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
      if (Math.abs(n[1]) > 0.3) continue;
      const top = w.reduce((a, b) => (b[1] > a[1] ? b : a));
      const bottom = Math.min(...w.map((p) => p[1]));
      if (top[1] - bottom < 2.5 * band) continue;
      if (nearestUp(tree, all, top, n, eps, band) < 0.5) continue;
      const mid = [0, 1, 2].map((k) => (w[0][k] + w[1][k] + w[2][k]) / 3 + n[k] * eps * 4);
      if (blocked(tree, all, mid, n, 0.3 * size)) continue;
      const y = top[1] - band;
      const q = planes.find((r) => Math.abs(r.y - y) < 0.2 * band);
      const area = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]);
      if (q) q.area += area; else planes.push({ y, area });
    }
    if (!planes.length) continue;
    const crossing = (y) => {
      let c = 0;
      for (let t = 0; t < idx.length; t += 3) {
        if (!mine(t)) continue;
        const ys = [0, 1, 2].map((k) => wy(idx[t + k]) - y);
        if (ys.some((d) => d > 1e-6 * size) && ys.some((d) => d < -1e-6 * size)) c += 2;
      }
      return c;
    };
    let budget = Math.floor(o.budget * idx.length / 3);
    const keep = [];
    for (const q of planes.sort((a, b) => b.area - a.area)) {
      const c = crossing(q.y);
      if (c <= budget) { keep.push(q.y); budget -= c; }
    }
    planes.length = 0;
    planes.push(...keep);
    if (!planes.length) continue;
    const adder = vertexAdder(glb, prim);
    let count = pos.length / 3;
    for (const y of planes) {
      const made = new Map();
      const at = (a, b, side) => {
        const key = `${a < b ? `${a},${b}` : `${b},${a}`}|${o.split ? side : ''}`;
        if (a === b && !o.split) return a;
        if (made.has(key)) return made.get(key);
        const ya = wy(a), yb = wy(b), f = b === a ? 0 : (y - ya) / (yb - ya);
        const lerp = (arr, k) => Array.from({ length: k }, (_, j) => arr[k * a + j] + (arr[k * b + j] - arr[k * a + j]) * f);
        const P = lerp(pos, 3), U = lerp(uv, 2);
        const set = { POSITION: P, TEXCOORD_0: U };
        pos.push(...P); uv.push(...U);
        if (nrm) { const N = norm(lerp(nrm, 3)); set.NORMAL = N; nrm.push(...N); }
        const from = adder.add(a, set);
        if (from !== count) throw new Error('vertex order');
        count++;
        made.set(key, from);
        return from;
      };
      const next = [];
      for (let t = 0; t < idx.length; t += 3) {
        const tri = [idx[t], idx[t + 1], idx[t + 2]];
        const sd = tri.map((i) => wy(i) - y);
        const above = sd.map((d) => d > 1e-6 * size), below = sd.map((d) => d < -1e-6 * size);
        if (!mine(t) || !above.some(Boolean) || !below.some(Boolean)) { next.push(...tri); continue; }
        const on = sd.findIndex((d) => !(d > 1e-6 * size) && !(d < -1e-6 * size));
        if (on >= 0) {
          const [a, b, c] = [tri[on], tri[(on + 1) % 3], tri[(on + 2) % 3]];
          const sb = above[(on + 1) % 3] ? 'u' : 'd', sc = sb === 'u' ? 'd' : 'u';
          next.push(a, b, at(b, c, sb), at(a, a, sc), at(b, c, sc), c);
          added++;
          continue;
        }
        const lone = [0, 1, 2].find((k) => above.filter(Boolean).length === 1 ? above[k] : below[k]);
        const [a, b, c] = [tri[lone], tri[(lone + 1) % 3], tri[(lone + 2) % 3]];
        const sl = above[lone] ? 'u' : 'd', so = sl === 'u' ? 'd' : 'u';
        const pab = at(a, b, so), pac = at(a, c, so);
        next.push(a, at(a, b, sl), at(a, c, sl), pab, b, c, pab, c, pac);
        added += 2;
      }
      idx = next;
    }
    adder.commit(idx, replaced);
  }
  if (replaced.size) { repack(glb, replaced); fixBounds(glb); }
  return added;
}

function shade(file, o) {
  const glb = readGlb(file);
  const [cu, cv] = o.cell.split(',').map(Number);
  const cuts = o.band > 0 ? cutUnderEaves(glb, o, cu, cv) : 0;
  const prims = editablePrimitives(glb.json).filter((p) => p.attributes.TEXCOORD_0 !== undefined && glb.json.accessors[p.attributes.TEXCOORD_0].componentType === 5126);
  const all = [];
  const stone = [];
  for (const prim of (glb.json.meshes ?? []).flatMap((m) => m.primitives)) {
    const m = primitiveMatrix(glb.json, prim);
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const idx = readAccessor(glb, prim.indices).data;
    const w = [];
    for (let i = 0; i < pos.length / 3; i++) w.push(transform(m, [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]));
    for (let t = 0; t < idx.length; t += 3) all.push([w[idx[t]], w[idx[t + 1]], w[idx[t + 2]]]);
    if (!prims.includes(prim)) continue;
    const uv = Float32Array.from(readAccessor(glb, prim.attributes.TEXCOORD_0).data);
    const nrm = prim.attributes.NORMAL !== undefined ? readAccessor(glb, prim.attributes.NORMAL).data : null;
    stone.push({ prim, m, pos, idx, w, uv, nrm });
  }
  if (!all.length) return 0;
  const tree = buildTree(all);
  let low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (const tri of all) for (const p of tri) for (let k = 0; k < 3; k++) { low[k] = Math.min(low[k], p[k]); high[k] = Math.max(high[k], p[k]); }
  const size = Math.max(...sub(high, low));
  const eps = 1e-3 * size;

  const verts = [];
  for (const s of stone) {
    const { pos, idx, uv, w } = s;
    const count = pos.length / 3;
    const cell = new Array(count).fill(null);
    const fn = Array.from({ length: count }, () => [0, 0, 0]);
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      const ku = Math.floor(((uv[2 * a] + uv[2 * b] + uv[2 * c]) / 3) * 16);
      const kv = Math.floor(((uv[2 * a + 1] + uv[2 * b + 1] + uv[2 * c + 1]) / 3) * 4);
      const mine = ku === cu && kv === cv;
      const e1 = sub(w[b], w[a]), e2 = sub(w[c], w[a]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      for (const v of [a, b, c]) {
        cell[v] = cell[v] === null || cell[v] === mine ? mine : 'mixed';
        for (let k = 0; k < 3; k++) fn[v][k] += n[k];
      }
    }
    const { weld } = welder(pos);
    for (let i = 0; i < count; i++) {
      if (cell[i] !== true) continue;
      const n = s.nrm ? turn(s.m, [s.nrm[3 * i], s.nrm[3 * i + 1], s.nrm[3 * i + 2]]) : norm(fn[i]);
      verts.push({ s, i, p: w[i], n, was: uv[2 * i + 1] * 4 - cv, key: `${verts.length}`, point: `${stone.indexOf(s)}:${weld(i)}` });
    }
    s.trisMine = [];
    for (let t = 0; t < idx.length; t += 3) if (cell[idx[t]] === true && cell[idx[t + 1]] === true && cell[idx[t + 2]] === true) s.trisMine.push(t);
  }
  if (!verts.length) return 0;

  const parent = new Map();
  const find = (a) => { while (parent.has(a) && parent.get(a) !== a) a = parent.get(a); return a; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
  const byVert = new Map(verts.map((v) => [`${stone.indexOf(v.s)}#${v.i}`, v]));
  for (const s of stone) for (const t of s.trisMine) {
    const [a, b, c] = [0, 1, 2].map((k) => byVert.get(`${stone.indexOf(s)}#${s.idx[t + k]}`).point);
    join(a, b); join(b, c);
  }
  const pieces = new Map();
  for (const v of verts) {
    v.piece = find(v.point);
    const pc = pieces.get(v.piece) ?? { low: [Infinity, Infinity, Infinity], high: [-Infinity, -Infinity, -Infinity], verts: [] };
    for (let k = 0; k < 3; k++) { pc.low[k] = Math.min(pc.low[k], v.p[k]); pc.high[k] = Math.max(pc.high[k], v.p[k]); }
    pc.verts.push(v);
    pieces.set(v.piece, pc);
  }
  let yLow = Infinity, yHigh = -Infinity;
  for (const v of verts) { yLow = Math.min(yLow, v.p[1]); yHigh = Math.max(yHigh, v.p[1]); }
  const span = yHigh - yLow || 1;

  for (const [, pc] of pieces) {
    pc.was = pc.verts.reduce((x, v) => x + v.was, 0) / pc.verts.length;
    const h = pc.high[1] - pc.low[1];
    const wide = Math.max(pc.high[0] - pc.low[0], pc.high[2] - pc.low[2]);
    pc.trim = 0;
    if (pieces.size < 2 || h > 0.35 * wide || h > 0.25 * span) continue;
    const mid = (pc.high[1] + pc.low[1]) / 2;
    const rel = (mid - yLow) / span;
    if (rel > 0.5) pc.trim = -o.trim;
    else if (pc.low[1] - yLow < 0.05 * span) pc.trim = o.trim;
  }

  const near = o.near * size;
  const mh = high[1] - low[1] || 1;
  const reach = 0.08 * size, tol = 0.01 * size;
  const nkey = (n) => n.map((x) => Math.round(x * 4)).join(',');
  const cellOf = (p) => p.map((x) => Math.floor(x / reach));
  const hash = new Map();
  for (const v of verts) {
    const k = `${nkey(v.n)}|${cellOf(v.p).join(',')}`;
    if (!hash.has(k)) hash.set(k, []);
    hash.get(k).push(v);
  }
  for (const v of verts) {
    const d = v.n[0] * v.p[0] + v.n[1] * v.p[1] + v.n[2] * v.p[2];
    const [x, y, z] = cellOf(v.p);
    v.proud = false;
    for (let i = -1; i <= 1 && !v.proud; i++) for (let j = -1; j <= 1 && !v.proud; j++) for (let k = -1; k <= 1 && !v.proud; k++) {
      for (const w of hash.get(`${nkey(v.n)}|${x + i},${y + j},${z + k}`) ?? []) {
        const e = v.n[0] * w.p[0] + v.n[1] * w.p[1] + v.n[2] * w.p[2];
        const lateral = Math.hypot(...sub(sub(w.p, v.p), v.n.map((c) => c * (e - d))));
        if (d - e > tol && d - e < reach && lateral < reach) { v.proud = true; break; }
      }
    }
  }
  const band = o.band * mh;
  const sample = (p, n) => {
    const origin = [p[0] + n[0] * eps, p[1] + n[1] * eps, p[2] + n[2] * eps];
    const f = frame(n);
    let hit = 0;
    for (const d of HEMI) if (blocked(tree, all, origin, f(d), near)) hit++;
    const sky = nearestUp(tree, all, p, n, eps, o.over * mh);
    const eave = n[1] > -0.3 ? nearestUp(tree, all, p, n, eps, 1.2 * band) : 0;
    return { hit: hit / HEMI.length, sky, eave };
  };
  const tparent = new Map();
  const tfind = (x) => { while (tparent.get(x) !== x) x = tparent.get(x); return x; };
  const flat = [];
  const byIndex = new Map();
  for (const [si, s] of stone.entries()) for (const t of s.trisMine) {
    const keys = [0, 1, 2].map((k) => `${si}#${s.idx[t + k]}`);
    const w = keys.map((k) => byVert.get(k).p);
    const e1 = sub(w[1], w[0]), e2 = sub(w[2], w[0]);
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const area = Math.hypot(...cr);
    if (area < 1e-12) continue;
    const tri = { id: flat.length, keys, area, c: [0, 1, 2].map((k) => (w[0][k] + w[1][k] + w[2][k]) / 3), n: norm(cr) };
    flat.push(tri);
    tparent.set(tri.id, tri.id);
    for (const k of keys) {
      if (!byIndex.has(k)) byIndex.set(k, []);
      for (const other of byIndex.get(k)) {
        if (other.n[0] * tri.n[0] + other.n[1] * tri.n[1] + other.n[2] * tri.n[2] < o.flat) continue;
        const x = tfind(other.id), y = tfind(tri.id);
        if (x !== y) tparent.set(x, y);
      }
      byIndex.get(k).push(tri);
    }
  }
  const region = new Map();
  for (const tri of flat) {
    const r = tfind(tri.id);
    if (!region.has(r)) region.set(r, { tris: [], verts: [] });
    region.get(r).tris.push(tri);
    tri.region = region.get(r);
  }
  for (const [, g] of region) {
    const pick = [...g.tris].sort((x, y) => y.area - x.area).slice(0, 24);
    const total = pick.reduce((acc, t) => acc + t.area, 0);
    const acc = { hit: 0, sky: 0, eave: 0 };
    for (const t of pick) { const q = sample(t.c, t.n); for (const k in acc) acc[k] += (q[k] * t.area) / total; }
    g.q = acc;
    g.area = g.tris.reduce((x, t) => x + t.area, 0);
    g.n = norm(g.tris.reduce((x, t) => x.map((c, k) => c + t.n[k] * t.area), [0, 0, 0]));
  }
  const touching = new Map();
  for (const tri of flat) for (const k of tri.keys) {
    const pt = byVert.get(k).point;
    if (!touching.has(pt)) touching.set(pt, new Set());
    touching.get(pt).add(tri.region);
  }
  const near2 = new Map([...region.values()].map((g) => [g, new Set([g])]));
  for (const set of touching.values()) for (const a of set) for (const b of set) {
    const dn = a.n[0] * b.n[0] + a.n[1] * b.n[1] + a.n[2] * b.n[2];
    if (dn > 0.85 && dn < 0.995) near2.get(a).add(b);
  }
  for (const [g, set] of near2) {
    const total = [...set].reduce((x, h) => x + h.area, 0);
    g.qs = { hit: 0, sky: 0, eave: 0 };
    for (const h of set) for (const k in g.qs) g.qs[k] += (h.q[k] * h.area) / total;
  }
  for (const g of region.values()) g.q = g.qs;
  for (const v of verts) {
    const tris = byIndex.get(`${stone.indexOf(v.s)}#${v.i}`) ?? [];
    if (!tris.length) continue;
    const seen = new Map();
    for (const t of tris) {
      const d = Math.max(0, t.n[0] * v.n[0] + t.n[1] * v.n[1] + t.n[2] * v.n[2]);
      seen.set(t.region, (seen.get(t.region) ?? 0) + t.area * d ** 4 + 1e-12 * t.area);
    }
    const total = [...seen.values()].reduce((x, y) => x + y, 0);
    v.q = { hit: 0, sky: 0, eave: 0 };
    for (const [g, w] of seen) { for (const k in v.q) v.q[k] += (g.q[k] * w) / total; g.verts.push(v); }
    v.region = [...seen.entries()].sort((x, y) => y[1] - x[1])[0][0];
  }
  for (const [, g] of region) {
    let front = false, behind = false;
    for (const v of g.verts) {
      const d = v.n[0] * v.p[0] + v.n[1] * v.p[1] + v.n[2] * v.p[2];
      const [x, y, z] = cellOf(v.p);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        for (const w of hash.get(`${nkey(v.n)}|${x + i},${y + j},${z + k}`) ?? []) {
          if (!w.region || w.region === g || w.region.area <= g.area) continue;
          const e = v.n[0] * w.p[0] + v.n[1] * w.p[1] + v.n[2] * w.p[2];
          if (Math.abs(d - e) <= tol || Math.abs(d - e) > reach) continue;
          if (Math.hypot(...sub(sub(w.p, v.p), v.n.map((c) => c * (e - d)))) > reach) continue;
          if (e > d) front = true; else behind = true;
        }
      }
    }
    g.step = behind && !front ? -o.trim : front && !behind ? o.trim : 0;
  }
  const soft = (x) => {
    const k = 0.12, lo = o.light, hi = o.dark;
    if (x < lo + k) return lo + k * Math.exp((x - lo - k) / k);
    if (x > hi - k) return hi - k * Math.exp((hi - k - x) / k);
    return x;
  };
  let moved = 0;
  for (const v of verts) {
    const pc = pieces.get(v.piece);
    const ph = pc.high[1] - pc.low[1];
    const hWhole = (high[1] - v.p[1]) / mh - 0.5;
    const hPiece = ph > 1e-9 ? (pc.high[1] - v.p[1]) / ph - 0.5 : 0;
    const q = v.q ?? sample(v.p, v.n);
    const proud = v.region ? v.region.proud : v.proud;
    const { sky } = q;
    const eave = v.n[1] > -0.3 ? nearestUp(tree, all, v.p, v.n, eps, 1.2 * band) : 0;
    const dev = v.was - pc.was;
    const own = Math.min(1, Math.abs(dev) / 0.1);
    const recess = Math.max(0, Math.min(1, (q.hit - o.open) / 0.3)) * (0.35 + 0.65 * sky);
    const overhang = Math.max(0, Math.min(1, (eave - 0.25) / 0.5));
    const open = 1 - 0.5 * Math.max(0, v.n[1]) * (1 - sky);
    let val = o.base + o.whole * hWhole * (hWhole < 0 ? 1 - overhang : open) + o.piece * hPiece
      - o.up * Math.max(0, v.n[1]) * (1 - recess * (1 - sky)) + o.down * Math.max(0, -v.n[1])
      + o.shadow * Math.max(recess * (1 - own), overhang) + o.keep * dev;
    if (v.n[1] < -0.5) val = Math.max(val, o.base + o.under);
    if (o.add) val = v.was + val - o.base - o.keep * dev + o.shift;
    val = soft(val) + pc.trim + (v.region ? v.region.step : proud ? -o.trim : 0);
    val = Math.max(0.04, Math.min(0.94, val));
    v.s.uv[2 * v.i + 1] = (cv + val) / 4;
    moved++;
  }
  if (!o.dry) {
    const replaced = new Map(stone.map((s) => [s.prim.attributes.TEXCOORD_0, Buffer.from(s.uv.buffer)]));
    repack(glb, replaced);
    fixBounds(glb);
    writeGlb(file, glb.json, glb.bin, writeFileSync);
  }
  return `${moved} vertices, ${cuts} tris added`;
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(0); }
const opts = { cell: '14,3', base: 0.42, whole: 0.5, piece: 0.15, up: 0.12, down: 0.08, shadow: 0.2, trim: 0.08, near: 0.12, over: 0.35, open: 0.45, under: 0.3, light: 0.15, dark: 0.82, band: 0.12, budget: 0.08, flat: 0.97, keep: 1, split: 0, add: 0, shift: 0, dry: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dry') { opts.dry = true; continue; }
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  if (!(k in opts)) throw new Error(`unknown ${a}`);
  opts[k] = k === 'cell' ? args[i + 1] : Number(args[i + 1]);
  args[i + 1] = '';
  i++;
}
for (const file of args.filter((a) => a && !a.startsWith('--'))) console.log(`${file}: ${shade(file, opts)}`);
