/**
 * Zet de gekozen modellen van KayKit's RPG Tools Bits om naar kits/rpgtools.
 *
 * Draai vanuit de repo-root:  node tools/importeer-rpgtools.mjs <map-met-gltf>
 *
 * De bronbestanden staan niet in de repo — alleen het resultaat. Anders dan
 * props en rocks levert deze pack al .gltf + .bin per model, dus is er geen
 * FBX2glTF-stap nodig: dit script leest ze rechtstreeks.
 *
 * Van de 102 modellen in de pack zijn er 35 gekozen. De pack noemt zijn
 * bestanden met underscores (`pencil_A_long`); de repo is overal kebab-case
 * — nodig omdat zowel het kleurfilter (tools/semantiek.mjs splitst op `-`)
 * als de groep-regels (die op woordgrens `\b` na een `-` matchen) daarvan
 * uitgaan, en `_` telt in JavaScript-regexes als woordteken, niet als grens.
 * De namen zijn dus 1-op-1 overgezet naar kebab-case, verder ongewijzigd.
 *
 * Eén model, `map_empty`, tekent met twee materialen: het merendeel van de
 * geometrie met de gewone `tools_bits_texture.png`, het papiervlak met de
 * apart aangeleverde `tools_bits_map_empty.png`. Dat vraagt twee hermap-
 * rondes op hetzelfde mesh — zie `MET_TWEEDE_ATLAS` hieronder.
 *
 * Dit script voegt daarnaast één kleur toe aan de gedeelde colormap; zie
 * STAALBLAUW hieronder.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb, meetScene, zetOpOorsprong, compacteer, ontvlecht } from './glb.mjs';
import { leesPng, schrijfPng } from './png.mjs';
import {
  doelPunten, baanTabel, hermapUv, toetsDriehoeken, toetsNaden, voegGradientCelToe, gevuldeCellen,
  kopieerColormap, naarHex,
} from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS = join(ROOT, 'kits');
const DOEL = join(KITS, 'rpgtools');
const COLORMAP = join(KITS, 'colormap.png');

/**
 * De ene kleur die niet uit kits/colormap.png te halen was.
 *
 * Het kompas, de tekenpasser en het lakzegel op de kaartrol zijn geverfd in
 * een verzadigd hemelsblauw (~0071bc/29aae1). Het gedeelde palet heeft twee
 * blauwen, maar dat zijn allebei grijsblauwen zonder verzadiging ([3,2]
 * #9da4c4, [15,3] #6d738a): de dichtstbijzijnde daarvan lag op een afstand
 * van 120 tot 155 — geen tint ernaast, maar een merkbaar andere kleur.
 *
 * Cel [4,2] was leeg en ligt naast het bestaande grijsblauw op [3,2]. De baan
 * loopt van het lichtste tot het donkerste blauw dat in de textuur voorkomt
 * (het bronmateriaal heeft zijn eigen baked shading), zodat de schakering van
 * het beslag behouden blijft.
 */
const STAALBLAUW = { cel: [4, 2], boven: [41, 171, 226], onder: [31, 60, 133] };

/**
 * Gecalibreerd tegen het bestaande gereedschap van de survival-kit, dat al op
 * het raster van de repo staat: hamer 0,307, houweel 0,48, schep 0,58 hoog.
 * Op 0,4 komen de overeenkomstige RPG Tools-modellen uit op 0,329 / 0,554 /
 * 0,631 — steeds binnen 15% van dat ijkpunt. Eén factor voor de hele pack
 * (stijlgids §4).
 */
const SCHAAL = 0.4;

