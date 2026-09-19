import { join } from 'node:path';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';
import {
  bouw, schrijf, bandPlekken, kitMap, zetTags, zetManifest, ontdubbel, richtSchillen,
  richtWinding,
} from './bouwer.mjs';

const planks = ['wood-planks', 'tan'];
const worked = ['wood-worked', 'camel'];
const beam = ['wood-beam', 'chestnut'];
const bark = ['wood-bark', 'umber'];
const log = ['wood-log', 'tan'];

const steel = ['metal-iron-steel', 'nickel'];
const cast = ['metal-iron-cast', 'slate'];
const wrought = ['metal-iron-wrought', 'basalt'];
const gold = ['metal-gold', 'amber'];

const masonry = ['stone-masonry', 'taupe'];
const masonryLight = ['stone-masonry', 'nickel'];
const masonryDark = ['stone-masonry', 'slate'];
const rock = ['stone-rock', 'nickel'];

const plaster = ['ceramic', 'ivory'];
const dado = ['ceramic', 'taupe'];
const enamelRed = ['ceramic', 'sienna'];
const roofTile = ['ceramic', 'sienna'];
const tile = ['ceramic', 'terracotta'];
const snow = ['ceramic', 'ivory'];

const cloth = ['textile', 'ivory'];
const clothRed = ['textile', 'sienna'];
const clothGreen = ['textile', 'hunter'];
const clothGrey = ['textile', 'taupe'];

const leaf = ['foliage', 'hunter'];
const reed = ['foliage', 'moss'];
const shrub = ['foliage', 'moss'];

const ruit = ['glass', 'ivory'];
const glow = ['emissive', 'amber'];
const board = ['paper', 'ivory'];

const dough = ['food', 'tan'];
const gingerbread = ['food', 'camel'];
const chocolate = ['food', 'chestnut'];
const icing = ['food', 'ivory'];
const candyRed = ['food', 'sienna'];
const candyPink = ['food', 'terracotta'];

const cabinLogs = worked;
const cabinBoards = planks;
const cabinTrim = beam;

