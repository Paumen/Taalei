/**
 * Haalt modellen van de eigen texture-atlas van hun kit naar de gedeelde
 * kits/colormap.png, zodat ze kleuren met de rest van de collectie.
 *
 * Draai vanuit de repo-root:
 *
 *     node tools/naar-gedeelde-atlas.mjs <van-hex> <naar-hex> <model.glb...>
 *     node tools/naar-gedeelde-atlas.mjs '#ba7554' '#8f785b' kits/modular-cave-kit/ladder.glb
 *
 * `van-hex` is een baan uit het eigen palet van die kit, `naar-hex` een baan uit
 * het gedeelde palet. Beide atlassen hebben hetzelfde raster van 16 × 4 banen,
 * dus de rij bínnen de baan — het gebakken schaduwverloop — verhuist mee zoals
 * bij tools/hermap-kleur.mjs: gemeten vanaf de naamrij, en past het model niet,
 * dan schuift het als geheel op in plaats van af te kappen.
 *
 * Naast de UV's verandert de textuurverwijzing in de .glb. De eigen sheet van de
 * kit blijft staan — daar hangen de modellen aan die buiten de catalogus vallen
 * maar wel in de repo — dus de gedeelde sheet komt ernaast te staan onder een
 * eigen naam, en de kit wordt aangemeld bij kopieerColormap() zodat die kopie
 * met de bron mee blijft lopen.
 *
 * kits/palet.json wordt bijgewerkt; draai daarna tools/build-catalog.mjs en
 * tools/toets-palet.mjs.
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb } from './glb.mjs';
import { leesPng, KOLOMMEN, RIJEN, naarHex, kleurAfstand } from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PALET = join(ROOT, 'kits', 'palet.json');
const GEDEELD = join(ROOT, 'kits', 'colormap.png');
/** Onder deze naam komt de gedeelde sheet naast de eigen sheet van de kit te staan. */
const KOPIE = 'colormap-gedeeld.png';

const [vanHex, naarHexArg, ...modellen] = process.argv.slice(2);
if (!vanHex || !naarHexArg || modellen.length === 0) {
  console.error('gebruik: node tools/naar-gedeelde-atlas.mjs <van-hex> <naar-hex> <model.glb...>');
  process.exit(1);
}

const paletJson = JSON.parse(readFileSync(PALET, 'utf8'));
const gedeeldPalet = paletJson.paletten.find((p) => p.id === 'gedeeld');

const kits = [...new Set(modellen.map((m) => basename(dirname(resolve(ROOT, m)))))];
if (kits.length !== 1) throw new Error(`doe één kit per aanroep (${kits.join(', ')})`);
const [kit] = kits;

const eigenPalet = paletJson.paletten.find(
  (p) => p.id !== 'gedeeld' && p.cellen.some((c) => c.bronnen.some((b) => b.kit === kit)),
);
if (!eigenPalet) throw new Error(`${kit} heeft geen eigen palet; gebruik tools/hermap-kleur.mjs`);

const bronAtlas = leesPng(join(ROOT, eigenPalet.atlas));
const doelAtlas = leesPng(GEDEELD);
for (const [naam, a] of [['eigen', bronAtlas], ['gedeelde', doelAtlas]]) {
  if (a.breedte / KOLOMMEN !== doelAtlas.breedte / KOLOMMEN || a.hoogte / RIJEN !== doelAtlas.hoogte / RIJEN) {
    throw new Error(`de ${naam} atlas heeft een ander raster dan de gedeelde`);
  }
}
const CEL_BREED = doelAtlas.breedte / KOLOMMEN;
const CEL_HOOG = doelAtlas.hoogte / RIJEN;

