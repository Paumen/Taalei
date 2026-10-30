import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, primitiveMatrix, welder, vertexAdder } from './mesh-edit.mjs';

const HELP = `stone-tone.mjs [flags] <workfile.glb> [...]

Gives each stone of a masonry model its own tone and shades it by light:
lighter on top, darker on its sides, darkest underneath. Works in place on
the masonry bands the catalogue tags name (stone-masonry-light ivory,
-mid taupe, -dark taupe-dark); other bands are left as they are.

A stone is a run of masonry triangles joined across flat or outward edges.
Grooves (inward edges sharper than --groove degrees) part stones, so stones
fused into one piece still come apart. --whole makes every piece one stone
(solid stairs, a gravestone).

Each stone's tone: the shared target --target, plus --keep times how far the
stone sat from the model's own mean (so a darker cap stays darker), plus a
shuffled tone from an even spread of +-spread over the model's stones. Then
each face moves by its facing: --top up, --side sideways, --bottom down. A
stone taller than a third of the model also runs lighter to darker over its
height (--tall); the whole model darkens to its base by --base times its
height over its width. v stays within 0.02 to 0.95 of the band.

--debug paints each stone a loud cell to check the stone map.
--seed <s> changes the shuffle (default: file name).

Defaults: --target 0.42 --keep 0.5 --spread 0.12 --top -0.1 --side 0.06
--bottom 0.25 --tall 0.2 --base 0.08 --groove 25`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MASONRY = { 'stone-masonry-light': '5,2', 'stone-masonry-mid': '14,3', 'stone-masonry-dark': '12,3' };
const LOUD = ['8,0', '6,0', '1,1', '3,1', '4,2', '0,0', '2,0', '5,0', '6,1', '3,2', '5,2', '13,3'];
const LIGHT = 0.02;
const DARK = 0.95;

let catalog = null;
function cellsOf(file) {
  catalog ??= new Map(JSON.parse(readFileSync(resolve(ROOT, 'catalog/build/catalog.json'), 'utf8')).models.map((m) => [`${m.kit}/${m.name}`, m]));
  const model = catalog.get(`${basename(dirname(resolve(file)))}/${basename(file, '.glb')}`);
  const tags = model?.tags ?? [];
  const cells = new Set(tags.filter((t) => MASONRY[t]).map((t) => MASONRY[t]));
  if (cells.size && !tags.includes('earth-soil')) for (const t of ['stone-masonry-mid', 'stone-masonry-dark']) cells.add(MASONRY[t]);
  return cells;
}

