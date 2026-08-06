/**
 * Zet de ruwe modellen van de Low Poly Nature Pack (Lite) om naar kits/nature.
 *
 * Draai vanuit de repo-root:  node tools/importeer-nature.mjs <map-met-glb>
 *
 * De bronbestanden (.fbx) staan niet in de repo — alleen het resultaat. Dit
 * script legt vast wát er met die bestanden is gebeurd, zodat een volgende
 * import dezelfde kit oplevert.
 *
 * Stap 1 — .fbx → .glb, per bestand:
 *
 *     FBX2glTF -i <naam>.fbx -o <naam> -b --pbr-metallic-roughness
 *
 *   (FBX2glTF 0.9.7, npm-pakket `fbx2gltf`.) De pack levert zijn colormap los
 *   naast de modellen, niet ernaast in de map die FBX2glTF afzoekt; de textuur
 *   die daardoor in de .glb belandt is een placeholder van één pixel. Dat geeft
 *   niet — stap 3 gooit de hele textuurverwijzing weg.
 *
 * Stap 2 — dit script: schaal, oorsprong, namen en kleur.
 *
 * Wat dit script níét doet: het laat de geometrie zelf ongemoeid. Alleen de
 * UV's veranderen, en dat alleen om de modellen op de gedeelde colormap te
 * krijgen.
 */

import { readdirSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb, meetScene, zetOpOorsprong, compacteer } from './glb.mjs';
import { leesPng } from './png.mjs';
import { doelPunten, hermapUv, toetsDriehoeken } from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOEL = join(ROOT, 'kits', 'nature');
const COLORMAP = join(ROOT, 'kits', 'colormap.png');

/**
 * De pack staat op zes keer het raster van de andere kits. Twee onafhankelijke
 * ijkpunten wijzen dezelfde kant op: het hek van de pack is 6,00 units breed
 * waar dat van mini-forest 1,10 is, en de dode boom is er 10,24 hoog tegen 1,68
 * voor de boom van mini-forest. Eén factor voor de hele kit, geen maat per
 * model (stijlgids §4), dus de onderlinge verhoudingen van de pack blijven staan
 * — inclusief de berg, die daarmee bewust een terreinstuk van ruim 16 units
 * breed wordt in plaats van een prop.
 */
const SCHAAL = 1 / 6;

/**
 * Bronbestand → naam in de kit. De pack gebruikt doorgenummerde namen met
 * liggende streepjes; de kits hier zijn kebab-case met letterachtervoegsels
 * (`rock-a`). `dead_tree` wordt `tree-dead` zodat hij bij de andere bomen in de
 * naamsortering staat — en omdat de pack óók een `tree_dead01` heeft die hier
 * niet is ingeladen, is de nummering van de pack hier geen houvast.
 */
const NAMEN = {
  branch01: 'branch-a',
  dead_tree: 'tree-dead',
  mountain01: 'mountain-a',
};

const bronMap = process.argv[2];
if (!bronMap) {
  console.error('gebruik: node tools/importeer-nature.mjs <map-met-omgezette-glb>');
  process.exit(1);
}

/* De atlas van de pack: 1024 × 1024, en volstrekt anders ingedeeld dan
 * kits/colormap.png. Hij gaat niet mee de repo in — hij is alleen nodig om uit
 * te lezen wélke kleur elke UV aanwijst, zodat diezelfde kleur op de gedeelde
 * colormap kan worden teruggezocht. */
const bronAtlas = leesPng(join(bronMap, 'colormap.png'));
const doelAtlas = leesPng(COLORMAP);
const punten = doelPunten(doelAtlas);

mkdirSync(join(DOEL, 'Textures'), { recursive: true });
copyFileSync(COLORMAP, join(DOEL, 'Textures', 'colormap.png'));

const aanwezig = new Set(
  readdirSync(bronMap).filter((n) => n.endsWith('.glb')).map((n) => n.replace(/\.glb$/, '')),
);
const ontbreekt = Object.keys(NAMEN).filter((n) => !aanwezig.has(n));
if (ontbreekt.length) throw new Error(`niet gevonden in ${bronMap}: ${ontbreekt.join(', ')}`);

for (const [bron, naam] of Object.entries(NAMEN)) {
  const ruw = leesGlb(join(bronMap, `${bron}.glb`));
  const meshIndexen = ruw.json.meshes.map((_, i) => i);

  const { omgezet, ergsteAfstand, gesnapt } = hermapUv(ruw, bronAtlas, punten, meshIndexen);

  // Pas ná het hermappen opschonen: hermapUv schrijft in de bronbuffer, en
  // compacteer() neemt daar een strakke kopie van.
  const glb = compacteer(ruw, meshIndexen);

  /* De textuur van de pack eruit, de gedeelde colormap erin. Verder de
   * standaarden uit stijlgids §1: geen metaal, volle ruwheid (de standaardwaarde
   * van de spec, dus die schrijven we niet op) en ondoorzichtig. */
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
    generator: 'tools/importeer-nature.mjs',
    version: '2.0',
    extras: {
      taaleiland: {
        versie: 1,
        schaal: SCHAAL,
        tangenten: 'gestript',
        palet: 1,
        bron: 'Low Poly Nature Pack Lite',
      },
    },
  };

  const voor = zetOpOorsprong(glb, naam, SCHAAL);
  const verdacht = toetsDriehoeken(glb, glb.json.meshes.map((_, i) => i), doelAtlas);

  const pad = join(DOEL, `${naam}.glb`);
  schrijfGlb(pad, glb.json, glb.bin, writeFileSync);

  const na = meetScene(leesGlb(pad));
  const maat = (m) => m.wdh.map((v) => v.toFixed(2).padStart(6)).join(' × ');
  console.log(`${bron.padEnd(11)} → ${naam.padEnd(11)} ${maat(voor)}  →  ${maat(na)}  ${na.driehoeken} tri`);
  for (const [van, naarCel] of omgezet) {
    console.log(`              ${van} → ${naarCel.naar}  cel [${naarCel.cel}]  afstand ${naarCel.afstand.toFixed(0)}  (${naarCel.aantal}×)`);
  }
  if (ergsteAfstand > 120) {
    // 120 is de grens waarbinnen build-catalog.mjs twee stalen als "hetzelfde"
    // durft te behandelen; daarboven liegt de omzetting over wat je ziet.
    console.warn(`  ! ${naam}: grootste kleurafstand ${ergsteAfstand.toFixed(0)} — voegt een cel toe aan kits/colormap.png of controleer het model`);
  }
  if (gesnapt > 0) {
    console.log(`               ${gesnapt} hoekpunten teruggehaald naar de cel van hun driehoek`);
  }
  if (verdacht > 0) {
    console.warn(`  ! ${naam}: ${verdacht} driehoeken lopen over meer dan één cel — die vegen bij het interpoleren over de atlas`);
  }
}

console.log(`${Object.keys(NAMEN).length} modellen → kits/nature/`);
