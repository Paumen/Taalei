#!/usr/bin/env node
// colormap-recolor.mjs — move an asset from one colormap cell to another.
//
// Assets colour themselves by pointing UVs at bands of the 16x4 colormap, so a
// recolour is a UV translation: every vertex whose UV lands in the source cell
// moves by whole cells, which keeps its position inside the band and with it the
// baked shading (style guide §1). The atlas on disk is not touched.
//
// Usage: node tools/colormap-recolor.mjs <from> <to> <file.glb|dir> [...] [--dry] [--mesh name] [--uv u,v] [--piece n[,n]]
//        node tools/colormap-recolor.mjs --pieces <file.glb|dir> [...] [--mesh name]
//        node tools/colormap-recolor.mjs --map plan.json [--dry]
//   plan.json: [{ "file": "kits/workfiles/…/x.glb", "from": "13,0", "to": "5,0", "mesh": "…", "uv": "u,v", "piece": [2] }, …]
//   --mesh limits the move to the meshes of that name, for a model that answers
//   for several parts at once.
//   --uv limits the move to the vertices sitting on that one point of the source
//   cell. A pack whose materials are flat colours puts every material on a single
//   point of the band it matched, so two materials that matched the same cell —
//   KayKit's Stone and WoodDark both land on light grey — are still apart inside
//   it, and only --uv can move one without the other.
//   --piece limits the move to the connected pieces you name. `--pieces` lists them
//   first: one line per piece with its vertex count and bounding box, numbered in
//   that listing's order. That is how a band is added to a pack whose whole model
//   sits on one uv point — a stone head or a strap is its own piece there, and
//   nothing else in the model can be told apart by uv.
//   --upright limits the move to the connected pieces that stand: a piece whose
//   height beats both its width and its depth. That is the posts and legs of a
//   frame and not the planks they carry, which is the line the dungeon scaffolds
//   draw between wood-beam and wood-worked (appendix A, M42). Whole pieces move,
//   so a vertex a post shares with the deck it holds up goes with the post.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const COLUMNS = 16;
const ROWS = 4;

const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

const parseUv = (text) => {
  const [u, v] = String(text).split(',').map(Number);
  if (!Number.isFinite(u) || !Number.isFinite(v)) {
    console.error(`error: not a uv point: ${text}`);
    process.exit(2);
  }
  return [u, v];
};

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
const UV_EPSILON = 1e-4;

// Every connected piece of the model, with the TEXCOORD_0 vertices it owns.
// Pieces are found over welded positions, so the two triangles of a shared corner
// still count as one piece. Vertex indices are what both selectors work on.
function connectedPieces(glb, mesh = null) {
  const { json } = glb;
  const found = [];
  for (const target of json.meshes ?? []) {
    if (mesh && target.name !== mesh) continue;
    for (const primitive of target.primitives ?? []) {
      const uvIndex = primitive.attributes?.TEXCOORD_0;
      const posIndex = primitive.attributes?.POSITION;
      if (uvIndex === undefined || posIndex === undefined || primitive.indices === undefined) continue;

      const pos = readAccessor(glb, posIndex);
      const idx = readAccessor(glb, primitive.indices).data;

      const perPlace = new Map();
      const parent = [];
      const find = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
      const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
      const place = [];
      for (let i = 0; i < pos.count; i++) {
        const key = [0, 1, 2].map((axis) => pos.data[i * pos.width + axis].toFixed(4)).join(',');
        if (!perPlace.has(key)) { perPlace.set(key, parent.length); parent.push(parent.length); }
        place.push(perPlace.get(key));
      }
      for (let i = 0; i + 2 < idx.length; i += 3) {
        union(place[idx[i]], place[idx[i + 1]]);
        union(place[idx[i + 1]], place[idx[i + 2]]);
      }

      const pieces = new Map();
      for (let i = 0; i < pos.count; i++) {
        const root = find(place[i]);
        let piece = pieces.get(root);
        if (!piece) {
          piece = { mesh: target.name ?? '', accessor: uvIndex, vertices: new Set(),
            low: [Infinity, Infinity, Infinity], high: [-Infinity, -Infinity, -Infinity] };
          pieces.set(root, piece);
        }
        piece.vertices.add(i);
        for (let axis = 0; axis < 3; axis++) {
          const value = pos.data[i * pos.width + axis];
          if (value < piece.low[axis]) piece.low[axis] = value;
          if (value > piece.high[axis]) piece.high[axis] = value;
        }
      }
      found.push(...pieces.values());
    }
  }
  // Numbered for --piece, so the order has to hold from one run to the next:
  // biggest first, and position breaks a tie between two pieces of equal size.
  return found.sort((a, b) =>
    b.vertices.size - a.vertices.size ||
    a.low[0] - b.low[0] || a.low[1] - b.low[1] || a.low[2] - b.low[2]);
}

// The vertices of every connected piece that stands taller than it is wide or deep:
// the posts and legs of a frame and not the planks they carry.
function uprightVertices(glb, mesh = null) {
  const perAccessor = new Map();
  for (const piece of connectedPieces(glb, mesh)) {
    const size = piece.high.map((value, axis) => value - piece.low[axis]);
    if (!(size[1] > size[0] && size[1] > size[2])) continue;
    const chosen = perAccessor.get(piece.accessor) ?? new Set();
    for (const i of piece.vertices) chosen.add(i);
    perAccessor.set(piece.accessor, chosen);
  }
  return perAccessor;
}

