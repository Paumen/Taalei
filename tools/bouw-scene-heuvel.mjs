/**
 * Bouwt scenes/heuvel.glb: een proefscène uit kits/modulair-terrein, alleen
 * terreinstukken, geen props.
 *
 * Draai vanuit de repo-root:  node tools/bouw-scene-heuvel.mjs
 *
 * -- waarom -----------------------------------------------------------------
 * De catalogus laat losse modellen zien. Deze scène beantwoordt de vraag
 * daarnaast: passen de terreinstukken van het modulaire pakket ook echt op
 * elkaar, en hoe ziet een zone eruit die er helemaal uit opgebouwd is? Het is
 * de kleinst mogelijke proef daarvan — een grasveld, één verhoging en een pad
 * dat eroverheen loopt. Props horen er bewust niet bij: dit gaat over het
 * terrein zelf.
 *
 * -- het raster -------------------------------------------------------------
 * Elk terreinstuk staat op een cel van 0,5 × 0,5 unit, met zijn oorsprong in
 * het midden van die cel. Eén hoogtestap is 0,5 unit. Het gras ligt op y=0,1
 * en het pad op y=0,0: het pad is een ondiepe geul in het gras, en die 0,1
 * verschil zit in de kantstukken verwerkt.
 *
 * Cel (i, j) staat op wereldpunt (0,5·i, 0,5·j). De X-as loopt naar rechts,
 * de Z-as naar achteren. Aan het eind schuift alles zo op dat het veld op
 * x/z gecentreerd staat; y blijft zoals het is, dus y=0 is padhoogte.
 *
 * -- de stukken -------------------------------------------------------------
 * Vier soorten, met hun ongedraaide stand als ijkpunt:
 *
 *   grass-floor        vlak celtegel op grashoogte
 *   path-center/side   vlakke padtegel plus het kantje omhoog naar het gras;
 *                      het kantje beslaat de -x-helft van zijn eigen cel, dus
 *                      een pad is twee cellen breed: links het kantje, rechts
 *                      het gespiegelde kantje, en daartussen 0,5 unit vlak pad
 *   hill-side-sharp    talud dat over twee cellen 0,5 omhoog loopt naar +z
 *   hill-corner-outer  buitenhoek van datzelfde talud, een kwartrond met
 *                      straal 1,0; de hoge hoek ligt op (-0,25, +0,25) vanaf
 *                      de oorsprong van het stuk, het talud vult de twee bij
 *                      twee cellen daarnaast
 *
 * Draaien gebeurt om de celoorsprong, in stappen van 90°. Spiegelen (in x)
 * is nodig voor het rechterkantje van het pad: dat stuk bestaat niet los in
 * de kit, en 180° draaien zou ook de looprichting omkeren.
 *
 * -- de plattegrond ---------------------------------------------------------
 * Veld van 18 × 18 cellen (9 × 9 unit). Middenin een plateau van 8 × 8
 * cellen, één hoogtestap hoger, met rondom een talud van twee cellen breed.
 * Het pad loopt van voor naar achter dwars over het plateau heen: vlak,
 * omhoog over de trap, vlak over het plateau, en er aan de andere kant weer
 * af. Zo raakt elk soort stuk minstens één keer aan een ander soort, en is in
 * één oogopslag te zien of de naden kloppen.
 *
 *     rij 15-17   vlak gras, pad op y=0
 *     rij 13-14   talud omlaag, met de trap in het pad
 *     rij  5-12   plateau, pad op y=0,5
 *     rij  3- 4   talud omhoog, met de trap in het pad
 *     rij  0- 2   vlak gras, pad op y=0
 *
 * -- de uitvoer -------------------------------------------------------------
 * Alle stukken delen één materiaal en één textuur (Textures/colormap.png), en
 * elk stuk is één primitive zonder eigen node-hiërarchie. Daarom kan alles in
 * één mesh met één primitive: de scène kost één tekenopdracht in plaats van
 * ruim vierhonderd. De colormap gaat mee ín het GLB, zodat het bestand op
 * zichzelf staat.
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { leesGlb, leesAccessor, schrijfGlb, nodeMatrix } from './glb.mjs';

const KIT = 'kits/modulair-terrein';
const UIT = 'scenes/heuvel.glb';

const CEL = 0.5; // celmaat en hoogtestap in units
const VELD = 18; // cellen in de breedte en in de diepte

/* Het plateau in celcoördinaten, en het pad in kolommen. Beide staan midden
 * op het veld: 5..12 en 8..9 hebben allebei 8,5 als middelpunt, net als het
 * veld zelf (0..17). */
