import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen, alleBestanden } from '../../catalog/tools/bronmodellen.mjs';
import { bouw, schrijf, bandPlekken, kitMap, zetTags, zetManifest, richtSchillen, richtWinding, ROOT } from './bouwer.mjs';

const plank = ['wood-planks', 'tan'];
const hout = ['wood-worked', 'camel'];
const balk = ['wood-beam', 'chestnut'];
const schors = ['wood-bark', 'umber'];
const stam = ['wood-log', 'tan'];
const staal = ['metal-iron-steel', 'nickel'];
const smeed = ['metal-iron-wrought', 'basalt'];
const giet = ['metal-iron-cast', 'slate'];
const goud = ['metal-gold', 'amber'];
const steen = ['stone-masonry', 'taupe'];
const steenGrijs = ['stone-masonry', 'nickel'];
const steenDonker = ['stone-masonry', 'slate'];
const grond = ['stone-soil', 'taupe'];
const doek = ['textile', 'ivory'];
const doekGroen = ['textile', 'hunter'];
const leer = ['leather', 'umber'];
const touw = ['rope', 'taupe'];
const been = ['bone', 'ivory'];
const aardewerk = ['ceramic', 'ivory'];
const dakpan = ['ceramic', 'sienna'];
const potaarde = ['ceramic', 'terracotta'];
const blad = ['foliage', 'moss'];
const loof = ['foliage', 'hunter'];
const was = ['wax', 'ivory'];
const pit = ['wick', 'basalt'];
const water = ['liquid', 'azure'];
const jade = ['gemstone', 'hunter'];
const robijn = ['gemstone', 'sienna'];
const aardappel = ['food', 'taupe'];
const pompoen = ['food', 'terracotta'];
const rook = ['textile', 'ivory'];

