/**
 * Haalt modellen van de eigen texture-atlas van hun kit naar de gedeelde
 * kits/colormap.png, zodat ze kleuren met de rest van de collectie.
 *
 * Draai vanuit de repo-root:
 *
 *     node tools/naar-gedeelde-atlas.mjs <van-hex> <naar-hex> <model.glb...>
 *     node tools/naar-gedeelde-atlas.mjs '#ba7554' '#8f785b' kits/modular-cave-kit/ladder.glb
 *
 * `van-hex` is een baan uit de eigen sheet van die kit, `naar-hex` een baan uit
 * kits/colormap.png. Beide atlassen hebben hetzelfde raster van 16 × 4 banen,
 * dus de rij bínnen de baan — het gebakken schaduwverloop — verhuist mee zoals
 * bij tools/hermap-kleur.mjs: gemeten vanaf de rij die je noemt, en past het model niet,
 * dan schuift het als geheel op in plaats van af te kappen.
 *
 * Naast de UV's verandert de textuurverwijzing in de .glb. De eigen sheet van de
 * kit blijft staan — daar hangen de modellen aan die buiten de catalogus vallen
 * maar wel in de repo — dus de gedeelde sheet komt ernaast te staan onder een
 * eigen naam, en de kit wordt aangemeld bij kopieerColormap() zodat die kopie
 * met de bron mee blijft lopen.
 *
 * Draai daarna tools/build-catalog.mjs: die leest de kleuren uit de modellen.
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb } from './glb.mjs';
import { leesPng, KOLOMMEN, RIJEN, zoekBaan } from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GEDEELD = join(ROOT, 'kits', 'colormap.png');
/** Onder deze naam komt de gedeelde sheet naast de eigen sheet van de kit te staan. */
const KOPIE = 'colormap-gedeeld.png';

const [vanHex, naarHexArg, ...modellen] = process.argv.slice(2);
if (!vanHex || !naarHexArg || modellen.length === 0) {
  console.error('gebruik: node tools/naar-gedeelde-atlas.mjs <van-hex> <naar-hex> <model.glb...>');
  process.exit(1);
}

const kits = [...new Set(modellen.map((m) => basename(dirname(resolve(ROOT, m)))))];
if (kits.length !== 1) throw new Error(`doe één kit per aanroep (${kits.join(', ')})`);
const [kit] = kits;

/* De eigen sheet van de kit staat in het model zelf; wijst het al naar de
 * gedeelde atlas, dan is er niets te verhuizen. */
const eigenAtlassen = new Set(
  modellen.map((m) => {
    const volledig = resolve(ROOT, m);
    const uri = leesGlb(volledig).json.images?.[0]?.uri;
    if (!uri) throw new Error(`${m} heeft geen colormap`);
    return join(dirname(volledig), uri);
  }),
);
if (eigenAtlassen.size !== 1) throw new Error('de modellen wijzen naar meer dan één sheet');
const eigenAtlasPad = [...eigenAtlassen][0];
if (readFileSync(eigenAtlasPad).equals(readFileSync(GEDEELD))) {
  throw new Error(`${kit} staat al op de gedeelde atlas; gebruik tools/hermap-kleur.mjs`);
}

const bronAtlas = leesPng(eigenAtlasPad);
const doelAtlas = leesPng(GEDEELD);
for (const [naam, a] of [['eigen', bronAtlas], ['gedeelde', doelAtlas]]) {
  if (a.breedte / KOLOMMEN !== doelAtlas.breedte / KOLOMMEN || a.hoogte / RIJEN !== doelAtlas.hoogte / RIJEN) {
    throw new Error(`de ${naam} atlas heeft een ander raster dan de gedeelde`);
  }
}
const CEL_BREED = doelAtlas.breedte / KOLOMMEN;
const CEL_HOOG = doelAtlas.hoogte / RIJEN;

const van = zoekBaan(bronAtlas, vanHex, eigenAtlasPad.slice(ROOT.length + 1));
const naar = zoekBaan(doelAtlas, naarHexArg, 'kits/colormap.png');
const vanNaamRij = van.inBaan;
const naarNaamRij = naar.inBaan;
const naarX = Math.floor(naar.kolom * CEL_BREED + CEL_BREED / 2);

/* De gedeelde sheet naast de eigen sheet zetten. */
const texturenMap = join(ROOT, 'kits', kit, 'Textures');
mkdirSync(texturenMap, { recursive: true });
copyFileSync(GEDEELD, join(texturenMap, KOPIE));
console.log(`kits/${kit}/Textures/${KOPIE} bijgewerkt vanaf kits/colormap.png`);

let hoekpunten = 0;

for (const pad of modellen) {
  const volledig = resolve(ROOT, pad);
  const glb = leesGlb(volledig);
  const { json, bin } = glb;

  const teVerzetten = [];
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const index = prim.attributes?.TEXCOORD_0;
      if (index === undefined) continue;
      const accessor = json.accessors[index];
      if (accessor.componentType !== 5126) throw new Error(`${pad}: TEXCOORD_0 is geen float32`);
      const view = json.bufferViews[accessor.bufferView];
      const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const stap = view.byteStride ?? 8;

      for (let i = 0; i < accessor.count; i++) {
        const u = new Float32Array(bin.buffer, bin.byteOffset + start + i * stap, 2);
        const x = u[0] * bronAtlas.breedte - 0.5;
        const y = u[1] * bronAtlas.hoogte - 0.5;
        if (Math.floor(x / CEL_BREED) !== van.kolom || Math.floor(y / CEL_HOOG) !== van.rij) {
          throw new Error(
            `${pad} gebruikt naast ${van.kleur} nog een andere baan; ` +
            'zet die er eerst bij met tools/hermap-kleur.mjs',
          );
        }
        const inBaan = Math.round(y) - Math.floor(y / CEL_HOOG) * CEL_HOOG;
        teVerzetten.push({ u, doel: naarNaamRij + (inBaan - vanNaamRij) });
      }
    }
  }
  if (teVerzetten.length === 0) throw new Error(`${pad}: geen hoekpunt gevonden`);

  const laagste = Math.min(...teVerzetten.map((v) => v.doel));
  const hoogste = Math.max(...teVerzetten.map((v) => v.doel));
  let schuif = 0;
  if (laagste < 0) schuif = -laagste;
  else if (hoogste > CEL_HOOG - 1) schuif = CEL_HOOG - 1 - hoogste;

  for (const { u, doel } of teVerzetten) {
    const inBaan = Math.min(CEL_HOOG - 1, Math.max(0, doel + schuif));
    u[0] = (naarX + 0.5) / doelAtlas.breedte;
    u[1] = (Math.floor(naar.rij * CEL_HOOG) + inBaan + 0.5) / doelAtlas.hoogte;
  }

  for (const afbeelding of json.images ?? []) {
    if (afbeelding.uri) afbeelding.uri = `Textures/${KOPIE}`;
  }

  schrijfGlb(volledig, json, bin, writeFileSync);
  hoekpunten += teVerzetten.length;
  console.log(
    `${pad}: ${teVerzetten.length} hoekpunten ${van.kleur} → ${naar.kleur} op de gedeelde atlas` +
    (schuif ? ` (${schuif > 0 ? '+' : ''}${schuif} rijen opgeschoven)` : ''),
  );
}

console.log(`${hoekpunten} hoekpunten verzet; draai nu tools/build-catalog.mjs`);
