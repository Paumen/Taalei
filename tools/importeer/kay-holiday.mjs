import { join } from 'node:path';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';
import { bouw, schrijf, kitMap, zetTags, zetManifest, richtSchillen } from './bouwer.mjs';
import { scaleTarget } from './scale-factors.mjs';

const gold = ['metal-gold', 'amber'];
const wrought = ['metal-iron-wrought', 'basalt'];
const glow = ['emissive', 'amber'];

const worked = ['wood-worked', 'camel'];
const beam = ['wood-beam', 'chestnut'];
const bark = ['wood-bark', 'umber'];

const cloth = ['textile', 'sienna'];
const earthenware = ['ceramic', 'terracotta'];
const glazed = ['ceramic', 'ivory'];

const dough = ['food', 'camel'];
const chocolate = ['food', 'chestnut'];
const icing = ['food', 'ivory'];
const candy = ['food', 'sienna'];
const snow = ['food', 'ivory'];
const carrot = ['food', 'terracotta'];
const coal = ['food', 'basalt'];
const milk = ['liquid', 'ivory'];

const PAKKET = {
  kit: 'kay-holiday',
  bron: 'KayKit_Holiday_Bits_1.0_FREE',
  raster: [8, 4],
  modellen: [
    {
      naam: 'bell', bronmodel: 'bell', kind: 'obj-instrument', tags: [],
      cellen: { '2,2': gold, '*': gold },
    },
    {
      naam: 'carpet-round-large', bronmodel: 'carpet_round_large', kind: 'obj-furniture', tags: [],
      cellen: { '2,2': cloth, '*': cloth },
    },
    {
      naam: 'carpet-round-small', bronmodel: 'carpet_round_small', kind: 'obj-furniture', tags: [],
      cellen: { '2,2': cloth, '*': cloth },
    },
    {
      naam: 'armchair', bronmodel: 'chair_large_red', kind: 'obj-furniture-seating-chair', tags: [],
      cellen: { '6,2': cloth, '6,1': beam, '*': cloth },
    },
    {
      naam: 'tree-stand', bronmodel: 'christmas_tree_base', kind: 'obj-container-pot', tags: [],
      cellen: { '6,2': earthenware, '*': earthenware },
    },
    {
      naam: 'cookie', bronmodel: 'cookie', kind: 'obj-food-grain', tags: [],
      cellen: { '5,0': dough, '6,0': chocolate, '*': dough },
    },
    {
      naam: 'footstool', bronmodel: 'footstool_red', kind: 'obj-furniture-seating-stool', tags: [],
      cellen: { '6,2': cloth, '6,1': beam, '*': cloth },
    },
    {
      naam: 'gingerbread-man', bronmodel: 'gingerbread_man', kind: 'obj-food-grain', tags: [],
      cellen: { '5,0': dough, '3,2': icing, '2,2': candy, '5,2': candy, '1,3': candy, '*': dough },
    },
    {
      naam: 'mug-cocoa', bronmodel: 'hot_chocolate',
      kind: 'obj-kitchenware-tableware-drinkware-mug', tags: [],
      cellen: { '2,2': earthenware, '6,1': chocolate, '3,2': icing, '*': earthenware },
    },
    {
      naam: 'street-lantern', bronmodel: 'lantern', kind: 'obj-lighting-lantern', tags: [],
      cellen: { '4,1': wrought, '2,2': glow, '*': wrought },
    },
    {
      naam: 'plate-ivory', bronmodel: 'plate_blue',
      kind: 'obj-kitchenware-tableware-plate', tags: [],
      cellen: { '4,3': glazed, '*': glazed },
    },
    {
      naam: 'plate-cookies', bronmodel: 'plate_decorated_B', kind: 'assy', tags: [],
      cellen: { '4,3': glazed, '5,0': dough, '6,0': chocolate, '5,3': milk, '*': glazed },
    },
    {
      naam: 'plate-terracotta', bronmodel: 'plate_red',
      kind: 'obj-kitchenware-tableware-plate', tags: [],
      cellen: { '7,3': earthenware, '*': earthenware },
    },
    {
      naam: 'plate-small-terracotta', bronmodel: 'plate_small_red',
      kind: 'obj-kitchenware-tableware-plate', tags: [],
      cellen: { '7,3': earthenware, '*': earthenware },
    },
    {
      naam: 'snowman', bronmodel: 'snowman_A', kind: 'obj-art', tags: [],
      cellen: { '4,3': snow, '1,1': carrot, '2,0': coal, '2,1': coal, '7,1': bark, '*': snow },
    },
    {
      naam: 'snowman-hat', bronmodel: 'snowman_B', kind: 'obj-art', tags: [],
      cellen: {
        '4,3': snow, '1,1': carrot, '2,0': coal, '2,1': coal, '7,1': bark,
        '2,2': cloth, '6,2': cloth, '*': snow,
      },
    },
    {
      naam: 'stool', bronmodel: 'stool', kind: 'obj-furniture-seating-stool', tags: [],
      cellen: { '5,1': worked, '7,1': beam, '*': worked },
    },
  ],
};

const bronkit = BRONKITS.find((b) => b.map === PAKKET.bron);
if (!bronkit) throw new Error(`${PAKKET.bron}: not in BRONKITS`);
PAKKET.naam = bronkit.naam;
PAKKET.schaal = scaleTarget(PAKKET.kit);
if (PAKKET.schaal === null) throw new Error(`${PAKKET.kit}: no factor in scale-factors.mjs`);
PAKKET.generator = 'tools/importeer/kay-holiday.mjs';

const { modellen } = bronModellen(bronkit);
const perNaam = new Map(modellen.map((model) => [model.naam, model]));
const doelMap = kitMap(PAKKET.kit);

const regels = [];
const perKit = new Map();

console.log(`\n${PAKKET.kit}  (${bronkit.naam})  scale ${PAKKET.schaal}`);
for (const opgave of PAKKET.modellen) {
  const model = perNaam.get(opgave.bronmodel);
  if (!model) throw new Error(`${opgave.bronmodel}: not in ${PAKKET.bron}`);
  const gekeerd = richtSchillen(model);

  const mesh = bouw(model.primitieven, opgave, PAKKET, null);
  schrijf(join(doelMap, `${opgave.naam}.glb`), mesh, opgave, PAKKET);

  const materialen = [...mesh.materialen];
  regels.push([`${PAKKET.kit}/${opgave.naam}`, [opgave.kind, ...materialen, ...opgave.tags]]);
  perKit.set(PAKKET.kit, [...(perKit.get(PAKKET.kit) ?? []), opgave.naam]);

  console.log(
    `  ${opgave.bronmodel.padEnd(24)} → ${opgave.naam.padEnd(24)} `
      + `${String(mesh.driehoeken.length / 3).padStart(5)} tris, `
      + `${materialen.length} material(s), ${mesh.banden.size} band(s): ${[...mesh.banden].join(', ')}`
      + `${gekeerd ? `, ${gekeerd} turned out` : ''}`,
  );
}

zetTags(regels);
zetManifest(perKit);
console.log(`\n${regels.length} models added to kits/workfiles`);
