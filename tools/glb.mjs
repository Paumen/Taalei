/**
 * GLB lezen en opmeten. Gedeeld door tools/build-catalog.mjs en
 * tools/importeer-onderwater.mjs.
 *
 * De catalogus meet elk model op zoals het in de scène staat, want dat is wat
 * de speler ziet en wat tegen het raster van 1 unit aan moet passen. Voor de
 * losse props van Kenney kan dat uit de min/max van de POSITION-accessors,
 * maar de onderwater-kit is geskind: daar staan de vertices in bindpose-ruimte
 * en bepalen de gewrichten waar ze terechtkomen. Zonder de skinning mee te
 * rekenen zou de pinguïn 1,77 units breed heten terwijl hij 2,43 units lang is.
 * Daarom lezen we de vertexdata en rekenen we de skinning-matrices uit.
 */

import { readFileSync } from 'node:fs';

/* -- container ------------------------------------------------------------
 * GLB: 12-byte header, daarna chunks van [lengte, type, data]. De eerste chunk
 * is de glTF-JSON, de tweede (als hij er is) de binaire buffer.
 */
export function leesGlb(pad) {
  const buf = readFileSync(pad);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`geen geldige GLB: ${pad}`);
  }
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`eerste chunk is geen JSON: ${pad}`);

  const jsonLengte = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLengte).toString('utf8'));

  let bin = null;
  let offset = 20 + jsonLengte;
  while (offset + 8 <= buf.length) {
    const lengte = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    if (type === 0x004e4942) bin = buf.subarray(offset + 8, offset + 8 + lengte);
    offset += 8 + lengte;
  }

  return { json, bin };
}

/** Schrijft json + bin terug als GLB. De binaire chunk gaat ongewijzigd mee. */
export function schrijfGlb(pad, json, bin, schrijfBestand) {
  const vulling = (n) => (4 - (n % 4)) % 4;
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  // Spaties na de JSON, nullen na de binaire data: zo schrijft de spec het voor.
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(vulling(jsonBuf.length), 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc(vulling(bin.length), 0)]);

  const kop = Buffer.alloc(12);
  kop.writeUInt32LE(0x46546c67, 0);
  kop.writeUInt32LE(2, 4);
  kop.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);

  const jsonKop = Buffer.alloc(8);
  jsonKop.writeUInt32LE(jsonChunk.length, 0);
  jsonKop.writeUInt32LE(0x4e4f534a, 4);

  const binKop = Buffer.alloc(8);
  binKop.writeUInt32LE(binChunk.length, 0);
  binKop.writeUInt32LE(0x004e4942, 4);

  schrijfBestand(pad, Buffer.concat([kop, jsonKop, jsonChunk, binKop, binChunk]));
}

/* -- matrices -------------------------------------------------------------
 * Kolom-major, zoals glTF ze aanlevert.
 */
export const EENHEIDSMATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function maalMatrix(a, b) {
  const r = new Array(16).fill(0);
  for (let kolom = 0; kolom < 4; kolom++) {
    for (let rij = 0; rij < 4; rij++) {
      let som = 0;
      for (let k = 0; k < 4; k++) som += a[k * 4 + rij] * b[kolom * 4 + k];
      r[kolom * 4 + rij] = som;
    }
  }
  return r;
}

