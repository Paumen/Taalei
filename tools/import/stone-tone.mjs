import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix, vertexAdder, buildTree, hitBox, hitTriangle } from './mesh-edit.mjs';

const HELP = `stone-tone.mjs [options] <workfile.glb> [...]

Tones the stone of one band (default taupe, cell 14,3) from flat.
Faces looking up sit in --top, sides in --side, faces looking down in --under,
each lighter the higher the stone sits in the model. Each flat face keeps its
own tone: where two faces share a point, the point is doubled.
Recess: from each face, rays go out over its half of the sky; the share that
hits the model within --reach of the model's size is how closed in it is.
From --open on, the face moves toward --deep, fully at --shut.
Parts: separate pieces of the stone mesh with at least --big of the stone's
surface. Each part's original tone is taken against the model's own trend of
tone by facing and height. Two parts whose tones differ by --mark or more keep
a difference: the one that was lighter stays lighter by at least --apart, by
moving the smaller part as a whole.

  --cell <c,r>     14,3
  --top <a,b>      0.05,0.25
  --side <a,b>     0.25,0.75
  --under <a,b>    0.75,0.95
  --deep <a,b>     0.75,0.95
  --reach <f>      0.2
  --open <f>       0.35
  --shut <f>       0.75
  --big <f>        0.05
  --mark <f>       0.02   OKLCH lightness
  --apart <f>      0.03   OKLCH lightness
  --dry`;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(0); }
const opt = {
  cell: [14, 3], top: [0.05, 0.25], side: [0.25, 0.75], under: [0.75, 0.95], deep: [0.75, 0.95],
  reach: [0.2], open: [0.35], shut: [0.75], big: [0.05], mark: [0.02], apart: [0.03], dry: false,
};
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dry') opt.dry = true;
  else if (a.startsWith('--')) opt[a.slice(2)] = args[++i].split(',').map(Number);
  else files.push(a);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const apply = (m, p) => [0, 1, 2].map((k) => m[k] * p[0] + m[4 + k] * p[1] + m[8 + k] * p[2] + m[12 + k]);
const clamp = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;

const SKY = (() => {
  const out = [];
  const n = 64;
  const g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt((i + 0.5) / n);
    out.push([Math.cos(g * i) * r, Math.sin(g * i) * r, Math.sqrt(1 - r * r)]);
  }
  return out;
})();

function frame(n) {
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const t = unit(cross(n, a));
  return [t, cross(n, t)];
}

function facing(n) {
  if (n[1] > 0.7) return 0;
  if (n[1] < -0.5) return 2;
  return 1;
}

function nearest(tree, tris, o, d, far) {
  const inv = d.map((x) => 1 / x);
  const stack = [tree.root];
  let best = far;
  while (stack.length) {
    const node = stack.pop();
    if (!hitBox(node.b, o, inv, best)) continue;
    if (node.left) { stack.push(node.left, node.right); continue; }
    for (let i = node.start; i < node.end; i++) {
      const at = hitTriangle(o, d, tris[tree.order[i]]);
      if (at > 0 && at < best) best = at;
    }
  }
  return best < far ? best : null;
}

const TAUPE_L = [0.70, 0.68, 0.65, 0.62, 0.59, 0.57, 0.54, 0.52, 0.49, 0.47, 0.44];
const lightness = (v) => {
  const x = Math.max(0, Math.min(1, v)) * 10;
  const i = Math.min(9, Math.floor(x));
  return lerp(TAUPE_L[i], TAUPE_L[i + 1], x - i);
};

