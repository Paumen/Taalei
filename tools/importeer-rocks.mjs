/**
 * Zet de gekozen modellen van de Rocks-pack om naar kits/rocks.
 *
 * Draai vanuit de repo-root:  node tools/importeer-rocks.mjs <map-met-glb>
 *
 * De bronbestanden (.fbx en .blend) staan niet in de repo — alleen het
 * resultaat.
 *
 * Stap 1 — .fbx → .glb:
 *
 *     FBX2glTF -i rocks.fbx -o rocks -b --pbr-metallic-roughness
 *
 *   (FBX2glTF 0.9.7, npm-pakket `fbx2gltf`.) Anders dan de andere packs is dit
 *   één bestand met 117 meshes naast elkaar, niet een bestand per model.
 *
 * Stap 2 — dit script: uitsnijden, schaal, oorsprong, namen en kleur.
 *
 * De pack levert elk model in drie tinten — `.light`, `.medium` en `.dark` —
 * met telkens dezelfde geometrie en alleen andere UV's. Alleen de `.medium`
 * tinten zijn ingeladen; de andere twee zouden dezelfde vorm nog twee keer in
 * de catalogus zetten.
 *
 * Wat er wél twee keer in zit is het paar `.natural`/`.cave` (en bij de
 * kiezels `.dirt`/`.caves`). Ook dat is dezelfde geometrie met andere UV's,
 * maar dáár verschilt de kleur wezenlijk: grijs steen tegenover donker
 * grotgesteente tegenover bruine grond. Na het hermappen komen ze op drie
 * verschillende cellen uit, dus het blijven drie herkenbare varianten.
 */

import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb, meetScene, zetOpOorsprong, compacteer } from './glb.mjs';
import { leesPng } from './png.mjs';
import { doelPunten, hermapUv, toetsDriehoeken } from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOEL = join(ROOT, 'kits', 'rocks');
const COLORMAP = join(ROOT, 'kits', 'colormap.png');

/**
 * De pack staat op twee keer het raster van de andere kits. De losse rotsen
 * zijn het ijkpunt: `rock1` is er 3,01 units breed en de rotsen van
 * fantasy-town liggen tussen 1,00 en 1,67. Gehalveerd komen de tien rotsen op
 * 1,15 tot 1,75 uit, precies het bereik dat de repo al heeft, en de kiezels op
 * ongeveer één rastereenheid.
 *
 * Eén factor voor de hele pack (stijlgids §4). De `rockform`-stukken blijven
 * daarmee groot — 6 tot 21 units — maar dat zíjn ze ook: rotsformaties om een
 * gebied mee af te bakenen, geen props om neer te zetten.
 */
const SCHAAL = 0.5;

/**
 * Mesh in het bronbestand → naam in de kit.
 *
 * De pack scheidt met punten en nummert door; de kits hier zijn kebab-case met
 * letterachtervoegsels. De `.medium` valt weg omdat het de enige ingeladen tint
 * is, en `caves` wordt `cave` zodat de kiezels en de rotsen dezelfde variant
 * hetzelfde noemen.
 */
const NAMEN = {
  'debris1.medium': 'debris-a',
  'debris2.medium': 'debris-b',

  'pebbles1.dirt.medium': 'pebbles-dirt-a',
  'pebbles2.dirt.medium': 'pebbles-dirt-b',
  'pebbles3.dirt.medium': 'pebbles-dirt-c',
  'pebbles4.dirt.medium': 'pebbles-dirt-d',

  'rock1.natural.medium': 'rock-natural-a',
  'rock2.natural.medium': 'rock-natural-b',
  'rock3.natural.medium': 'rock-natural-c',
  'rock4.natural.medium': 'rock-natural-d',
  'rock5.natural.medium': 'rock-natural-e',
  'rock6.natural.medium': 'rock-natural-f',
  'rock7.natural.medium': 'rock-natural-g',
  'rock8.natural.medium': 'rock-natural-h',
  'rock9.natural.medium': 'rock-natural-i',
  'rock10.natural.medium': 'rock-natural-j',

  'rockform.arch.medium': 'rockform-arch',
  'rockform.column.medium': 'rockform-column',
  'rockform.corner.hard.medium': 'rockform-corner-hard',
  'rockform.corner.soft.medium': 'rockform-corner-soft',
  'rockform.wall.long.medium': 'rockform-wall-long',
  'rockform.wall.short1.medium': 'rockform-wall-short-a',
  'rockform.wall.short2.medium': 'rockform-wall-short-b',

  'rockwall.corner.medium': 'rockwall-corner',
  'rockwall.straight.medium': 'rockwall-straight',
};

/** Het bestand en de atlas die de pack meelevert; gaan niet mee de repo in. */
const BRON_GLB = 'rocks.glb';
const BRON_ATLAS = 'color_atlas.png';

const bronMap = process.argv[2];
if (!bronMap) {
  console.error('gebruik: node tools/importeer-rocks.mjs <map-met-rocks.glb-en-color_atlas.png>');
  process.exit(1);
}

const bronAtlas = leesPng(join(bronMap, BRON_ATLAS));
const doelAtlas = leesPng(COLORMAP);
const punten = doelPunten(doelAtlas);

mkdirSync(join(DOEL, 'Textures'), { recursive: true });
copyFileSync(COLORMAP, join(DOEL, 'Textures', 'colormap.png'));

const bronGlb = leesGlb(join(bronMap, BRON_GLB));
const meshNamen = bronGlb.json.meshes.map((m) => m.name);
const ontbreekt = Object.keys(NAMEN).filter((n) => !meshNamen.includes(n));
if (ontbreekt.length) throw new Error(`niet gevonden in ${BRON_GLB}: ${ontbreekt.join(', ')}`);

const perKleur = new Map();

for (const [bron, naam] of Object.entries(NAMEN)) {
  // Elk model opnieuw inlezen: hermapUv schrijft in de buffer, en die is hier
  // voor alle 117 meshes gedeeld.
  const ruw = leesGlb(join(bronMap, BRON_GLB));
  const mi = ruw.json.meshes.findIndex((m) => m.name === bron);

  const { omgezet, ergsteAfstand, gesnapt } = hermapUv(ruw, bronAtlas, punten, [mi]);
  const glb = compacteer(ruw, [mi]);

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
    generator: 'tools/importeer-rocks.mjs',
    version: '2.0',
    extras: {
      taaleiland: { versie: 1, schaal: SCHAAL, tangenten: 'gestript', palet: 1, bron: 'Rocks' },
    },
  };

  const voor = zetOpOorsprong(glb, naam, SCHAAL);
  const verdacht = toetsDriehoeken(glb, [0], doelAtlas);

  const pad = join(DOEL, `${naam}.glb`);
  schrijfGlb(pad, glb.json, glb.bin, writeFileSync);

  const na = meetScene(leesGlb(pad));
  const maat = (m) => m.wdh.map((v) => v.toFixed(2).padStart(6)).join(' × ');
  const kleuren = [...omgezet].map(([van, k]) => `${van}→${k.naar} [${k.cel}] ${k.afstand.toFixed(0)}`);
  console.log(`${bron.padEnd(29)} → ${naam.padEnd(22)} ${maat(voor)} → ${maat(na)}  ${String(na.driehoeken).padStart(4)} tri  ${kleuren.join(', ')}`);

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
for (const [van, k] of perKleur) {
  console.log(`${van} → ${k.naar} cel [${k.cel}] afstand ${k.afstand.toFixed(0)} — ${k.modellen.length} modellen`);
}
console.log(`${Object.keys(NAMEN).length} modellen → kits/rocks/`);