/** De rij in een baan die het dichtst bij de naamkleur van die cel ligt. */
const hexNaarRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function naamRij(atlas, cel, hex) {
  const x = Math.floor(cel[0] * CEL_BREED + CEL_BREED / 2);
  const doel = hexNaarRgb(hex);
  let beste = 0;
  let afstand = Infinity;
  for (let i = 0; i < CEL_HOOG; i++) {
    const p = ((Math.floor(cel[1] * CEL_HOOG) + i) * atlas.breedte + x) * 4;
    const d = kleurAfstand([atlas.pixels[p], atlas.pixels[p + 1], atlas.pixels[p + 2]], doel);
    if (d < afstand) { afstand = d; beste = i; }
  }
  if (afstand > 40) throw new Error(`${hex} ligt te ver van baan [${cel}] om te durven verzetten`);
  return beste;
}

const zoek = (palet, hex) => {
  const cel = palet.cellen.find((c) => c.kleur.toLowerCase() === hex.toLowerCase());
  if (!cel) throw new Error(`${hex} staat niet in palet "${palet.id}"`);
  return cel;
};
const vanCel = zoek(eigenPalet, vanHex);
const naarCel = zoek(gedeeldPalet, naarHexArg);
const vanNaamRij = naamRij(bronAtlas, vanCel.cel, vanCel.kleur);
const naarNaamRij = naamRij(doelAtlas, naarCel.cel, naarCel.kleur);
const naarX = Math.floor(naarCel.cel[0] * CEL_BREED + CEL_BREED / 2);

/* De gedeelde sheet naast de eigen sheet zetten. */
const texturenMap = join(ROOT, 'kits', kit, 'Textures');
mkdirSync(texturenMap, { recursive: true });
copyFileSync(GEDEELD, join(texturenMap, KOPIE));
console.log(`kits/${kit}/Textures/${KOPIE} bijgewerkt vanaf kits/colormap.png`);

const namen = new Set();
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
        if (Math.floor(x / CEL_BREED) !== vanCel.cel[0] || Math.floor(y / CEL_HOOG) !== vanCel.cel[1]) {
          throw new Error(
            `${pad} gebruikt naast ${vanCel.kleur} nog een andere baan; ` +
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
    u[1] = (Math.floor(naarCel.cel[1] * CEL_HOOG) + inBaan + 0.5) / doelAtlas.hoogte;
  }

  for (const afbeelding of json.images ?? []) {
    if (afbeelding.uri) afbeelding.uri = `Textures/${KOPIE}`;
  }

  schrijfGlb(volledig, json, bin, writeFileSync);
  namen.add(basename(volledig, '.glb'));
  hoekpunten += teVerzetten.length;
  console.log(
    `${pad}: ${teVerzetten.length} hoekpunten ${vanCel.kleur} → ${naarCel.kleur} op de gedeelde atlas` +
    (schuif ? ` (${schuif > 0 ? '+' : ''}${schuif} rijen opgeschoven)` : ''),
  );
}

/* -- kits/palet.json bijwerken --------------------------------------------- */

const vanBron = vanCel.bronnen.find((b) => b.kit === kit);
if (vanBron) {
  vanBron.modellen = vanBron.modellen.filter((n) => !namen.has(n));
  if (vanBron.modellen.length === 0) vanCel.bronnen.splice(vanCel.bronnen.indexOf(vanBron), 1);
}
eigenPalet.cellen = eigenPalet.cellen.filter((c) => c.bronnen.length > 0);
if (eigenPalet.cellen.length === 0) {
  paletJson.paletten.splice(paletJson.paletten.indexOf(eigenPalet), 1);
  console.log(`palet "${eigenPalet.id}" is leeg en uit kits/palet.json gehaald`);
}

let naarBron = naarCel.bronnen.find((b) => b.kit === kit);
if (!naarBron) {
  naarBron = { kit, modellen: [] };
  naarCel.bronnen.push(naarBron);
  naarCel.bronnen.sort((a, b) => a.kit.localeCompare(b.kit));
}
naarBron.modellen = [...new Set([...naarBron.modellen, ...namen])].sort();

writeFileSync(PALET, `${JSON.stringify(paletJson, null, 1)}\n`);
console.log(`${hoekpunten} hoekpunten verzet; draai nu tools/build-catalog.mjs`);