function tone(file) {
  const glb = readGlb(file);
  const [cu, cr] = opt.cell;
  const inCell = (u, v) => u >= cu / 16 && u <= (cu + 1) / 16 && v >= cr / 4 && v <= (cr + 1) / 4;
  const all = [];
  for (const mesh of glb.json.meshes ?? []) for (const prim of mesh.primitives ?? []) {
    if (prim.indices === undefined || (prim.mode ?? 4) !== 4) continue;
    const m = primitiveMatrix(glb.json, prim);
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const idx = readAccessor(glb, prim.indices).data;
    for (let t = 0; t < idx.length; t += 3) {
      all.push([0, 1, 2].map((k) => apply(m, [pos[idx[t + k] * 3], pos[idx[t + k] * 3 + 1], pos[idx[t + k] * 3 + 2]])));
    }
  }
  const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
  for (const tri of all) for (const p of tri) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const size = Math.max(...sub(hi, lo));
  const tree = buildTree(all);

  const stone = [];
  for (const prim of editablePrimitives(glb.json)) {
    if (prim.attributes.TEXCOORD_0 === undefined || prim.targets) continue;
    if (glb.json.accessors[prim.attributes.TEXCOORD_0].componentType !== 5126) continue;
    const m = primitiveMatrix(glb.json, prim);
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const world = [];
    for (let i = 0; i < pos.length / 3; i++) world.push(apply(m, [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]));
    const tris = [];
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      const u = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3;
      const v = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3;
      if (!inCell(u, v)) continue;
      const n = cross(sub(world[b], world[a]), sub(world[c], world[a]));
      const l = Math.hypot(...n);
      if (!l) continue;
      const normal = n.map((x) => x / l);
      tris.push({ t, normal, area: l / 2, kind: facing(normal) });
    }
    if (tris.length) stone.push({ prim, world, uv: Float32Array.from(uv), idx, tris });
  }
  if (!stone.length) { console.log(`${file}: no stone in cell ${opt.cell}`); return; }

  let y0 = Infinity; let y1 = -Infinity;
  for (const s of stone) for (const { t } of s.tris) for (let k = 0; k < 3; k++) {
    const y = s.world[s.idx[t + k]][1];
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const low = (y) => (y1 > y0 ? (y1 - y) / (y1 - y0) : 0.5);
  const ranges = [opt.top, opt.side, opt.under];

  const faces = [];
  for (const s of stone) {
    const parent = s.tris.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const byPoint = new Map();
    s.tris.forEach((tri, i) => { for (let k = 0; k < 3; k++) { const p = s.idx[tri.t + k]; if (!byPoint.has(p)) byPoint.set(p, []); byPoint.get(p).push(i); } });
    for (const list of byPoint.values()) for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const p = s.tris[list[a]]; const q = s.tris[list[b]];
      if (p.kind === q.kind && dot(p.normal, q.normal) > 0.97) parent[find(list[a])] = find(list[b]);
    }
    const groups = new Map();
    s.tris.forEach((tri, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(tri); });
    for (const list of groups.values()) {
      const face = { id: faces.length, s, tris: list, kind: list[0].kind };
      for (const tri of list) tri.face = face;
      faces.push(face);
    }
  }

  const far = opt.reach[0] * size;
  const eps = size * 1e-4;
  for (const face of faces) {
    const { s } = face;
    const big = [...face.tris].sort((a, b) => b.area - a.area).slice(0, 12);
    let hit = 0; let n = 0;
    for (const tri of big) {
      const [a, b, c] = [0, 1, 2].map((k) => s.world[s.idx[tri.t + k]]);
      const o0 = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3);
      const o = add(o0, tri.normal, eps);
      const [t1, t2] = frame(tri.normal);
      for (const [x, y, z] of SKY) {
        const d = unit(add(add(tri.normal.map((w) => w * z), t1, x), t2, y));
        if (nearest(tree, all, o, d, far) !== null) hit++;
        n++;
      }
    }
    face.closed = n ? hit / n : 0;
    face.dark = clamp((face.closed - opt.open[0]) / (opt.shut[0] - opt.open[0]));
  }

  for (const face of faces) {
    const pts = face.tris.flatMap((tri) => [0, 1, 2].map((k) => face.s.idx[tri.t + k]));
    const ps = pts.map((i) => face.s.world[i]);
    face.lo = [0, 1, 2].map((k) => Math.min(...ps.map((p) => p[k])));
    face.hi = [0, 1, 2].map((k) => Math.max(...ps.map((p) => p[k])));
    face.c = face.lo.map((x, k) => (x + face.hi[k]) / 2);
    face.n = unit(face.tris.reduce((a, t) => add(a, t.normal, t.area), [0, 0, 0]));
    face.area = face.tris.reduce((a, t) => a + t.area, 0);
    face.span = Math.max(...face.hi.map((x, k) => x - face.lo[k]));
    const ys = ps.map((p) => p[1]);
    const ws = pts.map((i) => face.s.uv[i * 2 + 1] * 4 - cr);
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const mw = ws.reduce((a, b) => a + b, 0) / ws.length;
    let sxy = 0; let sxx = 0;
    ys.forEach((y, k) => { sxy += (y - my) * (ws[k] - mw); sxx += (y - my) ** 2; });
    const slope = sxx > 1e-12 ? sxy / sxx : 0;
    face.wasAt = (y) => mw + slope * (y - my);
    const [a, b] = ranges[face.kind];
    face.nowAt = (y) => { const h = low(y); return lerp(lerp(a, b, h), lerp(opt.deep[0], opt.deep[1], h), face.dark); };
  }

  const parts = [];
  {
    const q = size * 1e-4;
    const parent = faces.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const byPoint = new Map();
    faces.forEach((f, fi) => { for (const tri of f.tris) for (let k = 0; k < 3; k++) {
      const key = f.s.world[f.s.idx[tri.t + k]].map((x) => Math.round(x / q)).join(',');
      if (byPoint.has(key)) parent[find(fi)] = find(byPoint.get(key)); else byPoint.set(key, fi);
    } });
    const groups = new Map();
    faces.forEach((f, fi) => { const r = find(fi); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); });
    for (const list of groups.values()) {
      const part = { id: parts.length, faces: list, area: list.reduce((x, f) => x + f.area, 0), shift: 0 };
      for (const f of list) f.part = part;
      parts.push(part);
    }
  }
  const samples = [];
  for (const f of faces) for (const tri of f.tris) {
    const ids = [0, 1, 2].map((k) => f.s.idx[tri.t + k]);
    const y = ids.reduce((x, i) => x + f.s.world[i][1], 0) / 3;
    const was = ids.reduce((x, i) => x + f.s.uv[i * 2 + 1] * 4 - cr, 0) / 3;
    samples.push({ part: f.part, kind: f.kind, h: low(y), w: tri.area, was: lightness(was), now: lightness(f.nowAt(y)) });
  }
  const trend = (key) => {
    const fit = [0, 1, 2].map((kind) => {
      let n = 0; let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
      for (const p of samples) if (p.kind === kind) { n += p.w; sx += p.w * p.h; sy += p.w * p[key]; sxx += p.w * p.h * p.h; sxy += p.w * p.h * p[key]; }
      if (!n) return () => 0;
      const d = n * sxx - sx * sx;
      const b = Math.abs(d) > 1e-12 ? (n * sxy - sx * sy) / d : 0;
      const c = (sy - b * sx) / n;
      return (h) => c + b * h;
    });
    const res = new Map(parts.map((part) => [part, [0, 0]]));
    for (const p of samples) { const r = res.get(p.part); r[0] += p.w * (p[key] - fit[p.kind](p.h)); r[1] += p.w; }
    return new Map([...res].map(([part, [x, w]]) => [part, w ? x / w : 0]));
  };
  const wasRes = trend('was');
  const nowRes = trend('now');
  const stoneArea = parts.reduce((x, part) => x + part.area, 0);
  const big = parts.filter((part) => part.area >= opt.big[0] * stoneArea);
  const marked = [];
  for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) {
    const d = wasRes.get(big[i]) - wasRes.get(big[j]);
    if (Math.abs(d) >= opt.mark[0]) marked.push({ A: big[i], B: big[j], sign: Math.sign(d) });
  }
  const LV = 0.26;
  const gap = (pr) => ((nowRes.get(pr.A) - pr.A.shift * LV) - (nowRes.get(pr.B) - pr.B.shift * LV)) * pr.sign;
  for (let pass = 0; pass < 30; pass++) {
    let moved = false;
    for (const pr of marked) {
      const short = opt.apart[0] - gap(pr);
      if (short <= 1e-4) continue;
      const dv = short / LV;
      const small = pr.A.area <= pr.B.area ? pr.A : pr.B;
      small.shift += (small === pr.A) === (pr.sign > 0) ? -dv : dv;
      moved = true;
    }
    if (!moved) break;
  }
  const unmet = marked.filter((pr) => gap(pr) < opt.apart[0] - 0.005).length;
  if (process.env.DBG) for (const part of parts) console.log('part', part.id, (part.area / stoneArea).toFixed(3), 'was', wasRes.get(part).toFixed(3), 'now', nowRes.get(part).toFixed(3), 'shift', part.shift.toFixed(3));

  const replaced = new Map();
  let added = 0;
  for (const s of stone) {
    const adder = vertexAdder(glb, s.prim);
    const owner = new Map();
    const stoneT = new Set(s.tris.map((x) => x.t));
    for (let t = 0; t < s.idx.length; t += 3) if (!stoneT.has(t)) for (let k = 0; k < 3; k++) owner.set(s.idx[t + k], null);
    const made = new Map();
    const copies = [];
    for (const tri of s.tris) for (let k = 0; k < 3; k++) {
      const i = s.idx[tri.t + k];
      if (!owner.has(i)) owner.set(i, tri.face);
      if (owner.get(i) === tri.face) continue;
      const key = `${i}:${tri.face.id}`;
      let j = made.get(key);
      if (j === undefined) { j = adder.add(i); made.set(key, j); copies.push({ j, from: i }); added++; }
      s.idx[tri.t + k] = j;
    }
    const base = s.world.length;
    const uv = new Float32Array((base + copies.length) * 2);
    uv.set(s.uv);
    for (const c of copies) s.world[c.j] = s.world[c.from];
    for (const tri of s.tris) for (let k = 0; k < 3; k++) {
      const i = s.idx[tri.t + k];
      const h = low(s.world[i][1]);
      const [a, b] = ranges[tri.face.kind];
      const v = Math.max(0.02, Math.min(0.98, lerp(lerp(a, b, h), lerp(opt.deep[0], opt.deep[1], h), tri.face.dark) + tri.face.part.shift));
      uv[i * 2] = (cu + 0.5) / 16;
      uv[i * 2 + 1] = (cr + v) / 4;
    }
    adder.commit(s.idx, replaced);
    replaced.set(s.prim.attributes.TEXCOORD_0, Buffer.from(uv.buffer));
  }
  const count = stone.reduce((n, s) => n + s.tris.length, 0);
  const darkened = faces.filter((f) => f.dark > 0).length;
  console.log(`${file}: ${count} stone tris, ${faces.length} faces, ${darkened} darkened, ${marked.length} pairs kept apart${unmet ? ` (${unmet} short)` : ''}, ${parts.filter((p) => p.shift).length} parts moved, ${added} points doubled`);
  if (opt.dry) return;
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
}

for (const f of files) tone(f);
