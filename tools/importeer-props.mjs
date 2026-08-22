/**
 * Zet de gekozen modellen van de Medieval Props-pack (Lite) om naar kits/props.
 *
 * Draai vanuit de repo-root:  node tools/importeer-props.mjs <map-met-glb>
 *
 * De bronbestanden (.fbx) staan niet in de repo — alleen het resultaat.
 *
 * Stap 1 — .fbx → .glb, per bestand:
 *
 *     FBX2glTF -i <naam>.fbx -o <naam> -b --pbr-metallic-roughness
 *
 *   (FBX2glTF 0.9.7, npm-pakket `fbx2gltf`.)
 *
 * Stap 2 — dit script: oorsprong, namen en kleur.
 *
 * Van de 48 modellen in de pack zijn er 28 gekozen; de rest is niet ingeladen.
 * Anders dan de tropical-pack van dezelfde makers draagt deze pack één mesh per
 * bestand, zonder detailtrappen. Een deel heeft wel een tweede UV-set die
 * nergens naar verwijst; die gaat eruit.
 */

import { readdirSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb, meetScene, zetOpOorsprong, compacteer } from './glb.mjs';
import { leesPng } from './png.mjs';
import { doelPunten, hermapUv, toetsDriehoeken } from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOEL = join(ROOT, 'kits', 'workfiles', 'props');
const COLORMAP = join(ROOT, 'kits', 'colormap.png');

/**
 * De pack gaat op 0,6 het raster van de repo op.
 *
 * Een eerste import nam 1 aan ("één unit = één meter"), maar op factor 1
 * was elk groot stuk ver boven dezelfde voorwerpen elders — het vat 0,99
 * tegenover tonnen van ~0,5, de tafel 0,80 tegenover survival-kit's
 * werkbank 0,57. Een halvering bleek weer te streng voor het kleingoed
 * (flessen 0,11). Op 0,6 (besluit PO) staat het vat op 0,60, de tafel op
 * 0,48, de kruk op 0,26 en de flessen op 0,13 — één factor per pack
 * (stijlgids §4), afweging gedocumenteerd in docs/asset_size_review.md.
 */
const SCHAAL = 0.6;

/**
 * Bronbestand → naam in de kit, kebab-case met letterachtervoegsels.
 *
 * De letters lopen door vanaf `a` in de volgorde hieronder en volgen dus niet
 * de nummering van de pack: van de kaarsen is `Candle_01` niet ingeladen en van
 * het eten alleen 03, 04 en 06. Welk bronbestand bij welke naam hoort staat in
 * kits/props/LICENSE.txt.
 *
 * Zes namen zeggen niet wat het model is. `Furniture_01/02/03` blijken een
 * tafel, een bank en een kruk, en `Food_03/04/06` een gebraden vogel, een
 * stuk vlees aan het bot en een paddenstoel. Die heten hier naar wat ze zijn:
 * anders staan er drie meubels in de catalogus die je alleen uit elkaar houdt
 * door ze te openen, en zijn er geen Nederlandse zoekwoorden voor te schrijven.
 *
 * `Bucket_01` en `Bucket_01_2` zijn geen twee emmers maar één: de kuip en het
 * hengsel. Dit script laadt ze los in als `bucket-a` en `bucket-b`, omdat het
 * per bronbestand werkt; tools/voeg-samen.mjs zet ze daarna in elkaar tot één
 * `bucket-a`. Draai dat script dus na een herimport opnieuw.
 */
const NAMEN = {
  Bag_01: 'bag-a',
  Barrel_01: 'barrel-a',
  Bottle_01: 'bottle-a',
  Bottle_02: 'bottle-b',
  Bottle_03: 'bottle-c',
  Box_01: 'box-a',
  Bucket_01: 'bucket-a',
  Bucket_01_2: 'bucket-b',
  Candle_02: 'candle-a',
  Candle_03: 'candle-b',
  Carpet_01: 'carpet-a',
  Cup_01: 'cup-a',
  Fire_01: 'fire-a',
  Firewood_01: 'firewood-a',
  Food_03: 'roast-a',
  Food_04: 'meat-leg-a',
  Food_06: 'mushroom-a',
  Furniture_01: 'table-a',
  Furniture_02: 'bench-a',
  Furniture_03: 'stool-a',
  Jug_01: 'jug-a',
  Jug_02: 'jug-b',
  Jug_03: 'jug-c',
  Jug_04: 'jug-d',
  Plate_01: 'plate-a',
  Plate_02: 'plate-b',
  Plate_03: 'plate-c',
  Stairs_01: 'stairs-a',
};

