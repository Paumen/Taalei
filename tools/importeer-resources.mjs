/**
 * Zet de gekozen modellen van KayKit's Resource Bits om naar kits/resources.
 *
 * Draai vanuit de repo-root:  node tools/importeer-resources.mjs <map-met-gltf>
 *
 * De bronbestanden staan niet in de repo — alleen het resultaat. Net als
 * rpgtools en forest levert deze pack al .gltf + .bin per model, dus is er
 * geen FBX2glTF-stap nodig.
 *
 * Anders dan rpgtools en forest zijn de bronnamen hier al gewone Engelse
 * woorden zonder lettercodes (`Copper_Bar`, niet `Bar_01`): 1-op-1 overgezet
 * naar kebab-case, verder ongewijzigd. Alle 56 modellen zijn grondstoffen of
 * voorraadstapels; tools/semantiek.mjs zet de hele kit daarom met één
 * `KIT_GROEPEN`-regel naar de bestaande groep "opslag", in plaats van met een
 * woordregel — `stone-` en `wood-` zijn ook de eerste woorden van
 * bouwpakketonderdelen in andere kits, en een globale regel zou die meepakken.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb, meetScene, zetOpOorsprong, compacteer, ontvlecht } from './glb.mjs';
import { leesPng } from './png.mjs';
import { doelPunten, baanTabel, hermapUv, toetsDriehoeken, toetsNaden, kopieerColormap } from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS = join(ROOT, 'kits');
const DOEL = join(KITS, 'resources');
const COLORMAP = join(KITS, 'colormap.png');

/**
 * De pack gaat op 0,5 het raster van de repo op. Een eerste import nam 1
 * aan, maar naast de rest van de collectie waren de grondstoffen het
 * dubbele van wat ze horen te zijn: een goudstaaf van 0,80 lang stak boven
 * de consensuston (0,50) uit en de steenbrokken (1,12-1,50 breed) waren
 * twee keer survival-kit's resource-stones. Op 0,5 komen de brokken
 * (0,56 breed) naast survival-kit's exemplaren te staan en blijven de
 * stapels leesbare oppak-iconen (planken 0,84, pallet 0,78 breed).
 */
const SCHAAL = 0.5;

/** Bronbestand (zonder .gltf) → naam in de kit: PascalCase/underscore → kebab-case. */
const BRONNEN = [
  'Copper_Bar', 'Copper_Bars', 'Copper_Bars_Stack_Large', 'Copper_Bars_Stack_Medium', 'Copper_Bars_Stack_Small',
  'Copper_Nugget_Large', 'Copper_Nugget_Medium', 'Copper_Nugget_Small', 'Copper_Nuggets',
  'Gold_Bar', 'Gold_Bars', 'Gold_Bars_Stack_Large', 'Gold_Bars_Stack_Medium', 'Gold_Bars_Stack_Small',
  'Gold_Nugget_Large', 'Gold_Nugget_Medium', 'Gold_Nugget_Small', 'Gold_Nuggets',
  'Iron_Bar', 'Iron_Bars', 'Iron_Bars_Stack_Large', 'Iron_Bars_Stack_Medium', 'Iron_Bars_Stack_Small',
  'Iron_Nugget_Large', 'Iron_Nugget_Medium', 'Iron_Nugget_Small', 'Iron_Nuggets',
  'Pallet_Wood', 'Parts_Pile_Large', 'Parts_Pile_Medium', 'Parts_Pile_Small',
  'Silver_Bar', 'Silver_Bars', 'Silver_Bars_Stack_Large', 'Silver_Bars_Stack_Medium', 'Silver_Bars_Stack_Small',
  'Silver_Nugget_Large', 'Silver_Nugget_Medium', 'Silver_Nugget_Small', 'Silver_Nuggets',
  'Stone_Brick', 'Stone_Bricks_Stack_Large', 'Stone_Bricks_Stack_Medium', 'Stone_Bricks_Stack_Small',
  'Stone_Chunks_Large', 'Stone_Chunks_Small',
  'Textiles_Stack_Large',
  'Wood_Log_A', 'Wood_Log_B', 'Wood_Log_Stack',
  'Wood_Plank_A', 'Wood_Plank_B', 'Wood_Plank_C',
  'Wood_Planks_Stack_Large', 'Wood_Planks_Stack_Medium', 'Wood_Planks_Stack_Small',
];
const NAMEN = Object.fromEntries(BRONNEN.map((b) => [b, b.toLowerCase().replace(/_/g, '-')]));

