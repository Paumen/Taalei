import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor, worldMatrices } from '../../catalog/tools/glb.mjs';
import { repack, rawRows } from './mesh-edit.mjs';

const HELP = `masonry-shade.mjs [options] <workfile.glb> [...]

Shades the stone faces of masonry models from scratch, rule by rule.
Each face corner gets a tone in its band (0 light, 1 dark):

  facing   a face pointing up is light, a side mid, a face pointing down dark;
           sides turned toward the light are a little lighter
  fade     darker at the bottom of the model, lighter toward the top
  hollow   corners in recesses and under overhangs are darker
  seams    flat faces meeting at a hard edge differ by at least this tone

Options:
  --bands <a,b>      bands to shade, default taupe,taupe-dark
  --up <t> --side <t> --down <t>   facing tones, default 0.15 0.45 0.80
  --sun <t>          extra light/dark on sides by direction, default 0.12
  --fade <t>         bottom-to-top spread, default 0.15
  --hollow <t>       darkening at full cover, default 0.35
  --reach <f>        hollow ray length as a share of the model size, default 0.2
  --seams <t>        least tone gap across a hard edge, default 0.14

Defaults are the values set for the masonry-mid smooth-detail group.
  --out <dir>        write copies there (kit/name.glb, with the colour map) instead of in place`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LANES = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(0); }
const opt = { bands: 'taupe,taupe-dark', up: 0.15, side: 0.45, down: 0.8, sun: 0.12, fade: 0.15, hollow: 0.35, reach: 0.2, seams: 0.14, out: null };
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    if (!(k in opt)) throw new Error(`unknown option ${a}`);
    opt[k] = typeof opt[k] === 'number' ? Number(args[++i]) : args[++i];
  } else files.push(a);
}

const cellOf = (u, v) => `${Math.floor(u * 16)},${Math.floor(v * 4)}`;
const bandCells = new Set(opt.bands.split(',').map((b) => {
  if (!LANES[b]) throw new Error(`unknown band ${b}`);
  return LANES[b];
}));
const SUN = (() => { const s = [-0.5, 0, 0.87]; const l = Math.hypot(...s); return s.map((x) => x / l); })();

const apply = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function primsWithNodes(json) {
  const world = worldMatrices(json);
  const out = [];
  (json.nodes ?? []).forEach((n, i) => {
    if (n.mesh === undefined || !world[i]) return;
    for (const prim of json.meshes[n.mesh].primitives) out.push({ prim, matrix: world[i] });
  });
  return out;
}

function buildGrid(tris, size) {
  const cell = size / 24;
  const map = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  tris.forEach((t, ti) => {
    const lo = [0, 1, 2].map((k) => Math.floor(Math.min(t[0][k], t[1][k], t[2][k]) / cell));
    const hi = [0, 1, 2].map((k) => Math.floor(Math.max(t[0][k], t[1][k], t[2][k]) / cell));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const k = key(x, y, z);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(ti);
    }
  });
  return { cell, map, key };
}

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

function rayHits(grid, tris, o, d, near, far) {
  const step = grid.cell * 0.5;
  const seen = new Set();
  for (let s = 0; s <= far + step; s += step) {
    const p = [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s];
    const k = grid.key(...p.map((x) => Math.floor(x / grid.cell)));
    for (const ti of grid.map.get(k) ?? []) {
      if (seen.has(ti)) continue;
      seen.add(ti);
      const t = hit(o, d, tris[ti]);
      if (t > near && t < far) return true;
    }
  }
  return false;
}

const DIRS = (() => {
  const out = [];
  const n = 48;
  for (let i = 0; i < n; i++) {
    const z = 1 - (i + 0.5) / n;
    const r = Math.sqrt(1 - z * z);
    const a = i * 2.39996;
    out.push([r * Math.cos(a), r * Math.sin(a), z]);
  }
  return out;
})();

