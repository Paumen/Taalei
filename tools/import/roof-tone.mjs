import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix, welder, rawRows, vertexAdder } from './mesh-edit.mjs';

const HELP = `roof-tone.mjs --type <ceramic|wood|thatch|stone|metal|cloth> [--cut <f>] [--top <f>] [--bottom <f>] [--keep-mean] [--add] [--min-piece <f>] [--by-plane] [--keep-upright] [--ramp-upright] [--keep-under] [--whole] [--cell <col,row>] [--exclude <x0,y0,z0,x1,y1,z1> ...] [--dry] <workfile.glb> [...]

Gives the roof of each model one band and one shading by roof type and shape.
The roof is the band seen most from above (above --cut of the model's height,
default 0 for roof parts; pass 0.4 for buildings), on the pieces that carry it.
Pitched, cone and dome pieces run from light at their top to dark at their
eaves (--keep-mean centres that run on the piece's old mean tone); flat pieces
get one tone; faces under the roof get 0.90. Upright faces and faces hidden
from above keep their tone; upright faces below the roof are left alone. Each
face keeps its own light and dark against its piece's old gradient. Cloth
keeps its band. --whole runs one gradient over all sloped roof pieces of the
model by height. --cell picks the roof band's cell instead of the one seen
most. --exclude leaves faces whose centre lies in that box alone, given as
fractions 0-1 of the model's bounds; it may repeat. --add keeps each face's
old tone and adds the gradient on top, so stepped planks keep their lines.
--min-piece leaves pieces alone whose roof area is under that share of the
largest roof piece, such as ribs, curbs or small canopies. --by-plane splits
pieces into flat parts, so each plank face of a welded roof gets its own run.
--keep-upright leaves upright faces fully alone, colour band too, such as
parapet walls. --ramp-upright gives upright roof edges the run of their piece. --keep-under
keeps faces turned down at their tone, such as the sides of roof ribs.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const TYPES = {
  ceramic: { band: 'sienna', top: 0.15, bottom: 0.8 },
  wood: { band: 'chestnut', top: 0.15, bottom: 0.8 },
  thatch: { band: 'tan', top: 0.25, bottom: 0.7 },
  stone: { band: 'taupe', top: 0.15, bottom: 0.8 },
  metal: { band: 'nickel', top: 0.2, bottom: 0.7 },
  cloth: { band: null, top: 0.3, bottom: 0.6 },
};
const FLAT = 0.4, UNDER = 0.9, LIGHT = 0.02, DARK = 0.95, G = 128;
const SKIP = new Set(Object.entries(BANDS).filter(([b, c]) => c && /glass|twine|amber/.test(b)).map(([, c]) => c));

function tone(file, type, cut, dry) {
  const glb = readGlb(file);
  const spec = TYPES[type];
  const target = spec.band && BANDS[spec.band].split(',').map(Number);
  let changed = 0;
  const replaced = new Map();
  for (const prim of editablePrimitives(glb.json)) {
    const uvIndex = prim.attributes.TEXCOORD_0;
    if (uvIndex === undefined || glb.json.accessors[uvIndex].componentType !== 5126) continue;
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv = readAccessor(glb, uvIndex).data;
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const m = primitiveMatrix(glb.json, prim);
    const n = pos.length / 3, T = idx.length / 3;
    const W = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++)
      W[3 * i + k] = m[k] * pos[3 * i] + m[4 + k] * pos[3 * i + 1] + m[8 + k] * pos[3 * i + 2] + m[12 + k];
    const P = (i, k) => W[3 * i + k];

    const { weld } = welder(pos);
    const parent = new Map();
    const find = (a) => { while (parent.has(a) && parent.get(a) !== a) a = parent.get(a); return a; };
    const nx = new Float64Array(T), nz = new Float64Array(T), ny = new Float64Array(T), area = new Float64Array(T), cell = new Array(T);
    for (let t = 0; t < T; t++) {
      const [a, b, c] = idx.slice(3 * t, 3 * t + 3);
      const u = [0, 1, 2].map((k) => P(b, k) - P(a, k)), v = [0, 1, 2].map((k) => P(c, k) - P(a, k));
      const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const L = Math.hypot(...nn);
      area[t] = L / 2; ny[t] = L ? nn[1] / L : 0; nx[t] = L ? nn[0] / L : 0; nz[t] = L ? nn[2] / L : 0;
      cell[t] = `${Math.floor(((uv[2 * a] + uv[2 * b] + uv[2 * c]) / 3) * 16)},${Math.floor(((uv[2 * a + 1] + uv[2 * b + 1] + uv[2 * c + 1]) / 3) * 4)}`;
      const pa = find(weld(a)), pb = find(weld(b)), pc = find(weld(c));
      if (pa !== pb) parent.set(pa, pb);
      if (find(pb) !== find(pc)) parent.set(find(pb), find(pc));
    }
    const piece = (t) => byPlane ? `${find(weld(idx[3 * t]))}|${[nx[t], ny[t], nz[t]].map((v) => Math.round(v * 20)).join()}` : find(weld(idx[3 * t]));

    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P(i, k)); hi[k] = Math.max(hi[k], P(i, k)); }
    const s = Math.max(hi[0] - lo[0], hi[2] - lo[2]) / G || 1;
    const zb = new Float64Array(G * G).fill(-Infinity), owner = new Int32Array(G * G).fill(-1);
    for (let t = 0; t < T; t++) {
      if (ny[t] <= 0.17) continue;
      const c = idx.slice(3 * t, 3 * t + 3);
      const X = c.map((i) => (P(i, 0) - lo[0]) / s), Z = c.map((i) => (P(i, 2) - lo[2]) / s), Y = c.map((i) => P(i, 1));
      const d = (X[1] - X[0]) * (Z[2] - Z[0]) - (X[2] - X[0]) * (Z[1] - Z[0]);
      if (Math.abs(d) < 1e-12) continue;
      for (let gx = Math.max(0, Math.floor(Math.min(...X))); gx <= Math.min(G - 1, Math.floor(Math.max(...X))); gx++)
        for (let gz = Math.max(0, Math.floor(Math.min(...Z))); gz <= Math.min(G - 1, Math.floor(Math.max(...Z))); gz++) {
          const px = gx + 0.5, pz = gz + 0.5;
          const a = ((X[1] - px) * (Z[2] - pz) - (X[2] - px) * (Z[1] - pz)) / d;
          const b = ((X[2] - px) * (Z[0] - pz) - (X[0] - px) * (Z[2] - pz)) / d;
          if (a < -1e-6 || b < -1e-6 || 1 - a - b < -1e-6) continue;
          const y = a * Y[0] + b * Y[1] + (1 - a - b) * Y[2];
          if (y > zb[gx * G + gz]) { zb[gx * G + gz] = y; owner[gx * G + gz] = t; }
        }
    }
    const seen = new Float64Array(T), floor = lo[1] + cut * (hi[1] - lo[1]);
    for (let i = 0; i < G * G; i++) if (owner[i] >= 0 && zb[i] >= floor) seen[owner[i]] += 1;
    const byCell = new Map();
    for (let t = 0; t < T; t++) if (seen[t] && !SKIP.has(cell[t])) byCell.set(cell[t], (byCell.get(cell[t]) ?? 0) + seen[t]);
    const roofCell = forceCell ?? [...byCell].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!roofCell) continue;

    const top = new Map(), all = new Map();
    for (let t = 0; t < T; t++) {
      if (cell[t] !== roofCell) continue;
      const p = piece(t);
      all.set(p, (all.get(p) ?? 0) + area[t]);
      if (seen[t]) top.set(p, (top.get(p) ?? 0) + area[t]);
    }
    const roofPiece = new Set([...all].filter(([p, a]) => (top.get(p) ?? 0) >= 0.4 * a).map(([p]) => p));
    const pick = [];
    for (let t = 0; t < T; t++) {
      if (cell[t] !== roofCell) continue;
      const c = [0, 1, 2].map((k) => idx.slice(3 * t, 3 * t + 3).reduce((s, i) => s + P(i, k), 0) / 3);
      const f = c.map((v, k) => (v - lo[k]) / ((hi[k] - lo[k]) || 1));
      if (excludes.some((e) => [0, 1, 2].every((k) => f[k] >= e[k] && f[k] <= e[3 + k]))) continue;
      if (roofPiece.has(piece(t)) || (seen[t] && ny[t] > 0.17)) pick.push(t);
    }
    if (!pick.length) continue;

    const flat = new Map(), box = new Map(), fit = new Map();
    const vOf = (i) => uv[2 * i + 1] * 4 - Math.floor(uv[2 * i + 1] * 4);
    for (const t of pick) {
      const p = piece(t);
      if (ny[t] > 0.17) {
        const f = flat.get(p) ?? [0, 0];
        flat.set(p, [f[0] + (ny[t] > 0.985 ? area[t] : 0), f[1] + area[t]]);
      }
      if (ny[t] <= 0.17) continue;
      for (const i of idx.slice(3 * t, 3 * t + 3)) {
        const b = box.get(p) ?? [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
        for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], P(i, k)); b[3 + k] = Math.max(b[3 + k], P(i, k)); }
        box.set(p, b);
        const s = fit.get(p) ?? [0, 0, 0, 0, 0];
        const y = P(i, 1), v = vOf(i);
        fit.set(p, [s[0] + 1, s[1] + y, s[2] + v, s[3] + y * y, s[4] + y * v]);
      }
    }
    const isFlat = (p) => { const f = flat.get(p) ?? [0, 1]; return f[0] >= 0.7 * f[1]; };
    const trend = (p, y) => {
      const [n0, sy, sv, syy, syv] = fit.get(p) ?? [1, 0, 0, 0, 0];
      const d = n0 * syy - sy * sy, b = Math.abs(d) < 1e-12 ? 0 : (n0 * syv - sy * sv) / d;
      return (sv - b * sy) / n0 + b * y;
    };
    const span = new Map([...box].filter(([p]) => !isFlat(p)).map(([p, b]) => [p, [b[1], b[4]]]));
    if (whole && span.size) {
      const all = [Math.min(...[...span.values()].map((s) => s[0])), Math.max(...[...span.values()].map((s) => s[1]))];
      for (const p of span.keys()) span.set(p, all);
    }
    const upArea = new Map();
    for (const t of pick) if (ny[t] > 0.17) upArea.set(piece(t), (upArea.get(piece(t)) ?? 0) + area[t]);
    const biggest = Math.max(0, ...upArea.values());
    const small = (p) => minPiece > 0 && (upArea.get(p) ?? 0) < minPiece * biggest;
    const meanBase = new Map();
    for (const [p, [n0, sy]] of fit) {
      const s = span.get(p);
      if (s && s[1] - s[0] > 1e-9) meanBase.set(p, spec.top + ((s[1] - sy / n0) / (s[1] - s[0])) * (spec.bottom - spec.top));
    }
    const [col, row] = target ?? roofCell.split(',').map(Number);
    const want = new Map();
    for (const t of pick) {
      const p = piece(t), flatPiece = isFlat(p) || !span.has(p);
      if (small(p)) continue;
      const [y0, y1] = flatPiece ? [0, 0] : span.get(p);
      const b = box.get(p);
      if (ny[t] <= 0.17 && keepUpright) continue;
      if (ny[t] <= 0.17 && (!b || Math.max(...idx.slice(3 * t, 3 * t + 3).map((i) => P(i, 1))) < b[1] - 0.02 * (hi[1] - lo[1]))) continue;
      const [n0, , sv] = fit.get(p) ?? [1, 0, 0];
      const shift = keepMean && !flatPiece ? sv / n0 - (spec.top + spec.bottom) / 2 : 0;
      for (const i of idx.slice(3 * t, 3 * t + 3)) {
        let v;
        if (ny[t] < -0.3) v = keepUnder ? vOf(i) : UNDER;
        else if (ny[t] <= 0.17 && rampUpright && !flatPiece && y1 - y0 > 1e-9) v = Math.min(DARK, Math.max(LIGHT, spec.top + Math.min(1, Math.max(0, (y1 - P(i, 1)) / (y1 - y0))) * (spec.bottom - spec.top) + vOf(i) - trend(p, P(i, 1))));
        else if (ny[t] <= 0.17 || !seen[t]) v = vOf(i);
        else {
          const base = flatPiece || y1 - y0 < 1e-9 ? FLAT : spec.top + ((y1 - P(i, 1)) / (y1 - y0)) * (spec.bottom - spec.top) + shift;
          v = Math.min(DARK, Math.max(LIGHT, add && meanBase.has(p) ? vOf(i) + base - meanBase.get(p) : base + vOf(i) - trend(p, P(i, 1))));
        }
        const u = target ? (col + 0.5) / 16 : uv[2 * i];
        want.set(3 * t + idx.slice(3 * t, 3 * t + 3).indexOf(i), [u, (row + v) / 4]);
      }
    }
    const users = new Map();
    for (let k = 0; k < idx.length; k++) {
      const list = users.get(idx[k]) ?? [];
      list.push(k);
      users.set(idx[k], list);
    }
    const uvRows = rawRows(glb, uvIndex);
    const adder = vertexAdder(glb, prim);
    const made = new Map();
    for (const [vtx, corners] of users) {
      const wanted = corners.filter((k) => want.has(k));
      if (!wanted.length) continue;
      const keepsOld = wanted.length < corners.length;
      let inPlace = keepsOld ? null : want.get(wanted[0]).join();
      for (const k of wanted) {
        const w = want.get(k), key = w.join();
        if (key === inPlace) {
          const r = uvRows.row(vtx);
          r.writeFloatLE(w[0], 0); r.writeFloatLE(w[1], 4);
          continue;
        }
        const mk = `${vtx}|${key}`;
        if (!made.has(mk)) made.set(mk, adder.add(vtx, { TEXCOORD_0: w }));
        idx[k] = made.get(mk);
      }
      changed++;
    }
    adder.commit(idx, replaced);
  }
  if (!dry && changed) {
    repack(glb, replaced);
    fixBounds(glb);
    writeGlb(file, glb.json, glb.bin, writeFileSync);
  }
  return changed;
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(0); }
const take = (flag) => { const i = args.indexOf(flag); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const type = take('--type'), cut = Number(take('--cut') ?? 0), dry = args.includes('--dry'), keepMean = args.includes('--keep-mean');
const top = take('--top'), bottom = take('--bottom'), minPiece = Number(take('--min-piece') ?? 0), add = args.includes('--add'), byPlane = args.includes('--by-plane'), keepUpright = args.includes('--keep-upright'), rampUpright = args.includes('--ramp-upright'), keepUnder = args.includes('--keep-under'), forceCell = take('--cell'), whole = args.includes('--whole');
const excludes = [];
for (let e = take('--exclude'); e !== undefined; e = take('--exclude')) excludes.push(e.split(',').map(Number));
if (TYPES[type] && top !== undefined) TYPES[type].top = Number(top);
if (TYPES[type] && bottom !== undefined) TYPES[type].bottom = Number(bottom);
if (!TYPES[type]) { console.error(`unknown --type ${type}`); process.exit(1); }
for (const file of args.filter((a) => !a.startsWith('--'))) console.log(`${file}: ${tone(file, type, cut, dry)} vertices`);