const PAKKETTEN = [
  {
    kit: 'kay-adventurers', bron: 'KayKit_Adventurers_2.0_FREE', schaal: 0.3, raster: [8, 4],
    modellen: [{
      naam: 'smokebomb', bronmodel: 'smokebomb', kind: 'obj-weapon-cannon', tags: [],
      cellen: { '6,2': giet, '5,1': leer, '*': giet },
    }],
  },
  {
    kit: 'desert-buildings', bron: 'Low_Poly_Desert_Buildings', schaal: 0.0024,
    modellen: [{
      naam: 'door', bronmodel: 'Door', kind: 'str-part-door', tags: [],
      kleuren: { '#99624b': balk, '#c78062': hout, '#452309': giet, '*': balk },
    }],
  },
  {
    kit: 'architecture', bron: 'Architecture_Pack_001', schaal: 4, atlas: true,
    modellen: [
      {
        naam: 'church', bronmodel: 'Church', kind: 'str-building-tower', tags: [],
        kleuren: {
          '#c4c6c5': steenGrijs, '#c5c7c6': steenGrijs, '#7b8181': steen,
          '#163552': steenDonker, '#163551': steenDonker, '#b6d1e2': steenGrijs, '*': hout,
        },
      },
      {
        naam: 'castle', bronmodel: 'Castle', kind: 'str-building-fort', tags: [],
        kleuren: { '#57585a': steenDonker, '*': hout },
      },
      {
        naam: 'fortress', bronmodel: 'Fortress', kind: 'str-building-fort', tags: [],
        kleuren: { '#7b8181': steen, '*': hout },
      },
      {
        naam: 'ferris-wheel', bronmodel: 'Ferriswheel', kind: 'str', tags: [],
        kleuren: {
          '#163552': giet, '#ecedef': doek, '#57585a': steen, '#7b8181': steen,
          '#565759': steen, '#56575b': steen, '#57585c': steen, '*': giet,
        },
      },
      {
        naam: 'cottage', bronmodel: 'Cottage', kind: 'str-building-dwelling', tags: [],
        kleuren: {
          '#a36b52': dakpan, '#a36b54': dakpan, '#57585a': steen, '#56575b': steen,
          '#5d4c42': balk, '#5c4b41': balk, '#54463d': balk, '#5e4d43': balk, '#55473e': balk,
          '#594840': balk, '#56483f': balk, '#5a4941': balk, '#5d4c44': balk, '#5e4c42': balk,
          '#5b4a40': balk, '#5b4a42': balk, '#53453c': balk, '#53463d': balk, '#5f4d43': balk,
          '*': hout,
        },
      },
      {
        naam: 'barn', bronmodel: 'Barn', kind: 'str-building', tags: [],
        kleuren: { '#7b8181': steen, '#ecedef': steenGrijs, '#a36b52': dakpan, '*': dakpan },
      },
      {
        naam: 'arch', bronmodel: 'Arch', kind: 'str-part-wall', tags: [],
        kleuren: { '*': steen },
      },
      {
        naam: 'cabin', bronmodel: 'Cabin_shed', kind: 'str-building-dwelling', tags: [],
        kleuren: {
          '#224a28': loof, '#214a28': loof, '#224a27': loof, '#234b29': loof,
          '#7b8181': steen, '#b6d1e2': steenGrijs, '*': balk,
        },
      },
    ],
  },
  {
    kit: 'medieval-town', bron: 'Medieval_Village_Pack', schaal: 1.1,
    modellen: [
      {
        naam: 'door-round', bronmodel: 'Door Round', kind: 'str-part-door', tags: [],
        kleuren: { '#636b76': steenGrijs, '#757f84': steenGrijs, '#624226': balk, '#7f5632': hout, '*': balk },
      },
      {
        naam: 'door-straight', bronmodel: 'Door Straight', kind: 'str-part-door', tags: [],
        kleuren: {
          '#636b76': steenGrijs, '#757f84': steenGrijs, '#624226': balk,
          '#7f5632': hout, '#7f5532': hout, '#38323b': giet, '*': balk,
        },
      },
      {
        naam: 'smoke', bronmodel: 'Smoke', kind: 'env', tags: [],
        kleuren: { '*': rook },
      },
      {
        naam: 'fence', bronmodel: 'Fence', kind: 'str-barrier-fence', tags: [],
        kleuren: { '*': balk },
      },
    ],
  },
  {
    kit: 'ken-forest-mini', bron: 'kenney_mini-forest_1.0', schaal: 0.75, raster: [16, 4],
    modellen: [{
      naam: 'building-roof', bronmodel: 'building-roof', kind: 'str-part-roof', tags: [],
      cellen: { '14,2': dakpan, '15,2': dakpan, '1,2': balk, '15,3': balk, '*': balk },
    }],
  },
  {
    kit: 'kay-hallow', bron: 'KayKit_HalloweenBits_1.0_FREE', schaal: 0.24, raster: [8, 4],
    modellen: [
      {
        naam: 'tree-pine-orange-large', bronmodel: 'tree_pine_orange_large',
        kind: 'env-flora-tree-conifer', tags: ['halloween', 'ngons'],
        cellen: { '0,1': loof, '7,1': schors, '*': schors },
      },
      {
        naam: 'floor-dirt', bronmodel: 'floor_dirt', kind: 'str-part-floor',
        tags: ['halloween', 'grave'],
        cellen: { '*': steen },
      },
    ],
  },
  {
    kit: 'kay-skeleton-1', bron: 'KayKit_Skeletons_1.0', schaal: 0.3,
    modellen: [
      {
        naam: 'hood', bronmodel: 'skeleton_hood', kind: 'obj-equipment-clothing',
        tags: ['halloween', 'grave'], kleuren: { '*': doekGroen },
      },
      {
        naam: 'hood-masked', bronmodel: 'skeleton_hood_masked', kind: 'obj-equipment-clothing',
        tags: ['halloween', 'grave'], kleuren: { '*': doekGroen },
      },
      {
        naam: 'mage-cloak', bronmodel: 'skeleton_mage_cloak', kind: 'obj-equipment-clothing',
        tags: ['halloween', 'grave'], kleuren: { '*': doekGroen },
      },
      {
        naam: 'mage-cowl', bronmodel: 'skeleton_mage_cowl', kind: 'obj-equipment-clothing',
        tags: ['halloween', 'grave'], kleuren: { '*': doekGroen },
      },
    ],
  },
  {
    kit: 'quat-pirate', bron: 'Pirate_Kit_by_Quaternius_glTF_OBJ', schaal: 0.35, atlas: true,
    modellen: [{
      naam: 'bomb', bronmodel: 'Prop_Bomb', kind: 'obj-weapon-cannon', tags: ['pirate'],
      kleuren: { '#3a3739': giet, '#857b80': giet, '#9e957f': touw, '#c7c7c7': doek, '*': giet },
    }],
  },
  {
    kit: 'fs-town', bron: 'Modular Village', schaal: 0.5,
    modellen: [{
      naam: 'cart-a-barrels', bronmodel: 'Prop_Cart_1_Barrels', kind: 'obj-transport-cart', tags: [],
      kleuren: {
        '#afada7': smeed, '#95928f': smeed, '#d0c0a9': hout, '#a79889': hout,
        '#bead9c': balk, '#dfd0b5': balk, '*': hout,
      },
    }],
  },
  {
    kit: 'asia-rg', bron: 'Stylized_Asia_RG', schaal: 0.46, atlas: true,
    modellen: [
      {
        naam: 'shuriken', bronmodel: 'Shuriken', kind: 'obj-weapon-ranged', tags: ['asia'],
        kleuren: { '#c0d0e7': staal, '#454a55': smeed, '*': staal },
      },
      {
        naam: 'naginata', bronmodel: 'Weapon_1', kind: 'obj-weapon-melee', tags: ['asia'],
        kleuren: { '#c0d0e7': staal, '#454a55': smeed, '#92613d': balk, '#986642': balk, '*': staal },
      },
    ],
  },
  {
    kit: 'mek-tools', bron: 'tools_mekmeesk', schaal: 0.00022,
    modellen: [{
      naam: 'pickaxe', bronmodel: 'Cylinder.001', kind: 'obj-tool-long', tags: [],
      kleuren: { '#e7e7e7': staal, '#584021': plank, '*': staal },
    }],
  },
  {
    kit: 'ken-pirate', bron: 'kenney_pirate-kit', schaal: 0.3, raster: [16, 4],
    modellen: [
      {
        naam: 'palm-detailed-bend', bronmodel: 'palm-detailed-bend', kind: 'env-flora-tree-palm',
        tags: ['pirate'], cellen: { '3,2': blad, '11,3': plank, '*': plank },
      },
      {
        naam: 'palm-bend', bronmodel: 'palm-bend', kind: 'env-flora-tree-palm',
        tags: ['pirate'], cellen: { '3,2': blad, '11,3': plank, '*': plank },
      },
      {
        naam: 'tool-shovel', bronmodel: 'tool-shovel', kind: 'obj-tool-long',
        tags: ['pirate'], cellen: { '7,3': staal, '11,3': plank, '*': plank },
      },
    ],
  },
  {
    kit: 'props', bron: 'PropsLite_FBX', schaal: 0.008, atlas: true,
    modellen: [
      {
        naam: 'axe-a', bronmodel: 'Axe_01', kind: 'obj-weapon-melee-axe', tags: [],
        kleuren: { '#af8a63': balk, '*': staal },
      },
      {
        naam: 'coin-a', bronmodel: 'Coin_01', kind: 'obj-pocketitem-coin', tags: ['pickup'],
        kleuren: { '*': goud },
      },
      {
        naam: 'coin-b', bronmodel: 'Coin_02', kind: 'obj-pocketitem-coin', tags: ['plural'],
        kleuren: { '*': goud },
      },
      {
        naam: 'coin-c', bronmodel: 'Coin_03', kind: 'obj-pocketitem-coin', tags: ['plural'],
        kleuren: { '*': goud },
      },
      {
        naam: 'candle-a', bronmodel: 'Candle_01', kind: 'obj-lighting-candle', tags: ['halloween'],
        kleuren: { '#b7946e': was, '*': smeed },
      },
    ],
  },
  {
    kit: 'isa-park', bron: 'Pretty_park_set', schaal: 0.24, raster: [8, 8],
    modellen: [
      {
        naam: 'fountain', bronmodel: 'Fountain', kind: 'obj-art-sculpture', tags: ['ngons'],
        cellen: { '2,0': steenGrijs, '2,1': steenGrijs, '0,2': water, '1,6': water, '1,7': water, '*': steenGrijs },
      },
      {
        naam: 'grass-a', bronmodel: 'Grass A', kind: 'env-flora-plant-grass', tags: ['plural'],
        cellen: { '*': blad },
      },
      {
        naam: 'grass-b', bronmodel: 'Grass B', kind: 'env-flora-plant-grass', tags: ['plural'],
        cellen: { '*': blad },
      },
    ],
  },
  {
    kit: 'medieval-forge', bron: 'AssetPack', schaal: 0.006, atlas: true,
    modellen: [{
      naam: 'door', bronmodel: 'Door3', kind: 'str-part-door', tags: [],
      kleuren: { '#96c3d7': giet, '#c87d5a': balk, '*': balk },
    }],
  },
  {
    kit: 'ken-mini-dun', bron: 'kenney_mini-dungeon', schaal: 0.75, raster: [16, 4],
    modellen: [
      {
        naam: 'shield-round', bronmodel: 'shield-round', kind: 'obj-equipment-shield', tags: [],
        cellen: { '9,3': staal, '13,3': staal, '3,3': balk, '*': staal },
      },
      {
        naam: 'shield-rectangle', bronmodel: 'shield-rectangle', kind: 'obj-equipment-shield', tags: [],
        cellen: { '13,3': staal, '3,3': balk, '*': staal },
      },
      {
        naam: 'coin', bronmodel: 'coin', kind: 'obj-pocketitem-coin', tags: ['pickup', 'ngons'],
        cellen: { '*': goud },
      },
    ],
  },
  {
    kit: 'quat-rpg', bron: 'Ultimate_RPG_Pack_by_Quaternius_OBJ', schaal: 0.22,
    modellen: [{
      naam: 'crown-2', bronmodel: 'Crown2', kind: 'obj-equipment', tags: [],
      kleuren: { '#b9a54f': goud, '#d1493c': robijn, '*': goud },
    }],
  },
  {
    kit: 'kay-forest', bron: 'KayKit_Forest_Nature_Pack_1.0_FREE', schaal: 0.3, raster: [8, 4],
    modellen: [
      {
        naam: 'grass-1-d-singlesided', bronmodel: 'Grass_1_D_Singlesided_Color1',
        kind: 'env-flora-plant-grass', tags: [], cellen: { '*': blad },
      },
      {
        naam: 'grass-2-d-singlesided', bronmodel: 'Grass_2_D_Singlesided_Color1',
        kind: 'env-flora-plant-grass', tags: [], cellen: { '*': blad },
      },
    ],
  },
  {
    kit: 'quat-dun-1', bron: 'Modular_Dungeons_Pack_by_Quaternius_OBJ', schaal: 0.25,
    sleutels: {
      '#705147': hout, '#574039': balk, '#464255': giet, '#33303e': giet,
      '#6e604e': steen, '#938054': goud, '#6e5643': doek, '#35366e': touw,
      '#8d8b89': steenGrijs, '#795239': balk, '#959aa0': staal, '#7f7f75': staal,
      '#a4a8b0': staal, '#654430': balk, '*': hout,
    },
    modellen: [
      { naam: 'arch-door-bottompivot', bronmodel: 'Arch_Door_bottompivot', kind: 'str-part-door', tags: ['halloween'] },
      { naam: 'bag-coins', bronmodel: 'Bag_Coins', kind: 'obj-container-bag', tags: [] },
      { naam: 'bag-standing', bronmodel: 'Bag_Standing', kind: 'obj-container-bag', tags: [] },
      { naam: 'barrel-2', bronmodel: 'Barrel2', kind: 'obj-container-barrel', tags: ['ngons'] },
      { naam: 'chest', bronmodel: 'Chest', kind: 'obj-container-chest', tags: [] },
      { naam: 'chest-gold', bronmodel: 'Chest_Gold', kind: 'assy', tags: ['halloween'] },
      { naam: 'crate', bronmodel: 'Crate', kind: 'obj-container-crate', tags: [] },
      { naam: 'pedestal', bronmodel: 'Pedestal', kind: 'str', tags: ['halloween'] },
      { naam: 'pedestal-2', bronmodel: 'Pedestal2', kind: 'str', tags: ['halloween'] },
      { naam: 'sword-wall-mount', bronmodel: 'Sword_WallMount', kind: 'assy', tags: ['halloween'] },
      { naam: 'vase', bronmodel: 'Vase', kind: 'obj-container-pot', tags: ['ngons'], kleuren: { '#6e604e': ['ceramic', 'taupe'], '*': ['ceramic', 'taupe'] } },
      { naam: 'trapdoor', bronmodel: 'Trapdoor', kind: 'str-part-door', tags: ['halloween'] },
      { naam: 'trapdoor-open', bronmodel: 'Trapdoor_open', kind: 'str-part-door', tags: ['halloween'] },
    ],
  },
  {
    kit: 'asia-pack', bron: 'Asian_Cementery_Rocks_Packs', submap: 'Asian_Pack', schaal: 0.3, atlas: true,
    modellen: [{
      naam: 'ore-jade', bronmodel: 'mineral_ore_jade', kind: 'env-rock', tags: ['asia'],
      kleuren: { '*': jade },
    }],
  },
  {
    kit: 'quat-dun-2', bron: 'Updated_Modular_Dungeon_2019', schaal: 0.4,
    sleutels: {
      '#705147': hout, '#574039': hout, '#464255': giet, '#33303e': giet,
      '#6e604e': hout, '#8d8b89': steenGrijs, '*': hout,
    },
    modellen: [
      { naam: 'arch-door', bronmodel: 'Arch_Door', kind: 'str-part-door', tags: ['halloween'] },
      { naam: 'arch-door-bottompivot', bronmodel: 'Arch_Door_bottompivot', kind: 'str-part-door', tags: ['halloween'] },
      { naam: 'barrel-2', bronmodel: 'Barrel2', kind: 'obj-container-barrel', tags: ['ngons'] },
      { naam: 'bucket', bronmodel: 'Bucket', kind: 'obj-container-bucket', tags: ['ngons'] },
      { naam: 'pedestal', bronmodel: 'Pedestal', kind: 'str', tags: ['halloween'] },
      { naam: 'vase', bronmodel: 'Vase', kind: 'obj-container-pot', tags: ['ngons'], kleuren: { '#6e604e': ['ceramic', 'taupe'], '*': ['ceramic', 'taupe'] } },
    ],
  },
  {
    kit: 'ken-grave', bron: 'kenney_graveyardkit_5.0', schaal: 0.75, raster: [16, 4],
    modellen: [
      {
        naam: 'coffin-old', bronmodel: 'coffin-old', kind: 'obj-container',
        tags: ['halloween', 'grave'], cellen: { '3,2': hout, '5,2': hout, '*': hout },
      },
      {
        naam: 'altar-stone', bronmodel: 'altar-stone', kind: 'str',
        tags: ['halloween', 'grave'], cellen: { '*': steenGrijs },
      },
      {
        naam: 'altar-wood', bronmodel: 'altar-wood', kind: 'str',
        tags: ['halloween', 'grave'], cellen: { '3,2': hout, '15,3': steenGrijs, '*': steenGrijs },
      },
      {
        naam: 'shovel', bronmodel: 'shovel', kind: 'obj-tool-long',
        tags: ['halloween', 'grave'], cellen: { '15,3': staal, '3,2': plank, '*': staal },
      },
      {
        naam: 'pumpkin-tall-carved', bronmodel: 'pumpkin-tall-carved', kind: 'obj-food-vegetable',
        tags: ['halloween'], cellen: { '7,3': pompoen, '11,2': blad, '13,2': ['emissive', 'amber'], '*': pompoen },
      },
    ],
  },
  {
    kit: 'quat-food', bron: 'Ultimate_Food_Pack_by_Quaternius_OBJ', schaal: 0.15,
    modellen: [{
      naam: 'pumpkin', bronmodel: 'Pumpkin', kind: 'obj-food-vegetable', tags: [],
      kleuren: { '#a36436': pompoen, '#655236': ['vegetation', 'moss'], '*': pompoen },
    }],
  },
  {
    kit: 'ken-castle', bron: 'kenney_castlekit', schaal: 0.75, raster: [16, 4],
    modellen: [
      {
        naam: 'bridge-straight-pillar', bronmodel: 'bridge-straight-pillar', kind: 'str-access-bridge',
        tags: [], cellen: { '13,3': balk, '15,3': plank, '*': balk },
      },
      {
        naam: 'bridge-straight', bronmodel: 'bridge-straight', kind: 'str-access-bridge',
        tags: [], cellen: { '13,3': balk, '15,3': plank, '*': balk },
      },
      {
        naam: 'gate', bronmodel: 'gate', kind: 'str-part-door',
        tags: [], cellen: { '5,3': giet, '7,3': giet, '9,3': balk, '*': giet },
      },
      {
        naam: 'metal-gate', bronmodel: 'metal-gate', kind: 'str-part-door',
        tags: [], cellen: { '5,3': giet, '7,3': giet, '*': giet },
      },
    ],
  },
  {
    kit: 'kay-dun-2', bron: 'KayKit_Dungeon_Pack_1.1_FREE', schaal: 0.3, raster: [8, 4],
    modellen: [
      {
        naam: 'plate-stack', bronmodel: 'plate_stack', kind: 'obj-kitchenware-tableware-plate',
        tags: ['plural', 'ngons'], cellen: { '*': ['ceramic', 'taupe'] },
      },
      {
        naam: 'sword-shield', bronmodel: 'sword_shield', kind: 'assy',
        tags: [], cellen: { '1,0': staal, '7,0': staal, '0,1': doek, '4,0': balk, '*': staal },
      },
      {
        naam: 'sword-shield-gold', bronmodel: 'sword_shield_gold', kind: 'assy',
        tags: [], cellen: { '7,2': goud, '7,0': staal, '0,1': doek, '3,2': goud, '*': goud },
      },
    ],
  },
  {
    kit: 'ken-town', bron: 'kenney_fantasy-town-kit_2.0', schaal: 0.75, raster: [16, 4],
    modellen: [
      {
        naam: 'chimney', bronmodel: 'chimney', kind: 'str-part-roof',
        tags: [], cellen: { '3,2': steenGrijs, '15,3': steen, '*': steenGrijs },
      },
      {
        naam: 'fountain-square-detail', bronmodel: 'fountain-square-detail', kind: 'obj-art-sculpture',
        tags: [],
        cellen: { '3,2': steenGrijs, '15,3': steen, '0,0': water, '15,0': water, '0,3': water, '15,2': water, '*': steenGrijs },
      },
      {
        naam: 'wheel', bronmodel: 'wheel', kind: 'obj-transport-accessory',
        tags: [], cellen: { '9,3': plank, '11,3': balk, '3,2': smeed, '*': balk },
      },
    ],
  },
  {
    kit: 'kay-food', bron: 'KayKit_Restaurant_Bits_1.0_FREE', schaal: 0.23, raster: [8, 4],
    modellen: [
      {
        naam: 'crate-potatoes', bronmodel: 'crate_potatoes', kind: 'assy',
        tags: [], cellen: { '6,1': aardappel, '6,0': hout, '*': hout },
      },
      {
        naam: 'door-b', bronmodel: 'door_B', kind: 'str-part-door',
        tags: [], cellen: { '3,0': giet, '6,0': balk, '1,3': balk, '0,3': balk, '*': balk },
      },
    ],
  },
  {
    kit: 'isa-kitchen', bron: 'Tiny_Treats_Charming_Kitchen_1.1_FREE', schaal: 0.32, raster: [8, 8],
    modellen: [
      {
        naam: 'chair', bronmodel: 'chair', kind: 'obj-furniture-seating-chair',
        tags: [], cellen: { '5,0': hout, '5,1': hout, '3,0': doek, '3,1': doek, '*': hout },
      },
      {
        naam: 'door-modular', bronmodel: 'door_modular', kind: 'str-part-door',
        tags: [], cellen: { '2,0': giet, '2,1': giet, '3,0': hout, '3,1': hout, '*': hout },
      },
    ],
  },
  {
    kit: 'ken-platformer', bron: 'kenney_platformer-kit', schaal: 0.75, raster: [16, 4],
    modellen: [{
      naam: 'door', bronmodel: 'door-rotate', kind: 'str-part-door',
      tags: [], cellen: { '7,1': balk, '1,1': goud, '5,2': steenGrijs, '*': balk },
    }],
  },
  {
    kit: 'fs-terrain', bron: 'modular_terrain_collection', schaal: 0.5,
    sleutels: {
      '#9ac26e': loof, '#6a8e6a': loof, '#63aa7d': loof,
      '#bead9c': schors, '#d0cfcd': steen, '*': steen,
    },
    modellen: [
      { naam: 'hilly-prop-tree-oak-a', bronmodel: 'Hilly_Prop_Tree_Oak_1', kind: 'env-flora-tree', tags: [] },
      { naam: 'hilly-prop-tree-oak-b', bronmodel: 'Hilly_Prop_Tree_Oak_2', kind: 'env-flora-tree', tags: [] },
      { naam: 'hilly-prop-tree-oak-c', bronmodel: 'Hilly_Prop_Tree_Oak_3', kind: 'env-flora-tree', tags: [] },
      { naam: 'hilly-prop-tree-oak-d', bronmodel: 'Hilly_Prop_Tree_Oak_4', kind: 'env-flora-tree', tags: [] },
      { naam: 'hilly-prop-tree-cedar-a', bronmodel: 'Hilly_Prop_Tree_Cedar_1', kind: 'env-flora-tree-conifer', tags: [] },
      { naam: 'hilly-prop-tree-cedar-b', bronmodel: 'Hilly_Prop_Tree_Cedar_2', kind: 'env-flora-tree-conifer', tags: [] },
      { naam: 'hilly-prop-tree-pine-a', bronmodel: 'Hilly_Prop_Tree_Pine_1', kind: 'env-flora-tree-conifer', tags: ['ngons'] },
      { naam: 'hilly-prop-ruins-pillar-a', bronmodel: 'Hilly_Prop_Ruins_Pillar_1', kind: 'str-part-pillar', tags: ['broken'] },
      { naam: 'hilly-prop-ruins-pillar-b', bronmodel: 'Hilly_Prop_Ruins_Pillar_2', kind: 'str-part-pillar', tags: ['broken'] },
      { naam: 'hilly-prop-ruins-pillar-c', bronmodel: 'Hilly_Prop_Ruins_Pillar_3', kind: 'str-part-pillar', tags: ['broken'] },
      { naam: 'hilly-prop-ruins-pillar-d', bronmodel: 'Hilly_Prop_Ruins_Pillar_4', kind: 'str-part-pillar', tags: ['broken'] },
      { naam: 'hilly-prop-ruins-pillar-e', bronmodel: 'Hilly_Prop_Ruins_Pillar_5', kind: 'str-part-pillar', tags: ['broken'] },
    ],
  },
];