function hemisphere(nrm) {
  const t = Math.abs(nrm[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const x = norm(cross(t, nrm)), y = cross(nrm, x);
  return DIRS.map(([a, b, c]) => [x[0] * a + y[0] * b + nrm[0] * c, x[1] * a + y[1] * b + nrm[1] * c, x[2] * a + y[2] * b + nrm[2] * c]);
}

function shade(file) {
  const glb = readGlb(file);
  const { json } = glb;
  const items = primsWithNodes(json).filter(({ prim }) => (prim.mode ?? 4) === 4 && prim.indices !== undefined && prim.attributes.TEXCOORD_0 !== undefined);
  const allTris = [];
  const per = items.map(({ prim, matrix }) => {
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
    const idx = readAccessor(glb, prim.indices).data;
    const wp = [];
    for (let i = 0; i < pos.length / 3; i++) wp.push(apply(matrix, [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]));
    const tris = [];
    for (let t = 0; t < idx.length / 3; t++) {
      const c = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]];
      const P = c.map((v) => wp[v]);
      const n = norm(cross(sub(P[1], P[0]), sub(P[2], P[0])));
      const mu = (uv[c[0] * 2] + uv[c[1] * 2] + uv[c[2] * 2]) / 3;
      const mv = (uv[c[0] * 2 + 1] + uv[c[1] * 2 + 1] + uv[c[2] * 2 + 1]) / 3;
      const cell = cellOf(mu, mv);
      tris.push({ c, P, n, cell, stone: bandCells.has(cell) });
      allTris.push(P);
    }
    return { prim, uv, wp, tris };
  });
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const P of allTris) for (const p of P) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const grid = (opt.hollow > 0) ? buildGrid(allTris, size) : null;

  const hollowAt = new Map();
  const cornerKey = (p, n) => [...p.map((x) => Math.round(x / (size * 1e-4))), ...n.map((x) => Math.round(x * 20))].join(',');
  if (grid) {
    const sums = new Map();
    for (const { tris } of per) for (const t of tris) {
      if (!t.stone) continue;
      const centre = [0, 1, 2].map((j) => (t.P[0][j] + t.P[1][j] + t.P[2][j]) / 3);
      const dirs = hemisphere(t.n);
      for (let k = 0; k < 3; k++) {
        const p = t.P[k];
        const o = [0, 1, 2].map((j) => p[j] + (centre[j] - p[j]) * 0.35 + t.n[j] * size * 1e-3);
        let blocked = 0, total = 0;
        for (const d of dirs) {
          const w = 0.3 + 0.7 * Math.max(0, d[1]);
          total += w;
          if (rayHits(grid, allTris, o, d, size * 0.03, size * opt.reach)) blocked += w;
        }
        const key = cornerKey(p, t.n);
        const s = sums.get(key) ?? [0, 0];
        s[0] += blocked / total; s[1] += 1;
        sums.set(key, s);
      }
    }
    for (const [k, [a, n]] of sums) hollowAt.set(k, a / n);
  }

  const stoneTris = [];
  for (const { tris } of per) for (const t of tris) {
    if (!t.stone) continue;
    t.tones = t.P.map((p) => {
      const ny = t.n[1];
      let tone = ny >= 0 ? opt.side + (opt.up - opt.side) * ny : opt.side + (opt.down - opt.side) * -ny;
      tone -= opt.sun * (1 - Math.abs(ny)) * dot(norm([t.n[0], 0, t.n[2]]), SUN);
      if (opt.fade > 0) tone += opt.fade * (0.5 - (p[1] - lo[1]) / ((hi[1] - lo[1]) || 1));
      if (grid) tone += opt.hollow * hollowAt.get(cornerKey(p, t.n));
      return tone;
    });
    stoneTris.push(t);
  }

  if (opt.seams > 0) {
    const q = size * 1e-4;
    const pk = (p) => p.map((x) => Math.round(x / q)).join(',');
    const edges = new Map();
    stoneTris.forEach((t, i) => {
      for (let e = 0; e < 3; e++) {
        const a = pk(t.P[e]), b = pk(t.P[(e + 1) % 3]);
        const k = a < b ? a + '|' + b : b + '|' + a;
        if (!edges.has(k)) edges.set(k, []);
        edges.get(k).push(i);
      }
    });
    const root = stoneTris.map((_, i) => i);
    const find = (i) => { while (root[i] !== i) i = root[i] = root[root[i]]; return i; };
    for (const list of edges.values()) for (const i of list) for (const j of list) {
      if (i < j && dot(stoneTris[i].n, stoneTris[j].n) > 0.999) root[find(i)] = find(j);
    }
    const mean = new Map();
    stoneTris.forEach((t, i) => {
      const r = find(i);
      const m = mean.get(r) ?? [0, 0];
      m[0] += t.tones[0] + t.tones[1] + t.tones[2]; m[1] += 3;
      mean.set(r, m);
    });
    const base = new Map([...mean].map(([r, [a, n]]) => [r, a / n]));
    const off = new Map([...base.keys()].map((r) => [r, 0]));
    const pairs = new Set();
    for (const list of edges.values()) for (const i of list) for (const j of list) {
      const a = find(i), b = find(j);
      if (a < b && dot(stoneTris[i].n, stoneTris[j].n) < 0.866) pairs.add(a + ',' + b);
    }
    for (let round = 0; round < 6; round++) {
      for (const pr of pairs) {
        const [a, b] = pr.split(',').map(Number);
        const ta = base.get(a) + off.get(a), tb = base.get(b) + off.get(b);
        const gap = Math.abs(ta - tb);
        if (gap >= opt.seams) continue;
        const push = (opt.seams - gap) / 2;
        const dir = ta < tb || (ta === tb && a < b) ? -1 : 1;
        const cap = opt.seams / 2;
        off.set(a, Math.max(-cap, Math.min(cap, off.get(a) + dir * push)));
        off.set(b, Math.max(-cap, Math.min(cap, off.get(b) - dir * push)));
      }
    }
    stoneTris.forEach((t, i) => { const o = off.get(find(i)); t.tones = t.tones.map((x) => x + o); });
  }

  let changed = 0;
  const replaced = new Map();
  for (const item of per) {
    const { prim, uv, tris } = item;
    const corners = [];
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        if (!t.stone) { corners.push({ v: t.c[k], uv: null }); continue; }
        const tone = Math.max(0.03, Math.min(0.97, t.tones[k]));
        const [cu, cv] = t.cell.split(',').map(Number);
        corners.push({ v: t.c[k], uv: [(cu + 0.5) / 16, (cv + tone) / 4] });
      }
    }
    const keys = new Map();
    const order = [];
    const indices = corners.map(({ v, uv: nuv }) => {
      const key = nuv ? `${v}:${nuv[0].toFixed(5)},${nuv[1].toFixed(5)}` : `${v}`;
      if (!keys.has(key)) { keys.set(key, order.length); order.push({ v, nuv }); }
      return keys.get(key);
    });
    const attrs = Object.entries(prim.attributes);
    for (const [name, ai] of attrs) {
      const { size: rs, row } = rawRows(glb, ai);
      const bytes = Buffer.alloc(rs * order.length);
      order.forEach(({ v, nuv }, i) => {
        if (name === 'TEXCOORD_0' && nuv) {
          const acc = json.accessors[ai];
          if (acc.componentType !== 5126) throw new Error(`${file}: TEXCOORD_0 is not float`);
          bytes.writeFloatLE(nuv[0], i * rs);
          bytes.writeFloatLE(nuv[1], i * rs + 4);
          changed++;
        } else row(v).copy(bytes, i * rs);
      });
      replaced.set(ai, bytes);
      json.accessors[ai].count = order.length;
    }
    for (const target of prim.targets ?? []) for (const ai of Object.values(target)) {
      const { size: rs, row } = rawRows(glb, ai);
      const bytes = Buffer.alloc(rs * order.length);
      order.forEach(({ v }, i) => row(v).copy(bytes, i * rs));
      replaced.set(ai, bytes);
      json.accessors[ai].count = order.length;
    }
    const wide = order.length > 65535;
    const ib = Buffer.alloc(indices.length * (wide ? 4 : 2));
    indices.forEach((x, i) => (wide ? ib.writeUInt32LE(x, i * 4) : ib.writeUInt16LE(x, i * 2)));
    const ia = json.accessors[prim.indices];
    ia.componentType = wide ? 5125 : 5123;
    ia.count = indices.length;
    delete ia.min; delete ia.max;
    replaced.set(prim.indices, ib);
    const uva = json.accessors[prim.attributes.TEXCOORD_0];
    delete uva.min; delete uva.max;
  }
  repack(glb, replaced);
  for (const a of json.accessors) {
    if (a.bufferView === undefined || !a.min) continue;
    const { data, width, count } = readAccessor(glb, json.accessors.indexOf(a));
    const mn = new Array(width).fill(Infinity), mx = new Array(width).fill(-Infinity);
    for (let i = 0; i < count; i++) for (let k = 0; k < width; k++) { mn[k] = Math.min(mn[k], data[i * width + k]); mx[k] = Math.max(mx[k], data[i * width + k]); }
    a.min = mn; a.max = mx;
  }
  let target = file;
  if (opt.out) {
    const kit = basename(dirname(file));
    const dir = resolve(opt.out, kit);
    mkdirSync(resolve(dir, 'Textures'), { recursive: true });
    if (!existsSync(resolve(dir, 'Textures', 'colormap.png'))) copyFileSync(resolve(ROOT, 'kits', 'colormap.png'), resolve(dir, 'Textures', 'colormap.png'));
    target = resolve(dir, basename(file));
  }
  writeGlb(target, json, glb.bin, writeFileSync);
  return changed;
}

for (const f of files) {
  const n = shade(f);
  console.log(`${f}: ${n} stone corners`);
}