const PLATEAU = { van: 5, tot: 12 };
const PAD = { west: 8, oost: 9 };

/* De grens van het plateau ligt op de celrand, niet op het celmiddelpunt.
 * Een talud van twee cellen breed hangt eronder: rij 3-4 en 13-14. */
const ZUID = PLATEAU.van - 2; // eerste taludrij aan de voorkant
const NOORD = PLATEAU.tot + 2; // laatste taludrij aan de achterkant

/* -- plaatsen -------------------------------------------------------------- */

const stukken = [];

/**
 * Zet één terreinstuk neer.
 *
 * @param naam    bestandsnaam in de kit, zonder .glb
 * @param i, j    cel; het stuk komt met zijn oorsprong op het celmiddelpunt
 * @param opties  draai in graden (0/90/180/270), spiegel in x, hoogte in units
 */
function zet(naam, i, j, { draai = 0, spiegel = false, hoogte = 0 } = {}) {
  stukken.push({ naam, i, j, draai, spiegel, hoogte });
}

/** Een vlak stuk pad: de padtegel plus aan weerszijden het kantje omhoog. */
function padTegel(j, hoogte) {
  for (const i of [PAD.west, PAD.oost]) {
    zet('hilly-terrain-path-center', i, j, { hoogte });
    zet('hilly-terrain-path-side', i, j, { hoogte, spiegel: i === PAD.oost });
  }
}

const plateau = (i, j) =>
  i >= PLATEAU.van && i <= PLATEAU.tot && j >= PLATEAU.van && j <= PLATEAU.tot;
const opPad = (i) => i === PAD.west || i === PAD.oost;

/* Gras op maaiveld. Niet onder het plateau (daar ligt gras een stap hoger) en
 * niet in de padkolommen: die liggen van voor tot achter lager, en een grasvlak
 * op 0,1 zou dwars door het pad en de trap heen steken. Wél onder de taluds:
 * die staan met hun voet precies op grashoogte, en de ronde buitenhoeken laten
 * anders een gat in de hoek. */
for (let i = 0; i < VELD; i++) {
  for (let j = 0; j < VELD; j++) {
    if (plateau(i, j) || opPad(i)) continue;
    zet('hilly-terrain-grass-floor', i, j);
  }
}

/* Gras op het plateau, behalve waar het pad ligt. */
for (let i = PLATEAU.van; i <= PLATEAU.tot; i++) {
  for (let j = PLATEAU.van; j <= PLATEAU.tot; j++) {
    if (opPad(i)) continue;
    zet('hilly-terrain-grass-floor', i, j, { hoogte: CEL });
  }
}

/* De vier taluds. Het stuk loopt ongedraaid omhoog naar +z over de cellen j
 * en j+1, dus het hangt met zijn hoge kant aan de plateaurand. */
for (let i = PLATEAU.van; i <= PLATEAU.tot; i++) {
  if (opPad(i)) continue;
  zet('hilly-terrain-hill-side-sharp', i, ZUID);
  zet('hilly-terrain-hill-side-sharp', i, NOORD, { draai: 180 });
}
for (let j = PLATEAU.van; j <= PLATEAU.tot; j++) {
  zet('hilly-terrain-hill-side-sharp', ZUID, j, { draai: 90 });
  zet('hilly-terrain-hill-side-sharp', NOORD, j, { draai: 270 });
}

/* De vier buitenhoeken. De ongedraaide hoek heeft zijn plateau links-achter
 * (-x, +z); elke draai van 90° verzet dat een kwartslag. De oorsprong ligt
 * één cel diagonaal buiten de plateauhoek. */
zet('hilly-terrain-hill-corner-outer-2x2', ZUID + 1, ZUID + 1, { draai: 90 });
zet('hilly-terrain-hill-corner-outer-2x2', NOORD - 1, ZUID + 1, { draai: 0 });
zet('hilly-terrain-hill-corner-outer-2x2', NOORD - 1, NOORD - 1, { draai: 270 });
zet('hilly-terrain-hill-corner-outer-2x2', ZUID + 1, NOORD - 1, { draai: 180 });

/* Het pad: vlak voor en achter het plateau, vlak eroverheen, en de twee
 * trappen ertussen. Het trapstuk bevat zowel de treden als het grastalud
 * ernaast, dus het vervangt daar zowel de padtegel als het gewone talud. */
for (let j = 0; j < ZUID; j++) padTegel(j, 0);
for (let j = PLATEAU.van; j <= PLATEAU.tot; j++) padTegel(j, CEL);
for (let j = NOORD + 1; j < VELD; j++) padTegel(j, 0);

