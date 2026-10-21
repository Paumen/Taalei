import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder, welder, primitiveMatrix, edgeKey } from './mesh-edit.mjs';

const HELP = `plank-tone.mjs [--dry] [--side <n>] [--min <n>] [--share <n>] [--band <from>:<to>] <workfile.glb> [...]

Gives each plank in the tan, camel and chestnut bands of kits/colormap.png its
own tone from a set of six, with a soft gradient across its width, so boards
read apart. Faces are lit from above: faces turned sideways are 0.2 darker,
faces turned down 0.3, and a board's narrow edges a little more. Neighbouring planks get tones far apart.
A piece is a run of triangles in one band that share corners. A piece that
holds two or more parallel flat strips (boards fused with grooves or steps)
is cut into one plank per strip; other pieces are cut where faces meet in an
inward fold. A file is left alone unless it has at least
--min (default 2) planks, boxy pieces that are boards (thinner than wide, longer than wide)
whose broad face fills their outline, or slats (three times longer than wide) lying edge to edge beside a like slat
or a board,
that hold at least --share (default 0.25) of its wood area. Only planks are
recoloured; other wood keeps its look.
--side sets how much darker a board's narrow edges are (default 0.1).
--band <from>:<to> moves all wood of one band into another.
--force tones every board and slat and skips the --min and --share check.
--dry reports without writing.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const WOOD = ['tan', 'camel', 'chestnut'].map((b) => BANDS[b].split(',').map(Number));
const TONES = [[0.581, 0.11], [0.477, 0.22], [0.747, 0.11], [0.691, 0.33], [0.809, 0.22], [0.526, 0.11]];
const FACING = { up: 0, side: 0.2, down: 0.3 };
const RANGE = [0.06, 0.94];
const REF = norm([0.3, 1, 0.5]);
const FLAT = Math.cos((2 * Math.PI) / 180);
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
    if (!best || area > best.area) best = { area, normal: group.normal, long, strips: aligned };
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
    if (hi - lo <= wide) for (const b of bins) {
      const w = span(b.across);
      if (along < b.long[0] - 0.5 * w || along > b.long[1] + 0.5 * w || up > b.height + 1e-6 || up < b.height - 2 * w) continue;
      const d = mid < b.across[0] ? b.across[0] - mid : mid > b.across[1] ? mid - b.across[1] : 0;
      if (d <= 0.5 * w && d < gap) { gap = d; pick = b; }
    }
    (pick ? pick.tris : base).push(...region.tris);
  }
  return [...bins.map((b) => b.tris), base].filter((list) => list.length);
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
    for (const cell of WOOD) {
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
      const pieces = [...comps.values()].flatMap((c) => splitStrips(c, at)).map((list) => {
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
        const filled = Math.max(...face) >= 0.6 * l * w;
        return { tris: list, ...f, plank: isPlank(f) && square >= 0.6 * area && (!isBoard(f) || filled) };
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
    const pieces = job.pieces.filter((p) => p.plank);
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
    const lo = [0, 1, 2].map((i) => Math.min(...pieces.map((p) => p.lo[i])));
    const hi = [0, 1, 2].map((i) => Math.max(...pieces.map((p) => p.hi[i])));
    const tol = 0.035 * Math.hypot(...sub(hi, lo));
    const gap = (a, b) => Math.hypot(...[0, 1, 2].map((i) => Math.max(0, a.lo[i] - b.hi[i], b.lo[i] - a.hi[i])));
    const near = pieces.map((p, i) => pieces.map((_, j) => j).filter((j) => j !== i && gap(p, pieces[j]) < tol));
    const bag = Array(TONES.length).fill(0);
    const used = Array(TONES.length).fill(0);
    const pool = [];
    while (pool.length < pieces.length) pool.push(...[...TONES.keys()].sort(() => R() - 0.5));
    pool.slice(0, pieces.length).forEach((k) => bag[k]++);
    for (const i of pieces.map((_, i) => i).sort(() => R() - 0.5)) {
      let best = 0;
      let score = -Infinity;
      for (let k = 0; k < TONES.length; k++) {
        if (used[k] >= bag[k]) continue;
        const d = near[i].filter((j) => pieces[j].tone !== undefined)
          .map((j) => Math.abs(TONES[k][0] - TONES[pieces[j].tone][0]) + 0.5 * Math.abs(TONES[k][1] - TONES[pieces[j].tone][1]));
        const s = (d.length ? Math.min(...d) : 1) * 10 + R() * 0.5;
        if (s > score) { score = s; best = k; }
      }
      pieces[i].tone = best;
      used[best]++;
    }
    const writesOf = writes.get(job.prim) ?? new Map();
    writes.set(job.prim, writesOf);
    const lightOf = new Map();
    for (const p of pieces) {
      if (dot(p.axes[1], REF) < 0) { p.axes[1] = scale(p.axes[1], -1); p.ext[1] = [-p.ext[1][1], -p.ext[1][0]]; }
      const [b, s] = TONES[p.tone];
      for (const t of p.tris) {
        const n = job.normal[t];
        const facing = n[1] > 0.5 ? FACING.up : n[1] < -0.5 ? FACING.down : FACING.side;
        const edge = isBoard(p) && Math.abs(dot(n, p.axes[2])) <= 0.7 ? options.side : 0;
        for (let k = 0; k < 3; k++) {
          const q = job.world(job.idx[t * 3 + k]);
          const c = (dot(q, p.axes[1]) - p.ext[1][0]) / (span(p.ext[1]) || 1) - 0.5;
          lightOf.set(t * 3 + k, (facing || edge ? b - s / 2 : b + s * c) - facing - edge);
        }
      }
    }
    for (const [c, l] of lightOf) {
      const v = Math.min(RANGE[1], Math.max(RANGE[0], l));
      writesOf.set(c, [(to[0] * 32 + 16) / 512, (to[1] * 128 + 0.5 + (1 - v) * 127) / 512]);
    }
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

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help')) {
  console.log(HELP);
  process.exit(argv.length ? 0 : 1);
}
const options = { side: 0.1, min: 2, share: 0.25, dry: false, force: false, band: null };
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--dry' || argv[i] === '--force') options[argv[i].slice(2)] = true;
  else if (argv[i] === '--band') options.band = argv[++i].split(':').map((b) => BANDS[b].split(',').map(Number));
  else if (argv[i].startsWith('--')) options[argv[i].slice(2)] = Number(argv[++i]);
  else files.push(argv[i]);
}
for (const file of files) console.log(`${file}: ${tone(file, options)}`);