/** Node-transform als matrix; `matrix` wint van losse translation/rotation/scale. */
export function nodeMatrix(node) {
  if (node.matrix) return node.matrix;

  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;

  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

/** Punt door een kolom-major matrix. */
const maalPunt = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

/* -- accessors ------------------------------------------------------------ */

const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const ONDERDELEN = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/**
 * Leest een accessor uit als vlakke Float64Array. Sparse accessors komen in
 * deze kits niet voor; als er ooit een opduikt is een harde fout beter dan
 * stilletjes de verkeerde punten meten.
 */
export function leesAccessor({ json, bin }, index) {
  const accessor = json.accessors[index];
  if (accessor.sparse) throw new Error('sparse accessor wordt niet ondersteund');

  const Soort = COMPONENT[accessor.componentType];
  const breedte = ONDERDELEN[accessor.type];
  const bufferView = json.bufferViews[accessor.bufferView];
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stap = bufferView.byteStride ?? breedte * Soort.BYTES_PER_ELEMENT;

  const uit = new Float64Array(accessor.count * breedte);
  for (let i = 0; i < accessor.count; i++) {
    const rij = new Soort(bin.buffer, bin.byteOffset + start + i * stap, breedte);
    for (let k = 0; k < breedte; k++) uit[i * breedte + k] = rij[k];
  }
  return { data: uit, breedte, count: accessor.count };
}

/* -- opmeten -------------------------------------------------------------- */

/**
 * Meet de scène in de rustpose op: afmetingen, hoekpunten, driehoeken en
 * tekenopdrachten.
 *
 * - `wdh`: breedte × diepte × hoogte (X × Z × Y) in rastereenheden.
 * - `min`/`max`: de bounding box zelf, nodig om een model op y=0 te zetten.
 * - `driehoeken`: zoals de scène ze tekent — een mesh die door drie nodes wordt
 *   hergebruikt telt drie keer, want dat is wat de GPU doet.
 * - `calls`: elke primitive is één tekenopdracht.
 *
 * Voor geskinde primitives wordt elk vertex door zijn skinning-matrices
 * gehaald (gewricht × inverse bindmatrix, gewogen); de transform van de
 * mesh-node zelf telt dan niet mee, precies zoals de glTF-spec voorschrijft.
 */
export function meetScene(glb) {
  const { json } = glb;
  const nodes = json.nodes ?? [];
  const scene = json.scenes?.[json.scene ?? 0];

  const wereld = new Array(nodes.length).fill(null);
  const zetWereld = (index, ouder) => {
    if (wereld[index]) return; // cyclus-beveiliging
    const node = nodes[index];
    if (!node) return;
    wereld[index] = maalMatrix(ouder, nodeMatrix(node));
    for (const kind of node.children ?? []) zetWereld(kind, wereld[index]);
  };
  for (const index of scene?.nodes ?? []) zetWereld(index, EENHEIDSMATRIX);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const pak = (p) => {
    for (let as = 0; as < 3; as++) {
      if (p[as] < min[as]) min[as] = p[as];
      if (p[as] > max[as]) max[as] = p[as];
    }
  };

  let driehoeken = 0;
  let calls = 0;

  nodes.forEach((node, index) => {
    if (node.mesh === undefined || !wereld[index]) return;

    for (const prim of json.meshes[node.mesh].primitives ?? []) {
      calls++;

      const telling = prim.indices !== undefined
        ? json.accessors[prim.indices]
        : json.accessors[prim.attributes.POSITION];
      if ((prim.mode ?? 4) === 4) driehoeken += Math.floor((telling?.count ?? 0) / 3);

      const positie = leesAccessor(glb, prim.attributes.POSITION);
      const skin = node.skin !== undefined && prim.attributes.JOINTS_0 !== undefined
        ? json.skins[node.skin]
        : null;

      if (!skin) {
        for (let v = 0; v < positie.count; v++) {
          pak(maalPunt(wereld[index], positie.data[v * 3], positie.data[v * 3 + 1], positie.data[v * 3 + 2]));
        }
        continue;
      }

      const bind = leesAccessor(glb, skin.inverseBindMatrices);
      const gewrichten = leesAccessor(glb, prim.attributes.JOINTS_0);
      const gewichten = leesAccessor(glb, prim.attributes.WEIGHTS_0);
      const skinMatrix = skin.joints.map((node, k) =>
        maalMatrix(wereld[node] ?? EENHEIDSMATRIX, Array.from(bind.data.slice(k * 16, k * 16 + 16))),
      );

      for (let v = 0; v < positie.count; v++) {
        const [x, y, z] = [positie.data[v * 3], positie.data[v * 3 + 1], positie.data[v * 3 + 2]];
        const uit = [0, 0, 0];
        let som = 0;
        for (let k = 0; k < 4; k++) {
          const gewicht = gewichten.data[v * 4 + k];
          if (!gewicht) continue;
          const m = skinMatrix[gewrichten.data[v * 4 + k]];
          if (!m) continue;
          som += gewicht;
          const p = maalPunt(m, x, y, z);
          for (let as = 0; as < 3; as++) uit[as] += gewicht * p[as];
        }
        // Een vertex zonder gewicht hangt aan niets; die volgt de mesh-node.
        pak(som === 0 ? maalPunt(wereld[index], x, y, z) : uit.map((v) => v / som));
      }
    }
  });

  // Op drie decimalen: de kits zijn op 0.01 units ontworpen, en zonder afronden
  // zet de float-rekenarij hier 1.0000000298023224 in de catalogus.
  const rond = (v) => Math.round(v * 1000) / 1000;
  const meet = (as) => (min[as] === Infinity ? 0 : rond(max[as] - min[as]));

  return {
    wdh: [meet(0), meet(2), meet(1)],
    min: min.map((v) => (Number.isFinite(v) ? rond(v) : 0)),
    max: max.map((v) => (Number.isFinite(v) ? rond(v) : 0)),
    driehoeken,
    calls,
  };
}