/** De textuur die de pack meelevert; gaat niet mee de repo in. */
const BRON_TEXTUUR = 'MedievalProps_Texture_01.png';

const bronMap = process.argv[2];
if (!bronMap) {
  console.error('gebruik: node tools/importeer-props.mjs <map-met-omgezette-glb>');
  process.exit(1);
}

const bronAtlas = leesPng(join(bronMap, BRON_TEXTUUR));
const doelAtlas = leesPng(COLORMAP);
const punten = doelPunten(doelAtlas);

mkdirSync(join(DOEL, 'Textures'), { recursive: true });
copyFileSync(COLORMAP, join(DOEL, 'Textures', 'colormap.png'));

const aanwezig = new Set(
  readdirSync(bronMap).filter((n) => n.endsWith('.glb')).map((n) => n.replace(/\.glb$/, '')),
);
const ontbreekt = Object.keys(NAMEN).filter((n) => !aanwezig.has(n));
if (ontbreekt.length) throw new Error(`niet gevonden in ${bronMap}: ${ontbreekt.join(', ')}`);

const perKleur = new Map();

for (const [bron, naam] of Object.entries(NAMEN)) {
  const ruw = leesGlb(join(bronMap, `${bron}.glb`));
  const meshIndexen = ruw.json.meshes.map((_, i) => i);

  const { omgezet, ergsteAfstand, gesnapt } = hermapUv(ruw, bronAtlas, punten, meshIndexen);
  const glb = compacteer(ruw, meshIndexen, ['POSITION', 'NORMAL', 'TEXCOORD_0']);

  glb.json.materials = [{
    pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
    doubleSided: true,
    name: 'colormap',
  }];
  glb.json.textures = [{ sampler: 0, source: 0, name: 'colormap' }];
  glb.json.images = [{ uri: 'Textures/colormap.png', name: 'colormap' }];
  glb.json.samplers = [{ minFilter: 9987 }];
  for (const mesh of glb.json.meshes) for (const prim of mesh.primitives) prim.material = 0;

  glb.json.meshes[0].name = naam;
  glb.json.nodes[0].name = naam;

  glb.json.asset = {
    generator: 'tools/importeer-props.mjs',
    version: '2.0',
    extras: {
      taaleiland: {
        versie: 1,
        schaal: SCHAAL,
        tangenten: 'gestript',
        palet: 1,
        bron: 'Medieval Props Lite',
      },
    },
  };

  const voor = zetOpOorsprong(glb, naam, SCHAAL);
  const verdacht = toetsDriehoeken(glb, [0], doelAtlas);

  const pad = join(DOEL, `${naam}.glb`);
  schrijfGlb(pad, glb.json, glb.bin, writeFileSync);

  const na = meetScene(leesGlb(pad));
  const maat = (m) => m.wdh.map((v) => v.toFixed(2).padStart(5)).join(' × ');
  console.log(`${bron.padEnd(13)} → ${naam.padEnd(12)} ${maat(voor)} → ${maat(na)}  ${String(na.driehoeken).padStart(4)} tri  ${omgezet.size} kleur(en)`);

  for (const [van, k] of omgezet) {
    if (!perKleur.has(van)) perKleur.set(van, { naar: k.naar, cel: k.cel, afstand: k.afstand, aantal: 0 });
    perKleur.get(van).aantal += k.aantal;
  }
  if (ergsteAfstand > 120) {
    console.warn(`  ! ${naam}: grootste kleurafstand ${ergsteAfstand.toFixed(0)}`);
  }
  if (gesnapt > 0) console.log(`  ${gesnapt} hoekpunten teruggehaald naar de cel van hun driehoek`);
  if (verdacht > 0) {
    console.warn(`  ! ${naam}: ${verdacht} driehoeken lopen over meer dan één cel`);
  }
}

console.log();
for (const [van, k] of [...perKleur].sort((a, b) => b[1].afstand - a[1].afstand)) {
  console.log(`${van} → ${k.naar} cel [${k.cel}] afstand ${String(k.afstand.toFixed(0)).padStart(3)} (${k.aantal}×)`);
}
console.log(`${Object.keys(NAMEN).length} modellen → kits/props/`);
