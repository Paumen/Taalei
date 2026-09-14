import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeGlb } from '../../catalog/tools/glb.mjs';
import { pakUit } from '../../catalog/tools/zip.mjs';
import { leesGltf } from './bron.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRON_MAP = 'Asian_Cementery_Rocks_Packs';
const PACKS = {
  Asian_Pack: { kit: 'asia-pack', naam: 'Asian Pack' },
  CementeryPack: { kit: 'asia-grave', naam: 'Cementery Pack' },
  RocksPack: { kit: 'asia-rocks', naam: 'Rocks Pack' },
};
const KITS = Object.values(PACKS).map((p) => p.kit);
const SCHAAL = 0.175;
const RAND = [0.05, 0.95];

const BANDEN = {
  tan: [0, 0],
  camel: [1, 0],
  chestnut: [2, 0],
  umber: [3, 0],
  terracotta: [5, 0],
  amber: [6, 0],
  sienna: [8, 0],
  hunter: [1, 1],
  moss: [3, 1],
  slate: [6, 1],
  ivory: [5, 2],
  basalt: [13, 3],
  taupe: [14, 3],
  nickel: [15, 3],
};

const ATLASSEN = {
  'ColorPalette.png': 'p1',
  'ColorPalette2.png': 'p2',
  '36e533819afa2dfb.png': 'p1',
  'db6e18e2256954cd.png': 'p2',
};

const steen = ['stone-masonry', 'taupe'];
const grafsteen = ['stone-masonry', 'nickel'];
const rots = ['stone-rock', 'nickel'];
const balk = ['wood-beam', 'chestnut'];
const bewerkt = ['wood-worked', 'camel'];
const plank = ['wood-planks', 'tan'];
const dakpan = ['ceramic', 'sienna'];
const smeedijzer = ['metal-iron-wrought', 'basalt'];
const gietijzer = ['metal-iron-cast', 'slate'];
const blad = ['foliage', 'moss'];
const boomblad = ['foliage', 'hunter'];
const schors = ['wood-bark', 'umber'];
const goud = ['metal-gold', 'amber'];

