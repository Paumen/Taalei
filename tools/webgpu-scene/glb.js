/**
 * De .glb's uit kits/ inlezen in de browser, net zo smal als tools/glb.mjs dat
 * aan de node-kant doet: alleen wat deze scène tekent — posities, normalen,
 * UV's en indices, met de node-hiërarchie er alvast in gebakken.
 *
 * De kits hebben geen skinning, geen morphs en één materiaal per model dat naar
 * dezelfde colormap wijst, dus die textuur laadt de scène zelf één keer. Alles
 * wat daarbuiten valt levert een duidelijke fout op in plaats van stilzwijgend
 * iets anders te tekenen.
 */

import { eenheid, maal, normaalMatrix, uitTRS } from './wiskunde.js';

const GROOTTE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const ONDERDELEN = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** GLB: 12 bytes kop, daarna chunks van [lengte, soort, data]. */
function pelGlb(buffer) {
  const kop = new DataView(buffer);
  if (kop.getUint32(0, true) !== 0x46546c67) throw new Error('geen geldige GLB');

  let json = null;
  let bin = null;
  let plek = 12;
  while (plek + 8 <= buffer.byteLength) {
    const lengte = kop.getUint32(plek, true);
    const soort = kop.getUint32(plek + 4, true);
    const data = buffer.slice(plek + 8, plek + 8 + lengte);
    if (soort === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data));
    if (soort === 0x004e4942) bin = data;
    plek += 8 + lengte;
  }
  if (!json) throw new Error('GLB zonder JSON-chunk');
  return { json, bin };
}

/** Een accessor uitlezen als platte Float32Array of Uint32Array. */
function leesAccessor(json, bin, index) {
  const acc = json.accessors[index];
  const onderdelen = ONDERDELEN[acc.type];
  if (!onderdelen) throw new Error(`onbekend accessortype ${acc.type}`);
  const maat = GROOTTE[acc.componentType];
  const bv = json.bufferViews[acc.bufferView];
  const start = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stap = bv.byteStride ?? onderdelen * maat;
  const zicht = new DataView(bin, start, bv.byteLength - (acc.byteOffset ?? 0));

  const drijvend = acc.componentType === 5126;
  const uit = drijvend ? new Float32Array(acc.count * onderdelen) : new Uint32Array(acc.count * onderdelen);
  for (let i = 0; i < acc.count; i++) {
    for (let k = 0; k < onderdelen; k++) {
      const plek = i * stap + k * maat;
      uit[i * onderdelen + k] =
        acc.componentType === 5126 ? zicht.getFloat32(plek, true)
        : acc.componentType === 5125 ? zicht.getUint32(plek, true)
        : acc.componentType === 5123 ? zicht.getUint16(plek, true)
        : acc.componentType === 5122 ? zicht.getInt16(plek, true)
        : zicht.getUint8(plek);
    }
  }
  return uit;
}

const matrixVan = (node) =>
  node.matrix ? new Float32Array(node.matrix) : uitTRS(node.translation, node.rotation, node.scale);

/**
 * @returns {Promise<Array<{vertices: Float32Array, indices: Uint32Array}>>}
 *   per primitive de hoekpunten als [x,y,z, nx,ny,nz, u,v], al in de ruimte van
 *   het model zelf gezet.
 */
export async function laadGlb(url) {
  const { json, bin } = pelGlb(await (await fetch(url)).arrayBuffer());
  if (!bin) throw new Error(`${url} heeft geen binaire chunk`);

  const stukken = [];
  const loop = (index, ouder) => {
    const node = json.nodes[index];
    const wereld = maal(ouder, matrixVan(node));
    /* normalen volgen de inverse-getransponeerde; een gespiegelde of ongelijk
     * geschaalde node zou ze anders schuin zetten */
    const nm = normaalMatrix(wereld);

    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        if ((prim.mode ?? 4) !== 4) throw new Error(`${url}: alleen driehoeken`);
        const { POSITION, NORMAL, TEXCOORD_0 } = prim.attributes;
        if (POSITION === undefined || NORMAL === undefined || TEXCOORD_0 === undefined) {
          throw new Error(`${url}: mist POSITION, NORMAL of TEXCOORD_0`);
        }
        const posities = leesAccessor(json, bin, POSITION);
        const normalen = leesAccessor(json, bin, NORMAL);
        const uv = leesAccessor(json, bin, TEXCOORD_0);
        const aantal = posities.length / 3;

        const vertices = new Float32Array(aantal * 8);
        for (let i = 0; i < aantal; i++) {
          const [x, y, z] = [posities[i*3], posities[i*3+1], posities[i*3+2]];
          const [nx, ny, nz] = [normalen[i*3], normalen[i*3+1], normalen[i*3+2]];
          /* wereldmatrix meteen toepassen: de scène plaatst daarna alleen het
           * model als geheel, en dan hoeft de hiërarchie niet mee de GPU op */
          vertices[i*8+0] = wereld[0]*x + wereld[4]*y + wereld[8]*z + wereld[12];
          vertices[i*8+1] = wereld[1]*x + wereld[5]*y + wereld[9]*z + wereld[13];
          vertices[i*8+2] = wereld[2]*x + wereld[6]*y + wereld[10]*z + wereld[14];
          vertices[i*8+3] = nm[0]*nx + nm[4]*ny + nm[8]*nz;
          vertices[i*8+4] = nm[1]*nx + nm[5]*ny + nm[9]*nz;
          vertices[i*8+5] = nm[2]*nx + nm[6]*ny + nm[10]*nz;
          vertices[i*8+6] = uv[i*2];
          vertices[i*8+7] = uv[i*2+1];
        }

        const indices = prim.indices !== undefined
          ? Uint32Array.from(leesAccessor(json, bin, prim.indices))
          : Uint32Array.from({ length: aantal }, (_, i) => i);
        stukken.push({ vertices, indices });
      }
    }
    for (const kind of node.children ?? []) loop(kind, wereld);
  };

  const scene = json.scenes[json.scene ?? 0];
  for (const wortel of scene.nodes) loop(wortel, eenheid());
  if (stukken.length === 0) throw new Error(`${url} bevat geen driehoeken`);
  return stukken;
}
