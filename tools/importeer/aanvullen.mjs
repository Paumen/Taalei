import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeGlb } from '../../catalog/tools/glb.mjs';
import { readPng } from '../../catalog/tools/png.mjs';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

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
  glass: [3, 2],
  azure: [4, 2],
  ivory: [5, 2],
  basalt: [13, 3],
  taupe: [14, 3],
  nickel: [15, 3],
};

const KOLOMMEN = 16;
const RIJEN = 4;
const CEL_BREEDTE = 32;
const CEL_HOOGTE = 128;
const SPREIDING = [0.12, 0.88];
const UITSLAG = 0.35;
const RAND = 0.03;
const GLAD = Math.cos((60 * Math.PI) / 180);

const plank = ['wood-planks', 'tan'];
const balk = ['wood-beam', 'chestnut'];
const hout = ['wood-worked', 'camel'];
const schors = ['wood-bark', 'chestnut'];
const staal = ['metal-iron-steel', 'nickel'];
const smeedijzer = ['metal-iron-wrought', 'basalt'];
const goud = ['metal-gold', 'amber'];
const leer = ['leather', 'umber'];
const greep = ['leather', 'taupe', 0.21];
const touw = ['rope', 'taupe'];
const been = ['bone', 'ivory'];
const steenBlauw = ['gemstone', 'azure'];
const steenRood = ['gemstone', 'sienna'];
const gietijzer = ['metal-iron-cast', 'slate'];
const aardewerk = ['ceramic', 'ivory'];
const lak = ['ceramic', 'basalt'];
const papier = ['paper', 'ivory'];
const inkt = ['paper', 'azure'];
const ruit = ['glass', 'glass'];
const doek = ['textile', 'ivory'];
const doekRood = ['textile', 'sienna'];
const blad = ['foliage', 'moss'];
const loof = ['foliage', 'hunter'];
const bouillon = ['liquid', 'sienna'];

const deeg = ['food', 'tan'];
const korst = ['food', 'camel'];
const chocola = ['food', 'chestnut'];
const gebraden = ['food', 'terracotta'];
const geel = ['food', 'amber'];
const rood = ['food', 'sienna'];
const groen = ['food', 'moss'];
const donkergroen = ['food', 'hunter'];
const room = ['food', 'ivory'];
const paars = ['food', 'slate'];
const blauw = ['food', 'azure'];
const grijsbruin = ['food', 'taupe'];

