import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';

const HELP = `facet.mjs --bands <band,band> <workfile.glb> [...]

Replaces a workfile with one whose triangles in the named bands carry their own
face normal. Every other band keeps the normals it has.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;

function cellOf(band) {
  const cell = BANDS[band];
  if (!cell) throw new Error(`no such band: ${band}`);
  return cell;
}

function faceNormal(positions, a, b, c) {
  const u = [0, 1, 2].map((k) => positions[b * 3 + k] - positions[a * 3 + k]);
  const v = [0, 1, 2].map((k) => positions[c * 3 + k] - positions[a * 3 + k]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...n) || 1;
  return n.map((k) => k / length);
}

function facet(file, cells) {
  const glb = readGlb(file);
  const mesh = glb.json.meshes?.[0];
  const primitive = mesh?.primitives?.[0];
  if (!primitive || mesh.primitives.length > 1 || glb.json.meshes.length > 1) {
    throw new Error(`${file}: expects one mesh of one primitive`);
  }

  const source = {
    positions: readAccessor(glb, primitive.attributes.POSITION).data,
    normals: readAccessor(glb, primitive.attributes.NORMAL).data,
    uvs: readAccessor(glb, primitive.attributes.TEXCOORD_0).data,
    indices: readAccessor(glb, primitive.indices).data,
  };

  const positions = [];
  const normals = [];
  const uvs = [];
  const triangles = [];
  const known = new Map();
  let touched = 0;

  for (let t = 0; t < source.indices.length; t += 3) {
    const corner = [0, 1, 2].map((k) => source.indices[t + k]);
    const middle = [0, 1].map((k) => corner.reduce((sum, i) => sum + source.uvs[i * 2 + k], 0) / 3);
    const cell = `${Math.floor(middle[0] * 16)},${Math.floor(middle[1] * 4)}`;
    const flat = cells.has(cell);
    if (flat) touched++;
    const face = flat ? faceNormal(source.positions, ...corner) : null;

    for (const i of corner) {
      const position = [0, 1, 2].map((k) => source.positions[i * 3 + k]);
      const normal = face ?? [0, 1, 2].map((k) => source.normals[i * 3 + k]);
      const uv = [0, 1].map((k) => source.uvs[i * 2 + k]);
      const key = [...position, ...normal.map((v) => v.toFixed(5)), ...uv.map((v) => v.toFixed(6))].join(',');
      let at = known.get(key);
      if (at === undefined) {
        at = positions.length / 3;
        known.set(key, at);
        positions.push(...position);
        normals.push(...normal);
        uvs.push(...uv);
      }
      triangles.push(at);
    }
  }

  const count = positions.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i * 3 + k]);
      max[k] = Math.max(max[k], positions[i * 3 + k]);
    }
  }

  const parts = [];
  const bufferViews = [];
  const accessors = [];
  let length = 0;
  const add = (data, target, componentType, type, extra) => {
    const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const padding = (4 - (length % 4)) % 4;
    if (padding) { parts.push(Buffer.alloc(padding)); length += padding; }
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: buffer.length, target });
    parts.push(buffer);
    length += buffer.length;
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType,
      count: extra.count,
      type,
      ...(extra.min ? { min: extra.min, max: extra.max } : {}),
    });
    return accessors.length - 1;
  };

  const attributes = {
    POSITION: add(Float32Array.from(positions), 34962, 5126, 'VEC3', { count, min, max }),
    NORMAL: add(Float32Array.from(normals), 34962, 5126, 'VEC3', { count }),
    TEXCOORD_0: add(Float32Array.from(uvs), 34962, 5126, 'VEC2', { count }),
  };
  const narrow = count <= 0xffff;
  const indices = add(
    narrow ? Uint16Array.from(triangles) : Uint32Array.from(triangles),
    34963,
    narrow ? 5123 : 5125,
    'SCALAR',
    { count: triangles.length },
  );

  const json = { ...glb.json };
  json.accessors = accessors;
  json.bufferViews = bufferViews;
  json.meshes = [{ primitives: [{ attributes, indices, material: primitive.material }] }];
  const bin = Buffer.concat(parts);
  json.buffers = [{ byteLength: bin.length }];

  writeGlb(file, json, bin, writeFileSync);
  return { touched, triangles: triangles.length / 3, vertices: count };
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help')) {
  console.log(HELP);
  process.exit(argv.length ? 0 : 1);
}

const at = argv.indexOf('--bands');
if (at < 0 || !argv[at + 1]) throw new Error('--bands is required');
const cells = new Set(argv[at + 1].split(',').map((band) => cellOf(band.trim())));
const files = argv.filter((_, i) => i !== at && i !== at + 1);
if (!files.length) throw new Error('name at least one workfile');

for (const file of files) {
  const { touched, triangles, vertices } = facet(file, cells);
  console.log(`${file}: ${touched}/${triangles} triangles faceted, ${vertices} vertices`);
}
