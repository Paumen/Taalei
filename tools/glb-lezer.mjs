/**
 * Minimale .glb-lezer: JSON-chunk, accessors en de scene-graph.
 *
 * Genoeg om de meetkunde van een model te bekijken zonder een 3D-library.
 * Alleen wat `controleer-assets.mjs` nodig heeft — geen animaties, skins of
 * sparse accessors (die komen in deze kits niet voor; ze geven een error).
 */

import { readFileSync } from 'node:fs';

const MAGIC_GLTF = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/** componentType → [TypedArray, bytes per component] */
const COMPONENT = {
  5120: [Int8Array, 1],
  5121: [Uint8Array, 1],
  5122: [Int16Array, 2],
  5123: [Uint16Array, 2],
  5125: [Uint32Array, 4],
  5126: [Float32Array, 4],
};

const AANTAL = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function leesGlb(pad) {
  const buf = readFileSync(pad);
  if (buf.readUInt32LE(0) !== MAGIC_GLTF) throw new Error(`${pad} is geen .glb`);
  const lengte = buf.readUInt32LE(8);

  let json = null;
  let bin = null;
  let offset = 12;
  while (offset < lengte) {
    const chunkLengte = buf.readUInt32LE(offset);
    const soort = buf.readUInt32LE(offset + 4);
    const inhoud = buf.subarray(offset + 8, offset + 8 + chunkLengte);
    if (soort === CHUNK_JSON) json = JSON.parse(inhoud.toString('utf8'));
    else if (soort === CHUNK_BIN) bin = inhoud;
    offset += 8 + chunkLengte + ((4 - (chunkLengte % 4)) % 4);
  }
  if (!json) throw new Error(`${pad} heeft geen JSON-chunk`);
  return { json, bin, pad };
}

/**
 * Leest een accessor uit als array van rijen (`[[x, y, z], ...]`), of als
 * platte array bij SCALAR. byteStride wordt gerespecteerd, zodat ook
 * interleaved buffers goed gaan.
 */
export function leesAccessor(glb, index) {
  const acc = glb.json.accessors[index];
  if (acc.sparse) throw new Error('sparse accessors worden niet ondersteund');
  const [Type, bytes] = COMPONENT[acc.componentType];
  const kolommen = AANTAL[acc.type];
  const rijen = acc.count;

  if (acc.bufferView === undefined) {
    return Array.from({ length: rijen }, () => new Array(kolommen).fill(0));
  }

  const view = glb.json.bufferViews[acc.bufferView];
  const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stap = view.byteStride ?? kolommen * bytes;

  const uit = new Array(rijen);
  for (let i = 0; i < rijen; i += 1) {
    const basis = glb.bin.byteOffset + start + i * stap;
    const rij = new Type(glb.bin.buffer.slice(basis, basis + kolommen * bytes));
    uit[i] = kolommen === 1 ? rij[0] : Array.from(rij);
  }
  return uit;
}

/* -- transformaties ------------------------------------------------------- */

const IDENTITEIT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function vermenigvuldig(a, b) {
  const uit = new Array(16).fill(0);
  for (let r = 0; r < 4; r += 1) {
    for (let k = 0; k < 4; k += 1) {
      for (let c = 0; c < 4; c += 1) uit[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
    }
  }
  return uit;
}

/** glTF levert kolom-major aan; hier werken we rij-major. */
function nodeMatrix(node) {
  if (node.matrix) {
    const m = node.matrix;
    return [
      m[0], m[4], m[8], m[12],
      m[1], m[5], m[9], m[13],
      m[2], m[6], m[10], m[14],
      m[3], m[7], m[11], m[15],
    ];
  }
  let uit = IDENTITEIT.slice();
  if (node.scale) {
    const [x, y, z] = node.scale;
    uit = vermenigvuldig([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1], uit);
  }
  if (node.rotation) {
    const [x, y, z, w] = node.rotation;
    uit = vermenigvuldig([
      1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0,
      2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0,
      2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0,
      0, 0, 0, 1,
    ], uit);
  }
  if (node.translation) {
    const [x, y, z] = node.translation;
    uit = vermenigvuldig([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1], uit);
  }
  return uit;
}

const pasToe = (m, [x, y, z]) => [
  m[0] * x + m[1] * y + m[2] * z + m[3],
  m[4] * x + m[5] * y + m[6] * z + m[7],
  m[8] * x + m[9] * y + m[10] * z + m[11],
];

const draai = (m, [x, y, z]) => [
  m[0] * x + m[1] * y + m[2] * z,
  m[4] * x + m[5] * y + m[6] * z,
  m[8] * x + m[9] * y + m[10] * z,
];

/**
 * Alle driehoek-primitives in wereldcoördinaten. Alleen mode 4 (TRIANGLES);
 * andere modes komen in deze kits niet voor en worden overgeslagen.
 */
export function* primitives(glb) {
  const { json } = glb;
  const scene = json.scenes[json.scene ?? 0];

  const loop = function* (index, ouder) {
    const node = json.nodes[index];
    const matrix = vermenigvuldig(ouder, nodeMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = json.meshes[node.mesh];
      for (const prim of mesh.primitives ?? []) {
        if ((prim.mode ?? 4) !== 4) continue;
        const posities = leesAccessor(glb, prim.attributes.POSITION).map((p) => pasToe(matrix, p));
        const normalen = prim.attributes.NORMAL === undefined
          ? null
          : leesAccessor(glb, prim.attributes.NORMAL).map((n) => draai(matrix, n));
        const uvs = prim.attributes.TEXCOORD_0 === undefined
          ? null
          : leesAccessor(glb, prim.attributes.TEXCOORD_0);
        const plat = prim.indices === undefined
          ? Array.from({ length: posities.length }, (_, i) => i)
          : leesAccessor(glb, prim.indices);
        const driehoeken = [];
        for (let i = 0; i + 2 < plat.length; i += 3) driehoeken.push([plat[i], plat[i + 1], plat[i + 2]]);
        yield { naam: mesh.name ?? '', materiaal: prim.material, posities, normalen, uvs, driehoeken };
      }
    }
    for (const kind of node.children ?? []) yield* loop(kind, matrix);
  };

  for (const index of scene.nodes ?? []) yield* loop(index, IDENTITEIT);
}
