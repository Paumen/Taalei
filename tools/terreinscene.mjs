/**
 * Terreinstukken uit kits/modulair-terrein op een raster zetten en samenvoegen
 * tot één GLB. Gedeeld door de bouwscripts van de scènes in scenes/.
 *
 * -- het raster -------------------------------------------------------------
 * Elk terreinstuk staat op een cel van 0,5 × 0,5 unit, met zijn oorsprong in
 * het midden van die cel; cel (i, j) is dus wereldpunt (0,5·i, 0,5·j). Eén
 * hoogtestap is ook 0,5 unit. De X-as loopt naar rechts, de Z-as naar achteren.
 *
 * i en j mogen halve getallen zijn. Dat is geen sluipweg maar noodzaak: niet
 * elk stuk in het pakket heeft zijn oorsprong in het midden van een cel — de
 * strandtaluds bijvoorbeeld beginnen op de celrand.
 *
 * -- draaien en spiegelen ---------------------------------------------------
 * Draaien gaat om de y-as door de celoorsprong, in stappen van 90°. Spiegelen
 * gebeurt in x, vóór het draaien, en keert de winding om — anders wijzen de
 * voorkanten van dat stuk naar binnen. Spiegelen is nodig omdat een kit alleen
 * de linkerhelft van een symmetrisch paar levert: een padkant, een traprand.
 *
 * -- samenvoegen ------------------------------------------------------------
 * Alle stukken van dit pakket delen één materiaal en één textuur
 * (Textures/colormap.png), en elk stuk is één primitive zonder eigen
 * node-hiërarchie. Daarom kan een hele scène in één mesh met één primitive:
 * één tekenopdracht in plaats van honderden. De colormap gaat mee ín het GLB,
 * zodat het bestand op zichzelf staat.
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { leesGlb, leesAccessor, schrijfGlb, nodeMatrix } from './glb.mjs';

export const KIT = 'kits/modulair-terrein';
export const CEL = 0.5; // celmaat en hoogtestap in units

/* -- stukken lezen --------------------------------------------------------- */

const tegelCache = new Map();

/** Leest een stuk uit de kit uit als kale vertexdata, met de node-transform er
 * al in verrekend. Elk stuk is één node met één mesh met één primitive; iets
 * anders komt in dit pakket niet voor en zou hier stil fout gaan. */
