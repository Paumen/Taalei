import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder, welder, primitiveMatrix, edgeKey } from './mesh-edit.mjs';

const HELP = `plank-tone.mjs [--dry] [--force] [--min <n>] [--share <n>] [--band <from>:<to>] [--flat <deg>] [--no-edges] [--whole] [--only <band>] [--floor] <workfile.glb> [...]

Gives each plank in the tan, camel and chestnut bands of kits/colormap.png its
own tone from a set of six, 0.015 OKLCH lightness apart and each used about
equally, with a gradient across its width set per tone (0.04, 0.02, 0.02, 0.06,
0.02, 0.04 from dark to light) that runs the same way
on every plank. A plank's long edges take its darkest value. Faces turned
sideways are 0.02 darker than faces turned up, faces turned down 0.04. For
planks side by side, the light end of one plank's gradient is never within
0.02 of the dark end of the other's.
A piece is a run of triangles in one band that share corners. A piece that
holds two or more parallel flat strips (boards fused with grooves or steps)
is cut into one plank per strip; other pieces are cut where faces meet in an
inward fold. A plank under a tenth of the median plank's area joins the
nearest plank, a triangle cut off its face by a diagonal seam joins the plank
that holds the rest of that face, and each face is shaded by its average
direction. A file is left alone unless it has at least
--min (default 2) planks, boxy pieces that are boards (thinner than wide, longer than wide)
whose broad face fills their outline, or slats (three times longer than wide) lying edge to edge beside a like slat
or a board,
that hold at least --share (default 0.25) of its wood area. Only planks are
recoloured; other wood keeps its look.
--band <from>:<to> moves all wood of one band into another.
--force tones every board and slat and skips the --min and --share check.
--flat <deg> (default 2) is how far apart faces may turn and still count as one flat face.
--no-edges leaves long edges on the gradient instead of the darkest value.
--only <band> tones only that band.
--whole keeps each run of joined triangles as one plank instead of cutting it.
--dry reports without writing.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const WOOD = ['tan', 'camel', 'chestnut'].map((b) => BANDS[b].split(',').map(Number));
const TONES = [0.37, 0.452, 0.534, 0.616, 0.698, 0.78];
const GRADIENT = [0.22, 0.11, 0.11, 0.33, 0.11, 0.22];
const SIDE = 0.11;
const APART = 0.11;
const REF = norm([0.3, 1, 0.5]);
const RANGE = [0.06, 0.94];
let FLAT = Math.cos((2 * Math.PI) / 180);
const PARALLEL = Math.cos((5 * Math.PI) / 180);

function norm(a) {
  const l = Math.hypot(...a) || 1;
  return a.map((x) => x / l);
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, k) => a.map((x) => x * k);

const span = ([lo, hi]) => hi - lo;

function frame(points) {
  const c = [0, 1, 2].map((i) => points.reduce((s, p) => s + p[i], 0) / points.length);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of points) {
    const d = sub(p, c);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j];
  }
  const across = (a) => norm(cross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const axes = [];
  for (let k = 0; k < 2; k++) {
    let v = norm([1, 0.3 + k, 0.7 - k]);
    for (let it = 0; it < 80; it++) {
      let next = [0, 1, 2].map((i) => dot(C[i], v));
      for (const a of axes) next = sub(next, scale(a, dot(next, a)));
      if (Math.hypot(...next) < 1e-12) { v = axes.length ? across(axes[0]) : [1, 0, 0]; break; }
      v = norm(next);
    }
    axes.push(v);
  }
  axes.push(norm(cross(axes[0], axes[1])));
  const ext = axes.map((a) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of points) { const s = dot(p, a); lo = Math.min(lo, s); hi = Math.max(hi, s); }
    return [lo, hi];
  });
  const order = [0, 1, 2].sort((a, b) => span(ext[b]) - span(ext[a]));
  const lo = [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i])));
  const hi = [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i])));
  return { axes: order.map((i) => axes[i]), ext: order.map((i) => ext[i]), lo, hi };
}

const isBoard = (f) => {
  const [, w, t] = f.ext.map(span);
  return t <= 0.6 * w;
};
const isPlank = (f) => {
  const [l, w] = f.ext.map(span);
  return isBoard(f) ? l >= 1.5 * w : l >= 3 * w;
};

function seeded(text) {
  let seed = 1;
  for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

function splitConcave(tris, at) {
  const byEdge = new Map();
  for (const t of tris) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
    const key = edgeKey(at.weld[t][a], at.weld[t][b]);
    if (!byEdge.has(key)) byEdge.set(key, []);
    byEdge.get(key).push(t);
  }
  const parent = new Map(tris.map((t) => [t, t]));
  const find = (a) => (parent.get(a) === a ? a : (parent.set(a, find(parent.get(a))), parent.get(a)));
  for (const [key, list] of byEdge) {
    if (list.length !== 2) continue;
    const [a, b] = list;
    const ids = key.split(',').map(Number);
    const far = at.weld[b].findIndex((w) => !ids.includes(w));
    const rise = dot(at.normal[a], sub(at.corners[b][far], at.corners[a][at.weld[a].indexOf(ids[0])]));
    if (rise > 0 && dot(at.normal[a], at.normal[b]) < Math.cos(Math.PI / 9)) continue;
    parent.set(find(b), find(a));
  }
  const parts = new Map();
  for (const t of tris) {
    const r = find(t);
    if (!parts.has(r)) parts.set(r, []);
    parts.get(r).push(t);
  }
  return [...parts.values()];
}

function splitStrips(tris, at) {
  const parent = new Map(tris.map((t) => [t, t]));
  const find = (a) => (parent.get(a) === a ? a : (parent.set(a, find(parent.get(a))), parent.get(a)));
  const byEdge = new Map();
  for (const t of tris) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
    const key = edgeKey(at.weld[t][a], at.weld[t][b]);
    if (!byEdge.has(key)) byEdge.set(key, []);
    byEdge.get(key).push(t);
  }
  for (const list of byEdge.values()) for (let i = 1; i < list.length; i++) {
    if (dot(at.normal[list[0]], at.normal[list[i]]) > FLAT) parent.set(find(list[i]), find(list[0]));
  }
  const regions = new Map();
  for (const t of tris) {
    const r = find(t);
    if (!regions.has(r)) regions.set(r, { tris: [], area: 0, normal: at.normal[r] });
    const region = regions.get(r);
    region.tris.push(t);
    region.area += at.area[t];
  }
  const groups = [];
  for (const region of regions.values()) {
    const group = groups.find((g) => dot(g.normal, region.normal) > PARALLEL);
    if (group) group.regions.push(region);
    else groups.push({ normal: region.normal, regions: [region] });
  }
  let best = null;
  for (const group of groups) {
    const total = group.regions.reduce((s, r) => s + r.area, 0);
    const strips = group.regions.filter((r) => r.area > 0.08 * total).map((r) => {
      const f = frame(r.tris.flatMap((t) => at.corners[t]));
      return { ...r, long: f.axes[0], length: span(f.ext[0]), width: span(f.ext[1]) };
    }).filter((r) => r.length >= 1.5 * r.width);
    if (strips.length < 2) continue;
    const long = strips.reduce((a, b) => (b.area > a.area ? b : a)).long;
    const aligned = strips.filter((r) => Math.abs(dot(r.long, long)) > 0.9);
    if (aligned.length < 2) continue;
    const area = aligned.reduce((s, r) => s + r.area, 0);
    if (!best || area > best.area) best = { area, normal: group.normal, long, strips: aligned, group, total };
  }
  if (!best) return splitConcave(tris, at);
  const across = norm(cross(best.normal, best.long));
  const range = (list, axis) => {
    const s = list.flatMap((t) => at.corners[t].map((p) => dot(p, axis)));
    return [Math.min(...s), Math.max(...s)];
  };
  const bins = best.strips.map((r) => ({
    across: range(r.tris, across), long: range(r.tris, best.long), height: range(r.tris, best.normal)[1], tris: [],
  }));
  const widths = bins.map((b) => span(b.across)).sort((a, b) => a - b);
  const wide = 1.5 * widths[widths.length >> 1];
  const base = [];
  for (const region of regions.values()) {
    const [lo, hi] = range(region.tris, across);
    const points = region.tris.flatMap((t) => at.corners[t]);
    const c = [0, 1, 2].map((i) => points.reduce((sum, p) => sum + p[i], 0) / points.length);
    const along = dot(c, best.long);
    const up = dot(c, best.normal);
    const mid = (lo + hi) / 2;
    let pick = null;
    let gap = Infinity;
    let gapAlong = Infinity;
    if (hi - lo <= wide) for (const b of bins) {
      const w = span(b.across);
      const [low] = range(region.tris, best.normal);
      if (along < b.long[0] - 0.5 * w || along > b.long[1] + 0.5 * w || up > b.height + 1e-6 || low < b.height - 0.5 * w) continue;
      const d = mid < b.across[0] ? b.across[0] - mid : mid > b.across[1] ? mid - b.across[1] : 0;
      const da = along < b.long[0] ? b.long[0] - along : along > b.long[1] ? along - b.long[1] : 0;
      if (d <= 0.5 * w && (d < gap - 1e-9 || (d < gap + 1e-9 && da < gapAlong))) { gap = d; gapAlong = da; pick = b; }
    }
    (pick ? pick.tris : base).push(...region.tris);
  }
  base.rest = true;
  return [...bins.map((b) => b.tris), base].filter((list) => list.length);
}

function splitSlabs(tris, at) {
  const parent = new Map(tris.map((t) => [t, t]));
  const find = (a) => (parent.get(a) === a ? a : (parent.set(a, find(parent.get(a))), parent.get(a)));
  const byEdge = new Map();
  for (const t of tris) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
    const key = edgeKey(at.weld[t][a], at.weld[t][b]);
    if (!byEdge.has(key)) byEdge.set(key, []);
    byEdge.get(key).push(t);
  }
  for (const list of byEdge.values()) for (let i = 1; i < list.length; i++) {
    if (dot(at.normal[list[0]], at.normal[list[i]]) > FLAT) parent.set(find(list[i]), find(list[0]));
  }
  const regions = new Map();
  for (const t of tris) {
    const r = find(t);
    if (!regions.has(r)) regions.set(r, { tris: [], area: 0, normal: at.normal[r] });
    regions.get(r).tris.push(t);
    regions.get(r).area += at.area[t];
  }
  const total = tris.reduce((s, t) => s + at.area[t], 0);
  const box = (list) => {
    const points = list.flatMap((t) => at.corners[t]);
    return { lo: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))), hi: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))) };
  };
  const big = [...regions.values()].filter((r) => r.area > 0.05 * total).sort((a, b) => b.area - a.area);
  for (const r of big) { r.f = frame(r.tris.flatMap((t) => at.corners[t])); r.c = r.f.ext.map(([lo, hi], i) => scale(r.f.axes[i], (lo + hi) / 2)).reduce((a, b) => a.map((x, i) => x + b[i])); }
  const slabs = [];
  const used = new Set();
  for (const r of big) {
    if (used.has(r)) continue;
    used.add(r);
    const slab = { tris: [...r.tris] };
    const w = span(r.f.ext[1]);
    const partner = big.find((q) => !used.has(q) && dot(q.normal, r.normal) < -PARALLEL && (() => {
      const d = sub(q.c, r.c);
      const depth = -dot(d, r.normal);
      return depth > 0 && depth <= 0.6 * w && Math.hypot(...sub(d, scale(r.normal, dot(d, r.normal)))) <= 0.5 * w;
    })());
    if (partner) { used.add(partner); slab.tris.push(...partner.tris); }
    slabs.push(slab);
  }
  if (slabs.length < 2) return [tris];
  for (const s of slabs) Object.assign(s, box(s.tris));
  const seeded = new Set(slabs.flatMap((s) => s.tris));
  for (const t of tris) {
    if (seeded.has(t)) continue;
    const c = [0, 1, 2].map((i) => (at.corners[t][0][i] + at.corners[t][1][i] + at.corners[t][2][i]) / 3);
    let pick = slabs[0];
    let gap = Infinity;
    for (const s of slabs) {
      const d = Math.hypot(...[0, 1, 2].map((i) => Math.max(0, s.lo[i] - c[i], c[i] - s.hi[i])));
      if (d < gap) { gap = d; pick = s; }
    }
    pick.tris.push(t);
  }
  return slabs.map((s) => s.tris);
}

function pickTones(pieces, R, touch = pieces.map(() => [])) {
  const lo = [0, 1, 2].map((i) => Math.min(...pieces.map((p) => p.lo[i])));
  const hi = [0, 1, 2].map((i) => Math.max(...pieces.map((p) => p.hi[i])));
  const tol = 0.035 * Math.hypot(...sub(hi, lo));
  const gap = (a, b) => Math.hypot(...[0, 1, 2].map((i) => Math.max(0, a.lo[i] - b.hi[i], b.lo[i] - a.hi[i])));
  const mid = (p) => [0, 1, 2].map((i) => (p.lo[i] + p.hi[i]) / 2);
  const beside = pieces.map((p, i) => [-1, 1].flatMap((side) => {
    const list = pieces.map((q, j) => ({ q, j, d: sub(mid(q), mid(p)) })).filter(({ q, j, d }) => j !== i
      && Math.abs(dot(p.axes[0], q.axes[0])) >= 0.9
      && side * dot(d, p.axes[1]) > Math.abs(dot(d, p.axes[0]))
      && gap(p, q) < Math.max(tol, span(p.ext[1]), span(q.ext[1])));
    list.sort((x, y) => Math.abs(dot(x.d, p.axes[1])) - Math.abs(dot(y.d, p.axes[1])));
    return list.slice(0, 1).map(({ j }) => j);
  }));
  for (const p of pieces) if (dot(p.axes[1], REF) < 0) { p.axes[1] = scale(p.axes[1], -1); p.ext[1] = [-p.ext[1][1], -p.ext[1][0]]; }
  const ends = (i, tones) => [TONES[tones[i]] - GRADIENT[tones[i]] / 2, TONES[tones[i]] + GRADIENT[tones[i]] / 2];
  const clash = (i, j, tones) => {
    const [a0, a1] = ends(i, tones);
    const [b0, b1] = ends(j, tones);
    return Math.abs(a1 - b0) < APART || Math.abs(b1 - a0) < APART;
  };
  const near = (i, j, tones) => touch[i].includes(j) && Math.abs(tones[i] - tones[j]) < 2;
  const bad = (i, tones) => beside[i].some((j) => clash(i, j, tones)) || touch[i].some((j) => near(i, j, tones));
  const clashes = (tones) => pieces.reduce((n, _, i) => n + beside[i].filter((j) => j > i && clash(i, j, tones)).length + touch[i].filter((j) => j > i && near(i, j, tones)).length, 0);
  const tones = pieces.map((_, k) => k % TONES.length).sort(() => R() - 0.5);
  let count = clashes(tones);
  for (let step = 0; step < 4000 && count; step++) {
    const wrong = pieces.map((_, i) => i).filter((i) => bad(i, tones));
    const i = wrong[Math.floor(R() * wrong.length)];
    const j = Math.floor(R() * pieces.length);
    [tones[i], tones[j]] = [tones[j], tones[i]];
    const after = clashes(tones);
    if (after <= count) count = after;
    else [tones[i], tones[j]] = [tones[j], tones[i]];
  }
  pieces.forEach((p, i) => { p.tone = tones[i]; });
}

function light(p, n, q, edges) {
  const facing = n[1] > 0.5 ? 0 : n[1] < -0.5 ? 2 * SIDE : SIDE;
  const c = edges && Math.abs(dot(n, p.axes[1])) > 0.7 ? -0.5
    : Math.min(0.5, Math.max(-0.5, (dot(q, p.axes[1]) - p.ext[1][0]) / (span(p.ext[1]) || 1) - 0.5));
  return TONES[p.tone] + GRADIENT[p.tone] * c - facing;
}

function cellUv(cell, l) {
  const v = Math.min(RANGE[1], Math.max(RANGE[0], l));
  return [(cell[0] * 32 + 16) / 512, (cell[1] * 128 + 0.5 + (1 - v) * 127) / 512];
}

function tone(file, options) {
  const glb = readGlb(file);
  const R = seeded(basename(file));
  const replaced = new Map();
  const jobs = [];
  let planks = 0;
  let woodArea = 0;
  let plankArea = 0;
  const report = [];
  for (const prim of editablePrimitives(glb.json)) {
    if (prim.attributes.TEXCOORD_0 === undefined) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const m = primitiveMatrix(glb.json, prim);
    const world = (v) => {
      const [x, y, z] = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
      return [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
    };
    const { weld } = welder(pos);
    const cellOf = (v) => [Math.floor(uv[v * 2] * 16), Math.floor(uv[v * 2 + 1] * 4)];
    const n = idx.length / 3;
    const at = { weld: [], corners: [], normal: [], area: [] };
    for (let t = 0; t < n; t++) {
      const c = [0, 1, 2].map((k) => idx[t * 3 + k]);
      at.weld[t] = c.map(weld);
      at.corners[t] = c.map(world);
      const x = cross(sub(at.corners[t][1], at.corners[t][0]), sub(at.corners[t][2], at.corners[t][0]));
      at.area[t] = Math.hypot(...x) / 2;
      at.normal[t] = norm(x);
    }
    for (const cell of options.only ? [options.only] : WOOD) {
      const tris = [];
      for (let t = 0; t < n; t++) {
        if ([0, 1, 2].every((k) => { const [cu, cv] = cellOf(idx[t * 3 + k]); return cu === cell[0] && cv === cell[1]; })) tris.push(t);
      }
      if (!tris.length) continue;
      const parent = new Map();
      const find = (a) => (parent.get(a) === a ? a : (parent.set(a, find(parent.get(a))), parent.get(a)));
      for (const t of tris) {
        const w = at.weld[t];
        for (const a of w) if (!parent.has(a)) parent.set(a, a);
        parent.set(find(w[1]), find(w[0]));
        parent.set(find(w[2]), find(w[0]));
      }
      const comps = new Map();
      for (const t of tris) {
        const r = find(at.weld[t][0]);
        if (!comps.has(r)) comps.set(r, []);
        comps.get(r).push(t);
      }
      const measure = (list) => {
        const f = frame(list.flatMap((t) => at.corners[t]));
        let square = 0;
        let area = 0;
        const face = [0, 0];
        for (const t of list) {
          area += at.area[t];
          if (f.axes.some((a) => Math.abs(dot(at.normal[t], a)) > 0.95)) square += at.area[t];
          const d = dot(at.normal[t], f.axes[2]);
          if (Math.abs(d) > 0.95) face[d > 0 ? 0 : 1] += at.area[t];
        }
        const [l, w] = f.ext.map(span);
        const filled = Math.max(...face) >= 0.4 * l * w;
        return { tris: list, ...f, plank: !list.rest && isPlank(f) && (isBoard(f) ? square >= 0.4 * area && filled : square >= 0.6 * area) };
      };
      const pieces = [...comps.values()].flatMap((c) => {
        const whole = measure(c);
        if (options.whole) return [{ ...whole, plank: options.force || isPlank(whole) }];
        const parts = splitStrips(c, at).map(measure);
        const size = (p) => p.tris.reduce((s, t) => s + at.area[t], 0);
        const split = parts.filter((p) => p.plank);
        if (whole.plank && (split.length < 2 || split.reduce((s, p) => s + size(p), 0) < 0.5 * size(whole))) return [whole];
        const slabs = splitSlabs(c, at).map(measure);
        const covered = (list) => list.filter((p) => p.plank).reduce((s, p) => s + size(p), 0);
        if (slabs.filter((p) => p.plank).length >= 2 && covered(slabs) > covered(parts)) return slabs;
        return parts;
      });
      const gap = (a, b) => Math.hypot(...[0, 1, 2].map((i) => Math.max(0, a.lo[i] - b.hi[i], b.lo[i] - a.hi[i])));
      const similar = (a, b) => {
        const wa = span(a.ext[1]);
        const wb = span(b.ext[1]);
        const close = (x, y) => Math.abs(x - y) <= 0.4 * Math.max(x, y);
        return Math.abs(dot(a.axes[0], b.axes[0])) > 0.95 && close(wa, wb);
      };
      const centre = (p) => p.lo.map((x, i) => (x + p.hi[i]) / 2);
      const beside = (p, q) => {
        const d = sub(centre(q), centre(p));
        const w = span(p.ext[1]);
        const lateral = Math.hypot(...sub(d, scale(p.axes[0], dot(d, p.axes[0]))));
        if (!isBoard(p)) return lateral >= 0.6 * span(p.ext[2]) && gap(p, q) <= 2 * w;
        return Math.abs(dot(d, p.axes[1])) >= 0.6 * w && Math.abs(dot(d, p.axes[2])) <= w && gap(p, q) <= 2 * w;
      };
      const candidates = pieces.filter((p) => p.plank);
      if (!options.force) for (const p of candidates.filter((q) => !isBoard(q))) {
        p.plank = candidates.some((q) => q !== p && (isBoard(q) || similar(p, q)) && Math.abs(dot(p.axes[0], q.axes[0])) > 0.95 && beside(p, q));
      }
      jobs.push({ prim, idx, uv, cell, pieces, world, normal: at.normal });
      planks += pieces.filter((p) => p.plank).length;
      for (const p of pieces) for (const t of p.tris) { woodArea += at.area[t]; if (p.plank) plankArea += at.area[t]; }
      report.push(`${Object.keys(BANDS).find((b) => BANDS[b] === cell.join(','))} ${pieces.length} pieces ${pieces.filter((p) => p.plank).length} planks`);
    }
  }
  const share = plankArea / (woodArea || 1);
  report.push(`share ${share.toFixed(2)}`);
  if (!options.force && (planks < options.min || share < options.share)) return `skip (${planks} planks; ${report.join(', ')})`;
  if (options.dry) return report.join(', ');
  const writes = new Map();
  for (const job of jobs) {
    let pieces = job.pieces.filter((p) => p.plank);
    const triArea = (t) => {
      const c = [0, 1, 2].map((k) => job.world(job.idx[t * 3 + k]));
      return Math.hypot(...cross(sub(c[1], c[0]), sub(c[2], c[0]))) / 2;
    };
    for (const p of pieces) p.area = p.tris.reduce((s, t) => s + triArea(t), 0);
    const median = pieces.map((p) => p.area).sort((a, b) => a - b)[pieces.length >> 1] || 0;
    const boxGap = (a, b) => Math.hypot(...[0, 1, 2].map((i) => Math.max(0, a.lo[i] - b.hi[i], b.lo[i] - a.hi[i])));
    for (const p of [...pieces].sort((a, b) => a.area - b.area)) {
      const rest = pieces.filter((q) => q !== p && q.area > p.area);
      if (p.area >= 0.1 * median || !rest.length) continue;
      const q = rest.reduce((a, b) => (boxGap(p, b) < boxGap(p, a) ? b : a));
      q.tris.push(...p.tris);
      q.area += p.area;
      pieces = pieces.filter((r) => r !== p);
    }
    const owner = new Map();
    for (const p of pieces) for (const t of p.tris) owner.set(t, p);
    const near = new Map([...owner.keys()].map((t) => [t, []]));
    const byEdge = new Map();
    const pointKey = (q) => q.map((x) => x.toFixed(4)).join(',');
    for (const t of owner.keys()) for (const [u, v] of [[0, 1], [1, 2], [2, 0]]) {
      const A = job.world(job.idx[t * 3 + u]);
      const B = job.world(job.idx[t * 3 + v]);
      const k = [pointKey(A), pointKey(B)].sort().join('|');
      if (!byEdge.has(k)) byEdge.set(k, { d: norm(sub(B, A)), list: [] });
      byEdge.get(k).list.push(t);
    }
    for (const { d, list } of byEdge.values()) if (list.length === 2 && dot(job.normal[list[0]], job.normal[list[1]]) > 0.85) {
      near.get(list[0]).push({ t: list[1], d });
      near.get(list[1]).push({ t: list[0], d });
    }
    for (let pass = 0; pass < 4; pass++) for (const [t, list] of near) {
      const p = owner.get(t);
      const diag = list.filter(({ t: u, d }) => owner.get(u) !== p && p.axes.every((a) => Math.abs(dot(d, a)) < 0.95));
      if (!diag.length) continue;
      const q = owner.get(diag[0].t);
      if (list.filter(({ t: u }) => owner.get(u) === q).length < list.filter(({ t: u }) => owner.get(u) === p).length) continue;
      p.tris.splice(p.tris.indexOf(t), 1);
      q.tris.push(t);
      owner.set(t, q);
    }
    const faceNormal = new Map();
    for (const t of owner.keys()) {
      if (faceNormal.has(t)) continue;
      const group = [t];
      for (let i = 0; i < group.length; i++) for (const { t: u } of near.get(group[i])) if (!group.includes(u) && owner.get(u) === owner.get(t)) group.push(u);
      const n = norm(group.reduce((s, u) => s.map((x, k) => x + job.normal[u][k] * triArea(u)), [0, 0, 0]));
      for (const u of group) faceNormal.set(u, n);
    }
    const to = options.band && options.band[0].join() === job.cell.join() ? options.band[1] : job.cell;
    if (to !== job.cell) {
      const moved = writes.get(job.prim) ?? new Map();
      writes.set(job.prim, moved);
      for (const p of job.pieces) if (!p.plank) for (const t of p.tris) for (let k = 0; k < 3; k++) {
        const v = job.idx[t * 3 + k];
        moved.set(t * 3 + k, [(to[0] * 32 + 16) / 512, (to[1] * 128 + job.uv[v * 2 + 1] * 512 - job.cell[1] * 128) / 512]);
      }
    }
    if (!pieces.length) continue;
    pickTones(pieces, R);
    const writesOf = writes.get(job.prim) ?? new Map();
    writes.set(job.prim, writesOf);
    const lightOf = new Map();
    for (const p of pieces) for (const t of p.tris) {
      const n = faceNormal.get(t);
      for (let k = 0; k < 3; k++) lightOf.set(t * 3 + k, light(p, n, job.world(job.idx[t * 3 + k]), options.edges));
    }
    for (const [c, l] of lightOf) writesOf.set(c, cellUv(to, l));
  }
  for (const [prim, corner] of writes) {
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const uvAccessor = glb.json.accessors[prim.attributes.TEXCOORD_0];
    if (uvAccessor.componentType !== 5126) throw new Error(`${file}: UVs are not float`);
    const adder = vertexAdder(glb, prim);
    const owner = new Map();
    for (let c = 0; c < idx.length; c++) if (!corner.has(c)) owner.set(idx[c], null);
    const inPlace = new Map();
    const copies = new Map();
    for (const [c, value] of corner) {
      const v = idx[c];
      const key = `${v}|${value[0].toFixed(6)},${value[1].toFixed(6)}`;
      if (copies.has(key)) { idx[c] = copies.get(key); continue; }
      if (!owner.has(v)) { inPlace.set(v, value); owner.set(v, key); copies.set(key, v); continue; }
      const copy = adder.add(v, { TEXCOORD_0: value });
      copies.set(key, copy);
      idx[c] = copy;
    }
    const view = glb.json.bufferViews[uvAccessor.bufferView];
    const start = (view.byteOffset ?? 0) + (uvAccessor.byteOffset ?? 0);
    const step = view.byteStride ?? 8;
    for (const [v, value] of inPlace) new Float32Array(glb.bin.buffer, glb.bin.byteOffset + start + v * step, 2).set(value);
    adder.commit(idx, replaced);
  }
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  return report.join(', ');
}

function clip(poly, n, d, keep) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = keep * (dot(a.w, n) - d);
    const sb = keep * (dot(b.w, n) - d);
    if (sa >= -1e-9) out.push(a);
    if ((sa > 1e-9 && sb < -1e-9) || (sa < -1e-9 && sb > 1e-9)) {
      const f = sa / (sa - sb);
      const mix = (x, y) => x.map((v, k) => v + (y[k] - v) * f);
      out.push({ w: mix(a.w, b.w), l: mix(a.l, b.l), n: norm(mix(a.n, b.n)), src: f < 0.5 ? a.src : b.src });
    }
  }
  return out;
}

function polyArea(poly) {
  let s = [0, 0, 0];
  for (let i = 1; i + 1 < poly.length; i++) s = s.map((v, k) => v + cross(sub(poly[i].w, poly[0].w), sub(poly[i + 1].w, poly[0].w))[k]);
  return Math.hypot(...s) / 2;
}

function floorTone(file, options) {
  const glb = readGlb(file);
  const R = seeded(basename(file));
  const replaced = new Map();
  const report = [];
  for (const prim of editablePrimitives(glb.json)) {
    if (prim.attributes.TEXCOORD_0 === undefined) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const nrm = prim.attributes.NORMAL === undefined ? null : readAccessor(glb, prim.attributes.NORMAL).data;
    const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const m = primitiveMatrix(glb.json, prim);
    const world = (v) => {
      const [x, y, z] = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
      return [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
    };
    const vert = (v) => ({ w: world(v), l: [0, 1, 2].map((k) => pos[v * 3 + k]), n: nrm ? [0, 1, 2].map((k) => nrm[v * 3 + k]) : [0, 1, 0], src: v });
    const { weld } = welder(pos);
    const cellOf = (v) => [Math.floor(uv[v * 2] * 16), Math.floor(uv[v * 2 + 1] * 4)];
    const n = idx.length / 3;
    const at = { weld: [], corners: [], normal: [], area: [] };
    for (let t = 0; t < n; t++) {
      const c = [0, 1, 2].map((k) => idx[t * 3 + k]);
      at.weld[t] = c.map(weld);
      at.corners[t] = c.map(world);
      const x = cross(sub(at.corners[t][1], at.corners[t][0]), sub(at.corners[t][2], at.corners[t][0]));
      at.area[t] = Math.hypot(...x) / 2;
      at.normal[t] = norm(x);
    }
    const out = [];
    const done = new Set();
    const extent = Math.hypot(...[0, 1, 2].map((k) => Math.max(...at.corners.flat().map((q) => q[k])) - Math.min(...at.corners.flat().map((q) => q[k]))));
    const tiny = 1e-8 * extent * extent;
    for (const cell of options.only ? [options.only] : WOOD) {
      const to = options.band && options.band[0].join() === cell.join() ? options.band[1] : cell;
      const tris = [];
      for (let t = 0; t < n; t++) {
        if (at.area[t] > 0 && [0, 1, 2].every((k) => { const [cu, cv] = cellOf(idx[t * 3 + k]); return cu === cell[0] && cv === cell[1]; })) tris.push(t);
      }
      if (!tris.length) continue;
      const shell = new Map();
      const root = (a) => (shell.get(a) === a ? a : (shell.set(a, root(shell.get(a))), shell.get(a)));
      for (const t of tris) for (const w of at.weld[t]) if (!shell.has(w)) shell.set(w, w);
      for (const t of tris) for (const w of at.weld[t]) shell.set(root(w), root(at.weld[t][0]));
      const top = tris.filter((t) => at.normal[t][1] > 0.3);
      const parent = new Map(top.map((t) => [t, t]));
      const find = (a) => (parent.get(a) === a ? a : (parent.set(a, find(parent.get(a))), parent.get(a)));
      const byEdge = new Map();
      for (const t of top) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
        const key = edgeKey(at.weld[t][a], at.weld[t][b]);
        if (!byEdge.has(key)) byEdge.set(key, []);
        byEdge.get(key).push(t);
      }
      for (const [key, list] of byEdge) {
        if (list.length !== 2) continue;
        const [a, b] = list;
        const ids = key.split(',').map(Number);
        const far = at.weld[b].findIndex((w) => !ids.includes(w));
        const rise = dot(at.normal[a], sub(at.corners[b][far], at.corners[a][at.weld[a].indexOf(ids[0])]));
        if (rise > 1e-6 && dot(at.normal[a], at.normal[b]) < Math.cos(Math.PI / 18)) continue;
        parent.set(find(b), find(a));
      }
      const groups = new Map();
      for (const t of top) { const r = find(t); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); }
      let boards = [...groups.values()].map((list) => {
        const f = frame(list.flatMap((t) => at.corners[t]));
        let long = norm([f.axes[0][0], 0, f.axes[0][2]]);
        if (Math.abs(long[0]) > Math.cos(Math.PI / 18)) long = [Math.sign(long[0]), 0, 0];
        else if (Math.abs(long[2]) > Math.cos(Math.PI / 18)) long = [0, 0, Math.sign(long[2])];
        const axes = [long, [-long[2], 0, long[0]], [0, 1, 0]];
        const ext = axes.map((a) => {
          const s = list.flatMap((t) => at.corners[t].map((q) => dot(q, a)));
          return [Math.min(...s), Math.max(...s)];
        });
        const foot = [0, 1].map((i) => ({ a: axes[i], lo: ext[i][0], hi: ext[i][1] }));
        return { tris: list, ...f, axes, ext, foot, shell: root(at.weld[list[0]][0]), area: list.reduce((s, t) => s + at.area[t], 0) };
      });
      const median = (list) => list.sort((a, b) => a - b)[list.length >> 1] || 0;
      const midArea = median(boards.map((b) => b.area));
      const midWidth = median(boards.map((b) => span([b.foot[1].lo, b.foot[1].hi])));
      const proj = (b, a) => { const q = b.tris.flatMap((u) => at.corners[u].map((p) => dot(p, a))); return [Math.min(...q), Math.max(...q)]; };
      const sep = (b, c) => {
        let best = null;
        for (const { a } of b.foot.concat(c.foot)) {
          const [x, y] = [proj(b, a), proj(c, a)];
          const [gap, d, sign] = y[0] - x[1] >= x[0] - y[1] ? [y[0] - x[1], (x[1] + y[0]) / 2, -1] : [x[0] - y[1], (y[1] + x[0]) / 2, 1];
          if (!best || gap > best.gap) best = { gap, a, d, sign };
        }
        return best;
      };
      const overlap = (b, c, shrink) => b.foot.concat(c.foot).every(({ a }) => {
        const [x, y] = [proj(b, a), proj(c, a)];
        return Math.min(x[1], y[1]) - Math.max(x[0], y[0]) > shrink;
      });
      boards = boards.filter((b) => b.area >= 0.1 * midArea && span([b.foot[1].lo, b.foot[1].hi]) >= 0.3 * midWidth
        && !boards.some((c) => c !== b && c.hi[1] > b.hi[1] + 1e-6 && overlap(b, c, 0.1 * midWidth)));
      const owned = new Map();
      for (const b of boards) for (const t of b.tris) owned.set(t, b);
      const shells = new Set(boards.map((b) => b.shell));
      const footDist = (b, pts) => {
        let d = 0;
        for (const { a, lo, hi } of b.foot) {
          const s = pts.map((q) => dot(q, a));
          d = Math.max(d, lo - Math.max(...s), Math.min(...s) - hi);
        }
        return Math.max(0, d);
      };
      const pointDist = (b, q) => Math.hypot(...b.foot.map(({ a, lo, hi }) => Math.max(0, lo - dot(q, a), dot(q, a) - hi)));
      const pieces = [];
      for (const t of tris) {
        const s = root(at.weld[t][0]);
        if (owned.has(t) || !shells.has(s)) continue;
        const local = boards.filter((b) => b.shell === s);
        const dist = local.map((b) => footDist(b, at.corners[t]));
        const near = Math.min(...dist);
        const cand = local.filter((_, i) => dist[i] <= near + 0.25 * midWidth);
        const whole = [0, 1, 2].map((k) => vert(idx[t * 3 + k]));
        const cells = cand.length < 2 ? [{ poly: whole, owner: cand[0] }] : cand.map((b) => {
          let poly = whole;
          for (const c of cand) if (c !== b && poly.length >= 3) {
            const { a, d, sign } = sep(b, c);
            const side = poly.map((q) => sign * (dot(q.w, a) - d));
            if (side.every((x) => x > -1e-9)) continue;
            poly = side.every((x) => x < 1e-9) ? [] : clip(poly, a, d, sign);
          }
          poly = poly.filter((q, k, list) => {
            const u = sub(q.w, list[(k + list.length - 1) % list.length].w);
            const v = sub(list[(k + 1) % list.length].w, q.w);
            return Math.hypot(...cross(u, v)) > 1e-4 * Math.hypot(...u) * Math.hypot(...v);
          });
          return { poly, owner: b };
        }).filter((c) => c.poly.length >= 3 && polyArea(c.poly) > tiny);
        if (at.area[t] - cells.reduce((sum, c) => sum + polyArea(c.poly), 0) > 1e-3 * at.area[t]) {
          let parts = [whole];
          for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) {
            const { a, d } = sep(cand[i], cand[j]);
            parts = parts.flatMap((poly) => {
              const side = poly.map((q) => dot(q.w, a) - d);
              if (side.every((x) => x > -1e-9) || side.every((x) => x < 1e-9)) return [poly];
              return [clip(poly, a, d, 1), clip(poly, a, d, -1)].filter((q) => q.length >= 3 && polyArea(q) > tiny);
            });
          }
          cells.length = 0;
          for (const poly of parts) {
            const mid = [0, 1, 2].map((k) => poly.reduce((sum, q) => sum + q.w[k], 0) / poly.length);
            cells.push({ poly, owner: cand.reduce((x, y) => (pointDist(y, mid) < pointDist(x, mid) - 1e-9 ? y : x)) });
          }
          const key = (q) => q.w.map((x) => x.toFixed(6)).join(',');
          const convex = (poly) => poly.every((q, k) => dot(cross(sub(poly[(k + 1) % poly.length].w, q.w), sub(poly[(k + 2) % poly.length].w, poly[(k + 1) % poly.length].w)), at.normal[t]) > -1e-12);
          for (let merged = true; merged;) {
            merged = false;
            for (let i = 0; i < cells.length && !merged; i++) for (let j = i + 1; j < cells.length && !merged; j++) {
              const [A, B] = [cells[i].poly, cells[j].poly];
              const shared = A.filter((q) => B.some((r) => key(r) === key(q)));
              if (cells[i].owner !== cells[j].owner || shared.length !== 2) continue;
              const x = A.findIndex((q, k) => key(q) === key(shared[0]) && key(A[(k + 1) % A.length]) === key(shared[1])) >= 0
                ? A.findIndex((q) => key(q) === key(shared[0])) : A.findIndex((q) => key(q) === key(shared[1]));
              if (key(A[(x + 1) % A.length]) !== key(shared[0]) && key(A[(x + 1) % A.length]) !== key(shared[1])) continue;
              const y = B.findIndex((q) => key(q) === key(A[(x + 1) % A.length]));
              if (key(B[(y + 1) % B.length]) !== key(A[x])) continue;
              const poly = [...A.slice(0, x + 1)];
              for (let k = 2; k < B.length; k++) poly.push(B[(y + k) % B.length]);
              poly.push(...A.slice(x + 1));
              if (!convex(poly)) continue;
              cells[i].poly = poly;
              cells.splice(j, 1);
              merged = true;
            }
          }
          for (const c of cells) c.poly = c.poly.filter((q, k, list) => {
            const u = sub(q.w, list[(k + list.length - 1) % list.length].w);
            const v = sub(list[(k + 1) % list.length].w, q.w);
            return Math.hypot(...cross(u, v)) > 1e-4 * Math.hypot(...u) * Math.hypot(...v);
          });
        }
        done.add(t);
        for (const c of cells) for (let k = 1; k + 1 < c.poly.length; k++) {
          const tri = [c.poly[0], c.poly[k], c.poly[k + 1]];
          if (polyArea(tri) > tiny) pieces.push({ owner: c.owner, tri, normal: at.normal[t] });
        }
      }
      for (const b of boards) for (const t of b.tris) { done.add(t); pieces.push({ owner: b, tri: [0, 1, 2].map((k) => vert(idx[t * 3 + k])), normal: at.normal[t] }); }
      if (!boards.length) continue;
      pickTones(boards, R, boards.map((b) => boards.map((c, j) => (c !== b && sep(b, c).gap <= 0.25 * midWidth ? j : -1)).filter((j) => j >= 0)));
      const facing = (n) => (n[1] > 0.3 && n[1] < Math.cos(Math.PI / 12) ? norm([n[0], 0, n[2]]) : n);
      out.push(...pieces.map((pc) => pc.tri.map((q) => ({ ...q, uv: cellUv(to, light(pc.owner, facing(pc.normal), q.w, options.edges)) }))));
      report.push(`${Object.keys(BANDS).find((b) => BANDS[b] === cell.join(','))} ${boards.length} boards, ${pieces.length - owned.size} pieces from ${done.size - owned.size} triangles`);
    }
    if (!out.length || options.dry) continue;
    const adder = vertexAdder(glb, prim);
    const used = new Map();
    for (let t = 0; t < n; t++) if (!done.has(t)) for (let k = 0; k < 3; k++) used.set(idx[t * 3 + k], null);
    const copies = new Map();
    const inPlace = new Map();
    const next = [];
    for (let t = 0; t < n; t++) if (!done.has(t)) next.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
    for (const tri of out) {
      const ids = tri.map((q) => {
      const original = q.src !== undefined && q.l.every((x, k) => Math.abs(x - pos[q.src * 3 + k]) < 1e-9);
      const key = `${q.l.map((x) => x.toFixed(6))}|${q.n.map((x) => x.toFixed(4))}|${q.uv.map((x) => x.toFixed(6))}`;
      if (copies.has(key)) return copies.get(key);
      let v;
      if (original && !used.has(q.src)) { v = q.src; used.set(v, key); inPlace.set(v, q.uv); }
      else v = adder.add(q.src, { POSITION: q.l, ...(nrm ? { NORMAL: q.n } : {}), TEXCOORD_0: q.uv });
      copies.set(key, v);
      return v;
      });
      if (new Set(ids).size === 3) next.push(...ids);
    }
    const uvAccessor = glb.json.accessors[prim.attributes.TEXCOORD_0];
    if (uvAccessor.componentType !== 5126) throw new Error(`${file}: UVs are not float`);
    const view = glb.json.bufferViews[uvAccessor.bufferView];
    const start = (view.byteOffset ?? 0) + (uvAccessor.byteOffset ?? 0);
    const step = view.byteStride ?? 8;
    for (const [v, value] of inPlace) new Float32Array(glb.bin.buffer, glb.bin.byteOffset + start + v * step, 2).set(value);
    adder.commit(next, replaced);
  }
  if (options.dry) return report.join(', ');
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  return report.join(', ');
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help')) {
  console.log(HELP);
  process.exit(argv.length ? 0 : 1);
}
const options = { min: 2, share: 0.25, dry: false, force: false, band: null, flat: 2, edges: true, only: null, whole: false };
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--dry' || argv[i] === '--force') options[argv[i].slice(2)] = true;
  else if (argv[i] === '--no-edges') options.edges = false;
  else if (argv[i] === '--whole') options.whole = true;
  else if (argv[i] === '--floor') options.floor = true;
  else if (argv[i] === '--only') options.only = BANDS[argv[++i]].split(',').map(Number);
  else if (argv[i] === '--band') options.band = argv[++i].split(':').map((b) => BANDS[b].split(',').map(Number));
  else if (argv[i].startsWith('--')) options[argv[i].slice(2)] = Number(argv[++i]);
  else files.push(argv[i]);
}
FLAT = Math.cos((options.flat * Math.PI) / 180);
for (const file of files) console.log(`${file}: ${(options.floor ? floorTone : tone)(file, options)}`);