/** Bronbestand (zonder .gltf) → naam in de kit. Puur underscore → kebab-case. */
const NAMEN = {
  anvil: 'anvil',
  axe: 'axe',
  chisel: 'chisel',
  compass_base: 'compass-base',
  drafting_compass: 'drafting-compass',
  file: 'file',
  grindstone: 'grindstone',
  hammer: 'hammer',
  handdrill: 'handdrill',
  handplane: 'handplane',
  journal_closed: 'journal-closed',
  journal_open: 'journal-open',
  knife: 'knife',
  lantern: 'lantern',
  magnifying_glass: 'magnifying-glass',
  mallet: 'mallet',
  map_empty: 'map-empty',
  map_rolled: 'map-rolled',
  nail: 'nail',
  pencil_A_long: 'pencil-a-long',
  pencil_B_long: 'pencil-b-long',
  pickaxe: 'pickaxe',
  rope_bundle_A: 'rope-bundle-a',
  rope_bundle_B: 'rope-bundle-b',
  saw: 'saw',
  scissors: 'scissors',
  screw_B: 'screw-b',
  screwdriver_A_short: 'screwdriver-a-short',
  screwdriver_B_short: 'screwdriver-b-short',
  shovel: 'shovel',
  tongs: 'tongs',
  torch: 'torch',
  torch_burnt: 'torch-burnt',
  trowel: 'trowel',
  wrench_B: 'wrench-b',
};

/** De textuur die de pack meelevert; gaat niet mee de repo in. */
const BRON_TEXTUUR = 'tools_bits_texture.png';

/**
 * `map_empty` tekent zijn papiervlak (materiaal-index 1) met een eigen
 * atlas in plaats van de gewone `tools_bits_texture.png`.
 */
const MET_TWEEDE_ATLAS = {
  map_empty: { materiaal: 1, bestand: 'tools_bits_map_empty.png' },
};

const bronMap = process.argv[2];
if (!bronMap) {
  console.error('gebruik: node tools/importeer-rpgtools.mjs <map-met-gltf-en-bin>');
  process.exit(1);
}

function leesGltf(naam) {
  const json = JSON.parse(readFileSync(join(bronMap, `${naam}.gltf`), 'utf8'));
  if (json.buffers.length !== 1) throw new Error(`${naam}: meer dan één buffer, niet ondersteund`);
  const bin = readFileSync(join(bronMap, json.buffers[0].uri));
  return { json, bin };
}

const doelAtlas = leesPng(COLORMAP);
const stondAl = gevuldeCellen(doelAtlas).some(([k, r]) => k === STAALBLAUW.cel[0] && r === STAALBLAUW.cel[1]);
voegGradientCelToe(doelAtlas, STAALBLAUW.cel, STAALBLAUW.boven, STAALBLAUW.onder);
schrijfPng(COLORMAP, doelAtlas);
console.log(
  `${stondAl ? 'bijgewerkt' : 'toegevoegd'}: cel [${STAALBLAUW.cel}] ` +
  `${naarHex(...STAALBLAUW.boven)} → ${naarHex(...STAALBLAUW.onder)} in kits/colormap.png`,
);

const bronAtlas = leesPng(join(bronMap, BRON_TEXTUUR));
const punten = doelPunten(doelAtlas);

mkdirSync(join(DOEL, 'Textures'), { recursive: true });
copyFileSync(COLORMAP, join(DOEL, 'Textures', 'colormap.png'));

/* Eerst de hele pack inlezen om te tellen welke tinten van welke baan hij
 * gebruikt; daarmee kiest baanTabel() per bron-baan één cel. Die keuze moet
 * voor de hele kit gelijk zijn, dus hij valt vóór het eerste model. De modellen
 * met een tweede atlas tellen niet mee: hun UV's horen bij die andere sheet en
 * wijzen hier lukraak in de hoofdatlas. Voor die tweede atlas is er geen
 * telling — één kaart is te weinig om iets te wegen, en baanTabel() valt dan
 * terug op de banen zelf.  */
const tabel = baanTabel(bronAtlas, punten,
  Object.keys(NAMEN).filter((bron) => !MET_TWEEDE_ATLAS[bron]).map(leesGltf));

const perKleur = new Map();
const perCel = new Map(); // 'kolom,rij' → Set(modelnaam), voor kits/palet.json

