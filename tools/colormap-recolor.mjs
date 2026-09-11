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
//   --range limits the move to a slab of the model: `--range y,-60,-20` takes the
//   triangles whose centre sits between those two, in the units --pieces prints.
//   Repeat it to cross axes. That is how a grip wrapped into the shaft it belongs to
//   is moved: it is no piece of its own, and no uv tells it from the shaft.
//   A slab is the one selector that cuts across welded geometry, so it also splits the
//   vertices its boundary runs through: the triangles inside get their own copies and
//   the ones outside keep the originals. Nothing moves and no triangle is added — the
//   model only gains the handful of vertices a hard colour edge needs, the way every
//   other band boundary in these kits already carries one.
//   --shade moves the selected vertices inside the destination band instead of across
//   bands: `--shade 0.35` puts their light end 0.35 down the cell, carrying the spread
//   along, so the baked shading of §1 survives. Give the same cell as from and to to
//   re-shade a band without recolouring it.
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

// The triangles whose centre sits inside every --range slab, per primitive. A triangle
// must be in all of them, so two ranges on different axes cut a box out of the model.
function slabTriangles(glb, mesh, ranges) {
  const found = [];
  for (const target of glb.json.meshes ?? []) {
    if (mesh && target.name !== mesh) continue;
    for (const primitive of target.primitives ?? []) {
      if (primitive.attributes?.TEXCOORD_0 === undefined) continue;
      if (primitive.indices === undefined) throw new Error('--range needs indexed triangles');
      if (primitive.mode !== undefined && primitive.mode !== 4) throw new Error('--range needs triangles');
      const pos = readAccessor(glb, primitive.attributes.POSITION);
      const idx = readAccessor(glb, primitive.indices).data;
      const inside = [];
      for (let t = 0; t * 3 + 2 < idx.length; t++) {
        const corners = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]];
        const middle = [0, 1, 2].map((axis) =>
          corners.reduce((sum, v) => sum + pos.data[v * pos.width + axis], 0) / 3);
        if (ranges.every(({ axis, low, high }) => middle[axis] >= low && middle[axis] <= high)) inside.push(t);
      }
      found.push({ primitive, triangles: inside });
    }
  }
  return found;
}

// Give the triangles inside the slab their own copies of every vertex they share with
// a triangle outside it, so the two sides can carry different uvs and the colour edge
// lands on the triangle edge instead of smearing across the atlas. Returns the new
// TEXCOORD_0 vertices per accessor; the model is rewritten in place, buffers and all.
function unweldSlab(glb, slabs) {
  const { json } = glb;
  const chosen = new Map();
  const rebuilt = new Map();

  // Each primitive's copies are appended to its own reading of the accessor, so two
  // primitives that split the same one would each miss the other's. Refuse that layout
  // before a byte is touched rather than write a model whose indices point at nothing.
  const seen = new Set();
  for (const { primitive, triangles } of slabs) {
    if (!triangles.length) continue;
    for (const index of [...Object.values(primitive.attributes), primitive.indices]) {
      if (seen.has(index)) throw new Error('--range does not rewrite an accessor two primitives share');
      seen.add(index);
    }
  }

  for (const { primitive, triangles } of slabs) {
    const uvIndex = primitive.attributes.TEXCOORD_0;
    const picked = chosen.get(uvIndex) ?? new Set();
    if (!triangles.length) { chosen.set(uvIndex, picked); continue; }

    const indexAccessor = json.accessors[primitive.indices];
    const indices = Array.from(readAccessor(glb, primitive.indices).data);
    const attributes = Object.entries(primitive.attributes);
    const data = new Map(attributes.map(([name, index]) => {
      const read = readAccessor(glb, index);
      if (json.accessors[index].sparse) throw new Error('sparse accessor is not supported');
      return [name, { index, width: read.width, values: Array.from(read.data), count: read.count }];
    }));

    const inSlab = new Set(triangles);
    const usedInside = new Set();
    const usedOutside = new Set();
    for (let t = 0; t * 3 + 2 < indices.length; t++) {
      const where = inSlab.has(t) ? usedInside : usedOutside;
      for (let c = 0; c < 3; c++) where.add(indices[t * 3 + c]);
    }

    const copyOf = new Map();
    for (const vertex of usedInside) {
      if (!usedOutside.has(vertex)) { picked.add(vertex); continue; }
      let copy = copyOf.get(vertex);
      if (copy === undefined) {
        copy = data.get('POSITION').count;
        copyOf.set(vertex, copy);
        for (const attribute of data.values()) {
          for (let w = 0; w < attribute.width; w++) {
            attribute.values.push(attribute.values[vertex * attribute.width + w]);
          }
          attribute.count++;
        }
      }
      picked.add(copy);
    }
    chosen.set(uvIndex, picked);
    if (!copyOf.size) continue;

    for (const t of triangles) {
      for (let c = 0; c < 3; c++) {
        const copy = copyOf.get(indices[t * 3 + c]);
        if (copy !== undefined) indices[t * 3 + c] = copy;
      }
    }

    for (const attribute of data.values()) rebuilt.set(attribute.index, attribute);
    rebuilt.set(primitive.indices, { index: primitive.indices, indices, accessor: indexAccessor });
  }

  if (rebuilt.size) rewriteBuffers(glb, rebuilt);
  return chosen;
}

