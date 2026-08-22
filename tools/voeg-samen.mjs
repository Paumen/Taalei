/**
 * Voegt kitmodellen samen die samen één voorwerp zijn.
 *
 * Draai vanuit de repo-root:  node tools/voeg-samen.mjs
 *
 * Twee packs leveren een voorwerp als losse objecten aan, en de importeurs
 * hebben die één-op-één overgenomen — elk object werd een eigen model met een
 * eigen letter. Dat levert catalogusregels op die los niets zijn:
 *
 *   - props `bucket-a` is de emmer, `bucket-b` het beugelhengsel dat erin
 *     hangt. Het hengsel alleen is een boog van twee kleuren.
 *   - tropical `chest-a` is de houten kist met beslag en handvatten,
 *     `chest-b` het gewelfde deksel met de onderrand en het slotplaatje.
 *     Los ziet `chest-a` eruit als een open bak en `chest-b` als een halve
 *     kist; over elkaar heen vormen ze één dichte kist.
 *
 * Dit script schrijft de onderdelen als één model naar het eerste van de twee
 * namen en gooit de rest weg. Het draait ná de importeur van de pack: die
 * levert de onderdelen nog steeds los af, dus na een herimport hoort dit
 * script er opnieuw overheen. Zijn de onderdelen er niet meer, dan doet het
 * niets — het is dus veilig om nog eens te draaien.
 *
 * Waarom er verplaatst moet worden. Geen van beide packs levert de onderdelen
 * in elkaar gezet aan: het deksel staat in de pack een halve kistdiepte achter
 * de kist, en het hengsel staat om het voetstuk van de emmer in plaats van aan
 * de rand. En zelfs als ze wél goed stonden, was dat hier niet meer te zien:
 * zetOpOorsprong() zet elk model apart op y=0 en centreert het op x/z, dus
 * elk onderdeel is bij het inladen naar zijn eigen oorsprong getrokken. Dit
 * script zet de onderdelen daarom expliciet op hun plek; hoe die plek gemeten
 * is, staat bij SAMEN hieronder.
 *
 * Wat er gebeurt:
 *
 *   1. De verplaatsing die zetOpOorsprong() in de wortel-node zette gaat eruit,
 *      zodat de hoekpunten weer in packruimte staan. De rest van de
 *      wereldmatrix blijft, alleen de packfactor gaat eruit — die zit in de
 *      wortel-node en niet in de hoekpunten (zie de importeurs).
 *   2. Elk onderdeel schuift over `zet` naar zijn plek in het geheel.
 *   3. De onderdelen worden één primitive, geen twee. Ze delen hetzelfde
 *      colormap-materiaal, dus dat scheelt een tekenopdracht: het samengevoegde
 *      model houdt `calls` op 1, net als elk ander model in deze kits.
 *   4. De oorsprong komt weer op y=0 met het grondvlak gecentreerd
 *      (stijlgids §5), nu gemeten over de onderdelen samen.
 *
 * De geometrie zelf blijft ongemoeid: er wordt niets vervormd, gedraaid of
 * ontdubbeld, en de UV's blijven staan waar de importeur ze op de gedeelde
 * colormap heeft gelegd.
 */

