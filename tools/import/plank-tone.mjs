import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { editablePrimitives, welder, vertexAdder, repack, fixBounds } from './mesh-edit.mjs';

const HELP = `plank-tone.mjs [--strength <n>] [--only <band,...>] [--band <from>:<to>] [--big <n>] [--gradient <n>] [--span <n>] [--across <n>] [--flat <deg>] [--whole] [--join] [--steps] [--rows <h>] <workfile.glb> [...]

Gives each board in the tan, camel and chestnut bands of the colormap one of
six tones, picked at random. The tones are spread evenly over a range of
2 x strength (default 0.25) lightness around the band's average, kept inside
the cell, so no two tones come out the same. Each board keeps its own
gradient, flattened only where it would leave the cell.
A board is a run of triangles that share corners. A run that holds two or
more flat faces facing the same way (boards fused with grooves or steps) is
cut into one board per face; faces under --big (default 0.1) of its largest
face join the nearest board. Faces of one board split by a gap or hole stay
one board. Corners shared by two boards are doubled so each keeps its tone.
--band <from>:<to> first moves all wood of one band into another.
--flat <deg> (default 2.56) is how far faces may turn and still count as one flat face.
--whole keeps each run of joined triangles as one board, for boards built
from several strips.
--gradient <n> (default 1) scales each board's gradient; 0 gives one even tone.
--span <n> (default 1) caps each board's gradient to n of the cell's range.
--across <n> replaces each board's gradient with one of n running across its
width, light on the same side for every board.
--join gives one tone to board pieces that line up as one board cut by a
door, window or gap.
--steps cuts a staircase built as one piece into steps: each tread with
its front edge and the riser below it is one board; faces that span
several steps, like a solid side, keep their colours.
--rows <h> cuts a wall built as one piece into rows of height h from the
floor, one board per row, for log or plank walls.
--only tones only the listed bands.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const WOOD = ['tan', 'camel', 'chestnut'].map((b) => [b, BANDS[b].split(',').map(Number)]);
const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help')) { console.log(HELP); process.exit(0); }
const opt = (name, def) => { const i = argv.indexOf(name); if (i < 0) return def; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const strength = opt('--strength', '0.25');
const only = opt('--only', '');
const move = opt('--band', '');
const BIG = Number(opt('--big', '0.1'));
const GRAD = Number(opt('--gradient', '1'));
const SPAN = Number(opt('--span', '1'));
const ACROSS = Number(opt('--across', '0'));
const FLAT = Math.cos((Number(opt('--flat', '2.56')) * Math.PI) / 180);
const WHOLE = argv.includes('--whole');
const JOIN = argv.includes('--join');
const STEPS = argv.includes('--steps');
if (STEPS) argv.splice(argv.indexOf('--steps'), 1);
const ROWS = Number(opt('--rows', '0'));
if (JOIN) argv.splice(argv.indexOf('--join'), 1);
if (WHOLE) argv.splice(argv.indexOf('--whole'), 1);
const OFF = [-1, -0.6, -0.2, 0.2, 0.6, 1].map((x) => x * Number(strength));
for (const file of argv) tone(file);

function tone(file) {
let seed = 7;
for (const ch of basename(file)) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const glb = readGlb(file);
if (move) moveBand(glb, ...move.split(':'));
const log = [];
const plans = [];
const keepRegions = new Set();
for (const prim of editablePrimitives(glb.json)) {
  if (prim.attributes.TEXCOORD_0 === undefined) continue;
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
  const idx = Array.from(readAccessor(glb, prim.indices).data);
  const { weld } = welder(pos);
  const P = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const triRegion = new Map();
  let regions = 0;
  const cellOfRegion = [];
  for (const [name, cell] of WOOD) {
    if (only && !only.split(',').includes(name)) continue;
    const inCell = (v) => Math.floor(uv[v * 2] * 16) === cell[0] && Math.floor(uv[v * 2 + 1] * 4) === cell[1];
    const tris = [];
    for (let t = 0; t < idx.length / 3; t++) if ([0, 1, 2].every((k) => inCell(idx[t * 3 + k]))) tris.push(t);
    if (!tris.length) continue;
    const geo = new Map();
    for (const t of tris) {
      const [a, b, c] = [0, 1, 2].map((k) => P(idx[t * 3 + k]));
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const x = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const l = Math.hypot(...x) || 1;
      geo.set(t, { n: x.map((q) => q / l), area: l / 2, c: [0, 1, 2].map((i) => (a[i] + b[i] + c[i]) / 3) });
    }
    const uf = () => { const p = new Map(); const f = (a) => (p.has(a) ? (p.get(a) === a ? a : (p.set(a, f(p.get(a))), p.get(a))) : (p.set(a, a), a)); return [p, f]; };
    const [pp, fp] = uf();
    for (const t of tris) { const w = [0, 1, 2].map((k) => weld(idx[t * 3 + k])); pp.set(fp(w[1]), fp(w[0])); pp.set(fp(w[2]), fp(w[0])); }
    const pieces = new Map();
    for (const t of tris) { const r = fp(weld(idx[t * 3])); if (!pieces.has(r)) pieces.set(r, []); pieces.get(r).push(t); }
    const stepSplit = (ts) => {
      const TOL = 0.03;
      const up = ts.filter((t) => geo.get(t).n[1] > 0.9);
      if (up.length < 4) return false;
      const hs = up.map((t) => [geo.get(t).c[1], geo.get(t).area]).sort((a, b) => a[0] - b[0]);
      const lv = [];
      for (const [h, a] of hs) { const l = lv[lv.length - 1]; if (l && h - l.max < TOL) { l.a += a; l.max = h; } else lv.push({ a, max: h }); }
      const med = lv.map((l) => l.a).sort((a, b) => a - b)[Math.floor(lv.length / 2)];
      const L = lv.filter((l) => l.a > 0.2 * med).map((l) => l.max);
      if (L.length < 2) return false;
      const gap = Math.min(...L.slice(1).map((h, i) => h - L[i]));
      const near = (y) => L.reduce((b, h, i) => (Math.abs(h - y) < Math.abs(L[b] - y) ? i : b), 0);
      const above = (y) => { const i = L.findIndex((h) => h >= y - TOL); return i; };
      const ext = (t) => { const ys = [0, 1, 2].map((k) => P(idx[t * 3 + k])[1]); return [Math.min(...ys), Math.max(...ys)]; };
      const byEdge = new Map();
      for (const t of up) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { const e = [weld(idx[t * 3 + a]), weld(idx[t * 3 + b])].sort((p, q) => p - q).join(); if (!byEdge.has(e)) byEdge.set(e, []); byEdge.get(e).push(t); }
      const [cp, cf] = uf();
      for (const l of byEdge.values()) for (let i = 1; i < l.length; i++) if (Math.abs(geo.get(l[i]).c[1] - geo.get(l[0]).c[1]) < 0.002) cp.set(cf(l[i]), cf(l[0]));
      const comps = new Map();
      for (const t of up) { const r = cf(t); if (!comps.has(r)) comps.set(r, { k: near(geo.get(t).c[1]), tris: [], lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity], area: 0 }); const o = comps.get(r); o.tris.push(t); o.area += geo.get(t).area; for (let k = 0; k < 3; k++) { const p = P(idx[t * 3 + k]); for (let i = 0; i < 3; i++) { o.lo[i] = Math.min(o.lo[i], p[i]); o.hi[i] = Math.max(o.hi[i], p[i]); } } }
      let cs = [...comps.values()];
      const cmed = cs.map((o) => o.area).sort((a, b) => a - b)[Math.floor(cs.length / 2)];
      const small = cs.filter((o) => o.area < 0.2 * cmed);
      cs = cs.filter((o) => o.area >= 0.2 * cmed);
      const ids = cs.map(() => { const id = regions++; cellOfRegion[id] = cell; return id; });
      const body = regions++; cellOfRegion[body] = cell; keepRegions.add(body);
      const boxDist = (c, o) => Math.hypot(...[0, 1, 2].map((i) => Math.max(o.lo[i] - c[i], 0, c[i] - o.hi[i])));
      const nearest = (c, k) => { let best = -1, bd = Infinity; cs.forEach((o, i) => { if (o.k !== k) return; const d = boxDist(c, o); if (d < bd) { bd = d; best = i; } }); return best; };
      cs.forEach((o, i) => o.tris.forEach((t) => triRegion.set(t, ids[i])));
      const eAll = new Map();
      for (const t of ts) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { const e = [weld(idx[t * 3 + a]), weld(idx[t * 3 + b])].sort((p, q) => p - q).join(); if (!eAll.has(e)) eAll.set(e, []); eAll.get(e).push(t); }
      const [fp2, ff2] = uf();
      const dt = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      for (const l of eAll.values()) for (let i = 1; i < l.length; i++) if (dt(geo.get(l[0]).n, geo.get(l[i]).n) > FLAT) fp2.set(ff2(l[i]), ff2(l[0]));
      const fspan = new Map();
      for (const t of ts) { const r = ff2(t), [a, b] = ext(t); const o = fspan.get(r) ?? [Infinity, -Infinity]; fspan.set(r, [Math.min(o[0], a), Math.max(o[1], b)]); }
      for (const t of ts) {
        if (triRegion.has(t)) continue;
        const g = geo.get(t), [y0, y1] = fspan.get(ff2(t));
        let k = -1;
        if (g.n[1] > 0.9) k = near(g.c[1]);
        else if (y1 - y0 <= gap * 1.1 + TOL) k = above(y1);
        const i = k >= 0 ? nearest(g.c, k) : -1;
        triRegion.set(t, i >= 0 ? ids[i] : body);
      }
      return true;
    };
    let split = 0;
    for (const ts of pieces.values()) {
      if (STEPS && stepSplit(ts)) { split++; continue; }
      if (ROWS) {
        const h = ROWS, y0 = 0;
        const ys = ts.map((t) => geo.get(t).c[1]);
        if (Math.max(...ys) - Math.min(...ys) > 3 * h) {
          const ids = new Map();
          for (const t of ts) { const k = Math.floor((geo.get(t).c[1] - y0) / h); if (!ids.has(k)) { ids.set(k, regions++); cellOfRegion[ids.get(k)] = cell; } triRegion.set(t, ids.get(k)); }
          split++; continue;
        }
      }
      const byEdge = new Map();
      for (const t of ts) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
        const e = [weld(idx[t * 3 + a]), weld(idx[t * 3 + b])].sort((p, q) => p - q).join();
        if (!byEdge.has(e)) byEdge.set(e, []);
        byEdge.get(e).push(t);
      }
      const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
      const [fpar, ff] = uf();
      for (const l of byEdge.values()) for (let i = 1; i < l.length; i++) if (dot(geo.get(l[0]).n, geo.get(l[i]).n) > FLAT) fpar.set(ff(l[i]), ff(l[0]));
      const flat = new Map();
      for (const t of ts) {
        const r = ff(t);
        if (!flat.has(r)) flat.set(r, { tris: [], area: 0, n: geo.get(t).n, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
        const o = flat.get(r);
        o.tris.push(t); o.area += geo.get(t).area;
        for (let k = 0; k < 3; k++) { const p = P(idx[t * 3 + k]); for (let i = 0; i < 3; i++) { o.lo[i] = Math.min(o.lo[i], p[i]); o.hi[i] = Math.max(o.hi[i], p[i]); } }
      }
      const fl = [...flat.values()];
      const maxA = Math.max(...fl.map((o) => o.area));
      const big = fl.filter((o) => o.area > BIG * maxA);
      for (const o of big) { const c = o.lo.map((x, i) => (x + o.hi[i]) / 2); o.d = dot(o.n, c); }
      const [bp, bf] = uf();
      big.forEach((_, i) => bf(i));
      for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) {
        const A = big[i], B = big[j];
        if (dot(A.n, B.n) < 0.999 || Math.abs(A.d - B.d) > 0.005) continue;
        const span = (o, k) => o.hi[k] - o.lo[k];
        const ax = [0, 1, 2].filter((k) => Math.abs(A.n[k]) < 0.5);
        const k = ax.reduce((m, q) => (Math.max(span(A, q), span(B, q)) < Math.max(span(A, m), span(B, m)) ? q : m), ax[0]);
        const ov = Math.min(A.hi[k], B.hi[k]) - Math.max(A.lo[k], B.lo[k]);
        if (ov > 0.8 * Math.min(span(A, k), span(B, k))) bp.set(bf(j), bf(i));
      }
      const groups = new Map();
      big.forEach((o, i) => { const g = bf(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(o); });
      const boards = [...groups.values()];
      const sameDir = boards.some((g) => boards.filter((h) => h !== g && dot(h[0].n, g[0].n) > 0.999).length > 0);
      if (WHOLE || !sameDir || boards.length < 2) {
        const id = regions++;
        cellOfRegion[id] = cell;
        for (const t of ts) triRegion.set(t, id);
        continue;
      }
      split++;
      const ids = boards.map(() => { const id = regions++; cellOfRegion[id] = cell; return id; });
      const own = new Map();
      boards.forEach((g, i) => { for (const o of g) for (const t of o.tris) own.set(t, i); });
      const boxDist = (c, o) => Math.hypot(...[0, 1, 2].map((i) => Math.max(o.lo[i] - c[i], 0, c[i] - o.hi[i])));
      for (const t of ts) {
        if (own.has(t)) { triRegion.set(t, ids[own.get(t)]); continue; }
        const c = geo.get(t).c;
        let best = 0, bd = Infinity;
        boards.forEach((g, i) => { for (const o of g) { const d = boxDist(c, o); if (d < bd) { bd = d; best = i; } } });
        triRegion.set(t, ids[best]);
      }
    }
    log.push(`${name} ${pieces.size} pieces${split ? `, ${split} split` : ''}`);
  }
  plans.push({ prim, idx, triRegion, regions, cellOfRegion });
}

const replaced = new Map();
const after = [];
for (const { prim, idx, triRegion, regions, cellOfRegion } of plans) {
  const adder = vertexAdder(glb, prim);
  const owner = new Map();
  const copy = new Map();
  const vRegion = new Map();
  for (const [t, r] of triRegion) for (let k = 0; k < 3; k++) {
    const v = idx[t * 3 + k];
    if (!owner.has(v)) { owner.set(v, r); vRegion.set(v, r); continue; }
    if (owner.get(v) === r) continue;
    const key = `${v}:${r}`;
    if (!copy.has(key)) { const nv = adder.add(v); copy.set(key, nv); vRegion.set(nv, r); }
    idx[t * 3 + k] = copy.get(key);
  }
  adder.commit(idx, replaced);
  const offs = Array.from({ length: regions }, () => OFF[Math.floor(R() * OFF.length)]);
  if (JOIN) joinRegions(glb, prim, idx, triRegion, cellOfRegion, offs);
  after.push({ prim, vRegion, offs, cellOfRegion });
}
repack(glb, replaced);
for (const { prim, vRegion, offs, cellOfRegion } of after) {
  const acc = glb.json.accessors[prim.attributes.TEXCOORD_0];
  const view = glb.json.bufferViews[acc.bufferView];
  const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const step = view.byteStride ?? 8;
  const s = Number(strength);
  const L = new Map();
  const st = new Map();
  for (const [v, r] of vRegion) {
    if (keepRegions.has(r)) continue;
    const cell = cellOfRegion[r];
    const l = 1 - (glb.bin.readFloatLE(start + v * step + 4) * 512 - cell[1] * 128 - 0.5) / 127;
    L.set(v, l);
    if (!st.has(r)) st.set(r, { sum: 0, n: 0, lo: 1, hi: 0 });
    const o = st.get(r);
    o.sum += l; o.n++; o.lo = Math.min(o.lo, l); o.hi = Math.max(o.hi, l);
  }
  const base = new Map();
  for (const [r, o] of st) {
    const key = cellOfRegion[r].join();
    if (!base.has(key)) base.set(key, { sum: 0, n: 0 });
    base.get(key).sum += o.sum / o.n; base.get(key).n++;
  }
  const tones = new Map();
  for (const [key, b] of base) {
    const m = b.sum / b.n;
    let lo = Math.max(0.1, m - s), hi = Math.min(0.9, m + s);
    if (hi - lo < 2 * s) { if (lo === 0.1) hi = Math.min(0.9, lo + 2 * s); else lo = Math.max(0.1, hi - 2 * s); }
    tones.set(key, OFF.map((_, k) => lo + (k / (OFF.length - 1)) * (hi - lo)));
  }
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const across = new Map();
  if (ACROSS) {
    const pts = new Map();
    for (const [v, r] of vRegion) {
      if (keepRegions.has(r)) continue;
      if (!pts.has(r)) pts.set(r, []);
      pts.get(r).push([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
    }
    const dir = new Map();
    for (const [r, ps] of pts) {
      const c = [0, 1, 2].map((i) => ps.reduce((a, p) => a + p[i], 0) / ps.length);
      const C = [0, 1, 2].map((i) => [0, 1, 2].map((j) => ps.reduce((a, p) => a + (p[i] - c[i]) * (p[j] - c[j]), 0)));
      const top = (M, skip) => {
        let x = [0.57, 0.61, 0.55];
        for (let it = 0; it < 60; it++) {
          for (const s of skip) { const d = s[0] * x[0] + s[1] * x[1] + s[2] * x[2]; x = x.map((q, i) => q - d * s[i]); }
          x = [0, 1, 2].map((i) => M[i][0] * x[0] + M[i][1] * x[1] + M[i][2] * x[2]);
          const l = Math.hypot(...x) || 1;
          x = x.map((q) => q / l);
        }
        return x;
      };
      const long = top(C, []);
      const wide = top(C, [long]);
      const t = ps.map((p) => wide[0] * p[0] + wide[1] * p[1] + wide[2] * p[2]);
      const flip = wide[0] + wide[1] + wide[2] < 0 ? -1 : 1;
      dir.set(r, { wide, lo: Math.min(...t), hi: Math.max(...t), flip });
    }
    for (const [v, r] of vRegion) {
      if (keepRegions.has(r)) continue;
      const d = dir.get(r);
      const w = d.hi - d.lo;
      const t = d.wide[0] * pos[v * 3] + d.wide[1] * pos[v * 3 + 1] + d.wide[2] * pos[v * 3 + 2];
      across.set(v, w > 0 ? d.flip * ((t - d.lo) / w - 0.5) : 0);
    }
  }
  for (const [v, r] of vRegion) {
    if (keepRegions.has(r)) continue;
    const cell = cellOfRegion[r];
    const o = st.get(r);
    if (ACROSS) {
      const M = tones.get(cell.join())[OFF.indexOf(offs[r])];
      const n = Math.min(0.94, Math.max(0.06, M + across.get(v) * ACROSS));
      glb.bin.writeFloatLE((cell[1] * 128 + 0.5 + (1 - n) * 127) / 512, start + v * step + 4);
      continue;
    }
    const m = o.sum / o.n;
    const M = tones.get(cell.join())[OFF.indexOf(offs[r])];
    const g = Math.min(GRAD, SPAN / Math.max(o.hi - o.lo, 1e-6), o.hi > m ? (0.94 - M) / (o.hi - m) : 1, o.lo < m ? (M - 0.06) / (m - o.lo) : 1);
    const n = M + (L.get(v) - m) * g;
    glb.bin.writeFloatLE((cell[1] * 128 + 0.5 + (1 - n) * 127) / 512, start + v * step + 4);
  }
}
fixBounds(glb);
writeGlb(file, glb.json, glb.bin, writeFileSync);
console.log(`${basename(file)}: ${log.join(', ')}`);
}

function moveBand(glb, from, to) {
  const F = BANDS[from].split(',').map(Number), T = BANDS[to].split(',').map(Number);
  for (const prim of editablePrimitives(glb.json)) {
    const acc = glb.json.accessors[prim.attributes.TEXCOORD_0];
    const view = glb.json.bufferViews[acc.bufferView];
    const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0), step = view.byteStride ?? 8;
    for (let v = 0; v < acc.count; v++) {
      const at = start + v * step;
      const u = glb.bin.readFloatLE(at), w = glb.bin.readFloatLE(at + 4);
      if (Math.floor(u * 16) !== F[0] || Math.floor(w * 4) !== F[1]) continue;
      glb.bin.writeFloatLE(u + (T[0] - F[0]) / 16, at);
      glb.bin.writeFloatLE(w + (T[1] - F[1]) / 4, at + 4);
    }
  }
}

function joinRegions(glb, prim, idx, triRegion, cellOfRegion, offs) {
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const box = new Map();
  for (const [t, r] of triRegion) {
    if (!box.has(r)) box.set(r, { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
    const b = box.get(r);
    for (let k = 0; k < 3; k++) { const v = idx[t * 3 + k]; for (let i = 0; i < 3; i++) { b.lo[i] = Math.min(b.lo[i], pos[v * 3 + i]); b.hi[i] = Math.max(b.hi[i], pos[v * 3 + i]); } }
  }
  for (const b of box.values()) {
    const e = b.lo.map((x, i) => b.hi[i] - x);
    b.ax = [0, 1, 2].sort((p, q) => e[p] - e[q]);
    b.e = e;
  }
  const keys = [...box.keys()];
  const root = new Map(keys.map((k) => [k, k]));
  const f = (a) => (root.get(a) === a ? a : (root.set(a, f(root.get(a))), root.get(a)));
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const A = box.get(keys[i]), B = box.get(keys[j]);
    if (cellOfRegion[keys[i]] !== cellOfRegion[keys[j]] || A.ax[0] !== B.ax[0] || A.ax[1] !== B.ax[1]) continue;
    const [th, w, l] = A.ax;
    const mid = (o, k) => (o.lo[k] + o.hi[k]) / 2;
    if (Math.abs(mid(A, th) - mid(B, th)) > Math.max(A.e[th], B.e[th])) continue;
    const ov = Math.min(A.hi[w], B.hi[w]) - Math.max(A.lo[w], B.lo[w]);
    if (ov < 0.8 * Math.max(A.e[w], B.e[w])) continue;
    if (Math.max(A.lo[l], B.lo[l]) - Math.min(A.hi[l], B.hi[l]) > 3 * Math.max(A.e[w], B.e[w])) continue;
    root.set(f(keys[j]), f(keys[i]));
  }
  for (const k of keys) offs[k] = offs[f(k)];
}
