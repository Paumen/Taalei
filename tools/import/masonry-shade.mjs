import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';
import { repack } from './mesh-edit.mjs';

const HELP = `masonry-shade.mjs [options] <workfile.glb> [...]

Shades the stone faces of masonry models from scratch. Each face corner gets
a tone in its band (0 light, 1 dark):

  facing   each face first gets a tone by the way it points: up lightest
           (--up), down darkest (--down), sides in the middle (--side), faces
           tilted between these in between
  height   that tone is nudged by height in the model: darker near the
           bottom, lighter near the top (--height, the full spread)
  sides    on sides only, the nudged tone is the middle of a gradient over
           its own piece, dark at the foot to light at the head (--side-fade);
           sides turned to the light a little lighter (--sun)
  recess   a flat face sitting in a recess goes darker as a whole (--cover):
           rays along the face look for walls on both opposite sides, at
           growing distances in front of it; how deep it stays enclosed,
           against how wide the opening is (--ratio), sets how dark, so a
           shallow rim around a big wall barely counts
  shadow   a wall under a ledge, collar, hood or eave is darkest (--shadow)
           right under it and fades to nothing over --shadow-len times the
           rim: the overhang's own thickness, or how far it sticks out if less; only under a level overhang; the wall is cut where the fade ends, one cut
           per wall plane, so its triangles line up

Options (defaults are the values set for the masonry-mid smooth-detail group):
  --bands <a,b>        bands to shade, default taupe,taupe-dark
  --up <t>             0.15     --side <t>        0.45     --down <t>  0.80
  --height <t>         0.26     --side-fade <t>   0.20     --sun <t>   0.04
  --cover <t>          0.25     --reach <f>       0.3 of the model size
  --ratio <f>          3: darkness grows with depth over width
  --shallow <f>        0.3: enclosure below this counts as none; walls look
                       only sideways, overhangs above are the shadow's job
  --shadow <t>         0.18     --shadow-len <f>  3
  --shadow-cap <f>     0.25: a shadow covers at most this share of the wall below it
  --shadow-reach <f>   0.4 of the model size, how far up an overhang is looked for
  --short-piece <f>    0.15 of the model height: shorter pieces (caps, bands, ledges)
                       keep the base tone on their sides, no fade from a dark foot
  --keep-mean 1        shift the stone so its average tone stays as it was, for models with little stone
  --min <t> --max <t>  0.03 0.97
  --flat 1             give the stone flat faces, for models with smooth normals
  --out <dir>          write copies there (kit/name.glb, with the colour map) instead of in place`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LANES = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(0); }
const opt = { bands: 'taupe,taupe-dark', up: 0.15, side: 0.45, down: 0.80, height: 0.26, sideFade: 0.20, sun: 0.04, cover: 0.25, reach: 0.3, ratio: 3, shallow: 0.3, shadowReach: 0.4, shadowLen: 3, shadowCap: 0.25, shadow: 0.18, keepMean: 0, flat: 0, dump: null, shortPiece: 0.15, min: 0.03, max: 0.97, out: null };
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const k = a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase());
    if (!(k in opt)) throw new Error(`unknown option ${a}`);
    opt[k] = typeof opt[k] === 'number' ? Number(args[++i]) : args[++i];
  } else files.push(a);
}

const bandCells = new Set(opt.bands.split(',').map((b) => {
  if (!LANES[b]) throw new Error(`unknown band ${b}`);
  return LANES[b];
}));
const SUN = (() => { const s = [-0.5, 0, 0.87]; const l = Math.hypot(...s); return s.map((x) => x / l); })();
const COMPONENT = { 5120: [1, 'Int8'], 5121: [1, 'UInt8'], 5122: [2, 'Int16LE'], 5123: [2, 'UInt16LE'], 5125: [4, 'UInt32LE'], 5126: [4, 'FloatLE'] };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const apply = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);

