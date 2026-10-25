import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix, welder } from './mesh-edit.mjs';

const HELP = `flora-shade.mjs --mode <plant|fungi|wood|trunk> [--bands <a,b>] [--keep-detail [--strength <k>]] [--dry] <workfile.glb> [...]

Sets the light-to-dark gradient of plants, mushrooms and dead wood by height.
Every vertex keeps its cell of kits/colormap.png and its u; only its v within
the cell changes. A vertex whose triangles all face down is an underside.

plant: per piece (shells welded on shared positions) of foliage in <bands>
  (default moss,hunter), v 0.08 of the band at the top of the piece to 0.85 at
  its bottom; undersides 0.92.
fungi: the cap runs from v 0.08 at its top to 0.85 at its rim, undersides
  0.92; the stem from 0.80 under the cap to 0.20 at its base. The rim is the
  lowest point of the widest part; below it is stem, and so is a narrow,
  upright stretch above it that sits under the cap.
wood: one gradient over the whole model for bark in <bands> (default bark),
  v 0.08 at the top to 0.85 at the base.
trunk: one gradient over the whole model for <bands> (default tan), v 0.80
  at the top to 0.20 at the base, as a trunk under a canopy.
Twine, glass and amber cells are left as they are.

--keep-detail keeps the light and dark each face already has: it adds the
gradient, less its mean over the piece (the whole model for wood), to the v
the vertex has, undersides included, and adds less of it to a piece that would
leave 0.02-0.95. --strength scales the added gradient (default 1), for models
whose own contrast or part tones it would drown.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const KEEP = new Set(['twine', 'glass', 'amber'].map((b) => BANDS[b]));
const TOP = 0.08;
const BOTTOM = 0.85;
const UNDER = 0.92;
const STEM_TOP = 0.8;
const STEM_BASE = 0.2;
const WIDE = 0.7;
const NARROW = 1.25;
const LIGHTEST = 0.02;
const DARKEST = 0.95;

const lerp = (y, high, low, a, b) => (high - low < 1e-9 ? null : a + Math.min(1, Math.max(0, (high - y) / (high - low))) * (b - a));

function load(glb) {
  const prims = [];
  for (const prim of editablePrimitives(glb.json)) {
    const uvIndex = prim.attributes.TEXCOORD_0;
    if (uvIndex === undefined || glb.json.accessors[uvIndex].componentType !== 5126) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv = Float32Array.from(readAccessor(glb, uvIndex).data);
    const idx = readAccessor(glb, prim.indices).data;
    const m = primitiveMatrix(glb.json, prim);
    const count = pos.length / 3;
    const w = Array.from({ length: count }, (_, i) => [0, 1, 2].map((k) => m[k] * pos[3 * i] + m[4 + k] * pos[3 * i + 1] + m[8 + k] * pos[3 * i + 2] + m[12 + k]));
    const cell = new Array(count).fill(null);
    const down = new Uint8Array(count).fill(1);
    const up = new Float64Array(count);
    const { weld } = welder(pos);
    const parent = new Map();
    const find = (a) => {
      while (parent.has(a) && parent.get(a) !== a) a = parent.get(a);
      return a;
    };
    const join = (a, b) => {
      a = find(a); b = find(b);
      if (a !== b) parent.set(a, b);
    };
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      join(weld(a), weld(b));
      join(weld(b), weld(c));
      const u = [0, 1, 2].map((k) => w[b][k] - w[a][k]), v = [0, 1, 2].map((k) => w[c][k] - w[a][k]);
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const ny = n[1] / (Math.hypot(...n) || 1);
      const key = `${Math.floor(((uv[2 * a] + uv[2 * b] + uv[2 * c]) / 3) * 16)},${Math.floor(((uv[2 * a + 1] + uv[2 * b + 1] + uv[2 * c + 1]) / 3) * 4)}`;
      for (const x of [a, b, c]) {
        cell[x] = cell[x] === null || cell[x] === key ? key : 'mixed';
        if (ny > -0.5) down[x] = 0;
        up[x] += ny;
      }
    }
    const piece = Array.from({ length: count }, (_, i) => find(weld(i)));
    prims.push({ uvIndex, uv, w, cell, down, up, piece, count });
  }
  return prims;
}

function targets(prims, mode, cells, keep) {
  const out = new Map();
  const take = (p, i) => p.cell[i] && p.cell[i] !== 'mixed' && !KEEP.has(p.cell[i]) && (!cells || cells.has(p.cell[i]));
  if (mode === 'plant') {
    for (const [k, p] of prims.entries()) {
      const span = new Map();
      for (let i = 0; i < p.count; i++) {
        if (!take(p, i)) continue;
        const s = span.get(p.piece[i]) ?? [Infinity, -Infinity];
        span.set(p.piece[i], [Math.min(s[0], p.w[i][1]), Math.max(s[1], p.w[i][1])]);
      }
      for (let i = 0; i < p.count; i++) {
        if (!take(p, i)) continue;
        const [low, high] = span.get(p.piece[i]);
        const v = p.down[i] && !keep ? UNDER : lerp(p.w[i][1], high, low, TOP, BOTTOM);
        if (v !== null) out.set(`${k}:${i}`, v);
      }
    }
    return out;
  }
  let low = Infinity, high = -Infinity;
  for (const p of prims) for (let i = 0; i < p.count; i++) if (take(p, i)) { low = Math.min(low, p.w[i][1]); high = Math.max(high, p.w[i][1]); }
  if (mode === 'wood' || mode === 'trunk') {
    const [a, b] = mode === 'wood' ? [TOP, BOTTOM] : [STEM_TOP, STEM_BASE];
    for (const [k, p] of prims.entries()) for (let i = 0; i < p.count; i++) {
      if (!take(p, i)) continue;
      const v = lerp(p.w[i][1], high, low, a, b);
      if (v !== null) out.set(`${k}:${i}`, v);
    }
    return out;
  }
  const h = high - low;
  let cx = 0, cz = 0, n = 0;
  for (const p of prims) for (let i = 0; i < p.count; i++) if (take(p, i) && p.w[i][1] < low + 0.15 * h) { cx += p.w[i][0]; cz += p.w[i][2]; n++; }
  cx /= n || 1; cz /= n || 1;
  const r = (p, i) => Math.hypot(p.w[i][0] - cx, p.w[i][2] - cz);
  let rmax = 0;
  for (const p of prims) for (let i = 0; i < p.count; i++) if (take(p, i)) rmax = Math.max(rmax, r(p, i));
  let rim = Infinity;
  for (const p of prims) for (let i = 0; i < p.count; i++) if (take(p, i) && r(p, i) > WIDE * rmax) rim = Math.min(rim, p.w[i][1]);
  const stemless = rim < low + 0.2 * h;
  const lower = [];
  let underTop = -Infinity;
  for (const p of prims) for (let i = 0; i < p.count; i++) {
    if (!take(p, i)) continue;
    if (p.w[i][1] < rim) lower.push(r(p, i));
    if (p.down[i]) underTop = Math.max(underTop, p.w[i][1]);
  }
  lower.sort((a, b) => a - b);
  const stemR = lower.length ? lower[Math.floor(0.75 * (lower.length - 1))] : 0;
  for (const [k, p] of prims.entries()) for (let i = 0; i < p.count; i++) {
    if (!take(p, i)) continue;
    const y = p.w[i][1];
    const stem = !stemless && (y < rim || (y <= underTop && !p.down[i] && p.up[i] < 0.5 && r(p, i) < NARROW * stemR));
    let v;
    if (stem) v = lerp(Math.min(y, rim), rim, low, STEM_TOP, STEM_BASE);
    else if (p.down[i] && !keep) v = UNDER;
    else v = lerp(y, high, stemless ? low : rim, TOP, BOTTOM);
    if (v !== null) out.set(`${k}:${i}`, v);
  }
  return out;
}

function keepDetail(prims, set, whole, strength) {
  const sum = new Map();
  for (const [key, v] of set) {
    const [k, i] = key.split(':').map(Number);
    const g = whole ? 'all' : `${k}:${prims[k].piece[i]}`;
    const s = sum.get(g) ?? [0, 0];
    sum.set(g, [s[0] + v, s[1] + 1]);
  }
  const was = (k, i) => prims[k].uv[2 * i + 1] * 4 - Number(prims[k].cell[i].split(',')[1]);
  const scale = new Map();
  for (const [key, v] of set) {
    const [k, i] = key.split(':').map(Number);
    const g = whole ? 'all' : `${k}:${prims[k].piece[i]}`;
    const [s, n] = sum.get(g);
    const d = (v - s / n) * strength, w = was(k, i);
    const room = d > 1e-9 ? (DARKEST - w) / d : d < -1e-9 ? (LIGHTEST - w) / d : 1;
    scale.set(g, Math.max(0, Math.min(scale.get(g) ?? 1, room)));
  }
  const out = new Map();
  for (const [key, v] of set) {
    const [k, i] = key.split(':').map(Number);
    const g = whole ? 'all' : `${k}:${prims[k].piece[i]}`;
    const [s, n] = sum.get(g);
    out.set(key, was(k, i) + (v - s / n) * strength * scale.get(g));
  }
  return out;
}

function shade(file, mode, cells, keep, strength, dry) {
  const glb = readGlb(file);
  const prims = load(glb);
  let set = targets(prims, mode, cells, keep);
  if (keep) set = keepDetail(prims, set, mode === 'wood' || mode === 'trunk', strength);
  const replaced = new Map();
  for (const [k, p] of prims.entries()) {
    for (let i = 0; i < p.count; i++) {
      const v = set.get(`${k}:${i}`);
      if (v === undefined) continue;
      const row = Number(p.cell[i].split(',')[1]);
      p.uv[2 * i + 1] = (row + v) / 4;
    }
    replaced.set(p.uvIndex, Buffer.from(p.uv.buffer));
  }
  if (!dry && set.size) {
    repack(glb, replaced);
    fixBounds(glb);
    writeGlb(file, glb.json, glb.bin, writeFileSync);
  }
  return set.size;
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
const opt = (flag) => {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const mode = opt('--mode');
if (!['plant', 'fungi', 'wood', 'trunk'].includes(mode)) throw new Error('--mode plant, fungi, wood or trunk');
const names = opt('--bands') ?? { plant: 'moss,hunter', wood: 'bark', trunk: 'tan' }[mode];
const cells = names ? new Set(names.split(',').map((b) => {
  if (!BANDS[b]) throw new Error(`no such band: ${b}`);
  return BANDS[b];
})) : null;
const keep = args.includes('--keep-detail');
const strength = Number(opt('--strength') ?? 1);
const dry = args.includes('--dry');
for (const file of args.filter((a) => !a.startsWith('--'))) console.log(`${file}: ${shade(file, mode, cells, keep, strength, dry)} vertices`);
