import { join } from 'node:path';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';
import { bouw, schrijf, kitMap, zetTags, zetManifest, richtSchillen } from './bouwer.mjs';

const steel = ['metal-iron-steel', 'nickel'];
const cast = ['metal-iron-cast', 'slate'];
const gold = ['metal-gold', 'amber'];

const worked = ['wood-worked', 'camel'];
const beam = ['wood-beam', 'chestnut'];
const bark = ['wood-bark', 'umber'];
const planks = ['wood-planks', 'tan'];
const log = ['wood-log', 'tan'];

const masonry = ['stone-masonry', 'nickel'];
const masonryDark = ['stone-masonry', 'slate'];
const rock = ['stone-rock', 'nickel'];

const roofTile = ['ceramic', 'sienna'];
const plaster = ['ceramic', 'ivory'];
const cloth = ['textile', 'ivory'];
const clothRed = ['textile', 'sienna'];

const leaf = ['foliage', 'hunter'];
const reed = ['foliage', 'moss'];
const cattail = ['vegetation', 'umber'];

const water = ['liquid', 'azure'];
const flame = ['emissive', 'amber'];

const grain = ['food', 'amber'];
const veg = ['food', 'moss'];
const fruit = ['food', 'sienna'];
const bread = ['food', 'tan'];

const stone = { '2,0': masonry, '*': masonry };
const stoneWall = { '2,0': masonry, '6,0': beam, '*': masonry };
const stumps = { '6,0': bark, '5,0': log, '*': bark };
const grove = { '1,2': leaf, '6,0': bark, '*': leaf };

