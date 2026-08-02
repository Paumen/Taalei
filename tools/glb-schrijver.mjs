/**
 * Minimale .glb-schrijver: tegenhanger van glb-lezer.mjs.
 *
 * Schrijft precies wat de stijlgids van een asset vraagt — één mesh, één
 * materiaal dat naar de gedeelde colormap wijst, en verder niets. Geen
 * animaties, skins of ingebedde textuur.
 */

import { writeFileSync } from 'node:fs';

const MAGIC_GLTF = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const FLOAT = 5126;
const USHORT = 5123;
const UINT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

/** Vult aan tot een veelvoud van 4; glTF eist die uitlijning per chunk. */
const uitlijnen = (n) => (4 - (n % 4)) % 4;

/**
 * @param {object} o
 * @param {string} o.naam           mesh- en nodenaam
 * @param {number[][]} o.posities   [[x, y, z], ...]
 * @param {number[][]} o.normalen   [[x, y, z], ...]
 * @param {number[][]} o.uvs        [[u, v], ...]
 * @param {number[]} o.indices      platte lijst driehoekindices
 * @param {string} o.textuur        relatief pad naar de gedeelde colormap
 * @param {object} [o.extras]       waarde voor asset.extras.taaleiland
 * @param {string} [o.generator]
 */
export function bouwGlb({ naam, posities, normalen, uvs, indices, textuur, extras, generator }) {
  const grootIndex = posities.length > 65535;
  const stukken = [];
  let offset = 0;

  const voegToe = (typedArray, target) => {
    const bytes = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const view = { buffer: 0, byteOffset: offset, byteLength: bytes.length };
    if (target) view.target = target;
    stukken.push(bytes);
    offset += bytes.length;
    const vul = uitlijnen(offset);
    if (vul) {
      stukken.push(Buffer.alloc(vul));
      offset += vul;
    }
    return view;
  };

  const plat = (rijen) => {
    const uit = new Float32Array(rijen.length * rijen[0].length);
    let i = 0;
    for (const rij of rijen) for (const waarde of rij) uit[i++] = waarde;
    return uit;
  };

  const bufferViews = [];
  bufferViews.push(voegToe(plat(posities), ARRAY_BUFFER));   // 0
  bufferViews.push(voegToe(plat(normalen), ARRAY_BUFFER));   // 1
  bufferViews.push(voegToe(plat(uvs), ARRAY_BUFFER));        // 2
  bufferViews.push(voegToe(
    grootIndex ? new Uint32Array(indices) : new Uint16Array(indices),
    ELEMENT_ARRAY_BUFFER,
  ));                                                        // 3

  // POSITION moet min/max hebben; viewers gebruiken het voor culling en framing.
  const laag = [Infinity, Infinity, Infinity];
  const hoog = [-Infinity, -Infinity, -Infinity];
  for (const p of posities) {
    for (let k = 0; k < 3; k += 1) {
      laag[k] = Math.min(laag[k], p[k]);
      hoog[k] = Math.max(hoog[k], p[k]);
    }
  }

  const json = {
    asset: {
      version: '2.0',
      generator: generator ?? 'taalei',
      ...(extras ? { extras: { taaleiland: extras } } : {}),
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: naam }],
    meshes: [{
      name: naam,
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
        material: 0,
        mode: 4,
      }],
    }],
    materials: [{
      name: 'colormap',
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      doubleSided: false,
    }],
    textures: [{ sampler: 0, source: 0 }],
    // Zelfde sampler als de kits, zodat één GPU-textuur alles bedient.
    samplers: [{ minFilter: 9987 }],
    images: [{ uri: textuur, name: 'colormap' }],
    accessors: [
      { bufferView: 0, componentType: FLOAT, count: posities.length, type: 'VEC3', min: laag, max: hoog },
      { bufferView: 1, componentType: FLOAT, count: normalen.length, type: 'VEC3' },
      { bufferView: 2, componentType: FLOAT, count: uvs.length, type: 'VEC2' },
      { bufferView: 3, componentType: grootIndex ? UINT : USHORT, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews,
    buffers: [{ byteLength: offset }],
  };

  const bin = Buffer.concat(stukken);
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  if (uitlijnen(jsonBuf.length)) {
    jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(uitlijnen(jsonBuf.length), 0x20)]);
  }

  const totaal = 12 + 8 + jsonBuf.length + 8 + bin.length;
  const kop = Buffer.alloc(12);
  kop.writeUInt32LE(MAGIC_GLTF, 0);
  kop.writeUInt32LE(2, 4);
  kop.writeUInt32LE(totaal, 8);

  const jsonKop = Buffer.alloc(8);
  jsonKop.writeUInt32LE(jsonBuf.length, 0);
  jsonKop.writeUInt32LE(CHUNK_JSON, 4);

  const binKop = Buffer.alloc(8);
  binKop.writeUInt32LE(bin.length, 0);
  binKop.writeUInt32LE(CHUNK_BIN, 4);

  return Buffer.concat([kop, jsonKop, jsonBuf, binKop, bin]);
}

export function schrijfGlb(pad, opties) {
  const buf = bouwGlb(opties);
  writeFileSync(pad, buf);
  return buf.length;
}