const PAKKETTEN = [
  {
    kit: 'kay-food',
    bron: 'KayKit_Restaurant_Bits_1.0_FREE',
    schaal: 0.26,
    raster: [8, 4],
    modellen: [
      {
        naam: 'crate-lid', bronmodel: 'crate_lid', kind: 'obj-container-crate',
        tags: ['use:container'], cellen: { '6,0': hout },
      },
      {
        naam: 'cutting-board', bronmodel: 'cuttingboard', kind: 'obj-kitchenware-cookware',
        tags: ['use:tool'], cellen: { '5,1': hout },
      },
      {
        naam: 'bowl-dirty', bronmodel: 'bowl_dirty', kind: 'obj-kitchenware-tableware-plate',
        tags: ['ngons', 'use:food'], cellen: { '4,0': aardewerk, '7,1': grijsbruin },
      },
      {
        naam: 'food-ingredient-cheese-chopped', bronmodel: 'food_ingredient_cheese_chopped',
        kind: 'obj-food', tags: ['use:food'], cellen: { '2,2': geel },
      },
      {
        naam: 'food-ingredient-carrot-pieces', bronmodel: 'food_ingredient_carrot_pieces',
        kind: 'obj-food-vegetable', tags: ['use:food'], cellen: { '4,2': gebraden },
      },
      {
        naam: 'food-ingredient-lettuce-chopped', bronmodel: 'food_ingredient_lettuce_chopped',
        kind: 'obj-food-vegetable', tags: ['use:food'], cellen: { '0,2': blad },
      },
      {
        naam: 'food-ingredient-potato', bronmodel: 'food_ingredient_potato',
        kind: 'obj-food-vegetable', tags: ['use:food'], cellen: { '6,1': deeg },
      },
      {
        naam: 'food-ingredient-potato-chopped', bronmodel: 'food_ingredient_potato_chopped',
        kind: 'obj-food-vegetable', tags: ['use:food'], cellen: { '6,1': deeg },
      },
    ],
  },
  {
    kit: 'kay-tools',
    bron: 'KayKit_RPGToolsBits_1.0_FREE',
    schaal: 0.26,
    raster: [8, 4],
    modellen: [
      {
        naam: 'map', bronmodel: 'map', kind: 'obj-pocketitem-scroll',
        tags: ['pirate', 'sailing'], cellen: { '0,3': inkt, '*': papier },
      },
    ],
  },
  {
    kit: 'isa-kitchen',
    bron: 'Tiny_Treats_Charming_Kitchen_1.1_FREE',
    schaal: 0.24,
    raster: [8, 4],
    modellen: [
      {
        naam: 'wall-shelf-hooks', bronmodel: 'wall_shelf_kitchen_hooks', kind: 'obj-furniture-storage',
        tags: [], cellen: { '5,0': plank, '3,0': ['wood-planks', 'ivory'], '0,2': smeedijzer },
      },
    ],
  },
  {
    kit: 'ken-holiday',
    bron: 'kenney_holidaykit',
    schaal: 0.65,
    raster: [16, 4],
    modellen: [
      {
        naam: 'sled', bronmodel: 'sled', kind: 'obj-transport-cart',
        tags: ['use:transport'],
        cellen: { '3,2': hout, '5,2': ['wood-planks', 'chestnut'], '11,3': staal },
      },
      {
        naam: 'sled-long', bronmodel: 'sled-long', kind: 'obj-transport-cart',
        tags: ['use:transport'],
        cellen: { '3,2': hout, '5,2': ['wood-planks', 'chestnut'], '11,3': staal },
      },
      {
        naam: 'lights-colored', bronmodel: 'lights-colored', kind: 'obj-lighting',
        tags: ['use:decor', 'use:light'],
        cellen: { '13,3': smeedijzer, '7,3': ['glass', 'sienna'], '11,2': ['glass', 'hunter'] },
      },
      {
        naam: 'gingerbread-man', bronmodel: 'gingerbread-man', kind: 'obj-food-grain',
        tags: ['decorated', 'use:food'],
        cellen: { '3,2': korst, '5,2': chocola, '1,2': room },
      },
      {
        naam: 'gingerbread-woman', bronmodel: 'gingerbread-woman', kind: 'obj-food-grain',
        tags: ['decorated', 'use:food'],
        cellen: { '3,2': korst, '5,2': chocola, '1,2': room },
      },
      {
        naam: 'cabin-roof-dormer', bronmodel: 'cabin-roof-dormer', kind: 'str-part-roof',
        tags: [],
        cellen: { '11,2': ['wood-planks', 'hunter'], '3,2': hout, '5,2': balk, '1,2': ruit },
      },
      {
        naam: 'cabin-fence', bronmodel: 'cabin-fence', kind: 'str-barrier-fence',
        tags: [], cellen: { '3,2': hout },
      },
    ],
  },
  {
    kit: 'quat-ships',
    bron: 'Ships_Pack_by_Quaternius_OBJ',
    schaal: 1.25,
    modellen: [
      {
        naam: 'viking-boat', bronmodel: 'Viking boat', kind: 'obj-transport-boat',
        tags: ['pirate', 'sailing', 'use:transport'],
        kleuren: {
          '#a0724e': hout,
          '#c0926c': plank,
          '#b27f57': balk,
          '#d15a50': doekRood,
          '#cbd1ba': doek,
        },
      },
    ],
  },
  {
    kit: 'quat-rpg',
    bron: 'Ultimate_RPG_Pack_by_Quaternius_OBJ',
    schaal: 0.15,
    modellen: [
      { naam: 'armor-horned', bronmodel: 'Armor_Black', kind: 'obj-equipment-armor',
        tags: ['use:wearable'], kleuren: { '#1f1f1f': staal, '#552d28': been } },
      { naam: 'armor-horned-golden', bronmodel: 'Armor_Golden', kind: 'obj-equipment-armor',
        tags: ['use:wearable'], kleuren: { '#a58e3d': goud } },
      { naam: 'armor-leather', bronmodel: 'Armor_Leather', kind: 'obj-equipment-armor',
        tags: ['use:wearable'], kleuren: { '#5d4539': leer } },
      { naam: 'armor-metal', bronmodel: 'Armor_Metal', kind: 'obj-equipment-armor',
        tags: ['use:wearable'], kleuren: { '#7f7f75': staal } },
      { naam: 'armor-metal-2', bronmodel: 'Armor_Metal2', kind: 'obj-equipment-armor',
        tags: ['use:wearable'], kleuren: { '#919092': staal } },
      { naam: 'arrow', bronmodel: 'Arrow', kind: 'obj-weapon-ranged-accessory',
        tags: ['use:weapon'],
        kleuren: { '#5d6476': staal, '#919092': staal, '#63474a': hout, '#552d28': doek } },
      { naam: 'arrow-golden', bronmodel: 'Arrow_Golden', kind: 'obj-weapon-ranged-accessory',
        tags: ['use:weapon'], kleuren: { '#a58e3d': goud, '#63474a': hout } },
      { naam: 'axe-double', bronmodel: 'Axe_Double', kind: 'obj-weapon-melee-axe',
        tags: ['use:weapon'],
        kleuren: { '#5d6476': staal, '#919092': staal, '#63474a': hout, '#402d39': greep } },
      { naam: 'axe-small', bronmodel: 'Axe_small', kind: 'obj-weapon-melee-axe',
        tags: ['use:weapon'],
        kleuren: { '#5d6476': staal, '#919092': staal, '#63474a': hout, '#402d39': greep } },
      { naam: 'bow-golden', bronmodel: 'Bow_Golden', kind: 'obj-weapon-ranged-bow',
        tags: ['use:weapon', 'robin-hood'],
        kleuren: { '#a58e3d': goud, '#63474a': hout, '#d1d1d1': touw } },
      { naam: 'bow-wooden', bronmodel: 'Bow_Wooden', kind: 'obj-weapon-ranged-bow',
        tags: ['use:weapon', 'robin-hood'],
        kleuren: { '#402d39': balk, '#63474a': hout, '#d1d1d1': touw } },
      { naam: 'chalice', bronmodel: 'Chalice', kind: 'obj-kitchenware-tableware',
        tags: ['ngons'], kleuren: { '#b9a54f': goud } },
      { naam: 'chest-closed', bronmodel: 'Chest_Closed', kind: 'obj-container-chest',
        tags: ['use:container'],
        kleuren: { '#705147': hout, '#3f394e': smeedijzer, '#464255': smeedijzer } },
      { naam: 'chest-ingots', bronmodel: 'Chest_Ingots', kind: 'obj-container-chest',
        tags: ['use:container'],
        kleuren: { '#705147': hout, '#3f394e': smeedijzer, '#464255': smeedijzer, '#b9a54f': goud } },
      { naam: 'chest-open', bronmodel: 'Chest_Open', kind: 'obj-container-chest',
        tags: ['use:container'],
        kleuren: { '#705147': hout, '#3f394e': smeedijzer, '#464255': smeedijzer } },
      { naam: 'crown', bronmodel: 'Crown', kind: 'obj-equipment',
        tags: ['use:wearable'], kleuren: { '#b9a54f': goud } },
      { naam: 'dagger', bronmodel: 'Dagger', kind: 'obj-weapon-melee-dagger',
        tags: ['use:weapon'],
        kleuren: { '#5d6476': staal, '#919092': staal, '#7f7f75': staal, '#63474a': hout, '#402d39': greep } },
      { naam: 'dart', bronmodel: 'Dart', kind: 'obj-weapon-ranged-accessory',
        tags: ['use:weapon'],
        kleuren: { '#5d6476': staal, '#919092': staal, '#63474a': hout, '#552d28': doek } },
      { naam: 'fish-bone', bronmodel: 'FishBone', kind: 'env-remains-bones',
        tags: [], kleuren: { '#8f8672': been } },
      { naam: 'glove', bronmodel: 'Glove', kind: 'obj-equipment-clothing',
        tags: ['use:wearable'], kleuren: { '#5d4539': leer } },
      { naam: 'hammer-double', bronmodel: 'Hammer_Double', kind: 'obj-weapon-melee-hammer',
        tags: ['use:weapon'],
        kleuren: { '#5d6476': staal, '#919092': staal, '#63474a': hout, '#402d39': greep } },
      { naam: 'heart', bronmodel: 'Heart', kind: 'obj',
        tags: [], kleuren: { '#d1493c': steenRood } },
      { naam: 'pouch', bronmodel: 'Pouch', kind: 'obj-container-bag',
        tags: ['use:container', 'ngons'], kleuren: { '#5d4539': leer, '#ffffff': touw } },
      { naam: 'ring-1', bronmodel: 'Ring1', kind: 'obj-pocketitem-jewellery',
        tags: ['ngons'], kleuren: { '#a58e3d': goud } },
      { naam: 'ring-2', bronmodel: 'Ring2', kind: 'obj-pocketitem-jewellery',
        tags: ['ngons'], kleuren: { '#a58e3d': goud } },
      { naam: 'ring-7', bronmodel: 'Ring7', kind: 'obj-pocketitem-jewellery',
        tags: ['ngons'], kleuren: { '#134c55': steenBlauw, '#0f3e46': steenBlauw } },
      { naam: 'star', bronmodel: 'Star', kind: 'obj',
        tags: [], kleuren: { '#b9a54f': goud } },
      { naam: 'sword', bronmodel: 'Sword', kind: 'obj-weapon-melee-sword',
        tags: ['use:weapon'],
        kleuren: { '#5d6476': staal, '#919092': staal, '#7f7f75': staal, '#63474a': hout, '#402d39': greep } },
      { naam: 'sword-big', bronmodel: 'Sword_big', kind: 'obj-weapon-melee-sword',
        tags: ['use:weapon'],
        kleuren: { '#5d6476': staal, '#919092': staal, '#7f7f75': staal, '#63474a': hout, '#402d39': greep } },
    ],
  },
  {
    kit: 'quat-food',
    bron: 'Ultimate_Food_Pack_by_Quaternius_OBJ',
    schaal: 0.1,
    modellen: [
      { naam: 'waffle', bronmodel: 'Waffle', kind: 'obj-food-grain', tags: ['use:food'],
        kleuren: { '#a38b67': korst } },
      { naam: 'tentacle', bronmodel: 'Tentacle', kind: 'obj-food', tags: ['use:food'],
        kleuren: { '#ab6688': gebraden, '#89548d': rood } },
      { naam: 'tomato-slice', bronmodel: 'Tomato_Slice', kind: 'obj-food-vegetable',
        tags: ['ngons', 'plural', 'use:food'], kleuren: { '#a34a3b': rood } },
      { naam: 'sushi-roll-1', bronmodel: 'Sushi_Roll1', kind: 'obj-kitchenware-tableware-plate',
        tags: ['ngons', 'use:food'],
        kleuren: { '#2d2d2d': lak, '#a36436': gebraden, '#a3a3a3': room } },
      { naam: 'sushi-roll-2', bronmodel: 'Sushi_Roll2', kind: 'obj-kitchenware-tableware-plate',
        tags: ['ngons', 'use:food'],
        kleuren: { '#2d2d2d': lak, '#a36436': gebraden, '#5d9142': groen, '#a3a3a3': room } },
      { naam: 'sushi-nigiri-1', bronmodel: 'Sushi_Nigiri1', kind: 'obj-food',
        tags: ['use:food'], kleuren: { '#a3a3a3': room, '#a36436': gebraden } },
      { naam: 'sashimi-salmon', bronmodel: 'Sashimi_Salmon', kind: 'obj-food',
        tags: ['use:food'], kleuren: { '#a36436': gebraden, '#a3a3a3': room } },
      { naam: 'soy-sauce', bronmodel: 'SoySauce', kind: 'obj-kitchenware-tableware-plate',
        tags: ['ngons', 'use:food'], kleuren: { '#a3a3a3': aardewerk, '#1b1b1b': bouillon } },
      { naam: 'pepper-green', bronmodel: 'Pepper_Green', kind: 'obj-food-vegetable',
        tags: ['use:food'], kleuren: { '#607945': donkergroen, '#779161': blad } },
      { naam: 'pepper-red', bronmodel: 'Pepper_Red', kind: 'obj-food-vegetable',
        tags: ['use:food'], kleuren: { '#5c2921': rood, '#779161': blad } },
      { naam: 'peanut-butter', bronmodel: 'PeanutButter', kind: 'obj-container-pot',
        tags: ['ngons', 'use:container'],
        kleuren: { '#655236': smeedijzer, '#a38b67': deeg, '#713f37': ['ceramic', 'sienna'] } },
      { naam: 'popsicle-multiple', bronmodel: 'Popsicle_Multiple', kind: 'obj-food',
        tags: ['use:food'],
        kleuren: { '#ab6688': gebraden, '#89548d': rood, '#937f63': hout, '#a3a3a3': room } },
      { naam: 'popsicle-chocolate', bronmodel: 'Popsicle_Chocolate', kind: 'obj-food',
        tags: ['use:food'], kleuren: { '#634336': chocola, '#937f63': hout } },
      { naam: 'mushroom', bronmodel: 'Mushroom', kind: 'env-fungi', tags: ['ngons'],
        kleuren: { '#867669': grijsbruin } },
      { naam: 'mushroom-sliced', bronmodel: 'Mushroom_Sliced', kind: 'env-fungi',
        tags: [], kleuren: { '#867669': grijsbruin, '#8f8672': room } },
      { naam: 'lettuce-whole', bronmodel: 'Lettuce_Whole', kind: 'obj-food-vegetable',
        tags: ['use:food'], kleuren: { '#779161': blad } },
      { naam: 'ice-cream-1', bronmodel: 'IceCream_1', kind: 'obj-food',
        tags: ['decorated', 'use:food'],
        kleuren: { '#a38b67': deeg, '#779161': groen, '#5d9142': donkergroen } },
      { naam: 'ice-cream-2', bronmodel: 'IceCream_2', kind: 'obj-food',
        tags: ['decorated', 'use:food'],
        kleuren: { '#a3a3a3': room, '#a38b67': deeg, '#89548d': rood, '#ab6688': gebraden } },
      { naam: 'ice-cream-3', bronmodel: 'IceCream_3', kind: 'obj-food',
        tags: ['decorated', 'use:food'],
        kleuren: { '#a38b67': deeg, '#a3a3a3': room, '#a34a3b': rood } },
      { naam: 'ice-cream-4', bronmodel: 'IceCream_4', kind: 'obj-food',
        tags: ['decorated', 'use:food'],
        kleuren: { '#a38b67': deeg, '#a3a3a3': room, '#a36436': gebraden } },
      { naam: 'hotdog', bronmodel: 'Hotdog', kind: 'obj-food-meat',
        tags: ['decorated', 'use:food'],
        kleuren: { '#a38b67': deeg, '#aeac3c': geel, '#a34a3b': rood, '#ac887d': grijsbruin } },
      { naam: 'egg-whole-white', bronmodel: 'Egg_Whole_White', kind: 'obj-food',
        tags: ['ngons', 'use:food'], kleuren: { '#a3a3a3': room } },
      { naam: 'eggplant', bronmodel: 'Eggplant', kind: 'obj-food-vegetable',
        tags: ['use:food'], kleuren: { '#2b3e29': loof, '#3c3570': paars } },
      { naam: 'egg-fried', bronmodel: 'Egg_Fried', kind: 'obj-food',
        tags: ['use:food'], kleuren: { '#a3a3a3': room, '#ae9044': geel } },
      { naam: 'donut-1', bronmodel: 'Donut1', kind: 'obj-food-grain',
        tags: ['decorated', 'ngons', 'use:food'],
        kleuren: { '#a38b67': deeg, '#ab6688': gebraden, '#a34a3b': rood, '#3f5e8f': blauw, '#607945': groen } },
      { naam: 'donut-2', bronmodel: 'Donut2', kind: 'obj-food-grain',
        tags: ['decorated', 'ngons', 'use:food'],
        kleuren: { '#a36436': gebraden, '#a38b67': deeg, '#ae9044': geel } },
      { naam: 'donut-3', bronmodel: 'Donut3', kind: 'obj-food-grain',
        tags: ['ngons', 'use:food'], kleuren: { '#a38b67': deeg } },
      { naam: 'donut-4', bronmodel: 'Donut4', kind: 'obj-food-grain',
        tags: ['decorated', 'ngons', 'use:food'],
        kleuren: { '#a3a3a3': room, '#a38b67': deeg, '#634336': chocola } },
      { naam: 'cupcake', bronmodel: 'Cupcake', kind: 'obj-food-grain',
        tags: ['decorated', 'ngons', 'use:food'],
        kleuren: { '#ce71a6': gebraden, '#a38b67': deeg, '#634336': chocola } },
      { naam: 'croissant', bronmodel: 'Croissant', kind: 'obj-food-grain',
        tags: ['use:food'], kleuren: { '#a38b67': deeg } },
      { naam: 'cooking-pot-soup', bronmodel: 'CookingPot_Soup', kind: 'obj-kitchenware-cookware-pot',
        tags: ['ngons', 'use:food'], kleuren: { '#4f4f4f': gietijzer, '#655236': bouillon } },
      { naam: 'cooking-pot-2-soup', bronmodel: 'CookingPot2_Soup', kind: 'obj-kitchenware-cookware-pot',
        tags: ['ngons', 'use:food'], kleuren: { '#4f4f4f': gietijzer, '#655236': bouillon } },
      { naam: 'chopsticks', bronmodel: 'Chopsticks', kind: 'obj-kitchenware-tableware-cutlery',
        tags: ['plural', 'use:food'], kleuren: { '#634336': hout } },
      { naam: 'chocolate-bar', bronmodel: 'ChocolateBar', kind: 'obj-food',
        tags: ['use:food'], kleuren: { '#634336': chocola } },
      { naam: 'broccoli', bronmodel: 'Broccoli', kind: 'obj-food-vegetable',
        tags: ['use:food'], kleuren: { '#2b3e29': loof, '#5d9142': groen } },
      { naam: 'banana', bronmodel: 'Banana', kind: 'obj-food',
        tags: ['use:food'], kleuren: { '#ae9044': geel } },
      { naam: 'bacon-cooked', bronmodel: 'Bacon_Cooked', kind: 'obj-food-meat',
        tags: ['use:food'],
        kleuren: { '#937f63': deeg, '#6b3e38': rood, '#76514e': rood, '#864d46': gebraden } },
      { naam: 'apple', bronmodel: 'Apple', kind: 'obj-food',
        tags: ['ngons', 'use:food'],
        kleuren: { '#5c2921': rood, '#634336': schors, '#2b3e29': loof } },
      { naam: 'avocado', bronmodel: 'Avocado', kind: 'obj-food',
        tags: ['use:food'],
        kleuren: { '#2d2d2d': loof, '#867669': grijsbruin, '#779161': groen } },
    ],
  },
];