const PAKKETTEN = [
  {
    kit: 'fs-terrain', bron: 'modular_terrain_collection', schaal: 0.5,
    modellen: [
      {
        naam: 'hilly-prop-stump', bronmodel: 'Hilly_Prop_Stump',
        kind: 'env-flora-deadwood-stump', tags: [],
        kleuren: { '#bead9c': bark, '#dfd0b5': log, '*': bark },
      },
      {
        naam: 'hilly-prop-camp-sitting-log', bronmodel: 'Hilly_Prop_Camp_Sitting_Log',
        kind: 'obj-furniture-seating-bench', tags: [],
        kleuren: { '#bead9c': bark, '#dfd0b5': log, '*': bark },
      },
      {
        naam: 'hilly-prop-bush-a', bronmodel: 'Hilly_Prop_Bush_1',
        kind: 'env-flora-plant', tags: [], kleuren: { '#9ac26e': shrub, '*': shrub },
      },
      {
        naam: 'hilly-prop-bush-b', bronmodel: 'Hilly_Prop_Bush_2',
        kind: 'env-flora-plant', tags: [], kleuren: { '#9ac26e': shrub, '*': shrub },
      },
      {
        naam: 'hilly-prop-bush-c', bronmodel: 'Hilly_Prop_Bush_3',
        kind: 'env-flora-plant', tags: [], kleuren: { '#9ac26e': shrub, '*': shrub },
      },
      {
        naam: 'hilly-prop-bush-d', bronmodel: 'Hilly_Prop_Bush_4',
        kind: 'env-flora-plant', tags: [], kleuren: { '#9ac26e': shrub, '*': shrub },
      },
    ],
  },

  {
    kit: 'kay-hexagon', bron: 'KayKit_Medieval_Hexagon_Pack_1.0_FREE', schaal: 1.2,
    raster: [8, 4],
    sleutels: { '2,2': rock, '*': rock },
    modellen: [
      { naam: 'rock-a', bronmodel: 'rock_single_A', kind: 'env-rock-cobble', tags: [] },
      { naam: 'rock-b', bronmodel: 'rock_single_B', kind: 'env-rock-cobble', tags: [] },
      { naam: 'rock-c', bronmodel: 'rock_single_C', kind: 'env-rock-cobble', tags: [] },
      { naam: 'rock-d', bronmodel: 'rock_single_D', kind: 'env-rock-cobble', tags: [] },
      { naam: 'rocks', bronmodel: 'rock_single_E', kind: 'env-rock-cobble', tags: ['plural'] },
      { naam: 'mountain-a', bronmodel: 'mountain_A', kind: 'env-terrain-mountain', tags: [] },
      { naam: 'mountain-b', bronmodel: 'mountain_B', kind: 'env-terrain-mountain', tags: [] },
      { naam: 'mountain-c', bronmodel: 'mountain_C', kind: 'env-terrain-mountain', tags: [] },
      {
        naam: 'conifer', bronmodel: 'tree_single_A', kind: 'env-flora-tree-conifer', tags: [],
        cellen: { '1,2': leaf, '6,0': bark, '*': leaf },
      },
      {
        naam: 'waterlily-a', bronmodel: 'waterlily_A', kind: 'env-flora-plant-water', tags: [],
        cellen: { '1,2': reed, '*': reed },
      },
      {
        naam: 'waterlily-b', bronmodel: 'waterlily_B', kind: 'env-flora-plant-water', tags: [],
        cellen: { '1,2': reed, '*': reed },
      },
      {
        naam: 'flag-red', bronmodel: 'flag_red', kind: 'str-marker-flag', tags: [],
        cellen: { '1,3': clothRed, '6,0': beam, '*': beam },
      },
      {
        naam: 'crate-b', bronmodel: 'crate_B_big', kind: 'obj-container-crate', tags: [],
        cellen: { '6,1': beam, '*': beam },
      },
      {
        naam: 'crate-b-small', bronmodel: 'crate_B_small', kind: 'obj-container-crate', tags: [],
        cellen: { '5,3': planks, '*': planks },
      },
    ],
  },

  {
    kit: 'ken-proto', bron: 'kenney_prototypekit', schaal: 0.75, raster: [16, 4],
    sleutels: { '7,3': masonryLight, '3,3': masonryDark, '*': masonryLight },
    modellen: [
      { naam: 'wall', bronmodel: 'wall', kind: 'str-part-wall', tags: [] },
      { naam: 'wall-doorway', bronmodel: 'wall-doorway', kind: 'str-part-wall', tags: [] },
      {
        naam: 'wall-window-cutout-large', bronmodel: 'wall-window-cutout-large',
        kind: 'str-part-wall', tags: [],
      },
      {
        naam: 'stairs-diagonal', bronmodel: 'stairs-diagonal', kind: 'str-access-stairs', tags: [],
      },
      {
        naam: 'ladder', bronmodel: 'ladder', kind: 'str-access-ladder', tags: [],
        cellen: { '7,3': cast, '*': cast },
      },
      {
        naam: 'door', bronmodel: 'door-rotate', kind: 'str-part-door', tags: [],
        cellen: { '7,3': beam, '9,2': beam, '3,3': cast, '*': beam },
      },
    ],
  },

  {
    kit: 'ken-castle', bron: 'kenney_castlekit', schaal: 0.88, raster: [16, 4],
    sleutels: { '13,3': masonry, '12,3': masonryLight, '15,3': masonryLight, '*': masonry },
    modellen: [
      { naam: 'wall', bronmodel: 'wall', kind: 'str-part-wall', tags: [] },
      { naam: 'wall-doorway', bronmodel: 'wall-doorway', kind: 'str-part-wall', tags: [] },
      {
        naam: 'wall-narrow-gate', bronmodel: 'wall-narrow-gate', kind: 'str-part-wall', tags: [],
      },
      { naam: 'stairs-stone', bronmodel: 'stairs-stone', kind: 'str-access-stairs', tags: [] },
      {
        naam: 'bridge-draw', bronmodel: 'bridge-draw', kind: 'str-access-bridge', tags: [],
        cellen: { '9,3': planks, '*': planks },
      },
      {
        naam: 'door', bronmodel: 'door', kind: 'str-part-door', tags: [],
        cellen: { '5,3': cast, '9,3': beam, '*': cast },
      },
    ],
  },

  {
    kit: 'ken-holiday', bron: 'kenney_holidaykit', schaal: 0.75, raster: [16, 4],
    sleutels: {
      '3,2': cabinLogs, '11,2': cabinBoards, '5,2': cabinTrim, '1,2': snow, '*': cabinLogs,
    },
    modellen: [
      { naam: 'cabin-window-a', bronmodel: 'cabin-window-a', kind: 'str-part-wall', tags: [] },
      { naam: 'cabin-window-b', bronmodel: 'cabin-window-b', kind: 'str-part-wall', tags: [] },
      { naam: 'cabin-window-c', bronmodel: 'cabin-window-c', kind: 'str-part-wall', tags: [] },
      {
        naam: 'cabin-window-large', bronmodel: 'cabin-window-large',
        kind: 'str-part-wall', tags: [],
      },
      { naam: 'cabin-doorway', bronmodel: 'cabin-doorway', kind: 'str-part-wall', tags: [] },
      {
        naam: 'cabin-overhang-doorway', bronmodel: 'cabin-overhang-doorway',
        kind: 'str-part-wall', tags: [],
      },
      { naam: 'cabin-door', bronmodel: 'cabin-door-rotate', kind: 'str-part-door', tags: [] },
      {
        naam: 'cabin-overhang-door', bronmodel: 'cabin-overhang-door-rotate',
        kind: 'str-part-door', tags: [],
      },
      {
        naam: 'cabin-roof', bronmodel: 'cabin-roof', kind: 'str-part-roof', tags: [],
        cellen: { '5,2': cabinTrim, '11,2': roofTile, '*': roofTile },
      },
      {
        naam: 'cabin-roof-point', bronmodel: 'cabin-roof-point', kind: 'str-part-roof', tags: [],
        cellen: { '5,2': cabinTrim, '11,2': roofTile, '*': roofTile },
      },
      {
        naam: 'cabin-roof-corner', bronmodel: 'cabin-roof-corner', kind: 'str-part-roof', tags: [],
        cellen: { '5,2': cabinTrim, '11,2': roofTile, '1,2': snow, '*': roofTile },
      },
      {
        naam: 'cabin-roof-chimney', bronmodel: 'cabin-roof-chimney',
        kind: 'str-part-roof', tags: [],
        cellen: {
          '11,3': masonryLight, '13,3': masonryLight, '5,2': cabinTrim, '11,2': roofTile,
          '*': masonryLight,
        },
      },
      {
        naam: 'cabin-roof-snow-dormer', bronmodel: 'cabin-roof-snow-dormer',
        kind: 'str-part-roof', tags: [],
        cellen: {
          '11,2': roofTile, '1,3': snow, '1,2': snow, '3,2': cabinLogs, '5,2': cabinTrim,
          '*': roofTile,
        },
      },
      {
        naam: 'floor-wood', bronmodel: 'floor-wood', kind: 'str-part-floor', tags: [],
        cellen: { '3,2': planks, '*': planks },
      },
      {
        naam: 'floor-wood-snow', bronmodel: 'floor-wood-snow', kind: 'str-part-floor', tags: [],
        cellen: { '3,2': planks, '1,3': snow, '*': planks },
      },
      {
        naam: 'floor-stone', bronmodel: 'floor-stone', kind: 'str-part-floor', tags: [],
        cellen: { '11,3': masonryLight, '*': masonryLight },
      },
      {
        naam: 'bench', bronmodel: 'bench', kind: 'obj-furniture-seating-bench', tags: [],
        cellen: { '3,2': planks, '15,3': cast, '*': planks },
      },
      {
        naam: 'bench-short', bronmodel: 'bench-short',
        kind: 'obj-furniture-seating-bench', tags: [],
        cellen: { '3,2': planks, '15,3': cast, '*': planks },
      },
      {
        naam: 'lantern', bronmodel: 'lantern', kind: 'obj-lighting-lantern', tags: [],
        cellen: { '11,3': wrought, '13,2': glow, '*': wrought },
      },
      {
        naam: 'candy-cane', bronmodel: 'candy-cane-red', kind: 'obj-food-sweet', tags: [],
        cellen: { '1,2': icing, '7,3': candyRed, '*': icing },
      },
    ],
  },

  {
    kit: 'kay-food', bron: 'KayKit_Restaurant_Bits_1.0_FREE', schaal: 0.23, raster: [8, 4],
    sleutels: { '4,1': plaster, '2,1': dado, '3,0': cast, '*': plaster },
    modellen: [
      { naam: 'wall', bronmodel: 'wall', kind: 'str-part-wall', tags: [] },
      { naam: 'wall-doorway', bronmodel: 'wall_doorway', kind: 'str-part-wall', tags: [] },
      { naam: 'wall-window', bronmodel: 'wall_window_open', kind: 'str-part-wall', tags: [] },
      {
        naam: 'door-a', bronmodel: 'door_A', kind: 'str-part-door', tags: [],
        cellen: { '3,0': cast, '2,1': beam, '1,3': ruit, '0,3': ruit, '*': cast },
      },
      {
        naam: 'stove', bronmodel: 'stove_multi', kind: 'obj-kitchenware-cookware', tags: [],
        cellen: { '3,0': steel, '1,1': enamelRed, '1,0': wrought, '0,0': wrought, '*': steel },
      },
      {
        naam: 'chair-a', bronmodel: 'chair_A', kind: 'obj-furniture-seating-chair', tags: [],
        cellen: { '6,3': clothRed, '3,0': steel, '*': steel },
      },
      {
        naam: 'stool', bronmodel: 'chair_stool', kind: 'obj-furniture-seating-stool', tags: [],
        cellen: { '6,3': clothRed, '3,0': steel, '*': steel },
      },
    ],
  },

  {
    kit: 'isa-kitchen', bron: 'Tiny_Treats_Charming_Kitchen_1.1_FREE', schaal: 0.32,
    raster: [8, 8],
    sleutels: {
      '3,0': worked, '3,1': worked, '4,0': plaster, '4,1': plaster,
      '6,4': tile, '6,5': tile, '6,6': ruit, '7,7': ruit, '*': plaster,
    },
    modellen: [
      {
        naam: 'window-small', bronmodel: 'window_small_modular',
        kind: 'str-part-window', tags: [],
      },
      {
        naam: 'window-large', bronmodel: 'window_large_modular',
        kind: 'str-part-window', tags: [],
      },
      {
        naam: 'wall-tiles-window-small', bronmodel: 'wall_tiles_kitchen_window_small',
        kind: 'str-part-wall', tags: [],
      },
      {
        naam: 'wall-tiles-window-large', bronmodel: 'wall_tiles_kitchen_window_large',
        kind: 'str-part-wall', tags: [],
      },
      {
        naam: 'wall-tiles-modular', bronmodel: 'wall_modular_tiles_kitchen_straight_A',
        kind: 'str-part-wall', tags: [],
      },
      {
        naam: 'wall-tiles-modular-window-large',
        bronmodel: 'wall_modular_tiles_kitchen_window_large_B',
        kind: 'str-part-wall', tags: [],
      },
      {
        naam: 'table-a', bronmodel: 'table_A', kind: 'obj-furniture-table', tags: [],
        cellen: { '3,0': beam, '3,1': beam, '5,0': worked, '5,1': worked, '*': beam },
      },
      {
        naam: 'table-b', bronmodel: 'table_B', kind: 'obj-furniture-table', tags: [],
        cellen: { '3,0': beam, '3,1': beam, '5,0': worked, '5,1': worked, '*': beam },
      },
      {
        naam: 'table-c', bronmodel: 'table_C', kind: 'obj-furniture-table', tags: [],
        cellen: { '3,0': beam, '3,1': beam, '5,0': worked, '5,1': worked, '*': beam },
      },
      {
        naam: 'stove', bronmodel: 'stove', kind: 'obj-kitchenware-cookware', tags: [],
        cellen: {
          '1,0': wrought, '1,1': wrought, '2,0': steel, '2,1': steel,
          '2,2': dado, '2,3': dado, '6,6': ruit, '6,7': ruit, '7,6': ruit, '7,7': ruit,
          '*': steel,
        },
      },
    ],
  },

  {
    kit: 'isa-bakery', bron: 'Tiny_Treats_Bakery_Interior_1.1_FREE', schaal: 0.32,
    raster: [8, 8],
    sleutels: {
      '6,0': beam, '6,1': beam, '4,0': plaster, '4,1': plaster,
      '3,0': worked, '3,1': worked, '6,6': ruit, '7,7': ruit, '*': plaster,
    },
    modellen: [
      {
        naam: 'window-small', bronmodel: 'window_small_modular',
        kind: 'str-part-window', tags: [],
      },
      {
        naam: 'window-large', bronmodel: 'window_large_modular',
        kind: 'str-part-window', tags: [],
      },
      {
        naam: 'wall-panelled-window-small', bronmodel: 'wall_panelled_bakery_window_small',
        kind: 'str-part-wall', tags: [],
      },
      {
        naam: 'wall-panelled-window-large', bronmodel: 'wall_panelled_bakery_window_large',
        kind: 'str-part-wall', tags: [],
      },
      {
        naam: 'wall-panelled-modular', bronmodel: 'wall_modular_panelled_bakery_straight_A',
        kind: 'str-part-wall', tags: [],
      },
      {
        naam: 'wall-panelled', bronmodel: 'wall_panelled_bakery_straight',
        kind: 'str-part-wall', tags: [],
      },
      {
        naam: 'floor-wood', bronmodel: 'floor_wood', kind: 'str-part-floor', tags: [],
        cellen: { '6,0': beam, '6,1': beam, '*': beam },
      },
      {
        naam: 'floor-tiled', bronmodel: 'floor_tiled', kind: 'str-part-floor', tags: [],
        cellen: { '4,0': plaster, '4,1': plaster, '*': plaster },
      },
      {
        naam: 'floor-connection', bronmodel: 'floor_connection', kind: 'str-part-floor', tags: [],
        cellen: { '4,0': plaster, '4,1': plaster, '6,0': beam, '6,1': beam, '*': plaster },
      },
      {
        naam: 'door-modular', bronmodel: 'door_modular', kind: 'str-part-door', tags: [],
        cellen: {
          '1,4': gold, '1,5': gold, '5,0': worked, '5,1': worked,
          '6,0': beam, '6,1': beam, '6,6': ruit, '7,7': ruit, '*': worked,
        },
      },
      {
        naam: 'curtains', bronmodel: 'curtains', kind: 'obj-furniture', tags: [],
        cellen: { '5,0': worked, '3,0': cloth, '3,1': cloth, '4,3': clothGreen, '*': cloth },
      },
      {
        naam: 'counter-table', bronmodel: 'counter_table', kind: 'obj-furniture-table', tags: [],
        cellen: { '3,0': beam, '3,1': beam, '5,0': worked, '*': beam },
      },
      {
        naam: 'scale', bronmodel: 'scale', kind: 'obj-tool', tags: [],
        cellen: {
          '2,0': steel, '2,1': steel, '2,4': enamelRed, '2,5': enamelRed,
          '3,0': plaster, '3,1': plaster, '*': steel,
        },
      },
      {
        naam: 'milk-carton', bronmodel: 'milk', kind: 'obj-container', tags: [],
        cellen: { '3,1': board, '3,2': board, '3,3': board, '4,2': board, '*': board },
      },
      {
        naam: 'macaron-pink', bronmodel: 'macaron_pink', kind: 'obj-food-grain-pastry', tags: [],
        cellen: { '3,4': candyPink, '4,0': icing, '4,1': icing, '*': candyPink },
      },
      {
        naam: 'dough-rolled-a', bronmodel: 'dough_rolled_A', kind: 'obj-food-grain', tags: [],
        cellen: { '4,4': dough, '4,5': dough, '*': dough },
      },
      {
        naam: 'dough-rolled-b', bronmodel: 'dough_rolled_B', kind: 'obj-food-grain', tags: [],
        cellen: { '4,4': dough, '4,5': dough, '*': dough },
      },
    ],
  },

  {
    kit: 'kay-holiday', bron: 'KayKit_Holiday_Bits_1.0_FREE', schaal: 0.3, raster: [8, 4],
    modellen: [
      {
        naam: 'plate-nickel', bronmodel: 'plate_white',
        kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '5,3': steel, '*': steel },
      },
      {
        naam: 'plate-small-nickel', bronmodel: 'plate_small_white',
        kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '5,3': steel, '*': steel },
      },
      {
        naam: 'plate-small-ivory', bronmodel: 'plate_small_blue',
        kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '4,3': plaster, '*': plaster },
      },
      {
        naam: 'lantern-mini', bronmodel: 'lantern_mini', kind: 'obj-lighting-lantern', tags: [],
        cellen: { '4,0': wrought, '5,3': snow, '2,2': glow, '*': wrought },
      },
      {
        naam: 'lantern-decorated', bronmodel: 'lantern_decorated',
        kind: 'obj-lighting-lantern', tags: [],
        cellen: {
          '4,1': wrought, '5,3': snow, '6,2': clothRed, '0,1': leaf, '2,2': glow, '*': wrought,
        },
      },
      {
        naam: 'milk', bronmodel: 'milk', kind: 'obj-kitchenware-tableware-drinkware', tags: [],
        cellen: { '5,3': ruit, '*': ruit },
      },
      {
        naam: 'plate-cocoa', bronmodel: 'plate_decorated_A', kind: 'assy', tags: [],
        cellen: {
          '5,0': gingerbread, '3,2': icing, '5,3': icing, '2,2': tile, '4,3': plaster,
          '6,2': candyRed, '5,2': candyRed, '1,3': candyRed, '6,0': chocolate, '*': icing,
        },
      },
      {
        naam: 'gingerbread-house', bronmodel: 'gingerbread_house',
        kind: 'obj-food-grain-pastry', tags: [],
        cellen: {
          '3,2': icing, '5,3': icing, '5,2': icing, '0,3': candyRed, '6,2': candyRed,
          '2,2': candyRed, '1,3': candyRed, '5,0': gingerbread, '6,0': gingerbread,
          '*': gingerbread,
        },
      },
      {
        naam: 'gingerbread-house-decorated', bronmodel: 'gingerbread_house_decorated',
        kind: 'obj-food-grain-pastry', tags: [],
        cellen: {
          '3,2': icing, '5,3': icing, '5,2': icing, '0,3': candyRed, '6,2': candyRed,
          '2,2': candyRed, '1,3': candyRed, '5,0': gingerbread, '6,0': gingerbread,
          '*': gingerbread,
        },
      },
      {
        naam: 'candycane', bronmodel: 'candycane_small', kind: 'obj-food-sweet', tags: [],
        cellen: { '5,3': icing, '6,2': candyRed, '*': icing },
      },
      {
        naam: 'football', bronmodel: 'football', kind: 'obj', tags: [],
        cellen: { '5,3': cloth, '2,0': clothGrey, '*': cloth },
      },
    ],
  },

  {
    kit: 'kay-minigame', bron: 'KayKit_Mini-Game_Variety_Pack_1.2', schaal: 0.37,
    modellen: [
      {
        naam: 'lightning', bronmodel: 'lightning', kind: 'obj', tags: ['pickup'],
        kleuren: { '#ffbc24': gold, '*': gold },
      },
      {
        naam: 'flag-red', bronmodel: 'flag_teamRed', kind: 'str-marker-flag', tags: [],
        kleuren: { '#ff2c60': clothRed, '#c8855f': worked, '#aab8be': cast, '*': cast },
      },
      {
        naam: 'barrier-ladder', bronmodel: 'barrierLadder', kind: 'str-access-ladder', tags: [],
        kleuren: { '#aab8be': cast, '*': cast },
      },
    ],
  },

  {
    kit: 'toon-shooter', bron: 'Toon_Shooter_Game_Kit', schaal: 0.32,
    modellen: [
      {
        naam: 'fence', bronmodel: 'Fence', kind: 'str-barrier-fence', tags: [],
        kleuren: { '#818491': cast, '*': cast },
      },
      {
        naam: 'fence-long', bronmodel: 'Fence Long', kind: 'str-barrier-fence', tags: [],
        kleuren: { '#818491': cast, '*': cast },
      },
    ],
  },
];

