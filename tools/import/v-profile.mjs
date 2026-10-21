import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix, welder } from './mesh-edit.mjs';

const HELP = `v-profile.mjs [--top <f>] [--bottom <f>] [--add <k> [--reach <r>] [--fit]] [--dry] <workfile.glb> [...]

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
squeezing it, so its own light and dark stay as they were.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const LIGHT = 0.02;
const DARK = 0.95;
const KEEP = new Set(Object.entries(BANDS).filter(([band, cell]) => cell && /twine|glass|amber/.test(band)).map(([, cell]) => cell));

function profile(file, top, bottom, add, reach, fit, dry) {
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
      const piece = find(point[i]);
      const s = span.get(piece) ?? [Infinity, -Infinity];
      span.set(piece, [Math.min(s[0], y[i]), Math.max(s[1], y[i])]);
    }
    const shape = (i) => {
      const [low, high] = span.get(find(point[i]));
      return high - low < 1e-9 ? null : top + ((high - y[i]) / (high - low)) * (bottom - top);
    };
    const mean = new Map();
    for (let i = 0; i < count; i++) {
      const f = shape(i);
      if (f === null) continue;
      const piece = find(point[i]);
      const [sum, n] = mean.get(piece) ?? [0, 0];
      mean.set(piece, [sum + f, n + 1]);
    }
    const next = new Map();
    const range = new Map();
    for (let i = 0; i < count; i++) {
      if (!cell[i] || cell[i] === 'mixed' || KEEP.has(cell[i])) continue;
      const f = shape(i);
      if (f === null) continue;
      const row = Number(cell[i].split(',')[1]);
      let v = f;
      if (add) {
        const piece = find(point[i]);
        const [sum, n] = mean.get(piece);
        const was = uv[2 * i + 1] * 4 - row;
        v = was + add * (f - sum / n);
        const r = range.get(piece) ?? [Infinity, -Infinity, Infinity, -Infinity];
        range.set(piece, [Math.min(r[0], v), Math.max(r[1], v), Math.min(r[2], was), Math.max(r[3], was)]);
      }
      next.set(i, [row, v]);
    }
    const scale = new Map();
    if (fit) {
      for (const [i, [row, raw]] of next) {
        const piece = find(point[i]);
        const r = range.get(piece);
        const light = Math.max(LIGHT, r[2] - reach), dark = Math.min(DARK, r[3] + reach);
        const was = uv[2 * i + 1] * 4 - row, d = raw - was;
        const room = d > 1e-9 ? (dark - was) / d : d < -1e-9 ? (light - was) / d : 1;
        scale.set(piece, Math.max(0, Math.min(scale.get(piece) ?? 1, room)));
      }
    }
    for (const [i, [row, raw]] of next) {
      let v = raw;
      const piece = find(point[i]);
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
const dry = args.includes('--dry');
for (const file of args.filter((a) => !a.startsWith('--'))) console.log(`${file}: ${profile(file, top, bottom, add, reach, fit, dry)} vertices`);