const hexVan = (kleur) => '#' + kleur.map((k) => k.toString(16).padStart(2, '0')).join('');

const helderheid = (hex) => {
  const kanaal = (i) => {
    const s = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanaal(0) + 0.7152 * kanaal(1) + 0.0722 * kanaal(2);
};

const kleurenkaart = readPng(join(ROOT, 'kits', 'colormap.png'));

function bandLicht(band, deel) {
  const [kolom, rij] = BANDEN[band];
  const breedte = kleurenkaart.width / KOLOMMEN;
  const hoogte = kleurenkaart.height / RIJEN;
  const x = Math.floor(kolom * breedte + breedte / 2);
  const y = Math.min(Math.floor((rij + deel) * hoogte), kleurenkaart.height - 1);
  const i = (y * kleurenkaart.width + x) * 4;
  return helderheid(
    '#' + [0, 1, 2].map((k) => kleurenkaart.pixels[i + k].toString(16).padStart(2, '0')).join(''),
  );
}

function bandPlekken(pakket) {
  const plek = new Map();
  for (const opgave of pakket.modellen) {
    for (const [hex, [, band, vast]] of Object.entries(opgave.kleuren ?? {})) {
      const sleutel = `${band}:${hex}`;
      if (plek.has(sleutel)) continue;
      if (vast !== undefined) { plek.set(sleutel, vast); continue; }

      const gezocht = helderheid(hex);
      let beste = SPREIDING[0];
      let verschil = Infinity;
      for (let stap = 0; stap <= 100; stap++) {
        const deel = SPREIDING[0] + (stap / 100) * (SPREIDING[1] - SPREIDING[0]);
        const afstand = Math.abs(bandLicht(band, deel) - gezocht);
        if (afstand < verschil) {
          verschil = afstand;
          beste = deel;
        }
      }
      plek.set(sleutel, beste);
    }
  }
  return plek;
}

const celUv = (band, fractieU, fractieV) => {
  const [kolom, rij] = BANDEN[band];
  return [
    Math.fround((kolom + 0.5 + (fractieU - 0.5) * ((CEL_BREEDTE - 1) / CEL_BREEDTE)) / KOLOMMEN),
    Math.fround((rij + 0.5 + (fractieV - 0.5) * ((CEL_HOOGTE - 1) / CEL_HOOGTE)) / RIJEN)];
};

function celVan(primitief, driehoek, raster) {
  let u = 0;
  let v = 0;
  for (let k = 0; k < 3; k++) {
    const i = primitief.indices[driehoek * 3 + k];
    u += primitief.uvs[i * 2] / 3;
    v += primitief.uvs[i * 2 + 1] / 3;
  }
  const kolom = Math.min(Math.max(Math.floor(u * raster[0]), 0), raster[0] - 1);
  const rij = Math.min(Math.max(Math.floor(v * raster[1]), 0), raster[1] - 1);
  return `${kolom},${rij}`;
}

function omvang(primitieven, schaal) {
  const laag = [Infinity, Infinity, Infinity];
  const hoog = [-Infinity, -Infinity, -Infinity];
  for (const primitief of primitieven) {
    for (let i = 0; i < primitief.posities.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = primitief.posities[i + k] * schaal;
        if (v < laag[k]) laag[k] = v;
        if (v > hoog[k]) hoog[k] = v;
      }
    }
  }
  return { laag, hoog };
}