const alleenKits = new Set(process.argv.slice(2));

const regels = [];
const perKit = new Map();

for (const pakket of PAKKETTEN) {
  if (alleenKits.size && !alleenKits.has(pakket.kit)) continue;
  const bronkit = BRONKITS.find((b) => b.map === pakket.bron);
  if (!bronkit) throw new Error(`${pakket.bron}: not in BRONKITS`);
  pakket.naam = bronkit.naam;
  pakket.generator = 'tools/importeer/aanvullen.mjs';

  const { modellen } = bronModellen(bronkit);
  const perNaam = new Map(modellen.map((model) => [model.naam, model]));

  for (const opgave of pakket.modellen) {
    const veld = pakket.raster ? 'cellen' : 'kleuren';
    opgave[veld] = { ...(pakket.sleutels ?? {}), ...(opgave[veld] ?? {}) };
    if (!opgave[veld]['*']) throw new Error(`${pakket.kit}/${opgave.naam}: no fallback band`);
  }
  const plek = pakket.raster ? null : bandPlekken(pakket);
  const doelMap = kitMap(pakket.kit);

  console.log(`\n${pakket.kit}  (${bronkit.naam})  scale ${pakket.schaal}`);
  for (const opgave of pakket.modellen) {
    const model = perNaam.get(opgave.bronmodel);
    if (!model) throw new Error(`${opgave.bronmodel}: not in ${pakket.bron}`);
    const dubbel = ontdubbel(model);
    const gekeerd = richtSchillen(model);
    const gericht = pakket.raster ? 0 : richtWinding(model);

    const mesh = bouw(model.primitieven, opgave, pakket, plek);
    schrijf(join(doelMap, `${opgave.naam}.glb`), mesh, opgave, pakket);

    const materialen = [...mesh.materialen];
    regels.push([`${pakket.kit}/${opgave.naam}`, [opgave.kind, ...materialen, ...opgave.tags]]);
    perKit.set(pakket.kit, [...(perKit.get(pakket.kit) ?? []), opgave.naam]);

    console.log(
      `  ${opgave.bronmodel.padEnd(38)} → ${opgave.naam.padEnd(30)} `
        + `${String(mesh.driehoeken.length / 3).padStart(6)} tris, `
        + `${materialen.length} material(s), ${mesh.banden.size} band(s): `
        + `${[...mesh.banden].join(', ')}`
        + `${dubbel ? `, ${dubbel} coincident dropped` : ''}`
        + `${gekeerd ? `, ${gekeerd} turned out` : ''}`
        + `${gericht ? `, ${gericht} rewound` : ''}`,
    );
  }
}

zetTags(regels);
zetManifest(perKit);
console.log(`\n${regels.length} models added to kits/workfiles`);
