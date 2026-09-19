import { join } from 'node:path';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';
import { bouw, schrijf, bandPlekken, kitMap, zetTags, zetManifest } from './bouwer.mjs';
import { scaleTarget } from './scale-factors.mjs';

const steel = ['metal-iron-steel', 'nickel'];
const cast = ['metal-iron-cast', 'slate'];
const gold = ['metal-gold', 'amber'];
const paintBlue = ['metal', 'azure'];

const worked = ['wood-worked', 'camel'];
const beam = ['wood-beam', 'chestnut'];
const bark = ['wood-bark', 'umber'];

const masonry = ['stone-masonry', 'nickel'];
const masonryDark = ['stone-masonry', 'slate'];
const masonryGrave = ['stone-masonry', 'taupe'];
const rock = ['stone-rock', 'nickel'];
const soil = ['stone-soil', 'taupe'];

const roofTile = ['ceramic', 'sienna'];
const plaster = ['ceramic', 'ivory'];
const cloth = ['textile', 'ivory'];
const clothRed = ['textile', 'sienna'];
const clothGreen = ['textile', 'hunter'];
const clothGrey = ['textile', 'taupe'];
const leather = ['leather', 'umber'];
const rope = ['rope', 'taupe'];

const leaf = ['foliage', 'moss'];
const needle = ['foliage', 'hunter'];
const straw = ['vegetation', 'tan'];
const hay = ['vegetation', 'camel'];

const wax = ['wax', 'ivory'];
const wick = ['wick', 'basalt'];
const flame = ['emissive', 'amber'];
const water = ['liquid', 'azure'];
const brew = ['liquid', 'hunter'];
const gemBlue = ['gemstone', 'azure'];

const pumpkinFlesh = ['food', 'terracotta'];
const pumpkinShell = ['vegetation', 'terracotta'];
const candyLight = ['food', 'ivory'];
const candyOrange = ['food', 'terracotta'];
const candyDark = ['food', 'slate'];

const candle = { '#e7e7e7': wax, '#263236': wick, '#ffbc24': flame };
const gravefence = { '#263236': cast, '#798388': masonryGrave };
const deadTree = { '#6d605c': bark };
const wall = { '#798388': masonry, '#596064': masonryDark };