function gladdeNormalen(driehoeken) {
  const perPunt = new Map();
  driehoeken.forEach((driehoek, f) => {
    for (const punt of driehoek.punten) {
      const sleutel = punt.map((v) => Math.round(v * 1e5)).join(',');
      const lijst = perPunt.get(sleutel);
      if (lijst) lijst.push(f);
      else perPunt.set(sleutel, [f]);
    }
  });

  for (const driehoek of driehoeken) {
    driehoek.normalen = driehoek.punten.map((punt) => {
      const sleutel = punt.map((v) => Math.round(v * 1e5)).join(',');
      const som = [0, 0, 0];
      for (const f of perPunt.get(sleutel)) {
        const buur = driehoeken[f].vlak;
        const hoek = buur.reduce((t, w, k) => t + w * driehoek.vlak[k], 0);
        if (hoek < GLAD) continue;
        for (let k = 0; k < 3; k++) som[k] += buur[k] * driehoeken[f].oppervlak;
      }
      const lengte = Math.hypot(...som);
      return lengte > 1e-12 ? som.map((v) => v / lengte) : driehoek.vlak.slice();
    });
  }
}

function bouw(primitieven, opgave, pakket, plek) {
  const { laag, hoog } = omvang(primitieven, pakket.schaal);
  const midden = [(laag[0] + hoog[0]) / 2, laag[1], (laag[2] + hoog[2]) / 2];
  const banden = new Set();

  const driehoeken = [];
  for (const primitief of primitieven) {
    const hex = primitief.materiaal.kleur ? hexVan(primitief.materiaal.kleur) : null;
    for (let t = 0; t < primitief.indices.length / 3; t++) {
      const punten = [];
      const bronUv = [];
      for (let k = 0; k < 3; k++) {
        const i = primitief.indices[t * 3 + k];
        punten.push([0, 1, 2].map((a) => primitief.posities[i * 3 + a] * pakket.schaal - midden[a]));
        bronUv.push(primitief.uvs ? [primitief.uvs[i * 2], primitief.uvs[i * 2 + 1]] : [0.5, 0.5]);
      }

      const u = [0, 1, 2].map((k) => punten[1][k] - punten[0][k]);
      const v = [0, 1, 2].map((k) => punten[2][k] - punten[0][k]);
      const kruis = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0]];
      const lengte = Math.hypot(...kruis);
      const vlak = lengte > 1e-12 ? kruis.map((w) => w / lengte) : [0, 1, 0];

      let doel;
      let uvs;
      if (pakket.raster) {
        const cel = celVan(primitief, t, pakket.raster);
        doel = opgave.cellen[cel] ?? opgave.cellen['*'];
        if (!doel) throw new Error(`${opgave.naam}: no band for source cell ${cel}`);
        uvs = bronUv.map(([bu, bv]) =>
          celUv(
            doel[1],
            bu * pakket.raster[0] - Math.floor(bu * pakket.raster[0]),
            bv * pakket.raster[1] - Math.floor(bv * pakket.raster[1]),
          ));
      } else {
        doel = opgave.kleuren[hex];
        if (!doel) throw new Error(`${opgave.naam}: no band for ${hex}`);
        uvs = null;
      }
      banden.add(doel[1]);

      driehoeken.push({
        punten,
        vlak,
        oppervlak: lengte / 2,
        normalen: [primitief.normalen ? null : vlak, null, null],
        bron: primitief,
        index: t,
        band: doel[1],
        hex,
        uvs,
      });
    }
  }

  if (pakket.raster) {
    for (const driehoek of driehoeken) {
      driehoek.normalen = [0, 1, 2].map((k) => {
        const i = driehoek.bron.indices[driehoek.index * 3 + k];
        if (!driehoek.bron.normalen) return driehoek.vlak.slice();
        return [0, 1, 2].map((a) => driehoek.bron.normalen[i * 3 + a]);
      });
    }
  } else {
    gladdeNormalen(driehoeken);
    for (const driehoek of driehoeken) {
      const hoogte = plek.get(`${driehoek.band}:${driehoek.hex}`);
      const uitslag = Math.min(UITSLAG, hoogte - RAND, 1 - RAND - hoogte);
      driehoek.uvs = driehoek.normalen.map((normaal) =>
        celUv(driehoek.band, 0.5, hoogte - uitslag * normaal[1]));
    }
  }

  const perSleutel = new Map();
  const posities = [];
  const normalen = [];
  const uvs = [];
  const index = [];
  let gedraaid = 0;

  for (const driehoek of driehoeken) {
    const hoek = [0, 1, 2].map((k) => {
      const p = driehoek.punten[k].map((v) => Math.fround(v));
      const n = driehoek.normalen[k].map((v) => Math.fround(v));
      const t = driehoek.uvs[k];
      const sleutel = [...p, ...n, ...t].join(',');
      let bestaand = perSleutel.get(sleutel);
      if (bestaand === undefined) {
        bestaand = posities.length / 3;
        perSleutel.set(sleutel, bestaand);
        posities.push(...p);
        normalen.push(...n);
        uvs.push(...t);
      }
      return bestaand;
    });

    const gemiddeld = [0, 1, 2].map((k) => hoek.reduce((som, h) => som + normalen[h * 3 + k], 0));
    const richting = driehoek.vlak.reduce((som, w, k) => som + w * gemiddeld[k], 0);
    if (richting < 0) {
      gedraaid++;
      index.push(hoek[0], hoek[2], hoek[1]);
    } else {
      index.push(...hoek);
    }
  }

  return {
    posities: Float32Array.from(posities),
    normalen: Float32Array.from(normalen),
    uvs: Float32Array.from(uvs),
    driehoeken: index,
    banden,
    gedraaid,
  };
}