// The vertices of the pieces named by --piece, per accessor, in the numbering
// `--pieces` prints.
function pieceVertices(glb, mesh, wanted) {
  const pieces = connectedPieces(glb, mesh);
  const perAccessor = new Map();
  for (const number of wanted) {
    const piece = pieces[number - 1];
    if (!piece) throw new Error(`no piece ${number}: the model has ${pieces.length}`);
    const chosen = perAccessor.get(piece.accessor) ?? new Set();
    for (const i of piece.vertices) chosen.add(i);
    perAccessor.set(piece.accessor, chosen);
  }
  return perAccessor;
}

function recolor(glb, [fromColumn, fromRow], [toColumn, toRow], mesh = null, uv = null, upright = false, piece = null) {
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

  const picked = piece ? pieceVertices(glb, mesh, piece) : null;
  const upstanding = upright ? uprightVertices(glb, mesh) : null;

  let moved = 0;
  for (const index of accessors) {
    const standing = upstanding?.get(index) ?? null;
    if (upright && !standing) continue;
    const wanted = picked?.get(index) ?? null;
    if (piece && !wanted) continue;
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
      const onPoint =
        !uv || (Math.abs(row[0] - uv[0]) < UV_EPSILON && Math.abs(row[1] - uv[1]) < UV_EPSILON);
      const onPiece = (!standing || standing.has(i)) && (!wanted || wanted.has(i));
      if (column === fromColumn && line === fromRow && onPoint && onPiece) {
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
const upright = argv.includes('--upright');
const listPieces = argv.includes('--pieces');
const pieceFlag = argv.indexOf('--piece');
const pieceList = pieceFlag === -1 ? null : argv[pieceFlag + 1];
if (pieceFlag !== -1 && !pieceList) { console.error('error: --piece wants a piece number, or several separated by commas'); process.exit(2); }
const pieces = pieceList === null ? null : pieceList.split(',').map((n) => {
  const number = Number(n);
  if (!Number.isInteger(number) || number < 1) { console.error(`error: not a piece number: ${n}`); process.exit(2); }
  return number;
});
const uvFlag = argv.indexOf('--uv');
const uvPoint = uvFlag === -1 ? null : argv[uvFlag + 1];
if (uvFlag !== -1 && !uvPoint) { console.error('error: --uv wants a u,v point'); process.exit(2); }
const consumed = new Set();
if (meshFlag !== -1) { consumed.add(meshFlag); consumed.add(meshFlag + 1); }
if (uvFlag !== -1) { consumed.add(uvFlag); consumed.add(uvFlag + 1); }
if (pieceFlag !== -1) { consumed.add(pieceFlag); consumed.add(pieceFlag + 1); }
const rest = argv.filter((a, i) => a !== '--dry' && a !== '--upright' && a !== '--pieces' && !consumed.has(i));

// --pieces only reports: it names what --piece can select, and changes nothing.
if (listPieces) {
  const inputs = rest[0] === '--map' ? [] : rest.slice(2);
  const files = (inputs.length ? inputs : rest).flatMap((input) => glbsUnder(input));
  for (const file of files) {
    const glb = readGlb(file);
    const found = connectedPieces(glb, meshName);
    console.log(`${file}: ${found.length} piece(s)`);
    found.forEach((piece, i) => {
      const size = piece.high.map((value, axis) => (value - piece.low[axis]).toFixed(3));
      console.log(`  ${i + 1}. ${piece.vertices.size} verts  ${size.join(' x ')}` +
        `  at ${piece.low.map((v) => v.toFixed(3)).join(',')}${piece.mesh ? `  mesh ${piece.mesh}` : ''}`);
    });
  }
  process.exit(0);
}

let plan = [];
if (rest[0] === '--map') {
  if (!rest[1]) { console.error('error: --map wants a json file'); process.exit(2); }
  plan = JSON.parse(readFileSync(rest[1], 'utf8'));
} else {
  const [from, to, ...inputs] = rest;
  if (!from || !to || inputs.length === 0) {
    console.error(
      'usage: colormap-recolor.mjs <from> <to> <file.glb|dir> [...] [--dry] [--mesh name] [--uv u,v] [--upright] [--piece n[,n]] [--pieces]',
    );
    process.exit(2);
  }
  plan = inputs.flatMap((input) =>
    glbsUnder(input).map((file) => ({ file, from, to, mesh: meshName, uv: uvPoint, upright, piece: pieces })));
}

let touched = 0;
for (const { file, from, to, mesh = null, uv = null, upright: standing = false, piece = null } of plan) {
  const glb = readGlb(file);
  const moved = recolor(glb, parseCell(from), parseCell(to), mesh, uv ? parseUv(uv) : null, standing, piece);
  const waar =
    `${from}${uv ? ` at ${uv}` : ''}${standing ? ' on the upright pieces' : ''}${piece ? ` on piece ${piece.join(',')}` : ''}${mesh ? ` on mesh ${mesh}` : ''}`;
  if (moved === 0) { console.log(`  ${file}: nothing in ${waar}`); continue; }
  if (!dry) writeGlb(file, glb.json, glb.bin, writeFileSync);
  touched++;
  console.log(`${dry ? 'would move' : 'moved'} ${moved} uv${moved === 1 ? '' : 's'} ${waar} -> ${to}  ${file}`);
}
console.log(`${touched} model(s) ${dry ? 'to change' : 'changed'}`);
