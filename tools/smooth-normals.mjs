#!/usr/bin/env node
// smooth-normals.mjs — rebuild a model's vertex normals with a crease threshold.
//
// Geometry, UVs and the colormap are untouched; only NORMAL changes. Faces meeting
// at an angle below the threshold share an averaged normal, so the surface reads as
// curved; sharper meetings keep their own facet normal, so real corners stay crisp.
// The threshold is recorded back into asset.extras.taaleiland.schaduw, which is where
// this kit already carries `{ modus: 'glad', drempel: <degrees> }`.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

// An averaged normal this far from its own facet is not a smoothed surface any more,
// it is two faces pointing different ways being blended into nonsense. Past 90 degrees
// the normal points into the model and the surface renders black, so refuse well short
// of that and leave the facet normal in place.
const MAX_BEND = 80;

const HELP = `
smooth-normals.mjs <file.glb|dir> [...] --angle <degrees> [--dry-run] [--quiet]
  --angle <deg>   crease threshold, 1..179. Faces meeting below this angle are
                  smoothed together; at or above it they stay separate.
  --dry-run       report what would change, write nothing.
  --quiet         only print the summary line.
Prints, per model, the share of corners whose normal ends up bent away from its
facet -- 0% is fully flat shading, and the kits that read as rounded sit near 70%.
`;

function die(msg) { console.error('error: ' + msg); console.error(HELP); process.exit(2); }

function parseArgs(argv) {
  const o = { inputs: [], angle: null, dryRun: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    else if (a === '--angle') {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v <= 0 || v >= 180) die('--angle needs 1..179, got: ' + argv[i]);
      o.angle = v;
    } else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a.startsWith('--')) die('unknown flag: ' + a);
    else o.inputs.push(a);
  }
  if (o.angle === null) die('--angle is required');
  if (o.inputs.length === 0) die('no input files');
  return o;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a) => Math.hypot(a[0], a[1], a[2]);

function collect(glb) {
  const meshes = glb.json.meshes ?? [];
  const primitives = meshes.flatMap((m) => m.primitives);
  if (primitives.length !== 1) throw new Error(`expected one primitive, found ${primitives.length}`);
  const prim = primitives[0];
  const { POSITION, NORMAL, TEXCOORD_0 } = prim.attributes;
  if (POSITION === undefined || NORMAL === undefined || TEXCOORD_0 === undefined) {
    throw new Error('needs POSITION, NORMAL and TEXCOORD_0');
  }
  if (Object.keys(prim.attributes).length !== 3) {
    throw new Error(`unexpected attributes: ${Object.keys(prim.attributes).join(', ')}`);
  }
  if (prim.indices === undefined) throw new Error('needs indices');
  return {
    prim,
    position: readAccessor(glb, POSITION),
    uv: readAccessor(glb, TEXCOORD_0),
    index: readAccessor(glb, prim.indices),
  };
}

// Face normals, plus the area they cover: a big face should pull an averaged normal
// further than a sliver does.
function faceNormals(position, index) {
  const faces = index.count / 3;
  const normals = new Array(faces);
  const areas = new Float64Array(faces);
  for (let f = 0; f < faces; f++) {
    const corner = [0, 1, 2].map((k) => {
      const v = index.data[f * 3 + k];
      return [position.data[v * 3], position.data[v * 3 + 1], position.data[v * 3 + 2]];
    });
    const n = cross(sub(corner[1], corner[0]), sub(corner[2], corner[0]));
    const len = length(n);
    areas[f] = len / 2;
    normals[f] = len > 1e-12 ? [n[0] / len, n[1] / len, n[2] / len] : [0, 1, 0];
  }
  return { normals, areas };
}

function smoothNormals(position, index, angle) {
  const { normals, areas } = faceNormals(position, index);
  const faces = index.count / 3;

  // Faces are only neighbours if they actually share a point in space, so group by
  // rounded position rather than by vertex id -- a seam splits the id, not the surface.
  const atPoint = new Map();
  for (let f = 0; f < faces; f++) {
    for (let k = 0; k < 3; k++) {
      const v = index.data[f * 3 + k];
      const key = [0, 1, 2].map((c) => position.data[v * 3 + c].toFixed(5)).join(',');
      if (!atPoint.has(key)) atPoint.set(key, []);
      atPoint.get(key).push(f);
    }
  }

  const limit = Math.cos((angle * Math.PI) / 180);
  const floor = Math.cos((MAX_BEND * Math.PI) / 180);
  const out = new Float64Array(faces * 3 * 3);
  let bent = 0;
  let refused = 0;

  for (let f = 0; f < faces; f++) {
    for (let k = 0; k < 3; k++) {
      const v = index.data[f * 3 + k];
      const key = [0, 1, 2].map((c) => position.data[v * 3 + c].toFixed(5)).join(',');
      const own = normals[f];
      let sum = [0, 0, 0];
      for (const other of atPoint.get(key)) {
        if (dot(own, normals[other]) < limit) continue;
        sum = [
          sum[0] + normals[other][0] * areas[other],
          sum[1] + normals[other][1] * areas[other],
          sum[2] + normals[other][2] * areas[other],
        ];
      }
      const len = length(sum);
      let n = len > 1e-12 ? [sum[0] / len, sum[1] / len, sum[2] / len] : own;
      if (dot(n, own) < floor) { n = own; refused++; }
      if (dot(n, own) < Math.cos((5 * Math.PI) / 180)) bent++;
      for (let c = 0; c < 3; c++) out[(f * 3 + k) * 3 + c] = n[c];
    }
  }
  return { normals: out, bent, refused, corners: faces * 3 };
}

