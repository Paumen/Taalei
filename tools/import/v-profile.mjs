import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix, welder } from './mesh-edit.mjs';

const HELP = `v-profile.mjs [--top <f>] [--bottom <f>] [--add <k> [--reach <r>] [--fit] [--keep-shadow] [--keep-under]] [--whole] [--dry] <workfile.glb> [...]

Sets the light-to-dark gradient of each piece by height. A piece is a run of
triangles joined on shared positions. Every vertex keeps its cell of
kits/colormap.png and its u; its v within the cell runs from <top> (default
0.08) at the highest point of its piece to <bottom> (default 0.85) at the
lowest. Twine, glass and amber cells are left as they are.

--add <k> keeps the light and dark of each face instead: it adds k times the
profile, less its mean over the piece, to the v the vertex has. A piece that
ends up past 0.02 or 0.95 is squeezed back into that range as a whole, so its
faces keep their order. --reach keeps it within r of the lightest and darkest
v the piece had. --fit adds less of the profile to a piece instead of
squeezing it, so its own light and dark stay as they were. --keep-shadow
leaves a piece as it is when its darkest point sits in its upper half, such as
a painted shadow under a cap or overhang. --keep-under leaves a vertex as it is
when it faces down or the model has geometry less than 0.15 of its height
right above it. --whole treats the whole model as one piece, so parts that
meet, such as a fin on a body, match where they join.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const LIGHT = 0.02;
const DARK = 0.95;
const UNDER = 0.15;
const KEEP = new Set(Object.entries(BANDS).filter(([band, cell]) => cell && /twine|glass|amber/.test(band)).map(([, cell]) => cell));

function overhung(pos, idx, m, y) {
  const count = pos.length / 3;
  const x = new Float64Array(count), z = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    x[i] = m[0] * pos[3 * i] + m[4] * pos[3 * i + 1] + m[8] * pos[3 * i + 2] + m[12];
    z[i] = m[2] * pos[3 * i] + m[6] * pos[3 * i + 1] + m[10] * pos[3 * i + 2] + m[14];
  }
  let lowY = Infinity, highY = -Infinity, lowX = Infinity, highX = -Infinity, lowZ = Infinity, highZ = -Infinity;
  for (let i = 0; i < count; i++) {
    lowY = Math.min(lowY, y[i]); highY = Math.max(highY, y[i]);
    lowX = Math.min(lowX, x[i]); highX = Math.max(highX, x[i]);
    lowZ = Math.min(lowZ, z[i]); highZ = Math.max(highZ, z[i]);
  }
  const height = highY - lowY || 1, near = UNDER * height, eps = 0.002 * height;
  const G = 24, sx = (highX - lowX) / G || 1, sz = (highZ - lowZ) / G || 1;
  const gx = (v) => Math.min(G - 1, Math.max(0, Math.floor((v - lowX) / sx)));
  const gz = (v) => Math.min(G - 1, Math.max(0, Math.floor((v - lowZ) / sz)));
  const grid = Array.from({ length: G * G }, () => []);
  const under = new Uint8Array(count);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const ny = (x[b] - x[a]) * (z[c] - z[a]) - (z[b] - z[a]) * (x[c] - x[a]);
    const ux = x[b] - x[a], uy = y[b] - y[a], uz = z[b] - z[a], vx = x[c] - x[a], vy = y[c] - y[a], vz = z[c] - z[a];
    const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx, len = Math.hypot(nx, ny, nz) || 1;
    if (ny / len > 0.5) under[a] = under[b] = under[c] = 1;
    if (Math.abs(ny / len) < 0.1) continue;
    for (let i = gx(Math.min(x[a], x[b], x[c])); i <= gx(Math.max(x[a], x[b], x[c])); i++)
      for (let k = gz(Math.min(z[a], z[b], z[c])); k <= gz(Math.max(z[a], z[b], z[c])); k++) grid[i * G + k].push(t);
  }
  for (let p = 0; p < count; p++) {
    if (under[p]) continue;
    for (const t of grid[gx(x[p]) * G + gz(z[p])]) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      const d = (z[b] - z[c]) * (x[a] - x[c]) + (x[c] - x[b]) * (z[a] - z[c]);
      const l1 = ((z[b] - z[c]) * (x[p] - x[c]) + (x[c] - x[b]) * (z[p] - z[c])) / d;
      const l2 = ((z[c] - z[a]) * (x[p] - x[c]) + (x[a] - x[c]) * (z[p] - z[c])) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const h = l1 * y[a] + l2 * y[b] + l3 * y[c] - y[p];
      if (h > eps && h < near) { under[p] = 1; break; }
    }
  }
  return under;
}

function profile(file, top, bottom, add, reach, fit, keepShadow, keepUnder, whole, dry) {
  const glb = readGlb(file);
  const replaced = new Map();
  let moved = 0;
  for (const prim of editablePrimitives(glb.json)) {
    const uvIndex = prim.attributes.TEXCOORD_0;
    const uvAccessor = glb.json.accessors[uvIndex];
    if (uvIndex === undefined || uvAccessor.componentType !== 5126) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv = Float32Array.from(readAccessor(glb, uvIndex).data);
    const idx = readAccessor(glb, prim.indices).data;
    const m = primitiveMatrix(glb.json, prim);
    const count = pos.length / 3;
    const y = new Float64Array(count);
    for (let i = 0; i < count; i++) y[i] = m[1] * pos[3 * i] + m[5] * pos[3 * i + 1] + m[9] * pos[3 * i + 2] + m[13];

    const under = keepUnder ? overhung(pos, idx, m, y) : null;
    const { weld } = welder(pos);
    const point = Array.from({ length: count }, (_, i) => weld(i));
    const parent = new Map();
    const find = (a) => {
      while (parent.has(a) && parent.get(a) !== a) a = parent.get(a);
      return a;
    };
    const join = (a, b) => {
      a = find(a); b = find(b);
      if (a !== b) parent.set(a, b);
    };
    const pieceOf = (i) => (whole ? 0 : find(point[i]));
    const cell = new Array(count).fill(null);
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      join(point[a], point[b]);
      join(point[b], point[c]);
      const cu = Math.floor(((uv[2 * a] + uv[2 * b] + uv[2 * c]) / 3) * 16);
      const cv = Math.floor(((uv[2 * a + 1] + uv[2 * b + 1] + uv[2 * c + 1]) / 3) * 4);
      for (const v of [a, b, c]) {
        const key = `${cu},${cv}`;
        cell[v] = cell[v] === null || cell[v] === key ? key : 'mixed';
      }
    }
    const span = new Map();
    for (let i = 0; i < count; i++) {
      const piece = pieceOf(i);
      const s = span.get(piece) ?? [Infinity, -Infinity];
      span.set(piece, [Math.min(s[0], y[i]), Math.max(s[1], y[i])]);
    }
    const shape = (i) => {
      const [low, high] = span.get(pieceOf(i));
      return high - low < 1e-9 ? null : top + ((high - y[i]) / (high - low)) * (bottom - top);
    };
    const mean = new Map();
    for (let i = 0; i < count; i++) {
      const f = shape(i);
      if (f === null) continue;
      const piece = pieceOf(i);
      const [sum, n] = mean.get(piece) ?? [0, 0];
      mean.set(piece, [sum + f, n + 1]);
    }
    const next = new Map();
    const range = new Map();
    const darkest = new Map();
    for (let i = 0; i < count; i++) {
      if (!cell[i] || cell[i] === 'mixed' || KEEP.has(cell[i])) continue;
      const f = shape(i);
      if (f === null) continue;
      const row = Number(cell[i].split(',')[1]);
      let v = f;
      if (add) {
        const piece = pieceOf(i);
        const [sum, n] = mean.get(piece);
        const was = uv[2 * i + 1] * 4 - row;
        v = was + add * (f - sum / n);
        const r = range.get(piece) ?? [Infinity, -Infinity, Infinity, -Infinity];
        range.set(piece, [Math.min(r[0], v), Math.max(r[1], v), Math.min(r[2], was), Math.max(r[3], was)]);
        const d = darkest.get(piece);
        if (!d || was > d[0]) darkest.set(piece, [was, i]);
      }
      next.set(i, [row, v]);
    }
    const shadowed = (piece) => {
      const d = darkest.get(piece), r = range.get(piece);
      const [low, high] = span.get(piece);
      return d && r[3] - r[2] > 0.2 && (y[d[1]] - low) / (high - low) > 0.5;
    };
    const scale = new Map();
    if (fit) {
      for (const [i, [row, raw]] of next) {
        const piece = pieceOf(i);
        const r = range.get(piece);
        const light = Math.max(LIGHT, r[2] - reach), dark = Math.min(DARK, r[3] + reach);
        const was = uv[2 * i + 1] * 4 - row, d = raw - was;
        const room = d > 1e-9 ? (dark - was) / d : d < -1e-9 ? (light - was) / d : 1;
        scale.set(piece, Math.max(0, Math.min(scale.get(piece) ?? 1, room)));
      }
    }
    for (const [i, [row, raw]] of next) {
      let v = raw;
      const piece = pieceOf(i);
      if (keepShadow && shadowed(piece)) continue;
      if (under && under[i]) continue;
      const r = range.get(piece);
      const light = r ? Math.max(LIGHT, r[2] - reach) : LIGHT, dark = r ? Math.min(DARK, r[3] + reach) : DARK;
      if (fit) {
        const was = uv[2 * i + 1] * 4 - row;
        v = was + (raw - was) * scale.get(piece);
      } else if (r && (r[0] < light || r[1] > dark)) {
        const low = Math.max(light, Math.min(r[0], dark)), high = Math.min(dark, Math.max(r[1], light));
        v = r[1] - r[0] < 1e-9 ? low : low + ((raw - r[0]) / (r[1] - r[0])) * (high - low);
      }
      uv[2 * i + 1] = (row + v) / 4;
      moved++;
    }
    replaced.set(uvIndex, Buffer.from(uv.buffer));
  }
  if (!dry && moved) {
    repack(glb, replaced);
    fixBounds(glb);
    writeGlb(file, glb.json, glb.bin, writeFileSync);
  }
  return moved;
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
const take = (flag, fallback) => {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  const value = Number(args[i + 1]);
  args.splice(i, 2);
  return value;
};
const top = take('--top', 0.08);
const bottom = take('--bottom', 0.85);
const add = take('--add', 0);
const reach = take('--reach', 1);
const fit = args.includes('--fit');
const keepShadow = args.includes('--keep-shadow');
const keepUnder = args.includes('--keep-under');
const whole = args.includes('--whole');
const dry = args.includes('--dry');
for (const file of args.filter((a) => !a.startsWith('--'))) console.log(`${file}: ${profile(file, top, bottom, add, reach, fit, keepShadow, keepUnder, whole, dry)} vertices`);
