#!/usr/bin/env node
// vereenvoudig.mjs — poly reduction for colormap assets (meshoptimizer)

import { basename, delimiter } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';


// npm resolves bare ESM specifiers only against local node_modules, so the
// globally installed copies are found by path the way render.mjs finds three.
let globalRoot;
async function load(name) {
  const require = createRequire(import.meta.url);
  try { return await import(name); } catch {}
  if (globalRoot === undefined) {
    try { globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(); }
    catch { globalRoot = ''; }
  }
  const roots = [globalRoot, ...(process.env.NODE_PATH || '').split(delimiter)].filter(Boolean);
  for (const root of roots) {
    try { return await import(pathToFileURL(require.resolve(name, { paths: [root] })).href); } catch {}
  }
  throw new Error(`cannot resolve ${name}; npm i -g @gltf-transform/core @gltf-transform/functions meshoptimizer`);
}

const { NodeIO } = await load('@gltf-transform/core');
const { simplify, weld, unweld } = await load('@gltf-transform/functions');
const { MeshoptSimplifier } = await load('meshoptimizer');

const COLUMNS = 16;
const ROWS = 4;

const DEFAULTS = { ratio: 0.5, buckets: 8, flat: true };

const HELP = `
vereenvoudig.mjs <in.glb> <out.glb> [flags]
  --ratio <0-1>      target share of triangles to keep (default ${DEFAULTS.ratio})
  --buckets <n>      gradient steps kept per colormap band (default ${DEFAULTS.buckets}, 0 = none)
  --no-flat          keep the incoming normals instead of rebuilding them per face
  --quiet

Vertices are merged by position, colormap lane and gradient step before the
simplifier runs, so collapses stop at band edges and at gradient steps.
`;

function parseArgs(argv) {
  const positional = [];
  const opts = { ...DEFAULTS, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--no-flat') opts.flat = false;
    else if (arg === '--quiet') opts.quiet = true;
    else if (arg === '--ratio') opts.ratio = Number(argv[++i]);
    else if (arg === '--buckets') opts.buckets = Number(argv[++i]);
    else if (arg === '-h' || arg === '--help') return null;
    else if (arg.startsWith('-')) throw new Error(`unknown flag: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 2) return null;
  if (!(opts.ratio > 0 && opts.ratio <= 1)) throw new Error('--ratio must be in (0,1]');
  if (!(Number.isInteger(opts.buckets) && opts.buckets >= 0)) throw new Error('--buckets must be a non-negative integer');
  [opts.input, opts.output] = positional;
  return opts;
}

function seamWeld(doc, buckets) {
  const quantise = (n) => Math.round(n * 1e5);
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      if (!position) continue;
      const uv = prim.getAttribute('TEXCOORD_0');
      const count = position.getCount();
      const indices = prim.getIndices();
      const source = indices ? indices.getArray() : Uint32Array.from({ length: count }, (_, i) => i);

      const seen = new Map();
      const remap = new Uint32Array(count);
      const kept = [];
      const p = [0, 0, 0];
      const t = [0, 0];
      for (let i = 0; i < count; i++) {
        position.getElement(i, p);
        if (uv) uv.getElement(i, t);
        else { t[0] = 0; t[1] = 0; }
        const lane = `${Math.floor(t[0] * COLUMNS)},${Math.floor(t[1] * ROWS)}`;
        const step = buckets > 0 ? `:${Math.round(((t[1] * ROWS) % 1) * buckets)}` : '';
        const key = `${quantise(p[0])},${quantise(p[1])},${quantise(p[2])}|${lane}${step}`;
        let to = seen.get(key);
        if (to === undefined) { to = kept.length; seen.set(key, to); kept.push(i); }
        remap[i] = to;
      }
      if (kept.length === count) continue;

      for (const attribute of prim.listAttributes()) {
        const size = attribute.getElementSize();
        const packed = new Float32Array(kept.length * size);
        const element = new Array(size);
        for (let i = 0; i < kept.length; i++) {
          attribute.getElement(kept[i], element);
          packed.set(element, i * size);
        }
        attribute.setArray(packed);
      }
      const reindexed = new Uint32Array(source.length);
      for (let i = 0; i < source.length; i++) reindexed[i] = remap[source[i]];
      if (indices) indices.setArray(reindexed);
      else prim.setIndices(doc.createAccessor().setArray(reindexed));
    }
  }
}

function faceNormals(doc) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      const normal = prim.getAttribute('NORMAL');
      if (!position || !normal) continue;
      const count = position.getCount();
      const packed = new Float32Array(count * 3);
      const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
      for (let i = 0; i + 2 < count; i += 3) {
        position.getElement(i, a);
        position.getElement(i + 1, b);
        position.getElement(i + 2, c);
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy;
        let ny = uz * vx - ux * vz;
        let nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, ny, nz) || 1;
        nx /= length; ny /= length; nz /= length;
        for (let k = 0; k < 3; k++) packed.set([nx, ny, nz], (i + k) * 3);
      }
      normal.setArray(packed);
    }
  }
}

function countTriangles(doc) {
  let total = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const count = indices ? indices.getCount() : (prim.getAttribute('POSITION')?.getCount() ?? 0);
      total += Math.floor(count / 3);
    }
  }
  return total;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts) { console.log(HELP); process.exit(1); }

const io = new NodeIO();
const doc = await io.read(opts.input);
const before = countTriangles(doc);

seamWeld(doc, opts.buckets);

await MeshoptSimplifier.ready;
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: opts.ratio, error: 1, lockBorder: false }),
);

if (opts.flat) {
  await doc.transform(unweld());
  faceNormals(doc);
  await doc.transform(weld());
}

await io.write(opts.output, doc);

if (!opts.quiet) {
  const after = countTriangles(doc);
  const pct = before > 0 ? ((after / before) * 100).toFixed(1) : '0.0';
  console.log(`${basename(opts.input)}: ${before} -> ${after} tris (${pct}%)`);
}
