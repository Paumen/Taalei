import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, meshShells, meshParts, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder } from './mesh-edit.mjs';

const HELP = `recolour.mjs --from <band> --to <band> [--parts <n,n>] [--want <n>] [--where <test,test>] <workfile.glb> [...]
recolour.mjs --list [--want <n>] <workfile.glb>

Moves every vertex in the --from band into the --to band of kits/colormap.png,
keeping its place in the cell, so the gradient carries over. With --parts only
the vertices of those parts move. --where moves whole triangles: only those
whose mesh-space centre passes every test, each an axis, < or >, and a number:
y>1.3,x<0. A corner shared with a triangle that stays is copied, so no
triangle ends up in two bands. --list prints the parts with their triangles,
bands and bounds; the split is the one render.mjs --isolate --parts <want> makes,
8 when --want is not given, but render.mjs numbers its tiles in its own order.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const BAND_OF_CELL = new Map(Object.entries(BANDS).filter(([, cell]) => cell).map(([band, cell]) => [cell, band]));

function cellOf(band) {
  const cell = BANDS[band];
  if (!cell) throw new Error(`no such band: ${band}`);
  return cell.split(',').map(Number);
}

function uvWriter(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  if (accessor.componentType !== 5126 || accessor.type !== 'VEC2' || accessor.sparse) {
    throw new Error('expects float VEC2 UVs');
  }
  const view = glb.json.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const step = view.byteStride ?? 8;
  const at = (i) => new Float32Array(glb.bin.buffer, glb.bin.byteOffset + start + i * step, 2);
  return at;
}

function recolour(file, from, to, partNumbers, want, where) {
  const glb = readGlb(file);
  const allowed = new Map();
  if (partNumbers) {
    const parts = meshParts(glb, want);
    for (const n of partNumbers) {
      const part = parts[n - 1];
      if (!part) throw new Error(`${file}: no part ${n} of ${parts.length}`);
      const uv = part.prim.attributes.TEXCOORD_0;
      if (!allowed.has(uv)) allowed.set(uv, new Set());
      for (const v of part.indices) allowed.get(uv).add(v);
    }
  }

  const shift = [(to[0] - from[0]) / 16, (to[1] - from[1]) / 4];
  const inFrom = (uv) => Math.floor(uv[0] * 16) === from[0] && Math.floor(uv[1] * 4) === from[1];
  let moved = 0;
  let total = 0;
  if (where) {
    const replaced = new Map();
    for (const prim of editablePrimitives(glb.json)) {
      if (prim.attributes.TEXCOORD_0 === undefined) continue;
      const only = partNumbers ? allowed.get(prim.attributes.TEXCOORD_0) : null;
      if (partNumbers && !only) continue;
      const pos = readAccessor(glb, prim.attributes.POSITION).data;
      const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
      const idx = Array.from(readAccessor(glb, prim.indices).data);
      const base = pos.length / 3;
      total += base;
      const passes = (t) => where.every(([axis, op, value]) => {
        const centre = [0, 1, 2].reduce((sum, k) => sum + pos[idx[t * 3 + k] * 3 + axis], 0) / 3;
        return op === '<' ? centre < value : centre > value;
      });
      const chosen = new Set();
      for (let t = 0; t < idx.length / 3; t++) {
        const corners = [0, 1, 2].map((k) => idx[t * 3 + k]);
        if (only && !corners.every((v) => only.has(v))) continue;
        if (!corners.every((v) => inFrom([uv[v * 2], uv[v * 2 + 1]]))) continue;
        if (passes(t)) chosen.add(t);
      }
      const staying = new Set();
      for (let t = 0; t < idx.length / 3; t++) if (!chosen.has(t)) for (let k = 0; k < 3; k++) staying.add(idx[t * 3 + k]);
      const adder = vertexAdder(glb, prim);
      const inPlace = new Set();
      const copies = new Map();
      const shifted = (v) => [uv[v * 2] + shift[0], uv[v * 2 + 1] + shift[1]];
      for (const t of chosen) for (let k = 0; k < 3; k++) {
        const v = idx[t * 3 + k];
        if (!staying.has(v)) { inPlace.add(v); continue; }
        if (!copies.has(v)) copies.set(v, adder.add(v, { TEXCOORD_0: shifted(v) }));
        idx[t * 3 + k] = copies.get(v);
      }
      if (!chosen.size) continue;
      const at = uvWriter(glb, prim.attributes.TEXCOORD_0);
      for (const v of inPlace) at(v).set(shifted(v));
      adder.commit(idx, replaced);
      moved += inPlace.size + copies.size;
    }
    if (!moved) throw new Error(`${file}: no triangle in that band`);
    repack(glb, replaced);
    fixBounds(glb);
    writeGlb(file, glb.json, glb.bin, writeFileSync);
    return { moved, total };
  }
  for (const shell of meshShells(glb)) {
    if (partNumbers && !allowed.has(shell.uv)) continue;
    const only = allowed.get(shell.uv);
    const at = uvWriter(glb, shell.uv);
    for (let i = 0; i < shell.count; i++) {
      total++;
      if (only && !only.has(i)) continue;
      const uv = at(i);
      if (!inFrom(uv)) continue;
      uv[0] += shift[0];
      uv[1] += shift[1];
      moved++;
    }
  }
  if (!moved) throw new Error(`${file}: no vertex in that band`);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
  return { moved, total };
}

function list(file, want) {
  const glb = readGlb(file);
  meshParts(glb, want).forEach((part, i) => {
    const uv = readAccessor(glb, part.prim.attributes.TEXCOORD_0).data;
    const bands = new Map();
    for (const v of new Set(part.indices)) {
      const cell = `${Math.floor(uv[v * 2] * 16)},${Math.floor(uv[v * 2 + 1] * 4)}`;
      const band = BAND_OF_CELL.get(cell) ?? cell;
      bands.set(band, (bands.get(band) ?? 0) + 1);
    }
    const box = (p) => p.map((v) => v.toFixed(2)).join(' ');
    console.log(`${String(i + 1).padStart(3)}  ${String(part.indices.length / 3).padStart(6)} tris  ` +
      `${[...bands].map(([band, n]) => `${band} ${n}`).join(', ')}  [${box(part.lo)}] - [${box(part.hi)}]`);
  });
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help')) {
  console.log(HELP);
  process.exit(argv.length ? 0 : 1);
}

const options = {};
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--list') options.list = true;
  else if (argv[i].startsWith('--')) options[argv[i].slice(2)] = argv[++i];
  else files.push(argv[i]);
}
const want = options.want ? Number(options.want) : 8;
if (options.list) {
  for (const file of files) list(file, want);
  process.exit(0);
}
if (!options.from || !options.to) throw new Error('--from and --to are required');
if (!files.length) throw new Error('name at least one workfile');
const partNumbers = options.parts ? options.parts.split(',').map(Number) : null;
const where = options.where
  ? options.where.split(',').map((test) => {
      const m = test.match(/^([xyz])([<>])(-?[\d.]+)$/);
      if (!m) throw new Error(`bad --where test: ${test}`);
      return ['xyz'.indexOf(m[1]), m[2], Number(m[3])];
    })
  : null;

for (const file of files) {
  const { moved, total } = recolour(file, cellOf(options.from), cellOf(options.to), partNumbers, want, where);
  console.log(`${file}: ${moved}/${total} vertices ${options.from} -> ${options.to}`);
}
