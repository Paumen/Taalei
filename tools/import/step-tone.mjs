import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix, vertexAdder } from './mesh-edit.mjs';

const HELP = `step-tone.mjs [options] <workfile.glb> [...]

Tones a staircase in one band (default taupe, cell 14,3) as stacked slabs, one
per step. A step is a run of joined faces looking up at one height. Every other
face of the band is cut at each step height; a piece between two step heights
belongs to the step at the top of that course, the nearest one when a course
holds several. A step's slab reaches back under every higher step but landings (tops over
2.5 times the median step's area). A face further than a twentieth of the
model's height from every slab is wall: it is not cut and takes --wall as its
tone; with --plain every face but the steps is wall. Each step takes one of --levels tones --gap apart in v from
--top, dealt from a shuffled deck seeded by file name. Its top sits at the
tone, its other faces --side darker, faces looking down --under darker. Every
face is flat-shaded. v runs 0 light to 1 dark.

  --cell <c,r>   14,3
  --levels <n>   5
  --top <f>      0.05
  --gap <f>      0.1
  --wall <f>     0.25
  --side <f>     0.25
  --under <f>    0.4
  --plain
  --dry`;

const opt = { cell: [14, 3], levels: 5, top: 0.05, gap: 0.1, wall: 0.25, side: 0.25, under: 0.4, dry: false, plain: false };
const files = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
  else if (a === '--cell') opt.cell = argv[++i].split(',').map(Number);
  else if (a === '--dry') opt.dry = true;
  else if (a === '--plain') opt.plain = true;
  else if (a.startsWith('--')) opt[a.slice(2)] = Number(argv[++i]);
  else files.push(a);
}
if (!files.length) { console.log(HELP); process.exit(1); }

const apply = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
const lerp = (a, b, t) => a.map((x, k) => x + (b[k] - x) * t);
const normal = (a, b, c) => {
  const u = [0, 1, 2].map((k) => b[k] - a[k]);
  const w = [0, 1, 2].map((k) => c[k] - a[k]);
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const l = Math.hypot(...n);
  return { n: l ? n.map((x) => x / l) : [0, 1, 0], area: l / 2 };
};