// Rebuild the vertex list, merging corners that agree on all three attributes. Without
// this a smoothed model carries three vertices per triangle and the file doubles.
function weld(position, uv, index, normals) {
  const corners = index.count;
  const seen = new Map();
  const pos = [];
  const nrm = [];
  const tex = [];
  const out = new Uint32Array(corners);
  for (let i = 0; i < corners; i++) {
    const v = index.data[i];
    const p = [position.data[v * 3], position.data[v * 3 + 1], position.data[v * 3 + 2]];
    const n = [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
    const t = [uv.data[v * 2], uv.data[v * 2 + 1]];
    const key = [
      ...p.map((x) => x.toFixed(5)),
      ...n.map((x) => x.toFixed(4)),
      ...t.map((x) => x.toFixed(6)),
    ].join(',');
    let at = seen.get(key);
    if (at === undefined) {
      at = pos.length / 3;
      seen.set(key, at);
      pos.push(...p); nrm.push(...n); tex.push(...t);
    }
    out[i] = at;
  }
  return { pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), tex: Float32Array.from(tex), index: out };
}

function rebuild(glb, parts, welded, angle) {
  const json = structuredClone(glb.json);
  const short = welded.pos.length / 3 <= 65535;
  const indices = short ? Uint16Array.from(welded.index) : welded.index;
  const buffers = [
    Buffer.from(welded.pos.buffer, welded.pos.byteOffset, welded.pos.byteLength),
    Buffer.from(welded.nrm.buffer, welded.nrm.byteOffset, welded.nrm.byteLength),
    Buffer.from(welded.tex.buffer, welded.tex.byteOffset, welded.tex.byteLength),
    Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength),
  ];
  const pad = (n) => (4 - (n % 4)) % 4;
  const views = [];
  let offset = 0;
  const chunks = [];
  for (const buf of buffers) {
    views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length });
    chunks.push(buf, Buffer.alloc(pad(buf.length), 0));
    offset += buf.length + pad(buf.length);
  }
  const bin = Buffer.concat(chunks);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < welded.pos.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], welded.pos[i + c]);
      max[c] = Math.max(max[c], welded.pos[i + c]);
    }
  }

  json.buffers = [{ byteLength: bin.length }];
  json.bufferViews = views;
  json.accessors = [
    { bufferView: 0, componentType: 5126, count: welded.pos.length / 3, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: welded.nrm.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: welded.tex.length / 2, type: 'VEC2' },
    { bufferView: 3, componentType: short ? 5123 : 5125, count: welded.index.length, type: 'SCALAR' },
  ];
  const prim = json.meshes.flatMap((m) => m.primitives)[0];
  prim.attributes = { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 };
  prim.indices = 3;

  const extras = json.asset?.extras?.taaleiland;
  if (extras) extras.schaduw = { modus: 'glad', drempel: angle };

  return { json, bin };
}

const opts = parseArgs(process.argv.slice(2));
const files = opts.inputs.flatMap((input) =>
  statSync(input).isDirectory()
    ? readdirSync(input).filter((f) => f.endsWith('.glb')).sort().map((f) => join(input, f))
    : [input]);

let changed = 0;
let refusedTotal = 0;
const shares = [];
for (const file of files) {
  const glb = readGlb(file);
  const parts = collect(glb);
  const result = smoothNormals(parts.position, parts.index, opts.angle);
  const welded = weld(parts.position, parts.uv, parts.index, result.normals);
  const share = result.bent / result.corners;
  shares.push(share);
  refusedTotal += result.refused;
  if (!opts.quiet) {
    console.log(
      `${basename(file).padEnd(44)} ${String(parts.index.count / 3).padStart(5)} tris  ` +
      `${(share * 100).toFixed(0).padStart(3)}% smoothed  ` +
      `${String(welded.pos.length / 3).padStart(5)} verts (was ${parts.position.count})` +
      (result.refused ? `  ${result.refused} corner(s) left flat` : ''));
  }
  if (!opts.dryRun) {
    const { json, bin } = rebuild(glb, parts, welded, opts.angle);
    writeGlb(file, json, bin, writeFileSync);
    changed++;
  }
}
shares.sort((a, b) => a - b);
const median = shares[Math.floor(shares.length / 2)];
console.log(
  `${opts.dryRun ? 'would change' : 'wrote'} ${opts.dryRun ? files.length : changed} model(s) ` +
  `at ${opts.angle} degrees — median ${(median * 100).toFixed(0)}% smoothed` +
  (refusedTotal ? `, ${refusedTotal} corner(s) held back at the ${MAX_BEND} degree guard` : ''));
