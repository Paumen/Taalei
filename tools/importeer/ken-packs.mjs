import { join } from 'node:path';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';
import {
  bouw, schrijf, bandPlekken, kitMap, zetTags, zetManifest, richtSchillen, richtWinding,
} from './bouwer.mjs';

const planks = ['wood-planks', 'tan'];
const worked = ['wood-worked', 'camel'];
const beam = ['wood-beam', 'chestnut'];

const masonry = ['stone-masonry', 'taupe'];
const masonryPale = ['stone-masonry', 'nickel'];
const rock = ['stone-rock', 'nickel'];
const soil = ['stone-soil', 'taupe'];
const cast = ['metal-iron-cast', 'slate'];
const steel = ['metal-iron-steel', 'nickel'];

const canvas = ['textile', 'ivory'];
const blanket = ['textile', 'hunter'];
const sheet = ['textile', 'ivory'];

const leaf = ['foliage', 'moss'];
const stalk = ['vegetation', 'hunter'];
const cob = ['vegetation', 'amber'];
const root = ['food', 'terracotta'];
const turnip = ['food', 'ivory'];

const bridgeWood = { '#f2be9e': planks, '#ffc5a7': beam, '#ddf2f5': masonryPale, '#ccdbde': masonry, '*': planks };
const bridgeStone = { '#ddf2f5': masonryPale, '#ccdbde': masonry, '#f2be9e': planks, '#ffc5a7': beam, '*': masonry };
const fenceWood = { '#ffc5a7': planks, '#e3af94': beam, '#ddf2f5': cast, '#ffffff': planks, '*': planks };
const pathStone = { '#ccdbde': rock, '#ddf2f5': rock, '#ffffff': rock, '*': rock };
const pathWood = { '#dbab8e': planks, '#f2be9e': planks, '#ffffff': planks, '*': planks };
const cropRow = { '#dbab8e': soil, '#f2be9e': soil, '*': soil };
const tent = { '#f19398': canvas, '#e27f84': canvas, '#ffc5a7': beam, '#ffffff': canvas, '*': canvas };

const bridge = (naam, bronmodel, kleuren) => ({
  naam, bronmodel, kind: 'str-access-bridge', tags: [], kleuren,
});
const fence = (naam, bronmodel) => ({
  naam, bronmodel, kind: 'str-barrier-fence', tags: [], kleuren: fenceWood,
});
const path = (naam, bronmodel, kleuren) => ({
  naam, bronmodel, kind: 'env-terrain-ground', tags: [], kleuren,
});