// One buffer, one view per accessor, tightly packed: the layout these kits already
// carry. Anything else (interleaving, a view two accessors share) is refused rather
// than silently mangled.
function rewriteBuffers(glb, rebuilt) {
  const { json } = glb;
  if ((json.buffers ?? []).length !== 1) throw new Error('--range needs a model with one buffer');
  const owners = new Map();
  json.accessors.forEach((accessor, index) => {
    if (accessor.bufferView === undefined) throw new Error('an accessor with no buffer view is not supported');
    if (json.bufferViews[accessor.bufferView].byteStride !== undefined) {
      throw new Error('--range does not rewrite interleaved vertex data');
    }
    if (owners.has(accessor.bufferView)) throw new Error('--range does not rewrite a shared buffer view');
    owners.set(accessor.bufferView, index);
  });

  const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const parts = [];
  let offset = 0;
  json.accessors.forEach((accessor, index) => {
    const change = rebuilt.get(index);
    const Type = COMPONENT[accessor.componentType];
    let values;
    if (!change) {
      const view = json.bufferViews[accessor.bufferView];
      const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type];
      values = Array.from(new Type(glb.bin.buffer, glb.bin.byteOffset + start, accessor.count * width));
    } else if (change.indices) {
      values = change.indices;
      if (Math.max(...values) > 65535 && accessor.componentType === 5123) accessor.componentType = 5125;
    } else {
      values = change.values;
      accessor.count = change.count;
      if (accessor.min) {
        const width = change.width;
        accessor.min = Array.from({ length: width }, (_, w) =>
          Math.min(...Array.from({ length: change.count }, (_, i) => values[i * width + w])));
        accessor.max = Array.from({ length: width }, (_, w) =>
          Math.max(...Array.from({ length: change.count }, (_, i) => values[i * width + w])));
      }
    }
    const Out = COMPONENT[accessor.componentType];
    const packed = new Out(values);
    const bytes = new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { parts.push(new Uint8Array(pad)); offset += pad; }
    const view = json.bufferViews[accessor.bufferView];
    view.byteOffset = offset;
    view.byteLength = bytes.byteLength;
    accessor.byteOffset = 0;
    parts.push(bytes);
    offset += bytes.byteLength;
  });

  const bin = new Uint8Array(offset);
  let at = 0;
  for (const part of parts) { bin.set(part, at); at += part.byteLength; }
  json.buffers[0].byteLength = bin.byteLength;
  glb.bin = bin;
}

