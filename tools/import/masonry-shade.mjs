import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';
import { repack } from './mesh-edit.mjs';

const HELP = `masonry-shade.mjs [options] <workfile.glb> [...]

Shades the stone faces of masonry models from scratch. Each face corner gets
a tone in its band (0 light, 1 dark):

  height   a base tone from the model's foot (--ground) to its top (--crown)
  facing   tops lighter (--top-lift) and undersides darker (--under-drop) than
           the base; sides start at --side-foot at the foot of their own piece
           and run to the base at its top; sides turned to the light a little
           lighter (--sun)
  cover    corners under overhangs and in recesses darker (--cover), seen from
           a sky that weighs up more than sideways
  shadow   walls are cut along the line where a shadow from a ledge, collar,
           hood or eave above ends, lit from in front at --sun-angle degrees;
           the part in shadow is darker by --shadow, so the shadow has an edge.
           Cuts are shared over each wall plane, so its triangles line up

Options (defaults are the values set for the masonry-mid smooth-detail group):
  --bands <a,b>        bands to shade, default taupe,taupe-dark
  --ground <t>         0.58     --crown <t>       0.32
  --top-lift <t>       0.22     --under-drop <t>  0.25
  --side-foot <t>      0.62     --sun <t>         0.04
  --cover <t>          0.25     --reach <f>       0.15 of the model size
  --shadow <t>         0.18     --sun-angle <deg> 55
  --min <t> --max <t>  0.03 0.97
  --out <dir>          write copies there (kit/name.glb, with the colour map) instead of in place`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LANES = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(0); }
