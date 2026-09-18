import { join } from 'node:path';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';
import { bouw, schrijf, bandPlekken, kitMap, zetTags, zetManifest } from './bouwer.mjs';

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
const doek = ['textile', 'ivory'];
const doekRood = ['textile', 'sienna'];
const blad = ['foliage', 'moss'];
const loof = ['foliage', 'hunter'];
const bouillon = ['liquid', 'sienna'];

const stam = ['wood-log', 'tan'];
const bast = ['wood-bark', 'umber'];
const koren = ['vegetation', 'tan'];
const visLijf = ['food', 'nickel'];
const visRug = ['food', 'azure'];

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
    kit: 'quat-pirate',
    bron: 'Pirate_Kit_by_Quaternius_glTF_OBJ',
    schaal: 0.35,
    atlas: true,
    modellen: [
      {
        naam: 'dock-pole', bronmodel: 'Environment_Dock_Pole', kind: 'str-barrier-post',
        tags: ['pirate', 'sailing'],
        kleuren: { '#a89a6a': touw, '#57412c': balk, '#a79163': balk },
      },
      {
        naam: 'bucket', bronmodel: 'Prop_Bucket', kind: 'obj-container-bucket',
        tags: ['ngons', 'pirate', 'sailing'],
        kleuren: { '#57412c': hout, '#857b80': smeedijzer },
      },
      {
        naam: 'bucket-fishes', bronmodel: 'Prop_Bucket_Fishes', kind: 'obj-container-bucket',
        tags: ['ngons', 'plural', 'pirate', 'sailing'],
        kleuren: {
          '#57412c': hout, '#857b80': smeedijzer,
          '#7f93af': visLijf, '#9eacbb': visLijf, '#4d8fca': visRug,
        },
      },
      {
        naam: 'chicken-leg', bronmodel: 'UI_ChickenLeg', kind: 'obj-food-meat',
        tags: ['pirate'],
        kleuren: { '#885e38': rood, '#8b1e1f': rood, '#9e957f': room },
      },
      {
        naam: 'papers', bronmodel: 'UI_Paper', kind: 'obj-pocketitem-scroll',
        tags: ['plural', 'pirate'], kleuren: { '#ce9b76': papier },
      },
      {
        naam: 'red-x', bronmodel: 'UI_Red_X', kind: 'obj',
        tags: ['pirate'], kleuren: { '#8b1e1f': steenRood },
      },
      {
        naam: 'swords', bronmodel: 'UI_Swords', kind: 'obj-weapon-melee-sword',
        tags: ['plural', 'pirate'],
        kleuren: { '#857b80': staal, '#a79da4': staal, '#e6a945': goud, '#885e38': greep },
      },
      {
        naam: 'wheat', bronmodel: 'UI_Wheat', kind: 'obj-food-grain',
        tags: ['plural'], kleuren: { '#b2a15e': koren },
      },
      {
        naam: 'logs', bronmodel: 'UI_Wood', kind: 'obj-resource-wood-log',
        tags: ['plural', 'ngons'], kleuren: { '#57412c': bast, '#907245': stam },
      },
      {
        naam: 'axe', bronmodel: 'Weapon_Axe', kind: 'obj-weapon-melee-axe',
        tags: ['pirate'],
        kleuren: { '#3a3739': staal, '#857b80': staal, '#57412c': hout, '#9e957f': greep },
      },
      {
        naam: 'axe-rifle', bronmodel: 'Weapon_AxeRifle', kind: 'obj-weapon-ranged',
        tags: ['pirate'],
        kleuren: { '#57412c': hout, '#857b80': staal, '#3a3739': staal },
      },
      {
        naam: 'cutlass', bronmodel: 'Weapon_Cutlass', kind: 'obj-weapon-melee-sword',
        tags: ['pirate'],
        kleuren: { '#885e38': greep, '#e6a945': goud, '#857b80': staal, '#a79da4': staal },
      },
      {
        naam: 'dagger', bronmodel: 'Weapon_Dagger', kind: 'obj-weapon-melee-dagger',
        tags: ['pirate'],
        kleuren: { '#3a3739': staal, '#857b80': staal, '#57412c': hout, '#9e957f': greep },
      },
      {
        naam: 'axe-double', bronmodel: 'Weapon_DoubleAxe', kind: 'obj-weapon-melee-axe',
        tags: ['pirate'],
        kleuren: { '#3a3739': staal, '#857b80': staal, '#57412c': hout, '#9e957f': greep },
      },
      {
        naam: 'shotgun-double', bronmodel: 'Weapon_DoubleShotgun', kind: 'obj-weapon-ranged',
        tags: ['pirate'],
        kleuren: {
          '#857b80': staal, '#ffffff': staal, '#e6a945': goud,
          '#57412c': hout, '#907245': hout,
        },
      },
      {
        naam: 'lute', bronmodel: 'Weapon_Lute', kind: 'obj-instrument',
        tags: ['pirate'],
        kleuren: { '#885e38': hout, '#5c4034': balk, '#3a3739': balk, '#9e957f': touw },
      },
      {
        naam: 'pistol', bronmodel: 'Weapon_Pistol', kind: 'obj-weapon-ranged',
        tags: ['pirate'],
        kleuren: { '#857b80': staal, '#e6a945': goud, '#57412c': hout },
      },
      {
        naam: 'rifle', bronmodel: 'Weapon_Rifle', kind: 'obj-weapon-ranged',
        tags: ['pirate'],
        kleuren: { '#857b80': staal, '#e6a945': goud, '#57412c': hout },
      },
      {
        naam: 'sword-1', bronmodel: 'Weapon_Sword_1', kind: 'obj-weapon-melee-sword',
        tags: ['pirate'],
        kleuren: { '#3a3739': staal, '#857b80': staal, '#57412c': hout },
      },
      {
        naam: 'sword-2', bronmodel: 'Weapon_Sword_2', kind: 'obj-weapon-melee-sword',
        tags: ['pirate'],
        kleuren: { '#3a3739': staal, '#857b80': staal, '#57412c': hout, '#e6a945': goud },
      },
    ],
  },
  {
    kit: 'quat-dun-2',
    bron: 'Updated_Modular_Dungeon_2019',
    schaal: 0.3,
    modellen: [
      {
        naam: 'skull', bronmodel: 'Skull', kind: 'env-remains-bones',
        tags: ['halloween', 'grave'], kleuren: { '#b9a68b': been },
      },
      {
        naam: 'coins', bronmodel: 'Coin_Pile', kind: 'obj-pocketitem-coin',
        tags: ['plural', 'ngons'], kleuren: { '#938054': goud },
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
  pakket.generator = 'tools/importeer/aanvullen.mjs';

  const { modellen } = bronModellen(bronkit);
  const perNaam = new Map(modellen.map((model) => [model.naam, model]));
  const plek = pakket.raster ? null : bandPlekken(pakket);

  const doelMap = kitMap(pakket.kit);

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