function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function tone(file, o) {
  const cells = o.cells ?? cellsOf(file);
  if (!cells.size) return { stones: 0, added: 0, note: 'no masonry tag' };
  const glb = readGlb(file);
  const prims = editablePrimitives(glb.json).filter((p) => p.attributes.TEXCOORD_0 !== undefined && glb.json.accessors[p.attributes.TEXCOORD_0].componentType === 5126);
  const data = prims.map((prim) => {
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
    const idx = Array.from(readAccessor(glb, prim.indices).data);
    const m = primitiveMatrix(glb.json, prim);
    const n = pos.length / 3;
    const w = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) w[3 * i + k] = m[k] * pos[3 * i] + m[4 + k] * pos[3 * i + 1] + m[8 + k] * pos[3 * i + 2] + m[12 + k];
    return { prim, pos, uv, idx, w };
  });

  let low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  for (const { w } of data) for (let i = 0; i < w.length; i += 3) for (let k = 0; k < 3; k++) { low[k] = Math.min(low[k], w[i + k]); high[k] = Math.max(high[k], w[i + k]); }
  const height = high[1] - low[1] || 1, width = Math.max(high[0] - low[0], high[2] - low[2]) || 1;

  const tris = [];
  for (const [p, d] of data.entries()) {
    const { idx, uv, w, pos } = d;
    const { weld } = welder(pos);
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      const u = (uv[2 * a] + uv[2 * b] + uv[2 * c]) / 3, v = (uv[2 * a + 1] + uv[2 * b + 1] + uv[2 * c + 1]) / 3;
      const cell = `${Math.floor(u * 16)},${Math.floor(v * 4)}`;
      if (!cells.has(cell)) continue;
      const P = [a, b, c].map((i) => [w[3 * i], w[3 * i + 1], w[3 * i + 2]]);
      const e1 = P[1].map((x, k) => x - P[0][k]), e2 = P[2].map((x, k) => x - P[0][k]);
      const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-12) continue;
      const row = Number(cell.split(',')[1]);
      tris.push({
        p, t, v: [a, b, c], key: [a, b, c].map((i) => `${p}:${weld(i)}`), row, cell,
        n: [nx / len, ny / len, nz / len], c: [0, 1, 2].map((k) => (P[0][k] + P[1][k] + P[2][k]) / 3),
        area: len / 2, was: v * 4 - row,
      });
    }
  }
  if (!tris.length) return { stones: 0, added: 0, note: 'no masonry triangles' };

  const parent = tris.map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
  const edges = new Map();
  tris.forEach((tri, i) => {
    for (let k = 0; k < 3; k++) {
      const a = tri.key[k], b = tri.key[(k + 1) % 3];
      const e = a < b ? `${a}|${b}` : `${b}|${a}`;
      (edges.get(e) ?? edges.set(e, []).get(e)).push(i);
    }
  });
  const cosGroove = Math.cos((o.groove * Math.PI) / 180);
  for (const list of edges.values()) {
    for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
      const A = tris[list[x]], B = tris[list[y]];
      if (A.cell !== B.cell && !o.whole) continue;
      if (!o.whole) {
        const d = A.n[0] * B.n[0] + A.n[1] * B.n[1] + A.n[2] * B.n[2];
        const toward = (B.c[0] - A.c[0]) * A.n[0] + (B.c[1] - A.c[1]) * A.n[1] + (B.c[2] - A.c[2]) * A.n[2];
        if (toward > 0 && d < cosGroove) continue;
      }
      parent[find(list[x])] = find(list[y]);
    }
  }

  const stones = new Map();
  tris.forEach((tri, i) => {
    const r = find(i);
    const s = stones.get(r) ?? { tris: [], cell: tri.cell, area: 0, was: 0, low: Infinity, high: -Infinity };
    s.tris.push(tri); s.area += tri.area; s.was += tri.was * tri.area;
    for (const k of [0, 1, 2]) { const y = data[tri.p].w[3 * tri.v[k] + 1]; s.low = Math.min(s.low, y); s.high = Math.max(s.high, y); }
    stones.set(r, s);
  });
  const list = [...stones.values()];
  for (const s of list) s.was /= s.area;
  const sums = new Map();
  for (const s of list) {
    const [w, a] = sums.get(s.cell) ?? [0, 0];
    sums.set(s.cell, [w + s.was * s.area, a + s.area]);
  }
  const meanOf = (cell) => sums.get(cell)[0] / sums.get(cell)[1];

  const random = rng(o.seed ?? basename(file));
  const order = list.map((s) => [random(), s]).sort((a, b) => a[0] - b[0]).map(([, s]) => s);
  order.forEach((s, i) => {
    const spread = order.length > 1 ? -o.spread + (2 * o.spread * i) / (order.length - 1) : 0;
    const own = s.was - meanOf(s.cell);
    s.base = o.target + o.keep * own + spread * Math.max(0, 1 - Math.abs(own) / o.stand);
    s.loud = LOUD[i % LOUD.length];
  });

  const baseAmp = o.base * Math.min(1, height / width);
  const vOf = (s, tri, i) => {
    const y = data[tri.p].w[3 * i + 1];
    const ny = tri.n[1];
    let v = s.base + o.detail * (data[tri.p].uv[2 * i + 1] * 4 - tri.row - s.was) + (ny >= 0 ? o.top * ny : o.bottom * -ny) + o.side * (1 - Math.abs(ny));
    const span = s.high - s.low;
    if (span > height / 3) v += o.tall * ((s.high - y) / span - 0.5);
    v += baseAmp * ((high[1] - y) / height - 0.5);
    return Math.min(DARK, Math.max(LIGHT, v));
  };

  const adders = data.map((d) => vertexAdder(glb, d.prim));
  const extra = data.map(() => []);
  const assigned = data.map((d) => new Map());
  let added = 0;
  for (const s of list) {
    for (const tri of s.tris) {
      for (let k = 0; k < 3; k++) {
        const i = tri.v[k];
        const d = data[tri.p];
        const u = o.debug ? (Number(s.loud.split(',')[0]) + 0.5) / 16 : d.uv[2 * i];
        const row = o.debug ? Number(s.loud.split(',')[1]) : tri.row;
        const v = o.debug ? 0.3 : vOf(s, tri, i);
        const want = [u, (row + v) / 4];
        const got = assigned[tri.p].get(i);
        let use = i;
        if (!got) assigned[tri.p].set(i, [want]);
        else {
          const hit = got.findIndex((g) => Math.abs(g[0] - want[0]) < 1e-6 && Math.abs(g[1] - want[1]) < 2e-4);
          if (hit === 0) use = i;
          else if (hit > 0) use = got[hit][2];
          else { use = adders[tri.p].add(i, { TEXCOORD_0: want }); want.push(use); got.push(want); added++; }
        }
        d.idx[tri.t + k] = use;
      }
    }
  }
  const replaced = new Map();
  data.forEach((d, p) => {
    const first = new Float32Array(d.uv);
    for (const [i, got] of assigned[p]) { first[2 * i] = got[0][0]; first[2 * i + 1] = got[0][1]; }
    const at = d.prim.attributes.TEXCOORD_0;
    replaced.set(at, Buffer.from(first.buffer));
    adders[p].commit(d.idx, replaced);
    const bytes = replaced.get(at);
    const all = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    all.set(first);
    replaced.set(at, Buffer.from(all.buffer));
  });
  if (!o.dry) {
    repack(glb, replaced);
    fixBounds(glb);
    writeGlb(file, glb.json, glb.bin, writeFileSync);
  }
  return { stones: list.length, added };
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
const num = (flag, fallback) => {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  const value = Number(args[i + 1]);
  args.splice(i, 2);
  return value;
};
const str = (flag) => {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const o = {
  target: num('--target', 0.42), keep: num('--keep', 0.5), spread: num('--spread', 0.12),
  top: num('--top', -0.1), side: num('--side', 0.06), bottom: num('--bottom', 0.25),
  detail: num('--detail', 0.7), stand: num('--stand', 0.2),
  tall: num('--tall', 0.2), base: num('--base', 0.08), groove: num('--groove', 25),
  seed: str('--seed'), whole: args.includes('--whole'), debug: args.includes('--debug'), dry: args.includes('--dry'),
};
for (const file of args.filter((a) => !a.startsWith('--'))) {
  const r = tone(file, o);
  console.log(`${file}: ${r.stones} stones, ${r.added} vertices added${r.note ? ` (${r.note})` : ''}`);
}
