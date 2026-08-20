/**
 * Zet de ruwe modellen van de Tropical Island Pack (Lite) om naar kits/tropical.
 *
 * Draai vanuit de repo-root:  node tools/importeer-tropical.mjs <map-met-glb>
 *
 * De bronbestanden (.fbx) staan niet in de repo — alleen het resultaat.
 *
 * Stap 1 — .fbx → .glb, per bestand:
 *
 *     FBX2glTF -i <naam>.fbx -o <naam> -b --pbr-metallic-roughness
 *
 *   (FBX2glTF 0.9.7, npm-pakket `fbx2gltf`.)
 *
 * Stap 2 — dit script: detailtrap, schaal, oorsprong, namen en kleur.
 *
 * Anders dan de nature-pack levert deze pack drie detailtrappen per model —
 * LOD0, LOD1 en LOD2 — alle drie als aparte mesh in hetzelfde bestand en alle
 * drie in de scène. Die zouden hier over elkaar heen getekend worden. Deze repo
 * kent geen LOD's, dus alleen LOD0 blijft over; de rest gaat ook echt het
 * bestand uit, zodat de bytes in de catalogus kloppen met wat er te zien is.
 *
 * Dit script voegt daarnaast één kleur toe aan de gedeelde colormap; zie
 * OLIJFGROEN hieronder.
 */

import { readdirSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb, meetScene, zetOpOorsprong, compacteer } from './glb.mjs';
import { leesPng, schrijfPng } from './png.mjs';
import {
  doelPunten, hermapUv, toetsDriehoeken, voegGradientCelToe, gevuldeCellen, kopieerColormap, naarHex,
} from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS = join(ROOT, 'kits');
const DOEL = join(KITS, 'tropical');
const COLORMAP = join(KITS, 'colormap.png');

/**
 * De pack staat op ruwweg twee keer het raster van de andere kits; een
 * eerdere import halveerde hem (0,5), maar dat bleek nét te krap: het vat
 * kwam op 0,43 uit waar de consensuston 0,50 is, en de kistjes op
 * 0,17-0,20. Op 0,6 staat het vat op 0,52 — midden in de cluster — en
 * blijven steiger en plank rond één rastereenheid. Eén factor voor de hele
 * pack (stijlgids §4), dus de palm groeit mee naar 2,47; palmen variëren
 * toch al (pirate-kit 1,69, modulair-terrein 1,63-2,06).
 */
const SCHAAL = 0.6;

/**
 * De ene kleur die niet uit kits/colormap.png te halen was.
 *
 * De bladeren van de palm en de plant zijn olijf- tot geelgroen (tint ~78°).
 * Het gedeelde palet heeft twee groenen, maar dat zijn allebei blauwgroenen
 * (tint ~150°): de dichtstbijzijnde kleur voor élk van de 83 bladtinten was een
 * bruin, op een afstand van 110 tot 132. Dat is geen kwestie van een tint
 * ernaast — de palmbladeren zouden bruin uitkomen.
 *
 * Daarom is dit precies het geval dat stijlgids §1 beschrijft: geen bestaande
 * kleur komt in de buurt, hij past binnen wat er staat, en hij gaat de gedeelde
 * colormap in — niet een eigen atlas voor deze kit. Cel [3,1] was leeg en ligt
 * naast de bestaande groenen op [2,1] en [5,1].
 *
 * De baan loopt van de lichtste naar de donkerste bladtint die in de pack
 * voorkomt, zodat de schakering van het blad behouden blijft in plaats van tot
 * één vlakke kleur te worden platgeslagen. Over alle 3668 bladvertices is de
 * gemiddelde kleurafstand daarmee 1,7.
 */
const OLIJFGROEN = { cel: [3, 1], boven: [141, 170, 73], onder: [78, 112, 30] };

/**
 * Bronbestand → naam in de kit, kebab-case met letterachtervoegsels zoals de
 * rest van de repo.
 *
 * `Chest_01` en `Chest_01_2` zijn geen twee kisten maar één: de bak en het
 * deksel. Dit script laadt ze los in als `chest-a` en `chest-b`, omdat het per
 * bronbestand werkt; tools/voeg-samen.mjs zet ze daarna in elkaar tot één
 * `chest-a`. Draai dat script dus na een herimport opnieuw.
 */
const NAMEN = {
  Barrel_04: 'barrel-a',
  Chest_01: 'chest-a',
  Chest_01_2: 'chest-b',
  PalmTree_05: 'palm-a',
  Pier_02: 'pier-a',
  Plank_01: 'plank-a',
  Plant_01: 'plant-a',
};

/** De textuur die de pack meelevert; gaat niet mee de repo in. */
const BRON_TEXTUUR = 'TropicalEnvironmentLite_Texture_01.png';

/**
 * Bekend en in orde: `chest-b` meldt een kleurafstand van 159.
 *
 * Tien hoekpunten — acht van de 628 driehoeken, een detail op het beslag —
 * wijzen in de bron naar zuiver zwart. Het gedeelde palet kent geen zwart en
 * kan dat ook niet krijgen: zwart is in kits/colormap.png juist het teken dát
 * een cel leeg is, dus een zwarte cel zou niet van lege ruimte te onderscheiden
 * zijn. Ze komen nu uit op #343437, de donkerste kleur die er wél is, in
 * dezelfde cel als het overige beslag van de kist. De afstand is groot omdat
 * zwart ontbreekt, niet omdat de keuze verkeerd is.
 */