function hit(o, d, [a, b, c]) {
  const e1 = sub(b, a), e2 = sub(c, a);
  const p = cross(d, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-12) return Infinity;
  const inv = 1 / det;
  const s = sub(o, a);
  const u = dot(s, p) * inv;
  if (u < 0 || u > 1) return Infinity;
  const q = cross(s, e1);
  const v = dot(d, q) * inv;
  if (v < 0 || u + v > 1) return Infinity;
  const t = dot(e2, q) * inv;
  return t > 0 ? t : Infinity;
}

function grid(tris, size) {
  const cell = size / 24;
  const map = new Map();
  tris.forEach((t, ti) => {
    const lo = [0, 1, 2].map((k) => Math.floor(Math.min(t[0][k], t[1][k], t[2][k]) / cell));
    const hi = [0, 1, 2].map((k) => Math.floor(Math.max(t[0][k], t[1][k], t[2][k]) / cell));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const k = `${x},${y},${z}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ti);
    }
  });
  const dist = (o, d, near, far) => {
    const seen = new Set();
    let best = Infinity;
    for (let s = 0; s <= far + cell; s += cell * 0.5) {
      if (s > best + cell) break;
      const k = [0, 1, 2].map((j) => Math.floor((o[j] + d[j] * s) / cell)).join(',');
      for (const ti of map.get(k) ?? []) {
        if (seen.has(ti)) continue;
        seen.add(ti);
        const t = hit(o, d, tris[ti]);
        if (t > near && t < far && t < best) best = t;
      }
    }
    return best;
  };
  const cast = (o, d, near, far) => dist(o, d, near, far) < Infinity;
  cast.dist = dist;
  return cast;
}

const DIRS = Array.from({ length: 48 }, (_, i) => {
  const z = 1 - (i + 0.5) / 48, r = Math.sqrt(1 - z * z), a = i * 2.39996;
  return [r * Math.cos(a), r * Math.sin(a), z];
});
function hemisphere(n) {
  const t = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const x = norm(cross(t, n)), y = cross(n, x);
  return DIRS.map(([a, b, c]) => [0, 1, 2].map((j) => x[j] * a + y[j] * b + n[j] * c));
}

function shade(file) {
  const glb = readGlb(file);
  const { json } = glb;
  const world = worldMatrices(json);
  const items = [];
  (json.nodes ?? []).forEach((node, ni) => {
    if (node.mesh === undefined || !world[ni]) return;
    for (const prim of json.meshes[node.mesh].primitives) {
      if ((prim.mode ?? 4) !== 4 || prim.indices === undefined || prim.attributes.TEXCOORD_0 === undefined) continue;
      if (items.some((it) => it.prim === prim)) continue;
      items.push({ prim, matrix: world[ni] });
    }
  });

  const all = [];
  for (const item of items) {
    const { prim, matrix } = item;
    item.attrs = Object.entries(prim.attributes).map(([name, ai]) => ({ name, ai, ...readAccessor(glb, ai) }));
    item.targets = (prim.targets ?? []).map((t) => Object.entries(t).map(([name, ai]) => ({ name, ai, ...readAccessor(glb, ai) })));
    const pos = item.attrs.find((a) => a.name === 'POSITION').data;
    const uv = item.attrs.find((a) => a.name === 'TEXCOORD_0').data;
    const idx = readAccessor(glb, prim.indices).data;
    item.verts = [];
    for (let i = 0; i < pos.length / 3; i++) item.verts.push({ mix: [[i, 1]], wp: apply(matrix, [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]) });
    item.tris = [];
    for (let t = 0; t < idx.length; t += 3) {
      const c = [idx[t], idx[t + 1], idx[t + 2]];
      const P = c.map((v) => item.verts[v].wp);
      const n = norm(cross(sub(P[1], P[0]), sub(P[2], P[0])));
      const mu = (uv[c[0] * 2] + uv[c[1] * 2] + uv[c[2] * 2]) / 3, mv = (uv[c[0] * 2 + 1] + uv[c[1] * 2 + 1] + uv[c[2] * 2 + 1]) / 3;
      const cell = `${Math.floor(mu * 16)},${Math.floor(mv * 4)}`;
      item.tris.push({ c, n, cell, stone: bandCells.has(cell), was: mv * 4 - Math.floor(mv * 4) });
      all.push(P);
    }
  }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const P of all) for (const p of P) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const q = size * 1e-4;
  const pk = (p) => p.map((x) => Math.round(x / q)).join(',');
  for (const item of items) {
    const byV = new Map();
    for (const t of item.tris) for (const v of t.c) { if (!byV.has(v)) byV.set(v, []); byV.get(v).push(t); }
    for (const ts of byV.values()) for (const a of ts) for (const b of ts) { const d = dot(a.n, b.n); if (d < 0.999 && d > Math.cos(Math.PI / 6)) { a.smooth = true; b.smooth = true; } }
  }
  const planeOf = (item, t) => 'p' + t.n.map((x) => Math.round(x * 50)).join(',') + '|' + Math.round(dot(t.n, item.verts[t.c[0]].wp) / (size * 1e-3));
  const facesOf = (list) => {
    const info = list.map(({ item, t }) => {
      const P = t.c.map((v) => item.verts[v].wp);
      return { n: t.n, d: dot(t.n, P[0]), lo: [0, 1, 2].map((j) => Math.min(...P.map((x) => x[j]))), hi: [0, 1, 2].map((j) => Math.max(...P.map((x) => x[j]))) };
    });
    const fr = list.map((_, i) => i);
    const ff = (i) => { while (fr[i] !== i) i = fr[i] = fr[fr[i]]; return i; };
    const eps = size * 0.002;
    const byVert = new Map();
    list.forEach(({ item, t }, i) => {
      if (!byVert.has(item)) byVert.set(item, new Map());
      const bv = byVert.get(item);
      if (!t.smooth) return;
      for (const v of t.c) if (bv.has(v)) fr[ff(i)] = ff(bv.get(v)); else bv.set(v, i);
    });
    const byEdge = new Map();
    list.forEach(({ item, t }, i) => {
      const ks = t.c.map((v) => pk(item.verts[v].wp));
      for (let k = 0; k < 3; k++) {
        const e = [ks[k], ks[(k + 1) % 3]].sort().join('|');
        const o = byEdge.get(e);
        if (o === undefined) byEdge.set(e, i); else if (t.smooth && list[o].t.smooth && dot(list[o].t.n, t.n) > 0.995) fr[ff(i)] = ff(o);
      }
    });
    const cellOf = (x) => Math.floor(x / (size * 0.05));
    const grid2 = new Map();
    info.forEach((f, i) => {
      for (let x = cellOf(f.lo[0] - eps); x <= cellOf(f.hi[0] + eps); x++) for (let y = cellOf(f.lo[1] - eps); y <= cellOf(f.hi[1] + eps); y++) for (let z = cellOf(f.lo[2] - eps); z <= cellOf(f.hi[2] + eps); z++) {
        const k = x + ',' + y + ',' + z;
        if (!grid2.has(k)) grid2.set(k, []);
        grid2.get(k).push(i);
      }
    });
    for (const cell of grid2.values()) for (let a = 0; a < cell.length; a++) for (let b = a + 1; b < cell.length; b++) {
      const A = info[cell[a]], B = info[cell[b]];
      if (!list[cell[a]].t.smooth || !list[cell[b]].t.smooth) continue;
      if (dot(A.n, B.n) < 0.995 || Math.abs(A.d - B.d) > eps) continue;
      if ([0, 1, 2].every((j) => A.lo[j] <= B.hi[j] + eps && B.lo[j] <= A.hi[j] + eps)) fr[ff(cell[a])] = ff(cell[b]);
    }
    return list.map(({ item, t }, i) => (t.smooth ? ff(i) : null));
  };
  const cast = opt.cover > 0 || opt.shadow > 0 ? grid(all, size) : null;


  const centreOf = (item, t) => [0, 1, 2].map((j) => t.c.reduce((s, v) => s + item.verts[v].wp[j], 0) / 3);

  if (opt.shadow > 0) {
    const UP = [0, 1, 0];
    const under = (p, n) => {
      const h = cast.dist(p.map((x, j) => x + n[j] * size * 0.004), UP, size * 0.002, size * opt.shadowReach);
      if (h === Infinity) return null;
      let depth = 0, tipH = h;
      for (const o of [0.01, 0.02, 0.035, 0.05, 0.075, 0.1, 0.15]) {
        const ho = cast.dist(p.map((x, j) => x + n[j] * size * o), UP, size * 0.002, size * opt.shadowReach);
        if (ho !== Infinity && ho < h + size * 0.02) { depth = o; tipH = ho; } else break;
      }
      if (!depth) return null;
      const top = p[1] + h;
      const o = p.map((x, j) => x + n[j] * size * depth * 0.9);
      o[1] = p[1] + tipH + size * 0.003;
      const thick = cast.dist(o, UP, size * 0.001, size * opt.shadowReach);
      const rim = Math.min(depth * size, thick === Infinity ? depth * size : thick + size * 0.003);
      return { top, len: rim * opt.shadowLen };
    };
    const found = new Map();
    const bottom = new Map();
    const walls0 = [];
    for (const item of items) for (const t of item.tris) if (t.stone && Math.abs(t.n[1]) <= 0.3) walls0.push({ item, t });
    facesOf(walls0).forEach((g, i) => { walls0[i].t.sg = g ?? planeOf(walls0[i].item, walls0[i].t); });
    for (const { item, t } of walls0) {
      const P = t.c.map((v) => item.verts[v].wp);
      const k = t.sg;
      bottom.set(k, Math.min(bottom.get(k) ?? Infinity, ...P.map((q) => q[1])));
      for (const [x, u, w] of [[1 / 3, 1 / 3, 1 / 3], [0.7, 0.15, 0.15], [0.15, 0.7, 0.15], [0.15, 0.15, 0.7]]) {
        const r = under([0, 1, 2].map((j) => P[0][j] * x + P[1][j] * u + P[2][j] * w), t.n);
        if (!r) continue;
        if (!found.has(k)) found.set(k, []);
        found.get(k).push(r);
      }
    }
    const med = (a) => { const s2 = [...a].sort((x, y) => x - y); return s2[Math.floor(s2.length / 2)]; };
    const shade = new Map();
    const cutsOf = new Map();
    for (const [k, list] of found) {
      const top = med(list.map((r) => r.top));
      const near = list.map((r) => r.top).filter((y) => Math.abs(y - top) <= size * 0.05);
      if (Math.max(...near) - Math.min(...near) > size * 0.005) continue;
      const len = Math.min(med(list.map((r) => r.len)), (top - bottom.get(k)) * opt.shadowCap);
      shade.set(k, { top, cut: top - len });
      cutsOf.set(k, [top - len]);
    }
    for (const item of items) {
      const mids = new Map();
      const cutPoint = (i, j, y) => {
        const k = (i < j ? `${i},${j}` : `${j},${i}`) + '@' + y.toFixed(6);
        if (!mids.has(k)) {
          const A = item.verts[i], B = item.verts[j];
          const f = (y - A.wp[1]) / (B.wp[1] - A.wp[1]);
          const mix = new Map();
          for (const [v, w] of A.mix) mix.set(v, (mix.get(v) ?? 0) + w * (1 - f));
          for (const [v, w] of B.mix) mix.set(v, (mix.get(v) ?? 0) + w * f);
          item.verts.push({ mix: [...mix], wp: A.wp.map((x, j2) => x + (B.wp[j2] - x) * f) });
          mids.set(k, item.verts.length - 1);
        }
        return mids.get(k);
      };
      let tris = item.tris;
      const keyOf = (t) => t.sg;
      const allCuts = new Set();
      for (const t of tris) if (t.stone && Math.abs(t.n[1]) <= 0.3) for (const y of cutsOf.get(keyOf(t)) ?? []) allCuts.add(y);
      for (const y of allCuts) {
        const out = [];
        for (const t of tris) {
          const cs = t.stone && Math.abs(t.n[1]) <= 0.3 ? cutsOf.get(keyOf(t)) ?? [] : [];
          const ys = t.c.map((v) => item.verts[v].wp[1]);
          if (!cs.includes(y) || Math.min(...ys) >= y - 1e-9 || Math.max(...ys) <= y + 1e-9) { out.push(t); continue; }
          const up = t.c.filter((v, k) => ys[k] > y), dn = t.c.filter((v, k) => ys[k] <= y);
          const lone = up.length === 1 ? up[0] : dn[0];
          const r = t.c.indexOf(lone);
          const [a0, b0, c0] = [t.c[r], t.c[(r + 1) % 3], t.c[(r + 2) % 3]];
          const m1 = cutPoint(a0, b0, y), m2 = cutPoint(c0, a0, y);
          out.push({ ...t, c: [a0, m1, m2] }, { ...t, c: [m1, b0, c0] }, { ...t, c: [m1, c0, m2] });
        }
        tris = out;
      }
      item.tris = tris;
    }
    const walls = [];
    for (const item of items) for (const t of item.tris) if (t.stone && Math.abs(t.n[1]) <= 0.3) walls.push({ item, t });
    const wf = walls.map(({ t }, i) => (t.smooth ? t.sg : 't' + i));
    const votes = new Map();
    walls.forEach(({ item, t }, i) => {
      const P = t.c.map((v) => item.verts[v].wp);
      const sh = shade.get(t.sg);
      if (!sh) return;
      const c = [0, 1, 2].map((j) => (P[0][j] + P[1][j] + P[2][j]) / 3);
      const r = under(c, t.n);
      const a = Math.hypot(...cross(sub(P[1], P[0]), sub(P[2], P[0])));
      const v = votes.get(wf[i]) ?? [0, 0];
      v[r && Math.abs(r.top - sh.top) <= size * 0.005 ? 0 : 1] += a;
      votes.set(wf[i], v);
    });
    walls.forEach(({ item, t }, i) => {
      const v = votes.get(wf[i]);
      if (!v || v[0] < v[1]) return;
      const P = t.c.map((x) => item.verts[x].wp);
      const sh = shade.get(t.sg);
      if ((P[0][1] + P[1][1] + P[2][1]) / 3 > sh.cut) { t.shadow = true; t.fade = [sh.cut, sh.top]; }
    });
  }

  const stone = [];
  for (const item of items) for (const t of item.tris) if (t.stone) stone.push({ item, t });
  const root = stone.map((_, i) => i);
  const find = (i) => { while (root[i] !== i) i = root[i] = root[root[i]]; return i; };
  const at = new Map();
  stone.forEach(({ item, t }, i) => t.c.forEach((v) => {
    const k = pk(item.verts[v].wp);
    if (at.has(k)) root[find(i)] = find(at.get(k)); else at.set(k, i);
  }));
  const sf = facesOf(stone);
  const faceFirst = new Map();
  sf.forEach((f, i) => { if (f === null) return; if (faceFirst.has(f)) root[find(i)] = find(faceFirst.get(f)); else faceFirst.set(f, i); });
  const span = new Map();
  stone.forEach(({ item, t }, i) => {
    const r = find(i);
    const s = span.get(r) ?? [Infinity, -Infinity];
    for (const v of t.c) { s[0] = Math.min(s[0], item.verts[v].wp[1]); s[1] = Math.max(s[1], item.verts[v].wp[1]); }
    span.set(r, s);
  });

  const recess = new Map();
  if (opt.cover > 0) {
    const gr = stone.map((_, i) => i);
    const gf = (i) => { while (gr[i] !== i) i = gr[i] = gr[gr[i]]; return i; };
    const vat = new Map();
    stone.forEach(({ item, t }, i) => t.c.forEach((v) => {
      const k = pk(item.verts[v].wp) + '|' + t.n.map((x) => Math.round(x * 100)).join(',');
      if (vat.has(k)) gr[gf(i)] = gf(vat.get(k)); else vat.set(k, i);
    }));
    sf.forEach((f, i) => { if (f !== null) gr[gf(i)] = gf(faceFirst.get(f)); });
    const pts = new Map();
    stone.forEach(({ item, t }, i) => {
      const r = gf(i);
      if (!pts.has(r)) pts.set(r, { n: t.n, list: [] });
      const P = t.c.map((v) => item.verts[v].wp);
      const g = pts.get(r);
      for (const [x, u, w] of [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]]) g.list.push([0, 1, 2].map((k) => P[0][k] * x + P[1][k] * u + P[2][k] * w));
    });
    for (const [r, { n, list }] of pts) {
      const a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const u = norm(cross(a, n)), w = cross(n, u);
      const flat = Math.abs(n[1]) > 0.7;
      const dirs = (flat ? [0, 1, 2, 3] : [0]).map((k) => { const an = k * Math.PI / 4; return [0, 1, 2].map((j) => u[j] * Math.cos(an) + w[j] * Math.sin(an)); });
      const step = Math.max(1, Math.floor(list.length / 24));
      let sum = 0, cnt = 0;
      const ext = Math.max(...[0, 1, 2].map((j) => Math.max(...list.map((q) => q[j])) - Math.min(...list.map((q) => q[j]))));
      for (let li = 0; li < list.length; li += step) {
        let best = 0;
        for (const d of dirs) {
          const neg = d.map((x) => -x);
          let deep = 0, width = Infinity;
          for (const f of [0.01, 0.03, 0.06, 0.1, 0.15, 0.22]) {
            const q = list[li].map((x, j) => x + n[j] * size * f);
            const a1 = cast.dist(q, d, size * 0.002, size * opt.reach), a2 = cast.dist(q, neg, size * 0.002, size * opt.reach);
            if (a1 === Infinity || a2 === Infinity) break;
            deep = f * size; width = Math.min(width, a1 + a2);
          }
          if (deep) best += Math.min(1, opt.ratio * deep / Math.max(width, ext * 1.25)) / dirs.length;
        }
        sum += best; cnt++;
      }
      const raw = cnt ? sum / cnt : 0;
      recess.set(r, Math.max(0, Math.min(1, (raw - opt.shallow) / (1 - opt.shallow))));
    }
    stone.forEach((e, i) => { e.t.recess = recess.get(gf(i)) ?? 0; });
  }

  const o0 = (m) => apply(m, [0, 0, 0]);
  const smooth = new Map();
  if (!opt.flat) for (const { item, t } of stone) {
    const nA = item.attrs.find((a) => a.name === 'NORMAL');
    if (!nA) continue;
    if (!smooth.has(item)) smooth.set(item, new Map());
    const sm = smooth.get(item), z = o0(item.matrix);
    for (const v of t.c) {
      const ln = [0, 1, 2].map((k) => item.verts[v].mix.reduce((s2, [src, wt]) => s2 + nA.data[src * 3 + k] * wt, 0));
      const wn = norm(apply(item.matrix, ln).map((x, k) => x - z[k]));
      const ok = dot(wn, t.n) > Math.cos(Math.PI * 1 / 6);
      const was = sm.get(v);
      sm.set(v, was === undefined ? (ok ? wn : null) : (ok && was ? was : null));
    }
  }
  stone.forEach(({ item, t }, i) => {
    const sp = span.get(find(i));
    const centre = centreOf(item, t);
    const sm = smooth.get(item);
    t.f = t.c.map((v) => {
      const p = item.verts[v].wp;
      const vn = (t.smooth && sm?.get(v)) || t.n;
      const ny = vn[1];
      const tiny = sp[1] - sp[0] < size * 0.04;
      const short = sp[1] - sp[0] < (hi[1] - lo[1]) * opt.shortPiece;
      const hn = (p[1] - lo[1]) / ((hi[1] - lo[1]) || 1);
      const hp = (p[1] - sp[0]) / ((sp[1] - sp[0]) || 1);
      const sunT = (1 - Math.abs(ny)) * dot(norm([vn[0], 0, vn[2]]), SUN);
      const cov = tiny ? 0 : t.recess ?? 0;
      const shf = t.shadow && !tiny ? (t.fade ? Math.max(0, Math.min(1, (p[1] - t.fade[0]) / ((t.fade[1] - t.fade[0]) || 1))) : 1) : 0;
      return [ny, hn, hp, tiny || short ? 0 : 1, sunT, cov, shf];
    });
    t.tones = t.f.map(([ny2, hn, hp, sides, sunT, cov, shf]) => {
      let tone = ny2 >= 0 ? opt.side + (opt.up - opt.side) * ny2 : opt.side + (opt.down - opt.side) * -ny2;
      tone += opt.height * (0.5 - hn);
      tone += sides * opt.sideFade * (1 - Math.abs(ny2)) * (0.5 - hp);
      tone -= opt.sun * sunT;
      tone += opt.cover * cov + opt.shadow * shf;
      return Math.max(opt.min, Math.min(opt.max, tone));
    });
  });

  if (opt.keepMean) {
    let was = 0, now = 0, area = 0;
    for (const { item, t } of stone) {
      const P = t.c.map((v) => item.verts[v].wp);
      const a = Math.hypot(...cross(sub(P[1], P[0]), sub(P[2], P[0]))) / 2;
      was += a * t.was; now += a * (t.tones[0] + t.tones[1] + t.tones[2]) / 3; area += a;
    }
    const shift = (was - now) / (area || 1);
    for (const { t } of stone) t.tones = t.tones.map((x) => Math.max(opt.min, Math.min(opt.max, x + shift)));
  }

  if (opt.dump) {
    const r = (x) => Math.round(x * 1e4) / 1e4;
    const out = { pos: [], nrm: [], uv: [], f: [], was: [], area: [] };
    for (const item of items) {
      const nA = item.attrs.find((a) => a.name === 'NORMAL'), uA = item.attrs.find((a) => a.name === 'TEXCOORD_0');
      const m = item.matrix;
      for (const t of item.tris) {
        const P = t.c.map((v) => item.verts[v].wp);
        const ar = Math.hypot(...cross(sub(P[1], P[0]), sub(P[2], P[0]))) / 2;
        if (t.stone) { out.was.push(r(t.was)); out.area.push(r(ar)); }
        t.c.forEach((v, k) => {
          const vert = item.verts[v];
          out.pos.push(...vert.wp.map(r));
          let n = nA ? [0, 1, 2].map((j) => vert.mix.reduce((s2, [src, w]) => s2 + nA.data[src * 3 + j] * w, 0)) : t.n;
          n = norm([0, 1, 2].map((rr) => m[rr] * n[0] + m[4 + rr] * n[1] + m[8 + rr] * n[2]));
          out.nrm.push(...n.map((x) => Math.round(x * 1e3) / 1e3));
          if (t.stone) {
            const [cu, cv] = t.cell.split(',').map(Number);
            out.uv.push((cu + 0.5) / 16, -1 - cv);
            out.f.push(...t.f[k].map(r));
          } else out.uv.push(...[0, 1].map((j) => r(vert.mix.reduce((s2, [src, w]) => s2 + uA.data[src * 2 + j] * w, 0))));
        });
      }
    }
    out.keepMean = !!opt.keepMean;
    mkdirSync(opt.dump, { recursive: true });
    writeFileSync(resolve(opt.dump, basename(dirname(file)) + '__' + basename(file, '.glb') + '.json'), JSON.stringify(out));
    return { corners: out.f.length / 7, tris: out.pos.length / 9 };
  }

  const replaced = new Map();
  let corners = 0;
  for (const item of items) {
    const { prim } = item;
    const keys = new Map();
    const order = [];
    const indices = [];
    const pA = item.attrs.find((a) => a.name === 'POSITION');
    const local = (v) => [0, 1, 2].map((k) => item.verts[v].mix.reduce((s2, [src, wt]) => s2 + pA.data[src * 3 + k] * wt, 0));
    for (const t of item.tris) for (let k = 0; k < 3; k++) {
      const v = t.c[k];
      let uv = null;
      let fn = null;
      if (opt.flat && t.stone) { const [a, b, c] = t.c.map(local); fn = norm(cross(b.map((x, j) => x - a[j]), c.map((x, j) => x - a[j]))); }
      if (t.stone) {
        const [cu, cv] = t.cell.split(',').map(Number);
        uv = [(cu + 0.5) / 16, (cv + t.tones[k]) / 4];
        corners++;
      }
      const key = (uv ? `${v}:${uv[0].toFixed(5)},${uv[1].toFixed(5)}` : `${v}`) + (fn ? `:${fn.map((x) => x.toFixed(3))}` : '');
      if (!keys.has(key)) { keys.set(key, order.length); order.push({ v, uv, fn }); }
      indices.push(keys.get(key));
    }
    const write = (a, isUv) => {
      const acc = json.accessors[a.ai];
      const [bytes, kind] = COMPONENT[acc.componentType];
      const w = WIDTH[acc.type];
      const buf = Buffer.alloc(bytes * w * order.length);
      const ints = acc.componentType !== 5126;
      const joints = a.name.startsWith('JOINTS');
      order.forEach(({ v, uv, fn }, i) => {
        const vert = item.verts[v];
        for (let k = 0; k < w; k++) {
          let x;
          if (isUv && uv) x = uv[k];
          else if (fn && a.name === 'NORMAL') x = fn[k];
          else if (joints) { const top = vert.mix.reduce((m, e) => (e[1] > m[1] ? e : m)); x = a.data[top[0] * w + k]; }
          else x = vert.mix.reduce((s, [src, wt]) => s + a.data[src * w + k] * wt, 0);
          if (ints) x = Math.round(x);
          buf[`write${kind}`](x, (i * w + k) * bytes);
        }
      });
      replaced.set(a.ai, buf);
      acc.count = order.length;
    };
    for (const a of item.attrs) write(a, a.name === 'TEXCOORD_0');
    for (const t of item.targets) for (const a of t) write(a, false);
    for (const a of item.attrs) if (a.name === 'NORMAL') {
      const buf = replaced.get(a.ai);
      for (let i = 0; i < order.length; i++) {
        const n = norm([buf.readFloatLE(i * 12), buf.readFloatLE(i * 12 + 4), buf.readFloatLE(i * 12 + 8)]);
        n.forEach((x, k) => buf.writeFloatLE(x, i * 12 + k * 4));
      }
    }
    const wide = order.length > 65535;
    const ib = Buffer.alloc(indices.length * (wide ? 4 : 2));
    indices.forEach((x, i) => (wide ? ib.writeUInt32LE(x, i * 4) : ib.writeUInt16LE(x, i * 2)));
    const ia = json.accessors[prim.indices];
    ia.componentType = wide ? 5125 : 5123;
    ia.count = indices.length;
    delete ia.min; delete ia.max;
    replaced.set(prim.indices, ib);
  }
  repack(glb, replaced);
  json.accessors.forEach((a, ai) => {
    if (a.bufferView === undefined || !a.min) return;
    const { data, width, count } = readAccessor(glb, ai);
    const mn = new Array(width).fill(Infinity), mx = new Array(width).fill(-Infinity);
    for (let i = 0; i < count; i++) for (let k = 0; k < width; k++) { mn[k] = Math.min(mn[k], data[i * width + k]); mx[k] = Math.max(mx[k], data[i * width + k]); }
    a.min = mn; a.max = mx;
  });
  let target = file;
  if (opt.out) {
    const dir = resolve(opt.out, basename(dirname(file)));
    mkdirSync(resolve(dir, 'Textures'), { recursive: true });
    if (!existsSync(resolve(dir, 'Textures', 'colormap.png'))) copyFileSync(resolve(ROOT, 'kits', 'colormap.png'), resolve(dir, 'Textures', 'colormap.png'));
    target = resolve(dir, basename(file));
  }
  writeGlb(target, json, glb.bin, writeFileSync);
  const tris = items.reduce((s, it) => s + it.tris.length, 0);
  return { corners, tris };
}

for (const f of files) {
  const { corners, tris } = shade(f);
  console.log(`${f}: ${corners} stone corners, ${tris} triangles`);
}
