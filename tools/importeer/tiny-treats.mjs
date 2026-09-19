import { join } from 'node:path';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';
import {
  bouw, schrijf, bandPlekken, kitMap, zetTags, zetManifest, richtSchillen, richtWinding,
} from './bouwer.mjs';
import { scaleTarget } from './scale-factors.mjs';

const steel = ['metal-iron-steel', 'nickel'];
const painted = ['metal', 'sienna'];
const black = ['metal', 'basalt'];

const planks = ['wood-planks', 'tan'];
const worked = ['wood-worked', 'camel'];
const beam = ['wood-beam', 'chestnut'];
const bark = ['wood-bark', 'umber'];
const log = ['wood-log', 'tan'];

const sand = ['stone-soil', 'taupe'];
const porcelain = ['ceramic', 'ivory'];
const earthenware = ['ceramic', 'terracotta'];
const stoneware = ['ceramic', 'taupe'];
const glass = ['glass', 'hunter'];
const paper = ['paper', 'ivory'];
const cork = ['cork', 'taupe'];

const cloth = ['textile', 'ivory'];
const clothRed = ['textile', 'sienna'];
const clothGreen = ['textile', 'hunter'];

const canopy = ['foliage', 'hunter'];
const stem = ['vegetation', 'umber'];
const sackcloth = ['vegetation', 'tan'];
const sackLabel = ['vegetation', 'camel'];

const dough = ['food', 'tan'];
const crust = ['food', 'camel'];
const chocolate = ['food', 'chestnut'];
const cream = ['food', 'ivory'];
const cheese = ['food', 'amber'];
const fruitRed = ['food', 'sienna'];
const greens = ['food', 'moss'];
const salad = ['vegetation', 'moss'];
const pip = ['food', 'basalt'];

