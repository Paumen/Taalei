import { join } from 'node:path';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';
import {
  bouw, schrijf, bandPlekken, kitMap, zetTags, zetManifest, richtSchillen,
} from './bouwer.mjs';

const planks = ['wood-planks', 'tan'];
const worked = ['wood-worked', 'camel'];
const beam = ['wood-beam', 'chestnut'];
const bark = ['wood-bark', 'umber'];

const steel = ['metal-iron-steel', 'nickel'];
const masonry = ['stone-masonry', 'taupe'];
const rubble = ['stone-masonry', 'nickel'];
const galvanised = ['metal-iron-cast', 'slate'];
const tile = ['ceramic', 'sienna'];

const board = ['paper', 'ivory'];
const tape = ['textile', 'taupe'];
const sackcloth = ['textile', 'taupe'];
const upholstery = ['textile', 'sienna'];
const leaf = ['foliage', 'hunter'];

const farmShell = {
  '#d1d1d1': planks, '#8f433a': worked, '#7c3a32': beam, '#4f4f4f': tile,
};

const PAKKETTEN = [
  {
    kit: 'farm-buildings',
    bron: 'Farm_Buildings_Bundle',
    schaal: 0.3,
    modellen: [
      { naam: 'barn', bronmodel: 'Barn', kind: 'str-building', tags: [], kleuren: farmShell },
      { naam: 'barn-large', bronmodel: 'Big Barn', kind: 'str-building', tags: [], kleuren: farmShell },
      { naam: 'barn-small', bronmodel: 'Small Barn', kind: 'str-building', tags: [], kleuren: farmShell },
      {
        naam: 'barn-open', bronmodel: 'Open Barn', kind: 'str-building', tags: [],
        kleuren: { ...farmShell, '#824e36': beam },
      },
      {
        naam: 'chicken-coop', bronmodel: 'ChickenCoop', kind: 'str-building', tags: [],
        kleuren: { ...farmShell, '#824e36': beam },
      },
      {
        naam: 'picket-fence', bronmodel: 'Fence', kind: 'str-barrier-fence', tags: [],
        kleuren: { '#824e36': beam },
      },
      {
        naam: 'rail-fence', bronmodel: 'Fence-e02PFKKhbr', kind: 'str-barrier-fence', tags: [],
        kleuren: { '#824e36': beam },
      },
      {
        naam: 'silo', bronmodel: 'Silo', kind: 'str-building-tower', tags: ['ngons'],
        kleuren: {
          '#8f433a': worked, '#7c3a32': beam, '#824e36': beam,
          '#d1d1d1': rubble, '#a0a0a0': galvanised,
        },
      },
      {
        naam: 'silo-house', bronmodel: 'Silo House', kind: 'str-building-dwelling', tags: ['ngons'],
        kleuren: {
          '#8f433a': worked, '#d1d1d1': planks, '#7c3a32': beam, '#824e36': beam,
          '#a0a0a0': rubble, '#747474': tile, '#313032': beam,
        },
      },
      {
        naam: 'windmill', bronmodel: 'Tower Windmill', kind: 'str-building-tower', tags: ['ngons'],
        kleuren: {
          '#747474': masonry, '#a0a0a0': rubble, '#313032': rubble,
          '#4f4f4f': tile, '#9b805c': planks, '#d1d1d1': planks, '#6a573f': beam,
        },
      },
    ],
  },
  {
    kit: 'toon-shooter',
    bron: 'Toon_Shooter_Game_Kit',
    schaal: 0.32,
    modellen: [
      {
        naam: 'bear-trap', bronmodel: 'Bear Trap', kind: 'obj-tool', tags: [],
        kleuren: { '#818491': steel },
      },
      {
        naam: 'cardboard-box', bronmodel: 'Cardboard Boxes-rdKKO0DvMG', kind: 'obj-container', tags: [],
        kleuren: { '#9b7048': board, '#9b9581': tape },
      },
      {
        naam: 'cardboard-box-flat', bronmodel: 'Cardboard Boxes', kind: 'obj-container', tags: [],
        kleuren: { '#9b7048': board, '#9b9581': tape },
      },
      {
        naam: 'cardboard-boxes-a', bronmodel: 'Cardboard Boxes-V9KbWC8Vd6', kind: 'obj-container',
        tags: ['plural'], kleuren: { '#9b7048': board, '#9b9581': tape },
      },
      {
        naam: 'cardboard-boxes-b', bronmodel: 'Cardboard Boxes-zt2WLYypMl', kind: 'obj-container',
        tags: ['plural'], kleuren: { '#9b7048': board, '#9b9581': tape },
      },
      {
        naam: 'carbine', bronmodel: 'Short Cannon', kind: 'obj-weapon-ranged', tags: [],
        kleuren: { '#95703d': worked, '#414141': steel, '#818491': steel },
      },
      {
        naam: 'crate', bronmodel: 'Crate', kind: 'obj-container-crate', tags: [],
        kleuren: { '#95703d': worked, '#bd9451': planks },
      },
      {
        naam: 'key', bronmodel: 'Key', kind: 'obj-pocketitem-key', tags: ['pickup'],
        kleuren: { '#818491': steel },
      },
      {
        naam: 'knife-bowie', bronmodel: 'Knife', kind: 'obj-weapon-melee-dagger', tags: [],
        kleuren: { '#5f4b35': beam, '#95703d': worked, '#818491': steel, '#959595': steel },
      },
      {
        naam: 'knife-combat', bronmodel: 'Knife-NNzzvlGXzO', kind: 'obj-weapon-melee-dagger', tags: [],
        kleuren: { '#414141': steel, '#252525': steel, '#959595': steel },
      },
      {
        naam: 'pallet', bronmodel: 'Pallet', kind: 'obj-resource-wood-plank', tags: [],
        kleuren: { '#95703d': worked },
      },
      {
        naam: 'pallet-broken', bronmodel: 'Pallet Broken', kind: 'obj-resource-wood-plank',
        tags: ['broken'], kleuren: { '#95703d': worked, '#bd9451': planks },
      },
      {
        naam: 'planks', bronmodel: 'Wood Planks', kind: 'obj-resource-wood-plank', tags: ['plural'],
        kleuren: { '#95703d': worked, '#bd9451': planks },
      },
      {
        naam: 'revolver', bronmodel: 'Revolver', kind: 'obj-weapon-ranged', tags: [],
        kleuren: { '#95703d': worked, '#818491': steel, '#5f5f5f': steel, '#414141': steel },
      },
      {
        naam: 'revolver-short', bronmodel: 'Revolver Small', kind: 'obj-weapon-ranged', tags: [],
        kleuren: { '#95703d': worked, '#818491': steel, '#5f5f5f': steel, '#414141': steel },
      },
      {
        naam: 'sandbags', bronmodel: 'Sack Trench', kind: 'str-barrier', tags: ['plural'],
        kleuren: { '#90866b': sackcloth },
      },
      {
        naam: 'sandbags-small', bronmodel: 'Sack Trench Small', kind: 'str-barrier', tags: ['plural'],
        kleuren: { '#90866b': sackcloth },
      },
      {
        naam: 'shotgun', bronmodel: 'Shotgun', kind: 'obj-weapon-ranged', tags: [],
        kleuren: { '#95703d': worked, '#818491': steel, '#5f5f5f': steel, '#414141': steel },
      },
      {
        naam: 'sofa', bronmodel: 'Sofa', kind: 'obj-furniture-seating-bench', tags: [],
        kleuren: { '#8c3735': upholstery },
      },
      {
        naam: 'sofa-small', bronmodel: 'Sofa Small', kind: 'obj-furniture-seating-bench', tags: [],
        kleuren: { '#8c3735': upholstery },
      },
      {
        naam: 'tree-a', bronmodel: 'Tree-1BkD9JnKrE', kind: 'env-flora-tree', tags: [],
        kleuren: { '#6b7f26': leaf, '#5f4b35': bark },
      },
      {
        naam: 'tree-b', bronmodel: 'Tree-QeYQEpgPcC', kind: 'env-flora-tree', tags: [],
        kleuren: { '#6b7f26': leaf, '#5f4b35': bark },
      },
      {
        naam: 'tree-c', bronmodel: 'Tree-i4QMw4L64D', kind: 'env-flora-tree', tags: [],
        kleuren: { '#6b7f26': leaf, '#5f4b35': bark },
      },
      {
        naam: 'tree-d', bronmodel: 'Tree', kind: 'env-flora-tree', tags: [],
        kleuren: { '#6b7f26': leaf, '#5f4b35': bark },
      },
    ],
  },
  {
    kit: 'ultimate-guns',
    bron: 'Ultimate_Guns_Pack',
    schaal: 0.2,
    modellen: [
      {
        naam: 'revolver', bronmodel: 'Revolver', kind: 'obj-weapon-ranged', tags: [],
        kleuren: { '#414241': steel, '#555659': steel, '#5c4c42': worked },
      },
      {
        naam: 'revolver-ribbed', bronmodel: 'Revolver-9C26wSpMS0', kind: 'obj-weapon-ranged', tags: [],
        kleuren: { '#414241': steel, '#555659': steel, '#333435': steel, '#51443b': beam },
      },
      {
        naam: 'revolver-steel', bronmodel: 'Revolver-XrnLUz6kQj', kind: 'obj-weapon-ranged', tags: [],
        kleuren: { '#414241': steel, '#555659': steel, '#333435': steel },
      },
      {
        naam: 'shotgun', bronmodel: 'Shotgun', kind: 'obj-weapon-ranged', tags: [],
        kleuren: {
          '#414241': steel, '#373736': steel, '#28292a': steel,
          '#5c4c42': worked, '#51443b': beam,
        },
      },
      {
        naam: 'shotgun-pump', bronmodel: 'Shotgun-ZmPTnh7njL', kind: 'obj-weapon-ranged', tags: [],
        kleuren: { '#414241': steel, '#373736': steel, '#28292a': steel, '#5c4c42': worked },
      },
      {
        naam: 'shotgun-sawed-off', bronmodel: 'Shotgun Sawed Off', kind: 'obj-weapon-ranged', tags: [],
        kleuren: {
          '#414241': steel, '#373736': steel, '#28292a': steel,
          '#5c4c42': worked, '#51443b': beam,
        },
      },
      {
        naam: 'shotgun-pistol-grip', bronmodel: 'Shotgun Short Stock', kind: 'obj-weapon-ranged',
        tags: [],
        kleuren: { '#414241': steel, '#373736': steel, '#28292a': steel, '#5c4c42': worked },
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
  pakket.generator = 'tools/importeer/flat-packs.mjs';

  const { modellen } = bronModellen(bronkit);
  const perNaam = new Map(modellen.map((model) => [model.naam, model]));
  const plek = bandPlekken(pakket);
  const doelMap = kitMap(pakket.kit);

  console.log(`\n${pakket.kit}  (${bronkit.naam})  scale ${pakket.schaal}`);
  for (const opgave of pakket.modellen) {
    const model = perNaam.get(opgave.bronmodel);
    if (!model) throw new Error(`${opgave.bronmodel}: not in ${pakket.bron}`);
    const gekeerd = richtSchillen(model);

    const mesh = bouw(model.primitieven, opgave, pakket, plek);
    schrijf(join(doelMap, `${opgave.naam}.glb`), mesh, opgave, pakket);

    const materialen = [...mesh.materialen];
    regels.push([`${pakket.kit}/${opgave.naam}`, [opgave.kind, ...materialen, ...opgave.tags]]);
    perKit.set(pakket.kit, [...(perKit.get(pakket.kit) ?? []), opgave.naam]);

    console.log(
      `  ${opgave.bronmodel.padEnd(28)} → ${opgave.naam.padEnd(20)} `
        + `${String(mesh.driehoeken.length / 3).padStart(5)} tris, `
        + `${materialen.length} material(s), ${mesh.banden.size} band(s): ${[...mesh.banden].join(', ')}`
        + `${gekeerd ? `, ${gekeerd} turned out` : ''}`,
    );
  }
}

zetTags(regels);
zetManifest(perKit);
console.log(`\n${regels.length} models added to kits/workfiles`);
