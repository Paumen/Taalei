import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder, welder, primitiveMatrix, edgeKey, sub, dot, cross } from './mesh-edit.mjs';

const HELP = `stone-tone.mjs [--random] [--spread <v>] [--bands <a,b>] [--no-wall] [--debug] [--dry] [--report] <workfile.glb> [...]

Gives each stone of a masonry model its own tone inside its band, lighter on
top, mid on its sides and darkest underneath, and the whole model lighter at
the top than at the base. A stone is a block in the mesh (a piece of its own,
or a bump parted from its piece at an inward fold), or a patch painted lighter
or darker on a flat face. A piece with neither is one stone: it keeps its own
light and dark and gets the top-to-bottom order; several such pieces (a
pillar's base, shaft and cap; steps) differ a little from each other.
Painted detail inside a stone (cracks, chips) stays, at half strength.

Tones come from where a stone sits and how big it is (bigger a touch darker),
so neighbours differ and no run repeats; --random shuffles a seeded set
instead, as plank-tone does.
--spread <v>   how far apart stone tones lie, in band units (default 0.22).
--bands <a,b>  bands to tone (default taupe,taupe-dark,ivory).
--no-wall      no model-wide top-to-bottom gradient.
--debug        each stone in its own bright colour.
--report       print the stones found per band and write nothing.
--dry          report only.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const RANGE = [0.06, 0.94];
const FLAT = Math.cos((2 * Math.PI) / 180);
const FOLD = Math.cos((8 * Math.PI) / 180);
const FACING = { top: 0.07, side: 0, under: -0.14 };
const WALL = 0.06;
const DETAIL = 0.5;
const PIECE_SPREAD = 0.35;
const DEBUG = [[5, 0], [1, 1], [4, 2], [6, 0], [3, 1], [13, 3], [8, 0], [6, 1], [5, 2], [2, 0], [0, 0]];

const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const hash = (c) => {
  const s = Math.sin(Math.round(c[0] * 1000) * 12.9898 + Math.round(c[1] * 1000) * 78.233 + Math.round(c[2] * 1000) * 37.719) * 43758.5453;
  return s - Math.floor(s);
};
function seeded(text) {
  let seed = 1;
  for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

const oldLight = (uv, v, cell) => 1 - (uv[v * 2 + 1] * 512 - cell[1] * 128 - 0.5) / 127;
const cellUv = (cell, l) => [(cell[0] * 32 + 16) / 512, (cell[1] * 128 + 0.5 + (1 - clamp(l, RANGE[0], RANGE[1])) * 127) / 512];

function union(items) {
  const parent = new Map(items.map((t) => [t, t]));
  const find = (a) => (parent.get(a) === a ? a : (parent.set(a, find(parent.get(a))), parent.get(a)));
  return { join: (a, b) => parent.set(find(b), find(a)), groups: () => {
    const g = new Map();
    for (const t of items) { const r = find(t); if (!g.has(r)) g.set(r, []); g.get(r).push(t); }
    return [...g.values()];
  } };
}

function edges(tris, at) {
  const byEdge = new Map();
  for (const t of tris) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
    const key = edgeKey(at.weld[t][a], at.weld[t][b]);
    if (!byEdge.has(key)) byEdge.set(key, []);
    byEdge.get(key).push(t);
  }
  return byEdge;
}

function splitConcave(tris, at) {
  const u = union(tris);
  for (const [key, list] of edges(tris, at)) {
    if (list.length !== 2) continue;
    const [a, b] = list;
    const ids = key.split(',').map(Number);
    const far = at.weld[b].findIndex((w) => !ids.includes(w));
    const rise = dot(at.normal[a], sub(at.corners[b][far], at.corners[a][at.weld[a].indexOf(ids[0])]));
    if (rise > 1e-7 && dot(at.normal[a], at.normal[b]) < FOLD) continue;
    u.join(a, b);
  }
  return u.groups();
}

function flatFaces(tris, at) {
  const u = union(tris);
  for (const list of edges(tris, at).values()) for (let i = 1; i < list.length; i++) {
    if (dot(at.normal[list[0]], at.normal[list[i]]) > FLAT) u.join(list[0], list[i]);
  }
  return u.groups();
}

function lightPatches(face, at) {
  const u = union(face);
  const lightAt = (t, w) => at.cornerLight[t][at.weld[t].indexOf(w)];
  for (const [key, list] of edges(face, at)) for (let i = 1; i < list.length; i++) {
    const ids = key.split(',').map(Number);
    if (ids.every((w) => Math.abs(lightAt(list[0], w) - lightAt(list[i], w)) < 0.02)) u.join(list[0], list[i]);
  }
  return u.groups();
}

function splitSteps(chunk, at) {
  const area = (list) => list.reduce((s, t) => s + at.area[t], 0);
  const faces = flatFaces(chunk, at).map((f) => {
    const ys = f.flatMap((t) => at.corners[t].map((q) => q[1]));
    const a = area(f);
    return { tris: f, area: a, n: norm(f.reduce((s, t) => s.map((x, i) => x + at.normal[t][i] * at.area[t]), [0, 0, 0])), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  const tops = faces.filter((f) => f.n[1] > 0.9);
  const big = tops.map((f) => f.area).sort((a, b) => a - b)[tops.length >> 1] || 0;
  const treads = tops.filter((f) => f.area >= 0.2 * big).sort((a, b) => a.y1 - b.y1);
  const levels = [];
  for (const f of treads) if (!levels.length || f.y1 - levels[levels.length - 1] > 0.01) levels.push(f.y1);
  if (levels.length < 3) return null;
  const rise = Math.min(...levels.slice(1).map((y, i) => y - levels[i]));
  const steps = levels.map(() => []);
  const base = [];
  for (const f of faces) {
    const k = levels.findIndex((h) => Math.abs(h - f.y1) < 0.01);
    const riser = Math.abs(f.n[1]) < 0.5 && f.y1 - f.y0 <= rise * 1.1 + 0.01;
    if (k >= 0 && (treads.includes(f) || riser)) steps[k].push(...f.tris);
    else base.push(...f.tris);
  }
  return { steps: steps.filter((s) => s.length), base };
}

const BEVEL = Math.cos((45 * Math.PI) / 180);

function facetStones(chunk, at) {
  const area = (list) => list.reduce((s, t) => s + at.area[t], 0);
  const faces = flatFaces(chunk, at).map((tris) => ({ tris, area: area(tris), n: norm(tris.reduce((s, t) => s.map((x, i) => x + at.normal[t][i] * at.area[t]), [0, 0, 0])) }));
  const faceOf = new Map();
  faces.forEach((f) => f.tris.forEach((t) => faceOf.set(t, f)));
  const groups = [];
  for (const f of faces) {
    const g = groups.find((q) => dot(q.n, f.n) > 0.98);
    if (g) g.faces.push(f);
    else groups.push({ n: f.n, faces: [f] });
  }
  const seeds = new Set();
  const largest = Math.max(...groups.map((g) => area(g.faces.flatMap((f) => f.tris))));
  for (const g of groups) {
    if (area(g.faces.flatMap((f) => f.tris)) < 0.3 * largest) continue;
    const sizes = g.faces.map((f) => f.area).sort((a, b) => a - b);
    const big = g.faces.filter((f) => f.area >= 0.2 * sizes[sizes.length >> 1]);
    if (big.length >= 3) big.forEach((f) => seeds.add(f));
  }
  if (!seeds.size) return null;
  const owner = new Map();
  for (const f of seeds) for (const t of f.tris) owner.set(t, f);
  const links = [];
  for (const [key, list] of edges(chunk, at)) {
    if (list.length !== 2) continue;
    const ids = key.split(',').map(Number);
    for (const [a, b] of [[list[0], list[1]], [list[1], list[0]]]) {
      if (seeds.has(faceOf.get(b))) continue;
      const far = at.weld[b].findIndex((w) => !ids.includes(w));
      const rise = dot(at.normal[a], sub(at.corners[b][far], at.corners[a][at.weld[a].indexOf(ids[0])]));
      if (rise <= 1e-7) links.push([a, b]);
    }
  }
  const grown = new Map([...seeds].map((s) => [s, []]));
  for (let pass = 0; pass < 3; pass++) for (const [a, b] of links) {
    const s = owner.get(a);
    if (!s || owner.has(b) || dot(s.n, at.normal[b]) < BEVEL) continue;
    owner.set(b, s);
    grown.get(s).push(b);
  }
  const stones = [...grown].filter(([, list]) => list.length).map(([s, list]) => [...s.tris, ...list]);
  if (stones.length < 3) return null;
  const used = new Set(stones.flat());
  return { stones, rest: faces.map((f) => f.tris.filter((t) => !used.has(t))).filter((f) => f.length) };
}

function stonesOf(piece, at) {
  const area = (list) => list.reduce((s, t) => s + at.area[t], 0);
  let chunks = splitConcave(piece, at);
  if (chunks.length === 1) {
    const s = splitSteps(piece, at);
    if (s) return { stones: s.steps.map((tris) => ({ tris, block: true })), base: s.base };
  }
  const total = area(piece);
  const median = chunks.map(area).sort((a, b) => a - b)[chunks.length >> 1];
  let blocks = chunks.filter((c) => area(c) >= 0.15 * median);
  const rest = chunks.filter((c) => !blocks.includes(c)).flat();
  const stones = [];
  const base = [];
  for (const chunk of blocks) {
    const facets = blocks.length < 3 ? facetStones(chunk, at) : null;
    const faces = facets ? facets.rest : flatFaces(chunk, at);
    const own = [];
    if (facets) stones.push(...facets.stones.map((tris) => ({ tris, block: true })));
    for (const face of faces) {
      const patches = lightPatches(face, at);
      if (patches.length < 2) { own.push(...face); continue; }
      const fa = area(face);
      const big = patches.reduce((a, b) => (area(b) > area(a) ? b : a));
      for (const p of patches) {
        if (p !== big && area(p) < 0.6 * fa && area(p) > 0.002 * total) stones.push({ tris: p, painted: true });
        else own.push(...p);
      }
    }
    if (blocks.length > 1) stones.push({ tris: own, block: true });
    else base.push(...own);
  }
  const near = (list) => {
    const c = centre(list, at);
    return [...stones, ...(base.length ? [{ tris: base }] : [])].reduce((a, b) => (!a || dist(c, b) < dist(c, a) ? b : a), null);
  };
  const dist = (c, s) => Math.hypot(...sub(c, centre(s.tris, at)));
  for (const t of rest) { const s = near([t]); if (s) s.tris.push(t); else base.push(t); }
  return { stones, base };
}

function centre(list, at) {
  const a = list.reduce((s, t) => s + at.area[t], 0) || 1;
  return [0, 1, 2].map((i) => list.reduce((s, t) => s + at.mid[t][i] * at.area[t], 0) / a);
}

function tone(file, options) {
  const glb = readGlb(file);
  const R = seeded(basename(file));
  const replaced = new Map();
  const report = [];
  let found = 0;
  const writes = [];
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
    const corner = new Map();
    for (const cell of options.bands) {
      const at = { weld: [], corners: [], normal: [], area: [], mid: [], light: [], cornerLight: [] };
      const tris = [];
      for (let t = 0; t < n; t++) {
        const c = [0, 1, 2].map((k) => idx[t * 3 + k]);
        if (!c.every((v) => { const [cu, cv] = cellOf(v); return cu === cell[0] && cv === cell[1]; })) continue;
        at.weld[t] = c.map(weld);
        at.corners[t] = c.map(world);
        const x = cross(sub(at.corners[t][1], at.corners[t][0]), sub(at.corners[t][2], at.corners[t][0]));
        at.area[t] = Math.hypot(...x) / 2;
        if (at.area[t] <= 0) continue;
        at.normal[t] = norm(x);
        at.mid[t] = [0, 1, 2].map((i) => (at.corners[t][0][i] + at.corners[t][1][i] + at.corners[t][2][i]) / 3);
        at.cornerLight[t] = c.map((v) => oldLight(uv, v, cell));
        at.light[t] = mean(at.cornerLight[t]);
        tris.push(t);
      }
      if (!tris.length) continue;
      const u = union(tris);
      for (const t of tris) { u.join(t, t); }
      const byVertex = new Map();
      for (const t of tris) for (const w of at.weld[t]) { if (byVertex.has(w)) u.join(byVertex.get(w), t); else byVertex.set(w, t); }
      const pieces = u.groups();
      const stones = [];
      const plain = [];
      const area = (list) => list.reduce((s, t) => s + at.area[t], 0);
      const median = pieces.map(area).sort((a, b) => a - b)[pieces.length >> 1];
      const loose = pieces.filter((p) => area(p) >= 0.15 * median).length >= 3;
      for (const piece of pieces) {
        const { stones: s, base } = stonesOf(piece, at);
        stones.push(...s);
        if (base.length) (loose ? stones : plain).push({ tris: base, plain: !loose, block: loose });
      }
      const ys = tris.flatMap((t) => at.corners[t].map((q) => q[1]));
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      const all = [...stones, ...plain];
      for (const s of all) {
        s.c = centre(s.tris, at);
        s.area = s.tris.reduce((sum, t) => sum + at.area[t], 0);
        s.old = mean(s.tris.map((t) => at.light[t]));
      }
      const areas = all.map((s) => s.area).sort((a, b) => a - b);
      const medianArea = areas[areas.length >> 1] || 1;
      const spread = options.spread;
      if (options.random) {
        const k = all.length;
        const set = all.map((_, i) => (k > 1 ? i / (k - 1) - 0.5 : 0)).sort(() => R() - 0.5);
        all.forEach((s, i) => { s.tone = set[i] * spread; });
      } else for (const s of all) {
        const size = clamp(-Math.log(s.area / medianArea) * 0.08, -0.25, 0.25);
        s.tone = (0.75 * (hash(s.c) - 0.5) + 0.25 * size) * spread;
      }
      for (const s of plain) s.tone *= stones.length ? 1 : PIECE_SPREAD;
      const bandName = Object.keys(BANDS).find((b) => BANDS[b] === cell.join(','));
      report.push(`${bandName}: ${pieces.length} pieces, ${stones.filter((s) => s.block).length} blocks, ${stones.filter((s) => s.painted).length} painted, ${plain.length} plain`);
      found += stones.length;
      const faceOf = new Map();
      for (const s of all) for (const face of flatFaces(s.tris, at)) {
        const nn = norm(face.reduce((acc, t) => acc.map((x, k) => x + at.normal[t][k] * at.area[t]), [0, 0, 0]));
        for (const t of face) faceOf.set(t, nn);
      }
      const anchor = stones.length ? 0.5 : 0.5;
      all.forEach((s, si) => {
        const ny = (q) => (y1 > y0 ? (q[1] - y0) / (y1 - y0) : 0.5);
        const wall = options.wall ? WALL * (ny(s.c) - 0.5) * 2 : 0;
        const basis = s.plain ? s.old : clamp(s.old, 0.35, 0.65) * 0.5 + anchor * 0.5;
        for (const t of s.tris) {
          const nn = faceOf.get(t);
          const facing = nn[1] > 0.5 ? FACING.top * Math.min(1, (nn[1] - 0.5) * 2 + 0.5) : nn[1] < -0.3 ? FACING.under : FACING.side + nn[1] * 0.06;
          for (let k = 0; k < 3; k++) {
            const v = idx[t * 3 + k];
            const detail = clamp(DETAIL * (oldLight(uv, v, cell) - s.old), -0.15, 0.15);
            let l = basis + s.tone + facing + wall + detail;
            if (options.debug) corner.set(t * 3 + k, cellUv(DEBUG[si % DEBUG.length], si % 22 < 11 ? 0.75 : 0.3));
            else corner.set(t * 3 + k, cellUv(cell, l));
          }
        }
      });
    }
    if (corner.size) writes.push({ prim, corner });
  }
  if (options.dry || options.report) return report.join('; ');
  for (const { prim, corner } of writes) {
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
  return `${report.join('; ')} (${found} stones)`;
}

const args = process.argv.slice(2);
const options = { bands: ['taupe', 'taupe-dark', 'ivory'], spread: 0.22, wall: true };
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--random') options.random = true;
  else if (a === '--spread') options.spread = Number(args[++i]);
  else if (a === '--bands') options.bands = args[++i].split(',');
  else if (a === '--no-wall') options.wall = false;
  else if (a === '--debug') options.debug = true;
  else if (a === '--dry') options.dry = true;
  else if (a === '--report') options.report = true;
  else if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
  else files.push(a);
}
if (!files.length) { console.log(HELP); process.exit(1); }
options.bands = options.bands.map((b) => BANDS[b].split(',').map(Number));
for (const f of files) console.log(`${f}: ${tone(f, options)}`);