const PAKKETTEN = [
  {
    kit: 'kay-spook',
    bron: 'KayKit_Spooktober_Seasonal_Pack_1.1',
    modellen: [
      {
        naam: 'candle-small', bronmodel: 'candleSmall', kind: 'obj-lighting-candle',
        tags: ['halloween'], kleuren: candle,
      },
      {
        naam: 'candle-large', bronmodel: 'candleLarge', kind: 'obj-lighting-candle',
        tags: ['halloween'], kleuren: candle,
      },
      {
        naam: 'candle-bundle', bronmodel: 'candleBundle', kind: 'obj-lighting-candle',
        tags: ['halloween', 'plural'], kleuren: candle,
      },
      {
        naam: 'candy-a', bronmodel: 'candyA', kind: 'obj-food',
        tags: ['halloween'], kleuren: { '#e7e7e7': candyLight, '#ff7124': candyOrange },
      },
      {
        naam: 'candy-b', bronmodel: 'candyB', kind: 'obj-food',
        tags: ['halloween'], kleuren: { '#ff7124': candyOrange, '#263236': candyDark },
      },
      {
        naam: 'jack', bronmodel: 'character_jack', kind: 'char',
        tags: ['halloween'],
        kleuren: { '#ff7124': pumpkinShell, '#9b5a45': clothRed, '#263236': leather },
      },
      {
        naam: 'cauldron', bronmodel: 'cauldron', kind: 'obj-kitchenware-cookware-pot',
        tags: ['halloween'],
        kleuren: { '#263236': cast, '#afda7e': brew, '#48bc8d': brew, '#9b5a45': beam },
      },
      {
        naam: 'coffin-a', bronmodel: 'coffinA_bottom', kind: 'obj-container',
        tags: ['halloween', 'grave'],
        kleuren: { '#9b5a45': worked, '#aab8be': steel, '#8b40c8': clothGrey },
      },
      {
        naam: 'coffin-a-lid', bronmodel: 'coffinA_top', kind: 'obj-container',
        tags: ['halloween', 'grave', 'comp'],
        kleuren: { '#9b5a45': worked, '#aab8be': steel, '#8b40c8': clothGrey },
      },
      {
        naam: 'coffin-b', bronmodel: 'coffinB_bottom', kind: 'obj-container',
        tags: ['halloween', 'grave'],
        kleuren: { '#263236': beam, '#aab8be': steel, '#ff2c60': clothRed },
      },
      {
        naam: 'coffin-b-lid', bronmodel: 'coffinB_top', kind: 'obj-container',
        tags: ['halloween', 'grave', 'comp'],
        kleuren: { '#263236': beam, '#aab8be': steel, '#ff2c60': clothRed },
      },
      {
        naam: 'branches', bronmodel: 'detail_graveyard', kind: 'env-flora-deadwood-branch',
        tags: ['halloween', 'grave', 'plural'], kleuren: deadTree,
      },
      {
        naam: 'fence', bronmodel: 'fence', kind: 'str-barrier-fence',
        tags: ['halloween', 'grave'], kleuren: { '#263236': cast },
      },
      {
        naam: 'fence-corner', bronmodel: 'fenceCorner', kind: 'str-barrier-fence',
        tags: ['halloween', 'grave'], kleuren: gravefence,
      },
      {
        naam: 'fence-double', bronmodel: 'fenceDouble', kind: 'str-barrier-fence',
        tags: ['halloween', 'grave'], kleuren: gravefence,
      },
      {
        naam: 'fence-post', bronmodel: 'fencePost', kind: 'str-barrier-fence',
        tags: ['halloween', 'grave'], kleuren: { '#798388': masonryGrave },
      },
      {
        naam: 'fence-single', bronmodel: 'fenceSingle', kind: 'str-barrier-fence',
        tags: ['halloween', 'grave'], kleuren: gravefence,
      },
      {
        naam: 'gravestone', bronmodel: 'gravestone', kind: 'str-marker-tombstone',
        tags: ['halloween', 'grave'], kleuren: { '#798388': masonryGrave },
      },
      {
        naam: 'jackolantern-large', bronmodel: 'jackolantern_big', kind: 'obj-food-vegetable',
        tags: ['halloween'], kleuren: { '#ff7124': pumpkinShell },
      },
      {
        naam: 'jackolantern-small', bronmodel: 'jackolantern_small', kind: 'obj-food-vegetable',
        tags: ['halloween'], kleuren: { '#ff7124': pumpkinShell },
      },
      {
        naam: 'path-cobbled', bronmodel: 'pathCobbled', kind: 'env-terrain-ground',
        tags: ['halloween', 'grave'], kleuren: { '#798388': masonryGrave },
      },
      {
        naam: 'pumpkin-large', bronmodel: 'pumpkinLarge', kind: 'obj-food-vegetable',
        tags: ['halloween'], kleuren: { '#ff7124': pumpkinFlesh, '#288b8d': leaf },
      },
      {
        naam: 'pumpkin-small', bronmodel: 'pumpkinSmall', kind: 'obj-food-vegetable',
        tags: ['halloween'], kleuren: { '#ff7124': pumpkinFlesh, '#288b8d': leaf },
      },
      {
        naam: 'shrine', bronmodel: 'shrine', kind: 'str',
        tags: ['halloween', 'grave'], kleuren: { '#798388': masonryGrave },
      },
      {
        naam: 'tree-dead-a', bronmodel: 'treeA_graveyard', kind: 'env-flora-deadwood',
        tags: ['halloween', 'grave'], kleuren: deadTree,
      },
      {
        naam: 'tree-dead-b', bronmodel: 'treeB_graveyard', kind: 'env-flora-deadwood',
        tags: ['halloween', 'grave'], kleuren: deadTree,
      },
      {
        naam: 'tree-dead-c', bronmodel: 'treeC_graveyard', kind: 'env-flora-deadwood',
        tags: ['halloween', 'grave'], kleuren: deadTree,
      },
      {
        naam: 'tree-dead-d', bronmodel: 'treeD_graveyard', kind: 'env-flora-deadwood',
        tags: ['halloween', 'grave'], kleuren: deadTree,
      },
    ],
  },

  {
    kit: 'kay-minigame',
    bron: 'KayKit_Mini-Game_Variety_Pack_1.2',
    modellen: [
      {
        naam: 'arrow', bronmodel: 'arrow_teamBlue', kind: 'obj-weapon-ranged-accessory',
        tags: [], kleuren: { '#aab8be': steel, '#9b5a45': worked, '#64b4ff': paintBlue },
      },
      {
        naam: 'bow', bronmodel: 'bow_teamBlue', kind: 'obj-weapon-ranged-bow',
        tags: [], kleuren: { '#c8855f': worked, '#e7e7e7': rope, '#64b4ff': paintBlue },
      },
      {
        naam: 'forest-detail', bronmodel: 'detail_forest', kind: 'assy',
        tags: ['plural'], kleuren: { '#daae7e': soil, '#48bc8d': leaf },
      },
      {
        naam: 'flag', bronmodel: 'flag_teamBlue', kind: 'str-marker-flag',
        tags: [], kleuren: { '#64b4ff': clothGreen, '#c8855f': worked, '#aab8be': cast },
      },
      {
        naam: 'plant-a', bronmodel: 'plantA_forest', kind: 'env-flora-plant',
        tags: [], kleuren: { '#48bc8d': leaf },
      },
      {
        naam: 'plant-b', bronmodel: 'plantB_forest', kind: 'env-flora-plant',
        tags: [], kleuren: { '#48bc8d': leaf },
      },
      {
        naam: 'rocks-a', bronmodel: 'rocksA_forest', kind: 'env-rock-boulder',
        tags: ['plural'], kleuren: { '#798388': rock },
      },
      {
        naam: 'rocks-b', bronmodel: 'rocksB_forest', kind: 'env-rock-boulder',
        tags: ['plural'], kleuren: { '#798388': rock },
      },
      {
        naam: 'star', bronmodel: 'star', kind: 'obj-pocketitem',
        tags: ['pickup'], kleuren: { '#ffbc24': gold },
      },
      {
        naam: 'target-stand', bronmodel: 'targetStand', kind: 'obj',
        tags: [], kleuren: { '#ff2c60': clothRed, '#e7e7e7': cloth, '#9b5a45': beam },
      },
      {
        naam: 'target', bronmodel: 'target', kind: 'obj',
        tags: [], kleuren: { '#ff2c60': clothRed, '#e7e7e7': cloth },
      },
      {
        naam: 'sword', bronmodel: 'sword_teamBlue', kind: 'obj-weapon-melee-sword',
        tags: [], kleuren: { '#64b4ff': gemBlue, '#aab8be': steel },
      },
    ],
  },

  {
    kit: 'kay-builder',
    bron: 'KayKit_Medieval_Builder_Pack_1.0',
    modellen: [
      {
        naam: 'archery-range', bronmodel: 'archeryrange', kind: 'str-building',
        tags: [],
        kleuren: {
          '#c8855f': roofTile, '#798388': masonry, '#e7e7e7': cloth,
          '#9b5a45': beam, '#daae7e': soil, '#ff2c60': clothRed,
        },
      },
      {
        naam: 'barracks', bronmodel: 'barracks', kind: 'str-building-fort',
        tags: [],
        kleuren: {
          '#c8855f': roofTile, '#798388': masonry, '#e7e7e7': cloth,
          '#9b5a45': beam, '#daae7e': soil, '#596064': masonryDark,
        },
      },
      {
        naam: 'bridge', bronmodel: 'bridge', kind: 'str-access-bridge',
        tags: [], kleuren: { '#798388': masonry },
      },
      {
        naam: 'bridge-roofed', bronmodel: 'bridge_roofed', kind: 'str-access-bridge',
        tags: [], kleuren: { '#798388': masonry, '#c8855f': roofTile, '#9b5a45': beam },
      },
      {
        naam: 'castle', bronmodel: 'castle', kind: 'str-building-fort',
        tags: [],
        kleuren: {
          '#798388': masonry, '#596064': masonryDark, '#9b5a45': beam,
          '#c8855f': roofTile, '#e7e7e7': cloth,
        },
      },
      {
        naam: 'forest-detail-a', bronmodel: 'detail_forestA', kind: 'assy',
        tags: ['plural'], kleuren: { '#288b8d': needle, '#9b5a45': bark, '#798388': rock },
      },
      {
        naam: 'forest-detail-b', bronmodel: 'detail_forestB', kind: 'assy',
        tags: ['plural'], kleuren: { '#288b8d': needle, '#9b5a45': bark, '#798388': rock },
      },
      {
        naam: 'rocks', bronmodel: 'detail_rocks', kind: 'env-rock-boulder',
        tags: ['plural'], kleuren: { '#798388': rock },
      },
      {
        naam: 'rocks-small', bronmodel: 'detail_rocks_small', kind: 'env-rock-boulder',
        tags: ['plural'], kleuren: { '#798388': rock },
      },
      {
        naam: 'tree-a', bronmodel: 'detail_treeA', kind: 'env-flora-tree',
        tags: [], kleuren: { '#9b5a45': bark, '#288b8d': needle },
      },
      {
        naam: 'tree-b', bronmodel: 'detail_treeB', kind: 'env-flora-tree',
        tags: [], kleuren: { '#9b5a45': bark, '#288b8d': needle },
      },
      {
        naam: 'tree-c', bronmodel: 'detail_treeC', kind: 'env-flora-tree',
        tags: [], kleuren: { '#9b5a45': bark, '#288b8d': needle },
      },
      {
        naam: 'farm-plot', bronmodel: 'farm_plot', kind: 'env-flora-plant',
        tags: ['plural'],
        kleuren: { '#ffbc24': straw, '#c8855f': hay, '#daae7e': soil, '#9b5a45': beam },
      },
      {
        naam: 'forest', bronmodel: 'forest', kind: 'env-flora-tree-conifer',
        tags: ['plural'], kleuren: { '#9b5a45': bark, '#288b8d': needle },
      },
      {
        naam: 'house', bronmodel: 'house', kind: 'str-building-dwelling',
        tags: [],
        kleuren: {
          '#daae7e': soil, '#798388': masonry, '#e7e7e7': plaster,
          '#9b5a45': beam, '#c8855f': roofTile,
        },
      },
      {
        naam: 'lumbermill', bronmodel: 'lumbermill', kind: 'str-building-mill',
        tags: [],
        kleuren: {
          '#c8855f': roofTile, '#798388': masonry, '#e7e7e7': cloth,
          '#9b5a45': beam, '#aab8be': cast,
        },
      },
      {
        naam: 'market', bronmodel: 'market', kind: 'str-stands',
        tags: [],
        kleuren: {
          '#daae7e': soil, '#798388': masonry, '#e7e7e7': cloth,
          '#9b5a45': beam, '#c8855f': roofTile,
        },
      },
      {
        naam: 'mill', bronmodel: 'mill', kind: 'str-building-mill',
        tags: [],
        kleuren: {
          '#c8855f': worked, '#9b5a45': beam, '#daae7e': soil,
          '#e7e7e7': cloth, '#798388': masonry,
        },
      },
      {
        naam: 'mine', bronmodel: 'mine', kind: 'str',
        tags: [],
        kleuren: {
          '#798388': rock, '#9b5a45': beam, '#263236': cast,
          '#aab8be': cast, '#6d605c': bark, '#daae7e': soil,
        },
      },
      {
        naam: 'mountain', bronmodel: 'mountain', kind: 'env-terrain-mountain',
        tags: [], kleuren: { '#798388': rock },
      },
      {
        naam: 'wall-corner', bronmodel: 'wall_corner', kind: 'str-part-wall',
        tags: [], kleuren: { '#798388': masonry },
      },
      {
        naam: 'wall-gate', bronmodel: 'wall_gate', kind: 'str-part-door',
        tags: [], kleuren: wall,
      },
      {
        naam: 'wall-gate-closed', bronmodel: 'wall_gate_closed', kind: 'str-part-door',
        tags: [], kleuren: { ...wall, '#9b5a45': beam },
      },
      {
        naam: 'wall-hex-corner-a', bronmodel: 'wall_hexCornerA', kind: 'str-part-wall',
        tags: [], kleuren: { '#798388': masonry },
      },
      {
        naam: 'wall-hex-corner-b', bronmodel: 'wall_hexCornerB', kind: 'str-part-wall',
        tags: [], kleuren: { '#798388': masonry },
      },
      {
        naam: 'wall-straight', bronmodel: 'wall_straight', kind: 'str-part-wall',
        tags: [], kleuren: { '#798388': masonry },
      },
      {
        naam: 'watchtower', bronmodel: 'watchtower', kind: 'str-building-tower',
        tags: [],
        kleuren: { '#798388': masonry, '#9b5a45': beam, '#596064': masonryDark, '#daae7e': soil },
      },
      {
        naam: 'watermill', bronmodel: 'watermill', kind: 'str-building-mill',
        tags: [],
        kleuren: { '#9b5a45': beam, '#798388': masonry, '#e7e7e7': cloth, '#c8855f': roofTile },
      },
      {
        naam: 'well', bronmodel: 'well', kind: 'str-building-well',
        tags: [],
        kleuren: {
          '#798388': masonry, '#596064': masonry, '#9b5a45': beam,
          '#c8855f': roofTile, '#48d6e1': water, '#daae7e': soil,
        },
      },
    ],
  },
];