const PAKKET = {
  kit: 'kay-hexagon',
  bron: 'KayKit_Medieval_Hexagon_Pack_1.0_FREE',
  schaal: 1.2,
  raster: [8, 4],
  modellen: [
    {
      naam: 'archery-range', bronmodel: 'building_archeryrange_blue', kind: 'str-building', tags: [],
      cellen: {
        '6,0': beam, '2,0': masonry, '0,3': roofTile, '5,0': worked, '1,0': plaster,
        '6,1': masonry, '6,2': clothRed, '3,0': masonryDark, '5,2': cloth, '*': masonry,
      },
    },
    {
      naam: 'barracks', bronmodel: 'building_barracks_blue', kind: 'str-building-fort', tags: [],
      cellen: {
        '2,0': masonry, '6,0': beam, '5,0': worked, '3,1': gold, '0,3': roofTile,
        '3,0': masonryDark, '*': masonry,
      },
    },
    {
      naam: 'blacksmith', bronmodel: 'building_blacksmith_blue', kind: 'str-building-fort', tags: [],
      cellen: {
        '2,0': masonry, '6,0': beam, '3,0': masonryDark, '5,0': worked, '0,3': roofTile,
        '4,3': flame, '6,1': masonry, '1,0': masonry, '0,1': masonryDark, '*': masonry,
      },
    },
    {
      naam: 'castle', bronmodel: 'building_castle_blue', kind: 'str-building-fort', tags: [],
      cellen: {
        '2,0': masonry, '0,3': roofTile, '6,0': beam, '3,0': masonryDark, '5,0': worked,
        '*': masonry,
      },
    },
    {
      naam: 'church', bronmodel: 'building_church_blue', kind: 'str-building-tower', tags: [],
      cellen: {
        '6,0': beam, '0,3': roofTile, '2,0': masonry, '1,0': plaster, '6,1': masonry,
        '5,0': worked, '*': masonry,
      },
    },
    {
      naam: 'house-a', bronmodel: 'building_home_A_blue', kind: 'str-building-dwelling', tags: [],
      cellen: {
        '6,0': beam, '2,0': masonry, '0,3': roofTile, '3,0': masonryDark, '6,1': masonry,
        '1,0': plaster, '5,0': beam, '4,0': masonryDark, '*': masonry,
      },
    },
    {
      naam: 'house-b', bronmodel: 'building_home_B_blue', kind: 'str-building-dwelling', tags: [],
      cellen: {
        '6,0': beam, '2,0': masonry, '0,3': roofTile, '1,0': plaster, '3,0': masonryDark,
        '6,1': masonry, '5,0': beam, '4,0': masonryDark, '*': masonry,
      },
    },
    {
      naam: 'lumbermill', bronmodel: 'building_lumbermill_blue', kind: 'str-building-mill', tags: [],
      cellen: {
        '6,0': beam, '2,0': masonry, '5,0': worked, '7,0': log, '0,3': roofTile,
        '5,1': cloth, '6,1': masonry, '1,0': plaster, '4,0': masonry, '*': masonry,
      },
    },
    {
      naam: 'market', bronmodel: 'building_market_blue', kind: 'str-stands', tags: [],
      cellen: {
        '6,0': beam, '5,0': beam, '5,1': grain, '3,1': grain, '6,2': fruit, '4,1': veg,
        '2,0': masonry, '6,1': masonry, '1,0': cloth, '0,3': clothRed, '*': beam,
      },
    },
    {
      naam: 'mine', bronmodel: 'building_mine_blue', kind: 'str', tags: [],
      cellen: {
        '6,0': beam, '2,2': rock, '3,0': masonryDark, '2,0': masonry, '0,3': clothRed,
        '5,0': worked, '0,1': water, '*': rock,
      },
    },
    {
      naam: 'tavern', bronmodel: 'building_tavern_blue', kind: 'str-building-dwelling', tags: [],
      cellen: {
        '6,0': beam, '2,0': masonry, '5,1': cloth, '5,0': worked, '1,0': plaster,
        '0,3': roofTile, '6,1': masonry, '*': masonry,
      },
    },
    {
      naam: 'tower-a', bronmodel: 'building_tower_A_blue', kind: 'str-building-tower', tags: [],
      cellen: {
        '2,0': masonry, '6,0': beam, '0,3': roofTile, '3,0': masonryDark, '6,1': masonry,
        '5,0': worked, '1,0': plaster, '*': masonry,
      },
    },
    {
      naam: 'tower-b', bronmodel: 'building_tower_B_blue', kind: 'str-building-tower', tags: [],
      cellen: {
        '2,0': masonry, '6,0': beam, '0,3': roofTile, '3,0': masonryDark, '6,1': masonry,
        '5,0': worked, '1,0': plaster, '*': masonry,
      },
    },
    {
      naam: 'tower-base', bronmodel: 'building_tower_base_blue', kind: 'str-building-tower', tags: [],
      cellen: {
        '2,0': masonry, '3,0': masonryDark, '6,0': beam, '0,3': clothRed, '5,0': worked,
        '*': masonry,
      },
    },
    {
      naam: 'tower-catapult', bronmodel: 'building_tower_catapult_blue',
      kind: 'str-building-tower', tags: [],
      cellen: {
        '2,0': masonry, '6,0': beam, '5,0': worked, '0,3': clothRed, '3,0': masonryDark,
        '5,1': cloth, '*': masonry,
      },
    },
    {
      naam: 'watermill', bronmodel: 'building_watermill_blue', kind: 'str-building-mill', tags: [],
      cellen: {
        '6,0': beam, '2,0': masonry, '0,3': roofTile, '1,0': plaster, '6,1': masonry,
        '5,0': worked, '*': masonry,
      },
    },
    {
      naam: 'well', bronmodel: 'building_well_blue', kind: 'str-building-well', tags: [],
      cellen: {
        '6,0': beam, '2,0': masonry, '0,3': roofTile, '0,1': water, '5,0': worked,
        '*': masonry,
      },
    },
    {
      naam: 'windmill', bronmodel: 'building_windmill_blue', kind: 'str-building-mill', tags: [],
      cellen: {
        '6,0': beam, '2,0': masonry, '5,1': cloth, '5,0': worked, '1,0': plaster,
        '3,0': masonryDark, '0,3': roofTile, '6,1': masonry, '*': masonry,
      },
    },
    {
      naam: 'bridge-a', bronmodel: 'building_bridge_A', kind: 'str-access-bridge', tags: [],
      cellen: stone,
    },
    {
      naam: 'bridge-b', bronmodel: 'building_bridge_B', kind: 'str-access-bridge', tags: [],
      cellen: stone,
    },
    {
      naam: 'ruin', bronmodel: 'building_destroyed', kind: 'str-building-dwelling',
      tags: ['broken'],
      cellen: { '6,1': masonry, '7,1': beam, '2,0': masonry, '3,0': masonryDark, '*': masonry },
    },
    {
      naam: 'scaffolding', bronmodel: 'building_scaffolding', kind: 'str-part-frame', tags: [],
      cellen: { '6,0': beam, '2,0': masonry, '5,0': worked, '5,1': planks, '*': beam },
    },
    {
      naam: 'building-site-a', bronmodel: 'building_stage_A', kind: 'str-part-frame', tags: [],
      cellen: { '6,0': beam, '2,0': masonry, '5,0': worked, '*': beam },
    },
    {
      naam: 'building-site-b', bronmodel: 'building_stage_B', kind: 'str-part-frame', tags: [],
      cellen: { '6,0': beam, '2,0': masonry, '5,0': worked, '1,0': plaster, '*': beam },
    },
    {
      naam: 'building-site-c', bronmodel: 'building_stage_C', kind: 'str-part-frame', tags: [],
      cellen: { '6,0': beam, '2,0': masonry, '5,0': worked, '1,0': plaster, '*': beam },
    },
    {
      naam: 'fence-stone', bronmodel: 'fence_stone_straight', kind: 'str-barrier-fence', tags: [],
      cellen: stone,
    },
    {
      naam: 'fence-stone-gate', bronmodel: 'fence_stone_straight_gate',
      kind: 'str-barrier-fence', tags: [],
      cellen: stoneWall,
    },
    {
      naam: 'fence-wood', bronmodel: 'fence_wood_straight', kind: 'str-barrier-fence', tags: [],
      cellen: { '6,0': beam, '5,0': worked, '*': beam },
    },
    {
      naam: 'fence-wood-gate', bronmodel: 'fence_wood_straight_gate',
      kind: 'str-barrier-fence', tags: [],
      cellen: { '6,0': beam, '2,0': cast, '5,0': worked, '*': beam },
    },
    {
      naam: 'catapult-ball', bronmodel: 'projectile_catapult', kind: 'obj-weapon-cannon', tags: [],
      cellen: { '3,0': cast, '*': cast },
    },
    {
      naam: 'wall-corner-a-gate', bronmodel: 'wall_corner_A_gate', kind: 'str-part-wall', tags: [],
      cellen: stoneWall,
    },
    {
      naam: 'wall-corner-a-inside', bronmodel: 'wall_corner_A_inside',
      kind: 'str-part-wall', tags: [],
      cellen: stoneWall,
    },
    {
      naam: 'wall-corner-a-outside', bronmodel: 'wall_corner_A_outside',
      kind: 'str-part-wall', tags: [],
      cellen: stoneWall,
    },
    {
      naam: 'wall-corner-b-inside', bronmodel: 'wall_corner_B_inside',
      kind: 'str-part-wall', tags: [],
      cellen: stoneWall,
    },
    {
      naam: 'wall-corner-b-outside', bronmodel: 'wall_corner_B_outside',
      kind: 'str-part-wall', tags: [],
      cellen: stoneWall,
    },
    {
      naam: 'wall', bronmodel: 'wall_straight', kind: 'str-part-wall', tags: [],
      cellen: stoneWall,
    },
    {
      naam: 'wall-gate', bronmodel: 'wall_straight_gate', kind: 'str-part-wall', tags: [],
      cellen: stoneWall,
    },
    {
      naam: 'tree', bronmodel: 'tree_single_B', kind: 'env-flora-tree', tags: [],
      cellen: grove,
    },
    {
      naam: 'stump', bronmodel: 'tree_single_B_cut', kind: 'env-flora-deadwood-stump', tags: [],
      cellen: stumps,
    },
    {
      naam: 'conifer-stumps', bronmodel: 'trees_A_cut', kind: 'env-flora-deadwood-stump',
      tags: ['plural'], cellen: stumps,
    },
    {
      naam: 'conifers-large', bronmodel: 'trees_A_large', kind: 'env-flora-tree-conifer',
      tags: ['plural'], cellen: grove,
    },
    {
      naam: 'conifers-medium', bronmodel: 'trees_A_medium', kind: 'env-flora-tree-conifer',
      tags: ['plural'], cellen: grove,
    },
    {
      naam: 'conifers-small', bronmodel: 'trees_A_small', kind: 'env-flora-tree-conifer',
      tags: ['plural'], cellen: grove,
    },
    {
      naam: 'stumps', bronmodel: 'trees_B_cut', kind: 'env-flora-deadwood-stump',
      tags: ['plural'], cellen: stumps,
    },
    {
      naam: 'trees-large', bronmodel: 'trees_B_large', kind: 'env-flora-tree',
      tags: ['plural'], cellen: grove,
    },
    {
      naam: 'trees-medium', bronmodel: 'trees_B_medium', kind: 'env-flora-tree',
      tags: ['plural'], cellen: grove,
    },
    {
      naam: 'trees-small', bronmodel: 'trees_B_small', kind: 'env-flora-tree',
      tags: ['plural'], cellen: grove,
    },
    {
      naam: 'waterplant', bronmodel: 'waterplant_A', kind: 'env-flora-plant', tags: [],
      cellen: { '1,2': reed, '*': reed },
    },
    {
      naam: 'cattail', bronmodel: 'waterplant_B', kind: 'env-flora-plant', tags: [],
      cellen: { '1,2': reed, '6,0': cattail, '*': reed },
    },
    {
      naam: 'cattails', bronmodel: 'waterplant_C', kind: 'env-flora-plant', tags: ['plural'],
      cellen: { '1,2': reed, '6,0': cattail, '*': reed },
    },
    {
      naam: 'barrel', bronmodel: 'barrel', kind: 'obj-container-barrel', tags: [],
      cellen: { '6,0': beam, '2,0': steel, '5,0': worked, '*': beam },
    },
    {
      naam: 'bucket-arrows', bronmodel: 'bucket_arrows', kind: 'obj-container-bucket', tags: [],
      cellen: { '6,0': beam, '0,3': clothRed, '5,0': worked, '2,0': steel, '*': beam },
    },
    {
      naam: 'bucket', bronmodel: 'bucket_empty', kind: 'obj-container-bucket', tags: [],
      cellen: { '6,0': beam, '2,0': steel, '*': beam },
    },
    {
      naam: 'bucket-water', bronmodel: 'bucket_water', kind: 'obj-container-bucket', tags: [],
      cellen: { '6,0': beam, '2,0': steel, '0,1': water, '*': beam },
    },
    {
      naam: 'crate', bronmodel: 'crate_A_big', kind: 'obj-container-crate', tags: [],
      cellen: { '6,0': beam, '5,0': worked, '*': beam },
    },
    {
      naam: 'crate-small', bronmodel: 'crate_A_small', kind: 'obj-container-crate', tags: [],
      cellen: { '6,0': beam, '5,0': worked, '*': beam },
    },
    {
      naam: 'crate-long-a', bronmodel: 'crate_long_A', kind: 'obj-container-crate', tags: [],
      cellen: { '3,1': grain, '6,2': fruit, '6,0': beam, '*': beam },
    },
    {
      naam: 'crate-long-b', bronmodel: 'crate_long_B', kind: 'obj-container-crate', tags: [],
      cellen: { '5,1': bread, '4,1': veg, '6,0': beam, '*': beam },
    },
    {
      naam: 'crate-long-c', bronmodel: 'crate_long_C', kind: 'obj-container-crate', tags: [],
      cellen: { '5,1': cloth, '6,0': beam, '3,1': grain, '*': beam },
    },
    {
      naam: 'crate-long', bronmodel: 'crate_long_empty', kind: 'obj-container-crate', tags: [],
      cellen: { '6,0': beam, '*': beam },
    },
    {
      naam: 'crate-open', bronmodel: 'crate_open', kind: 'obj-container-crate', tags: [],
      cellen: { '6,0': beam, '6,2': fruit, '5,0': worked, '*': beam },
    },
    {
      naam: 'flag', bronmodel: 'flag_blue', kind: 'str-marker-flag', tags: [],
      cellen: { '0,3': clothRed, '6,0': beam, '*': beam },
    },
    {
      naam: 'ladder', bronmodel: 'ladder', kind: 'str-access-ladder', tags: [],
      cellen: { '5,0': worked, '*': worked },
    },
    {
      naam: 'pallet', bronmodel: 'pallet', kind: 'obj-resource-wood-plank', tags: [],
      cellen: { '6,0': planks, '*': planks },
    },
    {
      naam: 'timber', bronmodel: 'resource_lumber', kind: 'obj-resource-wood-log',
      tags: ['plural'],
      cellen: { '5,0': log, '6,0': bark, '*': log },
    },
    {
      naam: 'stone-blocks', bronmodel: 'resource_stone', kind: 'obj-resource-stone',
      tags: ['plural'], cellen: stone,
    },
    {
      naam: 'sack', bronmodel: 'sack', kind: 'obj-container-bag', tags: [],
      cellen: { '5,1': cloth, '*': cloth },
    },
    {
      naam: 'target', bronmodel: 'target', kind: 'obj', tags: [],
      cellen: { '1,0': cloth, '6,0': beam, '6,2': clothRed, '*': cloth },
    },
    {
      naam: 'tent', bronmodel: 'tent', kind: 'str-stands', tags: [],
      cellen: { '6,0': beam, '5,1': cloth, '*': beam },
    },
    {
      naam: 'weapon-rack', bronmodel: 'weaponrack', kind: 'obj-furniture-storage', tags: [],
      cellen: { '6,0': beam, '*': beam },
    },
    {
      naam: 'wheelbarrow', bronmodel: 'wheelbarrow', kind: 'obj-transport-cart', tags: [],
      cellen: { '6,0': beam, '2,0': steel, '3,0': cast, '*': beam },
    },
  ],
};

