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

/**
 * Zet een model op zijn plek met een extra wortel-node: geschaald, met de voet
 * op y=0 en het grondvlak gecentreerd op x/z (stijlgids §5).
 *
 * Waarom een node en niet de vertexdata: bij een geskind model liggen de
 * vertices in bindpose-ruimte en bepalen de gewrichten waar ze uitkomen. De
 * mesh verplaatsen zonder het skelet levert een model op dat bij het eerste
 * animatieframe terugspringt. Een node boven mesh én armature neemt beide mee.
 *
 * Past de scène ter plekke aan.
 */
export function zetOpOorsprong(glb, naam, schaal = 1) {
  const maat = meetScene(glb);
  const scene = glb.json.scenes[glb.json.scene ?? 0];

  const wortel = {
    name: naam,
    scale: [schaal, schaal, schaal],
    translation: [
      -schaal * (maat.min[0] + maat.max[0]) / 2,
      -schaal * maat.min[1],
      -schaal * (maat.min[2] + maat.max[2]) / 2,
    ].map((v) => Math.round(v * 1e6) / 1e6),
    children: [...scene.nodes],
  };

  glb.json.nodes.push(wortel);
  scene.nodes = [glb.json.nodes.length - 1];
  return maat;
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

/**
 * Het tekenbudget uit docs/asset_style_guide.md §4, in driehoeken per 1×1×1
 * unit. Hier en nergens anders: build-catalog.mjs schrijft hem mee in
 * catalog.json en de catalogus in de browser leest hem daaruit, zodat één
 * wijziging hier overal doorwerkt.
 */
export const BUDGET_PER_UNIT = 1000;

/**
 * Driehoeken per bezette rastercel — afgezet tegen BUDGET_PER_UNIT hierboven.
 *
 * De noemer is het aantal cellen dat het model bezet, met één cel als
 * ondergrens: max(1, b × d) × max(1, h), zoals importeer-village.mjs hem
 * altijd al rekende. Zonder die ondergrens groeit de dichtheid met 1/maat³
 * en kan geen enkel klein voorwerp ooit slagen — een schroef van
 * 0,06 × 0,06 × 0,12 zou op minder dan één driehoek moeten uitkomen. Een
 * vloertegel van 2 × 2 wordt nog steeds op vier cellen afgerekend en een
 * emmer kleiner dan één cel krijgt geen korting omdat hij klein is: zijn
 * budget is precies dat van één cel.
 *
 * Een vlak model blijft `null`: het heeft geen volume en de catalogus
 * rapporteert die modellen apart, met een handvol driehoeken staan ze toch
 * al buiten elke discussie over budget.
 *
 * @param {number} driehoeken  telling uit meetScene()
 * @param {number[]} wdh       breedte × diepte × hoogte in rastereenheden
 * @returns {number|null} driehoeken per bezette cel, afgerond; null bij een plat model
 */
export function driehoekenPerUnit(driehoeken, wdh) {
  if (wdh.some((maat) => maat === 0)) return null;
  const cellen = Math.max(1, wdh[0] * wdh[1]) * Math.max(1, wdh[2]);
  return Math.round(driehoeken / cellen);
}

/* -- opschonen ------------------------------------------------------------
 * Een geïmporteerde pack draagt meer mee dan de catalogus kan gebruiken: de
 * tropical-pack levert drie LOD-meshes in één bestand, allemaal in de scène en
 * dus allemaal over elkaar heen getekend, plus een tweede UV-set die nergens
 * naar verwijst. Deze repo kent geen LOD's — `calls` en `driehoeken` in de
 * catalogus zijn tekenbudget, geen bovengrens van een detailtrap — dus er blijft
 * één mesh over en de rest moet er niet alleen uit de scène, maar ook uit het
 * bestand: anders staan de bytes in catalog.json voor geometrie die niemand ziet.
 */

/**
 * Bouwt een nieuw GLB met alleen de opgegeven meshes en attributen. Accessors,
 * bufferViews en de binaire buffer worden strak opnieuw opgebouwd, zodat er
 * niets ongebruikts achterblijft.
 *
 * De meshes komen als losse nodes in de scène te staan, in de volgorde waarin
 * ze zijn opgegeven. Materialen, texturen en images gaan ongewijzigd mee; de
 * importeurs zetten die daarna zelf goed.
 *
 * De plaatsing van een mesh blijft staan: de wereldmatrix van de node die hem
 * aanriep gaat mee als `matrix`. Dat is niet vanzelfsprekend maar wel nodig —
 * `mountain01` uit de nature-pack hangt aan een node met schaal 0,5, en zonder
 * die matrix komt de berg er twee keer zo groot uit als de pack hem bedoelde.
 *
 * @param {{json: object, bin: Buffer}} glb
 * @param {number[]} meshIndexen  welke meshes blijven
 * @param {string[]} attributen   welke vertex-attributen blijven
 * @returns {{json: object, bin: Buffer}} een nieuw GLB; `glb` blijft ongemoeid
 */
export function compacteer(glb, meshIndexen, attributen = ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
  const bron = glb.json;

  /* Wereldmatrix per node, langs dezelfde weg als meetScene() hem loopt. */
  const wereld = new Array((bron.nodes ?? []).length).fill(null);
  const zetWereld = (index, ouder) => {
    if (wereld[index]) return;
    const node = bron.nodes[index];
    if (!node) return;
    wereld[index] = maalMatrix(ouder, nodeMatrix(node));
    for (const kind of node.children ?? []) zetWereld(kind, wereld[index]);
  };
  for (const index of bron.scenes?.[bron.scene ?? 0]?.nodes ?? []) zetWereld(index, EENHEIDSMATRIX);

  // Mesh → de matrix waarmee de scène hem tekent. Wordt een mesh door meer dan
  // één node gebruikt, dan telt de eerste; dat komt in deze packs niet voor.
  const matrixVanMesh = new Map();
  (bron.nodes ?? []).forEach((node, index) => {
    if (node.mesh === undefined || !wereld[index]) return;
    if (!matrixVanMesh.has(node.mesh)) matrixVanMesh.set(node.mesh, wereld[index]);
  });
  const stukken = [];
  const bufferViews = [];
  const accessors = [];
  let lengte = 0;

  /* Kopieert één accessor mee en geeft zijn nieuwe index terug. De brondata
   * wordt daarbij ontvlochten: elke accessor krijgt zijn eigen bufferView zonder
   * byteStride, wat de glTF-spec toestaat en het rekenwerk hier simpel houdt. */
  const neem = (index) => {
    const acc = bron.accessors[index];
    if (acc.sparse) throw new Error('sparse accessor wordt niet ondersteund');

    const Soort = COMPONENT[acc.componentType];
    const breedte = ONDERDELEN[acc.type];
    const eenheid = breedte * Soort.BYTES_PER_ELEMENT;
    const bv = bron.bufferViews[acc.bufferView];
    const start = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const stap = bv.byteStride ?? eenheid;

    // Op een veelvoud van vier beginnen: de spec eist dat een accessor uitkomt
    // op een offset die deelbaar is door zijn componentgrootte.
    while (lengte % 4 !== 0) {
      stukken.push(Buffer.alloc(1));
      lengte++;
    }

    const uit = Buffer.alloc(acc.count * eenheid);
    for (let i = 0; i < acc.count; i++) {
      glb.bin.copy(uit, i * eenheid, start + i * stap, start + i * stap + eenheid);
    }

    bufferViews.push({
      buffer: 0,
      byteOffset: lengte,
      byteLength: uit.length,
      ...(bv.target ? { target: bv.target } : {}),
    });
    stukken.push(uit);
    lengte += uit.length;

    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: acc.componentType,
      count: acc.count,
      type: acc.type,
      // min/max is verplicht voor POSITION en verder nooit schadelijk.
      ...(acc.min ? { min: acc.min } : {}),
      ...(acc.max ? { max: acc.max } : {}),
    });
    return accessors.length - 1;
  };

  const meshes = meshIndexen.map((mi) => ({
    name: bron.meshes[mi].name,
    primitives: bron.meshes[mi].primitives.map((prim) => {
      const attrs = {};
      for (const naam of attributen) {
        if (prim.attributes[naam] !== undefined) attrs[naam] = neem(prim.attributes[naam]);
      }
      return {
        attributes: attrs,
        ...(prim.indices !== undefined ? { indices: neem(prim.indices) } : {}),
        ...(prim.material !== undefined ? { material: prim.material } : {}),
        ...(prim.mode !== undefined ? { mode: prim.mode } : {}),
      };
    }),
  }));

  const json = {
    asset: bron.asset,
    scene: 0,
    scenes: [{ nodes: meshes.map((_, i) => i) }],
    nodes: meshes.map((mesh, i) => {
      const matrix = matrixVanMesh.get(meshIndexen[i]) ?? EENHEIDSMATRIX;
      const eenheid = matrix.every((v, k) => v === EENHEIDSMATRIX[k]);
      return { mesh: i, name: mesh.name, ...(eenheid ? {} : { matrix }) };
    }),
    meshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: lengte }],
    ...(bron.materials ? { materials: bron.materials } : {}),
    ...(bron.textures ? { textures: bron.textures } : {}),
    ...(bron.images ? { images: bron.images } : {}),
    ...(bron.samplers ? { samplers: bron.samplers } : {}),
  };

  return { json, bin: Buffer.concat(stukken) };
}

