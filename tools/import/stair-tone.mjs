import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix, sub, dot, cross, buildTree, hitBox, hitTriangle } from './mesh-edit.mjs';

const HELP = `stair-tone.mjs [options] <workfile.glb> [...]

Tones the stone of one band (default taupe, cell 14,3) of a staircase from
flat, as cut stone. Every other band stays as it is. Per face, v within the
band is
  facing base + whole * (height in the model, top -0.5 .. bottom +0.5)
  + step tone + recess + overhang + chip + cap,
kept within 0.02 .. 0.98.

Facing: treads and other flat tops at --top, sloped faces looking up at
--edge, risers at --rise, walls and sides at --side, faces looking down at
--under.
Steps: a tread (flat face looking up) and the faces no taller than --riser
steps whose top is at it or within half a step below it are one stone.
Each step stone is one flat tone, read at its centre, moved by up to --vary,
spread evenly and shuffled, seeded by kit and file name. Walls and sides run
the height gradient smoothly, point by point, and keep --keep of each face's
old tone against the old trend of tone by height over all walls, so walls
set apart in the old tones stay apart. Side triangles whose old tones, less
that trend, differ by --split or more are never one face.
Recess: rays over the half sky of each point; the share hitting the model
within --reach of its size darkens it, from --open on, by up to --shadow.
Overhang: rays up within 30 degrees; the share hitting the model within --over
of its height darkens it by up to --hang.
Chips: angled faces (no side within 18 degrees of an axis) under --small of
the stone's surface are --chip darker.
Caps: flat tops that are no step are --trim lighter.

  --cell <c,r>     14,3
  --top <f>        0.32
  --edge <f>       0.26
  --rise <f>       0.42
  --side <f>       0.46
  --under <f>      0.86
  --whole <f>      0.60
  --vary <f>       0.09
  --chip <f>       0.16
  --small <f>      0.03
  --keep <f>       1
  --split <f>      0.12
  --reach <f>      0.2
  --open <f>       0.3
  --shadow <f>     0.20
  --over <f>       0.35
  --hang <f>       0.2
  --trim <f>       0.06
  --riser <f>      1.6
  --debug          each step stone one bright band instead
  --dry`;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(0); }
const opt = { cell: [14, 3], top: [0.32], edge: [0.26], rise: [0.42], side: [0.46], under: [0.86], whole: [0.6], vary: [0.09], chip: [0.16], small: [0.03], keep: [1], split: [0.12], reach: [0.2], open: [0.3], shadow: [0.2], over: [0.35], hang: [0.2], trim: [0.06], riser: [1.6], dry: false, debug: false };
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dry' || a === '--debug') opt[a.slice(2)] = true;
  else if (a.startsWith('--')) opt[a.slice(2)] = args[++i].split(',').map(Number);
  else files.push(a);
}
const [cu, cr] = opt.cell;
const inCell = (u, v) => Math.floor(u * 16) === cu && Math.floor(v * 4) === cr;
const apply = (m, p) => [0, 1, 2].map((k) => m[k] * p[0] + m[4 + k] * p[1] + m[8 + k] * p[2] + m[12 + k]);
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
const DEBUG = [[4, 2], [6, 0], [1, 1], [13, 3], [8, 0], [3, 1], [5, 0], [6, 1], [2, 0], [0, 0]];

const seeded = (name) => {
  let h = 2166136261;
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
};

const area = (poly) => {
  let s = [0, 0, 0];
  for (let i = 1; i + 1 < poly.length; i++) s = s.map((x, k) => x + cross(sub(poly[i].w, poly[0].w), sub(poly[i + 1].w, poly[0].w))[k]);
  return Math.hypot(...s) / 2;
};

