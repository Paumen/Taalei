/**
 * Zet de gekozen modellen van KayKit's Dungeon Asset Pack om naar kits/dungeon.
 *
 * Draai vanuit de repo-root:  node tools/importeer-dungeon.mjs <map-met-gltf>
 *
 * De bronbestanden staan niet in de repo — alleen het resultaat. De gratis
 * pack 1.1 levert .fbx, dus gaat er net als bij props een omzetstap aan vooraf:
 *
 *     FBX2glTF -i <naam>.fbx -o <naam> -b --pbr-metallic-roughness
 *
 *   (FBX2glTF 0.9.7, npm-pakket `fbx2gltf`.)
 *
 * Een map met .gltf + .bin werkt ook; leesBron() pakt wat er ligt. De eerdere
 * import kwam uit zo'n map.
 *
 * Namen zijn al gewone Engelse woorden met underscores (`barrel_large`),
 * 1-op-1 overgezet naar kebab-case. `barrier_colum_half` is een tikfout van
 * de pack zelf (`colum` i.p.v. `column`) en is bewust ongewijzigd overgezet —
 * dat is de naam die gevraagd is.
 *
 * Eén schaalfactor voor de hele pack (stijlgids §4), zie SCHAAL hieronder.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb, meetScene, zetOpOorsprong, compacteer, ontvlecht } from './glb.mjs';
import { leesPng } from './png.mjs';
import {
  doelPunten, baanTabel, hermapUv, toetsDriehoeken, toetsNaden, kopieerColormap, naarHex,
} from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS = join(ROOT, 'kits');
const DOEL = join(KITS, 'dungeon');
const COLORMAP = join(KITS, 'colormap.png');

/**
 * Eén factor voor de hele pack (stijlgids §4): 0,35.
 *
 * De geschiedenis in drie stappen. Een eerste versie gaf de meubels factor
 * 1, waardoor een stoel (1,227) boven de muur uitstak. Daarna kreeg alles
 * 0,25, met "wandhoogte = 1 eenheid" als ijkpunt — maar dan zijn de meubels
 * poppenhuisklein naast de rest van de collectie (kist 0,33 tegenover de
 * kistencluster 0,45-0,51 van vier andere kits). Op 0,35 kloppen de
 * voorwerpen (kist 0,46, stoel 0,43, bed 1,05 lang) en is het rasterijkpunt
 * bewust losgelaten (besluit PO, zie docs/asset_size_review.md): de wanden
 * en vloeren meten 1,4 × 1,4 en verkavelen op hun eigen 1,4-module — de
 * dungeon sluit niet meer 1-op-1 aan op wanden van andere kits.
 */
const SCHAAL = 0.35;

/** Bronbestand (zonder .gltf) → naam in de kit: underscore → kebab-case. */
const BRONNEN = [
  'barrel_large', 'barrel_large_decorated', 'barrel_small', 'barrel_small_stack',
  'bed_decorated', 'bed_floor', 'bed_frame',
  'bottle_A_brown', 'bottle_A_labeled_brown', 'bottle_B_brown', 'bottle_C_brown',
  'box_large', 'box_small', 'box_small_decorated', 'box_stacked',
  'candle', 'candle_lit', 'candle_melted', 'candle_thin', 'candle_thin_lit', 'candle_triple',
  'ceiling_tile', 'chair', 'chest', 'chest_gold',
  'coin', 'coin_stack_large', 'coin_stack_medium', 'coin_stack_small',
  'column', 'crates_stacked',
  'floor_dirt_large', 'floor_dirt_large_rocky', 'floor_dirt_small_A', 'floor_dirt_small_B',
  'floor_dirt_small_C', 'floor_dirt_small_D', 'floor_dirt_small_corner', 'floor_dirt_small_weeds',
  'floor_foundation_allsides', 'floor_foundation_corner', 'floor_foundation_diagonal_corner',
  'floor_foundation_front', 'floor_foundation_front_and_back', 'floor_foundation_front_and_sides',
  'floor_tile_big_grate', 'floor_tile_big_grate_open', 'floor_tile_big_spikes',
  'floor_tile_extralarge_grates', 'floor_tile_extralarge_grates_open',
  'floor_tile_grate', 'floor_tile_grate_open', 'floor_tile_large', 'floor_tile_large_rocks',
  'floor_tile_small', 'floor_tile_small_broken_A', 'floor_tile_small_broken_B',
  'floor_tile_small_corner', 'floor_tile_small_decorated',
  'floor_tile_small_weeds_A', 'floor_tile_small_weeds_B',
  'floor_wood_large', 'floor_wood_large_dark', 'floor_wood_small', 'floor_wood_small_dark',
  'keg', 'keg_decorated', 'key', 'keyring', 'keyring_hanging',
  'pillar', 'plate', 'plate_food_A', 'plate_food_B', 'plate_small',
  'rubble_half', 'rubble_large',
  'shelf_large', 'shelf_small', 'shelf_small_candles', 'shelves',
  'stairs', 'stairs_long', 'stairs_narrow', 'stairs_wall_left', 'stairs_wall_right',
  'stairs_walled', 'stairs_wide', 'stairs_wood', 'stairs_wood_decorated',
  'stool',
  'table_long', 'table_long_broken', 'table_long_decorated_A', 'table_long_decorated_C',
  'table_medium', 'table_medium_broken', 'table_medium_decorated_A',
  'table_small', 'table_small_decorated_A', 'table_small_decorated_B',
  'torch', 'torch_lit', 'torch_mounted',
  'trunk_large_C', 'trunk_small_C',
  'wall', 'wall_Tsplit', 'wall_Tsplit_sloped', 'wall_arched', 'wall_archedwindow_gated',
  'wall_archedwindow_gated_scaffold', 'wall_archedwindow_open', 'wall_broken', 'wall_corner',
  'wall_corner_gated', 'wall_corner_scaffold', 'wall_corner_small', 'wall_cracked', 'wall_crossing',
  'wall_doorway', 'wall_doorway_Tsplit', 'wall_doorway_scaffold', 'wall_doorway_sides',
  'wall_endcap', 'wall_gated', 'wall_half', 'wall_half_endcap', 'wall_half_endcap_sloped',
  'wall_open_scaffold', 'wall_pillar', 'wall_scaffold', 'wall_shelves', 'wall_sloped',
  'wall_window_closed', 'wall_window_closed_scaffold', 'wall_window_open', 'wall_window_open_scaffold',
];
/**
 * Modellen die de pack wél levert maar die de kit niet voert. Ze staan hier in
 * plaats van in BRONNEN, zodat het lijstje blijft laten zien wat er in de pack
 * zit én een herimport ze niet elke keer terugzet.
 *
 * De drie dichte roostertegels zijn eruit gehaald na de maatreview: van elk
 * rooster houdt de kit de open variant, die de dichte als vorm al bevat.
 */
