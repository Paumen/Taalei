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
Opening: rays in a narrow cone straight out from the face; the share that
meets stone facing back within --gap times the face's own longest side.
That share moves the face toward --deep as well; the larger of the two counts.
Trim: a face standing in front of a bigger face looking the same way, by less
than its own longest side, is --step lighter; one set back behind such a face
is --step darker.
Overhang: from just in front of the top of a side face, --out of the model's
size away from it, rays go up. If most of them hit the model within --over of
the stone's height, the face is under an overhang: its stone fades toward
--deep by --shade, fully right under the overhang, gone --fade of the stone's
height lower. Faces taller than that get a cut line where the fade ends,
biggest faces first, until the cuts add --budget of the model's tris.

  --cell <c,r>     14,3
  --top <a,b>      0.05,0.25
  --side <a,b>     0.25,0.75
  --under <a,b>    0.75,0.95
  --deep <a,b>     0.75,0.95
  --reach <f>      0.2
  --open <f>       0.35
  --shut <f>       0.75
  --gap <f>        1.0
  --step <f>       0.12
  --out <f>        0.04
  --over <f>       0.35
  --shade <f>      0.7
  --fade <f>       0.2
  --budget <f>     0.15
  --dry`;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(0); }
const opt = {
  cell: [14, 3], top: [0.05, 0.25], side: [0.25, 0.75], under: [0.75, 0.95], deep: [0.75, 0.95],
  reach: [0.2], open: [0.35], shut: [0.75], gap: [1.0], step: [0.12], out: [0.04], over: [0.35], shade: [0.7], fade: [0.2], budget: [0.15], dry: false,
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

const CONE = SKY.filter(([, , z]) => z > Math.cos((35 * Math.PI) / 180));

function nearest(tree, tris, o, d, far) {
  const inv = d.map((x) => 1 / x);
  const stack = [tree.root];
  let best = far;
  let which = -1;
  while (stack.length) {
    const node = stack.pop();
    if (!hitBox(node.b, o, inv, best)) continue;
    if (node.left) { stack.push(node.left, node.right); continue; }
    for (let i = node.start; i < node.end; i++) {
      const at = hitTriangle(o, d, tris[tree.order[i]]);
      if (at > 0 && at < best) { best = at; which = tree.order[i]; }
    }
  }
  return best < far ? which : null;
}

const triNormal = ([a, b, c]) => unit(cross(sub(b, a), sub(c, a)));

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
    const local = Array.from(pos);
    const nrm = prim.attributes.NORMAL !== undefined ? Array.from(readAccessor(glb, prim.attributes.NORMAL).data) : null;
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
    if (tris.length) {
      stone.push({ prim, world, local, nrm, uv: Float32Array.from(uv), idx, tris, adder: vertexAdder(glb, prim), base: world.length, src: new Map() });
    }
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
    const q = size * 1e-4;
    const keyOf = (p) => s.world[p].map((x) => Math.round(x / q)).join(',');
    s.tris.forEach((tri, i) => { for (let k = 0; k < 3; k++) { const p = keyOf(s.idx[tri.t + k]); if (!byPoint.has(p)) byPoint.set(p, []); byPoint.get(p).push(i); } });
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
    let span = 0;
    const pts = face.tris.flatMap((tri) => [0, 1, 2].map((k) => s.world[s.idx[tri.t + k]]));
    for (let k = 0; k < 3; k++) span = Math.max(span, Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k])));
    let meet = 0; let m = 0;
    for (const tri of big.slice(0, 6)) {
      const [a, b, c] = [0, 1, 2].map((k) => s.world[s.idx[tri.t + k]]);
      const o = add([0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3), tri.normal, eps);
      const [t1, t2] = frame(tri.normal);
      for (const [x, y, z] of CONE) {
        const d = unit(add(add(tri.normal.map((w) => w * z), t1, x), t2, y));
        const hitAt = nearest(tree, all, o, d, opt.gap[0] * span);
        if (hitAt !== null && dot(triNormal(all[hitAt]), d) < 0) meet++;
        m++;
      }
    }
    face.opening = m ? meet / m : 0;
    face.dark = Math.max(clamp((face.closed - opt.open[0]) / (opt.shut[0] - opt.open[0])), face.opening);
  }

  for (const face of faces) {
    const pts = face.tris.flatMap((tri) => [0, 1, 2].map((k) => face.s.world[face.s.idx[tri.t + k]]));
    face.lo = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])));
    face.hi = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
    face.area = face.tris.reduce((a, t) => a + t.area, 0);
    face.n = unit(face.tris.reduce((a, t) => add(a, t.normal, t.area), [0, 0, 0]));
    face.c = face.lo.map((x, k) => (x + face.hi[k]) / 2);
    face.span = Math.max(...face.hi.map((x, k) => x - face.lo[k]));
    face.step = 0;
  }
  const near = (f, g, pad) => [0, 1, 2].every((k) => f.lo[k] - pad <= g.hi[k] && g.lo[k] - pad <= f.hi[k]);
  for (const f of faces) {
    if (f.kind !== 1) continue;
    let proud = false; let inset = false;
    for (const g of faces) {
      if (g === f || g.kind !== 1 || g.area <= f.area || dot(f.n, g.n) < 0.97) continue;
      const d = dot(sub(f.c, g.c), f.n);
      if (Math.abs(d) < size * 1e-3 || Math.abs(d) > f.span || !near(f, g, Math.abs(d) * 2)) continue;
      if (d > 0) proud = true; else inset = true;
    }
    f.step = proud && !inset ? -opt.step[0] : inset && !proud ? opt.step[0] : 0;
  }

  const H = y1 - y0;
  const UPS = [[0, 1, 0], ...[0, 1, 2, 3].map((k) => unit([Math.cos(k * Math.PI / 2) * 0.3, 1, Math.sin(k * Math.PI / 2) * 0.3]))];
  for (const f of faces) {
    f.eave = null;
    if (f.kind !== 1) continue;
    const top = f.hi[1] - Math.max(0.02 * H, 0.1 * (f.hi[1] - f.lo[1]));
    const pts = [];
    for (const tri of f.tris) for (let k = 0; k < 3; k++) {
      const p = f.s.world[f.s.idx[tri.t + k]];
      if (p[1] >= top) pts.push(p);
    }
    const ys = [];
    let tries = 0;
    for (const p of pts.slice(0, 16)) {
      const o = add(add([p[0], p[1] - 0.01 * H, p[2]], f.n, opt.out[0] * size), [0, 1, 0], 0);
      for (const d of UPS) {
        tries++;
        const hitAt = nearest(tree, all, o, d, opt.over[0] * H);
        if (hitAt === null) continue;
        const tri = all[hitAt];
        const at = hitTriangle(o, d, tri);
        ys.push(o[1] + d[1] * at);
      }
    }
    if (tries && ys.length / tries > 0.5) { ys.sort((a, b) => a - b); f.eave = ys[ys.length >> 1]; }
  }

  let cutTris = 0;
  for (const s of stone) {
    const mid = new Map();
    const lerpAt = (a, b, c) => {
      const key = a < b ? `${a},${b},${c}` : `${b},${a},${c}`;
      if (mid.has(key)) return mid.get(key);
      const t = (c - s.world[a][1]) / (s.world[b][1] - s.world[a][1]);
      const mix = (arr) => [0, 1, 2].map((k) => arr[a * 3 + k] + (arr[b * 3 + k] - arr[a * 3 + k]) * t);
      const set = { POSITION: mix(s.local) };
      if (s.nrm) set.NORMAL = unit(mix(s.nrm));
      const j = s.adder.add(a, set);
      s.world[j] = s.world[a].map((x, k) => x + (s.world[b][k] - x) * t);
      s.local.push(...set.POSITION);
      if (s.nrm) s.nrm.push(...set.NORMAL);
      s.src.set(j, a);
      mid.set(key, j);
      return j;
    };
    for (const tri of [...s.tris].sort((p, q) => q.face.area - p.face.area || p.face.id - q.face.id)) {
      const f = tri.face;
      if (f.eave === null || f.uncut) continue;
      const c = f.eave - opt.fade[0] * H;
      if (c <= f.lo[1] || c >= f.hi[1]) continue;
      if (f.cutStart === undefined) {
        const need = 2 * f.tris.length;
        if (cutTris + need > opt.budget[0] * all.length) { f.uncut = true; continue; }
        f.cutStart = true;
      }
      const v = [0, 1, 2].map((k) => s.idx[tri.t + k]);
      const above = v.map((i) => s.world[i][1] > c);
      const n = above.filter(Boolean).length;
      if (n === 0 || n === 3) continue;
      const lone = above.findIndex((x) => (n === 1 ? x : !x));
      const [a, b, d] = [v[lone], v[(lone + 1) % 3], v[(lone + 2) % 3]];
      const ab = lerpAt(a, b, c); const ad = lerpAt(a, d, c);
      s.idx[tri.t] = a; s.idx[tri.t + 1] = ab; s.idx[tri.t + 2] = ad;
      const t1 = s.idx.length; s.idx.push(ab, b, d);
      const t2 = s.idx.length; s.idx.push(ab, d, ad);
      for (const t of [t1, t2]) { const nt = { ...tri, t }; s.tris.push(nt); f.tris.push(nt); }
      cutTris += 2;
    }
  }

  const replaced = new Map();
  let added = 0;
  for (const s of stone) {
    const { adder } = s;
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
      if (j === undefined) {
        const set = {};
        if (i >= s.base) {
          set.POSITION = s.local.slice(i * 3, i * 3 + 3);
          if (s.nrm) set.NORMAL = s.nrm.slice(i * 3, i * 3 + 3);
        }
        j = adder.add(s.src.get(i) ?? i, set);
        if (i >= s.base) { s.local.push(...set.POSITION); if (s.nrm) s.nrm.push(...set.NORMAL); }
        else { s.local.push(...s.local.slice(i * 3, i * 3 + 3)); if (s.nrm) s.nrm.push(...s.nrm.slice(i * 3, i * 3 + 3)); }
        made.set(key, j); copies.push({ j, from: i }); added++;
      }
      s.idx[tri.t + k] = j;
    }
    for (const c of copies) { s.world[c.j] = s.world[c.from]; }
    const uv = new Float32Array(s.world.length * 2);
    uv.set(s.uv);
    for (const tri of s.tris) for (let k = 0; k < 3; k++) {
      const i = s.idx[tri.t + k];
      const h = low(s.world[i][1]);
      const [a, b] = ranges[tri.face.kind];
      const f = tri.face;
      const under = f.eave === null ? 0 : opt.shade[0] * clamp(1 - (f.eave - s.world[i][1]) / (opt.fade[0] * H));
      const v = Math.max(0.02, Math.min(0.98, lerp(lerp(a, b, h), lerp(opt.deep[0], opt.deep[1], h), Math.max(f.dark, under)) + f.step));
      uv[i * 2] = (cu + 0.5) / 16;
      uv[i * 2 + 1] = (cr + v) / 4;
    }
    adder.commit(s.idx, replaced);
    replaced.set(s.prim.attributes.TEXCOORD_0, Buffer.from(uv.buffer));
  }
  if (process.env.DBG) for (const f of faces) console.log(f.n.map((x) => x.toFixed(2)).join(","), f.c.map((x) => x.toFixed(2)).join(","), f.span.toFixed(2), f.area.toFixed(3), f.tris.length, f.step, f.dark.toFixed(2));
  const count = stone.reduce((n, s) => n + s.tris.length, 0);
  const darkened = faces.filter((f) => f.dark > 0).length;
  const opened = faces.filter((f) => f.opening > 0.3).length;
  const trims = `${faces.filter((f) => f.step < 0).length} proud, ${faces.filter((f) => f.step > 0).length} set back`;
  console.log(`${file}: ${count} stone tris, ${faces.length} faces, ${darkened} darkened, ${opened} in openings, ${trims}, ${faces.filter((f) => f.eave !== null).length} under overhang, ${cutTris} tris added (${(100 * cutTris / all.length).toFixed(1)}%), ${added} points doubled`);
  if (opt.dry) return;
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
}

for (const f of files) tone(f);
