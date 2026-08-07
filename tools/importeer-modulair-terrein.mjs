/**
 * Zet de Modular Terrain Collection om naar kits/modulair-terrein.
 *
 * Draai vanuit de repo-root:
 *
 *     node tools/importeer-modulair-terrein.mjs <map-met-obj>
 *
 * De bronbestanden staan niet in de repo — alleen het resultaat. Dit script
 * legt vast wát er met die bestanden is gebeurd, zodat een volgende import
 * dezelfde kit oplevert.
 *
 * Anders dan de andere packs komt deze als Wavefront OBJ binnen: 305 .obj's en
 * één gedeelde .mtl. Er is dus geen FBX2glTF-stap; tools/obj.mjs leest de
 * bestanden rechtstreeks en dit script schrijft er .glb van.
 *
 * Wat dit script doet:
 *   1. voegt zes kleuren toe aan de gedeelde kits/colormap.png (zie CELLEN);
 *   2. zet elk materiaal van de pack op een punt in die atlas (zie de kop bij
 *      `plaatsMaterialen`);
 *   3. schrijft per model één .glb met één tekenopdracht;
 *   4. schaalt met één factor en laat de oorsprong met rust — zie SCHAAL en
 *      OORSPRONG hieronder.
 *
 * Wat dit script níét doet: het raakt de geometrie niet aan. Er komt geen
 * hoekpunt bij of af, en er beweegt er geen één.
 */

import { readdirSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schrijfGlb, leesGlb, meetScene } from './glb.mjs';
import { leesPng, schrijfPng } from './png.mjs';
import {
  doelPunten, gevuldeCellen, voegGradientCelToe, kopieerColormap, kleurAfstand, naarHex,
} from './kleurmap.mjs';
import { leesObj, leesMtl } from './obj.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS = join(ROOT, 'kits');
const DOEL = join(KITS, 'modulair-terrein');
const COLORMAP = join(KITS, 'colormap.png');

/** De .mtl die naast de 305 .obj's in de pack zit. */
const MTL = 'Materials_Modular_Terrain.mtl';

/**
 * De pack gaat op 0,5 het raster van de repo op.
 *
 * Een eerste import nam 1 aan omdat de terreintegels exact op het raster
 * gemeten waren (`Hilly_Terrain_Grass_Floor` 1×1, varianten in 1×1 tot 4×4,
 * heuvels in stappen van één unit). Maar dat de maten op het raster liggen
 * zegt niet dat de factor klopt: naast de rest van de collectie was alles
 * het dubbele (zie docs/asset_size_review.md) — palmen van 3,3-4,1 tegenover
 * 1,7-2,1 elders, schatkist 0,73 tegenover 0,45-0,51, kampvuur 1,43 breed
 * tegenover ~0,55. Op 0,5 vallen die op hun plek en worden de tegels
 * 0,5 × 0,5 — nog steeds rastervast (vier halve tegels per vak, zoals de
 * kleine vloertegels van de dungeon-kit), met heuvelstappen van een halve
 * unit.
 */
const SCHAAL = 0.5;

/**
 * Ook de oorsprong blijft staan, en dat is een bewuste afwijking van de
 * hoofdregel in stijlgids §5 ("pivot op het midden van het grondvlak, voet op
 * y = 0"). De reden die §5 daarvoor vraagt is hier de kern van de pack:
 *
 *   - De oorsprong ís het rastervak. Van de 160 terreinstukken hebben er 124
 *     een grondvlak dat exact op halve units ligt; bij de 36 andere ligt de
 *     bounding box wél scheef maar begint hij nog steeds op x = -0,5 en
 *     z = -0,5 (of -1,5 bij een 3×3). Dat zijn de stukken waarvan de geometrie
 *     niet het hele vak vult: een kliffront dat naar achteren helt, een
 *     waterval die overhangt. Hun vák staat op het raster; hun vórm niet. Wie
 *     zo'n stuk op zijn bounding box centreert, schuift het van het raster af
 *     en de hoeken sluiten niet meer aan.
 *
 *   - De hoogte ís informatie. `Beach_Prop_Docks_Straight` staat op
 *     y[0,75 … 1,00]: dat is het dek van een steiger, dat op palen van één unit
 *     hoort te liggen. `Cave_Prop_Hanging_Cables_*` hangen van het plafond naar
 *     beneden. Die op y = 0 zetten legt het dek op de grond en de kabels in het
 *     zand. Honderd van de 305 modellen hebben zo'n bewuste hoogte.
 *
 * Een model uit deze kit zet je dus op hele rastercoördinaten neer, niet op een
 * gecentreerde pivot — net als de bouwpakketten van fantasy-town, village en
 * dungeon, met het verschil dat die de pivot wél in het midden hebben.
 */
