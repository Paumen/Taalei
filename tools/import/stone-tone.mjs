import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder, welder, primitiveMatrix } from './mesh-edit.mjs';

const HELP = `stone-tone.mjs [--tones <list>] [--top <d>] [--bottom <d>] [--debug] [--dry] <workfile.glb> [...]

Gives each stone in the ivory, taupe and taupe-dark bands of kits/colormap.png
its own shade, and shades its faces by direction: faces turned up lighter,
faces turned sideways as they are, faces turned down darkest. A stone is a run
of triangles in one stone band that share corners. Each stone's v in its band
moves by one of the tones (default -0.24,-0.12,0,0.12,0.24), each used about
equally and shuffled per file, seeded by its name. On top of that a face moves
by --top (default -0.12) when it points up and --bottom (default 0.3) when it
points down, blended in between. Faces keep their own light and dark
within its stone and facing: each facing of a stone is set from the stone's
own sideways shade, so old light tops or dark caps do not carry over. A stone pushed past 0.02 or 0.95 is shifted back whole.
--debug writes each stone in a bright band instead, to check the stone map.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const STONE = new Set(['ivory', 'taupe', 'taupe-dark'].map((b) => BANDS[b]));
const LOUD = ['sienna', 'hunter', 'azure', 'amber', 'moss', 'terracotta', 'slate', 'chestnut'].map((b) => BANDS[b].split(',').map(Number));
const LIGHT = 0.02;
const DARK = 0.95;

function seeded(text) {
  let seed = 1;
  for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) % 2147483647;
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

const ramp = (x, from, to) => Math.max(0, Math.min(1, (x - from) / (to - from)));

function tone(file, opts) {
  const glb = readGlb(file);
  const replaced = new Map();
  const R = seeded(basename(file));
  let stones = 0;
  for (const prim of editablePrimitives(glb.json)) {
    const uvIndex = prim.attributes.TEXCOORD_0;
    if (uvIndex === undefined || glb.json.accessors[uvIndex].componentType !== 5126) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv0 = readAccessor(glb, uvIndex).data;
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const m = primitiveMatrix(glb.json, prim);
    const { weld } = welder(pos);
    const point = Array.from({ length: pos.length / 3 }, (_, i) => weld(i));
    const tris = idx.length / 3;
    const cell = new Array(tris);
    for (let t = 0; t < tris; t++) {
      const [a, b, c] = idx.slice(3 * t, 3 * t + 3);
      const cu = Math.floor(((uv0[2 * a] + uv0[2 * b] + uv0[2 * c]) / 3) * 16);
      const cv = Math.floor(((uv0[2 * a + 1] + uv0[2 * b + 1] + uv0[2 * c + 1]) / 3) * 4);
      cell[t] = `${cu},${cv}`;
    }
    const parent = new Map();
    const find = (a) => {
      while (parent.has(a) && parent.get(a) !== a) a = parent.get(a);
      return a;
    };
    const join = (a, b) => {
      a = find(a); b = find(b);
      if (a !== b) parent.set(a, b);
    };
    const key = (t, k) => `${cell[t]}|${point[idx[3 * t + k]]}`;
    for (let t = 0; t < tris; t++) {
      if (!STONE.has(cell[t])) continue;
      join(key(t, 0), key(t, 1));
      join(key(t, 1), key(t, 2));
    }
    const pieceOf = new Map();
    const pieces = [];
    const triPiece = new Int32Array(tris).fill(-1);
    for (let t = 0; t < tris; t++) {
      if (!STONE.has(cell[t])) continue;
      const root = find(key(t, 0));
      if (!pieceOf.has(root)) { pieceOf.set(root, pieces.length); pieces.push({ tris: [] }); }
      triPiece[t] = pieceOf.get(root);
      pieces[triPiece[t]].tris.push(t);
    }
    if (!pieces.length) continue;
    const order = pieces.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((p, k) => { pieces[p].tone = opts.tones[k % opts.tones.length]; pieces[p].loud = LOUD[k % LOUD.length]; });

    const shade = new Float64Array(tris);
    const area = new Float64Array(tris);
    for (let t = 0; t < tris; t++) {
      if (triPiece[t] < 0) continue;
      const [a, b, c] = idx.slice(3 * t, 3 * t + 3).map((v) => [0, 1, 2].map((k) => pos[3 * v + k]));
      const u = [0, 1, 2].map((k) => b[k] - a[k]), w = [0, 1, 2].map((k) => c[k] - a[k]);
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const wy = m[1] * n[0] + m[5] * n[1] + m[9] * n[2];
      const wl = Math.hypot(m[0] * n[0] + m[4] * n[1] + m[8] * n[2], wy, m[2] * n[0] + m[6] * n[1] + m[10] * n[2]) || 1;
      const ny = wy / wl;
      area[t] = Math.hypot(...n) / 2;
      shade[t] = ny > 0 ? opts.top * ramp(ny, 0.3, 0.8) : opts.bottom * ramp(-ny, 0.3, 0.8);
    }

    const target = new Map();
    const old = (v, t) => uv0[2 * v + 1] * 4 - Number(cell[t].split(',')[1]);
    const facing = (t) => (shade[t] < opts.top / 2 ? 0 : shade[t] > opts.bottom / 2 ? 2 : 1);
    const value = (v, t) => {
      const piece = pieces[triPiece[t]];
      return old(v, t) - piece.mean[facing(t)] + piece.base + piece.tone + shade[t];
    };
    for (const piece of pieces) {
      const sum = [0, 0, 0], weight = [0, 0, 0];
      for (const t of piece.tris) {
        const f = facing(t), w = area[t] + 1e-12;
        for (let k = 0; k < 3; k++) sum[f] += (w * old(idx[3 * t + k], t)) / 3;
        weight[f] += w;
      }
      const all = sum.reduce((a, b) => a + b) / weight.reduce((a, b) => a + b);
      piece.mean = sum.map((x, f) => (weight[f] ? x / weight[f] : all));
      piece.base = weight[1] ? piece.mean[1] : all;
      let low = Infinity, high = -Infinity;
      for (const t of piece.tris) for (let k = 0; k < 3; k++) {
        const nv = value(idx[3 * t + k], t);
        low = Math.min(low, nv); high = Math.max(high, nv);
      }
      piece.shift = low < LIGHT ? Math.min(LIGHT - low, DARK - high) : high > DARK ? Math.max(DARK - high, LIGHT - low) : 0;
      stones++;
    }

    const adder = vertexAdder(glb, prim);
    const next = idx.slice();
    const extra = [];
    const owner = new Map();
    const setUv = (v, t) => {
      const piece = pieces[triPiece[t]];
      if (opts.debug) {
        const [lc, lr] = piece.loud;
        return [(lc + 0.5) / 16, (lr + 0.3 + 0.4 * ((shade[t] - opts.top) / (opts.bottom - opts.top || 1))) / 4];
      }
      const nv = value(v, t) + piece.shift;
      const row = Number(cell[t].split(',')[1]);
      return [uv0[2 * v], (row + Math.max(LIGHT, Math.min(DARK, nv))) / 4];
    };
    for (let t = 0; t < tris; t++) {
      if (triPiece[t] < 0) continue;
      for (let k = 0; k < 3; k++) {
        const v = idx[3 * t + k];
        const want = setUv(v, t);
        const id = `${want[0].toFixed(6)},${want[1].toFixed(6)}`;
        const seen = owner.get(v);
        if (!seen) { owner.set(v, new Map([[id, v]])); target.set(v, want); continue; }
        if (seen.has(id)) { next[3 * t + k] = seen.get(id); continue; }
        const added = adder.add(v);
        seen.set(id, added);
        extra.push(want);
        next[3 * t + k] = added;
      }
    }
    if (opts.dry) continue;
    adder.commit(next, replaced);
    const base = uv0.length / 2;
    const uv = new Float32Array(2 * (base + extra.length));
    uv.set(uv0);
    for (const [v, [s, tv]] of target) { uv[2 * v] = s; uv[2 * v + 1] = tv; }
    extra.forEach(([s, tv], k) => { uv[2 * (base + k)] = s; uv[2 * (base + k) + 1] = tv; });
    replaced.set(uvIndex, Buffer.from(uv.buffer));
  }
  if (!opts.dry && stones) {
    repack(glb, replaced);
    fixBounds(glb);
    writeGlb(file, glb.json, glb.bin, writeFileSync);
  }
  return stones;
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
const take = (flag, fallback) => {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const opts = {
  tones: take('--tones', '-0.24,-0.12,0,0.12,0.24').split(',').map(Number),
  top: Number(take('--top', -0.12)),
  bottom: Number(take('--bottom', 0.3)),
  debug: args.includes('--debug'),
  dry: args.includes('--dry'),
};
for (const file of args.filter((a) => !a.startsWith('--'))) console.log(`${file}: ${tone(file, opts)} stones`);
