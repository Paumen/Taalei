import { join } from 'node:path';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';
import {
  bouw, schrijf, bandPlekken, kitMap, zetTags, zetManifest, richtSchillen, richtWinding,
} from './bouwer.mjs';

const steel = ['metal-iron-steel', 'nickel'];
const painted = ['metal', 'sienna'];
const black = ['metal', 'basalt'];

const planks = ['wood-planks', 'tan'];
const worked = ['wood-worked', 'camel'];
const beam = ['wood-beam', 'chestnut'];
const bark = ['wood-bark', 'umber'];
const log = ['wood-log', 'tan'];

const sand = ['stone-soil', 'taupe'];
const masonry = ['stone-masonry', 'nickel'];
const water = ['liquid', 'azure'];
const cast = ['metal-iron-cast', 'slate'];
const porcelain = ['ceramic', 'ivory'];
const earthenware = ['ceramic', 'terracotta'];
const stoneware = ['ceramic', 'taupe'];
const glass = ['glass', 'hunter'];
const paper = ['paper', 'ivory'];
const cork = ['cork', 'taupe'];

const cloth = ['textile', 'ivory'];
const clothRed = ['textile', 'sienna', 0.5];
const clothLinen = ['textile', 'taupe', 0.5];

const leaf = ['foliage', 'moss'];
const canopy = ['foliage', 'hunter'];
const stem = ['vegetation', 'umber'];
const sackcloth = ['vegetation', 'camel'];
const sackLabel = ['vegetation', 'tan'];

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
    kit: 'isa-picnic', bron: 'Tiny_Treats_Pleasant_Picnic_1.0_FREE', schaal: 0.24, raster: [8, 4],
    modellen: [
      {
        naam: 'apple', bronmodel: 'apple', kind: 'obj-food', tags: [],
        cellen: { '2,2': fruitRed, '6,0': stem, '*': fruitRed },
      },
      {
        naam: 'apple-cut', bronmodel: 'apple_cut', kind: 'obj-food', tags: [],
        cellen: { '2,2': fruitRed, '6,0': stem, '4,0': cream, '*': fruitRed },
      },
      {
        naam: 'apple-piece', bronmodel: 'apple_piece', kind: 'obj-food', tags: [],
        cellen: { '2,2': fruitRed, '4,0': cream, '1,0': pip, '*': fruitRed },
      },
      {
        naam: 'bowl', bronmodel: 'bowl', kind: 'obj-kitchenware-tableware-bowl', tags: [],
        cellen: { '3,2': earthenware, '*': earthenware },
      },
      {
        naam: 'cheese-wedge', bronmodel: 'cheese_A', kind: 'obj-food', tags: [],
        cellen: { '1,2': cheese, '*': cheese },
      },
      {
        naam: 'cheese-wheel', bronmodel: 'cheese_B', kind: 'obj-food', tags: [],
        cellen: { '3,0': cheese, '4,0': cheese, '*': cheese },
      },
      {
        naam: 'fork', bronmodel: 'fork', kind: 'obj-kitchenware-tableware-cutlery', tags: [],
        cellen: { '1,2': worked, '2,0': steel, '*': steel },
      },
      {
        naam: 'knife', bronmodel: 'knife', kind: 'obj-kitchenware-tableware-cutlery', tags: [],
        cellen: { '1,2': worked, '2,0': steel, '*': steel },
      },
      {
        naam: 'spoon', bronmodel: 'spoon', kind: 'obj-kitchenware-tableware-cutlery', tags: [],
        cellen: { '1,2': worked, '2,0': steel, '*': steel },
      },
      {
        naam: 'grapes', bronmodel: 'grapes', kind: 'obj-food', tags: ['plural'],
        cellen: { '6,2': greens, '6,0': stem, '*': greens },
      },
      {
        naam: 'grapes-bowl', bronmodel: 'grapes_bowl', kind: 'assy', tags: ['plural'],
        cellen: { '3,1': porcelain, '6,2': greens, '*': porcelain },
      },
      {
        naam: 'mug', bronmodel: 'mug', kind: 'obj-kitchenware-tableware-drinkware-mug', tags: [],
        cellen: { '2,1': porcelain, '*': porcelain },
      },
      {
        naam: 'basket-round', bronmodel: 'picnic_basket_round', kind: 'obj-container', tags: [],
        cellen: { '5,0': worked, '6,0': beam, '*': worked },
      },
      {
        naam: 'basket-square', bronmodel: 'picnic_basket_square', kind: 'obj-container', tags: [],
        cellen: { '5,0': worked, '6,0': beam, '2,0': steel, '*': worked },
      },
      {
        naam: 'pillow-small-taupe', bronmodel: 'pillow_small_blue', kind: 'obj-furniture', tags: [],
        cellen: { '3,1': clothLinen, '*': clothLinen },
      },
      {
        naam: 'pillow-small-sienna', bronmodel: 'pillow_small_red', kind: 'obj-furniture', tags: [],
        cellen: { '5,2': clothRed, '*': clothRed },
      },
      {
        naam: 'plate', bronmodel: 'plate_A', kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '3,0': porcelain, '3,1': earthenware, '*': porcelain },
      },
      {
        naam: 'plate-flower', bronmodel: 'plate_B', kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '1,2': earthenware, '*': earthenware },
      },
      {
        naam: 'sandwich', bronmodel: 'sandwich', kind: 'obj-food', tags: [],
        cellen: {
          '5,0': crust, '4,2': dough, '0,1': salad, '6,2': salad, '1,2': cheese,
          '2,2': fruitRed, '6,0': salad, '*': crust,
        },
      },
      {
        naam: 'tray-round', bronmodel: 'serving_tray_round',
        kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '5,0': worked, '*': worked },
      },
      {
        naam: 'tray-square', bronmodel: 'serving_tray_square_A',
        kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '5,0': worked, '*': worked },
      },
      {
        naam: 'tray-square-handles', bronmodel: 'serving_tray_square_B',
        kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '5,0': worked, '*': worked },
      },
      {
        naam: 'teapot', bronmodel: 'teapot', kind: 'obj-kitchenware-cookware-pot', tags: [],
        cellen: { '2,1': earthenware, '*': earthenware },
      },
      {
        naam: 'wine-bottle', bronmodel: 'wine_bottle', kind: 'obj-container-bottle', tags: [],
        cellen: { '1,1': glass, '7,0': cork, '3,0': paper, '*': glass },
      },
      {
        naam: 'wine-glass', bronmodel: 'wine_glass',
        kind: 'obj-kitchenware-tableware-drinkware', tags: [],
        cellen: { '3,1': glass, '*': glass },
      },
    ],
  },
  {
    kit: 'isa-picnic', bron: 'Tiny_Treats_Pleasant_Picnic_1.0_FREE', schaal: 0.24, atlas: true,
    modellen: [
      {
        naam: 'jam-jar', bronmodel: 'jam', kind: 'obj-container-pot', tags: [],
        kleuren: {
          '#ffffff': clothLinen, '#e6848c': clothLinen, '#d0585e': clothLinen,
          '#f8eee6': paper, '#f8ede4': paper, '#f9efe8': paper, '#f9eee7': paper,
          '#f8dcc8': paper, '#f8dac5': paper, '*': fruitRed,
        },
      },
      {
        naam: 'picnic-blanket-taupe', bronmodel: 'picnic_blanket_blue',
        kind: 'obj-furniture', tags: [],
        kleuren: {
          '#567ec1': clothLinen, '#74a7d4': clothLinen, '#91b3e6': clothLinen,
          '#bad0ef': clothLinen, '#f7e0aa': clothLinen, '#efc055': clothLinen,
          '#ffffff': clothLinen, '*': clothLinen,
        },
      },
      {
        naam: 'picnic-blanket-taupe-folded', bronmodel: 'picnic_blanket_blue_folded',
        kind: 'obj-furniture', tags: [],
        kleuren: {
          '#567ec1': clothLinen, '#74a7d4': clothLinen, '#91b3e6': clothLinen,
          '#bad0ef': clothLinen, '#f7e0aa': clothLinen, '#efc055': clothLinen,
          '#ffffff': clothLinen, '*': clothLinen,
        },
      },
      {
        naam: 'picnic-blanket-sienna', bronmodel: 'picnic_blanket_red',
        kind: 'obj-furniture', tags: [],
        kleuren: {
          '#d0585e': clothRed, '#e6848c': clothRed, '#ffffff': clothRed, '*': clothRed,
        },
      },
      {
        naam: 'picnic-blanket-sienna-folded', bronmodel: 'picnic_blanket_red_folded',
        kind: 'obj-furniture', tags: [],
        kleuren: {
          '#d0585e': clothRed, '#e6848c': clothRed, '#ffffff': clothRed, '*': clothRed,
        },
      },
      {
        naam: 'pillow-large-taupe', bronmodel: 'pillow_large_blue',
        kind: 'obj-furniture', tags: [],
        kleuren: {
          '#567ec1': clothLinen, '#74a7d4': clothLinen, '#91b3e6': clothLinen,
          '#bad0ef': clothLinen, '#f7e0aa': clothLinen, '#efc055': clothLinen,
          '#ffffff': clothLinen, '*': clothLinen,
        },
      },
      {
        naam: 'pillow-large-sienna', bronmodel: 'pillow_large_red',
        kind: 'obj-furniture', tags: [],
        kleuren: {
          '#d0585e': clothRed, '#e6848c': clothRed, '#ffffff': clothRed, '*': clothRed,
        },
      },
    ],
  },
  {
    kit: 'isa-playground', bron: 'Tiny_Treats_Fun_Playground_1.0_FREE', schaal: 0.24, raster: [8, 4],
    modellen: [
      {
        naam: 'bucket', bronmodel: 'bucket_A', kind: 'obj-container-bucket', tags: [],
        cellen: { '1,2': worked, '3,0': steel, '5,0': sand, '*': worked },
      },
      {
        naam: 'cart', bronmodel: 'cart', kind: 'obj-transport-cart', tags: [],
        cellen: { '1,0': black, '2,0': steel, '3,0': steel, '2,2': painted, '*': steel },
      },
      {
        naam: 'fence-corner', bronmodel: 'fence_corner', kind: 'str-barrier-fence', tags: [],
        cellen: { '1,1': worked, '*': worked },
      },
      {
        naam: 'fence-post', bronmodel: 'fence_post', kind: 'str-barrier-post', tags: [],
        cellen: { '1,1': worked, '*': worked },
      },
      {
        naam: 'fence-rails', bronmodel: 'fence_rails', kind: 'str-barrier-fence', tags: [],
        cellen: { '1,1': worked, '*': worked },
      },
      {
        naam: 'fence-rails-long', bronmodel: 'fence_rails_long', kind: 'str-barrier-fence', tags: [],
        cellen: { '1,1': worked, '*': worked },
      },
      {
        naam: 'fence-straight', bronmodel: 'fence_straight', kind: 'str-barrier-fence', tags: [],
        cellen: { '1,1': worked, '*': worked },
      },
      {
        naam: 'fence-straight-long', bronmodel: 'fence_straight_long',
        kind: 'str-barrier-fence', tags: [],
        cellen: { '1,1': worked, '*': worked },
      },
      {
        naam: 'fence-straight-long-open', bronmodel: 'fence_straight_long_open',
        kind: 'str-barrier-fence', tags: [],
        cellen: { '1,1': worked, '*': worked },
      },
      {
        naam: 'fence-straight-open', bronmodel: 'fence_straight_open',
        kind: 'str-barrier-fence', tags: [],
        cellen: { '1,1': worked, '*': worked },
      },
      {
        naam: 'picnic-table', bronmodel: 'picnic_table', kind: 'obj-furniture-table', tags: [],
        cellen: { '5,0': planks, '*': planks },
      },
      {
        naam: 'sandcastle-a', bronmodel: 'sandcastle_A', kind: 'str-building-fort', tags: [],
        cellen: { '5,0': sand, '*': sand },
      },
      {
        naam: 'sandcastle-b', bronmodel: 'sandcastle_B', kind: 'str-building-fort', tags: [],
        cellen: { '5,0': sand, '*': sand },
      },
      {
        naam: 'sandcastle-c', bronmodel: 'sandcastle_C', kind: 'str-building-fort', tags: [],
        cellen: { '5,0': sand, '*': sand },
      },
      {
        naam: 'shovel', bronmodel: 'shovel_A', kind: 'obj-tool-long', tags: [],
        cellen: { '2,2': beam, '*': beam },
      },
      {
        naam: 'stepping-stumps', bronmodel: 'stepping_stumps_B',
        kind: 'env-flora-deadwood-stump', tags: ['plural'],
        cellen: { '5,0': log, '*': log },
      },
      {
        naam: 'stepping-stump-large', bronmodel: 'stepping_stumps_B_large',
        kind: 'env-flora-deadwood-stump', tags: [],
        cellen: { '5,0': log, '*': log },
      },
      {
        naam: 'stepping-stump-medium', bronmodel: 'stepping_stumps_B_medium',
        kind: 'env-flora-deadwood-stump', tags: [],
        cellen: { '5,0': log, '*': log },
      },
      {
        naam: 'stepping-stump-small', bronmodel: 'stepping_stumps_B_small',
        kind: 'env-flora-deadwood-stump', tags: [],
        cellen: { '5,0': log, '*': log },
      },
      {
        naam: 'tree-large', bronmodel: 'tree_large', kind: 'env-flora-tree', tags: [],
        cellen: { '6,2': canopy, '6,0': bark, '*': canopy },
      },
      {
        naam: 'tree-small', bronmodel: 'tree_small', kind: 'env-flora-tree', tags: [],
        cellen: { '6,2': canopy, '6,0': bark, '*': canopy },
      },
    ],
  },
  {
    kit: 'isa-bakery', bron: 'Tiny_Treats_Bakery_Interior_1.1_FREE', schaal: 0.32, raster: [8, 4],
    modellen: [
      {
        naam: 'basket-a', bronmodel: 'basket_A', kind: 'obj-container', tags: [],
        cellen: { '6,0': beam, '*': beam },
      },
      {
        naam: 'basket-b', bronmodel: 'basket_B', kind: 'obj-container', tags: [],
        cellen: { '6,0': beam, '*': beam },
      },
      {
        naam: 'bread', bronmodel: 'bread', kind: 'obj-food-grain', tags: [],
        cellen: { '5,0': crust, '*': crust },
      },
      {
        naam: 'chair', bronmodel: 'chair', kind: 'obj-furniture-seating-chair', tags: [],
        cellen: { '6,0': beam, '*': beam },
      },
      {
        naam: 'cookie', bronmodel: 'cookie', kind: 'obj-food-grain', tags: [],
        cellen: { '5,0': crust, '2,2': chocolate, '*': crust },
      },
      {
        naam: 'cookie-jar', bronmodel: 'cookie_jar', kind: 'obj-container-pot', tags: [],
        cellen: { '3,0': porcelain, '*': porcelain },
      },
      {
        naam: 'counter-closet-a-large', bronmodel: 'countertop_closet_A_large',
        kind: 'obj-furniture-storage', tags: [],
        cellen: { '5,0': worked, '*': worked },
      },
      {
        naam: 'counter-closet-a-small', bronmodel: 'countertop_closet_A_small',
        kind: 'obj-furniture-storage', tags: [],
        cellen: { '5,0': worked, '*': worked },
      },
      {
        naam: 'counter-closet-b-large', bronmodel: 'countertop_closet_B_large',
        kind: 'obj-furniture-storage', tags: [],
        cellen: { '5,0': worked, '*': worked },
      },
      {
        naam: 'counter-closet-b-small', bronmodel: 'countertop_closet_B_small',
        kind: 'obj-furniture-storage', tags: [],
        cellen: { '5,0': worked, '*': worked },
      },
      {
        naam: 'cream-puff', bronmodel: 'cream_puff', kind: 'obj-food-grain', tags: [],
        cellen: { '5,0': crust, '4,0': dough, '*': crust },
      },
      {
        naam: 'dough-ball', bronmodel: 'dough_ball', kind: 'obj-food-grain', tags: [],
        cellen: { '4,2': dough, '*': dough },
      },
      {
        naam: 'egg-ivory', bronmodel: 'egg_A', kind: 'obj-food', tags: [],
        cellen: { '4,0': cream, '*': cream },
      },
      {
        naam: 'egg-camel', bronmodel: 'egg_B', kind: 'obj-food', tags: [],
        cellen: { '5,0': crust, '*': crust },
      },
      {
        naam: 'rolling-pin', bronmodel: 'dough_roller', kind: 'obj-kitchenware-cookware', tags: [],
        cellen: { '5,0': worked, '*': worked },
      },
      {
        naam: 'flour-sack', bronmodel: 'flour_sack_closed', kind: 'obj-food-grain', tags: [],
        cellen: { '5,0': sackcloth, '4,0': sackLabel, '*': sackcloth },
      },
      {
        naam: 'flour-sack-open', bronmodel: 'flour_sack_open', kind: 'obj-food-grain', tags: [],
        cellen: { '5,0': sackcloth, '4,0': sackLabel, '*': sackcloth },
      },
      {
        naam: 'mug-taupe', bronmodel: 'mug_A_blue',
        kind: 'obj-kitchenware-tableware-drinkware-mug', tags: [],
        cellen: { '3,1': stoneware, '*': stoneware },
      },
      {
        naam: 'mug-ivory-stacked', bronmodel: 'mug_B_stacked',
        kind: 'obj-kitchenware-tableware-drinkware-mug', tags: ['plural'],
        cellen: { '3,0': porcelain, '*': porcelain },
      },
      {
        naam: 'mug-ivory', bronmodel: 'mug_B',
        kind: 'obj-kitchenware-tableware-drinkware-mug', tags: [],
        cellen: { '3,0': porcelain, '*': porcelain },
      },
      {
        naam: 'mixing-bowl', bronmodel: 'mixing_bowl',
        kind: 'obj-kitchenware-tableware-bowl', tags: [],
        cellen: { '2,0': steel, '*': steel },
      },
      {
        naam: 'pastry-stand', bronmodel: 'pastry_stand_A',
        kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '6,0': beam, '*': beam },
      },
      {
        naam: 'pastry-stand-covered', bronmodel: 'pastry_stand_A_covered',
        kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '6,0': beam, '3,1': glass, '*': beam },
      },
      {
        naam: 'pastry-stand-filled', bronmodel: 'pastry_stand_A_decorated',
        kind: 'assy', tags: ['plural'],
        cellen: { '6,0': beam, '5,0': crust, '2,2': fruitRed, '*': beam },
      },
      {
        naam: 'pastry-stand-tiered', bronmodel: 'pastry_stand_B',
        kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '2,0': steel, '*': steel },
      },
      {
        naam: 'plate', bronmodel: 'plate', kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '3,0': porcelain, '3,1': earthenware, '*': porcelain },
      },
      {
        naam: 'plate-stacked', bronmodel: 'plate_stacked',
        kind: 'obj-kitchenware-tableware-plate', tags: ['plural'],
        cellen: { '3,0': porcelain, '*': porcelain },
      },
      {
        naam: 'pretzel', bronmodel: 'pretzel', kind: 'obj-food-grain', tags: [],
        cellen: { '5,0': crust, '*': crust },
      },
      {
        naam: 'rug', bronmodel: 'rug', kind: 'obj-furniture', tags: [],
        cellen: { '4,1': clothLinen, '3,0': cloth, '*': cloth },
      },
      {
        naam: 'serving-tray', bronmodel: 'serving_tray',
        kind: 'obj-kitchenware-tableware-plate', tags: [],
        cellen: { '6,0': beam, '4,1': clothLinen, '3,0': cloth, '*': beam },
      },
      {
        naam: 'table-round', bronmodel: 'table_round_A', kind: 'obj-furniture-table', tags: [],
        cellen: { '6,0': beam, '*': beam },
      },
      {
        naam: 'tin-a', bronmodel: 'tin_A_beige', kind: 'obj-container-pot', tags: [],
        cellen: { '4,0': porcelain, '*': porcelain },
      },
      {
        naam: 'tin-b', bronmodel: 'tin_B_beige', kind: 'obj-container-pot', tags: [],
        cellen: { '4,0': porcelain, '*': porcelain },
      },
      {
        naam: 'whisk', bronmodel: 'whisk', kind: 'obj-kitchenware-cookware', tags: [],
        cellen: { '2,0': steel, '2,2': worked, '*': steel },
      },
    ],
  },
  {
    kit: 'isa-park', bron: 'Pretty_park_set', schaal: 0.24, raster: [8, 4],
    modellen: [
      {
        naam: 'fountain', bronmodel: 'Fountain', kind: 'obj-art-sculpture', tags: [],
        cellen: { '2,0': masonry, '0,1': water, '1,3': water, '*': masonry },
      },
      {
        naam: 'grass-a', bronmodel: 'Grass A', kind: 'env-flora-plant-grass', tags: ['plural'],
        cellen: { '*': leaf },
      },
      {
        naam: 'grass-b', bronmodel: 'Grass B', kind: 'env-flora-plant-grass', tags: ['plural'],
        cellen: { '*': leaf },
      },
    ],
  },
  {
    kit: 'isa-kitchen', bron: 'Tiny_Treats_Charming_Kitchen_1.1_FREE', schaal: 0.32, raster: [8, 4],
    modellen: [
      {
        naam: 'chair', bronmodel: 'chair', kind: 'obj-furniture-seating-chair', tags: [],
        cellen: { '5,0': worked, '3,0': beam, '*': worked },
      },
      {
        naam: 'door-modular', bronmodel: 'door_modular', kind: 'str-part-door', tags: [],
        cellen: { '2,0': cast, '3,0': worked, '*': worked },
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