const OORSPRONG = 'ongewijzigd';

/**
 * De zes kleuren die niet uit kits/colormap.png te halen waren.
 *
 * De pack levert 36 vlakke materiaalkleuren. Achtentwintig daarvan liggen
 * binnen afstand 60 van een kleur die al in de gedeelde atlas staat — vaak veel
 * dichterbij: `Wood_Light` valt er precies op (afstand 0), `Wood_Dark` en
 * `Coconut` op 5, `Cattail` op 5, `Mushroom_White` op 4. Die zijn hergebruikt,
 * zoals stijlgids §1 wil.
 *
 * De acht materialen hieronder haalden dat niet. Ze staan in zes cellen omdat
 * vier van de acht paarsgewijs een kleurbaan vormen — precies waar het
 * cel-met-verloop van deze atlas voor bedoeld is. Boven staat steeds de lichtste
 * van het paar, onder de donkerste, zoals bij alle bestaande banen. Beide
 * kleuren van een paar liggen daardoor exact op de baan (afstand 0), en niet
 * "ergens in de buurt".
 *
 * Waarom deze acht het niet redden:
 *   - Grass (#228b22) kwam op #507220 uit, afstand 85: het olijfgroen dat de
 *     tropical-pack heeft toegevoegd. Dat is een tint ernaast, en het is de
 *     kleur van 130 van de 305 modellen — het gras van de hele kit zou
 *     vergelen. Van alle toevoegingen hier is dit de belangrijkste.
 *   - Pine_Leaves (#206734) en Cedar_Leaves (#254525) zijn donkere naaldgroenen.
 *     Pine kwam op datzelfde olijf uit (80), Cedar op het bijna-zwart van
 *     [10,0] (51) — dennennaalden die grijs uitslaan.
 *   - Sunflower (#fbf02d) is een zuiver geel; het palet heeft alleen
 *     geeloranje (96). Pollen (#fde675) haalde de grens net (40) maar hoort bij
 *     dezelfde bloem en gaat mee in de baan.
 *   - Lily (#f39ac2) en Tulip (#e05c7a) zijn roze; het palet heeft geen roze,
 *     alleen zalm (92 en 85).
 *   - Rose (#930909) is een diep bloedrood. Het dichtstbijzijnde was
 *     #6d2e1e (101), een roodbruin.
 *   - Lily_Blue (#0070df) is een fel blauw naast het gedempte #2582c0 (83).
 *
 * De vier cellen met één materiaal krijgen een vlakke baan (boven = onder).
 * Dat is wat de pack laat zien: één kleur, geen verloop.
 *
 * De plekken zijn gekozen bij de buren waar ze horen: de groenen in rij 1 naast
 * de bestaande groenen, de bloemkleuren in rij 0 tussen het warme werk, het
 * blauw in rij 2 naast het water- en lavendelblauw.
 */
const CELLEN = [
  { cel: [2, 0], naam: 'zonnegeel', boven: [253, 230, 117], onder: [251, 240, 45] },
  { cel: [3, 0], naam: 'bloemroze', boven: [243, 154, 194], onder: [224, 92, 122] },
  { cel: [9, 0], naam: 'dieprood', boven: [147, 9, 9], onder: [147, 9, 9] },
  { cel: [1, 1], naam: 'naaldgroen', boven: [32, 103, 52], onder: [37, 69, 37] },
  { cel: [4, 1], naam: 'grasgroen', boven: [34, 139, 34], onder: [34, 139, 34] },
  { cel: [2, 2], naam: 'felblauw', boven: [0, 112, 223], onder: [0, 112, 223] },
];

/**
 * Waarboven een materiaal een eigen cel verdient in plaats van de
 * dichtstbijzijnde bestaande kleur.
 *
 * 60 ligt ruim onder de 120 waarmee build-catalog.mjs twee stalen als
 * "hetzelfde" durft te behandelen, en dat is met opzet: die 120 gaat over twee
 * kleuren die al in dezelfde atlas staan, hier gaat het om een kleur die anders
 * wordt vervangen. In de praktijk valt de grens in een gat — het materiaal
 * dat er net onder zit (`Burlap`) zit op 53, het materiaal dat er net boven
 * zit (`Pine_Leaves`) op 80 — dus geen enkel materiaal hangt aan de grens.
 */