for (const [bron, naam] of Object.entries(NAMEN)) {
  let ruw = leesGltf(bron);
  const meshIndexen = ruw.json.meshes.map((_, i) => i);
  ruw = ontvlecht(ruw, meshIndexen);

  const tweedeAtlas = MET_TWEEDE_ATLAS[bron];
  let omgezet, ergsteAfstand, gesnapt;

  if (!tweedeAtlas) {
    ({ omgezet, ergsteAfstand, gesnapt } = hermapUv(ruw, bronAtlas, punten, meshIndexen, tabel));
  } else {
    // Twee hermap-rondes op hetzelfde mesh: de primitives eerst opsplitsen
    // per atlas, apart hermappen, en de oorspronkelijke volgorde teruggeven —
    // hermapUv zelf kent maar één bron-atlas per aanroep.
    const mi = meshIndexen[0];
    if (meshIndexen.length !== 1) throw new Error(`${bron}: verwacht één mesh bij een tweede atlas`);
    const mesh = ruw.json.meshes[mi];
    const alleP = mesh.primitives;
    const tweedeP = alleP.filter((p) => p.material === tweedeAtlas.materiaal);
    const eersteP = alleP.filter((p) => p.material !== tweedeAtlas.materiaal);

    mesh.primitives = eersteP;
    const eerste = hermapUv(ruw, bronAtlas, punten, [mi], tabel);

    const tweedeAtlasPng = leesPng(join(bronMap, tweedeAtlas.bestand));
    mesh.primitives = tweedeP;
    const tweede = hermapUv(ruw, tweedeAtlasPng, punten, [mi]);

    mesh.primitives = alleP;
    omgezet = new Map([...eerste.omgezet, ...tweede.omgezet]);
    ergsteAfstand = Math.max(eerste.ergsteAfstand, tweede.ergsteAfstand);
    gesnapt = eerste.gesnapt + tweede.gesnapt;
  }

  const glb = compacteer(ruw, meshIndexen);

  glb.json.materials = [{
    pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
    doubleSided: true,
    name: 'colormap',
  }];
  glb.json.textures = [{ sampler: 0, source: 0, name: 'colormap' }];
  glb.json.images = [{ uri: 'Textures/colormap.png', name: 'colormap' }];
  glb.json.samplers = [{ minFilter: 9987 }];
  for (const mesh of glb.json.meshes) for (const prim of mesh.primitives) prim.material = 0;

  glb.json.asset = {
    generator: 'tools/importeer-rpgtools.mjs',
    version: '2.0',
    extras: {
      taaleiland: { versie: 1, schaal: SCHAAL, tangenten: 'gestript', palet: 1, bron: 'KayKit RPG Tools Bits' },
    },
  };

  const voor = zetOpOorsprong(glb, naam, SCHAAL);
  const alleMeshes = glb.json.meshes.map((_, i) => i);
  const verdacht = toetsDriehoeken(glb, alleMeshes, doelAtlas);
  const naden = toetsNaden(glb, alleMeshes, doelAtlas);

  const pad = join(DOEL, `${naam}.glb`);
  schrijfGlb(pad, glb.json, glb.bin, writeFileSync);

  const na = meetScene(leesGlb(pad));
  const maat = (m) => m.wdh.map((v) => v.toFixed(2).padStart(5)).join(' × ');
  console.log(`${bron.padEnd(20)} → ${naam.padEnd(22)} ${maat(voor)} → ${maat(na)}  ${String(na.driehoeken).padStart(4)} tri  ${omgezet.size} kleur(en)`);

  for (const [van, k] of omgezet) {
    if (!perKleur.has(van)) perKleur.set(van, { naar: k.naar, cel: k.cel, afstand: k.afstand, modellen: [] });
    perKleur.get(van).modellen.push(naam);

    const celSleutel = k.cel.join(',');
    if (!perCel.has(celSleutel)) perCel.set(celSleutel, new Set());
    perCel.get(celSleutel).add(naam);
  }
  if (ergsteAfstand > 120) {
    console.warn(`  ! ${naam}: grootste kleurafstand ${ergsteAfstand.toFixed(0)}`);
  }
  if (gesnapt > 0) console.log(`  ${gesnapt} hoekpunten teruggehaald naar de cel van hun driehoek`);
  if (verdacht > 0) {
    console.warn(`  ! ${naam}: ${verdacht} driehoeken lopen over meer dan één cel`);
  }
  if (naden > 0) {
    console.warn(`  ! ${naam}: ${naden} kleurnaden tussen driehoeken in hetzelfde vlak`);
  }
}