const bronkit = BRONKITS.find((b) => b.map === PAKKET.bron);
if (!bronkit) throw new Error(`${PAKKET.bron}: not in BRONKITS`);
PAKKET.naam = bronkit.naam;
PAKKET.generator = 'tools/importeer/kay-hexagon.mjs';

const { modellen } = bronModellen(bronkit);
const perNaam = new Map(modellen.map((model) => [model.naam, model]));
const doelMap = kitMap(PAKKET.kit);

const regels = [];
const perKit = new Map();

console.log(`\n${PAKKET.kit}  (${bronkit.naam})  scale ${PAKKET.schaal}`);
for (const opgave of PAKKET.modellen) {
  const model = perNaam.get(opgave.bronmodel);
  if (!model) throw new Error(`${opgave.bronmodel}: not in ${PAKKET.bron}`);
  const gekeerd = richtSchillen(model);

  const mesh = bouw(model.primitieven, opgave, PAKKET, null);
  schrijf(join(doelMap, `${opgave.naam}.glb`), mesh, opgave, PAKKET);

  const materialen = [...mesh.materialen];
  regels.push([`${PAKKET.kit}/${opgave.naam}`, [opgave.kind, ...materialen, ...opgave.tags]]);
  perKit.set(PAKKET.kit, [...(perKit.get(PAKKET.kit) ?? []), opgave.naam]);

  console.log(
    `  ${opgave.bronmodel.padEnd(28)} → ${opgave.naam.padEnd(22)} `
      + `${String(mesh.driehoeken.length / 3).padStart(5)} tris, `
      + `${materialen.length} material(s), ${mesh.banden.size} band(s): ${[...mesh.banden].join(', ')}`
      + `${gekeerd ? `, ${gekeerd} turned out` : ''}`,
  );
}

zetTags(regels);
zetManifest(perKit);
console.log(`\n${regels.length} models added to kits/workfiles`);