import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  leesGlb, schrijfGlb, leesAccessor, meetScene, zetOpOorsprong,
  nodeMatrix, maalMatrix, EENHEIDSMATRIX,
} from './glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Wat er samengaat, en waarheen. Het eerste onderdeel geeft de naam: dat is in
 * beide gevallen het hoofdstuk van het voorwerp (de emmer, de kist), en de kits
 * dragen sowieso een letterachtervoegsel — `bucket-a` en `chest-a` staan er dus
 * niet vreemder bij dan `barrel-a` of `plank-a`.
 *
 * `zet` is de verplaatsing in packruimte, dus vóór de packfactor: in het
 * raster van de catalogus is elke waarde 0,6 keer zo groot. De getallen zijn
 * niet met de hand geschoven maar uit de vlakken van de onderdelen zelf
 * gemeten, zodat ze op de duizendste aansluiten:
 *
 *   - Kist. De bovenrand van de bak is het vlak y = 0,333 over x ±0,403 en
 *     z ±0,264; de onderrand van het deksel is y = -0,002 over x ±0,403 en
 *     z -0,003…0,526. Even breed en even diep, dus het deksel past er precies
 *     op: 0,335 omhoog en 0,261 naar achteren. Daarmee komen ook het
 *     slotplaatje onder het deksel (x ±0,030) en de sluiting op de voorkant
 *     van de bak (x ±0,032) tegenover elkaar te staan, en steken de
 *     scharnierklossen achter de kist uit.
 *   - Emmer. Het hengsel is een beugel met verdikte uiteinden op y
 *     -0,013…0,071 (midden 0,029) en een binnenkant op |x| = 0,155. De kuip is
 *     op y = 0,268 het wijdst, met straal 0,161 — daar hoort het draaipunt,
 *     dus 0,239 omhoog. De beugel staat dan tegen de wand net onder de rand
 *     (0,318) en boogt erboven uit, zoals de emmer van de survival-kit.
 */
const SAMEN = [
  {
    kit: 'props',
    onderdelen: [
      { model: 'bucket-a', zet: [0, 0, 0] },
      { model: 'bucket-b', zet: [0, 0.239, 0] },
    ],
  },
  {
    kit: 'tropical',
    onderdelen: [
      { model: 'chest-a', zet: [0, 0, 0] },
      { model: 'chest-b', zet: [0, 0.335, -0.261] },
    ],
  },
];

/**
 * De attributen die deze kits dragen — dezelfde drie die compacteer() en de
 * importeurs schrijven; tangenten gaan er bij het inladen bewust uit (zie
 * `tangenten: 'gestript'` in de extras).
 *
 * Een onderdeel dat er één mist of er één te veel heeft is een hard geval:
 * stilzwijgend een COLOR_0 of TANGENT laten vallen zou een model opleveren dat
 * er anders uitziet dan zijn onderdelen, zonder dat iets dat meldt.
 */
const ATTRIBUTEN = ['POSITION', 'NORMAL', 'TEXCOORD_0'];

/* -- inlezen --------------------------------------------------------------
 * Per onderdeel de primitives ophalen mét de matrix waarmee de scène ze tekent.
 * De importeurs schrijven één mesh onder één wortel-node, maar de wandeling
 * hieronder is dezelfde als die van meetScene() en compacteer(), zodat een
 * onderdeel met meer nodes hier niet stilletjes scheef terechtkomt.
 *
 * De verplaatsing van de wortel-nodes gaat er eerst uit. Die komt van
 * zetOpOorsprong() en is per onderdeel apart uitgerekend — hem meenemen zou de
 * onderdelen elk naar hun eigen midden trekken, en dan staat het hengsel om de
 * voet van de emmer in plaats van waar SAMEN het wil hebben. De schaal blijft
 * wél staan; die gaat er in voegSamen() als packfactor uit.
 */
function leesOnderdelen(glb) {
  const { json } = glb;
  for (const index of json.scenes?.[json.scene ?? 0]?.nodes ?? []) {
    const node = json.nodes[index];
    if (node.matrix) throw new Error('wortel-node met matrix: verplaatsing niet te scheiden');
    node.translation = [0, 0, 0];
  }

  const wereld = new Array((json.nodes ?? []).length).fill(null);
  const zetWereld = (index, ouder) => {
    if (wereld[index]) return;
    const node = json.nodes[index];
    if (!node) return;
    wereld[index] = maalMatrix(ouder, nodeMatrix(node));
    for (const kind of node.children ?? []) zetWereld(kind, wereld[index]);
  };
  for (const index of json.scenes?.[json.scene ?? 0]?.nodes ?? []) zetWereld(index, EENHEIDSMATRIX);

  const stukken = [];
  (json.nodes ?? []).forEach((node, index) => {
    if (node.mesh === undefined || !wereld[index]) return;
    if (node.skin !== undefined) throw new Error('een geskind model samenvoegen kan niet');
    for (const prim of json.meshes[node.mesh].primitives ?? []) {
      if ((prim.mode ?? 4) !== 4) throw new Error('alleen driehoeken kunnen samen');
      if (prim.indices === undefined) throw new Error('een primitive zonder indices kan niet samen');
      stukken.push({ prim, matrix: wereld[index] });
    }
  });
  return stukken;
}