const PAKKETTEN = [
  {
    kit: 'isa-picnic', bron: 'Tiny_Treats_Pleasant_Picnic_1.0_FREE', raster: [8, 8],
    modellen: [
      {
        naam: 'apple', bronmodel: 'apple', kind: 'obj-food', tags: ['ngons'],
        cellen: { '2,4': fruitRed, '2,5': fruitRed, '6,0': stem, '6,1': stem, '*': fruitRed },
      },
      {
        naam: 'apple-cut', bronmodel: 'apple_cut', kind: 'obj-food', tags: ['ngons'],
        cellen: {
          '2,4': fruitRed, '2,5': fruitRed, '6,0': stem, '6,1': stem,
          '4,0': cream, '4,1': cream, '*': fruitRed,
        },
      },
      {
        naam: 'apple-piece', bronmodel: 'apple_piece', kind: 'obj-food', tags: [],
        cellen: {
          '2,4': fruitRed, '2,5': fruitRed, '4,0': cream, '4,1': cream,
          '1,0': pip, '1,1': pip, '*': fruitRed,
        },
      },
      {
        naam: 'bowl', bronmodel: 'bowl', kind: 'obj-kitchenware-tableware-bowl', tags: ['ngons'],
        cellen: { '3,4': earthenware, '3,5': earthenware, '*': earthenware },
      },
      {
        naam: 'cheese-wedge', bronmodel: 'cheese_A', kind: 'obj-food', tags: [],
        cellen: { '1,4': cheese, '1,5': cheese, '*': cheese },
      },
      {
        naam: 'cheese-wheel', bronmodel: 'cheese_B', kind: 'obj-food', tags: ['ngons'],
        cellen: { '3,0': cheese, '3,1': cheese, '4,0': cheese, '4,1': cheese, '*': cheese },
      },
      {
        naam: 'fork', bronmodel: 'fork', kind: 'obj-kitchenware-tableware-cutlery', tags: [],
        cellen: { '1,4': worked, '1,5': worked, '2,0': steel, '2,1': steel, '*': steel },
      },
      {
        naam: 'knife', bronmodel: 'knife', kind: 'obj-kitchenware-tableware-cutlery', tags: [],
        cellen: { '1,4': worked, '1,5': worked, '2,0': steel, '2,1': steel, '*': steel },
      },
      {
        naam: 'spoon', bronmodel: 'spoon', kind: 'obj-kitchenware-tableware-cutlery', tags: [],
        cellen: { '1,4': worked, '1,5': worked, '2,0': steel, '2,1': steel, '*': steel },
      },
      {
        naam: 'grapes', bronmodel: 'grapes', kind: 'obj-food', tags: ['plural', 'ngons'],
        cellen: { '6,4': greens, '6,5': greens, '6,0': stem, '6,1': stem, '*': greens },
      },
      {
        naam: 'grapes-bowl', bronmodel: 'grapes_bowl', kind: 'assy', tags: ['plural', 'ngons'],
        cellen: { '3,2': porcelain, '3,3': porcelain, '6,4': greens, '6,5': greens, '*': porcelain },
      },
      {
        naam: 'mug', bronmodel: 'mug', kind: 'obj-kitchenware-tableware-drinkware-mug', tags: ['ngons'],
        cellen: { '2,2': porcelain, '2,3': porcelain, '*': porcelain },
      },
      {
        naam: 'basket-round', bronmodel: 'picnic_basket_round', kind: 'obj-container', tags: ['ngons'],
        cellen: { '5,0': worked, '5,1': worked, '6,0': beam, '6,1': beam, '*': worked },
      },
      {
        naam: 'basket-square', bronmodel: 'picnic_basket_square', kind: 'obj-container', tags: [],
        cellen: {
          '5,0': worked, '5,1': worked, '6,0': beam, '6,1': beam,
          '2,0': steel, '2,1': steel, '*': worked,
        },
      },
      {
        naam: 'pillow-small-hunter', bronmodel: 'pillow_small_blue', kind: 'obj-furniture', tags: [],
        cellen: { '3,2': clothGreen, '3,3': clothGreen, '*': clothGreen },
      },
      {
        naam: 'pillow-small-sienna', bronmodel: 'pillow_small_red', kind: 'obj-furniture', tags: [],
        cellen: { '5,4': clothRed, '5,5': clothRed, '*': clothRed },
      },
      {
        naam: 'plate', bronmodel: 'plate_A', kind: 'obj-kitchenware-tableware-plate', tags: ['ngons'],
        cellen: {
          '3,0': porcelain, '3,1': porcelain, '3,2': earthenware, '3,3': earthenware,
          '*': porcelain,
        },
      },
      {
        naam: 'plate-flower', bronmodel: 'plate_B', kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '1,4': earthenware, '1,5': earthenware, '*': earthenware },
      },
      {
        naam: 'sandwich', bronmodel: 'sandwich', kind: 'obj-food', tags: ['decorated'],
        cellen: {
          '5,0': crust, '5,1': crust, '4,4': dough, '4,5': dough,
          '0,2': salad, '0,3': salad, '6,4': salad, '6,5': salad,
          '1,4': cheese, '1,5': cheese, '2,4': fruitRed, '2,5': fruitRed,
          '6,0': salad, '6,1': salad, '*': crust,
        },
      },
      {
        naam: 'tray-round', bronmodel: 'serving_tray_round',
        kind: 'obj-kitchenware-tableware-plate', tags: ['ngons'],
        cellen: { '5,0': worked, '5,1': worked, '*': worked },
      },
      {
        naam: 'tray-square', bronmodel: 'serving_tray_square_A',
        kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '5,0': worked, '5,1': worked, '*': worked },
      },
      {
        naam: 'tray-square-handles', bronmodel: 'serving_tray_square_B',
        kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '5,0': worked, '5,1': worked, '*': worked },
      },
      {
        naam: 'teapot', bronmodel: 'teapot', kind: 'obj-kitchenware-cookware-pot', tags: ['ngons'],
        cellen: { '2,2': earthenware, '2,3': earthenware, '*': earthenware },
      },
      {
        naam: 'wine-bottle', bronmodel: 'wine_bottle', kind: 'obj-container-bottle', tags: ['ngons'],
        cellen: {
          '1,2': glass, '1,3': glass, '7,0': cork, '7,1': cork,
          '3,0': paper, '3,1': paper, '*': glass,
        },
      },
      {
        naam: 'wine-glass', bronmodel: 'wine_glass',
        kind: 'obj-kitchenware-tableware-drinkware', tags: ['ngons'],
        cellen: { '3,2': glass, '3,3': glass, '*': glass },
      },
    ],
  },
  {
    kit: 'isa-picnic', bron: 'Tiny_Treats_Pleasant_Picnic_1.0_FREE', atlas: true,
    modellen: [
      {
        naam: 'jam-jar', bronmodel: 'jam', kind: 'obj-container-pot', tags: ['ngons'],
        kleuren: {
          '#ffffff': cloth, '#e6848c': clothRed, '#d0585e': clothRed,
          '#f8eee6': paper, '#f8ede4': paper, '#f9efe8': paper, '#f9eee7': paper,
          '#f8dcc8': paper, '#f8dac5': paper, '*': fruitRed,
        },
      },
      {
        naam: 'picnic-blanket-hunter', bronmodel: 'picnic_blanket_blue',
        kind: 'obj-furniture', tags: [],
        kleuren: {
          '#ffffff': cloth, '#bad0ef': cloth,
          '#91b3e6': clothGreen, '#74a7d4': clothGreen, '#567ec1': clothGreen, '*': clothGreen,
        },
      },
      {
        naam: 'picnic-blanket-hunter-folded', bronmodel: 'picnic_blanket_blue_folded',
        kind: 'obj-furniture', tags: [],
        kleuren: {
          '#ffffff': cloth, '#bad0ef': cloth,
          '#91b3e6': clothGreen, '#74a7d4': clothGreen, '#567ec1': clothGreen, '*': clothGreen,
        },
      },
      {
        naam: 'picnic-blanket-sienna', bronmodel: 'picnic_blanket_red',
        kind: 'obj-furniture', tags: [],
        kleuren: { '#ffffff': cloth, '#e6848c': clothRed, '#d0585e': clothRed, '*': clothRed },
      },
      {
        naam: 'picnic-blanket-sienna-folded', bronmodel: 'picnic_blanket_red_folded',
        kind: 'obj-furniture', tags: [],
        kleuren: { '#ffffff': cloth, '#e6848c': clothRed, '#d0585e': clothRed, '*': clothRed },
      },
      {
        naam: 'pillow-large-hunter', bronmodel: 'pillow_large_blue',
        kind: 'obj-furniture', tags: [],
        kleuren: {
          '#ffffff': cloth, '#f7e0aa': cloth, '#efc055': cloth,
          '#91b3e6': clothGreen, '#74a7d4': clothGreen, '#567ec1': clothGreen, '*': clothGreen,
        },
      },
      {
        naam: 'pillow-large-sienna', bronmodel: 'pillow_large_red',
        kind: 'obj-furniture', tags: [],
        kleuren: { '#ffffff': cloth, '#e6848c': clothRed, '#d0585e': clothRed, '*': clothRed },
      },
    ],
  },
  {
    kit: 'isa-playground', bron: 'Tiny_Treats_Fun_Playground_1.0_FREE', raster: [8, 8],
    modellen: [
      {
        naam: 'bucket', bronmodel: 'bucket_A', kind: 'obj-container-bucket', tags: ['ngons'],
        cellen: {
          '1,4': worked, '1,5': worked, '3,0': steel, '3,1': steel,
          '5,0': sand, '5,1': sand, '*': worked,
        },
      },
      {
        naam: 'cart', bronmodel: 'cart', kind: 'obj-transport-cart', tags: [],
        cellen: {
          '1,0': black, '1,1': black, '2,0': steel, '2,1': steel, '3,0': steel, '3,1': steel,
          '2,4': painted, '2,5': painted, '*': steel,
        },
      },
      {
        naam: 'fence-corner', bronmodel: 'fence_corner', kind: 'str-barrier-fence', tags: [],
        cellen: { '1,2': worked, '1,3': worked, '*': worked },
      },
      {
        naam: 'fence-post', bronmodel: 'fence_post', kind: 'str-barrier-post', tags: [],
        cellen: { '1,2': worked, '1,3': worked, '*': worked },
      },
      {
        naam: 'fence-rails', bronmodel: 'fence_rails', kind: 'str-barrier-fence', tags: [],
        cellen: { '1,2': worked, '1,3': worked, '*': worked },
      },
      {
        naam: 'fence-rails-long', bronmodel: 'fence_rails_long', kind: 'str-barrier-fence', tags: [],
        cellen: { '1,2': worked, '1,3': worked, '*': worked },
      },
      {
        naam: 'fence-straight', bronmodel: 'fence_straight', kind: 'str-barrier-fence', tags: [],
        cellen: { '1,2': worked, '1,3': worked, '*': worked },
      },
      {
        naam: 'fence-straight-long', bronmodel: 'fence_straight_long',
        kind: 'str-barrier-fence', tags: [],
        cellen: { '1,2': worked, '1,3': worked, '*': worked },
      },
      {
        naam: 'fence-straight-long-open', bronmodel: 'fence_straight_long_open',
        kind: 'str-barrier-fence', tags: [],
        cellen: { '1,2': worked, '1,3': worked, '*': worked },
      },
      {
        naam: 'fence-straight-open', bronmodel: 'fence_straight_open',
        kind: 'str-barrier-fence', tags: [],
        cellen: { '1,2': worked, '1,3': worked, '*': worked },
      },
      {
        naam: 'picnic-table', bronmodel: 'picnic_table', kind: 'obj-furniture-table', tags: [],
        cellen: { '5,0': planks, '5,1': planks, '*': planks },
      },
      {
        naam: 'sandcastle-a', bronmodel: 'sandcastle_A', kind: 'str-building-fort', tags: ['ngons'],
        cellen: { '5,0': sand, '5,1': sand, '*': sand },
      },
      {
        naam: 'sandcastle-b', bronmodel: 'sandcastle_B', kind: 'str-building-fort', tags: ['ngons'],
        cellen: { '5,0': sand, '5,1': sand, '*': sand },
      },
      {
        naam: 'sandcastle-c', bronmodel: 'sandcastle_C', kind: 'str-building-fort', tags: ['ngons'],
        cellen: { '5,0': sand, '5,1': sand, '*': sand },
      },
      {
        naam: 'shovel', bronmodel: 'shovel_A', kind: 'obj-tool-long', tags: [],
        cellen: { '2,4': beam, '2,5': beam, '*': beam },
      },
      {
        naam: 'stepping-stumps', bronmodel: 'stepping_stumps_B',
        kind: 'env-flora-deadwood-stump', tags: ['plural', 'ngons'],
        cellen: { '5,0': log, '5,1': log, '*': log },
      },
      {
        naam: 'stepping-stump-large', bronmodel: 'stepping_stumps_B_large',
        kind: 'env-flora-deadwood-stump', tags: ['ngons'],
        cellen: { '5,0': log, '5,1': log, '*': log },
      },
      {
        naam: 'stepping-stump-medium', bronmodel: 'stepping_stumps_B_medium',
        kind: 'env-flora-deadwood-stump', tags: ['ngons'],
        cellen: { '5,0': log, '5,1': log, '*': log },
      },
      {
        naam: 'stepping-stump-small', bronmodel: 'stepping_stumps_B_small',
        kind: 'env-flora-deadwood-stump', tags: ['ngons'],
        cellen: { '5,0': log, '5,1': log, '*': log },
      },
      {
        naam: 'tree-large', bronmodel: 'tree_large', kind: 'env-flora-tree', tags: [],
        cellen: { '6,4': canopy, '6,5': canopy, '6,0': bark, '6,1': bark, '*': canopy },
      },
      {
        naam: 'tree-small', bronmodel: 'tree_small', kind: 'env-flora-tree', tags: [],
        cellen: { '6,4': canopy, '6,5': canopy, '6,0': bark, '6,1': bark, '*': canopy },
      },
    ],
  },
  {
    kit: 'isa-bakery', bron: 'Tiny_Treats_Bakery_Interior_1.1_FREE', raster: [8, 8],
    modellen: [
      {
        naam: 'basket-a', bronmodel: 'basket_A', kind: 'obj-container', tags: [],
        cellen: { '6,0': beam, '6,1': beam, '*': beam },
      },
      {
        naam: 'basket-b', bronmodel: 'basket_B', kind: 'obj-container', tags: [],
        cellen: { '6,0': beam, '6,1': beam, '*': beam },
      },
      {
        naam: 'bread', bronmodel: 'bread', kind: 'obj-food-grain', tags: [],
        cellen: { '5,0': crust, '5,1': crust, '*': crust },
      },
      {
        naam: 'chair', bronmodel: 'chair', kind: 'obj-furniture-seating-chair', tags: [],
        cellen: { '6,0': beam, '6,1': beam, '*': beam },
      },
      {
        naam: 'cookie', bronmodel: 'cookie', kind: 'obj-food-grain', tags: ['decorated'],
        cellen: {
          '5,0': crust, '5,1': crust, '2,4': chocolate, '2,5': chocolate, '*': crust,
        },
      },
      {
        naam: 'cookie-jar', bronmodel: 'cookie_jar', kind: 'obj-container-pot', tags: ['ngons'],
        cellen: { '3,0': porcelain, '3,1': porcelain, '*': porcelain },
      },
      {
        naam: 'counter-closet-a-large', bronmodel: 'countertop_closet_A_large',
        kind: 'obj-furniture-storage', tags: [],
        cellen: { '5,0': worked, '5,1': worked, '*': worked },
      },
      {
        naam: 'counter-closet-a-small', bronmodel: 'countertop_closet_A_small',
        kind: 'obj-furniture-storage', tags: [],
        cellen: { '5,0': worked, '5,1': worked, '*': worked },
      },
      {
        naam: 'counter-closet-b-large', bronmodel: 'countertop_closet_B_large',
        kind: 'obj-furniture-storage', tags: [],
        cellen: { '5,0': worked, '5,1': worked, '*': worked },
      },
      {
        naam: 'counter-closet-b-small', bronmodel: 'countertop_closet_B_small',
        kind: 'obj-furniture-storage', tags: [],
        cellen: { '5,0': worked, '5,1': worked, '*': worked },
      },
      {
        naam: 'cream-puff', bronmodel: 'cream_puff', kind: 'obj-food-grain', tags: [],
        cellen: { '5,0': crust, '5,1': crust, '4,0': dough, '4,1': dough, '*': crust },
      },
      {
        naam: 'dough-ball', bronmodel: 'dough_ball', kind: 'obj-food-grain', tags: ['ngons'],
        cellen: { '4,4': dough, '4,5': dough, '*': dough },
      },
      {
        naam: 'egg-ivory', bronmodel: 'egg_A', kind: 'obj-food', tags: [],
        cellen: { '4,0': cream, '4,1': cream, '*': cream },
      },
      {
        naam: 'egg-camel', bronmodel: 'egg_B', kind: 'obj-food', tags: [],
        cellen: { '5,0': crust, '5,1': crust, '*': crust },
      },
      {
        naam: 'rolling-pin', bronmodel: 'dough_roller', kind: 'obj-kitchenware-cookware', tags: ['ngons'],
        cellen: { '5,0': worked, '5,1': worked, '*': worked },
      },
      {
        naam: 'flour-sack', bronmodel: 'flour_sack_closed', kind: 'obj-food-grain', tags: [],
        cellen: {
          '5,0': sackcloth, '5,1': sackcloth, '4,0': sackLabel, '4,1': sackLabel, '*': sackcloth,
        },
      },
      {
        naam: 'flour-sack-open', bronmodel: 'flour_sack_open', kind: 'obj-food-grain', tags: [],
        cellen: {
          '5,0': sackcloth, '5,1': sackcloth, '4,0': sackLabel, '4,1': sackLabel, '*': sackcloth,
        },
      },
      {
        naam: 'mug-taupe', bronmodel: 'mug_A_blue',
        kind: 'obj-kitchenware-tableware-drinkware-mug', tags: ['ngons'],
        cellen: { '3,2': stoneware, '3,3': stoneware, '*': stoneware },
      },
      {
        naam: 'mug-ivory-stacked', bronmodel: 'mug_B_stacked',
        kind: 'obj-kitchenware-tableware-drinkware-mug', tags: ['plural', 'ngons'],
        cellen: { '3,0': porcelain, '3,1': porcelain, '*': porcelain },
      },
      {
        naam: 'mug-ivory', bronmodel: 'mug_B',
        kind: 'obj-kitchenware-tableware-drinkware-mug', tags: ['ngons'],
        cellen: { '3,0': porcelain, '3,1': porcelain, '*': porcelain },
      },
      {
        naam: 'mixing-bowl', bronmodel: 'mixing_bowl',
        kind: 'obj-kitchenware-tableware-bowl', tags: ['ngons'],
        cellen: { '2,0': steel, '2,1': steel, '*': steel },
      },
      {
        naam: 'pastry-stand', bronmodel: 'pastry_stand_A',
        kind: 'obj-kitchenware-tableware-plate', tags: ['ngons'],
        cellen: { '6,0': beam, '6,1': beam, '*': beam },
      },
      {
        naam: 'pastry-stand-covered', bronmodel: 'pastry_stand_A_covered',
        kind: 'obj-kitchenware-tableware-plate', tags: ['ngons'],
        cellen: { '6,0': beam, '6,1': beam, '3,2': glass, '3,3': glass, '*': beam },
      },
      {
        naam: 'pastry-stand-filled', bronmodel: 'pastry_stand_A_decorated',
        kind: 'assy', tags: ['plural', 'decorated', 'ngons'],
        cellen: {
          '6,0': beam, '6,1': beam, '5,0': crust, '5,1': crust,
          '2,4': fruitRed, '2,5': fruitRed, '*': beam,
        },
      },
      {
        naam: 'pastry-stand-tiered', bronmodel: 'pastry_stand_B',
        kind: 'obj-kitchenware-tableware-plate', tags: ['ngons'],
        cellen: { '2,0': steel, '2,1': steel, '*': steel },
      },
      {
        naam: 'plate', bronmodel: 'plate', kind: 'obj-kitchenware-tableware-plate', tags: ['ngons'],
        cellen: {
          '3,0': porcelain, '3,1': porcelain, '3,2': earthenware, '3,3': earthenware,
          '*': porcelain,
        },
      },
      {
        naam: 'plate-stacked', bronmodel: 'plate_stacked',
        kind: 'obj-kitchenware-tableware-plate', tags: ['plural', 'ngons'],
        cellen: { '3,0': porcelain, '3,1': porcelain, '*': porcelain },
      },
      {
        naam: 'pretzel', bronmodel: 'pretzel', kind: 'obj-food-grain', tags: [],
        cellen: { '5,0': crust, '5,1': crust, '*': crust },
      },
      {
        naam: 'rug', bronmodel: 'rug', kind: 'obj-furniture', tags: [],
        cellen: {
          '4,2': clothGreen, '4,3': clothGreen, '3,0': cloth, '3,1': cloth, '*': cloth,
        },
      },
      {
        naam: 'serving-tray', bronmodel: 'serving_tray',
        kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: {
          '6,0': beam, '6,1': beam, '4,2': clothGreen, '4,3': clothGreen,
          '3,0': cloth, '3,1': cloth, '*': beam,
        },
      },
      {
        naam: 'table-round', bronmodel: 'table_round_A', kind: 'obj-furniture-table', tags: ['ngons'],
        cellen: { '6,0': beam, '6,1': beam, '*': beam },
      },
      {
        naam: 'tin-a', bronmodel: 'tin_A_beige', kind: 'obj-container-pot', tags: ['ngons'],
        cellen: { '4,0': porcelain, '4,1': porcelain, '*': porcelain },
      },
      {
        naam: 'tin-b', bronmodel: 'tin_B_beige', kind: 'obj-container-pot', tags: ['ngons'],
        cellen: { '4,0': porcelain, '4,1': porcelain, '*': porcelain },
      },
      {
        naam: 'whisk', bronmodel: 'whisk', kind: 'obj-kitchenware-cookware', tags: [],
        cellen: { '2,0': steel, '2,1': steel, '2,4': worked, '2,5': worked, '*': steel },
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
  pakket.generator = 'tools/importeer/tiny-treats.mjs';

  const { modellen } = bronModellen(bronkit);
  const perNaam = new Map(modellen.map((model) => [model.naam, model]));
  const plek = pakket.raster ? null : bandPlekken(pakket);
  const doelMap = kitMap(pakket.kit);

  console.log(`\n${pakket.kit}  (${bronkit.naam})  scale ${pakket.schaal}`);
  for (const opgave of pakket.modellen) {
    const model = perNaam.get(opgave.bronmodel);
    if (!model) throw new Error(`${opgave.bronmodel}: not in ${pakket.bron}`);
    const gekeerd = richtSchillen(model);
    const gericht = pakket.raster ? 0 : richtWinding(model);

    const mesh = bouw(model.primitieven, opgave, pakket, plek);
    schrijf(join(doelMap, `${opgave.naam}.glb`), mesh, opgave, pakket);

    const materialen = [...mesh.materialen];
    regels.push([`${pakket.kit}/${opgave.naam}`, [opgave.kind, ...materialen, ...opgave.tags]]);
    perKit.set(pakket.kit, [...(perKit.get(pakket.kit) ?? []), opgave.naam]);

    console.log(
      `  ${opgave.bronmodel.padEnd(28)} → ${opgave.naam.padEnd(28)} `
        + `${String(mesh.driehoeken.length / 3).padStart(5)} tris, `
        + `${materialen.length} material(s), ${mesh.banden.size} band(s): ${[...mesh.banden].join(', ')}`
        + `${gekeerd ? `, ${gekeerd} turned out` : ''}`
        + `${gericht ? `, ${gericht} rewound` : ''}`,
    );
  }
}

zetTags(regels);
zetManifest(perKit);
console.log(`\n${regels.length} models added to kits/workfiles`);
