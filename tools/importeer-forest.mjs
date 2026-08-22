/**
 * Zet de gekozen modellen van KayKit's Forest Nature Pack om naar kits/forest.
 *
 * Draai vanuit de repo-root:  node tools/importeer-forest.mjs <map-met-gltf>
 *
 * De bronbestanden staan niet in de repo — alleen het resultaat. Net als
 * rpgtools levert deze pack al .gltf + .bin per model, dus is er geen
 * FBX2glTF-stap nodig.
 *
 * Grass_1/Grass_2 en Rock_1/Rock_2/Rock_3 zijn drie eigen vormfamilies, geen
 * maten van dezelfde vorm — anders dan bij rocks (waar rock1..10 tien maten
 * van dezelfde `.natural`-vorm waren) is het cijfer hier dus niet weggelaten
 * maar meegenomen in de naam. Binnen elke familie loopt de letter van klein
 * naar groot, zoals de pack ze zelf aanlevert.
 *
 * De pack noemt zijn bestanden met underscores en een `_Color1`-achtervoegsel
 * (de enige ingeladen kleurvariant — er is maar één textuur, `_Color1` is
 * gewoon hoe de pack "de geverfde versie" noemt). De repo is overal
 * kebab-case; zie tools/importeer-rpgtools.mjs voor waarom dat nodig is
 * (woordgrens `\b` na een `-`, niet na een `_`).
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb, meetScene, zetOpOorsprong, compacteer, ontvlecht } from './glb.mjs';
import { leesPng } from './png.mjs';
import { doelPunten, hermapUv, toetsDriehoeken, kopieerColormap } from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS = join(ROOT, 'kits');
const DOEL = join(KITS, 'forest');
const COLORMAP = join(KITS, 'colormap.png');

/**
 * De pack gaat op 0,5 het raster van de repo op. Een eerste import nam 1 aan,
 * maar vergeleek daarvoor de verkeerde maten (grashoogte tegen grasbreedte
 * van de survival-kit). Op hoogte vergeleken is alles het dubbele van
 * dezelfde voorwerpen elders (zie docs/asset_size_review.md): gras 0,54-0,94
 * tegenover 0,13-0,31 bij pirate-, platformer- en survival-kit, de grootste
 * losse rots 3,9 hoog tegenover 1,2-2,1 bij pirate-kit en modulair-terrein.
 * Op 0,5 valt het op zijn plek: gras 0,27-0,47 naast de grasplukken van
 * modulair-terrein (0,30-0,67), rotsen tot 1,9 naast cliff-prop-rock-b
 * (2,1), en de kale bomen 1,4-3,8 naast nature/tree-dead (1,7) en de eiken
 * van modulair-terrein (4,7).
 */
const SCHAAL = 0.5;

const letters = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));

/** Bronbestand (zonder `_Color1.gltf`) → naam in de kit. */
const NAMEN = {};
for (const [bron, aantal] of [['Grass_1', 4], ['Grass_2', 4]]) {
  for (const letter of letters(aantal)) NAMEN[`${bron}_${letter}_Color1`] = `grass-${bron.slice(-1)}-${letter.toLowerCase()}`;
}
for (const [bron, aantal] of [['Rock_1', 17], ['Rock_2', 8], ['Rock_3', 18]]) {
  for (const letter of letters(aantal)) NAMEN[`${bron}_${letter}_Color1`] = `rock-${bron.slice(-1)}-${letter.toLowerCase()}`;
}
for (const [bron, aantal] of [['Tree_Bare_1', 3], ['Tree_Bare_2', 3]]) {
  for (const letter of letters(aantal)) NAMEN[`${bron}_${letter}_Color1`] = `tree-bare-${bron.slice(-1)}-${letter.toLowerCase()}`;
}

/** De textuur die de pack meelevert; gaat niet mee de repo in. */
const BRON_TEXTUUR = 'forest_texture.png';

const bronMap = process.argv[2];
if (!bronMap) {
  console.error('gebruik: node tools/importeer-forest.mjs <map-met-gltf-en-bin>');
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

const perKleur = new Map();

for (const [bron, naam] of Object.entries(NAMEN)) {
  let ruw = leesGltf(bron);
  const meshIndexen = ruw.json.meshes.map((_, i) => i);
  ruw = ontvlecht(ruw, meshIndexen);

  const { omgezet, ergsteAfstand, gesnapt } = hermapUv(ruw, bronAtlas, punten, meshIndexen);
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
    generator: 'tools/importeer-forest.mjs',
    version: '2.0',
    extras: {
      taaleiland: { versie: 1, schaal: SCHAAL, tangenten: 'gestript', palet: 1, bron: 'KayKit Forest Nature Pack' },
    },
  };

  const voor = zetOpOorsprong(glb, naam, SCHAAL);
  const verdacht = toetsDriehoeken(glb, glb.json.meshes.map((_, i) => i), doelAtlas);

  const pad = join(DOEL, `${naam}.glb`);
  schrijfGlb(pad, glb.json, glb.bin, writeFileSync);

  const na = meetScene(leesGlb(pad));
  const maat = (m) => m.wdh.map((v) => v.toFixed(2).padStart(5)).join(' × ');
  console.log(`${bron.padEnd(24)} → ${naam.padEnd(14)} ${maat(voor)} → ${maat(na)}  ${String(na.driehoeken).padStart(4)} tri  ${omgezet.size} kleur(en)`);

  for (const [van, k] of omgezet) {
    if (!perKleur.has(van)) perKleur.set(van, { naar: k.naar, cel: k.cel, afstand: k.afstand, modellen: [] });
    perKleur.get(van).modellen.push(naam);

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
  console.log(`${van} → ${k.naar} cel [${k.cel}] afstand ${String(k.afstand.toFixed(0)).padStart(3)} — ${k.modellen.length} modellen`);
}

/* Elke kit wijst met een relatief pad naar zijn eigen kopie van de atlas, dus
 * een eventuele nieuwe cel moet overal terechtkomen. */
const bijgewerkt = kopieerColormap(KITS);
console.log(`colormap gekopieerd naar: ${bijgewerkt.join(', ')}`);

console.log(`${Object.keys(NAMEN).length} modellen → kits/forest/`);