const NIEUWE_CEL_VANAF = 60;

/**
 * Bestandsnaam van de pack → naam in de kit.
 *
 * Anders dan bij de kleinere packs staat hier geen uitgeschreven tabel: bij 305
 * modellen zegt een regel meer dan een lijst, en de namen van deze pack zijn
 * consequent genoeg om er één te kunnen geven. De regel is:
 *
 *   - underscores worden streepjes en alles wordt kleine letters, zoals overal
 *     in kits/ (`Hilly_Terrain_Grass_Floor` → `hilly-terrain-grass-floor`);
 *   - een doorgenummerd achtervoegsel wordt een letter, zoals bij de andere
 *     packs (`Hilly_Prop_Branch_2` → `hilly-prop-branch-b`);
 *   - staat een model alléén in zijn nummering, dan vervalt het cijfer
 *     (`Cave_Prop_Minecart_1` → `cave-prop-minecart`); een letter suggereert
 *     varianten die er niet zijn.
 *
 * Maatvoeringen als `1x1` en `4x4` blijven staan: dat zijn geen volgnummers
 * maar het aantal rastervakken dat het stuk beslaat, en juist dat wil je in de
 * naam zien.
 *
 * De voorvoegsels `beach-`, `cave-`, `cliff-`, `escarpment-`, `hilly-`,
 * `mountain-` en `shared-` blijven ook staan, net als `terrain-` en `prop-`.
 * Ze zijn lang, maar ze zeggen precies wat je moet weten voordat je twee
 * stukken combineert: een kliffhoek en een steilrandhoek zien er hetzelfde uit
 * en passen niet op elkaar.
 */
function naarNaam(bron, families) {
  const delen = bron.split('_');
  const laatste = delen[delen.length - 1];

  if (/^\d+$/.test(laatste)) {
    const familie = delen.slice(0, -1).join('_');
    if (families.get(familie) === 1) delen.pop();
    else delen[delen.length - 1] = String.fromCharCode(96 + Number(laatste));
  }

  return delen.join('-').toLowerCase();
}

/** Hoeveel modellen elke doorgenummerde familie telt. */
function telFamilies(bronnen) {
  const families = new Map();
  for (const bron of bronnen) {
    const m = bron.match(/^(.*)_(\d+)$/);
    if (m) families.set(m[1], (families.get(m[1]) ?? 0) + 1);
  }
  return families;
}

/**
 * Elk materiaal van de pack op zijn punt in de gedeelde atlas.
 *
 * Anders dan bij nature en tropical hoeft dat hier niet per hoekpunt: die packs
 * kwamen met een eigen atlas, waar de kleur van een hoekpunt pas uit de UV
 * blijkt. Deze pack heeft geen atlas maar vlakke materiaalkleuren, dus de kleur
 * staat er met zoveel woorden. Eén opzoeking per materiaal volstaat, en alle
 * hoekpunten van dat materiaal krijgen dezelfde UV.
 *
 * Dat heeft een prettig neveneffect: elke driehoek ligt daarmee per definitie
 * binnen één cel. De correctierondes die kleurmap.mjs voor de andere packs
 * nodig heeft — hoekpunten terughalen naar de cel van hun driehoek, zodat een
 * vlak niet dwars over de atlas veegt — zijn hier niet aan de orde.
 */
function plaatsMaterialen(materialen, punten) {
  const plaatsing = new Map();

  for (const [naam, { kd }] of materialen) {
    let beste = punten[0];
    let afstand = Infinity;
    for (const punt of punten) {
      const d = kleurAfstand(kd, punt.kleur);
      if (d < afstand) {
        afstand = d;
        beste = punt;
      }
    }
    plaatsing.set(naam, { kd, u: beste.u, v: beste.v, cel: beste.cel, doel: beste.kleur, afstand });
  }

  return plaatsing;
}

/**
 * Bouwt één .glb uit een ingelezen .obj.
 *
 * Alle materialen wijzen naar dezelfde gedeelde colormap en verschillen alleen
 * in UV, dus het hele model gaat als één primitive naar buiten: één materiaal,
 * één tekenopdracht. Meer opdrachten zijn er volgens stijlgids §5 alleen voor
 * onderdelen die apart moeten kunnen bewegen, en die zitten hier niet in.
 */