const PAKKETTEN = [
  {
    kit: 'ken-nature', bron: 'kenney_nature-kit', schaal: 0.75,
    modellen: [
      {
        naam: 'bed', bronmodel: 'bed', kind: 'obj-furniture-bed', tags: [],
        kleuren: { '#ffc5a7': beam, '#fff9f0': sheet, '#72d3d5': blanket, '*': sheet },
      },
      {
        naam: 'bed-floor', bronmodel: 'bed_floor', kind: 'obj-furniture-bed', tags: [],
        kleuren: { '#fff9f0': sheet, '#72d3d5': blanket, '#ffffff': sheet, '*': sheet },
      },

      bridge('bridge-wood', 'bridge_wood', bridgeWood),
      bridge('bridge-wood-narrow', 'bridge_woodNarrow', bridgeWood),
      bridge('bridge-wood-round', 'bridge_woodRound', bridgeWood),
      bridge('bridge-wood-round-narrow', 'bridge_woodRoundNarrow', bridgeWood),
      bridge('bridge-wood-center', 'bridge_center_wood', bridgeWood),
      bridge('bridge-wood-center-round', 'bridge_center_woodRound', bridgeWood),
      bridge('bridge-wood-side', 'bridge_side_wood', bridgeWood),
      bridge('bridge-wood-side-round', 'bridge_side_woodRound', bridgeWood),
      bridge('bridge-stone', 'bridge_stone', bridgeStone),
      bridge('bridge-stone-narrow', 'bridge_stoneNarrow', bridgeStone),
      bridge('bridge-stone-round', 'bridge_stoneRound', bridgeStone),
      bridge('bridge-stone-round-narrow', 'bridge_stoneRoundNarrow', bridgeStone),
      bridge('bridge-stone-center', 'bridge_center_stone', bridgeStone),
      bridge('bridge-stone-center-round', 'bridge_center_stoneRound', bridgeStone),
      bridge('bridge-stone-side', 'bridge_side_stone', bridgeStone),
      bridge('bridge-stone-side-round', 'bridge_side_stoneRound', bridgeStone),

      {
        naam: 'canoe', bronmodel: 'canoe', kind: 'obj-transport-boat', tags: ['sailing'],
        kleuren: { '#ffc5a7': worked, '#ffc78a': beam, '*': worked },
      },
      {
        naam: 'carrot', bronmodel: 'crop_carrot', kind: 'obj-food-vegetable', tags: [],
        kleuren: { '#ffc78a': root, '#73eddd': leaf, '*': root },
      },
      {
        naam: 'turnip', bronmodel: 'crop_turnip', kind: 'obj-food-vegetable', tags: [],
        kleuren: { '#fff9f0': turnip, '#73eddd': leaf, '*': turnip },
      },
      {
        naam: 'bamboo-short', bronmodel: 'crops_bambooStageA', kind: 'env-flora-plant',
        tags: ['plural'], kleuren: { '#73eddd': stalk, '*': stalk },
      },
      {
        naam: 'bamboo-tall', bronmodel: 'crops_bambooStageB', kind: 'env-flora-plant',
        tags: ['plural'], kleuren: { '#73eddd': stalk, '*': stalk },
      },
      {
        naam: 'corn', bronmodel: 'crops_cornStageD', kind: 'env-flora-plant', tags: [],
        kleuren: { '#73eddd': stalk, '#fbdfa8': cob, '*': stalk },
      },

      path('crop-row', 'crops_dirtDoubleRow', cropRow),
      path('crop-row-corner', 'crops_dirtDoubleRowCorner', cropRow),
      path('crop-row-end', 'crops_dirtDoubleRowEnd', cropRow),

      fence('fence-bend', 'fence_bend'),
      fence('fence-bend-center', 'fence_bendCenter'),
      fence('fence-corner', 'fence_corner'),
      fence('fence-gate', 'fence_gate'),
      fence('fence-planks', 'fence_planks'),
      fence('fence-planks-double', 'fence_planksDouble'),
      fence('fence-simple', 'fence_simple'),
      fence('fence-simple-center', 'fence_simpleCenter'),
      fence('fence-simple-diagonal', 'fence_simpleDiagonal'),
      fence('fence-simple-diagonal-center', 'fence_simpleDiagonalCenter'),
      fence('fence-simple-high', 'fence_simpleHigh'),
      fence('fence-simple-low', 'fence_simpleLow'),

      path('path-stone', 'path_stone', pathStone),
      path('path-stone-circle', 'path_stoneCircle', pathStone),
      path('path-stone-corner', 'path_stoneCorner', pathStone),
      path('path-stone-end', 'path_stoneEnd', pathStone),
      path('path-wood', 'path_wood', pathWood),
      path('path-wood-corner', 'path_woodCorner', pathWood),
      path('path-wood-end', 'path_woodEnd', pathWood),
      path('patch-sand', 'platform_beach', { '#fbedde': soil, '*': soil }),

      {
        naam: 'sign', bronmodel: 'sign', kind: 'str-marker-sign', tags: [],
        kleuren: { '#ffc5a7': planks, '#e3af94': beam, '#ffffff': planks, '*': planks },
      },

      { naam: 'tent-large-closed', bronmodel: 'tent_detailedClosed', kind: 'str-stands', tags: [], kleuren: tent },
      { naam: 'tent-large-open', bronmodel: 'tent_detailedOpen', kind: 'str-stands', tags: [], kleuren: tent },
      { naam: 'tent-small-closed', bronmodel: 'tent_smallClosed', kind: 'str-stands', tags: [], kleuren: tent },
      { naam: 'tent-small-open', bronmodel: 'tent_smallOpen', kind: 'str-stands', tags: [], kleuren: tent },
    ],
  },
  {
    kit: 'ken-water', bron: 'kenney_watercraft-pack_1', schaal: 0.3, raster: [16, 4],
    modellen: [
      {
        naam: 'buoy', bronmodel: 'buoy', kind: 'str-marker', tags: ['sailing'],
        cellen: { '11,2': cast, '9,3': steel, '*': cast },
      },
      {
        naam: 'buoy-flag', bronmodel: 'buoy-flag', kind: 'str-marker', tags: ['sailing'],
        cellen: { '11,2': cast, '9,3': steel, '*': cast },
      },
      {
        naam: 'ramp', bronmodel: 'ramp', kind: 'str-access-stairs', tags: ['sailing'],
        cellen: { '13,3': planks, '*': planks },
      },
      {
        naam: 'ramp-wide', bronmodel: 'ramp-wide', kind: 'str-access-stairs', tags: ['sailing'],
        cellen: { '13,3': planks, '*': planks },
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
  pakket.generator = 'tools/importeer/ken-packs.mjs';

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