const WEGGELATEN = new Set([
  'floor_tile_big_grate', 'floor_tile_extralarge_grates', 'floor_tile_grate',
]);

const NAMEN = Object.fromEntries(
  BRONNEN.filter((b) => !WEGGELATEN.has(b)).map((b) => [b, b.toLowerCase().replace(/_/g, '-')]),
);

/** De textuur die de pack meelevert; gaat niet mee de repo in. */
const BRON_TEXTUUR = 'dungeon_texture.png';

const bronMap = process.argv[2];
if (!bronMap) {
  console.error('gebruik: node tools/importeer-dungeon.mjs <map-met-gltf-en-bin>');
  process.exit(1);
}

/** Leest het bronmodel: .glb als het er ligt, anders .gltf naast zijn .bin. */
function leesBron(naam) {
  const glb = join(bronMap, `${naam}.glb`);
  if (existsSync(glb)) return leesGlb(glb);

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
const tabel = baanTabel(bronAtlas, punten, Object.keys(NAMEN).map(leesBron));

const perKleur = new Map();
const perCel = new Map(); // 'kolom,rij' → Set(modelnaam), voor kits/palet.json

for (const [bron, naam] of Object.entries(NAMEN)) {
  let ruw = leesBron(bron);
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
    generator: 'tools/importeer-dungeon.mjs',
    version: '2.0',
    extras: {
      taaleiland: { versie: 1, schaal: SCHAAL, tangenten: 'gestript', palet: 1, bron: 'KayKit Dungeon Asset Pack' },
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
  console.log(`${bron.padEnd(34)} → ${naam.padEnd(34)} [${SCHAAL}] ${maat(voor)} → ${maat(na)}  ${String(na.driehoeken).padStart(4)} tri  ${omgezet.size} kleur(en)`);

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
 * catalogus een kleur die het niet meer heeft. Zonder deze stap groeide de lijst
 * alleen maar aan: ook modellen die de kit niet meer voert bleven vermeld. */
for (const cel of gedeeld.cellen) {
  cel.bronnen = cel.bronnen.filter((b) => b.kit !== 'dungeon');
}

for (const [celSleutel, modellenSet] of perCel) {
  const [kolom, rij] = celSleutel.split(',').map(Number);
  let cel = gedeeld.cellen.find((c) => c.cel[0] === kolom && c.cel[1] === rij);
  if (!cel) {
    /* Een cel die tools/verf.mjs erbij heeft geschilderd: palet.json kende hem
     * nog niet. De kleur lezen we uit het midden van die cel in de colormap. */
    const celBreed = doelAtlas.breedte / 16;
    const celHoog = doelAtlas.hoogte / 4;
    const x = Math.floor(kolom * celBreed + celBreed / 2);
    const y = Math.floor(rij * celHoog + celHoog / 2);
    const i = (y * doelAtlas.breedte + x) * 4;
    cel = {
      cel: [kolom, rij],
      kleur: naarHex(doelAtlas.pixels[i], doelAtlas.pixels[i + 1], doelAtlas.pixels[i + 2]),
      bronnen: [],
    };
    gedeeld.cellen.push(cel);
  }
  let bron = cel.bronnen.find((b) => b.kit === 'dungeon');
  if (!bron) {
    bron = { kit: 'dungeon', modellen: [] };
    cel.bronnen.push(bron);
  }
  bron.modellen = [...new Set([...bron.modellen, ...modellenSet])].sort();
}

/* Vaste volgorde op kitnaam. Deze kit is hierboven weggehaald en opnieuw
 * achteraan gezet; zonder sorteren levert dezelfde import twee keer draaien
 * een ander bestand op, en verdrinkt een echte wijziging in het diff. */
for (const cel of gedeeld.cellen) {
  cel.bronnen.sort((a, b) => (a.kit < b.kit ? -1 : a.kit > b.kit ? 1 : 0));
}

writeFileSync(paletPad, `${JSON.stringify(paletJson, null, 1)}\n`);
console.log('kits/palet.json bijgewerkt met dungeon-bronnen');

console.log(`${Object.keys(NAMEN).length} modellen → kits/dungeon/`);
