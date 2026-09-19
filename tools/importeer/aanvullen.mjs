import { join } from 'node:path';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';
import {
  bouw, schrijf, bandPlekken, kitMap, zetTags, zetManifest, ontdubbel, richtSchillen,
  richtWinding,
} from './bouwer.mjs';
import { scaleTarget } from './scale-factors.mjs';

const planks = ['wood-planks', 'tan'];
const worked = ['wood-worked', 'camel'];
const beam = ['wood-beam', 'chestnut'];
const bark = ['wood-bark', 'umber'];

const steel = ['metal-iron-steel', 'nickel'];
const cast = ['metal-iron-cast', 'slate'];
const wrought = ['metal-iron-wrought', 'basalt'];

const masonry = ['stone-masonry', 'taupe'];
const masonryDark = ['stone-masonry', 'slate'];
const rock = ['stone-rock', 'nickel'];
const soilBed = ['stone-soil', 'taupe'];

const plaster = ['ceramic', 'ivory'];
const paint = ['ceramic', 'sienna'];
const enamel = ['ceramic', 'terracotta'];

const clothRed = ['textile', 'sienna'];
const clothGreen = ['textile', 'hunter'];
const grip = ['textile', 'taupe'];

const leafDark = ['foliage', 'hunter'];
const leafGreen = ['foliage', 'moss'];
const hedgeGreen = ['foliage', 'hunter'];
const hedgeAmber = ['foliage', 'amber'];
const pollen = ['foliage', 'amber'];

const petal = ['vegetation', 'ivory'];
const straw = ['vegetation', 'tan'];

const strap = ['leather', 'camel'];
const water = ['liquid', 'azure'];
const molten = ['emissive', 'amber'];
const boneIvory = ['bone', 'ivory'];

const hide = ['skin', 'taupe'];
const hidePale = ['skin', 'tan'];
const hideDark = ['skin', 'umber'];

const fleshRed = ['food', 'sienna'];
const fleshGreen = ['food', 'moss'];
const fleshAmber = ['food', 'amber'];
const fleshIvory = ['food', 'ivory'];
const fleshOrange = ['food', 'terracotta'];
const fleshDark = ['food', 'basalt'];