function tegel(naam) {
  if (tegelCache.has(naam)) return tegelCache.get(naam);

  const glb = leesGlb(`${KIT}/${naam}.glb`);
  const { json } = glb;
  if (json.nodes.length !== 1 || json.meshes.length !== 1) {
    throw new Error(`${naam}: verwacht één node met één mesh`);
  }
  if (json.meshes[0].primitives.length !== 1) throw new Error(`${naam}: meer dan één primitive`);
  const prim = json.meshes[0].primitives[0];

  const m = nodeMatrix(json.nodes[0]);
  const positie = leesAccessor(glb, prim.attributes.POSITION);
  const normaal = leesAccessor(glb, prim.attributes.NORMAL);
  const uv = leesAccessor(glb, prim.attributes.TEXCOORD_0);
  const index = leesAccessor(glb, prim.indices);

  /* De node-transform is hier altijd een schaling; alleen die en een eventuele
   * verschuiving hoeven mee. Normalen blijven daarbij goed staan. */
  const p = new Float64Array(positie.count * 3);
  for (let v = 0; v < positie.count; v++) {
    const [x, y, z] = [positie.data[v * 3], positie.data[v * 3 + 1], positie.data[v * 3 + 2]];
    p[v * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
    p[v * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    p[v * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }

  const uit = { positie: p, normaal: normaal.data, uv: uv.data, index: index.data, count: positie.count };
  tegelCache.set(naam, uit);
  return uit;
}

/* -- scène ----------------------------------------------------------------- */

export class Scene {
  constructor() {
    this.stukken = [];
  }

  /**
   * Zet één terreinstuk neer.
   *
   * @param naam    bestandsnaam in de kit, zonder .glb
   * @param i, j    cel; het stuk komt met zijn oorsprong op het celmiddelpunt
   * @param opties  draai in graden (0/90/180/270), spiegel in x, hoogte in units
   */
  zet(naam, i, j, { draai = 0, spiegel = false, hoogte = 0 } = {}) {
    this.stukken.push({ naam, i, j, draai, spiegel, hoogte });
    return this;
  }

  /**
   * Voegt alles samen en schrijft het GLB weg.
   *
   * @param pad      doelbestand
   * @param midden   [x, z] in cellen: dat punt komt op de oorsprong te liggen,
   *                 zodat de scène gecentreerd in een viewer verschijnt. De
   *                 hoogte blijft zoals hij is; y=0 is dus padhoogte.
   */
  schrijf(pad, midden = [0, 0]) {
    const posities = [];
    const normalen = [];
    const uvs = [];
    const indices = [];

    /* Punten die op alle drie de eigenschappen gelijk zijn, worden er één. Dat
     * scheelt vooral in vlakke velden: buurtegels delen daar hun hoekpunten,
     * inclusief normaal en textuurcoördinaat. Afronden op vier decimalen omdat
     * het draaien en verschuiven anders 4.999999999 tegenover 5 zet. */
    const punten = new Map();
    const punt = (p, n, uv) => {
      const sleutel = [...p, ...n, ...uv].map((v) => Math.round(v * 1e4)).join(',');
      const bestaand = punten.get(sleutel);
      if (bestaand !== undefined) return bestaand;

      const index = posities.length / 3;
      posities.push(...p);
      normalen.push(...n);
      uvs.push(...uv);
      punten.set(sleutel, index);
      return index;
    };

    const [middenI, middenJ] = midden;

    for (const stuk of this.stukken) {
      const t = tegel(stuk.naam);

      const hoek = (stuk.draai * Math.PI) / 180;
      const cos = Math.round(Math.cos(hoek));
      const sin = Math.round(Math.sin(hoek));
      const sp = stuk.spiegel ? -1 : 1;

      /* Draaien om de y-as, na een eventuele spiegeling in x. Beide bewaren de
       * lengte, dus normalen mogen door dezelfde bewerking. */
      const draaiPunt = (x, y, z) => [sp * x * cos + z * sin, y, -sp * x * sin + z * cos];

      const eigen = new Array(t.count);
      for (let v = 0; v < t.count; v++) {
        const [px, py, pz] = draaiPunt(t.positie[v * 3], t.positie[v * 3 + 1], t.positie[v * 3 + 2]);
        const [nx, ny, nz] = draaiPunt(t.normaal[v * 3], t.normaal[v * 3 + 1], t.normaal[v * 3 + 2]);
        eigen[v] = punt(
          [px + (stuk.i - middenI) * CEL, py + stuk.hoogte, pz + (stuk.j - middenJ) * CEL],
          [nx, ny, nz],
          [t.uv[v * 2], t.uv[v * 2 + 1]],
        );
      }

      for (let k = 0; k < t.index.length; k += 3) {
        const [a, b, c] = [eigen[t.index[k]], eigen[t.index[k + 1]], eigen[t.index[k + 2]]];
        if (stuk.spiegel) indices.push(a, c, b);
        else indices.push(a, b, c);
      }
    }

    const vulling = (n) => (4 - (n % 4)) % 4;

    const aantalPunten = posities.length / 3;
    /* Onder de 65536 punten passen de indices in twee bytes; dat scheelt een
     * vijfde van het bestand. */
    const kort = aantalPunten < 65536;
    const posBuf = Buffer.from(new Float32Array(posities).buffer);
    const norBuf = Buffer.from(new Float32Array(normalen).buffer);
    const uvBuf = Buffer.from(new Float32Array(uvs).buffer);
    const idxRuw = Buffer.from((kort ? new Uint16Array(indices) : new Uint32Array(indices)).buffer);
    const idxBuf = Buffer.concat([idxRuw, Buffer.alloc(vulling(idxRuw.length), 0)]);
    const png = readFileSync(`${KIT}/Textures/colormap.png`);
    const pngBuf = Buffer.concat([png, Buffer.alloc(vulling(png.length), 0)]);

    const delen = [posBuf, norBuf, uvBuf, idxBuf, pngBuf];
    const bin = Buffer.concat(delen);

    let offset = 0;
    const bufferViews = delen.map((deel) => {
      const view = { buffer: 0, byteOffset: offset, byteLength: deel.length };
      offset += deel.length;
      return view;
    });
    /* De colormap is een los blok bytes, geen vertexdata; alleen de eerste vier
     * views krijgen een target mee. De vulbytes achter de indices en achter de
     * PNG houden de volgende view op een veelvoud van vier, maar horen niet bij
     * de gegevens zelf. */
    bufferViews[0].target = 34962;
    bufferViews[1].target = 34962;
    bufferViews[2].target = 34962;
    bufferViews[3].target = 34963;
    bufferViews[3].byteLength = idxRuw.length;
    bufferViews[4].byteLength = png.length;

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < posities.length; v += 3) {
      for (let as = 0; as < 3; as++) {
        if (posities[v + as] < min[as]) min[as] = posities[v + as];
        if (posities[v + as] > max[as]) max[as] = posities[v + as];
      }
    }
    const rond = (v) => Math.round(v * 1000) / 1000;
    const naam = pad.split('/').pop().replace(/\.glb$/, '');

    const json = {
      asset: { version: '2.0', generator: 'tools/terreinscene.mjs' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: naam, mesh: 0 }],
      meshes: [{
        name: naam,
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }],
      }],
      materials: [{
        name: 'colormap',
        pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
        doubleSided: true,
      }],
      textures: [{ sampler: 0, source: 0, name: 'colormap' }],
      samplers: [{ minFilter: 9987 }],
      images: [{ name: 'colormap', bufferView: 4, mimeType: 'image/png' }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: aantalPunten,
          type: 'VEC3',
          min: min.map(rond),
          max: max.map(rond),
        },
        { bufferView: 1, componentType: 5126, count: aantalPunten, type: 'VEC3' },
        { bufferView: 2, componentType: 5126, count: aantalPunten, type: 'VEC2' },
        { bufferView: 3, componentType: kort ? 5123 : 5125, count: indices.length, type: 'SCALAR' },
      ],
      bufferViews,
      buffers: [{ byteLength: bin.length }],
    };

    mkdirSync(dirname(pad), { recursive: true });
    schrijfGlb(pad, json, bin, writeFileSync);

    return {
      stukken: this.stukken.length,
      driehoeken: indices.length / 3,
      punten: aantalPunten,
      maat: [rond(max[0] - min[0]), rond(max[2] - min[2]), rond(max[1] - min[1])],
    };
  }
}