function recolor(glb, [fromColumn, fromRow], [toColumn, toRow], mesh = null, uv = null, upright = false, piece = null, ranges = null, shade = null) {
  const { json } = glb;
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
  const slabbed = ranges ? unweldSlab(glb, slabTriangles(glb, mesh, ranges)) : null;
  const upstanding = upright ? uprightVertices(glb, mesh) : null;
  const { bin } = glb;

  let moved = 0;
  const shaded = [];
  for (const index of accessors) {
    const standing = upstanding?.get(index) ?? null;
    if (upright && !standing) continue;
    const wanted = picked?.get(index) ?? null;
    if (piece && !wanted) continue;
    const inSlab = slabbed?.get(index) ?? null;
    if (ranges && !inSlab) continue;
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
      const onPiece = (!standing || standing.has(i)) && (!wanted || wanted.has(i)) &&
        (!inSlab || inSlab.has(i));
      if (column === fromColumn && line === fromRow && onPoint && onPiece) {
        row[0] += shiftU;
        row[1] += shiftV;
        moved++;
        if (shade !== null) shaded.push(row);
      }
      min = [Math.min(min[0], row[0]), Math.min(min[1], row[1])];
      max = [Math.max(max[0], row[0]), Math.max(max[1], row[1])];
    }
    if (accessor.min) accessor.min = min;
    if (accessor.max) accessor.max = max;
  }

  // The whole selection slides together, so the distance between its lightest and its
  // darkest vertex — the baked shading — is the same afterwards.
  if (shade !== null && shaded.length) {
    const light = Math.min(...shaded.map((row) => row[1])) * ROWS - toRow;
    const dark = Math.max(...shaded.map((row) => row[1])) * ROWS - toRow;
    if (shade + (dark - light) > 1) {
      throw new Error(`--shade ${shade} puts a spread of ${(dark - light).toFixed(2)} past the end of the cell`);
    }
    const step = (shade - light) / ROWS;
    for (const row of shaded) row[1] += step;
    for (const index of accessors) {
      const accessor = json.accessors[index];
      if (!accessor.min && !accessor.max) continue;
      const view = json.bufferViews[accessor.bufferView];
      const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const Type = COMPONENT[accessor.componentType];
      const stride = view.byteStride ?? 2 * Type.BYTES_PER_ELEMENT;
      let min = [Infinity, Infinity];
      let max = [-Infinity, -Infinity];
      for (let i = 0; i < accessor.count; i++) {
        const row = new Type(bin.buffer, bin.byteOffset + start + i * stride, 2);
        min = [Math.min(min[0], row[0]), Math.min(min[1], row[1])];
        max = [Math.max(max[0], row[0]), Math.max(max[1], row[1])];
      }
      if (accessor.min) accessor.min = min;
      if (accessor.max) accessor.max = max;
    }
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
const AXIS = { x: 0, y: 1, z: 2 };
const ranges = [];
const rangeIndexes = new Set();
argv.forEach((a, i) => {
  if (a !== '--range') return;
  const text = argv[i + 1];
  const [axis, low, high] = String(text ?? '').split(',');
  if (!(axis in AXIS) || !Number.isFinite(Number(low)) || !Number.isFinite(Number(high))) {
    console.error(`error: --range wants axis,low,high — for example y,-60,-20`);
    process.exit(2);
  }
  ranges.push({ axis: AXIS[axis], low: Number(low), high: Number(high) });
  rangeIndexes.add(i); rangeIndexes.add(i + 1);
});
const shadeFlag = argv.indexOf('--shade');
const shade = shadeFlag === -1 ? null : Number(argv[shadeFlag + 1]);
if (shadeFlag !== -1 && !(shade >= 0 && shade <= 1)) {
  console.error('error: --shade wants a position in the cell between 0 and 1');
  process.exit(2);
}
const uvFlag = argv.indexOf('--uv');
const uvPoint = uvFlag === -1 ? null : argv[uvFlag + 1];
if (uvFlag !== -1 && !uvPoint) { console.error('error: --uv wants a u,v point'); process.exit(2); }
const consumed = new Set();
if (meshFlag !== -1) { consumed.add(meshFlag); consumed.add(meshFlag + 1); }
if (uvFlag !== -1) { consumed.add(uvFlag); consumed.add(uvFlag + 1); }
if (pieceFlag !== -1) { consumed.add(pieceFlag); consumed.add(pieceFlag + 1); }
if (shadeFlag !== -1) { consumed.add(shadeFlag); consumed.add(shadeFlag + 1); }
for (const i of rangeIndexes) consumed.add(i);
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
      'usage: colormap-recolor.mjs <from> <to> <file.glb|dir> [...] [--dry] [--mesh name] [--uv u,v] [--upright] [--piece n[,n]] [--range axis,low,high] [--shade 0..1] [--pieces]',
    );
    process.exit(2);
  }
  plan = inputs.flatMap((input) =>
    glbsUnder(input).map((file) => ({
      file, from, to, mesh: meshName, uv: uvPoint, upright, piece: pieces,
      range: ranges.length ? ranges : null, shade,
    })));
}

let touched = 0;
for (const { file, from, to, mesh = null, uv = null, upright: standing = false, piece = null,
  range = null, shade: position = null } of plan) {
  const glb = readGlb(file);
  const moved = recolor(glb, parseCell(from), parseCell(to), mesh, uv ? parseUv(uv) : null, standing,
    piece, range, position);
  const slabs = range ? range.map(({ axis, low, high }) => ` in ${'xyz'[axis]} ${low}..${high}`).join('') : '';
  const waar =
    `${from}${uv ? ` at ${uv}` : ''}${standing ? ' on the upright pieces' : ''}${piece ? ` on piece ${piece.join(',')}` : ''}${slabs}${mesh ? ` on mesh ${mesh}` : ''}`;
  if (moved === 0) { console.log(`  ${file}: nothing in ${waar}`); continue; }
  if (!dry) writeGlb(file, glb.json, glb.bin, writeFileSync);
  touched++;
  console.log(`${dry ? 'would move' : 'moved'} ${moved} uv${moved === 1 ? '' : 's'} ${waar} -> ${to}${position === null ? '' : ` at ${position} down the cell`}  ${file}`);
}
console.log(`${touched} model(s) ${dry ? 'to change' : 'changed'}`);