function schrijf(pad, mesh, opgave, pakket) {
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
      generator: 'tools/importeer/aanvullen.mjs',
      version: '2.0',
      extras: {
        taaleiland: {
          versie: 1,
          schaal: pakket.schaal,
          palet: 1,
          bron: pakket.naam,
          bronmodel: opgave.bronmodel,
          ...(pakket.raster ? {} : { schaduw: { modus: 'glad', drempel: 60 } }),
        },
      },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: opgave.naam }],
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

  for (const [id, tags] of regels) {
    for (const tagId of tags) {
      const tag = perId.get(tagId);
      if (!tag) throw new Error(`${id}: tag ${tagId} is not in tags.json`);
      if (!tag.models) tag.models = [];
      if (!tag.models.includes(id)) tag.models.push(id);
    }
  }

  writeFileSync(pad, JSON.stringify(data, null, 1) + '\n');
}

function zetManifest(perKit) {
  const pad = join(ROOT, 'catalog', 'manifest.js');
  let tekst = readFileSync(pad, 'utf8');

  for (const [kit, namen] of perKit) {
    const merk = `"slug": "${kit}"`;
    const begin = tekst.indexOf(merk);
    if (begin === -1) throw new Error(`${kit}: not in catalog/manifest.js`);
    const lijstBegin = tekst.indexOf('"models": [', begin);
    const lijstEind = tekst.indexOf(']', lijstBegin);
    if (lijstBegin === -1 || lijstEind === -1) throw new Error(`${kit}: no model list in manifest.js`);

    const huidig = JSON.parse(tekst.slice(tekst.indexOf('[', lijstBegin), lijstEind + 1));
    const samen = [...new Set([...huidig, ...namen])].sort();
    const blok = samen.map((naam) => `\n   ${JSON.stringify(naam)}`).join(',') + '\n  ';
    tekst = `${tekst.slice(0, tekst.indexOf('[', lijstBegin) + 1)}${blok}${tekst.slice(lijstEind)}`;
  }

  writeFileSync(pad, tekst);
}