/* -- ontkoppelen ------------------------------------------------------------
 * tools/kleurmap.mjs wijst elke driehoek zijn eigen meerderheidskleur toe,
 * maar kan een hoekpunt dat door twee driehoeken met een verschillende
 * meerderheid wordt gedeeld niet allebei gelijk geven: welke kant hermapUv()
 * ook kiest, de andere driehoek blijft over twee cellen heen liggen. Bij een
 * bronmodel met gebakken belichting (rpgtools, forest, resources, dungeon)
 * ligt zo'n gedeeld hoekpunt vaak precies op de rand tussen een lichte en een
 * donkere kleur, en het slepen tussen twee ver uiteenliggende cellen van de
 * gedeelde colormap veegt dan zichtbaar over de kleuren die daartussen liggen
 * — een vlag van willekeurige strepen in plaats van een rand.
 *
 * De oplossing is elk hoekpunt te ontkoppelen: geen twee driehoeken delen nog
 * een hoekpunt, dus elke driehoek kan zijn eigen meerderheid onafhankelijk
 * kiezen. Dat kost geheugen (elke driehoek krijgt een eigen kopie van elk
 * attribuut in plaats van gedeelde hoekpunten), maar deze kits zijn klein
 * genoeg dat dat niets uitmaakt.
 *
 * Draai dit vóór hermapUv(), op de ruwe, ongewijzigde bronscène.
 */
