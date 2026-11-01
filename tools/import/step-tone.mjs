import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix, vertexAdder } from './mesh-edit.mjs';

const HELP = `step-tone.mjs [options] <workfile.glb> [...]

Gives each step of a stone staircase its own flat tone, in one band (default
taupe, cell 14,3). A step is a tread (a flat face looking up) at one height,
with its risers: side faces whose top edge meets that tread and that are no
taller than --tall rises. Steps draw --tones tones, --gap v apart from --top
on, dealt at random (seeded by the file name): each tone used about equally,
two steps in a row at least --near shades apart and never the full span. Every face looking sideways, risers and walls alike, sits at --side,
always darker than the darkest tread; other faces looking up at --body,
undersides at --under.
Detail stays: a face whose old shade stood --mark or more from the model's
trend for its facing by height keeps that offset (up to 0.3), and within a face
the corners' shades split in up to three levels --level or more apart keep
the smaller levels as a pattern at their own offset, at least --chip: a
triangle joins a level only with all three corners, and only when the level
holds --least of the face and the face is not graded by --mark or more.
Every face and patch is flat; where two differ at a point, the point is doubled.

  --cell <c,r>     14,3
  --tones <n>      5
  --gap <f>        0.07
  --top <f>        0.10
  --near <n>       2      least shades between two steps in a row
  --side <f>       0.56
  --body <f>       0.26
  --lip <f>        0.35   treads closer than this share of a rise are one step
  --under <f>      0.88
  --tall <f>       1.5
  --mark <f>       0.12   against the face's own light-to-dark trend by height
  --level <f>      0.08   least gap between two shade levels of a pattern
  --least <f>      0.03   least share of a face its pattern level must hold
  --chip <f>       0.2
  --dry`;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(0); }