const TIJDELIJK = join(ROOT, 'kits', 'sources', '.uitgepakt', '.png');

function alsPng(pad) {
  if (extname(pad).toLowerCase() === '.png') return pad;
  mkdirSync(TIJDELIJK, { recursive: true });
  const doel = join(TIJDELIJK, `${createHash('sha1').update(pad).digest('hex').slice(0, 16)}.png`);
  if (!existsSync(doel)) execFileSync('convert', [pad, doel]);
  return doel;
}

function zetTexturen(model, plaatjes) {
  for (const primitief of model.primitieven) {
    const materiaal = primitief.materiaal;
    if (!materiaal?.textuur) continue;
    if (materiaal.textuur.includes('/') && existsSync(materiaal.textuur)) {
      materiaal.textuur = alsPng(materiaal.textuur);
      continue;
    }
    const gezocht = basename(materiaal.textuur).toLowerCase();
    const raak = plaatjes.find((pad) => basename(pad).toLowerCase() === gezocht);
    if (raak) materiaal.textuur = alsPng(raak);
  }
}

const regels = [];
const perKit = new Map();

for (const pakket of PAKKETTEN) {
  const bronkit = BRONKITS.find(
    (b) => b.map === pakket.bron && (pakket.submap ? b.submap === pakket.submap : !b.submap),
  );
  if (!bronkit) throw new Error(`${pakket.bron}: not in BRONKITS`);
  pakket.naam = bronkit.naam;
  pakket.generator = 'tools/importeer/ontbrekend.mjs';

  const { modellen, uitgepakt } = bronModellen(bronkit);
  const perNaam = new Map(modellen.map((model) => [model.naam, model]));
  const plaatjes = alleBestanden(uitgepakt).filter((pad) => /\.(png|jpe?g)$/i.test(pad));

  for (const opgave of pakket.modellen) {
    const veld = pakket.raster ? 'cellen' : 'kleuren';
    opgave[veld] = { ...(pakket.sleutels ?? {}), ...(opgave[veld] ?? {}) };
    if (!opgave[veld]['*']) throw new Error(`${pakket.kit}/${opgave.naam}: no fallback band`);
  }
  const plek = pakket.raster ? null : bandPlekken(pakket);
  const doelMap = kitMap(pakket.kit);

  console.log(`\n${pakket.kit}  (${bronkit.naam})`);
  for (const opgave of pakket.modellen) {
    const model = perNaam.get(opgave.bronmodel);
    if (!model) throw new Error(`${opgave.bronmodel}: not in ${pakket.bron}`);
    if (pakket.atlas) zetTexturen(model, plaatjes);
    const gekeerd = richtSchillen(model);
    const gericht = pakket.raster ? 0 : richtWinding(model);

    const mesh = bouw(model.primitieven, opgave, pakket, plek);
    schrijf(join(doelMap, `${opgave.naam}.glb`), mesh, opgave, pakket);

    const materialen = [...mesh.materialen];
    regels.push([`${pakket.kit}/${opgave.naam}`, [opgave.kind, ...materialen, ...opgave.tags]]);
    perKit.set(pakket.kit, [...(perKit.get(pakket.kit) ?? []), opgave.naam]);

    console.log(
      `  ${opgave.bronmodel.padEnd(32)} → ${opgave.naam.padEnd(28)} `
        + `${String(mesh.driehoeken.length / 3).padStart(6)} tris, `
        + `${mesh.banden.size} band(s): ${[...mesh.banden].join(', ')}`
        + `${gekeerd ? `, ${gekeerd} turned out` : ''}`
        + `${gericht ? `, ${gericht} rewound` : ''}`,
    );
  }
}

zetTags(regels);
zetManifest(perKit);
console.log(`\n${regels.length} models added to kits/workfiles`);