/** De textuur die de pack meelevert; gaat niet mee de repo in. */
const BRON_TEXTUUR = 'resource_bits_texture.png';

const bronMap = process.argv[2];
if (!bronMap) {
  console.error('gebruik: node tools/importeer-resources.mjs <map-met-gltf-en-bin>');
  process.exit(1);
}

function leesGltf(naam) {
  const json = JSON.parse(readFileSync(join(bronMap, `${naam}.gltf`), 'utf8'));
  if (json.buffers.length !== 1) throw new Error(`${naam}: meer dan één buffer, niet ondersteund`);
  const bin = readFileSync(join(bronMap, json.buffers[0].uri));
  return { json, bin };
}

const bronAtlas = leesPng(join(bronMap, BRON_TEXTUUR));
const doelAtlas = leesPng(COLORMAP);
const punten = doelPunten(doelAtlas);

mkdirSync(join(DOEL, 'Textures'), { recursive: true });
copyFileSync(COLORMAP, join(DOEL, 'Textures', 'colormap.png'));

/* Eerst de hele pack inlezen om te tellen welke tinten van welke baan hij
 * gebruikt; daarmee kiest baanTabel() per bron-baan één cel. Die keuze moet
 * voor de hele kit gelijk zijn, dus hij valt vóór het eerste model. */
const tabel = baanTabel(bronAtlas, punten, Object.keys(NAMEN).map(leesGltf));

const perKleur = new Map();
const perCel = new Map(); // 'kolom,rij' → Set(modelnaam), voor kits/palet.json

for (const [bron, naam] of Object.entries(NAMEN)) {
  let ruw = leesGltf(bron);
  const meshIndexen = ruw.json.meshes.map((_, i) => i);
  ruw = ontvlecht(ruw, meshIndexen);

  const { omgezet, ergsteAfstand, gesnapt } = hermapUv(ruw, bronAtlas, punten, meshIndexen, tabel);
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
    generator: 'tools/importeer-resources.mjs',
    version: '2.0',
    extras: {
      taaleiland: { versie: 1, schaal: SCHAAL, tangenten: 'gestript', palet: 1, bron: 'KayKit Resource Bits' },
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
  console.log(`${bron.padEnd(28)} → ${naam.padEnd(28)} ${maat(voor)} → ${maat(na)}  ${String(na.driehoeken).padStart(4)} tri  ${omgezet.size} kleur(en)`);

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
 * een eventuele nieuwe cel moet overal terechtkomen. */
const bijgewerkt = kopieerColormap(KITS);
console.log(`colormap gekopieerd naar: ${bijgewerkt.join(', ')}`);

/* -- kits/palet.json bijwerken, net als tools/importeer-rpgtools.mjs -- */
const paletPad = join(KITS, 'palet.json');
const paletJson = JSON.parse(readFileSync(paletPad, 'utf8'));
const gedeeld = paletJson.paletten.find((p) => p.id === 'gedeeld');
if (!gedeeld) throw new Error('kits/palet.json heeft geen palet "gedeeld"');

/* Eerst deze kit overal weghalen. Bij een herimport kan een model in een andere
 * cel terechtkomen dan de vorige keer, en build-catalog.mjs leest de kleur van
 * een model hiervandaan — een vermelding die blijft staan geeft het model in de
 * catalogus een kleur die het niet meer heeft. */
for (const cel of gedeeld.cellen) {
  cel.bronnen = cel.bronnen.filter((b) => b.kit !== 'resources');
}

for (const [celSleutel, modellenSet] of perCel) {
  const [kolom, rij] = celSleutel.split(',').map(Number);
  const cel = gedeeld.cellen.find((c) => c.cel[0] === kolom && c.cel[1] === rij);
  if (!cel) throw new Error(`cel [${kolom},${rij}] staat niet in kits/palet.json — nieuwe cel niet verwacht voor deze pack`);
  let bron = cel.bronnen.find((b) => b.kit === 'resources');
  if (!bron) {
    bron = { kit: 'resources', modellen: [] };
    cel.bronnen.push(bron);
  }
  bron.modellen = [...new Set([...bron.modellen, ...modellenSet])].sort();
}

writeFileSync(paletPad, `${JSON.stringify(paletJson, null, 1)}\n`);
console.log('kits/palet.json bijgewerkt met resources-bronnen');

console.log(`${Object.keys(NAMEN).length} modellen → kits/resources/`);
