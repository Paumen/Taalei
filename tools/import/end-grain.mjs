import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder, faceNormal, welder, edgeKey, rawRows } from './mesh-edit.mjs';

const HELP = `end-grain.mjs [--band <band>] [--rings <n>] [--up] [--to <band>] <workfile.glb> [...]

Gives the cut ends of logs an end-grain look. An end is a near-flat face in <band>
(default tan) of kits/colormap.png that faces along the long axis of its part
(shells welded on shared positions). Each end is rebuilt as round growth rings
around a darker pith at the heart of the log: the centre of the circle through
the rim where it meets the bark, so a split piece shows arcs around a heart at
or past its edge. <n> (default 4) rings run from heart to bark and on to the
far corners, stepping between the light and dark end of the band. An end whose
rim does not run once around it is left as it is. --up takes faces that face up instead, for stump tops. --to moves the
ends into another band, for ends that are bark like the rest of the log.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const FLAT = 0.95;
const ALONG = 0.7;
const UP = 0.95;
const LIGHT = 0.3;
const DARK = 0.7;
const SECTORS = 8;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};

const area2 = (poly) => Math.abs(poly.reduce((s, a, i) => {
  const b = poly[(i + 1) % poly.length];
  return s + a[0] * b[1] - a[1] * b[0];
}, 0)) / 2;

function clip(poly, hull) {
  let out = poly;
  for (let i = 0; i < hull.length && out.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const side = (q) => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    const next = [];
    for (let j = 0; j < out.length; j++) {
      const p = out[j], q = out[(j + 1) % out.length];
      const sp = side(p), sq = side(q);
      if (sp >= 0) next.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq);
        next.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    out = next;
  }
  return out;
}

function earcut(poly) {
  const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const left = poly.map((_, i) => i);
  const ears = [];
  while (left.length > 3) {
    let cut = -1;
    for (let i = 0; i < left.length && cut < 0; i++) {
      const [a, b, c] = [left[(i + left.length - 1) % left.length], left[i], left[(i + 1) % left.length]];
      if (cross2(poly[a], poly[b], poly[c]) <= 0) continue;
      const inside = left.some((j) => j !== a && j !== b && j !== c
        && cross2(poly[a], poly[b], poly[j]) >= 0 && cross2(poly[b], poly[c], poly[j]) >= 0 && cross2(poly[c], poly[a], poly[j]) >= 0);
      if (!inside) cut = i;
    }
    if (cut < 0) return null;
    ears.push([left[(cut + left.length - 1) % left.length], left[cut], left[(cut + 1) % left.length]]);
    left.splice(cut, 1);
  }
  ears.push(left);
  return ears;
}

function circle(points) {
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, sz = 0, sxz = 0, syz = 0;
  for (const [x, y] of points) {
    const z = x * x + y * y;
    sxx += x * x; sxy += x * y; syy += y * y; sx += x; sy += y; sz += z; sxz += x * z; syz += y * z;
  }
  const m = points.length;
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, m]];
  const r = [sxz, syz, sz];
  const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1])
    - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const d = det(A);
  if (Math.abs(d) < 1e-18) return null;
  const solve = (k) => det(A.map((row, i) => row.map((x, j) => (j === k ? r[i] : x)))) / d;
  const [a, b, c] = [solve(0), solve(1), solve(2)];
  const cx = a / 2, cy = b / 2, rr = c + cx * cx + cy * cy;
  return rr > 0 ? { c: [cx, cy], r: Math.sqrt(rr) } : null;
}

function mainAxis(points) {
  const m = [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / points.length);
  const c = [0, 1, 2].map((i) => [0, 1, 2].map((j) => points.reduce((s, p) => s + (p[i] - m[i]) * (p[j] - m[j]), 0)));
  let v = [0.577, 0.577, 0.577];
  for (let k = 0; k < 60; k++) v = unit([0, 1, 2].map((i) => dot(c[i], v)));
  return v;
}

function rimLoop(group, idx, weld) {
  const count = new Map();
  const dir = new Map();
  for (const t of group) {
    for (let k = 0; k < 3; k++) {
      const a = idx[t * 3 + k], b = idx[t * 3 + (k + 1) % 3];
      const key = edgeKey(weld(a), weld(b));
      count.set(key, (count.get(key) ?? 0) + 1);
      dir.set(key, [a, b]);
    }
  }
  const next = new Map();
  for (const [key, n] of count) {
    if (n !== 1) continue;
    const [a, b] = dir.get(key);
    if (next.has(weld(a))) return null;
    next.set(weld(a), b);
  }
  if (next.size < 3) return null;
  const start = next.keys().next().value;
  const loop = [];
  let w = start;
  do {
    const v = next.get(w);
    if (v === undefined || loop.length > next.size) return null;
    loop.push(v);
    w = weld(v);
  } while (w !== start);
  return loop.length === next.size ? loop : null;
}

function prune(glb, prim, replaced) {
  const idx = Array.from(readAccessor(glb, prim.indices).data);
  const keep = [...new Set(idx)].sort((a, b) => a - b);
  const map = new Map(keep.map((v, i) => [v, i]));
  for (const index of Object.values(prim.attributes)) {
    const { size, row } = rawRows(glb, index);
    const bytes = Buffer.alloc(size * keep.length);
    keep.forEach((v, i) => row(v).copy(bytes, i * size));
    glb.json.accessors[index].count = keep.length;
    replaced.set(index, bytes);
  }
  const accessor = glb.json.accessors[prim.indices];
  const data = (keep.length <= 65536 ? Uint16Array : Uint32Array).from(idx.map((v) => map.get(v)));
  accessor.componentType = keep.length <= 65536 ? 5123 : 5125;
  replaced.set(prim.indices, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
}

function grain(file, cell, rings, up, to = cell) {
  const glb = readGlb(file);
  const replaced = new Map();
  const edited = [];
  let ends = 0;
  const inCell = (u, v) => Math.floor(u * 16) === cell[0] && Math.floor(v * 4) === cell[1];
  const uvAt = (t) => [(to[0] + 0.5) / 16, (to[1] + t) / 4];
  for (const prim of editablePrimitives(glb.json)) {
    if (prim.attributes.TEXCOORD_0 === undefined) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const triCount = idx.length / 3;
    const p = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const { weld } = welder(pos);

    const shell = new Map();
    const findShell = (w) => (shell.get(w) === w ? w : (shell.set(w, findShell(shell.get(w))), shell.get(w)));
    for (let v = 0; v < pos.length / 3; v++) if (!shell.has(weld(v))) shell.set(weld(v), weld(v));
    for (let t = 0; t < triCount; t++) {
      const w = [0, 1, 2].map((k) => findShell(weld(idx[t * 3 + k])));
      shell.set(w[1], w[0]);
      shell.set(findShell(w[2]), findShell(w[0]));
    }
    const shellPoints = new Map();
    for (let v = 0; v < pos.length / 3; v++) {
      const s = findShell(weld(v));
      if (!shellPoints.has(s)) shellPoints.set(s, []);
      shellPoints.get(s).push(p(v));
    }
    const axes = new Map([...shellPoints].map(([s, pts]) => [s, mainAxis(pts)]));

    const tris = [];
    for (let t = 0; t < triCount; t++) {
      const c = [0, 1, 2].map((k) => idx[t * 3 + k]);
      if (c.every((v) => inCell(uv[v * 2], uv[v * 2 + 1]))) tris.push(t);
    }
    if (!tris.length) continue;
    const normals = new Map(tris.map((t) => [t, unit(faceNormal(pos, idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]))]));
    const edgeTris = new Map();
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const key = edgeKey(weld(idx[t * 3 + k]), weld(idx[t * 3 + (k + 1) % 3]));
        if (!edgeTris.has(key)) edgeTris.set(key, []);
        edgeTris.get(key).push(t);
      }
    }
    const cellOf = (t) => [0, 1, 2].map((k) => idx[t * 3 + k]).map((v) => `${Math.floor(uv[v * 2] * 16)},${Math.floor(uv[v * 2 + 1] * 4)}`);
    const allEdges = new Map();
    for (let t = 0; t < triCount; t++) {
      for (let k = 0; k < 3; k++) {
        const key = edgeKey(weld(idx[t * 3 + k]), weld(idx[t * 3 + (k + 1) % 3]));
        if (!allEdges.has(key)) allEdges.set(key, []);
        allEdges.get(key).push(t);
      }
    }
    const isBark = (a, b, group) => (allEdges.get(edgeKey(weld(a), weld(b))) ?? [])
      .some((t) => !group.includes(t) && cellOf(t).every((c) => c !== `${cell[0]},${cell[1]}`));
    const parent = new Map(tris.map((t) => [t, t]));
    const find = (t) => (parent.get(t) === t ? t : (parent.set(t, find(parent.get(t))), parent.get(t)));
    for (const list of edgeTris.values()) {
      for (let i = 1; i < list.length; i++) {
        if (dot(normals.get(list[0]), normals.get(list[i])) >= FLAT) parent.set(find(list[i]), find(list[0]));
      }
    }
    const groups = new Map();
    for (const t of tris) {
      const r = find(t);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(t);
    }

    const adder = vertexAdder(glb, prim);
    const drop = new Set();
    const added = [];
    for (const group of groups.values()) {
      const n = unit(group.reduce((s, t) => s.map((x, k) => x + normals.get(t)[k]), [0, 0, 0]));
      const axis = up ? [0, 1, 0] : axes.get(findShell(weld(idx[group[0] * 3])));
      if (up ? dot(n, axis) < UP : Math.abs(dot(n, axis)) < ALONG) continue;
      const loop = rimLoop(group, idx, weld);
      if (!loop) continue;
      let area = 0;
      const centre = [0, 0, 0];
      for (const t of group) {
        const [a, b, c] = [0, 1, 2].map((k) => p(idx[t * 3 + k]));
        const ab = sub(b, a), ac = sub(c, a);
        const s = Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]);
        area += s;
        for (let k = 0; k < 3; k++) centre[k] += (s * (a[k] + b[k] + c[k])) / 3;
      }
      for (let k = 0; k < 3; k++) centre[k] /= area;
      const d0 = sub(p(loop[0]), centre);
      const e1 = unit(d0.map((x, j) => x - dot(d0, n) * n[j]));
      const e2 = unit([n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]]);
      const flat = (q) => [dot(sub(q, centre), e1), dot(sub(q, centre), e2)];
      const rim = loop.map((v) => flat(p(v)));
      const convex = rim.every((a, i) => {
        const b = rim[(i + 1) % rim.length], c = rim[(i + 2) % rim.length];
        return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) >= 0;
      });
      const ears = convex ? [rim.map((_, i) => i)] : earcut(rim);
      if (!ears) continue;
      const flats = convex ? rim.slice(2).map((_, i) => [0, i + 1, i + 2]) : ears;
      const barkRim = rim.filter((_, i) => isBark(loop[i], loop[(i + 1) % loop.length], group)
        || isBark(loop[(i + loop.length - 1) % loop.length], loop[i], group));
      const extent = Math.max(...rim.map((q) => Math.hypot(...q)));
      let heart = circle(barkRim.length >= 3 ? barkRim : rim);
      if (!heart || heart.r > extent * 3) heart = { c: [0, 0], r: extent };
      const reach = Math.max(...rim.map((q) => Math.hypot(q[0] - heart.c[0], q[1] - heart.c[1])));
      const width = heart.r / (rings + 1);
      const bands = Math.ceil(reach / (width * Math.cos(Math.PI / SECTORS)));
      const shadeAt = (r) => {
        const k = Math.min(Math.floor(r / width), bands);
        const f = r / width - k;
        const s = (j) => ((rings + 1 - j) % 2 ? DARK : LIGHT);
        return s(k) + (s(k + 1) - s(k)) * Math.min(f, 1);
      };
      const made = new Map();
      const vertex = (q) => {
        const key = q.map((x) => Math.round(x / (extent * 1e-5))).join(',');
        if (!made.has(key)) {
          let best = null;
          for (const tri of flats) {
            const [a, b, c] = tri.map((j) => rim[j]);
            const d = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
            const wb = ((q[0] - a[0]) * (c[1] - a[1]) - (q[1] - a[1]) * (c[0] - a[0])) / d;
            const wc = ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / d;
            const worst = Math.min(1 - wb - wc, wb, wc);
            if (!best || worst > best.worst) best = { tri, wb, wc, worst };
          }
          const [pa, pb, pc] = best.tri.map((j) => p(loop[j]));
          made.set(key, adder.add(loop[best.tri[0]], {
            POSITION: [0, 1, 2].map((j) => pa[j] + best.wb * (pb[j] - pa[j]) + best.wc * (pc[j] - pa[j])),
            TEXCOORD_0: uvAt(shadeAt(Math.hypot(q[0] - heart.c[0], q[1] - heart.c[1]))),
          }));
        }
        return made.get(key);
      };
      const at = (r, a) => [heart.c[0] + r * Math.cos(a), heart.c[1] + r * Math.sin(a)];
      for (let k = 0; k < bands; k++) {
        for (let i = 0; i < SECTORS; i++) {
          const a0 = (2 * Math.PI * i) / SECTORS, a1 = (2 * Math.PI * (i + 1)) / SECTORS;
          const ring = k === 0
            ? [heart.c, at(width, a0), at(width, a1)]
            : [at(k * width, a0), at((k + 1) * width, a0), at((k + 1) * width, a1), at(k * width, a1)];
          for (const ear of ears) {
            const piece = clip(ring, ear.map((j) => rim[j]));
            if (piece.length < 3 || area2(piece) < extent * extent * 1e-6) continue;
            const ids = piece.map(vertex);
            for (let j = 1; j < ids.length - 1; j++) {
              if (area2([piece[0], piece[j], piece[j + 1]]) > extent * extent * 1e-7) added.push([ids[0], ids[j], ids[j + 1]]);
            }
          }
        }
      }
      group.forEach((t) => drop.add(t));
      ends++;
    }
    if (!drop.size) continue;
    const out = [];
    for (let t = 0; t < triCount; t++) if (!drop.has(t)) out.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
    for (const tri of added) out.push(...tri);
    adder.commit(out, replaced);
    edited.push(prim);
  }
  if (!ends) return 0;
  repack(glb, replaced);
  const pruned = new Map();
  for (const prim of edited) prune(glb, prim, pruned);
  repack(glb, pruned);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  return ends;
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help')) {
  console.log(HELP);
  process.exit(argv.length ? 0 : 1);
}
const options = {};
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--up') options.up = true;
  else if (argv[i].startsWith('--')) options[argv[i].slice(2)] = argv[++i];
  else files.push(argv[i]);
}
const band = options.band ?? 'tan';
if (!BANDS[band]) throw new Error(`no such band: ${band}`);
const cell = BANDS[band].split(',').map(Number);
const rings = Number(options.rings ?? 4);
if (options.to && !BANDS[options.to]) throw new Error(`no such band: ${options.to}`);
const to = options.to ? BANDS[options.to].split(',').map(Number) : cell;
for (const file of files) console.log(`${file}: ${grain(file, cell, rings, options.up, to)} ends`);
