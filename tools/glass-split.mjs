#!/usr/bin/env node
// glass-split.mjs — move the triangles of one band onto the kit's clear glass.
//
// The clear glass of §1 is not a band of the colormap: it is a second, untextured
// material with alphaMode BLEND, so a bottle that should be see-through cannot be
// recoloured into it — its triangles have to leave the textured primitive and join a
// glass one. That is a second draw call, which G1 allows an object with glass.
//
// Usage: node tools/glass-split.mjs <file.glb> [...] --band <col,row> [--uv u,v] [--dry]
//   --band  the colormap cell whose triangles become glass, e.g. 5,2 for a bottle
//           body sitting on off-white.
//   --uv    narrows that to the triangles on one point of the cell, for a model that
//           puts two parts on the same band.
// Geometry is untouched: the same triangles come out, split over two primitives, with
// the vertices each side needs. Run the catalogue build afterwards, and remember the
// model's material tag: a body that is now glass is no longer ceramic.

import { readFileSync, writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const COLUMNS = 16;
const ROWS = 4;
const UV_EPSILON = 1e-4;

const COMPONENT = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

// What the kits that already carry glass use, down to the alpha.
const GLASS = {
  name: 'glas',
  pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 0.2], metallicFactor: 0, roughnessFactor: 0.5 },
  alphaMode: 'BLEND',
  doubleSided: true,
};

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const valueOf = (flag) => {
  const at = argv.indexOf(flag);
  return at === -1 ? null : argv[at + 1];
};
const bandText = valueOf('--band');
const uvText = valueOf('--uv');
const files = argv.filter((a, i) => !a.startsWith('--') &&
  !(i > 0 && (argv[i - 1] === '--band' || argv[i - 1] === '--uv')));

if (!bandText || files.length === 0) {
  console.error('usage: glass-split.mjs <file.glb> [...] --band <col,row> [--uv u,v] [--dry]');
  process.exit(2);
}
const [bandColumn, bandRow] = bandText.split(',').map(Number);
const uvPoint = uvText ? uvText.split(',').map(Number) : null;

function read(glb, index) {
  const accessor = glb.json.accessors[index];
  if (accessor.sparse) throw new Error('sparse accessor is not supported');
  const view = glb.json.bufferViews[accessor.bufferView];
  if (view.byteStride !== undefined) throw new Error('interleaved vertex data is not supported');
  const Type = COMPONENT[accessor.componentType];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const width = WIDTH[accessor.type];
  return { width, values: Array.from(new Type(glb.bin.buffer, glb.bin.byteOffset + start, accessor.count * width)) };
}

// Everything is written out again from scratch: one view per accessor, tightly packed,
// four-byte aligned. That is the layout these kits already carry.
function writeAccessors(glb, blocks) {
  const json = glb.json;
  json.accessors = [];
  json.bufferViews = [];
  const parts = [];
  let offset = 0;
  for (const block of blocks) {
    const Type = COMPONENT[block.componentType];
    const packed = new Type(block.values);
    const bytes = new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { parts.push(new Uint8Array(pad)); offset += pad; }
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, target: block.target });
    const count = block.values.length / WIDTH[block.type];
    const accessor = {
      bufferView: json.bufferViews.length - 1, byteOffset: 0,
      componentType: block.componentType, count, type: block.type,
    };
    if (block.bounds) {
      const width = WIDTH[block.type];
      accessor.min = Array.from({ length: width }, (_, w) =>
        Math.min(...Array.from({ length: count }, (_, i) => block.values[i * width + w])));
      accessor.max = Array.from({ length: width }, (_, w) =>
        Math.max(...Array.from({ length: count }, (_, i) => block.values[i * width + w])));
    }
    json.accessors.push(accessor);
    parts.push(bytes);
    offset += bytes.byteLength;
  }
  const bin = new Uint8Array(offset);
  let at = 0;
  for (const part of parts) { bin.set(part, at); at += part.byteLength; }
  json.buffers = [{ byteLength: bin.byteLength }];
  glb.bin = bin;
}

let touched = 0;
for (const file of files) {
  const glb = readGlb(file);
  const { json } = glb;
  const meshes = json.meshes ?? [];
  if (meshes.length !== 1 || meshes[0].primitives.length !== 1) {
    console.error(`${file}: expected one mesh with one primitive`);
    process.exit(2);
  }
  const primitive = meshes[0].primitives[0];
  const uv = readAccessor(glb, primitive.attributes.TEXCOORD_0);
  const indices = Array.from(readAccessor(glb, primitive.indices).data);

  const onBand = (vertex) => {
    const u = uv.data[vertex * uv.width];
    const v = uv.data[vertex * uv.width + 1];
    if (Math.floor(u * COLUMNS) !== bandColumn || Math.floor(v * ROWS) !== bandRow) return false;
    return !uvPoint || (Math.abs(u - uvPoint[0]) < UV_EPSILON && Math.abs(v - uvPoint[1]) < UV_EPSILON);
  };

  const glass = [];
  const solid = [];
  for (let t = 0; t * 3 + 2 < indices.length; t++) {
    const corners = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]];
    (corners.every(onBand) ? glass : solid).push(corners);
  }
  if (!glass.length) { console.log(`  ${file}: no triangle on ${bandText}${uvText ? ` at ${uvText}` : ''}`); continue; }
  console.log(`${dry ? 'would move' : 'moved'} ${glass.length} of ${glass.length + solid.length} triangles onto the glass  ${file}`);
  if (dry) { touched++; continue; }

  const attributes = Object.keys(primitive.attributes);
  const source = new Map(attributes.map((name) => [name, read(glb, primitive.attributes[name])]));
  const blocks = [];
  const halves = [];
  for (const triangles of [solid, glass]) {
    const remap = new Map();
    const list = [];
    const flat = [];
    for (const corners of triangles) {
      for (const vertex of corners) {
        let to = remap.get(vertex);
        if (to === undefined) { to = list.length; remap.set(vertex, to); list.push(vertex); }
        flat.push(to);
      }
    }
    const half = { attributes: {}, indices: null };
    for (const name of attributes) {
      const { width, values } = source.get(name);
      const out = [];
      for (const vertex of list) for (let w = 0; w < width; w++) out.push(values[vertex * width + w]);
      half.attributes[name] = blocks.length;
      blocks.push({ values: out, componentType: 5126, type: width === 3 ? 'VEC3' : 'VEC2', target: 34962, bounds: name === 'POSITION' });
    }
    half.indices = blocks.length;
    blocks.push({ values: flat, componentType: list.length > 65535 ? 5125 : 5123, type: 'SCALAR', target: 34963 });
    halves.push(half);
  }

  writeAccessors(glb, blocks);
  const material = primitive.material ?? 0;
  let glassMaterial = (json.materials ?? []).findIndex((m) => m.name === GLASS.name);
  if (glassMaterial === -1) {
    json.materials = [...(json.materials ?? []), structuredClone(GLASS)];
    glassMaterial = json.materials.length - 1;
  }
  meshes[0].primitives = [
    { attributes: halves[0].attributes, indices: halves[0].indices, material },
    { attributes: halves[1].attributes, indices: halves[1].indices, material: glassMaterial },
  ];
  writeGlb(file, json, glb.bin, writeFileSync);
  touched++;
}
console.log(`${touched} model(s) ${dry ? 'to change' : 'changed'}`);
