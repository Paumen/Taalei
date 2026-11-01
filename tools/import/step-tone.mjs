import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix, vertexAdder } from './mesh-edit.mjs';

const HELP = `step-tone.mjs [options] <workfile.glb> [...]

Gives each step of a stone staircase its own flat tone, in one band (default
taupe, cell 14,3). A step is a tread (a flat face looking up) at one height,
with its risers: side faces whose top edge meets that tread and that are no
taller than --tall rises. Steps draw --tones tones, --gap v apart from --top
on, dealt at random (seeded by the file name) in rounds so each is used about
equally. A step's risers sit --side darker than its tread. Other stone keeps
one look: faces looking up --body, sides --body + --side, undersides --under.
Within one flat face, a patch whose old shade stood --mark or more from the
rest of the face, taken against the face's own trend by height, keeps a clear
--chip step from its new tone, unless such patches cover over --share of it. Every face is
flat; where two faces share a point, the point is doubled.

  --cell <c,r>     14,3
  --tones <n>      5
  --gap <f>        0.07
  --top <f>        0.14
  --side <f>       0.24
  --body <f>       0.30
  --under <f>      0.88
  --tall <f>       1.5
  --mark <f>       0.12   against the face's own light-to-dark trend by height
  --share <f>      0.35   most of a face chips may cover; past it none count
  --chip <f>       0.16
  --dry`;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(0); }
const opt = { cell: [14, 3], tones: 5, gap: 0.07, top: 0.14, side: 0.24, body: 0.30, under: 0.88, tall: 1.5, mark: 0.12, chip: 0.16, share: 0.35, dry: false };
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dry') opt.dry = true;
  else if (a === '--cell') opt.cell = args[++i].split(',').map(Number);
  else if (a.startsWith('--')) opt[a.slice(2)] = Number(args[++i]);
  else files.push(a);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const apply = (m, p) => [0, 1, 2].map((k) => m[k] * p[0] + m[4 + k] * p[1] + m[8 + k] * p[2] + m[12 + k]);
const facing = (n) => (n[1] > 0.7 ? 'up' : n[1] < -0.5 ? 'down' : 'side');

function rng(seed) {
  let h = 1779033703;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353), h = (h << 13) | (h >>> 19);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function union(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  return { find, join: (a, b) => { parent[find(a)] = find(b); } };
}

