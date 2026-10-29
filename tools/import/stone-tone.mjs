import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder, welder, primitiveMatrix } from './mesh-edit.mjs';

const HELP = `stone-tone.mjs [--dry] [--debug] [--band <from>:<to>] [--only <band>] <workfile.glb> [...]

Gives each stone in the ivory, taupe and taupe-dark bands of kits/colormap.png
its own tone from a fixed set of six, shuffled with no regard to neighbours.
A stone is a run of triangles in one band that share corners, cut apart where
its faces meet in an inward fold (grooves, notches, steps) or where its colour jumps
between faces less than 45 degrees apart (painted stones). A part under a tenth of the median stone
joins the stone it shares the longest edge with.
Each stone is lighter at its top and darker at its bottom; a flat stone (lower
than a quarter of its width) has no gradient. Faces turned sideways are
darker than faces turned up, faces turned down darker still.
--band <from>:<to> moves stone in another band into a stone band first, such
as red brick: --band terracotta:taupe.
--only <band> tones only that band.
--debug writes each stone in its own bright colour instead of its tone.
--dry reports without writing.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const cellOf = (b) => BANDS[b].split(',').map(Number);
const STONE = ['ivory', 'taupe', 'taupe-dark'];
const TONES = [0.44, 0.48, 0.52, 0.56, 0.6, 0.64];
const GRADIENT = 0.26;
const SIDE = 0.08;
const RANGE = [0.06, 0.94];
const FOLD = Math.cos((10 * Math.PI) / 180);
const FLAT = Math.cos((2 * Math.PI) / 180);
const SEAM = 0.03;
const DEBUG = [[5, 0], [1, 1], [4, 2], [6, 0], [3, 1], [13, 3], [8, 0], [6, 1], [5, 2]];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };

function seeded(text) {
  let seed = 1;
  for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

const oldLight = (uv, v, cell) => 1 - (uv[v * 2 + 1] * 512 - cell[1] * 128 - 0.5) / 127;
const cellUv = (cell, l) => [(cell[0] * 32 + 16) / 512, (cell[1] * 128 + 0.5 + (1 - Math.min(RANGE[1], Math.max(RANGE[0], l))) * 127) / 512];

function stones(tris, at, light) {
  const parent = new Map(tris.map((t) => [t, t]));
  const find = (a) => (parent.get(a) === a ? a : (parent.set(a, find(parent.get(a))), parent.get(a)));
  const byEdge = new Map();
  for (const t of tris) for (let k = 0; k < 3; k++) {
    const a = at.weld[t][k];
    const b = at.weld[t][(k + 1) % 3];
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (!byEdge.has(key)) byEdge.set(key, []);
    byEdge.get(key).push({ t, a: k, b: (k + 1) % 3 });
  }
  const shared = [];
  for (const list of byEdge.values()) {
    if (list.length !== 2) continue;
    const [p, q] = list;
    const np = at.normal[p.t];
    const nq = at.normal[q.t];
    const d = dot(np, nq);
    const far = at.corners[q.t][[0, 1, 2].find((k) => k !== q.a && k !== q.b)];
    const rise = dot(np, sub(far, at.corners[p.t][p.a]));
    const fold = d < FOLD && rise > 1e-7;
    const atP = (w) => light.get(p.t)[at.weld[p.t].indexOf(w)];
    const atQ = (w) => light.get(q.t)[at.weld[q.t].indexOf(w)];
    const ends = [at.weld[p.t][p.a], at.weld[p.t][p.b]];
    const seam = d > FLAT && ends.some((w) => Math.abs(atP(w) - atQ(w)) > SEAM);
    const len = Math.hypot(...sub(at.corners[p.t][p.a], at.corners[p.t][p.b]));
    shared.push({ p: p.t, q: q.t, len, cut: fold || seam });
    if (!fold && !seam) parent.set(find(p.t), find(q.t));
  }
  const groups = new Map();
  for (const t of tris) { const r = find(t); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); }
  const area = (list) => list.reduce((s, t) => s + at.area[t], 0);
  let parts = [...groups.values()].flatMap((list) => fused(list, shared, at, area));
  const median = parts.map(area).sort((a, b) => a - b)[parts.length >> 1] || 0;
  for (let changed = true; changed;) {
    changed = false;
    const owner = new Map();
    parts.forEach((p, i) => p.forEach((t) => owner.set(t, i)));
    const small = parts.map((p, i) => [i, area(p)]).filter(([, a]) => a < 0.1 * median).sort((x, y) => x[1] - y[1]);
    for (const [i] of small) {
      const border = new Map();
      for (const e of shared) {
        const [a, b] = [owner.get(e.p), owner.get(e.q)];
        if (a === b) continue;
        if (a === i) border.set(b, (border.get(b) ?? 0) + e.len);
        if (b === i) border.set(a, (border.get(a) ?? 0) + e.len);
      }
      if (!border.size) continue;
      const to = [...border].sort((x, y) => y[1] - x[1])[0][0];
      parts[to].push(...parts[i]);
      parts[i] = [];
      changed = true;
      break;
    }
    parts = parts.filter((p) => p.length);
  }
  return parts;
}

function fused(list, shared, at, area) {
  const inside = new Set(list);
  const edges = shared.filter((e) => !e.cut && inside.has(e.p) && inside.has(e.q));
  const parent = new Map(list.map((t) => [t, t]));
  const find = (a) => (parent.get(a) === a ? a : (parent.set(a, find(parent.get(a))), parent.get(a)));
  for (const e of edges) if (dot(at.normal[e.p], at.normal[e.q]) > FOLD) parent.set(find(e.p), find(e.q));
  const faces = new Map();
  for (const t of list) { const r = find(t); if (!faces.has(r)) faces.set(r, []); faces.get(r).push(t); }
  const total = area(list);
  const info = [...faces.values()].map((tris) => ({ tris, area: area(tris), n: norm(tris.reduce((s, t) => s.map((x, k) => x + at.normal[t][k] * at.area[t]), [0, 0, 0])) }));
  const big = info.filter((f) => f.area >= 0.02 * total);
  const corners = info.map((f) => new Set(f.tris.flatMap((t) => at.weld[t])));
  const apart = (f, g) => { const b = corners[info.indexOf(g)]; return ![...corners[info.indexOf(f)]].some((w) => b.has(w)); };
  const fusedDir = big.filter((f) => big.filter((g) => g !== f && dot(f.n, g.n) > 0.99 && apart(f, g)).length >= 2);
  if (fusedDir.length < 3) return [list];
  const front = fusedDir.reduce((s, f) => s + f.area, 0);
  const seeds = big.filter((f) => fusedDir.includes(f) || f.area >= 0.5 * front);
  const owner = new Map();
  const queue = [];
  seeds.forEach((f, i) => f.tris.forEach((t) => { owner.set(t, i); queue.push(t); }));
  const near = new Map(list.map((t) => [t, []]));
  for (const e of edges) { near.get(e.p).push(e.q); near.get(e.q).push(e.p); }
  for (let i = 0; i < queue.length; i++) for (const u of near.get(queue[i])) if (!owner.has(u)) { owner.set(u, owner.get(queue[i])); queue.push(u); }
  for (const f of info) {
    if (seeds.includes(f)) continue;
    const share = new Map();
    for (const t of f.tris) if (owner.has(t)) share.set(owner.get(t), (share.get(owner.get(t)) ?? 0) + at.area[t]);
    if (!share.size) continue;
    const best = [...share].sort((x, y) => y[1] - x[1])[0][0];
    for (const t of f.tris) owner.set(t, best);
  }
  const out = seeds.map(() => []);
  const rest = [];
  for (const t of list) (owner.has(t) ? out[owner.get(t)] : rest).push(t);
  if (rest.length) out.push(rest);
  return out.filter((o) => o.length);
}

function tone(file, options) {
  const glb = readGlb(file);
  const R = seeded(basename(file));
  const replaced = new Map();
  const report = [];
  const cells = (options.only ? [options.only] : STONE).map(cellOf);
  if (options.band) cells.push(options.band[0]);
  for (const prim of editablePrimitives(glb.json)) {
    if (prim.attributes.TEXCOORD_0 === undefined) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const m = primitiveMatrix(glb.json, prim);
    const world = (v) => [0, 1, 2].map((r) => m[r] * pos[v * 3] + m[4 + r] * pos[v * 3 + 1] + m[8 + r] * pos[v * 3 + 2] + m[12 + r]);
    const { weld } = welder(pos);
    const cellAt = (v) => [Math.floor(uv[v * 2] * 16), Math.floor(uv[v * 2 + 1] * 4)];
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
    const writes = new Map();
    for (const cell of cells) {
      const tris = [];
      for (let t = 0; t < n; t++) if (at.area[t] > 0 && [0, 1, 2].every((k) => cellAt(idx[t * 3 + k]).join() === cell.join())) tris.push(t);
      if (!tris.length) continue;
      const light = new Map(tris.map((t) => [t, [0, 1, 2].map((k) => oldLight(uv, idx[t * 3 + k], cell))]));
      const found = stones(tris, at, light);
      const to = options.band && options.band[0].join() === cell.join() ? options.band[1] : cell;
      const off = Math.floor(R() * TONES.length);
      const tones = found.map((_, k) => (k + off) % TONES.length).sort(() => R() - 0.5);
      found.forEach((list, i) => {
        const pts = list.flatMap((t) => at.corners[t]);
        const lo = [0, 1, 2].map((k) => Math.min(...pts.map((q) => q[k])));
        const hi = [0, 1, 2].map((k) => Math.max(...pts.map((q) => q[k])));
        const height = hi[1] - lo[1];
        const flat = height < 0.25 * Math.max(hi[0] - lo[0], hi[2] - lo[2]);
        for (const t of list) {
          const nm = at.normal[t];
          const facing = nm[1] > 0.95 ? 0 : nm[1] < -0.5 ? 2 * SIDE : SIDE;
          for (let k = 0; k < 3; k++) {
            const y = at.corners[t][k][1];
            const c = flat ? 0 : height > 1e-9 ? (y - lo[1]) / height - 0.5 : 0;
            const l = TONES[tones[i]] + GRADIENT * c - facing;
            writes.set(t * 3 + k, options.debug ? cellUv(DEBUG[i % DEBUG.length], i % 18 < 9 ? 0.75 : 0.3) : cellUv(to, l));
          }
        }
      });
      report.push(`${Object.keys(BANDS).find((b) => BANDS[b] === cell.join(','))} ${found.length} stones`);
    }
    if (options.dry || !writes.size) continue;
    const uvAccessor = glb.json.accessors[prim.attributes.TEXCOORD_0];
    if (uvAccessor.componentType !== 5126) throw new Error(`${file}: UVs are not float`);
    const adder = vertexAdder(glb, prim);
    const owner = new Map();
    for (let c = 0; c < idx.length; c++) if (!writes.has(c)) owner.set(idx[c], null);
    const inPlace = new Map();
    const copies = new Map();
    for (const [c, value] of writes) {
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
  if (!options.dry) {
    repack(glb, replaced);
    fixBounds(glb);
    writeGlb(file, glb.json, glb.bin, writeFileSync);
  }
  return report.join(', ') || 'no stone';
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help')) {
  console.log(HELP);
  process.exit(argv.length ? 0 : 1);
}
const options = {};
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--dry' || argv[i] === '--debug') options[argv[i].slice(2)] = true;
  else if (argv[i] === '--band') options.band = argv[++i].split(':').map(cellOf);
  else if (argv[i] === '--only') options.only = argv[++i];
  else files.push(argv[i]);
}
for (const file of files) console.log(`${file}: ${tone(file, options)}`);
