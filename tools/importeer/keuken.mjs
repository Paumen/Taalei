import { mkdirSync, readdirSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng } from '../../catalog/tools/png.mjs';
import { writeGlb } from '../../catalog/tools/glb.mjs';
import { leesFbx } from '../../catalog/tools/fbx.mjs';
import { pakUit } from '../../catalog/tools/zip.mjs';
import { leesObj } from './bron.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRON_DIR = join(ROOT, 'kits', 'sources');
const UITPAK_DIR = join(BRON_DIR, '.uitgepakt');
const WERK_DIR = join(ROOT, 'kits', 'workfiles');
const COLORMAP = join(ROOT, 'kits', 'colormap.png');

const KOLOMMEN = 16;
const RIJEN = 4;
const RAND = 0.05;

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
  silver: [3, 2],
  azure: [4, 2],
  ivory: [5, 2],
  basalt: [13, 3],
  taupe: [14, 3],
  nickel: [15, 3],
};

const KITS = [
  {
    kit: 'charming-kitchen',
    bron: 'Charming_Kitchen_set',
    naam: 'Charming Kitchen Set',
    formaat: 'fbx',
    schaal: 0.0025,
    modellen: [
      { bestand: 'container_kitchen_A_white', naam: 'canister-a-white', kleuren: { '#f8e0cf': 'ivory' } },
      { bestand: 'container_kitchen_B_red', naam: 'canister-b-red', kleuren: { '#d24321': 'terracotta' } },
      { bestand: 'container_kitchen_B_white', naam: 'canister-b-white', kleuren: { '#f8dfcd': 'ivory' } },
      { bestand: 'cuttingboard', naam: 'cutting-board', kleuren: { '#be825b': 'camel' } },
      { bestand: 'dishrack_plates', naam: 'dishrack-plates', kleuren: { '#e3e9ed': 'ivory', '#b57753': 'camel' } },
      { bestand: 'kettle', naam: 'kettle', kleuren: { '#909cbc': 'slate', '#a9b5d0': 'slate', '#4e5458': 'basalt' } },
      { bestand: 'knife', naam: 'knife', kleuren: { '#adb1bb': 'nickel', '#c4c8cf': 'nickel', '#9598a6': 'nickel', '#d64e23': 'chestnut' } },
      { bestand: 'lid', naam: 'lid', kleuren: { '#c9cdd4': 'nickel' } },
      { bestand: 'mug_blue', naam: 'mug-taupe', kleuren: { '#5dbebd': 'taupe' } },
      { bestand: 'mug_red', naam: 'mug-terracotta', kleuren: { '#da5d25': 'terracotta' } },
      { bestand: 'mug_yellow', naam: 'mug-ivory', kleuren: { '#fecc4c': 'ivory' } },
      { bestand: 'pan', naam: 'pan', kleuren: { '#aeb2bc': 'nickel', '#c3c8cf': 'nickel' } },
      { bestand: 'plate', naam: 'plate', kleuren: { '#e3e9ed': 'ivory' } },
      { bestand: 'pot', naam: 'pot', kleuren: { '#a1a4b1': 'nickel', '#c2c7ce': 'nickel' } },
      { bestand: 'spatula', naam: 'spatula', kleuren: { '#b1b5bf': 'nickel', '#454b4f': 'chestnut' } },
      { bestand: 'spoon', naam: 'spoon', kleuren: { '#eaa070': 'camel', '#c47044': 'camel' } },
      { bestand: 'utensils_cup', naam: 'utensil-crock', kleuren: { '#9ed5ee': 'ivory', '#78b7e2': 'ivory', '#eaa070': 'camel', '#c47044': 'camel', '#b0b4be': 'nickel', '#444a4e': 'chestnut' } },
      { bestand: 'wall_shelf_kitchen', naam: 'wall-shelf', kleuren: { '#e29767': 'tan', '#d3dde3': 'basalt' } },
      { bestand: 'wall_shelf_kitchen_corner', naam: 'wall-shelf-corner', kleuren: { '#e29667': 'tan', '#d3dde3': 'basalt' } },
    ],
  },
  {
    kit: 'cooking-assets',
    bron: 'Cooking_Assets',
    naam: 'Cooking Assets',
    formaat: 'obj',
    schaal: 0.037,
    modellen: [
      { bestand: 'Chopsticks', naam: 'chopsticks', kleuren: { '#fbaa84': 'camel', '#222323': 'chestnut' } },
      { bestand: 'board_charcuterie_board', naam: 'charcuterie-board', kleuren: { '#d58d6b': 'camel' } },
      { bestand: 'board_cutting_board_001', naam: 'cutting-board-a', kleuren: { '#d58d6b': 'camel' } },
      { bestand: 'board_cutting_board_002', naam: 'cutting-board-b', kleuren: { '#d58d6b': 'camel' } },
      { bestand: 'cutensil_grind_mortar_and_pestle', naam: 'mortar-and-pestle', kleuren: { '#f5f7fa': 'taupe' } },
      { bestand: 'cutensils_asian_turner', naam: 'turner', kleuren: { '#828b98': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'cutensils_big_spoon', naam: 'cooking-spoon', kleuren: { '#828b98': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'cutensils_laddle', naam: 'ladle-a', kleuren: { '#828b98': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'cutensils_laddle_2', naam: 'ladle-b', kleuren: { '#828b98': 'nickel' } },
      { bestand: 'cutensils_spatula', naam: 'spatula', kleuren: { '#828b98': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'cutensils_tongs', naam: 'tongs-open', kleuren: { '#828b98': 'nickel', '#2d3136': 'chestnut', '#a6aeba': 'nickel' } },
      { bestand: 'cutensils_tongs_closed', naam: 'tongs', kleuren: { '#828b98': 'nickel', '#2d3136': 'chestnut', '#a6aeba': 'nickel' } },
      { bestand: 'cutensils_whisk', naam: 'whisk', kleuren: { '#828b98': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'cutensils_wooden_paddle', naam: 'wooden-paddle', kleuren: { '#d58d6b': 'camel' } },
      { bestand: 'knife_bread_knife', naam: 'bread-knife', kleuren: { '#a6aeba': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'knife_chef_knife', naam: 'chef-knife', kleuren: { '#a6aeba': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'knife_cleaver_w_hole', naam: 'cleaver', kleuren: { '#a6aeba': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'knife_naikiri_knife', naam: 'nakiri-knife', kleuren: { '#a6aeba': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'knife_paring_knife_001', naam: 'paring-knife', kleuren: { '#a6aeba': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'knife_santoku_knife', naam: 'santoku-knife', kleuren: { '#a6aeba': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'misc_cloche', naam: 'cloche', kleuren: { '#a6aeba': 'nickel' } },
      { bestand: 'misc_kettle', naam: 'kettle', kleuren: { '#a6aeba': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'misc_rolling_pin', naam: 'rolling-pin', kleuren: { '#d58d6b': 'camel' } },
      { bestand: 'misc_strainer', naam: 'strainer', kleuren: { '#a6aeba': 'nickel' } },
      { bestand: 'pan_casserole_pot', naam: 'casserole-pot', kleuren: { '#828b98': 'nickel', '#f5f7fa': 'nickel', '#a6aeba': 'nickel' } },
      { bestand: 'pan_cast_iron_skillet', naam: 'skillet-cast', kleuren: { '#222323': 'slate' } },
      { bestand: 'pan_ceramic_pot_large', naam: 'crock-large', kleuren: { '#cd5e46': 'terracotta' } },
      { bestand: 'pan_dutch_oven', naam: 'dutch-oven', kleuren: { '#2f690c': 'slate' } },
      { bestand: 'pan_frying_pan', naam: 'frying-pan', kleuren: { '#828b98': 'nickel' } },
      { bestand: 'pan_paella_pan', naam: 'paella-pan', kleuren: { '#222323': 'slate', '#828b98': 'slate' } },
      { bestand: 'pan_sauce_pan_large_001', naam: 'sauce-pan-large', kleuren: { '#828b98': 'nickel', '#f5f7fa': 'nickel', '#a6aeba': 'nickel' } },
      { bestand: 'pan_sauce_pan_small_001', naam: 'sauce-pan-small', kleuren: { '#828b98': 'nickel', '#f5f7fa': 'nickel', '#a6aeba': 'nickel' } },
      { bestand: 'pan_saute_pan', naam: 'saute-pan', kleuren: { '#828b98': 'nickel', '#f5f7fa': 'nickel', '#a6aeba': 'nickel' } },
      { bestand: 'pan_skillet', naam: 'skillet', kleuren: { '#828b98': 'nickel' } },
      { bestand: 'pan_stock_pot', naam: 'stock-pot', kleuren: { '#828b98': 'nickel' } },
      { bestand: 'plate_oval', naam: 'plate-oval-small', kleuren: { '#f5f7fa': 'ivory' } },
      { bestand: 'plate_oval_001', naam: 'platter-oval', kleuren: { '#f5f7fa': 'ivory' } },
      { bestand: 'plate_rectangle', naam: 'plate-rectangle', kleuren: { '#f5f7fa': 'ivory' } },
      { bestand: 'sercups_beer_mug', naam: 'tankard', kleuren: { '#f5f7fa': 'ivory' } },
      { bestand: 'sercups_mug', naam: 'mug', kleuren: { '#bbafa4': 'taupe' } },
      { bestand: 'sercups_teacup', naam: 'teacup', kleuren: { '#f5f7fa': 'ivory' } },
      { bestand: 'serving_bowl_3', naam: 'serving-bowl', kleuren: { '#225918': 'terracotta' } },
      { bestand: 'sspoon_rice_paddle', naam: 'rice-paddle', kleuren: { '#f5f7fa': 'camel' } },
      { bestand: 'utensil_butter_knife_001', naam: 'butter-knife', kleuren: { '#cdd2da': 'nickel' } },
      { bestand: 'utensil_fork', naam: 'fork', kleuren: { '#cdd2da': 'nickel' } },
      { bestand: 'utensil_spoon', naam: 'spoon', kleuren: { '#cdd2da': 'nickel' } },
    ],
  },
  {
    kit: 'asia-rg',
    bron: 'Stylized_Asia_RG',
    naam: 'Stylized Asia RG',
    formaat: 'fbx',
    schaal: 0.38,
    modellen: [
      { bestand: 'Bambo_1', naam: 'bamboo', banden: { 'Green_4': 'moss', 'Green_2': 'moss', 'Green_3': 'moss' } },
      { bestand: 'Sign_1', naam: 'banner', banden: { 'Wood 1': 'chestnut', 'Wood 2': 'chestnut', 'Sign': 'ivory' } },
      { bestand: 'Boat_1', naam: 'boat', banden: { 'Wood_3': 'camel', 'Wood_4': 'camel', 'Wood_1': 'chestnut', 'Metal_1': 'basalt', 'Wood_6': 'chestnut', 'Concrate': 'camel', 'Wood_7': 'camel', 'Wood_5': 'chestnut', 'Wood_8': 'camel' } },
      { bestand: 'Bowl_2', naam: 'bowl', banden: { 'Porcelain': 'ivory' } },
      { bestand: 'Bowl_Scrap_2', naam: 'bowl-shard', banden: { 'Porcelain': 'ivory' } },
      { bestand: 'Cart_1', naam: 'cart', banden: { 'Wood_4': 'camel', 'Metal_1': 'basalt' } },
      { bestand: 'Pot', naam: 'cauldron', banden: { 'Concrate_2': 'slate', 'Concrate_1': 'slate' } },
      { bestand: 'Coin', naam: 'coin', banden: { 'Metal': 'nickel', 'Gold': 'amber' } },
      { bestand: 'Dojo_1', naam: 'dojo', banden: { 'Wood Planks': 'tan', 'Wood 2': 'chestnut', 'Concrate': 'taupe', 'Wood 1': 'chestnut', 'Wood 6': 'chestnut', 'Roof': 'sienna', 'Wood 9': 'tan', 'Props': 'ivory' } },
      { bestand: 'Dragon', naam: 'dragon-ornament', banden: { 'Gold': 'amber' } },
      { bestand: 'Drum', naam: 'drum', banden: { 'Wood 1': 'camel', 'Wood 2': 'camel', 'Wood 3': 'camel', 'Wood 7': 'camel', 'Wood 5': 'chestnut', 'Metal_2': 'nickel', 'Wood Red': 'chestnut', 'Membrane': 'umber' } },
      { bestand: 'Fan_1', naam: 'fan', banden: { 'Wood_7': 'chestnut', 'Wood Red': 'ivory', 'Wood_3': 'chestnut', 'Blue': 'azure', 'Sign': 'ivory' } },
      { bestand: 'Fence 1_1', naam: 'fence-rail-a', banden: { 'Wood_1': 'chestnut' } },
      { bestand: 'Fence 1_2', naam: 'fence-rail-b', banden: { 'Wood_1': 'chestnut' } },
      { bestand: 'Fence 2_1', naam: 'fence-rope-a', banden: { 'Wood_1': 'chestnut', 'Rope': 'taupe' } },
      { bestand: 'Fence 2_2', naam: 'fence-rope-b', banden: { 'Wood_1': 'chestnut', 'Rope': 'taupe' } },
      { bestand: 'FootBridge_1', naam: 'footbridge', banden: { 'Wood_5': 'chestnut', 'Wood_4': 'tan', 'Wood_1': 'chestnut' } },
      { bestand: 'GardenWall_2', naam: 'garden-wall-a', banden: { 'Bricks': 'taupe', 'Wood_3': 'chestnut', 'Wood_2': 'tan', 'Wood_1': 'chestnut', 'Concrate': 'ivory', 'Roof': 'sienna' } },
      { bestand: 'GardenWall_2_2', naam: 'garden-wall-b', banden: { 'Bricks': 'taupe', 'Wood_3': 'chestnut', 'Wood_2': 'tan', 'Wood_1': 'chestnut', 'Concrate': 'ivory', 'Roof': 'sienna', 'Wood_4': 'chestnut' } },
      { bestand: 'GardenWall_3', naam: 'garden-wall-c', banden: { 'Bricks': 'taupe', 'Wood_3': 'chestnut', 'Concrate': 'ivory', 'Roof': 'sienna' } },
      { bestand: 'GardenWall_4', naam: 'garden-wall-corner', banden: { 'Wood_4': 'chestnut', 'Bricks': 'taupe', 'Concrate': 'ivory', 'Roof': 'sienna', 'Wood_3': 'chestnut' } },
      { bestand: 'GardenWall_3_1', naam: 'garden-wall-d', banden: { 'Bricks': 'taupe', 'Wood_3': 'chestnut', 'Concrate': 'ivory', 'Roof': 'sienna', 'Wood_4': 'chestnut' } },
      { bestand: 'GardenWall_Gate', naam: 'garden-wall-gate-a', banden: { 'Concrate': 'ivory', 'Bricks': 'taupe', 'Roof': 'sienna', 'Wood_2': 'chestnut', 'Wood_1': 'chestnut', 'Wood_3': 'tan' } },
      { bestand: 'GardenWall_Gate_2', naam: 'garden-wall-gate-b', banden: { 'Concrate': 'ivory', 'Bricks': 'taupe', 'Roof': 'sienna', 'Wood_2': 'chestnut', 'Wood_1': 'chestnut', 'Wood_3': 'tan', 'Wood_4': 'chestnut' } },
      { bestand: 'Gate_1', naam: 'gate', banden: { 'Wood_1': 'chestnut', 'Roof': 'sienna' } },
      { bestand: 'Altana_1', naam: 'gazebo', banden: { 'Wood 7': 'chestnut', 'Wood 6': 'chestnut', 'Wood 4': 'chestnut', 'Wood 3': 'chestnut', 'Wood 5': 'tan', 'Wood 1': 'chestnut', 'Roof Asian': 'sienna' } },
      { bestand: 'Geisha', naam: 'geisha-a', banden: { 'Material': 'tan' } },
      { bestand: 'Geisha 2', naam: 'geisha-b', banden: { 'Material': 'tan', 'Wood': 'chestnut' } },
      { bestand: 'Gong', naam: 'gong', banden: { 'Wood 1': 'chestnut', 'Wood 2': 'chestnut', 'Gong': 'terracotta', 'Props': 'taupe' } },
      { bestand: 'Grass', naam: 'grass', banden: { 'Grass': 'moss' } },
      { bestand: 'Building_1', naam: 'house-a', banden: { 'Wood 1': 'chestnut', 'Metal': 'sienna', 'Concrate': 'taupe', 'Wood 4': 'tan', 'White': 'ivory', 'Bricks': 'taupe', 'Wood 5': 'chestnut', 'Roof Asian': 'sienna', 'Wood 6': 'chestnut', 'Wood 7': 'chestnut', 'Wood 8': 'chestnut', 'Metal_1': 'basalt' } },
      { bestand: 'Building_2', naam: 'house-b', banden: { 'Wood_2': 'chestnut', 'Concrate4': 'taupe', 'Wood_11': 'tan', 'Wood_Crates': 'tan', 'Bricks': 'taupe', 'Wood_Doors': 'chestnut', 'Concrate3': 'ivory', 'Wood_DCrate': 'tan', 'Roof': 'sienna' } },
      { bestand: 'Building_3', naam: 'house-c', banden: { 'Wood_2': 'chestnut', 'Concrate4': 'taupe', 'Wood_11': 'tan', 'Wood_Crates': 'tan', 'Bricks': 'taupe', 'Wood_Doors': 'chestnut', 'Concrate3': 'ivory', 'Wood_DCrate': 'tan', 'Roof': 'sienna' } },
      { bestand: 'Building_4', naam: 'house-d', banden: { 'Wood_Doors': 'chestnut', 'Wall': 'ivory', 'Concrate4': 'taupe', 'Wood_2': 'chestnut', 'Wood_1': 'tan', 'Wood_3': 'chestnut', 'Roof': 'sienna', 'Wood_8': 'chestnut' } },
      { bestand: 'Building 5', naam: 'house-e', banden: { 'Concrate': 'taupe', 'Wood 3': 'chestnut', 'Wood 2': 'chestnut', 'Wood 1': 'tan', 'Bricks': 'taupe', 'Wood 4': 'chestnut', 'Roof': 'sienna', 'Wood 5': 'tan', 'Wood Planks': 'ivory', 'Wood 6': 'chestnut' } },
      { bestand: 'Building_6', naam: 'house-f', banden: { 'Wood_1': 'chestnut', 'Concrate': 'taupe', 'Bricks': 'taupe', 'Roof': 'sienna', 'Wood_Roof1': 'chestnut', 'Wood_5': 'tan', 'Wood_4': 'chestnut', 'Wood_9': 'chestnut', 'Wood_13': 'tan', 'Wood_12': 'chestnut', 'Wood_Roof2': 'chestnut', 'Wood_Roof_2': 'chestnut' } },
      { bestand: 'Small Building_1', naam: 'house-small', banden: { 'Wood_3': 'chestnut', 'Wood 5': 'tan', 'Concrate': 'taupe', 'Wood_8': 'chestnut', 'Wood_4': 'tan', 'Wood_2': 'chestnut', 'Roof': 'sienna', 'Gold': 'amber', 'Wood_1': 'chestnut' } },
      { bestand: 'Katana', naam: 'katana', banden: { 'Wood_3': 'camel', 'Gold': 'amber', 'Metal_2': 'nickel', 'Metal_1': 'basalt', 'Metal_3': 'taupe' } },
      { bestand: 'Kunai', naam: 'kunai', banden: { 'Metal_2': 'nickel', 'Metal_1': 'basalt', 'Wood_1': 'camel' } },
      { bestand: 'Wall_Ladder', naam: 'ladder', banden: { 'Wood_3': 'chestnut', 'Wood_4': 'chestnut' } },
      { bestand: 'Lampion_1', naam: 'lantern-paper-a', banden: { 'Gold': 'amber', 'Red_2': 'amber', 'Rope': 'taupe' } },
      { bestand: 'Lampion_2', naam: 'lantern-paper-b', banden: { 'Red_2': 'amber', 'Rope': 'taupe', 'Gold': 'amber' } },
      { bestand: 'Lily Flower', naam: 'lily', banden: { 'Lily': 'moss' } },
      { bestand: 'Board', naam: 'notice-board', banden: { 'Wood 3': 'chestnut', 'Wood 2': 'chestnut', 'Wood Red': 'chestnut', 'Wood 1': 'ivory', 'Concrate': 'taupe' } },
      { bestand: 'Pagoda', naam: 'pagoda', banden: { 'Wood_5': 'chestnut', 'Concrate': 'taupe', 'Wood_1': 'chestnut', 'Wood_2': 'tan', 'Wood_3': 'chestnut', 'Wood Column_1': 'chestnut', 'Wood Column_2': 'chestnut', 'Wood_4': 'chestnut', 'Roof': 'sienna', 'Wood_6': 'chestnut', 'Wood_Fence_2': 'chestnut', 'Wood_Fence_1': 'chestnut', 'Wood_Crates': 'tan', 'Gold': 'amber', 'Wood_Doors': 'chestnut', 'Metal 2': 'nickel' } },
      { bestand: 'Umbrella', naam: 'parasol', banden: { 'Wood 1': 'chestnut', 'Color 1': 'ivory', 'Color 2': 'ivory' } },
      { bestand: 'Podest_1', naam: 'platform-deck', banden: { 'Wood_9': 'chestnut', 'Wood_2': 'chestnut', 'Wood_Red': 'tan' } },
      { bestand: 'Podest_2', naam: 'platform-stone', banden: { 'Bricks': 'nickel', 'Concrate': 'taupe' } },
      { bestand: 'Podest_3', naam: 'platform-wood', banden: { 'Wood_3': 'chestnut', 'Concrate': 'taupe', 'Wood_2': 'tan' } },
      { bestand: 'Rake', naam: 'rake', banden: { 'Wood 1': 'chestnut' } },
      { bestand: 'Wall_1_1', naam: 'rampart-a', banden: { 'Wood 1': 'chestnut', 'Concrate_1': 'taupe', 'Bricks': 'taupe', 'Roof': 'sienna', 'Concrate 3': 'taupe', 'Wood 3': 'chestnut', 'Wood 2': 'tan', 'Wood 4': 'chestnut', 'Concrate_4': 'taupe' } },
      { bestand: 'Wall_1_2', naam: 'rampart-b', banden: { 'Wood 1': 'chestnut', 'Concrate_1': 'taupe', 'Bricks': 'taupe', 'Roof': 'sienna', 'Concrate 3': 'taupe', 'Wood 3': 'chestnut', 'Wood 2': 'tan', 'Wood 4': 'chestnut', 'Concrate_4': 'taupe' } },
      { bestand: 'Wall_1_3', naam: 'rampart-c', banden: { 'Wood 1': 'chestnut', 'Concrate_1': 'taupe', 'Bricks': 'taupe', 'Roof': 'sienna', 'Concrate 3': 'taupe', 'Wood 3': 'chestnut', 'Wood 2': 'tan', 'Wood 4': 'chestnut', 'Concrate_4': 'taupe' } },
      { bestand: 'Wall_1_5', naam: 'rampart-corner', banden: { 'Wood 1': 'chestnut', 'Concrate_1': 'taupe', 'Bricks': 'taupe', 'Roof': 'sienna', 'Concrate 3': 'taupe', 'Wood 3': 'tan', 'Concrate_4': 'taupe', 'wr': 'chestnut' } },
      { bestand: 'Wall_1_4', naam: 'rampart-d', banden: { 'Wood 1': 'chestnut', 'Concrate_1': 'taupe', 'Bricks': 'taupe', 'Roof': 'sienna', 'Concrate 3': 'taupe', 'Wood 3': 'chestnut', 'Wood 2': 'tan', 'Wood 4': 'chestnut', 'Concrate_4': 'taupe' } },
      { bestand: 'Wall_Column_1', naam: 'rampart-post', banden: { 'Wood 1': 'chestnut', 'Metal': 'slate' } },
      { bestand: 'Reed Multi', naam: 'reeds', banden: { 'Lily': 'moss', 'Glass': 'umber' } },
      { bestand: 'RiverBridge_1', naam: 'river-bridge', banden: { 'Wood_8': 'chestnut', 'Wood_5': 'tan', 'Wood_4': 'chestnut' } },
      { bestand: 'Rock_Formation_3', naam: 'rock-formation-a', banden: { 'Concrate': 'nickel' } },
      { bestand: 'Rodck_Formation_2', naam: 'rock-formation-b', banden: { 'Concrate': 'nickel' } },
      { bestand: 'Rock_4', naam: 'rock-small', banden: { 'Concrate': 'nickel' } },
      { bestand: 'Rock_1', naam: 'rock-tall-a', banden: { 'Concrate': 'nickel' } },
      { bestand: 'Rock_2', naam: 'rock-tall-b', banden: { 'Concrate': 'nickel' } },
      { bestand: 'Rock_3', naam: 'rock-tall-c', banden: { 'Concrate': 'nickel' } },
      { bestand: 'Rope_1', naam: 'rope', banden: { 'Sign': 'taupe' } },
      { bestand: 'Rope_Bells_1', naam: 'rope-bells', banden: { 'Rope': 'taupe', 'Gold': 'amber', 'Metal_1': 'amber' } },
      { bestand: 'Sakwa_1', naam: 'sack-a', banden: { 'Rope': 'ivory' } },
      { bestand: 'Sakwa_2', naam: 'sack-b', banden: { 'Rope': 'ivory' } },
      { bestand: 'Shrine_1', naam: 'shrine', banden: { 'Wood_Stairs': 'tan', 'Wood_4': 'chestnut', 'Concrate': 'taupe', 'Wood_8': 'chestnut', 'Wood_2': 'chestnut', 'Wood_1': 'chestnut', 'Wood_Red': 'tan', 'Wood_WindowR': 'chestnut', 'Wood_Doors': 'chestnut', 'Wall': 'taupe', 'Wood_10': 'chestnut', 'Wood_3': 'chestnut', 'Roof': 'sienna', 'Wood_5': 'chestnut', 'Gold': 'amber' } },
      { bestand: 'Stairs_3', naam: 'stairs', banden: { 'Wood_Stairs': 'tan', 'Wood_8': 'chestnut' } },
      { bestand: 'Tile_1_1', naam: 'stepping-stone-a', banden: { 'Concrate': 'taupe' } },
      { bestand: 'Tile_1_2', naam: 'stepping-stone-b', banden: { 'Concrate': 'taupe' } },
      { bestand: 'Tile_1_3', naam: 'stepping-stone-c', banden: { 'Concrate': 'taupe' } },
      { bestand: 'Tile_1_4', naam: 'stepping-stone-d', banden: { 'Concrate': 'taupe' } },
      { bestand: 'Tile_1_5', naam: 'stepping-stone-e', banden: { 'Concrate': 'taupe' } },
      { bestand: 'Stone_1', naam: 'stepping-stone-f', banden: { 'Concrate': 'taupe' } },
      { bestand: 'Stone_2', naam: 'stepping-stone-g', banden: { 'Concrate': 'taupe' } },
      { bestand: 'Stone Lamp_1', naam: 'stone-lantern', banden: { 'Concrate3': 'taupe', 'Concrate_1': 'taupe' } },
      { bestand: 'Chair_1', naam: 'stool', banden: { 'Wood_8': 'camel' } },
      { bestand: 'Table_1', naam: 'table', banden: { 'Wood_2': 'camel', 'Metal 2': 'camel', 'Wood_1': 'camel' } },
      { bestand: 'TeaPot', naam: 'teapot', banden: { 'Porcelain': 'ivory' } },
      { bestand: 'Token_1', naam: 'token', banden: { 'Sign': 'camel' } },
      { bestand: 'Token on rope', naam: 'token-hanging', banden: { 'Sign': 'camel' } },
      { bestand: 'Tora _1', naam: 'torii', banden: { 'Wood Red': 'chestnut', 'Wood 1': 'chestnut', 'Concrate': 'taupe', 'Wood 2': 'chestnut' } },
      { bestand: 'Manekin', naam: 'training-dummy', banden: { 'Wood 1': 'chestnut', 'Wood 2': 'chestnut', 'Rope': 'taupe' } },
      { bestand: 'TreePLace', naam: 'tree-bed', banden: { 'Concrate3': 'taupe', 'Grass': 'moss' } },
      { bestand: 'Vase_2', naam: 'vase', banden: { 'Vase': 'ivory', 'Vase 2': 'ivory', 'Vase 3': 'ivory' } },
      { bestand: 'Balkon', naam: 'walkway', banden: { 'Wood_10': 'tan', 'Wood_1': 'chestnut' } },
      { bestand: 'Wall Shield Style', naam: 'wall-shield', banden: { 'Gong': 'camel' } },
    ],
  },
];

const ontleed = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const helderheid = ([r, g, b]) => r * 0.299 + g * 0.587 + b * 0.114;
const afstand = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const stamNaam = (naam) => String(naam ?? '').replace(/\.\d+$/, '');

function bandVan(kleuren, rgb) {
  let beste = null;
  let besteAfstand = Infinity;
  for (const [hex, band] of Object.entries(kleuren)) {
    const d = afstand(ontleed(hex), rgb);
    if (d < besteAfstand) {
      besteAfstand = d;
      beste = band;
    }
  }
  if (!BANDEN[beste]) throw new Error(`unknown band: ${beste}`);
  return beste;
}

function bandVanMateriaal(model, materiaal) {
  const band = model.banden[stamNaam(materiaal.naam)];
  if (!band) throw new Error(`${model.bestand}: no band for material ${materiaal.naam}`);
  if (!BANDEN[band]) throw new Error(`unknown band: ${band}`);
  return band;
}

function zoekBestand(map, naam) {
  for (const ingang of readdirSync(map, { withFileTypes: true })) {
    const pad = join(map, ingang.name);
    if (ingang.isDirectory()) {
      const gevonden = zoekBestand(pad, naam);
      if (gevonden) return gevonden;
    } else if (ingang.name === naam) return pad;
  }
  return null;
}

function bronBestand(kit, model) {
  const map = join(UITPAK_DIR, kit.bron);
  if (!statSync(map, { throwIfNoEntry: false })) {
    for (const zip of readdirSync(join(BRON_DIR, kit.bron)).filter((n) => n.toLowerCase().endsWith('.zip')).sort()) {
      pakUit(join(BRON_DIR, kit.bron, zip), map);
    }
  }
  const pad = zoekBestand(map, `${model.bestand}.${kit.formaat}`);
  if (!pad) throw new Error(`${kit.bron}: ${model.bestand}.${kit.formaat} not found`);
  return pad;
}

function vindTextuur(kit, gevraagd) {
  if (!gevraagd) return null;
  if (gevraagd.includes('/') && statSync(gevraagd, { throwIfNoEntry: false })) return gevraagd;
  return zoekBestand(join(UITPAK_DIR, kit.bron), gevraagd.replace(/\\+/g, '/').split('/').pop());
}

function leesTextuur(pad) {
  const png = readPng(pad);
  return (u, v) => {
    const x = Math.min(Math.max(Math.floor(u * png.width), 0), png.width - 1);
    const y = Math.min(Math.max(Math.floor(v * png.height), 0), png.height - 1);
    const i = (y * png.width + x) * 4;
    return [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]];
  };
}

function bronKleuren(kit) {
  const texturen = new Map();
  const lees = kit.formaat === 'fbx' ? leesFbx : leesObj;
  return kit.modellen.map((model) => {
    const primitieven = lees(bronBestand(kit, model));
    const kleuren = [];
    for (const prim of primitieven) {
      const pad = vindTextuur(kit, prim.materiaal.textuur);
      if (!pad) {
        if (!model.banden) throw new Error(`${model.bestand}: primitive without a texture`);
        kleuren.push(null);
        continue;
      }
      if (!texturen.has(pad)) texturen.set(pad, leesTextuur(pad));
      const monster = texturen.get(pad);
      const perHoek = [];
      for (let i = 0; i < prim.uvs.length / 2; i++) {
        perHoek.push(monster(prim.uvs[i * 2], prim.uvs[i * 2 + 1]));
      }
      kleuren.push(perHoek);
    }
    return { model, primitieven, kleuren };
  });
}

function schrijfModel(kit, gelezen, bereik) {
  const { model, primitieven, kleuren } = gelezen;
  const posities = [];
  const normalen = [];
  const uvs = [];
  const indices = [];

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const prim of primitieven) {
    for (let i = 0; i < prim.posities.length / 3; i++) {
      for (let k = 0; k < 3; k++) {
        const v = prim.posities[i * 3 + k] * kit.schaal;
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }
  }
  const verschuif = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];

  const perHoek = new Map();
  primitieven.forEach((prim, p) => {
    const opnieuw = new Int32Array(prim.posities.length / 3);
    for (let i = 0; i < prim.posities.length / 3; i++) {
      const plek3 = [0, 1, 2].map((k) => Math.fround(prim.posities[i * 3 + k] * kit.schaal + verschuif[k]));
      const norm = [0, 1, 2].map((k) => Math.fround(prim.normalen ? prim.normalen[i * 3 + k] : 0));

      const rgb = kleuren[p]?.[i] ?? null;
      const band = model.banden
        ? bandVanMateriaal(model, prim.materiaal)
        : bandVan(model.kleuren, rgb);
      const [kolom, rij] = BANDEN[band];
      const deel = rgb
        ? (bereik.licht - helderheid(rgb)) / (bereik.licht - bereik.donker)
        : 0.5;
      const plek = RAND + Math.min(Math.max(deel, 0), 1) * (1 - 2 * RAND);
      const uv = [Math.fround((kolom + 0.5) / KOLOMMEN), Math.fround((rij + plek) / RIJEN)];

      const sleutel = [...plek3, ...norm, ...uv].join(',');
      let index = perHoek.get(sleutel);
      if (index === undefined) {
        index = posities.length / 3;
        perHoek.set(sleutel, index);
        posities.push(...plek3);
        normalen.push(...norm);
        uvs.push(...uv);
      }
      opnieuw[i] = index;
    }
    for (const i of prim.indices) indices.push(opnieuw[i]);
  });

  const posBuf = Buffer.from(Float32Array.from(posities).buffer);
  const norBuf = Buffer.from(Float32Array.from(normalen).buffer);
  const uvBuf = Buffer.from(Float32Array.from(uvs).buffer);
  const idxBuf = Buffer.from(Uint32Array.from(indices).buffer);
  const bin = Buffer.concat([posBuf, norBuf, uvBuf, idxBuf]);

  const telling = posities.length / 3;
  const json = {
    asset: {
      generator: 'tools/importeer/keuken.mjs',
      version: '2.0',
      extras: {
        taaleiland: {
          versie: 1,
          schaal: kit.schaal,
          palet: 1,
          bron: kit.naam,
          bronmodel: model.bestand,
        },
      },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: model.naam }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [
      {
        name: 'colormap',
        pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
        doubleSided: true,
        alphaMode: 'OPAQUE',
      },
    ],
    textures: [{ sampler: 0, source: 0 }],
    samplers: [{ minFilter: 9987 }],
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length, byteLength: norBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length + norBuf.length, byteLength: uvBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length + norBuf.length + uvBuf.length, byteLength: idxBuf.length, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0, componentType: 5126, count: telling, type: 'VEC3',
        min: [0, 1, 2].map((k) => Math.min(...Array.from({ length: telling }, (_, i) => posities[i * 3 + k]))),
        max: [0, 1, 2].map((k) => Math.max(...Array.from({ length: telling }, (_, i) => posities[i * 3 + k]))),
      },
      { bufferView: 1, componentType: 5126, count: telling, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: telling, type: 'VEC2' },
      { bufferView: 3, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
  };

  const doel = join(WERK_DIR, kit.kit, `${model.naam}.glb`);
  writeGlb(doel, json, bin, writeFileSync);
  return { naam: model.naam, hoeken: telling, driehoeken: indices.length / 3 };
}

const gevraagd = process.argv.slice(2);
const teDoen = gevraagd.length ? KITS.filter((kit) => gevraagd.includes(kit.kit)) : KITS;
for (const naam of gevraagd) {
  if (!KITS.some((kit) => kit.kit === naam)) throw new Error(`unknown kit: ${naam}`);
}

for (const kit of teDoen) {
  mkdirSync(join(WERK_DIR, kit.kit, 'Textures'), { recursive: true });
  copyFileSync(COLORMAP, join(WERK_DIR, kit.kit, 'Textures', 'colormap.png'));

  const gelezen = bronKleuren(kit);
  let licht = -Infinity;
  let donker = Infinity;
  for (const { kleuren } of gelezen) {
    for (const perPrim of kleuren) {
      for (const rgb of perPrim ?? []) {
        const l = helderheid(rgb);
        if (l > licht) licht = l;
        if (l < donker) donker = l;
      }
    }
  }

  console.log(`${kit.kit}: schaal ${kit.schaal}, helderheid ${Math.round(donker)}-${Math.round(licht)}`);
  for (const model of gelezen) {
    const uit = schrijfModel(kit, model, { licht, donker });
    console.log(`  ${uit.naam} — ${uit.driehoeken} tris`);
  }
}
