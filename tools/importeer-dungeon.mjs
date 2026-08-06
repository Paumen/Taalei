/**
 * Zet de gekozen modellen van KayKit's Dungeon Asset Pack om naar kits/dungeon.
 *
 * Draai vanuit de repo-root:  node tools/importeer-dungeon.mjs <map-met-gltf>
 *
 * De bronbestanden staan niet in de repo — alleen het resultaat. Net als
 * rpgtools, forest en resources levert deze pack al .gltf + .bin per model,
 * dus is er geen FBX2glTF-stap nodig.
 *
 * Namen zijn al gewone Engelse woorden met underscores (`barrel_large`),
 * 1-op-1 overgezet naar kebab-case. `barrier_colum_half` is een tikfout van
 * de pack zelf (`colum` i.p.v. `column`) en is bewust ongewijzigd overgezet —
 * dat is de naam die gevraagd is.
 *
 * Twee schaalfamilies in één pack, zie SCHAAL_GROOT/SCHAAL_KLEIN hieronder.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb, meetScene, zetOpOorsprong, compacteer } from './glb.mjs';
import { leesPng } from './png.mjs';
import { doelPunten, hermapUv, toetsDriehoeken, kopieerColormap } from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS = join(ROOT, 'kits');
const DOEL = join(KITS, 'dungeon');
const COLORMAP = join(KITS, 'colormap.png');

/**
 * Deze pack draagt twee schaalfamilies naast elkaar, niet één zoals de
 * andere KayKit-packs in deze catalogus:
 *
 * - de wanden, vloeren, het plafondtegel, de barrières, de pilaar, het puin
 *   en de zuil staan op een eigen bouwraster: elke wand is 4 breed × 4 hoog,
 *   elke vloertegel 4 × 4 of 2 × 2, precies zoals `ceiling_tile` (4 × 4) en
 *   `barrier` (4 breed) daar weer op aansluiten. Op 0,25 komt de wand op
 *   1 breed × 1 hoog uit — mini-dungeon's eigen wand is 1 × 1 × 1,1.
 * - de rest (meubels, containers, gereedschap, decor) staat niet op dat
 *   raster: geen van hun maten is een veelvoud van het rastergetal, en ze
 *   kloppen al tegen wat er staat — chair (0,75 × 0,75 × 1,227) is een
 *   geloofwaardige stoel, key (0,896 × 0,142 × 0,403) ligt vlak naast
 *   mini-dungeon's eigen key (0,591 × 0,157 × 0,356), coin (0,36 × 0,36 ×
 *   0,125) naast mini-dungeon's coin (0,415 × 0,167 × 0,417).
 *
 * Eén uitzondering die er niet is: `chest`/`chest_gold` (1,7 × 1,45 × 1,3)
 * is groter dan elke bestaande "chest" in de catalogus (0,2-0,55), maar
 * intern consistent met de rest van deze pack: tafel, stoel en kruk kloppen
 * allemaal tegen bestaande maten — dus geen apart geval, gewoon een grotere
 * kist dan Kenney's eigen ontwerp.
 */
const SCHAAL_GROOT = 0.25;
const SCHAAL_KLEIN = 1;

/**
 * Modellen op het bouwraster; alles wat hier niet in staat krijgt SCHAAL_KLEIN.
 *
 * `column` staat hier bewust niet in: die is met 0,7 × 0,7 × 1,4 geen
 * veelvoud van het rastergetal en klopt al tegen mini-dungeon's eigen column
 * (0,5 × 0,5 × 1,1) — een kleine sokkel, geen structurele pilaar zoals
 * `pillar` (die wél de volledige wandhoogte van 4 heeft). Groepering is een
 * apart verhaal: tools/semantiek.mjs zet `column` samen met `pillar` in het
 * bouwpakket, net als bij mini-dungeon.
 */