function bouwGlb(obj, plaatsing, naam) {
  const aantal = obj.posities.length / 3;

  const posities = Buffer.alloc(aantal * 12);
  const normalen = Buffer.alloc(aantal * 12);
  const uvs = Buffer.alloc(aantal * 8);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < aantal; i++) {
    for (let k = 0; k < 3; k++) {
      const p = obj.posities[i * 3 + k];
      posities.writeFloatLE(p, i * 12 + k * 4);
      normalen.writeFloatLE(obj.normalen[i * 3 + k], i * 12 + k * 4);
      if (p < min[k]) min[k] = p;
      if (p > max[k]) max[k] = p;
    }
  }

  // De UV volgt uit het materiaal van de groep waar het hoekpunt in zit;
  // leesObj() heeft de hoekpunten al per materiaal ontdubbeld, dus dit kan
  // nooit twee kleuren op hetzelfde hoekpunt zetten.
  const indices = [];
  for (const groep of obj.groepen) {
    const punt = plaatsing.get(groep.materiaal);
    if (!punt) throw new Error(`${naam}: materiaal '${groep.materiaal}' staat niet in de .mtl`);
    for (const index of groep.indices) {
      uvs.writeFloatLE(punt.u, index * 8);
      uvs.writeFloatLE(punt.v, index * 8 + 4);
      indices.push(index);
    }
  }

  const kort = aantal <= 65536;
  const indexBuf = Buffer.alloc(indices.length * (kort ? 2 : 4));
  indices.forEach((v, i) => (kort ? indexBuf.writeUInt16LE(v, i * 2) : indexBuf.writeUInt32LE(v, i * 4)));

  // Elke bufferView begint op een veelvoud van vier, zoals de glTF-spec voor
  // float- en uint32-accessors eist.
  const delen = [posities, normalen, uvs, indexBuf];
  const bufferViews = [];
  const stukken = [];
  let offset = 0;
  for (const [i, deel] of delen.entries()) {
    bufferViews.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: deel.length,
      target: i === 3 ? 34963 : 34962,
    });
    stukken.push(deel);
    offset += deel.length;
    const vulling = (4 - (offset % 4)) % 4;
    if (vulling > 0) {
      stukken.push(Buffer.alloc(vulling));
      offset += vulling;
    }
  }

  const json = {
    asset: {
      generator: 'tools/importeer-modulair-terrein.mjs',
      version: '2.0',
      extras: {
        taaleiland: {
          versie: 1,
          schaal: SCHAAL,
          oorsprong: OORSPRONG,
          palet: 1,
          bron: 'Modular Terrain Collection',
        },
      },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    // De schaal staat op de wortelnode; de oorsprong van de pack blijft
    // staan, dus schalen om die oorsprong houdt alle stukken passend.
    nodes: [{ name: naam, mesh: 0, scale: [SCHAAL, SCHAAL, SCHAAL] }],
    meshes: [{
      name: naam,
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
        material: 0,
      }],
    }],
    /* Stijlgids §1: geen metaal, volle ruwheid (de standaardwaarde van de spec,
     * dus die schrijven we niet op) en ondoorzichtig. Dubbelzijdig omdat de
     * pack platte vlakken gebruikt voor bladeren, gras en hangende kabels. */
    materials: [{
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
      doubleSided: true,
      name: 'colormap',
    }],
    textures: [{ sampler: 0, source: 0, name: 'colormap' }],
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
    samplers: [{ minFilter: 9987 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: aantal, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: aantal, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: aantal, type: 'VEC2' },
      { bufferView: 3, componentType: kort ? 5123 : 5125, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews,
    buffers: [{ byteLength: offset }],
  };

  return { json, bin: Buffer.concat(stukken) };
}

/* -- draaien -------------------------------------------------------------- */

const bronMap = process.argv[2];
if (!bronMap) {
  console.error('gebruik: node tools/importeer-modulair-terrein.mjs <map-met-obj>');
  process.exit(1);
}

/* De gedeelde colormap bijwerken. */

const atlas = leesPng(COLORMAP);
const stonden = new Set(gevuldeCellen(atlas).map((c) => c.join(',')));