const MODELLEN = {
  altar: {
    naam: 'altar-a', kind: 'str', tags: ['asia', 'ngons'],
    vlakken: { 'p1:21:0': dakpan, 'p1:1:0': bewerkt, 'p1:29:0': steen, 'p1:30:0': steen, 'p1:28:0': steen, 'p1:10:0': balk, 'p1:9:0': balk },
  },
  altar2: {
    naam: 'altar-b', kind: 'str', tags: ['asia', 'ngons'],
    vlakken: { 'p1:21:0': dakpan, 'p1:1:0': bewerkt, 'p1:29:0': steen, 'p1:30:0': steen, 'p1:28:0': steen, 'p1:10:0': balk, 'p1:9:0': balk },
  },
  ancient_tree_1: {
    naam: 'tree-ancient-a', kind: 'env-flora-tree', tags: ['asia'],
    vlakken: { 'p1:38:1': boomblad, 'p1:34:1': schors },
  },
  ancient_tree_2: {
    naam: 'tree-ancient-b', kind: 'env-flora-tree', tags: ['asia'],
    vlakken: { 'p1:38:1': boomblad, 'p1:34:1': schors },
  },
  arch: { naam: 'arch-beam', kind: 'str-part-wall', tags: ['asia'], vlakken: { 'p1:9:0': balk } },
  arch_2: { naam: 'torii', kind: 'str-part-door', tags: ['asia'], vlakken: { 'p1:9:0': balk, 'p1:41:0': bewerkt } },
  bamboo_3: {
    naam: 'bamboo-a', kind: 'env-flora-plant', tags: ['asia', 'plural'],
    vlakken: { 'p1:5:1': blad, 'p1:14:1': blad, 'p1:21:1': ['vegetation', 'taupe'] },
  },
  bamboo_9: {
    naam: 'bamboo-b', kind: 'env-flora-plant', tags: ['asia', 'plural'],
    vlakken: { 'p1:5:1': blad, 'p1:14:1': blad, 'p1:21:1': ['vegetation', 'taupe'] },
  },
  bamboo_6: {
    naam: 'bamboo-c', kind: 'env-flora-plant', tags: ['asia', 'plural'],
    vlakken: { 'p1:5:1': blad, 'p1:14:1': blad, 'p1:21:1': ['vegetation', 'taupe'] },
  },
  barrel_1: {
    naam: 'barrel-a', kind: 'obj-container-barrel', tags: ['asia', 'ngons'], use: ['container'],
    vlakken: { 'p1:41:0': bewerkt, 'p1:14:0': plank, 'p1:1:0': smeedijzer },
  },
  barrel_2: {
    naam: 'barrel-b', kind: 'obj-container-barrel', tags: ['asia', 'ngons'], use: ['container'],
    vlakken: { 'p1:41:0': bewerkt, 'p1:14:0': plank, 'p1:1:0': smeedijzer },
  },
  bell: {
    naam: 'bell', kind: 'obj', tags: ['asia', 'ngons'],
    vlakken: { 'p1:6:0': ['metal-copper', 'terracotta'], 'p1:1:0': bewerkt, 'p1:9:0': balk, 'p1:29:0': steen },
  },
  brazier: {
    naam: 'brazier', kind: 'obj-lighting-torch', tags: ['asia', 'ngons'], use: ['light'],
    vlakken: { 'p1:37:0': smeedijzer, 'p1:57:0': gietijzer },
  },
  bridge: { naam: 'bridge-wood', kind: 'str-access-bridge', tags: ['asia'], vlakken: { 'p1:9:0': balk } },
  bridge_stone: {
    naam: 'bridge-stone', kind: 'str-access-bridge', tags: ['asia'],
    vlakken: { 'p1:29:0': steen, 'p1:30:0': steen, 'p1:28:0': steen },
  },
  building_1: {
    naam: 'house-a', kind: 'str-building', tags: ['asia'],
    vlakken: { 'p1:9:0': balk, 'p1:17:0': dakpan, 'p1:1:0': bewerkt, 'p1:14:0': plank, 'p1:26:0': steen },
  },
  building_2: {
    naam: 'house-b', kind: 'str-building', tags: ['asia'],
    vlakken: { 'p1:9:0': balk, 'p1:17:0': dakpan, 'p1:1:0': bewerkt, 'p1:14:0': plank, 'p1:26:0': steen },
  },
  building_3: {
    naam: 'house-c', kind: 'str-building', tags: ['asia'],
    vlakken: { 'p1:9:0': balk, 'p1:17:0': dakpan, 'p1:1:0': bewerkt, 'p1:14:0': plank, 'p1:26:0': steen },
  },
  cart: {
    naam: 'cart', kind: 'obj-transport-cart', tags: ['asia'], use: ['transport'],
    vlakken: { 'p1:9:0': balk, 'p1:14:0': bewerkt, 'p1:41:0': bewerkt },
  },
  clover: { naam: 'clover', kind: 'env-flora-plant', tags: ['asia', 'plural'], vlakken: { 'p1:26:1': blad } },
  door_left: { naam: 'door-left', kind: 'str-part-door', tags: ['asia'], vlakken: { 'p1:1:0': bewerkt } },
  door_right: { naam: 'door-right', kind: 'str-part-door', tags: ['asia'], vlakken: { 'p1:1:0': bewerkt } },
  drum: {
    naam: 'drum', kind: 'obj', tags: ['asia', 'ngons'],
    vlakken: { 'p1:1:0': bewerkt, 'p1:9:0': balk, 'p1:14:0': balk, 'p1:37:0': smeedijzer, 'p1:45:0': ['leather', 'umber'] },
  },
  egg: { naam: 'egg', kind: 'env-remains', tags: ['asia'], vlakken: { 'p1:26:0': ['bone', 'ivory'], 'p1:29:1': ['bone', 'ivory'] } },
  fence_1: { naam: 'fence-corner', kind: 'str-barrier-fence', tags: ['asia'], vlakken: { 'p1:9:0': balk } },
  fence_2: { naam: 'fence-a', kind: 'str-barrier-fence', tags: ['asia'], vlakken: { 'p1:9:0': balk } },
  fence_3: { naam: 'fence-b', kind: 'str-barrier-fence', tags: ['asia'], vlakken: { 'p1:9:0': balk } },
  fighting_post: { naam: 'training-post', kind: 'obj', tags: ['asia'], vlakken: { 'p1:9:0': balk, 'p1:41:0': bewerkt } },
  forge: {
    naam: 'forge', kind: 'str', tags: ['asia'],
    vlakken: { 'p1:29:0': steen, 'p1:57:0': gietijzer, 'p1:37:0': smeedijzer },
  },
  frame: { naam: 'frame-wood', kind: 'str-part-frame', tags: ['asia'], vlakken: { 'p1:9:0': balk, 'p1:1:0': bewerkt } },
  garden_plant_1: { naam: 'plant-a', kind: 'env-flora-plant', tags: ['asia'], vlakken: { 'p1:26:1': blad } },
  garden_plant_4: {
    naam: 'plant-b', kind: 'env-flora-plant', tags: ['asia'],
    vlakken: { 'p1:26:1': blad, 'p1:25:1': blad, 'p1:53:0': ['vegetation', 'terracotta'], 'p1:5:0': ['vegetation', 'terracotta'] },
  },
  garden_plant_5: { naam: 'plant-c', kind: 'env-flora-plant', tags: ['asia'], vlakken: { 'p1:26:1': blad, 'p1:25:1': blad } },
  garden_plant_8: {
    naam: 'plant-d', kind: 'env-flora-plant', tags: ['asia'],
    vlakken: { 'p1:2:0': ['vegetation', 'terracotta'], 'p1:1:0': ['vegetation', 'terracotta'] },
  },
  garden_tree_1: {
    naam: 'tree-garden', kind: 'env-flora-tree', tags: ['asia'],
    vlakken: { 'p1:26:1': boomblad, 'p1:34:1': schors },
  },
  gong: {
    naam: 'gong', kind: 'obj', tags: ['asia', 'ngons'],
    vlakken: { 'p1:6:0': ['metal-copper', 'terracotta'], 'p1:29:0': steen, 'p1:1:0': bewerkt, 'p1:41:0': bewerkt, 'p1:9:0': balk },
  },
  granary: {
    naam: 'granary', kind: 'str-building', tags: ['asia'],
    vlakken: { 'p1:9:0': balk, 'p1:21:0': dakpan, 'p1:29:0': steen, 'p1:26:0': steen },
  },
  grave_1: { naam: 'grave-a', kind: 'str-marker-tombstone', tags: ['asia'], vlakken: { 'p1:29:0': steen, 'p1:30:0': steen, 'p1:31:0': steen } },
  grave_2: { naam: 'grave-b', kind: 'str-marker-tombstone', tags: ['asia'], vlakken: { 'p1:29:0': steen, 'p1:30:0': steen, 'p1:31:0': steen } },
  grave_3: { naam: 'grave-c', kind: 'str-marker-tombstone', tags: ['asia'], vlakken: { 'p1:29:0': steen, 'p1:30:0': steen, 'p1:31:0': steen } },
  grave_4: { naam: 'grave-d', kind: 'str-marker-tombstone', tags: ['asia'], vlakken: { 'p1:29:0': steen, 'p1:30:0': steen, 'p1:31:0': steen } },
  gravel_1: { naam: 'gravel-a', kind: 'env-rock-pebble', tags: ['asia', 'plural'], vlakken: { 'p1:29:0': rots } },
  gravel_2: { naam: 'gravel-b', kind: 'env-rock-pebble', tags: ['asia', 'plural'], vlakken: { 'p1:29:0': rots } },
  gravel_3: { naam: 'gravel-c', kind: 'env-rock-pebble', tags: ['asia', 'plural'], vlakken: { 'p1:29:0': rots } },
  graves_group: { naam: 'graves-a', kind: 'str-marker-tombstone', tags: ['asia', 'plural'], vlakken: { 'p1:29:0': steen } },
  graves_group2: { naam: 'graves-b', kind: 'str-marker-tombstone', tags: ['asia', 'plural'], vlakken: { 'p1:29:0': steen } },
  hive: { naam: 'hive', kind: 'env-remains', tags: ['asia'], vlakken: { 'p1:49:0': ['food', 'amber'] } },
  lamp: {
    naam: 'stone-lantern', kind: 'obj-lighting-lantern', tags: ['asia', 'ngons'], use: ['light'],
    vlakken: { 'p1:29:0': steen, 'p1:57:0': smeedijzer },
  },
  mineral_ore: { naam: 'ore-gold', kind: 'env-rock', tags: ['asia'], vlakken: { 'p1:6:0': goud, 'p1:5:0': goud } },
  nest: { naam: 'nest', kind: 'env-remains', tags: ['asia'], vlakken: { 'p1:53:0': ['vegetation', 'taupe'] } },
  net: { naam: 'net', kind: 'obj-tool-supplies', tags: ['asia'], use: ['tool'], vlakken: { 'p1:41:0': ['rope', 'taupe'], 'p1:34:1': schors } },
  pillar_1: { naam: 'pillar-wood', kind: 'str-part-pillar', tags: ['asia'], vlakken: { 'p1:9:0': balk, 'p1:1:0': bewerkt } },
  pillar_2: { naam: 'pillar-a', kind: 'str-part-pillar', tags: ['asia', 'ngons'], vlakken: { 'p1:29:0': steen, 'p1:1:0': goud } },
  pillar_2_long: { naam: 'pillar-a-tall', kind: 'str-part-pillar', tags: ['asia', 'ngons'], vlakken: { 'p1:29:0': steen, 'p1:1:0': goud } },
  pillar_3: { naam: 'pillar-b', kind: 'str-part-pillar', tags: ['asia', 'ngons'], vlakken: { 'p1:29:0': steen, 'p1:1:0': goud } },
  pillar_3_long: { naam: 'pillar-b-tall', kind: 'str-part-pillar', tags: ['asia', 'ngons'], vlakken: { 'p1:29:0': steen, 'p1:1:0': goud } },
  pillar_4: { naam: 'pillar-c', kind: 'str-part-pillar', tags: ['asia', 'ngons'], vlakken: { 'p1:29:0': steen } },
  pillar_4_long: { naam: 'pillar-c-tall', kind: 'str-part-pillar', tags: ['asia', 'ngons'], vlakken: { 'p1:29:0': steen } },
  platform: {
    naam: 'platform-stone', kind: 'str-platform-deck', tags: ['asia', 'ngons'],
    vlakken: { 'p1:30:0': steen, 'p1:29:0': steen, 'p1:28:0': steen },
  },
  post_1: { naam: 'post-a', kind: 'str-barrier-post', tags: ['asia'], vlakken: { 'p1:9:0': balk, 'p1:41:0': bewerkt } },
  post_2: { naam: 'post-b', kind: 'str-barrier-post', tags: ['asia'], vlakken: { 'p1:9:0': balk, 'p1:41:0': bewerkt } },
  pot_1: {
    naam: 'pot-large', kind: 'obj-container-pot', tags: ['asia', 'ngons'], use: ['container'],
    vlakken: { 'p1:30:0': ['ceramic', 'taupe'], 'p1:31:0': ['ceramic', 'taupe'] },
  },
  pot_2: {
    naam: 'pot-small', kind: 'obj-container-pot', tags: ['asia', 'ngons'], use: ['container'],
    vlakken: { 'p1:30:0': ['ceramic', 'taupe'] },
  },
  rock_big_1: { naam: 'rock-large-a', kind: 'env-rock-boulder', tags: ['asia'], vlakken: { 'p1:33:0': rots } },
  rock_big_2: { naam: 'rock-large-b', kind: 'env-rock-boulder', tags: ['asia'], vlakken: { 'p1:33:0': rots } },
  rock_big_3: { naam: 'rock-large-c', kind: 'env-rock-boulder', tags: ['asia'], vlakken: { 'p1:33:0': rots } },
  rock_medium_1: { naam: 'rock-medium-a', kind: 'env-rock-boulder', tags: ['asia'], vlakken: { 'p1:33:0': rots } },
  rock_medium_2: { naam: 'rock-medium-b', kind: 'env-rock-boulder', tags: ['asia'], vlakken: { 'p1:33:0': rots } },
  rock_medium_3: { naam: 'rock-medium-c', kind: 'env-rock-boulder', tags: ['asia'], vlakken: { 'p1:33:0': rots } },
  rock_medium_4: { naam: 'rock-medium-d', kind: 'env-rock-boulder', tags: ['asia'], vlakken: { 'p1:33:0': rots } },
  rock_small_1: { naam: 'rock-small-a', kind: 'env-rock-boulder', tags: ['asia'], vlakken: { 'p1:33:0': rots } },
  rock_small_2: { naam: 'rock-small-b', kind: 'env-rock-boulder', tags: ['asia'], vlakken: { 'p1:33:0': rots } },
  rock_small_3: { naam: 'rock-small-c', kind: 'env-rock-boulder', tags: ['asia'], vlakken: { 'p1:33:0': rots } },
  rock_small_4: { naam: 'rock-small-d', kind: 'env-rock-pebble', tags: ['asia'], vlakken: { 'p1:33:0': rots } },
  rock_small_5: { naam: 'rock-small-e', kind: 'env-rock-boulder', tags: ['asia'], vlakken: { 'p1:33:0': rots } },
  rock_block_1: { naam: 'rock-block-a', kind: 'env-rock-boulder', tags: ['asia'], vlakken: { 'p1:33:0': rots } },
  rock_block_2: { naam: 'rock-block-b', kind: 'env-rock-boulder', tags: ['asia'], vlakken: { 'p1:33:0': rots } },
  rock_block_3: { naam: 'rock-block-c', kind: 'env-rock-boulder', tags: ['asia'], vlakken: { 'p1:33:0': rots } },
  roof: {
    naam: 'roof-pagoda', kind: 'str-part-roof', tags: ['asia', 'ngons'],
    vlakken: { 'p1:21:0': dakpan, 'p1:10:0': balk, 'p1:9:0': balk },
  },
  shop: {
    naam: 'market-house', kind: 'str-building', tags: ['asia'],
    vlakken: { 'p1:9:0': balk, 'p1:21:0': dakpan, 'p1:1:0': bewerkt, 'p1:14:0': plank, 'p1:26:0': steen },
  },
  shrine: {
    naam: 'shrine-small', kind: 'str', tags: ['asia'],
    vlakken: { 'p1:9:0': balk, 'p1:21:0': dakpan, 'p1:1:0': bewerkt, 'p1:14:0': plank, 'p1:26:0': steen },
  },
  shrine_2: {
    naam: 'shrine-large', kind: 'str', tags: ['asia'],
    vlakken: { 'p1:1:0': bewerkt, 'p1:21:0': dakpan, 'p1:29:0': steen, 'p1:9:0': balk, 'p1:26:0': steen },
  },
  stand: {
    naam: 'market-stand', kind: 'str-stands', tags: ['asia'],
    vlakken: { 'p1:9:0': balk, 'p1:10:1': ['food', 'moss'], 'p1:17:0': ['food', 'terracotta'], 'p1:1:1': ['food', 'amber'], 'p1:49:0': ['food', 'amber'] },
  },
  statue_frog: { naam: 'statue-frog', kind: 'obj', tags: ['asia'], vlakken: { 'p1:29:0': steen } },
  statue_monk: { naam: 'statue-monk', kind: 'obj', tags: ['asia'], vlakken: { 'p1:29:0': steen } },
  steps: { naam: 'steps-stone', kind: 'str-access-stairs', tags: ['asia'], vlakken: { 'p1:29:0': steen, 'p1:30:0': steen } },
  stonewall_1: {
    naam: 'garden-wall-a', kind: 'str-barrier', tags: ['asia'],
    vlakken: { 'p1:26:0': steen, 'p1:1:0': dakpan, 'p1:6:0': dakpan },
  },
  stonewall_2: {
    naam: 'garden-wall-b', kind: 'str-barrier', tags: ['asia'],
    vlakken: { 'p1:26:0': steen, 'p1:1:0': dakpan, 'p1:6:0': dakpan, 'p1:9:0': balk },
  },
  stonewall_3: {
    naam: 'garden-wall-c', kind: 'str-barrier', tags: ['asia'],
    vlakken: { 'p1:26:0': steen, 'p1:1:0': dakpan, 'p1:6:0': dakpan },
  },
  stonewall_4: {
    naam: 'garden-wall-d', kind: 'str-barrier', tags: ['asia'],
    vlakken: { 'p1:26:0': steen, 'p1:1:0': dakpan, 'p1:6:0': dakpan },
  },
  stonewall_5: { naam: 'garden-wall-e', kind: 'str-barrier', tags: ['asia'], vlakken: { 'p1:29:0': steen } },
  tower: {
    naam: 'tower', kind: 'str-building', tags: ['asia'],
    vlakken: { 'p1:9:0': balk, 'p1:21:0': dakpan, 'p1:29:0': steen, 'p1:14:0': plank, 'p1:26:0': steen },
  },
  urn_1: {
    naam: 'urn-a', kind: 'obj-container-pot', tags: ['asia', 'ngons'], use: ['container'],
    vlakken: { 'p1:29:0': ['ceramic', 'taupe'], 'p1:30:0': ['ceramic', 'taupe'] },
  },
  urn_2: {
    naam: 'urn-b', kind: 'obj-container-pot', tags: ['asia', 'ngons'], use: ['container'],
    vlakken: { 'p1:1:0': ['ceramic', 'terracotta'], 'p1:2:0': ['ceramic', 'terracotta'] },
  },
  wall_decor_1: { naam: 'wall-decor-a', kind: 'str-part-wall', tags: ['asia'], vlakken: { 'p1:1:0': bewerkt } },
  wall_decor_2: { naam: 'wall-decor-b', kind: 'str-part-wall', tags: ['asia'], vlakken: { 'p1:29:0': steen } },
  wall_decor_3: { naam: 'wall-decor-c', kind: 'str-part-wall', tags: ['asia'], vlakken: { 'p1:29:0': steen } },
  wall_decor_4: { naam: 'wall-decor-d', kind: 'str-part-wall', tags: ['asia'], vlakken: { 'p1:1:0': bewerkt } },
  well: { naam: 'well', kind: 'str-building', tags: ['asia', 'ngons'], vlakken: { 'p1:29:0': steen, 'p1:14:0': balk } },
  wheel: { naam: 'waterwheel', kind: 'str', tags: ['asia', 'ngons'], vlakken: { 'p1:14:0': balk, 'p1:13:0': plank } },
  wood_1: { naam: 'plank-a', kind: 'obj-resource-wood-plank', tags: ['asia'], vlakken: { 'p1:14:0': plank } },
  wood_2: { naam: 'plank-b', kind: 'obj-resource-wood-plank', tags: ['asia'], vlakken: { 'p1:14:0': plank } },
  wood_3: { naam: 'plank-c', kind: 'obj-resource-wood-plank', tags: ['asia'], vlakken: { 'p1:14:0': plank } },
  wood_4: { naam: 'plank-d', kind: 'obj-resource-wood-plank', tags: ['asia'], vlakken: { 'p1:14:0': plank } },

  'arch.001': { naam: 'arch-stone', kind: 'str-part-wall', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  block: { naam: 'stone-block', kind: 'obj-resource-stone', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  bones_1: { naam: 'bones-a', kind: 'env-remains-bones', tags: ['halloween', 'plural'], vlakken: { 'p2:17:0': ['bone', 'ivory'] } },
  bones_2: { naam: 'bones-b', kind: 'env-remains-bones', tags: ['halloween', 'plural'], vlakken: { 'p2:17:0': ['bone', 'ivory'] } },
  bones_group: { naam: 'bones-pile', kind: 'env-remains-bones', tags: ['halloween', 'plural'], vlakken: { 'p2:18:0': ['bone', 'ivory'] } },
  coffin: { naam: 'coffin-a', kind: 'obj-container', tags: ['halloween'], use: ['container'], vlakken: { 'p2:6:1': bewerkt } },
  coffin_2: { naam: 'coffin-b', kind: 'obj-container', tags: ['halloween'], use: ['container'], vlakken: { 'p2:6:1': bewerkt } },
  column_1: { naam: 'column-tall', kind: 'str-part-pillar', tags: ['halloween', 'ngons'], vlakken: { 'p2:46:1': grafsteen } },
  column_2: { naam: 'column-medium', kind: 'str-part-pillar', tags: ['halloween', 'ngons'], vlakken: { 'p2:46:1': grafsteen } },
  column_3: { naam: 'column-short', kind: 'str-part-pillar', tags: ['halloween', 'ngons'], vlakken: { 'p2:46:1': grafsteen, 'p2:45:1': grafsteen } },
  crate: { naam: 'crate', kind: 'obj-container-crate', tags: ['halloween'], use: ['container'], vlakken: { 'p2:5:1': bewerkt } },
  fence_fragment: { naam: 'iron-fence-broken', kind: 'str-barrier-fence', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen, 'p2:61:1': gietijzer } },
  fence_large: { naam: 'iron-fence-large', kind: 'str-barrier-fence', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen, 'p2:61:1': gietijzer } },
  fence_medium: { naam: 'iron-fence-medium', kind: 'str-barrier-fence', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen, 'p2:61:1': gietijzer } },
  fence_short: { naam: 'iron-fence-short', kind: 'str-barrier-fence', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen, 'p2:61:1': gietijzer } },
  fence_pillar_1: { naam: 'iron-fence-post-a', kind: 'str-barrier-fence', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  fence_pillar_2: { naam: 'iron-fence-post-b', kind: 'str-barrier-fence', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  fence_pillar_3: { naam: 'iron-fence-post-c', kind: 'str-barrier-fence', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  'lamp.001': {
    naam: 'lamppost', kind: 'obj-lighting-lantern', tags: ['halloween'], use: ['light'],
    vlakken: { 'p2:62:1': smeedijzer, 'p2:61:1': gietijzer, 'p2:57:0': ['emissive', 'amber'] },
  },
  metal_fence: { naam: 'iron-fence-bars', kind: 'str-barrier-fence', tags: ['halloween'], vlakken: { 'p2:61:1': gietijzer } },
  outside_fence: { naam: 'iron-fence-run', kind: 'str-barrier-fence', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen, 'p2:61:1': gietijzer } },
  prop_tomb_1: { naam: 'tombstone-a', kind: 'str-marker-tombstone', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  prop_tomb_2: { naam: 'tombstone-b', kind: 'str-marker-tombstone', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  prop_tomb_3: { naam: 'tombstone-c', kind: 'str-marker-tombstone', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  prop_tomb_4: { naam: 'tombstone-d', kind: 'str-marker-tombstone', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  prop_tomb_5: { naam: 'tombstone-e', kind: 'str-marker-tombstone', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  tile_1: { naam: 'floor-tile-a', kind: 'str-part-floor', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  tile_2: { naam: 'floor-tile-b', kind: 'str-part-floor', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  tile_3: { naam: 'floor-tile-c', kind: 'str-part-floor', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  tile_4: { naam: 'floor-tile-d', kind: 'str-part-floor', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  tile_5: { naam: 'floor-tile-e', kind: 'str-part-floor', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  tomb_1: {
    naam: 'tomb-obelisk', kind: 'str-marker-tombstone', tags: ['halloween'],
    vlakken: { 'p2:46:1': grafsteen, 'p2:44:1': grafsteen, 'p2:45:1': grafsteen, 'p2:47:1': grafsteen },
  },
  tomb_2: { naam: 'tomb-a', kind: 'str-marker-tombstone', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  tomb_3: { naam: 'tomb-b', kind: 'str-marker-tombstone', tags: ['halloween'], vlakken: { 'p2:46:1': grafsteen } },
  tomb_statue: { naam: 'statue-mourner', kind: 'obj', tags: ['halloween'], vlakken: { 'p2:45:1': grafsteen, 'p2:46:1': grafsteen } },

  rock_big_B_1: { naam: 'boulder-a', kind: 'env-rock-boulder', tags: [], vlakken: { 'p2:10:0': ['stone-rock', 'taupe'] } },
  rock_big_B_2: { naam: 'boulder-b', kind: 'env-rock-boulder', tags: [], vlakken: { 'p2:10:0': ['stone-rock', 'taupe'] } },
  rock_big_B_3: { naam: 'boulder-c', kind: 'env-rock-boulder', tags: [], vlakken: { 'p2:10:0': ['stone-rock', 'taupe'] } },
  rock_big_B_4: { naam: 'boulder-d', kind: 'env-rock-boulder', tags: [], vlakken: { 'p2:10:0': ['stone-rock', 'taupe'] } },
  rock_big_B_5: { naam: 'boulder-e', kind: 'env-rock-boulder', tags: [], vlakken: { 'p2:10:0': ['stone-rock', 'taupe'] } },
  'Cube.010': { naam: 'boulder-dark-a', kind: 'env-rock-boulder', tags: [], vlakken: { 'p2:57:1': rots } },
  rock_big_B_dark_2: { naam: 'boulder-dark-b', kind: 'env-rock-boulder', tags: [], vlakken: { 'p2:57:1': rots } },
  rock_big_B_dark_3: { naam: 'boulder-dark-c', kind: 'env-rock-boulder', tags: [], vlakken: { 'p2:57:1': rots } },
  rock_big_B_dark_4: { naam: 'boulder-dark-d', kind: 'env-rock-boulder', tags: [], vlakken: { 'p2:57:1': rots } },
  rock_big_B_dark_5: { naam: 'boulder-dark-e', kind: 'env-rock-boulder', tags: [], vlakken: { 'p2:57:1': rots } },
};

const LOD = /_LOD(\d+)$/i;
const grofsteWeg = (naam) => {
  const match = naam.match(LOD);
  if (!match) return naam;
  return Number(match[1]) === 0 ? naam.replace(LOD, '') : null;
};

function alleBestanden(dir, uit = []) {
  for (const naam of readdirSync(dir, { withFileTypes: true })) {
    const pad = join(dir, naam.name);
    if (naam.isDirectory()) alleBestanden(pad, uit);
    else uit.push(pad);
  }
  return uit;
}

function pakBronUit() {
  const map = join(ROOT, 'kits', 'sources', BRON_MAP);
  const doel = join(ROOT, 'kits', 'sources', '.uitgepakt', BRON_MAP);
  const zips = readdirSync(map).filter((n) => n.toLowerCase().endsWith('.zip')).sort();
  const stempel = join(doel, '.klaar');
  if (!existsSync(stempel)) {
    rmSync(doel, { recursive: true, force: true });
    for (const zip of zips) pakUit(join(map, zip), doel);
    writeFileSync(stempel, zips.join('\n') + '\n');
  }
  return doel;
}

function bronModellen() {
  const uitgepakt = pakBronUit();
  const mappen = [...new Set(alleBestanden(uitgepakt).filter((p) => extname(p).toLowerCase() === '.glb').map(dirname))].sort();

  const modellen = [];
  for (const map of mappen) {
    const pack = basename(map);
    if (!PACKS[pack]) throw new Error(`${pack}: no kit for this pack in ${BRON_MAP}`);
    for (const bestand of readdirSync(map).filter((n) => n.toLowerCase().endsWith('.glb')).sort()) {
      const perMesh = new Map();
      for (const primitief of leesGltf(join(map, bestand))) {
        const naam = grofsteWeg(primitief.naam);
        if (!naam) continue;
        if (perMesh.has(naam)) perMesh.get(naam).push(primitief);
        else perMesh.set(naam, [primitief]);
      }
      for (const [naam, primitieven] of perMesh) modellen.push({ naam, pack, primitieven });
    }
  }

  const gezien = new Map();
  for (const model of modellen) {
    const n = (gezien.get(model.naam) ?? 0) + 1;
    gezien.set(model.naam, n);
    if (n > 1) model.naam = `${model.naam}-${n}`;
  }
  return modellen;
}

const vlakSleutel = (primitief, u, v) => {
  const atlas = ATLASSEN[basename(primitief.materiaal.textuur ?? '')];
  if (!atlas) throw new Error(`${primitief.naam}: unknown palette ${primitief.materiaal.textuur}`);
  return `${atlas}:${Math.floor(u * 64)}:${Math.floor(v * 2)}`;
};

function bereiken(modellen) {
  const uit = new Map();
  for (const { primitieven } of modellen) {
    for (const primitief of primitieven) {
      if (!primitief.uvs) throw new Error(`${primitief.naam}: no uvs`);
      for (let i = 0; i < primitief.uvs.length / 2; i++) {
        const u = primitief.uvs[i * 2];
        const v = primitief.uvs[i * 2 + 1];
        const sleutel = vlakSleutel(primitief, u, v);
        const bereik = uit.get(sleutel);
        if (!bereik) uit.set(sleutel, { min: v, max: v });
        else {
          if (v < bereik.min) bereik.min = v;
          if (v > bereik.max) bereik.max = v;
        }
      }
    }
  }
  return uit;
}

function bouw(model, opgave, bereik) {
  const laag = [Infinity, Infinity, Infinity];
  const hoog = [-Infinity, -Infinity, -Infinity];
  for (const primitief of model.primitieven) {
    for (let i = 0; i < primitief.posities.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = primitief.posities[i + k] * SCHAAL;
        if (v < laag[k]) laag[k] = v;
        if (v > hoog[k]) hoog[k] = v;
      }
    }
  }
  const midden = [(laag[0] + hoog[0]) / 2, laag[1], (laag[2] + hoog[2]) / 2];

  const perSleutel = new Map();
  const posities = [];
  const normalen = [];
  const uvs = [];
  const driehoeken = [];
  const banden = new Set();

  for (const primitief of model.primitieven) {
    const index = new Int32Array(primitief.posities.length / 3);
    for (let i = 0; i < index.length; i++) {
      const p = [0, 1, 2].map((k) => Math.fround(primitief.posities[i * 3 + k] * SCHAAL - midden[k]));
      const n = [0, 1, 2].map((k) => Math.fround(primitief.normalen ? primitief.normalen[i * 3 + k] : 0));

      const u = primitief.uvs[i * 2];
      const v = primitief.uvs[i * 2 + 1];
      const sleutel = vlakSleutel(primitief, u, v);
      const doel = opgave.vlakken[sleutel];
      if (!doel) throw new Error(`${model.naam}: no band for ${sleutel}`);
      const [kolom, rij] = BANDEN[doel[1]];
      banden.add(doel[1]);

      const { min, max } = bereik.get(sleutel);
      const deel = max > min ? (v - min) / (max - min) : 0.5;
      const t = [
        Math.fround((kolom + 0.5) / 16),
        Math.fround((rij + RAND[0] + deel * (RAND[1] - RAND[0])) / 4),
      ];

      const id = [...p, ...n, ...t].join(',');
      let bestaand = perSleutel.get(id);
      if (bestaand === undefined) {
        bestaand = posities.length / 3;
        perSleutel.set(id, bestaand);
        posities.push(...p);
        normalen.push(...n);
        uvs.push(...t);
      }
      index[i] = bestaand;
    }
    for (const i of primitief.indices) driehoeken.push(index[i]);
  }

  return {
    posities: Float32Array.from(posities),
    normalen: Float32Array.from(normalen),
    uvs: Float32Array.from(uvs),
    driehoeken,
    banden,
  };
}

function schrijf(pad, mesh, naam, bronmodel, bron) {
  const stukken = [];
  const accessors = [];
  const bufferViews = [];
  let lengte = 0;

  const voegToe = (data, doel, componentType, type, extra = {}) => {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const opvulling = (4 - (lengte % 4)) % 4;
    if (opvulling) { stukken.push(Buffer.alloc(opvulling)); lengte += opvulling; }
    bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length, ...(doel ? { target: doel } : {}) });
    stukken.push(buf);
    lengte += buf.length;
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType,
      count: extra.count,
      type,
      ...(extra.min ? { min: extra.min, max: extra.max } : {}),
    });
    return accessors.length - 1;
  };

  const aantal = mesh.posities.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < aantal; i++) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.posities[i * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }

  const attributes = {
    POSITION: voegToe(mesh.posities, 34962, 5126, 'VEC3', { count: aantal, min, max }),
    NORMAL: voegToe(mesh.normalen, 34962, 5126, 'VEC3', { count: aantal }),
    TEXCOORD_0: voegToe(mesh.uvs, 34962, 5126, 'VEC2', { count: aantal }),
  };
  const smal = aantal <= 0xffff;
  const indices = voegToe(
    smal ? Uint16Array.from(mesh.driehoeken) : Uint32Array.from(mesh.driehoeken),
    34963,
    smal ? 5123 : 5125,
    'SCALAR',
    { count: mesh.driehoeken.length },
  );

  const bin = Buffer.concat(stukken);
  const json = {
    asset: {
      generator: 'tools/importeer/asia-packs.mjs',
      version: '2.0',
      extras: { taaleiland: { versie: 1, schaal: SCHAAL, palet: 1, bron, bronmodel } },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: naam }],
    meshes: [{ primitives: [{ attributes, indices, material: 0 }] }],
    materials: [{
      name: 'colormap',
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
      doubleSided: true,
      alphaMode: 'OPAQUE',
    }],
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
    samplers: [{ minFilter: 9987 }],
    textures: [{ sampler: 0, source: 0 }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };

  writeGlb(pad, json, bin, writeFileSync);
}

function zetTags(regels) {
  const pad = join(ROOT, 'catalog', 'tags.json');
  const data = JSON.parse(readFileSync(pad, 'utf8'));
  const perId = new Map(data.tags.map((tag) => [tag.id, tag]));

  const nieuw = new Map();
  for (const [id, tags] of regels) {
    for (const tagId of tags) {
      if (!perId.has(tagId)) throw new Error(`${id}: tag ${tagId} is not in tags.json`);
      nieuw.set(tagId, [...(nieuw.get(tagId) ?? []), id]);
    }
  }
  for (const tag of data.tags) {
    if (!tag.models) continue;
    tag.models = [
      ...tag.models.filter((id) => !KITS.some((kit) => id.startsWith(`${kit}/`))),
      ...(nieuw.get(tag.id) ?? []).sort(),
    ];
  }
  writeFileSync(pad, JSON.stringify(data, null, 1) + '\n');
}

function zetManifest(perKit) {
  const pad = join(ROOT, 'catalog', 'manifest.js');
  let tekst = readFileSync(pad, 'utf8');

  for (const [slug, namen] of perKit) {
    const kit = {
      slug,
      name: slug,
      url: null,
      note: `Bronzip zonder licentiebestand en zonder maker; zie kits/workfiles/${slug}/LICENSE.txt.`,
      models: [...namen].sort(),
    };
    const blok = JSON.stringify(kit, null, 1)
      .split('\n')
      .map((regel) => ` ${regel}`)
      .join('\n');

    const merk = `\n {\n  "slug": "${slug}",`;
    const begin = tekst.indexOf(merk);
    if (begin === -1) {
      const eind = tekst.lastIndexOf('\n]');
      tekst = `${tekst.slice(0, eind)},\n${blok}${tekst.slice(eind)}`;
      continue;
    }
    const komma = tekst.indexOf('\n },\n', begin);
    const eind = (komma === -1 ? tekst.indexOf('\n }\n', begin) : komma) + 3;
    tekst = `${tekst.slice(0, begin + 1)}${blok}${tekst.slice(eind)}`;
  }

  writeFileSync(pad, tekst);
}

const modellen = bronModellen();
const perNaam = new Map(modellen.map((model) => [model.naam, model]));
const gekozen = Object.keys(MODELLEN).map((naam) => {
  const model = perNaam.get(naam);
  if (!model) throw new Error(`${naam}: not in ${BRON_MAP}`);
  return model;
});

const bereik = bereiken(gekozen);
const doelMappen = new Map();
for (const { kit } of Object.values(PACKS)) {
  const doelMap = join(ROOT, 'kits', 'workfiles', kit);
  mkdirSync(join(doelMap, 'Textures'), { recursive: true });
  copyFileSync(join(ROOT, 'kits', 'colormap.png'), join(doelMap, 'Textures', 'colormap.png'));
  for (const bestand of readdirSync(doelMap).filter((n) => n.endsWith('.glb'))) rmSync(join(doelMap, bestand));
  doelMappen.set(kit, doelMap);
}

const regels = [];
const perKit = new Map(KITS.map((kit) => [kit, []]));
for (const model of gekozen) {
  const opgave = MODELLEN[model.naam];
  const { kit, naam: bron } = PACKS[model.pack];
  const mesh = bouw(model, opgave, bereik);
  schrijf(join(doelMappen.get(kit), `${opgave.naam}.glb`), mesh, opgave.naam, model.naam, bron);

  const materialen = [...new Set(Object.values(opgave.vlakken).map(([materiaal]) => materiaal))];
  regels.push([
    `${kit}/${opgave.naam}`,
    [opgave.kind, ...materialen, ...(opgave.use ?? []).map((u) => `use:${u}`), ...opgave.tags],
  ]);
  perKit.get(kit).push(opgave.naam);
  console.log(
    `${model.naam.padEnd(20)} → ${kit.padEnd(11)} ${opgave.naam.padEnd(18)} ${mesh.driehoeken.length / 3} tris, ` +
      `${mesh.banden.size} band(s): ${[...mesh.banden].join(', ')}`,
  );
}

zetTags(regels);
zetManifest(perKit);
console.log('');
for (const [kit, namen] of perKit) console.log(`${namen.length} models → kits/workfiles/${kit}`);