const PAKKETTEN = [
  {
    kit: 'gob-nature', bron: 'gobkit_nature-kit', raster: [16, 4],
    sleutels: { '14,0': rock, '*': leafDark },
    modellen: [
      {
        naam: 'bush-a', bronmodel: 'Bush001', kind: 'env-flora-plant', tags: [],
        cellen: { '6,0': leafGreen, '*': leafGreen },
      },
      {
        naam: 'bush-b', bronmodel: 'Bush002', kind: 'env-flora-plant', tags: [],
        cellen: { '6,0': leafGreen, '*': leafGreen },
      },
      { naam: 'rock-a', bronmodel: 'Rock001', kind: 'env-rock-boulder', tags: [] },
      { naam: 'rock-b', bronmodel: 'Rock002', kind: 'env-rock-boulder', tags: [] },
      { naam: 'rock-c', bronmodel: 'Rock003', kind: 'env-rock-boulder', tags: [] },
      {
        naam: 'tree-a', bronmodel: 'TreeLow001', kind: 'env-flora-tree', tags: [],
        cellen: { '6,0': leafDark, '2,1': bark, '*': leafDark },
      },
      {
        naam: 'tree-b', bronmodel: 'TreeLow002', kind: 'env-flora-tree', tags: [],
        cellen: { '6,0': leafDark, '2,1': bark, '*': leafDark },
      },
      {
        naam: 'tree-c', bronmodel: 'TreeLow003', kind: 'env-flora-tree', tags: [],
        cellen: { '6,0': leafDark, '2,1': bark, '*': leafDark },
      },
      {
        naam: 'conifer-small', bronmodel: 'TreeLow004', kind: 'env-flora-tree-conifer', tags: [],
        cellen: { '6,0': leafDark, '2,1': bark, '*': leafDark },
      },
      {
        naam: 'conifer', bronmodel: 'TreeMed001', kind: 'env-flora-tree-conifer', tags: [],
        cellen: { '3,0': leafDark, '6,1': bark, '*': leafDark },
      },
      {
        naam: 'conifer-large', bronmodel: 'TreeMed002', kind: 'env-flora-tree-conifer', tags: [],
        cellen: { '3,0': leafDark, '6,1': bark, '*': leafDark },
      },
    ],
  },

  {
    kit: 'styloo-farm', bron: 'Cozy_Farm', raster: [8, 8],
    sleutels: { '5,4': beam, '2,7': steel, '4,0': rock, '*': beam },
    modellen: [
      {
        naam: 'apple', bronmodel: 'apple', kind: 'obj-food-fruit', tags: [],
        cellen: { '0,2': fleshRed, '6,1': leafDark, '5,4': bark, '*': fleshRed },
      },
      {
        naam: 'apple-moss', bronmodel: 'applegreen', kind: 'obj-food-fruit', tags: [],
        cellen: { '5,1': fleshGreen, '6,1': leafDark, '5,4': bark, '*': fleshGreen },
      },
      {
        naam: 'banana', bronmodel: 'banana', kind: 'obj-food-fruit', tags: [],
        cellen: { '5,2': fleshAmber, '*': fleshAmber },
      },
      {
        naam: 'banana-moss', bronmodel: 'bananagreen', kind: 'obj-food-fruit', tags: [],
        cellen: { '5,1': fleshGreen, '*': fleshGreen },
      },
      {
        naam: 'barn-small', bronmodel: 'barnlvl1', kind: 'str-building-farming-barn', tags: [],
        cellen: { '0,2': paint, '3,7': cast, '2,7': cast, '4,7': plaster, '*': paint },
      },
      {
        naam: 'barn', bronmodel: 'barnlvl2', kind: 'str-building-farming-barn', tags: [],
        cellen: { '0,2': paint, '4,7': plaster, '5,7': plaster, '5,4': beam, '*': paint },
      },
      {
        naam: 'barn-large', bronmodel: 'barnlvl3', kind: 'str-building-farming-barn', tags: [],
        cellen: {
          '0,2': paint, '4,7': plaster, '5,7': plaster, '5,0': masonry, '5,4': beam, '*': paint,
        },
      },
      {
        naam: 'barrel', bronmodel: 'barrel', kind: 'obj-container-barrel', tags: [],
        cellen: { '5,4': planks, '2,7': steel, '*': planks },
      },
      {
        naam: 'bench-small', bronmodel: 'benchlittle',
        kind: 'obj-furniture-seating-bench', tags: [],
        cellen: { '5,4': planks, '*': planks },
      },
      {
        naam: 'sign-board', bronmodel: 'billboard', kind: 'str-marker-sign', tags: [],
        cellen: { '5,4': beam, '3,4': strap, '*': beam },
      },
      {
        naam: 'bucket-metal', bronmodel: 'bucket', kind: 'obj-container-bucket', tags: [],
        cellen: { '2,7': steel, '0,7': steel, '0,6': steel, '5,4': beam, '*': steel },
      },
      {
        naam: 'bucket-wooden', bronmodel: 'bucketwooden', kind: 'obj-container-bucket', tags: [],
        cellen: { '5,4': planks, '2,7': steel, '*': planks },
      },
      {
        naam: 'hedge', bronmodel: 'bushescubegreen', kind: 'str-barrier', tags: [],
        cellen: { '5,1': hedgeGreen, '*': hedgeGreen },
      },
      {
        naam: 'hedge-amber', bronmodel: 'bushescubeyellow', kind: 'str-barrier', tags: [],
        cellen: { '0,4': hedgeAmber, '*': hedgeAmber },
      },
      {
        naam: 'bush', bronmodel: 'bushesgreen', kind: 'env-flora-plant', tags: [],
        cellen: { '5,1': leafGreen, '*': leafGreen },
      },
      {
        naam: 'hedge-arch', bronmodel: 'bushesportalgreen', kind: 'str-barrier', tags: [],
        cellen: { '5,1': hedgeGreen, '*': hedgeGreen },
      },
      {
        naam: 'carrot', bronmodel: 'carrot_', kind: 'obj-food-vegetable', tags: [],
        cellen: { '1,3': fleshOrange, '5,1': leafGreen, '*': fleshOrange },
      },
      {
        naam: 'cart', bronmodel: 'cart', kind: 'obj-transport-cart', tags: [],
        cellen: { '4,4': worked, '5,3': beam, '5,4': beam, '2,7': steel, '*': worked },
      },
      {
        naam: 'cheese', bronmodel: 'cheese', kind: 'obj-food-cheese', tags: [],
        cellen: { '1,3': fleshAmber, '*': fleshAmber },
      },
      {
        naam: 'cherries', bronmodel: 'cherry', kind: 'obj-food-fruit', tags: [],
        cellen: { '0,2': fleshRed, '6,1': leafDark, '5,4': bark, '*': fleshRed },
      },
      {
        naam: 'corn', bronmodel: 'corn', kind: 'obj-food-vegetable', tags: [],
        cellen: { '0,4': fleshAmber, '5,1': leafGreen, '*': fleshAmber },
      },
      {
        naam: 'egg', bronmodel: 'egg', kind: 'obj-food', tags: [],
        cellen: { '4,7': fleshIvory, '*': fleshIvory },
      },
      {
        naam: 'eggplant', bronmodel: 'eggplant', kind: 'obj-food-vegetable', tags: [],
        cellen: { '0,0': fleshDark, '3,3': fleshDark, '5,1': leafGreen, '*': fleshDark },
      },
      {
        naam: 'fence-post', bronmodel: 'fence_', kind: 'str-barrier-post', tags: [],
        cellen: { '5,4': beam, '*': beam },
      },
      {
        naam: 'fence-post-clean', bronmodel: 'fenceclean', kind: 'str-barrier-post', tags: [],
        cellen: { '5,4': beam, '*': beam },
      },
      {
        naam: 'fence-rail', bronmodel: 'fencemiddle', kind: 'str-barrier-fence', tags: [],
        cellen: { '5,4': beam, '*': beam },
      },
      {
        naam: 'fence-rail-clean', bronmodel: 'fencemiddleclean',
        kind: 'str-barrier-fence', tags: [],
        cellen: { '5,4': beam, '*': beam },
      },
      {
        naam: 'fence-rail-mirror', bronmodel: 'fencemiddlemirror',
        kind: 'str-barrier-fence', tags: [],
        cellen: { '5,4': beam, '*': beam },
      },
      {
        naam: 'fish', bronmodel: 'fish', kind: 'env-fauna', tags: [],
        cellen: { '3,7': hide, '4,0': boneIvory, '*': hide },
      },
      {
        naam: 'fish-tan', bronmodel: 'fish_001', kind: 'env-fauna', tags: [],
        cellen: { '5,7': hidePale, '4,0': boneIvory, '*': hidePale },
      },
      {
        naam: 'fish-umber', bronmodel: 'fish_002', kind: 'env-fauna', tags: [],
        cellen: { '1,2': hideDark, '4,0': boneIvory, '*': hideDark },
      },
      {
        naam: 'fish-carcass', bronmodel: 'fishalmostdead', kind: 'env-remains-bones', tags: [],
        cellen: { '3,7': hide, '4,3': boneIvory, '4,0': boneIvory, '*': boneIvory },
      },
      {
        naam: 'fish-carcass-tan', bronmodel: 'fishalmostdead_001',
        kind: 'env-remains-bones', tags: [],
        cellen: { '5,7': hidePale, '4,3': boneIvory, '4,0': boneIvory, '*': boneIvory },
      },
      {
        naam: 'fish-carcass-umber', bronmodel: 'fishalmostdead_002',
        kind: 'env-remains-bones', tags: [],
        cellen: { '1,2': hideDark, '4,3': boneIvory, '4,0': boneIvory, '*': boneIvory },
      },
      {
        naam: 'fish-bones', bronmodel: 'fishdead', kind: 'env-remains-bones', tags: [],
        cellen: { '5,3': boneIvory, '4,3': boneIvory, '*': boneIvory },
      },
      {
        naam: 'fishing-rod', bronmodel: 'fishingrod', kind: 'obj-tool-long', tags: [],
        cellen: { '0,4': beam, '2,7': steel, '3,7': steel, '3,1': grip, '*': beam },
      },
      {
        naam: 'fishing-rod-hunter', bronmodel: 'fishingrod_001', kind: 'obj-tool-long', tags: [],
        cellen: { '0,4': beam, '2,7': steel, '3,7': steel, '6,1': clothGreen, '*': beam },
      },
      {
        naam: 'daisy', bronmodel: 'flower', kind: 'env-flora-plant-flower', tags: [],
        cellen: { '1,1': petal, '1,3': pollen, '5,1': leafGreen, '*': petal },
      },
      {
        naam: 'daisy-head', bronmodel: 'flowerno', kind: 'env-flora-plant-flower', tags: [],
        cellen: { '1,1': petal, '1,3': pollen, '*': petal },
      },
      {
        naam: 'daisies', bronmodel: 'flowerstack',
        kind: 'env-flora-plant-flower', tags: ['plural'],
        cellen: { '1,1': petal, '1,3': pollen, '5,1': leafGreen, '*': petal },
      },
      {
        naam: 'grapes', bronmodel: 'grape', kind: 'obj-food-fruit', tags: [],
        cellen: { '0,0': fleshGreen, '5,1': leafDark, '*': fleshGreen },
      },
      {
        naam: 'grapes-sienna', bronmodel: 'grapered', kind: 'obj-food-fruit', tags: [],
        cellen: { '0,2': fleshRed, '5,1': leafDark, '*': fleshRed },
      },
      {
        naam: 'haystack-cube', bronmodel: 'haystackcube', kind: 'obj-food-grain', tags: [],
        cellen: { '0,4': straw, '0,5': straw, '*': straw },
      },
      {
        naam: 'haystack-round', bronmodel: 'haystackround', kind: 'obj-food-grain', tags: [],
        cellen: { '0,4': straw, '*': straw },
      },
      {
        naam: 'haystack-thick', bronmodel: 'haystackthick', kind: 'obj-food-grain', tags: [],
        cellen: { '0,4': straw, '0,5': straw, '*': straw },
      },
      {
        naam: 'haystack-thin', bronmodel: 'haystackthin', kind: 'obj-food-grain', tags: [],
        cellen: { '0,4': straw, '0,5': straw, '*': straw },
      },
      {
        naam: 'leaf', bronmodel: 'leaf', kind: 'env-flora-plant', tags: [],
        cellen: { '5,1': leafGreen, '*': leafGreen },
      },
      {
        naam: 'mailbox', bronmodel: 'mailbox', kind: 'str-marker', tags: [],
        cellen: {
          '2,7': cast, '3,7': cast, '4,0': cast, '5,3': beam, '5,4': beam, '0,2': paint,
          '*': cast,
        },
      },
      {
        naam: 'mango', bronmodel: 'mango', kind: 'obj-food-fruit', tags: [],
        cellen: { '2,3': fleshAmber, '*': fleshAmber },
      },
      {
        naam: 'pond', bronmodel: 'pond', kind: 'assy', tags: [],
        cellen: { '1,6': water, '4,0': rock, '5,4': planks, '2,7': steel, '1,1': plaster,
          '*': water },
      },
      {
        naam: 'pond-scene', bronmodel: 'pondscene', kind: 'assy', tags: [],
        cellen: {
          '1,6': water, '4,0': rock, '5,7': hidePale, '5,4': planks, '2,7': steel,
          '0,4': beam, '3,7': steel, '3,1': grip, '1,1': plaster, '*': water,
        },
      },
      { naam: 'rock-a', bronmodel: 'rocks', kind: 'env-rock-cobble', tags: [] },
      { naam: 'rock-b', bronmodel: 'rocks_001', kind: 'env-rock-cobble', tags: [] },
      { naam: 'rock-c', bronmodel: 'rocks_002', kind: 'env-rock-cobble', tags: [] },
      { naam: 'rock-d', bronmodel: 'rocks_003', kind: 'env-rock-cobble', tags: [] },
      { naam: 'rock-e', bronmodel: 'rocks_004', kind: 'env-rock-cobble', tags: [] },
      { naam: 'rock-f', bronmodel: 'rocks_005', kind: 'env-rock-cobble', tags: [] },
      { naam: 'rock-g', bronmodel: 'rocks_006', kind: 'env-rock-cobble', tags: [] },
      { naam: 'rock-h', bronmodel: 'rocks_007', kind: 'env-rock-cobble', tags: [] },
      {
        naam: 'shark', bronmodel: 'shark', kind: 'env-fauna', tags: [],
        cellen: { '1,1': hide, '4,0': boneIvory, '3,6': boneIvory, '*': hide },
      },
      {
        naam: 'smelter', bronmodel: 'smelter_lvl1', kind: 'str-building-fort-smithy', tags: [],
        cellen: {
          '3,7': masonryDark, '2,7': cast, '3,6': cast, '2,3': molten, '1,3': molten,
          '*': masonryDark,
        },
      },
      {
        naam: 'smelter-medium', bronmodel: 'smelter_lvl2',
        kind: 'str-building-fort-smithy', tags: [],
        cellen: { '3,7': masonryDark, '2,7': cast, '2,3': molten, '1,3': molten,
          '*': masonryDark },
      },
      {
        naam: 'smelter-large', bronmodel: 'smelter_lv3',
        kind: 'str-building-fort-smithy', tags: [],
        cellen: {
          '3,7': masonryDark, '2,7': cast, '5,4': beam, '5,0': masonry,
          '2,3': molten, '1,3': molten, '*': masonryDark,
        },
      },
      {
        naam: 'soil', bronmodel: 'soil', kind: 'env-terrain-ground', tags: [],
        cellen: { '0,5': soilBed, '*': soilBed },
      },
      {
        naam: 'sword', bronmodel: 'sword', kind: 'obj-weapon-melee-sword', tags: [],
        cellen: { '2,7': steel, '0,2': clothRed, '5,4': beam, '*': steel },
      },
      {
        naam: 'sword-taupe', bronmodel: 'sword_001', kind: 'obj-weapon-melee-sword', tags: [],
        cellen: { '2,7': steel, '3,1': grip, '5,4': beam, '*': steel },
      },
      {
        naam: 'tomato', bronmodel: 'tomato', kind: 'obj-food-vegetable', tags: [],
        cellen: { '3,2': fleshRed, '7,1': leafGreen, '*': fleshRed },
      },
      {
        naam: 'trowel', bronmodel: 'tool', kind: 'obj-tool-hand', tags: [],
        cellen: { '2,7': steel, '5,4': planks, '*': steel },
      },
      {
        naam: 'knife', bronmodel: 'tool_001', kind: 'obj-tool-hand', tags: [],
        cellen: { '2,7': steel, '5,4': planks, '*': steel },
      },
      {
        naam: 'saw', bronmodel: 'tool_002', kind: 'obj-tool-hand-saw', tags: [],
        cellen: { '2,7': steel, '5,4': planks, '*': steel },
      },
      {
        naam: 'pickaxe', bronmodel: 'tool_003', kind: 'obj-tool-long-pickaxe', tags: [],
        cellen: { '2,7': steel, '5,4': beam, '2,2': grip, '*': steel },
      },
      {
        naam: 'pickaxe-curved', bronmodel: 'tool_004', kind: 'obj-tool-long-pickaxe', tags: [],
        cellen: { '2,7': steel, '5,4': beam, '2,2': grip, '*': steel },
      },
      {
        naam: 'axe', bronmodel: 'tool_005', kind: 'obj-weapon-melee-axe-single', tags: [],
        cellen: { '2,7': steel, '5,4': beam, '2,2': grip, '*': steel },
      },
      {
        naam: 'windmill-small', bronmodel: 'towerlvl1',
        kind: 'str-building-mill-windmill', tags: [],
        cellen: { '5,4': beam, '5,0': masonry, '5,3': planks, '*': beam },
      },
      {
        naam: 'windmill', bronmodel: 'towerlv2', kind: 'str-building-mill-windmill', tags: [],
        cellen: { '5,4': beam, '5,0': masonry, '5,3': planks, '0,7': cast, '0,6': cast,
          '*': beam },
      },
      {
        naam: 'windmill-large', bronmodel: 'towerlv3',
        kind: 'str-building-mill-windmill', tags: [],
        cellen: {
          '0,2': paint, '5,4': beam, '5,0': masonry, '5,3': planks,
          '0,7': cast, '0,6': cast, '4,0': masonry, '*': beam,
        },
      },
      {
        naam: 'puddle', bronmodel: 'waterdrop', kind: 'env-water', tags: [],
        cellen: { '1,6': water, '*': water },
      },
      {
        naam: 'droplets', bronmodel: 'waterdrop_001', kind: 'env-water', tags: ['plural'],
        cellen: { '1,6': water, '*': water },
      },
      {
        naam: 'droplets-wide', bronmodel: 'waterdrop_002', kind: 'env-water', tags: ['plural'],
        cellen: { '1,6': water, '*': water },
      },
      {
        naam: 'watering-can', bronmodel: 'wateringcan_001', kind: 'obj-container-pot', tags: [],
        cellen: { '1,1': steel, '1,2': enamel, '*': steel },
      },
      {
        naam: 'watering-can-slate', bronmodel: 'wateringcan_003',
        kind: 'obj-container-pot', tags: [],
        cellen: { '5,1': cast, '1,2': enamel, '*': cast },
      },
      {
        naam: 'watering-can-basalt', bronmodel: 'wateringcan_005',
        kind: 'obj-container-pot', tags: [],
        cellen: { '3,7': wrought, '1,2': enamel, '*': wrought },
      },
      {
        naam: 'watering-can-flower', bronmodel: 'wateringcanwflower',
        kind: 'obj-container-pot', tags: [],
        cellen: { '1,1': steel, '1,2': enamel, '5,1': leafGreen, '1,3': pollen, '*': steel },
      },
      {
        naam: 'watering-can-flower-slate', bronmodel: 'wateringcanwflower_001',
        kind: 'obj-container-pot', tags: [],
        cellen: { '5,1': cast, '1,1': plaster, '1,2': enamel, '1,3': pollen, '*': cast },
      },
      {
        naam: 'watering-can-flower-basalt', bronmodel: 'wateringcanwflower_002',
        kind: 'obj-container-pot', tags: [],
        cellen: {
          '3,7': wrought, '5,1': leafGreen, '1,1': plaster, '1,2': enamel, '1,3': pollen,
          '*': wrought,
        },
      },
      {
        naam: 'wheat', bronmodel: 'wheat', kind: 'obj-food-grain', tags: [],
        cellen: { '0,4': straw, '*': straw },
      },
      {
        naam: 'crate', bronmodel: 'woodenbox', kind: 'obj-container-crate', tags: [],
        cellen: { '5,4': planks, '2,7': steel, '*': planks },
      },
      {
        naam: 'crate-open', bronmodel: 'woodenbox_001', kind: 'obj-container-crate', tags: [],
        cellen: { '5,4': planks, '2,7': steel, '4,4': worked, '*': planks },
      },
      {
        naam: 'crate-open-slate', bronmodel: 'woodenboxvar',
        kind: 'obj-container-crate', tags: [],
        cellen: { '3,7': cast, '2,7': cast, '4,4': worked, '*': cast },
      },
      {
        naam: 'mixer', bronmodel: 'woodenmixer', kind: 'assy', tags: [],
        cellen: {
          '4,4': worked, '5,4': beam, '2,7': steel, '0,7': steel, '0,6': steel,
          '3,7': cast, '5,1': leafGreen, '*': worked,
        },
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
  pakket.schaal = scaleTarget(pakket.kit);
  if (pakket.schaal === null) throw new Error(`${pakket.kit}: no factor in scale-factors.mjs`);
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