const opt = { cell: [14, 3], tones: 5, gap: 0.07, top: 0.10, near: 2, side: 0.56, body: 0.26, under: 0.88, lip: 0.35, tall: 1.5, mark: 0.12, chip: 0.2, least: 0.03, level: 0.08, dry: false };
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
      const vs = ids.map((i) => uv[i * 2 + 1] * 4 - cr);
      const tri = { s, t, ids, pts: [a, b, c], normal: n.map((x) => x / l), area: l / 2, was: v * 4 - cr, vs, spread: Math.max(...vs) - Math.min(...vs) };
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
  const floorSide = opt.top + (opt.tones - 1) * opt.gap;
  const faces = [];
  const fit = (list, ys, ws, w) => {
    let sw = 0; let sy = 0; let sv = 0;
    list.forEach((_, i) => { sw += w[i]; sy += w[i] * ys[i]; sv += w[i] * ws[i]; });
    if (!sw) return () => 0;
    const my = sy / sw; const mv = sv / sw;
    let sxy = 0; let sxx = 0;
    list.forEach((_, i) => { sxy += w[i] * (ys[i] - my) * (ws[i] - mv); sxx += w[i] * (ys[i] - my) ** 2; });
    const slope = sxx > 1e-12 ? sxy / sxx : 0;
    return (y) => mv + slope * (y - my);
  };
  {
    const groups = new Map();
    tris.forEach((tri, i) => { const r = planes.find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(tri); });
    for (const list of groups.values()) {
      const ys = list.map((t) => (t.pts[0][1] + t.pts[1][1] + t.pts[2][1]) / 3);
      const trend = fit(list, ys, list.map((t) => t.was), list.map((t) => t.area));
      const area = list.reduce((x, t) => x + t.area, 0);
      const face = { tris: list, area, kind: facing(list[0].normal), patches: [] };
      list.forEach((t, i) => { t.face = face; t.d = t.was - trend(ys[i]); t.vd = t.pts.map((p, k) => t.vs[k] - trend(p[1])); t.patch = null; });
      const split = (pool) => {
        const vs = pool.flatMap((t) => t.vd.map((d) => ({ d, w: t.area / 3 }))).sort((x, y) => x.d - y.d);
        const total = vs.reduce((x, v) => x + v.w, 0);
        const sum = vs.reduce((x, v) => x + v.d * v.w, 0);
        let best = null;
        let la = 0; let ld = 0;
        for (let i = 0; i < vs.length - 1; i++) {
          la += vs[i].w; ld += vs[i].d * vs[i].w;
          const ha = total - la; const hd = sum - ld;
          const gap = hd / ha - ld / la;
          const score = la * ha * gap * gap;
          if (!best || score > best.score) best = { score, at: (vs[i].d + vs[i + 1].d) / 2, gap, la, ha, lo: ld / la, hi: hd / ha };
        }
        if (!best || best.gap < opt.level) return null;
        const low = best.la <= best.ha;
        const minor = pool.filter((t) => t.vd.every((d) => (d < best.at) === low));
        const ma = minor.reduce((x, t) => x + t.area, 0);
        if (ma < opt.least * area) return null;
        return { minor, major: pool.filter((t) => !minor.includes(t)), off: low ? best.lo - best.hi : best.hi - best.lo };
      };
      const smudge = list.reduce((x, t) => x + t.spread * t.area, 0) / area;
      let pool = list;
      for (let level = 0; level < 2 && smudge < opt.mark; level++) {
        const cut = split(pool);
        if (!cut) break;
        const patch = { id: face.patches.length, offset: Math.sign(cut.off) * Math.min(0.35, Math.max(opt.chip, Math.abs(cut.off))) };
        if (face.kind === 'side' && patch.offset < 0 && opt.side + patch.offset < floorSide) patch.offset = floorSide - opt.side;
        face.patches.push(patch);
        for (const t of cut.minor) t.patch = patch;
        pool = cut.major;
      }
      const pts = list.flatMap((t) => t.pts);
      face.y0 = Math.min(...pts.map((p) => p[1]));
      face.y1 = Math.max(...pts.map((p) => p[1]));
      face.yc = list.reduce((x, t, i) => x + ys[i] * t.area, 0) / area;
      face.was = list.reduce((x, t) => x + t.was * t.area, 0) / area;
      face.keys = new Set(pts.map(key));
      faces.push(face);
    }
  }
  for (const kind of ['up', 'side', 'down']) {
    const list = faces.filter((f) => f.kind === kind);
    const trend = fit(list, list.map((f) => f.yc), list.map((f) => f.was), list.map((f) => f.area));
    for (const f of list) { const d = f.was - trend(f.yc); f.offset = Math.abs(d) >= opt.mark ? Math.max(-0.3, Math.min(0.3, d)) : 0; }
  }

  if (process.env.DBG) for (const f of faces) console.log('face', faces.indexOf(f), f.kind, 'n', f.tris[0].normal.map((x) => x.toFixed(2)).join(','), 'area', f.area.toFixed(4), 'y', f.y0.toFixed(3), f.y1.toFixed(3), 'was', f.was.toFixed(2), 'patches', f.patches.map((p) => p.offset.toFixed(2)).join('/'), 'smudge', (f.tris.reduce((x, t) => x + t.spread * t.area, 0) / f.area).toFixed(2), 'tris', f.tris.map((t) => t.was.toFixed(2) + '/' + t.spread.toFixed(2) + (t.patch ? '*' : '')).join(' '));
  const treads = faces.filter((f) => f.kind === 'up');
  const cluster = (tol) => {
    const out = [];
    for (const y of treads.map((f) => f.y1).sort((a, b) => a - b)) if (!out.length || y - out[out.length - 1] > tol) out.push(y);
    return out;
  };
  const fine = cluster(size * 0.002);
  const gaps = fine.slice(1).map((y, i) => y - fine[i]).sort((a, b) => a - b);
  const rise = gaps.length ? gaps[Math.floor(gaps.length / 2)] : size;
  const levels = cluster(rise * opt.lip);
  const steps = levels.map((y) => ({ y, faces: [] }));
  const stepAt = (y) => steps.reduce((best, s) => (s.y <= y + 1e-9 ? s : best), steps[0]);
  for (const f of treads) { const s = stepAt(f.y1); f.step = s; s.faces.push(f); }
  for (const f of faces) {
    if (f.kind !== 'side' || f.y1 - f.y0 > opt.tall * rise) continue;
    const top = treads.find((t) => Math.abs(t.y1 - f.y1) < q * 10 && [...f.keys].some((k) => t.keys.has(k)));
    if (top) { f.step = top.step; top.step.faces.push(f); }
  }
  const used = steps.filter((s) => s.faces.length);
  const rand = rng(basename(file));
  const deal = [];
  const count = Array(opt.tones).fill(0);
  while (deal.length < used.length) {
    const last = deal[deal.length - 1];
    const ok = count.map((_, i) => i).filter((i) => last === undefined || (Math.abs(i - last) >= opt.near && Math.abs(i - last) < opt.tones - 1));
    const least = Math.min(...ok.map((i) => count[i]));
    const pick = ok.filter((i) => count[i] === least);
    const i = pick[Math.floor(rand() * pick.length)];
    deal.push(i); count[i]++;
  }
  used.forEach((s, i) => { s.v = opt.top + deal[i] * opt.gap; });

  const floor = floorSide;
  for (const f of faces) {
    if (f.kind === 'up') f.v = (f.step ? f.step.v : opt.body) + f.offset;
    else if (f.kind === 'down') f.v = opt.under + f.offset;
    else f.v = Math.max(floor, opt.side + f.offset);
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
      const slot = `${faces.indexOf(tri.face)}:${tri.patch?.id ?? -1}`;
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
      const v = Math.max(0.02, Math.min(0.98, tri.face.v + (tri.patch?.offset ?? 0)));
      uv[i * 2] = (cu + 0.5) / 16;
      uv[i * 2 + 1] = (cr + v) / 4;
    }
    adder.commit(s.idx, replaced);
    replaced.set(s.prim.attributes.TEXCOORD_0, Buffer.from(uv.buffer));
  }
  const chips = faces.reduce((x, f) => x + f.patches.length, 0);
  const kept = faces.filter((f) => f.offset).length;
  console.log(`${file}: ${tris.length} stone tris, ${faces.length} faces, ${used.length} steps (rise ${rise.toFixed(3)}), ${chips} patches, ${kept} faces off trend, ${added} points doubled`);
  if (opt.dry) return;
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
}

for (const f of files) tone(f);