for (const cel of CELLEN) {
  voegGradientCelToe(atlas, cel.cel, cel.boven, cel.onder);
  const stond = stonden.has(cel.cel.join(','));
  const baan = cel.boven.every((v, i) => v === cel.onder[i])
    ? naarHex(...cel.boven)
    : `${naarHex(...cel.boven)} → ${naarHex(...cel.onder)}`;
  console.log(`${stond ? 'bijgewerkt' : 'toegevoegd'}: cel [${cel.cel}] ${baan}  ${cel.naam}`);
}
schrijfPng(COLORMAP, atlas);

const punten = doelPunten(atlas);

/* De materialen plaatsen. */

const materialen = leesMtl(join(bronMap, MTL));
const plaatsing = plaatsMaterialen(materialen, punten);

console.log(`\n${materialen.size} materialen op kits/colormap.png:`);
for (const [naam, p] of [...plaatsing].sort((a, b) => b[1].afstand - a[1].afstand)) {
  const merk = p.afstand > NIEUWE_CEL_VANAF ? ' !' : '';
  console.log(
    `  ${naam.padEnd(26)} ${naarHex(...p.kd)} → ${naarHex(...p.doel)}` +
    `  cel [${String(p.cel).padEnd(4)}]  afstand ${p.afstand.toFixed(0).padStart(3)}${merk}`,
  );
}

const teVer = [...plaatsing].filter(([, p]) => p.afstand > NIEUWE_CEL_VANAF);
if (teVer.length) {
  console.warn(
    `! ${teVer.length} materialen liggen verder dan ${NIEUWE_CEL_VANAF} van hun doelkleur: ` +
    `${teVer.map(([n]) => n).join(', ')} — voeg er een cel voor toe aan CELLEN`,
  );
}

/* De modellen omzetten. */

mkdirSync(join(DOEL, 'Textures'), { recursive: true });
copyFileSync(COLORMAP, join(DOEL, 'Textures', 'colormap.png'));

const bronnen = readdirSync(bronMap)
  .filter((n) => n.endsWith('.obj'))
  .map((n) => n.replace(/\.obj$/, ''))
  .sort();
if (bronnen.length === 0) throw new Error(`geen .obj-bestanden in ${bronMap}`);

const families = telFamilies(bronnen);
const namen = new Map();
for (const bron of bronnen) {
  const naam = naarNaam(bron, families);
  if (namen.has(naam)) throw new Error(`${bron} en ${namen.get(naam)} leveren allebei '${naam}'`);
  namen.set(naam, bron);
}

/**
 * Uit de kit verwijderd (besluit PO, PR #41): deze modellen worden bij een
 * her-import overgeslagen zodat ze niet stilzwijgend terugkomen.
 */
const VERWIJDERD = new Set([
  'cave-prop-hanging-cables-a', 'cave-prop-hanging-cables-b', 'cave-prop-hanging-cables-c',
  'cave-prop-hanging-lamp',
  'hilly-prop-bush-a', 'hilly-prop-bush-b', 'hilly-prop-bush-c', 'hilly-prop-bush-d',
  'hilly-prop-camp-sitting-log',
  'hilly-prop-tree-oak-a', 'hilly-prop-tree-oak-b', 'hilly-prop-tree-oak-c', 'hilly-prop-tree-oak-d',
]);

for (const [naam, bron] of [...namen].sort()) {
  if (VERWIJDERD.has(naam)) { namen.delete(naam); console.log(`overgeslagen (verwijderd): ${naam} (${bron})`); }
}

let driehoeken = 0;
let calls = 0;
const regels = [];

for (const [naam, bron] of [...namen].sort()) {
  const obj = leesObj(join(bronMap, `${bron}.obj`));
  const glb = bouwGlb(obj, plaatsing, naam);

  const pad = join(DOEL, `${naam}.glb`);
  schrijfGlb(pad, glb.json, glb.bin, writeFileSync);

  const maat = meetScene(leesGlb(pad));
  driehoeken += maat.driehoeken;
  calls += maat.calls;
  regels.push(
    `${bron.padEnd(48)} → ${naam.padEnd(48)} ` +
    `${maat.wdh.map((v) => v.toFixed(2).padStart(6)).join(' × ')}  ${String(maat.driehoeken).padStart(5)} tri`,
  );
}

console.log(`\n${regels.length} modellen → kits/modulair-terrein/`);
for (const regel of regels) console.log(`  ${regel}`);
console.log(`\n${driehoeken} driehoeken, ${calls} tekenopdrachten in ${regels.length} modellen`);

const gekopieerd = kopieerColormap(KITS);
console.log(`colormap gekopieerd naar ${gekopieerd.length} kits: ${gekopieerd.join(', ')}`);