const bronMap = process.argv[2];
if (!bronMap) {
  console.error('gebruik: node tools/importeer-tropical.mjs <map-met-omgezette-glb>');
  process.exit(1);
}

/* -- de gedeelde colormap bijwerken --------------------------------------- */

const doelAtlas = leesPng(COLORMAP);
const stond = gevuldeCellen(doelAtlas).some(([k, r]) => k === OLIJFGROEN.cel[0] && r === OLIJFGROEN.cel[1]);

voegGradientCelToe(doelAtlas, OLIJFGROEN.cel, OLIJFGROEN.boven, OLIJFGROEN.onder);
schrijfPng(COLORMAP, doelAtlas);
console.log(
  `${stond ? 'bijgewerkt' : 'toegevoegd'}: cel [${OLIJFGROEN.cel}] ` +
  `${naarHex(...OLIJFGROEN.boven)} → ${naarHex(...OLIJFGROEN.onder)} in kits/colormap.png`,
);

const punten = doelPunten(doelAtlas);
const bronAtlas = leesPng(join(bronMap, BRON_TEXTUUR));

mkdirSync(join(DOEL, 'Textures'), { recursive: true });
copyFileSync(COLORMAP, join(DOEL, 'Textures', 'colormap.png'));

/* -- de modellen ---------------------------------------------------------- */

const aanwezig = new Set(
  readdirSync(bronMap).filter((n) => n.endsWith('.glb')).map((n) => n.replace(/\.glb$/, '')),
);
const ontbreekt = Object.keys(NAMEN).filter((n) => !aanwezig.has(n));
if (ontbreekt.length) throw new Error(`niet gevonden in ${bronMap}: ${ontbreekt.join(', ')}`);

for (const [bron, naam] of Object.entries(NAMEN)) {
  const ruw = leesGlb(join(bronMap, `${bron}.glb`));

  const lod0 = ruw.json.meshes
    .map((mesh, i) => [mesh.name, i])
    .filter(([mesh]) => /LOD0$/.test(mesh))
    .map(([, i]) => i);
  if (lod0.length !== 1) {
    throw new Error(`${bron}: verwacht één LOD0-mesh, gevonden ${lod0.length}`);
  }

  const { omgezet, ergsteAfstand, gesnapt } = hermapUv(ruw, bronAtlas, punten, lod0);

  // De tweede UV-set van de pack wijst nergens naar en gaat er hier uit; wat
  // overblijft is wat de catalogus en de viewer gebruiken.
  const glb = compacteer(ruw, lod0, ['POSITION', 'NORMAL', 'TEXCOORD_0']);

  glb.json.materials = [{
    pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
    doubleSided: true,
    name: 'colormap',
  }];
  glb.json.textures = [{ sampler: 0, source: 0, name: 'colormap' }];
  glb.json.images = [{ uri: 'Textures/colormap.png', name: 'colormap' }];
  glb.json.samplers = [{ minFilter: 9987 }];
  for (const mesh of glb.json.meshes) for (const prim of mesh.primitives) prim.material = 0;

  // De mesh heet in de pack naar zijn detailtrap; in de kit heet hij naar het model.
  glb.json.meshes[0].name = naam;
  glb.json.nodes[0].name = naam;

  glb.json.asset = {
    generator: 'tools/importeer-tropical.mjs',
    version: '2.0',
    extras: {
      taaleiland: {
        versie: 1,
        schaal: SCHAAL,
        tangenten: 'gestript',
        palet: 1,
        bron: 'Tropical Island Pack Lite',
        detailtrap: 'LOD0',
      },
    },
  };

  const voor = zetOpOorsprong(glb, naam, SCHAAL);
  const verdacht = toetsDriehoeken(glb, [0], doelAtlas);

  const pad = join(DOEL, `${naam}.glb`);
  schrijfGlb(pad, glb.json, glb.bin, writeFileSync);

  const na = meetScene(leesGlb(pad));
  const maat = (m) => m.wdh.map((v) => v.toFixed(2).padStart(6)).join(' × ');
  console.log(`${bron.padEnd(12)} → ${naam.padEnd(9)} ${maat(voor)}  →  ${maat(na)}  ${na.driehoeken} tri`);
  for (const [van, naarCel] of [...omgezet].sort((a, b) => b[1].aantal - a[1].aantal)) {
    console.log(`               ${van} → ${naarCel.naar}  cel [${naarCel.cel}]  afstand ${naarCel.afstand.toFixed(0)}  (${naarCel.aantal}×)`);
  }
  if (ergsteAfstand > 120) {
    console.warn(`  ! ${naam}: grootste kleurafstand ${ergsteAfstand.toFixed(0)} — voeg een cel toe aan kits/colormap.png of controleer het model`);
  }
  if (gesnapt > 0) {
    console.log(`               ${gesnapt} hoekpunten teruggehaald naar de cel van hun driehoek`);
  }
  if (verdacht > 0) {
    console.warn(`  ! ${naam}: ${verdacht} driehoeken lopen over meer dan één cel — die vegen bij het interpoleren over de atlas`);
  }
}

/* Elke kit wijst met een relatief pad naar zijn eigen kopie van de atlas, dus
 * de nieuwe cel moet overal terechtkomen — anders ziet dezelfde kleur er per
 * kit anders uit. */
const bijgewerkt = kopieerColormap(KITS);
console.log(`colormap gekopieerd naar: ${bijgewerkt.join(', ')}`);
console.log(`${Object.keys(NAMEN).length} modellen → kits/tropical/`);
