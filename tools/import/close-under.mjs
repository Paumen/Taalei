import { writeFileSync } from 'node:fs';
import { readGlb, readAccessor, writeGlb } from '../../catalog/tools/glb.mjs';
import { editablePrimitives, primitiveMatrix, repack, fixBounds, welder, vertexAdder } from './mesh-edit.mjs';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(`close-under.mjs <file.glb>... [--down <y>] [--skirt [--band <f>]] [--back <d>] [--dry]
Closes every open hole of a model whose cap would face down (world normal y
below -<y>, default 0.2) with a flat cap: new points with the cap's own normal
and one colour, the cell that most of the hole's edge borders. --skirt drops
the edge of a hole in the lowest --band (0.15) of the model straight down to
the model's lowest point first and caps it there, for ground pieces that dip
below their own edge. --back <d> instead gives every open part (a single
sheet such as a cloth, wing or skin) a back side: a copy turned the other
way <d> (in world size) behind it, joined to it along the open edge. A new triangle that would lie on an\nexisting one (a doubled face, which flickers) is left out. Writes in place.`);
  process.exit(0);
}
const opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const down = Number(opt('--down', 0.2));
const dry = args.includes('--dry');
const skirt = args.includes('--skirt');
const band = Number(opt('--band', 0.15));
const back = Number(opt('--back', 0));
const files = args.filter((a, i) => a.endsWith('.glb') && !['--down', '--band', '--back'].includes(args[i - 1]));

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => { const l = Math.hypot(...v); return l ? v.map((x) => x / l) : null; };

function newell(pts) {
  const n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}

function earClip(pts, n) {
  const ax = Math.abs(n[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = unit(cross(n, ax)), v = cross(n, u);
  const q = pts.map((p) => [dot(p, u), dot(p, v)]);
  const area2 = (a, b, c) => (q[b][0] - q[a][0]) * (q[c][1] - q[a][1]) - (q[c][0] - q[a][0]) * (q[b][1] - q[a][1]);
  const inside = (p, a, b, c) => area2(a, b, p) >= 0 && area2(b, c, p) >= 0 && area2(c, a, p) >= 0;
  const idx = pts.map((_, i) => i);
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k + idx.length - 1) % idx.length], b = idx[k], c = idx[(k + 1) % idx.length];
      if (area2(a, b, c) <= 1e-14) continue;
      if (idx.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      out.push([a, b, c]);
      idx.splice(k, 1);
      cut = true;
      break;
    }
    if (!cut) return null;
  }
  if (idx.length === 3) out.push(idx);
  return out;
}