const GROOT = new Set([
  'barrier', 'barrier_colum_half', 'barrier_column', 'barrier_corner', 'barrier_half',
  'ceiling_tile', 'pillar', 'rubble_half', 'rubble_large',
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
  'wall', 'wall_Tsplit', 'wall_Tsplit_sloped', 'wall_arched', 'wall_archedwindow_gated',
  'wall_archedwindow_gated_scaffold', 'wall_archedwindow_open', 'wall_broken', 'wall_corner',
  'wall_corner_gated', 'wall_corner_scaffold', 'wall_corner_small', 'wall_cracked', 'wall_crossing',
  'wall_doorway', 'wall_doorway_Tsplit', 'wall_doorway_scaffold', 'wall_doorway_sides',
  'wall_endcap', 'wall_gated', 'wall_half', 'wall_half_endcap', 'wall_half_endcap_sloped',
  'wall_open_scaffold', 'wall_pillar', 'wall_scaffold', 'wall_shelves', 'wall_sloped',
  'wall_window_closed', 'wall_window_closed_scaffold', 'wall_window_open', 'wall_window_open_scaffold',
  // De trappen staan óók op het bouwraster (hoogte 4-5,1, breedte 4-8), maar
  // gaan qua groep naar "verbinding" — zie tools/semantiek.mjs — net als de
  // trappen van fantasy-town, die ook niet in het bouwpakket zitten.
  'stairs', 'stairs_long', 'stairs_narrow', 'stairs_wall_left', 'stairs_wall_right',
  'stairs_walled', 'stairs_wide', 'stairs_wood', 'stairs_wood_decorated',
]);

/** Bronbestand (zonder .gltf) → naam in de kit: underscore → kebab-case. */
const BRONNEN = [
  'barrel_large', 'barrel_large_decorated', 'barrel_small', 'barrel_small_stack',
  'barrier', 'barrier_colum_half', 'barrier_column', 'barrier_corner', 'barrier_half',
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
const NAMEN = Object.fromEntries(BRONNEN.map((b) => [b, b.toLowerCase().replace(/_/g, '-')]));

/** De textuur die de pack meelevert; gaat niet mee de repo in. */
const BRON_TEXTUUR = 'dungeon_texture.png';

const bronMap = process.argv[2];
if (!bronMap) {
  console.error('gebruik: node tools/importeer-dungeon.mjs <map-met-gltf-en-bin>');
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
const perCel = new Map(); // 'kolom,rij' → Set(modelnaam), voor kits/palet.json

for (const [bron, naam] of Object.entries(NAMEN)) {
  const schaal = GROOT.has(bron) ? SCHAAL_GROOT : SCHAAL_KLEIN;
  const ruw = leesGltf(bron);
  const meshIndexen = ruw.json.meshes.map((_, i) => i);

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
    generator: 'tools/importeer-dungeon.mjs',
    version: '2.0',
    extras: {
      taaleiland: { versie: 1, schaal, tangenten: 'gestript', palet: 1, bron: 'KayKit Dungeon Asset Pack' },
    },
  };

  const voor = zetOpOorsprong(glb, naam, schaal);
  const verdacht = toetsDriehoeken(glb, glb.json.meshes.map((_, i) => i), doelAtlas);

  const pad = join(DOEL, `${naam}.glb`);
  schrijfGlb(pad, glb.json, glb.bin, writeFileSync);

  const na = meetScene(leesGlb(pad));
  const maat = (m) => m.wdh.map((v) => v.toFixed(2).padStart(5)).join(' × ');
  console.log(`${bron.padEnd(34)} → ${naam.padEnd(34)} [${schaal}] ${maat(voor)} → ${maat(na)}  ${String(na.driehoeken).padStart(4)} tri  ${omgezet.size} kleur(en)`);

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

for (const [celSleutel, modellenSet] of perCel) {
  const [kolom, rij] = celSleutel.split(',').map(Number);
  const cel = gedeeld.cellen.find((c) => c.cel[0] === kolom && c.cel[1] === rij);
  if (!cel) throw new Error(`cel [${kolom},${rij}] staat niet in kits/palet.json — nieuwe cel niet verwacht voor deze pack`);
  let bron = cel.bronnen.find((b) => b.kit === 'dungeon');
  if (!bron) {
    bron = { kit: 'dungeon', modellen: [] };
    cel.bronnen.push(bron);
  }
  bron.modellen = [...new Set([...bron.modellen, ...modellenSet])].sort();
}

writeFileSync(paletPad, `${JSON.stringify(paletJson, null, 1)}\n`);
console.log('kits/palet.json bijgewerkt met dungeon-bronnen');

console.log(`${Object.keys(NAMEN).length} modellen → kits/dungeon/`);