function tone(file) {
  const glb = readGlb(file);
  const [cu, cr] = opt.cell;
  const inCell = (u, v) => u >= cu / 16 && u <= (cu + 1) / 16 && v >= cr / 4 && v <= (cr + 1) / 4;
  const stone = [];
  const tris = [];
  for (const prim of editablePrimitives(glb.json)) {
    if (prim.attributes.TEXCOORD_0 === undefined || prim.targets) continue;
    if (glb.json.accessors[prim.attributes.TEXCOORD_0].componentType !== 5126) continue;
    const m = primitiveMatrix(glb.json, prim);
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const world = [];
    for (let i = 0; i < pos.length / 3; i++) world.push(apply(m, [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]));
    const s = { prim, world, uv: Float32Array.from(uv), idx, tris: [] };
    for (let t = 0; t < idx.length; t += 3) {
      const ids = [idx[t], idx[t + 1], idx[t + 2]];
      const u = ids.reduce((x, i) => x + uv[i * 2], 0) / 3;
      const v = ids.reduce((x, i) => x + uv[i * 2 + 1], 0) / 3;
      if (!inCell(u, v)) continue;
      const [a, b, c] = ids.map((i) => world[i]);
      const n = cross(sub(b, a), sub(c, a));
      const l = Math.hypot(...n);
      if (!l) continue;
      const tri = { s, t, ids, pts: [a, b, c], normal: n.map((x) => x / l), area: l / 2, was: v * 4 - cr };
      s.tris.push(tri);
      tris.push(tri);
    }
    if (s.tris.length) stone.push(s);
  }
  if (!tris.length) { console.log(`${file}: no stone in cell ${opt.cell}`); return; }

  let size = 0;
  const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
  for (const tri of tris) for (const p of tri.pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  size = Math.max(...sub(hi, lo));
  const q = size * 1e-4;
  const key = (p) => p.map((x) => Math.round(x / q)).join(',');

  const planes = union(tris.length);
  const byPoint = new Map();
  tris.forEach((tri, i) => { for (const p of tri.pts) { const k = key(p); if (!byPoint.has(k)) byPoint.set(k, []); byPoint.get(k).push(i); } });
  for (const list of byPoint.values()) for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
    if (dot(tris[list[a]].normal, tris[list[b]].normal) > 0.97) planes.join(list[a], list[b]);
  }
  const faces = [];
  {
    const groups = new Map();
    tris.forEach((tri, i) => { const r = planes.find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(tri); });
    for (const list of groups.values()) {
      const area = list.reduce((x, t) => x + t.area, 0);
      const ys = list.map((t) => (t.pts[0][1] + t.pts[1][1] + t.pts[2][1]) / 3);
      let sw = 0; let sy = 0; let sv = 0;
      list.forEach((t, i) => { sw += t.area; sy += t.area * ys[i]; sv += t.area * t.was; });
      const my = sy / sw; const mv = sv / sw;
      let sxy = 0; let sxx = 0;
      list.forEach((t, i) => { sxy += t.area * (ys[i] - my) * (t.was - mv); sxx += t.area * (ys[i] - my) ** 2; });
      const slope = sxx > 1e-12 ? sxy / sxx : 0;
      const face = { tris: list, area, kind: facing(list[0].normal) };
      let chipArea = 0;
      list.forEach((t, i) => {
        const d = t.was - (mv + slope * (ys[i] - my));
        t.face = face;
        t.chip = Math.abs(d) >= opt.mark ? Math.sign(d) : 0;
        if (t.chip) chipArea += t.area;
      });
      if (chipArea > opt.share * area) for (const t of list) t.chip = 0;
      const pts = list.flatMap((t) => t.pts);
      face.y0 = Math.min(...pts.map((p) => p[1]));
      face.y1 = Math.max(...pts.map((p) => p[1]));
      face.keys = new Set(pts.map(key));
      faces.push(face);
    }
  }

  const treads = faces.filter((f) => f.kind === 'up');
  const levels = [...new Set(treads.map((f) => Math.round(f.y1 / (size * 0.01))))].sort((a, b) => a - b).map((x) => x * size * 0.01);
  const rises = levels.slice(1).map((y, i) => y - levels[i]).filter((d) => d > size * 0.02);
  const rise = rises.length ? rises.sort((a, b) => a - b)[Math.floor(rises.length / 2)] : size;
  const steps = levels.map((y) => ({ y, faces: [] }));
  const stepAt = (y) => steps.reduce((best, s) => (Math.abs(s.y - y) < Math.abs(best.y - y) ? s : best));
  for (const f of treads) { const s = stepAt(f.y1); f.step = s; s.faces.push(f); }
  for (const f of faces) {
    if (f.kind !== 'side' || f.y1 - f.y0 > opt.tall * rise) continue;
    const top = treads.find((t) => Math.abs(t.y1 - f.y1) < q * 10 && [...f.keys].some((k) => t.keys.has(k)));
    if (top) { f.step = top.step; top.step.faces.push(f); }
  }
  const used = steps.filter((s) => s.faces.length);
  const rand = rng(basename(file));
  const deal = [];
  while (deal.length < used.length) {
    const round = Array.from({ length: opt.tones }, (_, i) => i);
    for (let i = round.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [round[i], round[j]] = [round[j], round[i]]; }
    deal.push(...round);
  }
  used.forEach((s, i) => { s.v = opt.top + deal[i] * opt.gap; });

  for (const f of faces) {
    const base = f.step ? f.step.v : opt.body;
    f.v = f.kind === 'down' ? opt.under : f.kind === 'up' ? base : base + opt.side;
  }

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
      const slot = `${faces.indexOf(tri.face)}:${tri.chip}`;
      if (!owner.has(i)) owner.set(i, slot);
      if (owner.get(i) === slot) continue;
      const k2 = `${i}:${slot}`;
      let j = made.get(k2);
      if (j === undefined) { j = adder.add(i); made.set(k2, j); copies.push(j); added++; }
      s.idx[tri.t + k] = j;
    }
    const uv = new Float32Array((s.world.length + copies.length) * 2);
    uv.set(s.uv);
    for (const tri of s.tris) for (let k = 0; k < 3; k++) {
      const i = s.idx[tri.t + k];
      const v = Math.max(0.02, Math.min(0.98, tri.face.v + tri.chip * opt.chip));
      uv[i * 2] = (cu + 0.5) / 16;
      uv[i * 2 + 1] = (cr + v) / 4;
    }
    adder.commit(s.idx, replaced);
    replaced.set(s.prim.attributes.TEXCOORD_0, Buffer.from(uv.buffer));
  }
  const chips = tris.filter((t) => t.chip).length;
  console.log(`${file}: ${tris.length} stone tris, ${faces.length} faces, ${used.length} steps (rise ${rise.toFixed(3)}), ${chips} chip tris, ${added} points doubled`);
  if (opt.dry) return;
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
}

for (const f of files) tone(f);