function close(file) {
  const glb = readGlb(file);
  const prims = editablePrimitives(glb.json);
  if (prims.length !== 1) return console.log(`${file}  skipped: ${prims.length} editable primitives`);
  const prim = prims[0];
  const M = primitiveMatrix(glb.json, prim);
  const P = readAccessor(glb, prim.attributes.POSITION).data;
  const UV = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
  const I = Array.from(readAccessor(glb, prim.indices).data);
  const { weld } = welder(P);
  const vid = Array.from({ length: P.length / 3 }, (_, i) => weld(i));
  const pos = (i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];

  const edges = new Map();
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = I[t + k], b = I[t + (k + 1) % 3];
    const key = vid[a] < vid[b] ? `${vid[a]},${vid[b]}` : `${vid[b]},${vid[a]}`;
    (edges.get(key) ?? edges.set(key, []).get(key)).push([a, b, t / 3]);
  }
  const out = new Map();
  for (const list of edges.values()) if (list.length === 1) {
    const [a, b] = list[0];
    (out.get(vid[a]) ?? out.set(vid[a], []).get(vid[a])).push([a, b]);
  }

  const loops = [];
  const used = new Set();
  for (const [start, list] of out) for (const first of list) {
    if (used.has(first)) continue;
    const loop = [];
    let e = first, guard = 0;
    while (e && !used.has(e) && guard++ < 100000) {
      used.add(e);
      loop.push(e);
      if (vid[e[1]] === start) break;
      e = (out.get(vid[e[1]]) ?? []).find((x) => !used.has(x));
    }
    if (loop.length >= 3 && vid[loop.at(-1)[1]] === start) loops.push(loop);
  }

  const ys = Array.from({ length: P.length / 3 }, (_, i) => P[3 * i + 1]);
  const floor = ys.reduce((a, b) => Math.min(a, b), Infinity), top = ys.reduce((a, b) => Math.max(a, b), -Infinity);
  const toWorld = (n) => unit([0, 1, 2].map((r) => M[r] * n[0] + M[4 + r] * n[1] + M[8 + r] * n[2]));
  const adder = vertexAdder(glb, prim);
  const placed = new Map();
  const add = { add: (from, set) => { const id = adder.add(from, set); placed.set(id, set.POSITION ?? pos(from)); return id; }, commit: (...a) => adder.commit(...a) };
  const tris = [...I];
  let caps = 0, capTris = 0;
  if (back) {
    const root = Array.from({ length: I.length / 3 }, (_, t) => t);
    const find = (t) => { while (root[t] !== t) t = root[t] = root[root[t]]; return t; };
    const byV = new Map();
    for (let t = 0; t < I.length / 3; t++) for (let k = 0; k < 3; k++) {
      const v = vid[I[3 * t + k]];
      if (byV.has(v)) root[find(t)] = find(byV.get(v)); else byV.set(v, t);
    }
    const open = new Set();
    for (const list of edges.values()) if (list.length === 1) {
      open.add(find(list[0][2]));
    }
    const vn = new Map();
    const faceN = (t) => cross(sub(pos(I[3 * t + 1]), pos(I[3 * t])), sub(pos(I[3 * t + 2]), pos(I[3 * t])));
    for (let t = 0; t < I.length / 3; t++) {
      if (!open.has(find(t))) continue;
      const n = faceN(t);
      for (let k = 0; k < 3; k++) {
        const v = vid[I[3 * t + k]];
        const s = vn.get(v) ?? [0, 0, 0];
        vn.set(v, s.map((x, j) => x + n[j]));
      }
    }
    const scale = Math.cbrt(Math.abs(M[0] * (M[5] * M[10] - M[6] * M[9]) - M[4] * (M[1] * M[10] - M[2] * M[9]) + M[8] * (M[1] * M[6] - M[2] * M[5]))) || 1;
    const behind = (i) => { const n = unit(vn.get(vid[i])) ?? [0, 1, 0]; return { p: pos(i).map((x, j) => x - (back / scale) * n[j]), n }; };
    for (let t = 0; t < I.length / 3; t++) {
      if (!open.has(find(t))) continue;
      const ids = [0, 1, 2].map((k) => { const i = I[3 * t + k]; const b = behind(i); return add.add(i, { POSITION: b.p, NORMAL: b.n.map((x) => -x) }); });
      tris.push(ids[0], ids[2], ids[1]);
      capTris++;
    }
    for (const list of edges.values()) if (list.length === 1) {
      const [a, b] = list[0];
      if (!vn.has(vid[a]) || !vn.has(vid[b])) continue;
      const n = unit(vn.get(vid[a]).map((x, j) => x + vn.get(vid[b])[j]));
      const outward = n && unit(cross(sub(pos(b), pos(a)), n));
      if (!outward) continue;
      const uv = [UV[2 * a], UV[2 * a + 1]];
      const quad = [pos(a), pos(b), behind(b).p, behind(a).p];
      const qid = quad.map((p, k) => add.add(k === 1 || k === 2 ? b : a, { POSITION: p, NORMAL: outward, TEXCOORD_0: uv }));
      for (const f of [[0, 1, 2], [0, 2, 3]]) {
        const fn = cross(sub(quad[f[1]], quad[f[0]]), sub(quad[f[2]], quad[f[0]]));
        tris.push(...(dot(fn, outward) >= 0 ? f : [f[0], f[2], f[1]]).map((k) => qid[k]));
        capTris++;
      }
    }
    caps = open.size;
  }
  for (const loop of back ? [] : loops) {
    const pts = loop.map(([a]) => pos(a)).reverse();
    const n = unit(newell(pts));
    if (!n) continue;
    const w = toWorld(n);
    if (!w || w[1] > -down) continue;
    const weight = new Map();
    for (const [a, b] of loop) {
      const key = `${UV[2 * a]},${UV[2 * a + 1]}`;
      weight.set(key, (weight.get(key) ?? 0) + Math.hypot(...sub(pos(a), pos(b))));
    }
    const uv = [...weight].sort((x, y) => y[1] - x[1])[0][0].split(',').map(Number);
    const from = loop.map(([a]) => a).reverse();
    if (skirt && Math.max(...pts.map((p) => p[1])) - floor <= band * (top - floor)) {
      const base = pts.map((p) => [p[0], floor, p[2]]);
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        const quad = [pts[i], base[i], base[j], pts[j]];
        if (Math.hypot(...sub(quad[0], quad[1])) + Math.hypot(...sub(quad[3], quad[2])) < 1e-6) continue;
        const outward = unit(cross(sub(pts[j], pts[i]), n));
        if (!outward) continue;
        const qid = quad.map((p, k) => add.add(from[k < 2 ? i : j], { NORMAL: outward, TEXCOORD_0: uv, POSITION: p }));
        for (const f of [[0, 1, 2], [0, 2, 3]]) {
          const fn = cross(sub(quad[f[1]], quad[f[0]]), sub(quad[f[2]], quad[f[0]]));
          tris.push(...(dot(fn, outward) >= 0 ? f : [f[0], f[2], f[1]]).map((k) => qid[k]));
          capTris++;
        }
      }
      pts.splice(0, pts.length, ...base);
      n.splice(0, 3, 0, -1, 0);
    }
    const set = { NORMAL: n, TEXCOORD_0: uv };
    let faces = earClip(pts, n);
    const ids = pts.map((p, k) => add.add(from[k], { ...set, POSITION: p }));
    if (!faces) {
      const c = pts.reduce((s, p) => s.map((x, k) => x + p[k] / pts.length), [0, 0, 0]);
      ids.push(add.add(from[0], { ...set, POSITION: c }));
      faces = pts.map((_, i) => [pts.length, i, (i + 1) % pts.length]);
    }
    for (const f of faces) tris.push(...f.map((k) => ids[k]));
    caps++;
    capTris += faces.length;
  }
  const at = (i) => placed.get(i) ?? pos(i);
  const faceKey = (t) => [0, 1, 2].map((k) => at(tris[t + k]).map((x) => Math.round(x / 1e-5)).join(',')).sort().join('|');
  const before = new Set();
  for (let t = 0; t < I.length; t += 3) before.add(faceKey(t));
  const kept = tris.slice(0, I.length);
  let doubled = 0;
  for (let t = I.length; t < tris.length; t += 3) {
    const key = faceKey(t);
    if (before.has(key)) { doubled++; continue; }
    before.add(key);
    kept.push(tris[t], tris[t + 1], tris[t + 2]);
  }
  tris.splice(0, tris.length, ...kept);
  console.log(`${file}  ${loops.length} open loops, capped ${caps} (${capTris - doubled} tris${doubled ? `, ${doubled} left out that would double a face` : ''})`);
  if (!caps || dry) return;
  const replaced = new Map();
  add.commit(tris, replaced);
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
}

for (const f of files) close(f);