const opt = { bands: 'taupe,taupe-dark', ground: 0.58, crown: 0.32, topLift: 0.22, underDrop: 0.25, sideFoot: 0.62, sun: 0.04, cover: 0.25, reach: 0.15, shadow: 0.18, sunAngle: 55, min: 0.03, max: 0.97, out: null };
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
  return (o, d, near, far) => {
    const seen = new Set();
    for (let s = 0; s <= far + cell; s += cell * 0.5) {
      const k = [0, 1, 2].map((j) => Math.floor((o[j] + d[j] * s) / cell)).join(',');
      for (const ti of map.get(k) ?? []) {
        if (seen.has(ti)) continue;
        seen.add(ti);
        const t = hit(o, d, tris[ti]);
        if (t > near && t < far) return true;
      }
    }
    return false;
  };
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
      item.tris.push({ c, n, cell, stone: bandCells.has(cell) });
      all.push(P);
    }
  }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const P of all) for (const p of P) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const q = size * 1e-4;
  const pk = (p) => p.map((x) => Math.round(x / q)).join(',');
  const cast = opt.cover > 0 || opt.shadow > 0 ? grid(all, size) : null;

  const coverCache = new Map();
  const coverAt = (p, n, centre) => {
    if (!cast) return 0;
    const key = pk(p) + '|' + n.map((x) => Math.round(x * 20)).join(',');
    if (coverCache.has(key)) return coverCache.get(key);
    const o = [0, 1, 2].map((j) => p[j] + (centre[j] - p[j]) * 0.02 + n[j] * size * 2e-3);
    let blocked = 0, total = 0;
    for (const d of hemisphere(n)) {
      const w = 0.25 + 0.75 * Math.max(0, d[1]);
      total += w;
      if (cast(o, d, size * 0.004, size * opt.reach)) blocked += w;
    }
    const v = blocked / total;
    coverCache.set(key, v);
    return v;
  };
  const centreOf = (item, t) => [0, 1, 2].map((j) => t.c.reduce((s, v) => s + item.verts[v].wp[j], 0) / 3);

  const lightFor = (n) => {
    const h = norm([n[0], 0, n[2]]), e = opt.sunAngle * Math.PI / 180;
    return norm([h[0] * Math.cos(e), Math.sin(e), h[2] * Math.cos(e)]);
  };
  const blocked = (p, n) => cast(p.map((x, j) => x + n[j] * size * 2e-3), lightFor(n), size * 0.004, size * opt.reach);
  if (opt.shadow > 0) {
    const planes = new Map();
    const samples = new Map();
    const planeKey = (n, p) => n.map((x) => Math.round(x * 50)).join(',') + '|' + Math.round(dot(n, p) / (size * 1e-3));
    for (const item of items) for (const t of item.tris) {
      if (!t.stone || Math.abs(t.n[1]) > 0.3) continue;
      const P = t.c.map((v) => item.verts[v].wp);
      const S = [], U = [];
      for (let i = 0; i <= 14; i++) for (let j = 0; j <= 14 - i; j++) {
        const u = (i + 0.3) / 15, w = (j + 0.3) / 15, x = 1 - u - w;
        if (x < 0) continue;
        const pt = [0, 1, 2].map((k) => P[0][k] * x + P[1][k] * u + P[2][k] * w);
        const b = blocked(pt, t.n);
        (b ? S : U).push(pt[1]);
        const key0 = planeKey(t.n, P[0]);
        if (!samples.has(key0)) samples.set(key0, []);
        samples.get(key0).push([pt[1], b]);
      }
      if (!S.length || !U.length) continue;
      const top = Math.min(...S);
      const below = U.filter((y) => y < top);
      if (!below.length) continue;
      const y = (top + Math.max(...below)) / 2;
      const key = planeKey(t.n, P[0]);
      if (!planes.has(key)) planes.set(key, []);
      planes.get(key).push(y);
    }
    const everyY = [...planes.values()].flat().sort((x, y) => x - y);
    const centres = [];
    for (const y of everyY) {
      const g = centres[centres.length - 1];
      if (g && y - g[g.length - 1] < size / 60) g.push(y); else centres.push([y]);
    }
    const snapped = centres.map((g) => g.reduce((s2, y) => s2 + y, 0) / g.length);
    const snap = (y) => snapped.reduce((b, c) => (Math.abs(c - y) < Math.abs(b - y) ? c : b), snapped[0]);
    const cutsOf = new Map();
    const reliable = new Map();
    for (const [key, list] of samples) {
      const cuts = [...new Set((planes.get(key) ?? []).map(snap))].sort((x, y) => x - y);
      const predict = (y) => {
        let best = null;
        for (const c of cuts) if (y > c) best = c;
        return best !== null;
      };
      const S = list.filter(([, b]) => b).length;
      let wrong = 0;
      if (cuts.length) for (const [y, b] of list) if (predict(y) !== b) wrong++;
      const ok = cuts.length ? wrong / list.length < 0.12 : S === 0 || S === list.length;
      reliable.set(key, ok);
      if (ok && cuts.length) cutsOf.set(key, cuts);
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
      const keyOf = (t) => planeKey(t.n, item.verts[t.c[0]].wp);
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
    for (const item of items) for (const t of item.tris) {
      if (!t.stone || Math.abs(t.n[1]) > 0.3) continue;
      const P = t.c.map((v) => item.verts[v].wp);
      if (!reliable.get(planeKey(t.n, P[0]))) continue;
      let hits = 0;
      for (const [x, u, w] of [[0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6], [1 / 3, 1 / 3, 1 / 3]]) {
        if (blocked([0, 1, 2].map((k) => P[0][k] * x + P[1][k] * u + P[2][k] * w), t.n)) hits++;
      }
      t.shadow = hits >= 3;
    }
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
  const span = new Map();
  stone.forEach(({ item, t }, i) => {
    const r = find(i);
    const s = span.get(r) ?? [Infinity, -Infinity];
    for (const v of t.c) { s[0] = Math.min(s[0], item.verts[v].wp[1]); s[1] = Math.max(s[1], item.verts[v].wp[1]); }
    span.set(r, s);
  });

  stone.forEach(({ item, t }, i) => {
    const sp = span.get(find(i));
    const centre = centreOf(item, t);
    const ny = t.n[1];
    t.tones = t.c.map((v) => {
      const p = item.verts[v].wp;
      const base = opt.ground + (opt.crown - opt.ground) * (p[1] - lo[1]) / ((hi[1] - lo[1]) || 1);
      const hp = (p[1] - sp[0]) / ((sp[1] - sp[0]) || 1);
      const side = opt.sideFoot + (base - opt.sideFoot) * hp;
      const top = base - opt.topLift, under = Math.max(base + opt.underDrop, opt.sideFoot);
      let tone = ny >= 0 ? side + (top - side) * ny : side + (under - side) * -ny;
      tone -= opt.sun * (1 - Math.abs(ny)) * dot(norm([t.n[0], 0, t.n[2]]), SUN);
      tone += opt.cover * coverAt(p, t.n, centre);
      if (t.shadow) tone += opt.shadow;
      return Math.max(opt.min, Math.min(opt.max, tone));
    });
  });

  const replaced = new Map();
  let corners = 0;
  for (const item of items) {
    const { prim } = item;
    const keys = new Map();
    const order = [];
    const indices = [];
    for (const t of item.tris) for (let k = 0; k < 3; k++) {
      const v = t.c[k];
      let uv = null;
      if (t.stone) {
        const [cu, cv] = t.cell.split(',').map(Number);
        uv = [(cu + 0.5) / 16, (cv + t.tones[k]) / 4];
        corners++;
      }
      const key = uv ? `${v}:${uv[0].toFixed(5)},${uv[1].toFixed(5)}` : `${v}`;
      if (!keys.has(key)) { keys.set(key, order.length); order.push({ v, uv }); }
      indices.push(keys.get(key));
    }
    const write = (a, isUv) => {
      const acc = json.accessors[a.ai];
      const [bytes, kind] = COMPONENT[acc.componentType];
      const w = WIDTH[acc.type];
      const buf = Buffer.alloc(bytes * w * order.length);
      const ints = acc.componentType !== 5126;
      const joints = a.name.startsWith('JOINTS');
      order.forEach(({ v, uv }, i) => {
        const vert = item.verts[v];
        for (let k = 0; k < w; k++) {
          let x;
          if (isUv && uv) x = uv[k];
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