for (const file of files) {
  const glb = readGlb(file);
  const rand = seeded(file.split(/[\\/]/).slice(-2).join('/'));
  const all = [];
  for (const mesh of glb.json.meshes ?? []) for (const prim of mesh.primitives) {
    if ((prim.mode ?? 4) !== 4) continue;
    const m = primitiveMatrix(glb.json, prim);
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const idx = prim.indices !== undefined ? readAccessor(glb, prim.indices).data : pos.map((_, i) => i).filter((i) => i < pos.length / 3);
    for (let t = 0; t + 2 < idx.length; t += 3) all.push([0, 1, 2].map((k) => apply(m, [pos[idx[t + k] * 3], pos[idx[t + k] * 3 + 1], pos[idx[t + k] * 3 + 2]])));
  }
  const tree = buildTree(all);
  const nearest = (o, d, far) => {
    const inv = d.map((x) => 1 / x);
    const stack = [tree.root];
    while (stack.length) {
      const node = stack.pop();
      if (!hitBox(node.b, o, inv, far)) continue;
      if (node.left) { stack.push(node.left, node.right); continue; }
      for (let i = node.start; i < node.end; i++) { const at = hitTriangle(o, d, all[tree.order[i]]); if (at > 0 && at < far) return true; }
    }
    return false;
  };
  const stone = [];
  for (const prim of editablePrimitives(glb.json)) {
    const at = prim.attributes;
    if (at.TEXCOORD_0 === undefined || at.NORMAL === undefined || prim.targets) continue;
    if (Object.keys(at).some((k) => !['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(k))) continue;
    if (glb.json.accessors[at.TEXCOORD_0].componentType !== 5126 || glb.json.accessors[at.NORMAL].componentType !== 5126) continue;
    const m = primitiveMatrix(glb.json, prim);
    const pos = readAccessor(glb, at.POSITION).data;
    const nrm = readAccessor(glb, at.NORMAL).data;
    const uv = readAccessor(glb, at.TEXCOORD_0).data;
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const vert = (i) => ({ w: apply(m, [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]), n: [nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]], l: [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]] });
    const tris = [];
    const keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      const corners = [vert(a), vert(b), vert(c)];
      const n = cross(sub(corners[1].w, corners[0].w), sub(corners[2].w, corners[0].w));
      const l = Math.hypot(...n);
      if (!l || !inCell((uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3, (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3)) { keep.push(a, b, c); continue; }
      const normal = n.map((x) => x / l);
      tris.push({ corners, ids: [a, b, c], normal, kind: normal[1] > 0.7 ? 0 : normal[1] < -0.7 ? 2 : 1, was: (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) * 4 / 3 - cr });
    }
    if (tris.length) stone.push({ prim, pos, nrm, uv, keep, tris });
  }
  if (!stone.length) { console.log(`${file}: no stone in cell ${opt.cell}`); continue; }

  const trend = (() => {
    let sw = 0; let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
    for (const s of stone) for (const tri of s.tris) if (tri.kind === 1) {
      const w = area(tri.corners); const y = (tri.corners[0].w[1] + tri.corners[1].w[1] + tri.corners[2].w[1]) / 3;
      sw += w; sx += w * y; sy += w * tri.was; sxx += w * y * y; sxy += w * y * tri.was;
    }
    if (!sw) return () => 0;
    const mx = sx / sw; const my = sy / sw; const vx = sxx / sw - mx * mx;
    const b = vx > 1e-12 ? (sxy / sw - mx * my) / vx : 0;
    return (y) => my + b * (y - mx);
  })();
  for (const s of stone) for (const tri of s.tris) tri.res = tri.was - trend((tri.corners[0].w[1] + tri.corners[1].w[1] + tri.corners[2].w[1]) / 3);
  const faces = [];
  for (const s of stone) {
    const parent = s.tris.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const byPoint = new Map();
    s.tris.forEach((tri, i) => { for (const c of tri.corners) { const k = c.w.map((x) => Math.round(x * 1e4)).join(','); if (!byPoint.has(k)) byPoint.set(k, []); byPoint.get(k).push(i); } });
    for (const list of byPoint.values()) for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const p = s.tris[list[a]]; const q = s.tris[list[b]];
      if (p.kind === q.kind && dot(p.normal, q.normal) > 0.97 && (p.kind !== 1 || Math.abs(p.res - q.res) < opt.split[0])) parent[find(list[a])] = find(list[b]);
    }
    const groups = new Map();
    s.tris.forEach((tri, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(tri); });
    for (const list of groups.values()) {
      let lo = Infinity; let hi = -Infinity; let n = [0, 0, 0];
      for (const tri of list) { n = n.map((x, k) => x + tri.normal[k]); for (const c of tri.corners) { lo = Math.min(lo, c.w[1]); hi = Math.max(hi, c.w[1]); } }
      const size = list.reduce((x, tri) => x + area(tri.corners), 0);
      let was = 0; let mid = 0;
      for (const tri of list) { const a = area(tri.corners); for (let k = 0; k < 3; k++) { was += a * (s.uv[tri.ids[k] * 2 + 1] * 4 - cr) / 3; mid += a * tri.corners[k].w[1] / 3; } }
      const face = { id: faces.length, tris: list, kind: list[0].kind, lo, hi, normal: norm(n), step: -1, size, was: was / (size || 1), mid: mid / (size || 1) };
      for (const tri of list) tri.face = face;
      faces.push(face);
    }
  }

  let y0 = Infinity; let y1 = -Infinity;
  for (const f of faces) { y0 = Math.min(y0, f.lo); y1 = Math.max(y1, f.hi); }
  const span = Math.max(1e-6, y1 - y0);
  const flat = faces.filter((f) => f.kind === 0 && f.hi - f.lo < span * 0.02);
  const levels = [...new Set(flat.map((f) => Math.round(((f.lo + f.hi) / 2 - y0) / span * 400)))].sort((a, b) => a - b).map((l) => y0 + l * span / 400);
  const gaps = levels.slice(1).map((l, i) => l - levels[i]).filter((g) => g > span * 0.02).sort((a, b) => a - b);
  const step = gaps.length ? gaps[Math.floor(gaps.length / 2)] : span / 4;
  const levelOf = (y) => {
    let best = -1; let d = Infinity;
    levels.forEach((l, i) => { const e = Math.abs(l - y); if (e < d) { d = e; best = i; } });
    return d < step * 0.25 ? best : -1;
  };
  for (const f of flat) f.step = levelOf((f.lo + f.hi) / 2);
  const levelOver = (y) => levels.findIndex((l) => l > y - step * 0.25 && l - y < step * 0.5);
  for (const f of faces) if (f.step < 0 && f.kind !== 2 && f.hi - f.lo <= step * opt.riser[0] + 1e-6) f.step = levelOver(f.hi);

  const pieces = [];
  for (const f of faces) for (const tri of f.tris) pieces.push({ poly: tri.corners, face: f, key: f.step >= 0 ? `s${f.step}` : `f${f.id}` });
  const keys = [...new Set(pieces.map((p) => p.key))];
  const steps = keys.filter((k) => k[0] === 's');
  const offsets = steps.map((_, i) => (steps.length > 1 ? -1 + (2 * i) / (steps.length - 1) : 0) * opt.vary[0]);
  for (let i = offsets.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [offsets[i], offsets[j]] = [offsets[j], offsets[i]]; }
  const offset = new Map(steps.map((k, i) => [k, offsets[i]]));

  let size = 0;
  { const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
    for (const tri of all) for (const p of tri) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    size = Math.max(...hi.map((x, k) => x - lo[k])); }
  const frame = (n) => { const a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; const t1 = norm(cross(n, a)); return [t1, cross(n, t1)]; };
  const SKY = []; const CONE = [];
  for (let i = 0; i < 48; i++) { const z = (i + 0.5) / 48; const r = Math.sqrt(1 - z * z); const a = i * 2.39996; SKY.push([r * Math.cos(a), r * Math.sin(a), z]); }
  for (let i = 0; i < 16; i++) { const z = 1 - (i + 0.5) / 16 * (1 - Math.cos(Math.PI / 6)); const r = Math.sqrt(1 - z * z); const a = i * 2.39996; CONE.push([r * Math.cos(a), z, r * Math.sin(a)]); }
  const shade = new Map();
  const shadeAt = (v, f) => {
    const key = `${f.id}:${v.w.map((x) => Math.round(x * 1e4)).join(',')}`;
    if (shade.has(key)) return shade.get(key);
    const n = f.normal; const o = v.w.map((x, k) => x + n[k] * size * 1e-3);
    const [t1, t2] = frame(n);
    let hit = 0;
    for (const [x, y, z] of SKY) if (nearest(o, norm(n.map((w, k) => w * z + t1[k] * x + t2[k] * y)), opt.reach[0] * size)) hit++;
    const recess = Math.max(0, Math.min(1, (hit / SKY.length - opt.open[0]) / (1 - opt.open[0])));
    let up = 0;
    if (f.kind !== 2) for (const d of CONE) if (dot(d, n) > -0.2 && nearest(o, d, opt.over[0] * span)) up++;
    const r = opt.shadow[0] * recess + opt.hang[0] * up / CONE.length;
    shade.set(key, r);
    return r;
  };

  const centre = new Map();
  for (const piece of pieces) {
    const g = `${piece.key}|${piece.face.id}`;
    const c = centre.get(g) ?? { a: 0, w: [0, 0, 0] };
    for (let i = 1; i + 1 < piece.poly.length; i++) {
      const t = [piece.poly[0], piece.poly[i], piece.poly[i + 1]];
      const a = area(t);
      for (let k = 0; k < 3; k++) c.w[k] += a * (t[0].w[k] + t[1].w[k] + t[2].w[k]) / 3;
      c.a += a;
    }
    centre.set(g, c);
  }
  for (const c of centre.values()) c.w = c.w.map((x) => x / (c.a || 1));
  const stoneArea = faces.reduce((x, f) => x + f.size, 0);
  const walls = faces.filter((f) => f.kind === 1 && f.step < 0);
  const fit = (() => {
    let sw = 0; let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
    for (const f of walls) { sw += f.size; sx += f.size * f.mid; sy += f.size * f.was; sxx += f.size * f.mid * f.mid; sxy += f.size * f.mid * f.was; }
    if (!sw) return () => 0;
    const mx = sx / sw; const my = sy / sw; const vx = sxx / sw - mx * mx;
    const b = vx > 1e-12 ? (sxy / sw - mx * my) / vx : 0;
    return (y) => my + b * (y - mx);
  })();
  for (const f of walls) f.keep = opt.keep[0] * (f.was - fit(f.mid));
  for (const f of faces) f.chip = f.kind !== 2 && Math.max(...f.normal.map(Math.abs)) < 0.95 && f.size < stoneArea * opt.small[0];
  const toneAt = (piece, v) => {
    const f = piece.face;
    const off = offset.get(piece.key) ?? 0;
    const mid = centre.get(`${piece.key}|${f.id}`);
    const h = (mid.w[1] - y0) / span;
    if (f.kind === 2) return opt.under[0] + shadeAt(mid, f) * 0.3;
    let base;
    let trim = 0;
    let at = h;
    if (f.kind === 0) {
      base = f.hi - f.lo < span * 0.02 ? opt.top[0] : opt.edge[0];
      if (f.step < 0) trim = -opt.trim[0];
    } else if (f.step >= 0) base = opt.rise[0];
    else {
      base = opt.side[0];
      at = (v.w[1] - y0) / span;
      trim = f.keep;
    }
    return base + opt.whole[0] * (0.5 - at) + off + trim + shadeAt(mid, f) + (f.chip ? opt.chip[0] : 0);
  };

  const replaced = new Map();
  let before = 0; let after = 0;
  for (const s of stone) {
    const mine = pieces.filter((p) => s.tris.includes(p.face.tris[0]));
    const base = s.pos.length / 3;
    const P = Array.from(s.pos); const N = Array.from(s.nrm); const U = Array.from(s.uv);
    const idx = [...s.keep];
    let next = base;
    for (const piece of mine) {
      if (area(piece.poly) < 1e-10) continue;
      const ids = piece.poly.map((v) => {
        const n = norm(v.n);
        P.push(...v.l); N.push(...n);
        if (opt.debug) { const [dc, dr] = DEBUG[keys.indexOf(piece.key) % DEBUG.length]; U.push((dc + 0.5) / 16, (dr + 0.3) / 4); }
        else U.push((cu + 0.5) / 16, (cr + Math.max(0.02, Math.min(0.98, toneAt(piece, v)))) / 4);
        return next++;
      });
      for (let i = 1; i + 1 < ids.length; i++) if (area([piece.poly[0], piece.poly[i], piece.poly[i + 1]]) > 1e-9) idx.push(ids[0], ids[i], ids[i + 1]);
    }
    const used = new Map();
    const remap = idx.map((i) => { if (!used.has(i)) used.set(i, used.size); return used.get(i); });
    const order = [...used.keys()];
    const pick = (src, n) => Float32Array.from(order.flatMap((i) => src.slice(i * n, i * n + n)));
    const at = s.prim.attributes;
    for (const [name, arr, n] of [['POSITION', P, 3], ['NORMAL', N, 3], ['TEXCOORD_0', U, 2]]) {
      const data = pick(arr, n);
      glb.json.accessors[at[name]].count = order.length;
      replaced.set(at[name], Buffer.from(data.buffer));
    }
    const Type = order.length <= 65536 ? Uint16Array : Uint32Array;
    const data = Type.from(remap);
    const acc = glb.json.accessors[s.prim.indices];
    acc.componentType = Type === Uint16Array ? 5123 : 5125;
    acc.count = data.length;
    replaced.set(s.prim.indices, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    before += (s.keep.length + s.tris.length * 3) / 3; after += data.length / 3;
  }
  console.log(`${file.split(/[\\/]/).slice(-2).join('/')}: ${steps.length} steps, step ${step.toFixed(3)}, tris ${before} -> ${after}`);
  if (opt.dry) continue;
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
}