const regels = [];
const perKit = new Map();

for (const pakket of PAKKETTEN) {
  const bronkit = BRONKITS.find((b) => b.map === pakket.bron);
  if (!bronkit) throw new Error(`${pakket.bron}: not in BRONKITS`);
  pakket.naam = bronkit.naam;
  pakket.schaal = scaleTarget(pakket.kit);
  if (pakket.schaal === null) throw new Error(`${pakket.kit}: no factor in scale-factors.mjs`);
  pakket.generator = 'tools/importeer/kay-packs.mjs';

  const { modellen } = bronModellen(bronkit);
  const perNaam = new Map(modellen.map((model) => [model.naam, model]));
  const plek = bandPlekken(pakket);
  const doelMap = kitMap(pakket.kit);

  console.log(`\n${pakket.kit}  (${bronkit.naam})`);
  for (const opgave of pakket.modellen) {
    const model = perNaam.get(opgave.bronmodel);
    if (!model) throw new Error(`${opgave.bronmodel}: not in ${pakket.bron}`);

    const mesh = bouw(model.primitieven, opgave, pakket, plek);
    schrijf(join(doelMap, `${opgave.naam}.glb`), mesh, opgave, pakket);

    const materialen = [...new Set(Object.values(opgave.kleuren).map(([materiaal]) => materiaal))];
    regels.push([`${pakket.kit}/${opgave.naam}`, [opgave.kind, ...materialen, ...opgave.tags]]);
    perKit.set(pakket.kit, [...(perKit.get(pakket.kit) ?? []), opgave.naam]);

    console.log(
      `  ${opgave.bronmodel.padEnd(24)} → ${opgave.naam.padEnd(20)} `
        + `${String(mesh.driehoeken.length / 3).padStart(5)} tris, `
        + `${materialen.length} material(s), ${mesh.banden.size} band(s): ${[...mesh.banden].join(', ')}`
        + `${mesh.gedraaid ? `, ${mesh.gedraaid} flipped` : ''}`,
    );
  }
}

zetTags(regels);
zetManifest(perKit);
console.log(`\n${regels.length} models added to kits/workfiles`);