zet('hilly-terrain-path-hill-sharp-steps-side', PAD.west, ZUID);
zet('hilly-terrain-path-hill-sharp-steps-side', PAD.oost, ZUID, { spiegel: true });
zet('hilly-terrain-path-hill-sharp-steps-side', PAD.west, NOORD, { draai: 180, spiegel: true });
zet('hilly-terrain-path-hill-sharp-steps-side', PAD.oost, NOORD, { draai: 180 });

/* De rand van het veld. Zonder rand is het veld een vel papier: van opzij
 * gezien heeft het gras geen dikte. De steilrandstukken staan een hoogtestap
 * lager, zodat hun bovenrand precies op grashoogte uitkomt; de wand zelf zit
 * in de buitenste 0,2 van de cel, dus het grasvlak eroverheen blijft heel.
 * Ongedraaid staat de wand aan de -x-kant.
 *
 * De losse buitenhoek van de kit is een kwartdraai van datzelfde profiel en
 * beslaat alleen dat hoekje; de rechte stukken moeten er dan tot op de
 * millimeter tegenaan eindigen. Hier lopen de vier wanden gewoon door tot en
 * met de hoekcel en kruisen ze elkaar daar. Van buitenaf geeft dat een haakse
 * hoek in plaats van een afgeronde, en er kan geen naad opengaan. */
const LAATSTE = VELD - 1;
for (let k = 0; k < VELD; k++) {
  zet('escarpment-terrain-side-top', 0, k, { hoogte: -CEL });
  zet('escarpment-terrain-side-top', LAATSTE, k, { draai: 180, hoogte: -CEL });
  zet('escarpment-terrain-side-top', k, 0, { draai: 270, hoogte: -CEL });
  zet('escarpment-terrain-side-top', k, LAATSTE, { draai: 90, hoogte: -CEL });
}

/* -- samenvoegen ----------------------------------------------------------- */

/** Leest een stuk uit de kit uit als kale vertexdata, met de node-transform
 * er al in verrekend. Elk stuk is één node met één mesh met één primitive;
 * iets anders komt in dit pakket niet voor en zou hier stil fout gaan. */
const tegelCache = new Map();
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

const posities = [];
const normalen = [];
const uvs = [];
const indices = [];

/* Punten die op alle drie de eigenschappen gelijk zijn, worden er één. Dat
 * scheelt vooral in het vlakke gras: buurtegels delen daar hun hoekpunten,
 * inclusief normaal en textuurcoördinaat. Afronden op vier decimalen omdat
 * het draaien en verschuiven anders 4.999999999 tegenover 5 zet. */
const punten = new Map();
function punt(p, n, uv) {
  const sleutel = [...p, ...n, ...uv].map((v) => Math.round(v * 1e4)).join(',');
  const bestaand = punten.get(sleutel);
  if (bestaand !== undefined) return bestaand;

  const index = posities.length / 3;
  posities.push(...p);
  normalen.push(...n);
  uvs.push(...uv);
  punten.set(sleutel, index);
  return index;
}

const midden = ((VELD - 1) * CEL) / 2;

for (const stuk of stukken) {
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
      [px + stuk.i * CEL - midden, py + stuk.hoogte, pz + stuk.j * CEL - midden],
      [nx, ny, nz],
      [t.uv[v * 2], t.uv[v * 2 + 1]],
    );
  }

  /* Spiegelen keert de winding om; zonder de driehoeken terug te draaien
   * wijzen de voorkanten van die stukken naar binnen. */
  for (let k = 0; k < t.index.length; k += 3) {
    const [a, b, c] = [eigen[t.index[k]], eigen[t.index[k + 1]], eigen[t.index[k + 2]]];
    if (stuk.spiegel) indices.push(a, c, b);
    else indices.push(a, b, c);
  }
}

/* -- wegschrijven ---------------------------------------------------------- */

const vulling = (n) => (4 - (n % 4)) % 4;

const aantalPunten = posities.length / 3;
/* Onder de 65536 punten passen de indices in twee bytes; dat scheelt hier een
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

const json = {
  asset: { version: '2.0', generator: 'tools/bouw-scene-heuvel.mjs' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: 'heuvel', mesh: 0 }],
  meshes: [{
    name: 'heuvel',
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

mkdirSync('scenes', { recursive: true });
schrijfGlb(UIT, json, bin, writeFileSync);

const driehoeken = indices.length / 3;
console.log(`${stukken.length} stukken, ${driehoeken} driehoeken, ${aantalPunten} punten → ${UIT}`);
console.log(`maat: ${rond(max[0] - min[0])} × ${rond(max[2] - min[2])} × ${rond(max[1] - min[1])} unit`);