function rng(text) {
  let seed = 0;
  for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  seed = seed || 1;
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

function clip(poly, y, keepAbove) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const pin = keepAbove ? p.w[1] >= y : p.w[1] <= y;
    const qin = keepAbove ? q.w[1] >= y : q.w[1] <= y;
    if (pin) out.push(p);
    if (pin !== qin) {
      const t = (y - p.w[1]) / (q.w[1] - p.w[1]);
      out.push({ w: lerp(p.w, q.w, t), l: lerp(p.l, q.l, t), src: p.src, moved: true });
    }
  }
  return out;
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
    const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const local = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const inCell = (v) => Math.floor(uv[v * 2] * 16) === cu && Math.floor(uv[v * 2 + 1] * 4) === cr;
    const s = { prim, keep: [], tris: [] };
    for (let t = 0; t < idx.length; t += 3) {
      const vs = [0, 1, 2].map((k) => idx[t + k]);
      if (!vs.every(inCell)) { s.keep.push(...vs); continue; }
      const c = vs.map((v) => ({ src: v, l: local(v), w: apply(m, local(v)) }));
      const { n, area } = normal(c[0].w, c[1].w, c[2].w);
      if (area < 1e-12) { s.keep.push(...vs); continue; }
      const tri = { c, n, area };
      s.tris.push(tri);
      all.push(tri);
    }
    prims.push(s);
  }
  if (!all.length) { console.log(`${file}: no stone in cell ${opt.cell}`); return; }

  let lo = Infinity;
  let hi = -Infinity;
  for (const tri of all) for (const q of tri.c) { lo = Math.min(lo, q.w[1]); hi = Math.max(hi, q.w[1]); }
  const tol = (hi - lo) * 0.01 + 1e-6;
  const key = (w) => w.map((x) => Math.round(x / (tol * 0.1))).join(',');

  const ups = all.filter((tri) => tri.n[1] > 0.85);
  const parent = ups.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const byPoint = new Map();
  ups.forEach((tri, i) => {
    tri.y = tri.c.reduce((sum, q) => sum + q.w[1], 0) / 3;
    for (const q of tri.c) {
      const k = key(q.w);
      for (const j of byPoint.get(k) ?? []) if (Math.abs(ups[j].y - tri.y) < tol) parent[find(i)] = find(j);
      byPoint.set(k, [...(byPoint.get(k) ?? []), i]);
    }
  });
  const groups = new Map();
  ups.forEach((tri, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, { y: 0, area: 0, box: [Infinity, Infinity, -Infinity, -Infinity] });
    const g = groups.get(r);
    g.y += tri.y * tri.area;
    g.area += tri.area;
    for (const q of tri.c) { g.box[0] = Math.min(g.box[0], q.w[0]); g.box[1] = Math.min(g.box[1], q.w[2]); g.box[2] = Math.max(g.box[2], q.w[0]); g.box[3] = Math.max(g.box[3], q.w[2]); }
    tri.step = g;
  });
  const steps = [...groups.values()];
  for (const g of steps) g.y /= g.area;
  const levels = [];
  for (const y of steps.map((g) => g.y).sort((a, b) => a - b)) if (!levels.length || y - levels[levels.length - 1] > tol * 1.5) levels.push(y);

  const rand = rng(basename(file));
  let deck = [];
  for (const g of steps.sort((a, b) => a.y - b.y || a.box[0] - b.box[0] || a.box[1] - b.box[1])) {
    if (!deck.length) {
      deck = [...Array(opt.levels).keys()];
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    }
    g.v = opt.top + deck.pop() * opt.gap;
  }

  const boxGap = (g, c) => Math.hypot(Math.max(g.box[0] - c[0], 0, c[0] - g.box[2]), Math.max(g.box[1] - c[2], 0, c[2] - g.box[3]));
  const owner = (c) => {
    const level = levels.find((l) => l > c[1] - tol * 0.5) ?? levels[levels.length - 1];
    const at = steps.filter((g) => Math.abs(g.y - level) < tol * 1.5);
    return at.reduce((a, b) => (boxGap(b, c) < boxGap(a, c) ? b : a));
  };

  const reach = (hi - lo) * 0.05;
  const areas = steps.map((g) => g.area).sort((a, b) => a - b);
  for (const g of steps) g.big = g.area > areas[Math.floor(areas.length / 2)] * 2.5;
  for (const g of steps) {
    g.slab = [...g.box];
    for (const h of steps) if (h.y > g.y - tol && (h === g || !h.big)) { g.slab[0] = Math.min(g.slab[0], h.box[0]); g.slab[1] = Math.min(g.slab[1], h.box[1]); g.slab[2] = Math.max(g.slab[2], h.box[2]); g.slab[3] = Math.max(g.slab[3], h.box[3]); }
  }
  let cuts = 0;
  for (const s of prims) {
    const out = [];
    for (const tri of s.tris) {
      if (tri.step) { out.push(tri); continue; }
      const ys = tri.c.map((q) => q.w[1]);
      const tx = tri.c.map((q) => q.w[0]);
      const tz = tri.c.map((q) => q.w[2]);
      const near = !opt.plain && steps.some((g) => !g.big && Math.max(g.slab[0] - Math.max(...tx), Math.min(...tx) - g.slab[2], g.slab[1] - Math.max(...tz), Math.min(...tz) - g.slab[3]) < reach);
      if (!near) { out.push({ ...tri, step: steps[0], wall: true }); continue; }
      const inside = levels.filter((l) => l > Math.min(...ys) + tol * 0.5 && l < Math.max(...ys) - tol * 0.5);
      const bounds = [-Infinity, ...inside, Infinity];
      let pieces = 0;
      for (let i = 0; i + 1 < bounds.length; i++) {
        let poly = tri.c;
        if (bounds[i] > -Infinity) poly = clip(poly, bounds[i], true);
        if (bounds[i + 1] < Infinity) poly = clip(poly, bounds[i + 1], false);
        for (let k = 1; k + 1 < poly.length; k++) {
          const c = [poly[0], poly[k], poly[k + 1]];
          if (normal(c[0].w, c[1].w, c[2].w).area < 1e-14) continue;
          const centre = [0, 1, 2].map((d) => (c[0].w[d] + c[1].w[d] + c[2].w[d]) / 3);
          const g = owner(centre);
          out.push({ ...tri, c, step: g });
          pieces++;
        }
      }
      cuts += pieces - 1;
    }
    s.tris = out;
  }

  const replaced = new Map();
  for (const s of prims) {
    if (!s.tris.length) continue;
    const { prim } = s;
    const base = glb.json.accessors[prim.attributes.POSITION].count;
    const adder = vertexAdder(glb, prim);
    const indices = [...s.keep];
    const used = new Set(s.keep);
    const made = new Map();
    const set = [];
    for (const tri of s.tris) {
      const { n: ln } = normal(tri.c[0].l, tri.c[1].l, tri.c[2].l);
      const v = Math.max(0.02, Math.min(0.98, (tri.wall ? opt.wall : tri.step.v) + (tri.n[1] > 0.85 ? 0 : tri.n[1] < -0.3 ? opt.under : opt.side)));
      const uv = [(cu + 0.5) / 16, (cr + v) / 4];
      for (const q of tri.c) {
        const k = `${key(q.l)}|${v.toFixed(4)}|${ln.map((x) => x.toFixed(3))}`;
        let j = made.get(k);
        if (j === undefined) {
          if (!q.moved && !used.has(q.src)) j = q.src;
          else j = adder.add(q.src, { POSITION: q.l });
          used.add(j);
          made.set(k, j);
          set.push({ j, uv, n: ln });
        }
        indices.push(j);
      }
    }
    adder.commit(indices, replaced);
    const count = glb.json.accessors[prim.attributes.POSITION].count;
    const full = (name, width) => {
      const index = prim.attributes[name];
      if (index === undefined) return null;
      const data = new Float32Array(count * width);
      const buf = replaced.get(index);
      if (buf) data.set(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
      else data.set(Float32Array.from(readAccessor(glb, index).data).subarray(0, base * width));
      return { index, data };
    };
    const uvs = full('TEXCOORD_0', 2);
    const nrm = full('NORMAL', 3);
    for (const { j, uv, n } of set) {
      uvs.data.set(uv, j * 2);
      if (nrm) nrm.data.set(n, j * 3);
    }
    replaced.set(uvs.index, Buffer.from(uvs.data.buffer));
    if (nrm) replaced.set(nrm.index, Buffer.from(nrm.data.buffer));
  }
  console.log(`${file}: ${steps.length} steps, ${levels.length} courses, ${cuts} cuts`);
  if (opt.dry) return;
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
}

for (const f of files) tone(f);
