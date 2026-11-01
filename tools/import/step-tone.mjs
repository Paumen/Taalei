import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix, vertexAdder, welder } from './mesh-edit.mjs';

const HELP = `step-tone.mjs [options] <workfile.glb> [...]

Gives every face of one band (default taupe, cell 14,3) a flat tone, no
gradients, each face flat-shaded. A step is a run of joined faces looking up at one height, plus the
upright faces under its outer edges that reach down no further than the next
step below. Each step's top takes one of --levels values --gap apart in v from
--top, dealt from a shuffled deck seeded by file name; its upright faces sit
--riser darker. Other upright faces sit at --wall, faces looking down at --under.
v runs 0 light to 1 dark.

  --cell <c,r>   14,3
  --levels <n>   5
  --top <f>      0.05
  --gap <f>      0.1
  --riser <f>    0.25
  --wall <f>     0.6
  --under <f>    0.8
  --dry`;

const opt = { cell: [14, 3], levels: 5, top: 0.05, gap: 0.1, riser: 0.25, wall: 0.6, under: 0.8, dry: false };
const files = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
  else if (a === '--cell') opt.cell = argv[++i].split(',').map(Number);
  else if (a === '--dry') opt.dry = true;
  else if (a.startsWith('--')) opt[a.slice(2)] = Number(argv[++i]);
  else files.push(a);
}
if (!files.length) { console.log(HELP); process.exit(1); }

const apply = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);