/** Punt door een kolom-major matrix. */
const maalPunt = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

/**
 * Richting door het lineaire deel van de matrix, daarna weer op lengte 1.
 * Deze kits schalen uniform, dus dit is voor de normalen genoeg: bij een
 * ongelijke schaal zou de inverse-getransponeerde nodig zijn.
 */
function maalRichting(m, x, y, z) {
  const [a, b, c] = [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z,
  ];
  const lengte = Math.hypot(a, b, c) || 1;
  return [a / lengte, b / lengte, c / lengte];
}

/* -- samenvoegen ---------------------------------------------------------- */

function voegSamen(kit, onderdelen) {
  const paden = onderdelen.map(({ model }) => join(ROOT, 'kits', kit, `${model}.glb`));
  const glbs = paden.map((pad) => leesGlb(pad));
  const naam = onderdelen[0].model;

  /* De packfactor zit in de wortel-node van elk onderdeel. Verschilt hij tussen
   * de onderdelen, dan staan ze niet in dezelfde ruimte en zegt samenvoegen
   * niets meer. */
  const schalen = glbs.map((glb) => glb.json.asset?.extras?.taaleiland?.schaal ?? 1);
  if (new Set(schalen).size !== 1) {
    throw new Error(`${kit}: onderdelen met verschillende schaal (${schalen.join(', ')})`);
  }
  const schaal = schalen[0];

  const posities = [];
  const normalen = [];
  const uvs = [];
  const indices = [];

  for (const [deel, glb] of glbs.entries()) {
    const [zx, zy, zz] = onderdelen[deel].zet;
    for (const { prim, matrix } of leesOnderdelen(glb)) {
      const ontbreekt = ATTRIBUTEN.filter((a) => prim.attributes[a] === undefined);
      if (ontbreekt.length) throw new Error(`${kit}/${naam}: mist ${ontbreekt.join(', ')}`);
      const teveel = Object.keys(prim.attributes).filter((a) => !ATTRIBUTEN.includes(a));
      if (teveel.length) throw new Error(`${kit}/${naam}: onbekend attribuut ${teveel.join(', ')}`);

      const positie = leesAccessor(glb, prim.attributes.POSITION);
      const normaal = leesAccessor(glb, prim.attributes.NORMAL);
      const uv = leesAccessor(glb, prim.attributes.TEXCOORD_0);
      const index = leesAccessor(glb, prim.indices);

      const begin = posities.length / 3;
      for (let v = 0; v < positie.count; v++) {
        const p = maalPunt(matrix, positie.data[v * 3], positie.data[v * 3 + 1], positie.data[v * 3 + 2]);
        // Terug naar packruimte (de factor komt straks weer in de wortel-node),
        // en daar het onderdeel op zijn plek in het geheel.
        posities.push(p[0] / schaal + zx, p[1] / schaal + zy, p[2] / schaal + zz);
        normalen.push(...maalRichting(matrix, normaal.data[v * 3], normaal.data[v * 3 + 1], normaal.data[v * 3 + 2]));
        uvs.push(uv.data[v * 2], uv.data[v * 2 + 1]);
      }
      for (let i = 0; i < index.count; i++) indices.push(begin + index.data[i]);
    }
  }

  const hoekpunten = posities.length / 3;
  // Uint16 is wat de importeurs schrijven; boven deze grens zou het Uint32
  // moeten worden, en dan klopt de aanname hieronder niet meer.
  if (hoekpunten > 65535) throw new Error(`${kit}/${naam}: te veel hoekpunten voor Uint16-indices`);

  const min = [0, 1, 2].map((as) => Math.min(...posities.filter((_, i) => i % 3 === as)));
  const max = [0, 1, 2].map((as) => Math.max(...posities.filter((_, i) => i % 3 === as)));

  /* Buffer: elk attribuut zijn eigen bufferView zonder byteStride, in dezelfde
   * volgorde als compacteer() ze schrijft. */
  const delen = [
    { data: new Float32Array(posities), componentType: 5126, type: 'VEC3', count: hoekpunten, target: 34962, min, max },
    { data: new Float32Array(normalen), componentType: 5126, type: 'VEC3', count: hoekpunten, target: 34962 },
    { data: new Float32Array(uvs), componentType: 5126, type: 'VEC2', count: hoekpunten, target: 34962 },
    { data: new Uint16Array(indices), componentType: 5123, type: 'SCALAR', count: indices.length, target: 34963 },
  ];

  const stukken = [];
  const bufferViews = [];
  const accessors = [];
  let lengte = 0;
  for (const deel of delen) {
    while (lengte % 4 !== 0) { stukken.push(Buffer.alloc(1)); lengte++; }
    const buf = Buffer.from(deel.data.buffer, deel.data.byteOffset, deel.data.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length, target: deel.target });
    stukken.push(buf);
    lengte += buf.length;
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: deel.componentType,
      count: deel.count,
      type: deel.type,
      ...(deel.min ? { min: deel.min, max: deel.max } : {}),
    });
  }

  const bron = glbs[0].json;
  const json = {
    asset: {
      generator: 'tools/voeg-samen.mjs',
      version: '2.0',
      extras: {
        taaleiland: {
          ...bron.asset.extras.taaleiland,
          // Waar dit model vandaan komt: de onderdelen zoals de importeur ze
          // afleverde, onder de namen die ze in de kit hadden.
          samengevoegd: onderdelen.map(({ model }) => model),
        },
      },
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
    accessors,
    bufferViews,
    buffers: [{ byteLength: lengte }],
    materials: bron.materials,
    textures: bron.textures,
    images: bron.images,
    samplers: bron.samplers,
  };

  const glb = { json, bin: Buffer.concat(stukken) };
  zetOpOorsprong(glb, naam, schaal);

  schrijfGlb(paden[0], glb.json, glb.bin, writeFileSync);
  for (const pad of paden.slice(1)) rmSync(pad);

  return { maat: meetScene(glb), hoekpunten, weg: onderdelen.slice(1).map(({ model }) => model) };
}

/* -- draaien -------------------------------------------------------------- */

let gedaan = 0;
for (const { kit, onderdelen } of SAMEN) {
  const namen = onderdelen.map(({ model }) => model);
  const paden = namen.map((model) => join(ROOT, 'kits', kit, `${model}.glb`));
  if (!paden.every(existsSync)) {
    console.log(`- ${kit}/${namen[0]}: onderdelen niet compleet, overgeslagen`);
    continue;
  }
  const { maat, hoekpunten, weg } = voegSamen(kit, onderdelen);
  gedaan++;
  console.log(
    `${kit}/${namen[0]} ← ${namen.join(' + ')}: `
    + `${hoekpunten} hoekpunten, ${maat.driehoeken} driehoeken, ${maat.calls} tekenopdracht, `
    + `${maat.wdh.join(' × ')} — ${weg.map((n) => `${n}.glb`).join(', ')} verwijderd`,
  );
}

if (gedaan > 0) console.log('\nvergeet kits/manifest.js en tools/build-catalog.mjs niet');