console.log();
for (const [van, k] of [...perKleur].sort((a, b) => b[1].afstand - a[1].afstand)) {
  console.log(`${van} → ${k.naar} cel [${k.cel}] afstand ${String(k.afstand.toFixed(0)).padStart(3)} — ${k.modellen.length} modellen`);
}

/* Elke kit wijst met een relatief pad naar zijn eigen kopie van de atlas, dus
 * de nieuwe cel moet overal terechtkomen — anders ziet dezelfde kleur er per
 * kit anders uit. */
const bijgewerkt = kopieerColormap(KITS);
console.log(`colormap gekopieerd naar: ${bijgewerkt.join(', ')}`);

/* -- kits/palet.json bijwerken ---------------------------------------------
 * build-catalog.mjs leest de kleuren van een model niet uit de .glb, maar uit
 * palet.json: per cel een lijst kits/modellen die daar vertices in hebben.
 * `perCel` is per model al de juiste eenheid — welke cellen zijn UV's
 * aanwijzen — dus die schrijven we hier terug, in plaats van dat met de hand
 * te doen zoals bij props en rocks.
 */
const paletPad = join(KITS, 'palet.json');
const paletJson = JSON.parse(readFileSync(paletPad, 'utf8'));
const gedeeld = paletJson.paletten.find((p) => p.id === 'gedeeld');
if (!gedeeld) throw new Error('kits/palet.json heeft geen palet "gedeeld"');

/* Eerst deze kit overal weghalen. Bij een herimport kan een model in een andere
 * cel terechtkomen dan de vorige keer, en build-catalog.mjs leest de kleur van
 * een model hiervandaan — een vermelding die blijft staan geeft het model in de
 * catalogus een kleur die het niet meer heeft. */
for (const cel of gedeeld.cellen) {
  cel.bronnen = cel.bronnen.filter((b) => b.kit !== 'rpgtools');
}

for (const [celSleutel, modellenSet] of perCel) {
  const [kolom, rij] = celSleutel.split(',').map(Number);
  let cel = gedeeld.cellen.find((c) => c.cel[0] === kolom && c.cel[1] === rij);
  if (!cel) {
    // Precies de nieuwe STAALBLAUW-cel: palet.json kende hem nog niet.
    const midden = STAALBLAUW.boven.map((v, i) => Math.round((v + STAALBLAUW.onder[i]) / 2));
    cel = { cel: [kolom, rij], kleur: naarHex(...midden), bronnen: [] };
    gedeeld.cellen.push(cel);
  }
  let bron = cel.bronnen.find((b) => b.kit === 'rpgtools');
  if (!bron) {
    bron = { kit: 'rpgtools', modellen: [] };
    cel.bronnen.push(bron);
  }
  bron.modellen = [...new Set([...bron.modellen, ...modellenSet])].sort();
}

/* Vaste volgorde op kitnaam. Deze kit is hierboven weggehaald en opnieuw
 * achteraan gezet; zonder sorteren levert dezelfde import twee keer draaien
 * een ander bestand op, en verdrinkt een echte wijziging in de verschuiving. */
for (const cel of gedeeld.cellen) {
  cel.bronnen.sort((a, b) => (a.kit < b.kit ? -1 : a.kit > b.kit ? 1 : 0));
}

writeFileSync(paletPad, `${JSON.stringify(paletJson, null, 1)}\n`);
console.log('kits/palet.json bijgewerkt met rpgtools-bronnen');

console.log(`${Object.keys(NAMEN).length} modellen → kits/rpgtools/`);