export function ontvlecht(glb, meshIndexen) {
  const bron = glb.json;
  const stukken = [];
  const bufferViews = [];
  const accessors = [];
  let lengte = 0;

  const zetVlak = (accessor, minmax) => {
    while (lengte % 4 !== 0) {
      stukken.push(Buffer.alloc(1));
      lengte++;
    }
    const Soort = COMPONENT[accessor.componentType];
    const eenheid = ONDERDELEN[accessor.type] * Soort.BYTES_PER_ELEMENT;
    bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: accessor.data.length });
    stukken.push(accessor.data);
    lengte += accessor.data.length;
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: accessor.componentType,
      count: accessor.data.length / eenheid,
      type: accessor.type,
      ...minmax,
    });
    return accessors.length - 1;
  };

  const meshes = bron.meshes.map((mesh, mi) => {
    if (!meshIndexen.includes(mi)) return mesh;
    return {
      ...mesh,
      primitives: mesh.primitives.map((prim) => {
        if (prim.indices === undefined) return prim; // geen indices, niets te ontkoppelen

        const idx = leesAccessor(glb, prim.indices);
        const n = idx.count;
        if (n > 65535) throw new Error('ontvlecht(): meer dan 65535 hoekpunten na ontkoppelen, Uint16 past niet meer');

        const attributes = {};
        for (const [naam, accIndex] of Object.entries(prim.attributes)) {
          const bronAcc = bron.accessors[accIndex];
          const gelezen = leesAccessor(glb, accIndex);
          const breedte = gelezen.breedte;
          const Soort = COMPONENT[bronAcc.componentType];
          const data = new Soort(n * breedte);
          const min = naam === 'POSITION' ? new Array(breedte).fill(Infinity) : null;
          const max = naam === 'POSITION' ? new Array(breedte).fill(-Infinity) : null;
          for (let i = 0; i < n; i++) {
            const oud = idx.data[i];
            for (let k = 0; k < breedte; k++) {
              const v = gelezen.data[oud * breedte + k];
              data[i * breedte + k] = v;
              if (min) {
                if (v < min[k]) min[k] = v;
                if (v > max[k]) max[k] = v;
              }
            }
          }
          attributes[naam] = zetVlak({
            componentType: bronAcc.componentType,
            type: bronAcc.type,
            data: Buffer.from(data.buffer, data.byteOffset, data.byteLength),
          }, min ? { min, max } : {});
        }

        const nieuweIndices = new Uint16Array(n);
        for (let i = 0; i < n; i++) nieuweIndices[i] = i;
        const indices = zetVlak({
          componentType: 5123,
          type: 'SCALAR',
          data: Buffer.from(nieuweIndices.buffer),
        });

        return {
          attributes,
          indices,
          ...(prim.material !== undefined ? { material: prim.material } : {}),
          ...(prim.mode !== undefined ? { mode: prim.mode } : {}),
        };
      }),
    };
  });

  return {
    json: { ...bron, meshes, accessors, bufferViews, buffers: [{ byteLength: lengte }] },
    bin: Buffer.concat(stukken),
  };
}