const regels = [];
const perKit = new Map();

for (const pakket of PAKKETTEN) {
  const bronkit = BRONKITS.find((b) => b.map === pakket.bron);
  if (!bronkit) throw new Error(`${pakket.bron}: not in BRONKITS`);
  pakket.naam = bronkit.naam;

  const { modellen } = bronModellen(bronkit);
  const perNaam = new Map(modellen.map((model) => [model.naam, model]));
  const plek = pakket.raster ? null : bandPlekken(pakket);

  const doelMap = join(ROOT, 'kits', 'workfiles', pakket.kit);
  mkdirSync(join(doelMap, 'Textures'), { recursive: true });
  copyFileSync(join(ROOT, 'kits', 'colormap.png'), join(doelMap, 'Textures', 'colormap.png'));

  console.log(`\n${pakket.kit}  (${bronkit.naam})`);
  for (const opgave of pakket.modellen) {
    const model = perNaam.get(opgave.bronmodel);
    if (!model) throw new Error(`${opgave.bronmodel}: not in ${pakket.bron}`);

    const mesh = bouw(model.primitieven, opgave, pakket, plek);
    schrijf(join(doelMap, `${opgave.naam}.glb`), mesh, opgave, pakket);

    const materialen = [...new Set(
      Object.values(opgave.cellen ?? opgave.kleuren).map(([materiaal]) => materiaal),
    )];
    regels.push([`${pakket.kit}/${opgave.naam}`, [opgave.kind, ...materialen, ...opgave.tags]]);
    perKit.set(pakket.kit, [...(perKit.get(pakket.kit) ?? []), opgave.naam]);

    console.log(
      `  ${opgave.bronmodel.padEnd(32)} → ${opgave.naam.padEnd(30)} ` +
        `${String(mesh.driehoeken.length / 3).padStart(5)} tris, ` +
        `${materialen.length} material(s), ${mesh.banden.size} band(s): ${[...mesh.banden].join(', ')}` +
        `${mesh.gedraaid ? `, ${mesh.gedraaid} flipped` : ''}`,
    );
  }
}

zetTags(regels);
zetManifest(perKit);
console.log(`\n${regels.length} models added to kits/workfiles`);
