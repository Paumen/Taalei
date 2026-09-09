#!/usr/bin/env node
// colormap-recolor.mjs — move an asset from one colormap cell to another.
//
// Assets colour themselves by pointing UVs at bands of the 16x4 colormap, so a
// recolour is a UV translation: every vertex whose UV lands in the source cell
// moves by whole cells, which keeps its position inside the band and with it the
// baked shading (style guide §1). The atlas on disk is not touched.
//
// Usage: node tools/colormap-recolor.mjs <from> <to> <file.glb|dir> [...] [--dry] [--mesh name]
//        node tools/colormap-recolor.mjs --map plan.json [--dry]
//   plan.json: [{ "file": "kits/workfiles/…/x.glb", "from": "13,0", "to": "5,0", "mesh": "…" }, …]
//   --mesh limits the move to the meshes of that name, for a model that answers
//   for several parts at once.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readGlb, writeGlb } from '../catalog/tools/glb.mjs';

const COLUMNS = 16;
const ROWS = 4;

const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

const parseCell = (text) => {
  const [column, row] = String(text).split(',').map(Number);
  if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || column >= COLUMNS || row < 0 || row >= ROWS) {
    console.error(`error: not a colormap cell: ${text}`);
    process.exit(2);
  }
  return [column, row];
};

const glbsUnder = (path) => {
  if (!statSync(path).isDirectory()) return [path];
  const out = [];
  for (const entry of readdirSync(path)) {
    const child = join(path, entry);
    if (statSync(child).isDirectory()) out.push(...glbsUnder(child));
    else if (entry.endsWith('.glb')) out.push(child);
  }
  return out.sort();
};

// Every accessor the model reads TEXCOORD_0 from, with the vertices that sit in
// the source cell shifted whole cells across. An accessor shared by several
// primitives is rewritten once; the test is per vertex, so untouched bands stay put.
function recolor(glb, [fromColumn, fromRow], [toColumn, toRow], mesh = null) {
  const { json, bin } = glb;
  const shiftU = (toColumn - fromColumn) / COLUMNS;
  const shiftV = (toRow - fromRow) / ROWS;
  const accessors = new Set();
  for (const target of json.meshes ?? []) {
    if (mesh && target.name !== mesh) continue;
    for (const primitive of target.primitives ?? []) {
      const index = primitive.attributes?.TEXCOORD_0;
      if (index !== undefined) accessors.add(index);
    }
  }

  let moved = 0;
  for (const index of accessors) {
    const accessor = json.accessors[index];
    if (accessor.sparse) throw new Error('sparse accessor is not supported');
    if (accessor.componentType !== 5126) throw new Error(`TEXCOORD_0 is not float: accessor ${index}`);
    const view = json.bufferViews[accessor.bufferView];
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const Type = COMPONENT[accessor.componentType];
    const stride = view.byteStride ?? 2 * Type.BYTES_PER_ELEMENT;

    let min = [Infinity, Infinity];
    let max = [-Infinity, -Infinity];
    for (let i = 0; i < accessor.count; i++) {
      const row = new Type(bin.buffer, bin.byteOffset + start + i * stride, 2);
      const column = Math.min(COLUMNS - 1, Math.max(0, Math.floor(row[0] * COLUMNS)));
      const line = Math.min(ROWS - 1, Math.max(0, Math.floor(row[1] * ROWS)));
      if (column === fromColumn && line === fromRow) {
        row[0] += shiftU;
        row[1] += shiftV;
        moved++;
      }
      min = [Math.min(min[0], row[0]), Math.min(min[1], row[1])];
      max = [Math.max(max[0], row[0]), Math.max(max[1], row[1])];
    }
    if (accessor.min) accessor.min = min;
    if (accessor.max) accessor.max = max;
  }
  return moved;
}

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const meshFlag = argv.indexOf('--mesh');
const meshName = meshFlag === -1 ? null : argv[meshFlag + 1];
if (meshFlag !== -1 && !meshName) { console.error('error: --mesh wants a mesh name'); process.exit(2); }
const rest = argv.filter((a, i) => a !== '--dry' && (meshFlag === -1 || (i !== meshFlag && i !== meshFlag + 1)));

let plan = [];
if (rest[0] === '--map') {
  if (!rest[1]) { console.error('error: --map wants a json file'); process.exit(2); }
  plan = JSON.parse(readFileSync(rest[1], 'utf8'));
} else {
  const [from, to, ...inputs] = rest;
  if (!from || !to || inputs.length === 0) {
    console.error('usage: colormap-recolor.mjs <from> <to> <file.glb|dir> [...] [--dry]');
    process.exit(2);
  }
  plan = inputs.flatMap((input) => glbsUnder(input).map((file) => ({ file, from, to, mesh: meshName })));
}

let touched = 0;
for (const { file, from, to, mesh = null } of plan) {
  const glb = readGlb(file);
  const moved = recolor(glb, parseCell(from), parseCell(to), mesh);
  if (moved === 0) { console.log(`  ${file}: nothing in ${from}${mesh ? ` on mesh ${mesh}` : ''}`); continue; }
  if (!dry) writeGlb(file, glb.json, glb.bin, writeFileSync);
  touched++;
  console.log(`${dry ? 'would move' : 'moved'} ${moved} uv${moved === 1 ? '' : 's'} ${from} -> ${to}  ${file}`);
}
console.log(`${touched} model(s) ${dry ? 'to change' : 'changed'}`);