function rng(text) {
  let seed = 0;
  for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  seed = seed || 1;
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

function tone(file) {
  const glb = readGlb(file);
  const [cu, cr] = opt.cell;
  const prims = [];
  const all = [];
  for (const prim of editablePrimitives(glb.json)) {
    if (prim.attributes.TEXCOORD_0 === undefined) continue;
    const m = primitiveMatrix(glb.json, prim);
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv = Float32Array.from(readAccessor(glb, prim.attributes.TEXCOORD_0).data);
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const world = [];
    for (let v = 0; v < pos.length / 3; v++) world.push(apply(m, [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]));
    const inCell = (v) => Math.floor(uv[v * 2] * 16) === cu && Math.floor(uv[v * 2 + 1] * 4) === cr;
    const s = { prim, uv, idx, world, tris: [] };
    for (let t = 0; t < idx.length; t += 3) {
      if (![0, 1, 2].every((k) => inCell(idx[t + k]))) continue;
      const [a, b, c] = [0, 1, 2].map((k) => world[idx[t + k]]);
      const u = [0, 1, 2].map((k) => b[k] - a[k]);
      const w = [0, 1, 2].map((k) => c[k] - a[k]);
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const len = Math.hypot(...n);
      if (len < 1e-12) continue;
      const [la, lb, lc] = [0, 1, 2].map((k) => [0, 1, 2].map((d) => pos[idx[t + k] * 3 + d]));
      const lu = [0, 1, 2].map((d) => lb[d] - la[d]);
      const lw = [0, 1, 2].map((d) => lc[d] - la[d]);
      const ln = [lu[1] * lw[2] - lu[2] * lw[1], lu[2] * lw[0] - lu[0] * lw[2], lu[0] * lw[1] - lu[1] * lw[0]];
      const ll = Math.hypot(...ln) || 1;
      const tri = { s, t, n: n.map((x) => x / len), ln: ln.map((x) => x / ll), p: [a, b, c], area: len / 2 };
      tri.ys = tri.p.map((q) => q[1]);
      tri.old = [0, 1, 2].map((k) => uv[idx[t + k] * 2 + 1] * 4 - cr);
      s.tris.push(tri);
      all.push(tri);
    }
    prims.push(s);
  }
  if (!all.length) { console.log(`${file}: no stone in cell ${opt.cell}`); return; }

  let lo = Infinity;
  let hi = -Infinity;
  for (const tri of all) for (const y of tri.ys) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
  const tol = (hi - lo) * 0.01 + 1e-6;
  const { weld } = welder(all.flatMap((tri) => tri.p.flat()));
  all.forEach((tri, i) => { tri.i = i; });
  const id = (tri, k) => weld(tri.i * 3 + k);

  const ups = all.filter((tri) => tri.n[1] > 0.85);
  const parent = ups.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const byPoint = new Map();
  ups.forEach((tri, i) => {
    const y = tri.ys.reduce((a, b) => a + b) / 3;
    tri.y = y;
    for (let k = 0; k < 3; k++) {
      const key = id(tri, k);
      for (const j of byPoint.get(key) ?? []) if (Math.abs(ups[j].y - y) < tol) parent[find(i)] = find(j);
      byPoint.set(key, [...(byPoint.get(key) ?? []), i]);
    }
  });
  const groups = new Map();
  ups.forEach((tri, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, { tris: [], y: 0, area: 0, box: [Infinity, Infinity, -Infinity, -Infinity] });
    const g = groups.get(r);
    g.tris.push(tri);
    g.y += tri.y * tri.area;
    g.area += tri.area;
    for (const q of tri.p) { g.box[0] = Math.min(g.box[0], q[0]); g.box[1] = Math.min(g.box[1], q[2]); g.box[2] = Math.max(g.box[2], q[0]); g.box[3] = Math.max(g.box[3], q[2]); }
  });
  const steps = [...groups.values()];
  for (const g of steps) g.y /= g.area;
  const levels = [...new Set(steps.map((g) => Math.round(g.y / tol)))].map((k) => k * tol).sort((a, b) => a - b);
  const below = (y) => levels.filter((l) => l < y - tol * 1.5).pop() ?? lo;

  const mid = (g) => [(g.box[0] + g.box[2]) / 2, (g.box[1] + g.box[3]) / 2];
  const reach = (hi - lo) * 0.05;
  const touch = (a, b) => a.box[0] < b.box[2] + reach && b.box[0] < a.box[2] + reach && a.box[1] < b.box[3] + reach && b.box[1] < a.box[3] + reach;
  for (const g of steps) {
    const dirs = [];
    for (const h of steps) {
      if (h === g || !touch(g, h)) continue;
      const sign = Math.abs(h.y - below(g.y)) < tol * 1.5 ? 1 : Math.abs(g.y - below(h.y)) < tol * 1.5 ? -1 : 0;
      if (!sign) continue;
      const [a, b] = [mid(g), mid(h)];
      const d = [(b[0] - a[0]) * sign, (b[1] - a[1]) * sign];
      const l = Math.hypot(...d);
      if (l > tol) dirs.push(d.map((x) => x / l));
    }
    g.dirs = dirs;
  }
  const faces = (g, n) => {
    const l = Math.hypot(n[0], n[2]);
    if (l < 1e-6) return false;
    return steps.length === 1 || g.dirs.some((d) => (d[0] * n[0] + d[1] * n[2]) / l > 0.5);
  };
  for (const tri of all) {
    if (tri.n[1] > 0.85 || tri.n[1] < -0.3) continue;
    const top = Math.max(...tri.ys);
    const bottom = Math.min(...tri.ys);
    const hits = steps.filter((g) => {
      const rise = g.y - below(g.y);
      const pad = Math.max(tol, rise * 0.35);
      return top < g.y + tol * 1.5 && top > g.y - pad
        && faces(g, tri.n)
        && bottom > below(g.y) - tol * 1.5
        && tri.p.filter((q) => q[1] > top - tol).every((q) => q[0] > g.box[0] - pad && q[0] < g.box[2] + pad && q[2] > g.box[1] - pad && q[2] < g.box[3] + pad);
    });
    if (!hits.length) continue;
    const g = hits.reduce((a, b) => (b.area > a.area ? b : a));
    tri.step = g;
    tri.side = true;
  }
  for (const g of steps) for (const tri of g.tris) tri.step = g;

  const rand = rng(basename(file));
  let deck = [];
  const sorted = steps.sort((a, b) => a.y - b.y || a.box[0] - b.box[0] || a.box[1] - b.box[1]);
  for (const g of sorted) {
    if (!deck.length) {
      deck = [...Array(opt.levels).keys()];
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    }
    g.v = opt.top + deck.pop() * opt.gap;
  }

  const replaced = new Map();
  let toned = 0;
  let added = 0;
  for (const s of prims) {
    const mine = s.tris;
    if (!mine.length) continue;
    const adder = vertexAdder(glb, s.prim);
    const owner = new Map();
    const vOf = (tri) => Math.max(0.02, Math.min(0.98, tri.step ? tri.step.v + (tri.side ? opt.riser : 0) : tri.n[1] < -0.3 ? opt.under : opt.wall));
    const set = new Set(mine.map((tri) => tri.t));
    for (let t = 0; t < s.idx.length; t += 3) if (!set.has(t)) for (let k = 0; k < 3; k++) owner.set(s.idx[t + k], null);
    const made = new Map();
    const value = new Map();
    for (const tri of mine) {
      const v = vOf(tri);
      const key = `${v.toFixed(4)}|${tri.ln.map((x) => x.toFixed(3))}`;
      for (let k = 0; k < 3; k++) {
        const i = s.idx[tri.t + k];
        if (!owner.has(i)) owner.set(i, key);
        if (owner.get(i) !== key) {
          let j = made.get(`${i}|${key}`);
          if (j === undefined) { j = adder.add(i); made.set(`${i}|${key}`, j); added++; }
          s.idx[tri.t + k] = j;
          value.set(j, { from: i, v, n: tri.ln });
        } else value.set(i, { from: i, v, n: tri.ln });
      }
      toned++;
    }
    const hasN = s.prim.attributes.NORMAL !== undefined;
    const nrm = new Float32Array((s.uv.length / 2 + made.size) * 3);
    if (hasN) nrm.set(Float32Array.from(readAccessor(glb, s.prim.attributes.NORMAL).data));
    for (const [i, { n }] of value) nrm.set(n, i * 3);
    const count = s.uv.length / 2 + made.size;
    const uv = new Float32Array(count * 2);
    uv.set(s.uv);
    for (const [i, { from, v }] of value) {
      uv[i * 2] = s.uv[from * 2];
      uv[i * 2 + 1] = (cr + v) / 4;
    }
    adder.commit(s.idx, replaced);
    replaced.set(s.prim.attributes.TEXCOORD_0, Buffer.from(uv.buffer));
    if (hasN) replaced.set(s.prim.attributes.NORMAL, Buffer.from(nrm.buffer));
  }
  if (process.env.DBG) for (const tri of all) if (tri.side) console.log('side', tri.n.map((x) => x.toFixed(2)).join(','), tri.ys.map((x) => x.toFixed(3)).join(','), 'step y', tri.step.y.toFixed(3), tri.area.toFixed(4));
  console.log(`${file}: ${steps.length} steps, ${toned}/${all.length} tris toned, ${added} points doubled`);
  if (opt.dry) return;
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
}

for (const f of files) tone(f);
