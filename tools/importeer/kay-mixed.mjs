import { join } from 'node:path';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';
import { bouw, schrijf, kitMap, zetTags, zetManifest } from './bouwer.mjs';

const steel = ['metal-iron-steel', 'nickel'];
const wrought = ['metal-iron-wrought', 'basalt'];
const cast = ['metal-iron-cast', 'slate'];
const gold = ['metal-gold', 'amber'];
const paintYellow = ['metal', 'amber'];
const paintRed = ['metal', 'sienna'];
const paintGreen = ['metal', 'hunter'];

const woodWorked = ['wood-worked', 'camel'];
const woodBeam = ['wood-beam', 'chestnut'];

const cloth = ['textile', 'ivory'];
const clothRed = ['textile', 'sienna'];
const clothGreen = ['textile', 'hunter'];
const clothBrown = ['textile', 'taupe'];

const leather = ['leather', 'umber'];
const leatherLight = ['leather', 'camel'];
const paper = ['paper', 'ivory'];
const porcelain = ['ceramic', 'ivory'];
const glazeRed = ['ceramic', 'sienna'];

const gemRed = ['gemstone', 'sienna'];
const gemGreen = ['gemstone', 'hunter'];
const gemBlue = ['gemstone', 'azure'];

const leaf = ['foliage', 'moss'];
const petal = ['foliage', 'azure'];
const pollen = ['vegetation', 'ivory'];

const crust = ['food', 'camel'];
const roast = ['food', 'terracotta'];
const cheese = ['food', 'amber'];
const tomato = ['food', 'sienna'];
const lettuce = ['vegetation', 'moss'];

const chain = { '6,1': wrought, '*': wrought };
const umbrella = (canopy, cell) => ({
  [cell]: canopy, '4,2': woodWorked, '6,1': steel, '5,2': woodWorked, '*': cloth,
});
const puzzleCube = {
  '4,0': wrought, '6,1': wrought,
  '1,3': gemRed, '1,1': gemRed, '3,3': gemGreen, '0,3': gemBlue,
  '2,3': paintYellow, '1,0': paintYellow, '*': wrought,
};
const rollerskate = { '6,1': leather, '6,3': woodWorked, '2,3': steel, '*': leather };
const idol = { '2,1': gold, '4,2': woodBeam, '*': gold };

const PAKKET = {
  kit: 'kay-mixed',
  bron: 'KayKit_Mixed_Bag_1_FREE',
  schaal: 0.3,
  raster: [8, 4],
  generator: 'tools/importeer/kay-mixed.mjs',
  modellen: [
    { naam: 'chain-anchor', bronmodel: 'chain_anchor', kind: 'obj-tool-supplies', tags: ['ngons'], cellen: chain },
    { naam: 'chain-hanging-a', bronmodel: 'chain_hanging_A', kind: 'obj-tool-supplies', tags: ['ngons'], cellen: chain },
    { naam: 'chain-hanging-b', bronmodel: 'chain_hanging_B', kind: 'obj-tool-supplies', tags: ['ngons'], cellen: chain },
    { naam: 'chain-link', bronmodel: 'chainlink', kind: 'obj-tool-supplies', tags: ['ngons'], cellen: chain },
    { naam: 'chain-links', bronmodel: 'chainlinks', kind: 'obj-tool-supplies', tags: ['ngons', 'plural'], cellen: chain },
    { naam: 'shackle', bronmodel: 'chain_shackle', kind: 'obj-tool-supplies', tags: ['ngons'], cellen: chain },

    {
      naam: 'plushie-chicken-a', bronmodel: 'chicken_plushie_A', kind: 'obj', tags: [],
      cellen: { '5,2': cloth, '1,0': cloth, '1,3': clothRed, '2,3': clothRed, '0,0': wrought, '*': cloth },
    },
    {
      naam: 'plushie-chicken-b', bronmodel: 'chicken_plushie_B', kind: 'obj', tags: [],
      cellen: {
        '6,0': clothBrown, '4,2': clothBrown, '1,3': clothRed, '2,3': clothRed,
        '1,0': cloth, '0,0': wrought, '*': clothBrown,
      },
    },

    {
      naam: 'circus-tent', bronmodel: 'circus_tent', kind: 'str-stands', tags: ['ngons'],
      cellen: {
        '1,3': clothRed, '2,2': clothRed, '1,0': cloth, '5,2': cloth,
        '7,0': woodWorked, '6,0': woodBeam, '4,0': cast, '*': cloth,
      },
    },

    {
      naam: 'comic-book', bronmodel: 'comicbook_A', kind: 'obj-pocketitem-book', tags: [],
      cellen: { '2,3': clothRed, '1,0': paper, '*': paper },
    },
    {
      naam: 'comic-book-blank', bronmodel: 'comicbox_open_B', kind: 'obj-pocketitem-book', tags: [],
      cellen: { '2,2': clothGreen, '4,1': clothRed, '3,2': clothBrown, '1,0': paper, '*': paper },
    },
    {
      naam: 'comic-books-stacked', bronmodel: 'comicbooks_stacked', kind: 'obj-pocketitem-book', tags: ['plural'],
      cellen: { '1,0': paper, '2,3': clothRed, '2,2': clothGreen, '6,3': clothBrown, '*': paper },
    },
    {
      naam: 'comic-box-closed', bronmodel: 'comicbox_closed', kind: 'obj-container-crate', tags: [],
      cellen: { '5,2': woodWorked, '7,2': woodBeam, '*': woodWorked },
    },
    {
      naam: 'comic-box-open', bronmodel: 'comicbox_open', kind: 'obj-container-crate', tags: [],
      cellen: { '5,2': woodWorked, '*': woodWorked },
    },
    {
      naam: 'comic-box-filled', bronmodel: 'comicbox_filled', kind: 'obj-container-crate', tags: [],
      cellen: {
        '5,2': woodWorked, '1,0': paper, '2,3': clothRed, '4,1': clothRed,
        '0,3': clothGreen, '6,3': clothBrown, '5,1': clothBrown, '*': woodWorked,
      },
    },

    {
      naam: 'fire-hydrant', bronmodel: 'fire_hydrant', kind: 'str', tags: ['ngons'],
      cellen: { '1,3': paintRed, '2,0': cast, '*': paintRed },
    },

    {
      naam: 'flax-flower-a', bronmodel: 'flax_flower_A', kind: 'env-flora-plant-flower', tags: [],
      cellen: { '3,2': leaf, '6,3': petal, '7,1': pollen, '*': leaf },
    },
    {
      naam: 'flax-flower-b', bronmodel: 'flax_flower_B', kind: 'env-flora-plant-flower', tags: [],
      cellen: { '3,3': leaf, '2,2': petal, '7,1': pollen, '*': leaf },
    },

    {
      naam: 'guitar-a', bronmodel: 'guitar_A', kind: 'obj-instrument', tags: [],
      cellen: {
        '6,1': steel, '6,3': porcelain, '7,0': woodWorked, '5,0': woodWorked,
        '4,0': wrought, '1,0': steel, '5,1': steel, '*': steel,
      },
    },
    {
      naam: 'guitar-b', bronmodel: 'guitar_B', kind: 'obj-instrument', tags: [],
      cellen: {
        '6,1': steel, '5,3': glazeRed, '7,0': woodWorked, '5,0': woodWorked,
        '4,0': wrought, '1,0': steel, '5,1': steel, '*': steel,
      },
    },

    { naam: 'idol-a', bronmodel: 'idol_A', kind: 'obj-art-sculpture', tags: [], cellen: idol },
    { naam: 'idol-b', bronmodel: 'idol_B', kind: 'obj-art-sculpture', tags: [], cellen: idol },

    {
      naam: 'instant-camera-a', bronmodel: 'instantcamera', kind: 'obj', tags: [],
      cellen: {
        '3,0': wrought, '4,0': wrought, '2,0': steel, '1,3': gemRed,
        '1,0': porcelain, '0,3': gemBlue, '*': steel,
      },
    },
    {
      naam: 'instant-camera-b', bronmodel: 'instantcamera_green', kind: 'obj', tags: [],
      cellen: {
        '3,2': paintGreen, '1,3': gemRed, '1,0': porcelain, '0,3': gemBlue,
        '6,1': steel, '4,0': steel, '3,0': steel, '*': steel,
      },
    },
    {
      naam: 'photo-a', bronmodel: 'instantcamera_picture_A', kind: 'obj-pocketitem', tags: [],
      cellen: { '1,0': paper, '5,2': paper, '0,0': wrought, '2,1': wrought, '*': paper },
    },
    {
      naam: 'photo-b', bronmodel: 'instantcamera_picture_B', kind: 'obj-pocketitem', tags: [],
      cellen: { '1,0': paper, '0,0': wrought, '*': paper },
    },

    {
      naam: 'mining-helmet', bronmodel: 'mining_helmet', kind: 'obj-equipment-armor', tags: [],
      cellen: { '2,1': paintYellow, '4,2': leather, '6,1': steel, '7,1': porcelain, '*': steel },
    },

    { naam: 'puzzle-cube', bronmodel: 'puzzlecube_complete', kind: 'obj-pocketitem', tags: [], cellen: puzzleCube },
    { naam: 'puzzle-cube-core', bronmodel: 'puzzlecube_center', kind: 'obj-pocketitem', tags: [], cellen: puzzleCube },
    { naam: 'puzzle-cube-scrambled', bronmodel: 'puzzlecube_incomplete', kind: 'obj-pocketitem', tags: [], cellen: puzzleCube },

    { naam: 'rollerskate-a', bronmodel: 'rollerskate_A', kind: 'obj-equipment-clothing', tags: [], cellen: rollerskate },
    { naam: 'rollerskate-b', bronmodel: 'rollerskate_B', kind: 'obj-equipment-clothing', tags: [], cellen: rollerskate },
    {
      naam: 'rollerskate-pair', bronmodel: 'rollerskate_pair', kind: 'obj-equipment-clothing', tags: ['plural'],
      cellen: rollerskate,
    },

    {
      naam: 'taco', bronmodel: 'taco', kind: 'obj-food', tags: ['decorated'],
      cellen: { '2,1': crust, '4,2': roast, '3,2': lettuce, '1,3': tomato, '2,3': cheese, '*': crust },
    },

    { naam: 'umbrella-a', bronmodel: 'umbrella_blue', kind: 'obj', tags: ['ngons'], cellen: umbrella(clothBrown, '6,3') },
    { naam: 'umbrella-b', bronmodel: 'umbrella_green', kind: 'obj', tags: ['ngons'], cellen: umbrella(clothGreen, '3,2') },
    { naam: 'umbrella-c', bronmodel: 'umbrella_pink', kind: 'obj', tags: ['ngons'], cellen: umbrella(clothRed, '5,3') },
    { naam: 'umbrella-d', bronmodel: 'umbrella_yellow', kind: 'obj', tags: ['ngons'], cellen: umbrella(cloth, '2,3') },

    {
      naam: 'water-bottle-a', bronmodel: 'waterbottle_A', kind: 'obj-container-bottle', tags: ['ngons'],
      cellen: { '6,3': porcelain, '*': porcelain },
    },
    {
      naam: 'water-bottle-b', bronmodel: 'waterbottle_B', kind: 'obj-container-bottle', tags: ['ngons'],
      cellen: { '6,3': porcelain, '*': porcelain },
    },

    {
      naam: 'wood-stove', bronmodel: 'woodstove', kind: 'str', tags: ['ngons'],
      cellen: { '6,1': cast, '0,0': wrought, '*': cast },
    },
  ],
};

function schillen(primitief) {
  const perPunt = new Map();
  const aantal = primitief.indices.length / 3;
  const sleutelVan = (i) =>
    [0, 1, 2].map((a) => Math.round(primitief.posities[i * 3 + a] * 1e4)).join(',');

  for (let t = 0; t < aantal; t++) {
    for (let k = 0; k < 3; k++) {
      const sleutel = sleutelVan(primitief.indices[t * 3 + k]);
      const lijst = perPunt.get(sleutel);
      if (lijst) lijst.push(t);
      else perPunt.set(sleutel, [t]);
    }
  }

  const schil = new Int32Array(aantal).fill(-1);
  const groepen = [];
  for (let start = 0; start < aantal; start++) {
    if (schil[start] !== -1) continue;
    const groep = [];
    const stapel = [start];
    schil[start] = groepen.length;
    while (stapel.length) {
      const t = stapel.pop();
      groep.push(t);
      for (let k = 0; k < 3; k++) {
        for (const buur of perPunt.get(sleutelVan(primitief.indices[t * 3 + k]))) {
          if (schil[buur] !== -1) continue;
          schil[buur] = groepen.length;
          stapel.push(buur);
        }
      }
    }
    groepen.push(groep);
  }
  return groepen;
}

function richtSchillen(model) {
  let gedraaid = 0;
  for (const primitief of model.primitieven) {
    for (const groep of schillen(primitief)) {
      const randen = new Map();
      for (const t of groep) {
        const punt = [0, 1, 2].map((k) => {
          const i = primitief.indices[t * 3 + k];
          return [0, 1, 2].map((a) => Math.round(primitief.posities[i * 3 + a] * 1e4)).join(',');
        });
        for (let k = 0; k < 3; k++) {
          const rand = [punt[k], punt[(k + 1) % 3]].sort().join('|');
          randen.set(rand, (randen.get(rand) ?? 0) + 1);
        }
      }
      if ([...randen.values()].some((n) => n !== 2)) continue;

      let inhoud = 0;
      for (const t of groep) {
        const p = [0, 1, 2].map((k) => {
          const i = primitief.indices[t * 3 + k];
          return [0, 1, 2].map((a) => primitief.posities[i * 3 + a]);
        });
        inhoud += (
          p[0][0] * (p[1][1] * p[2][2] - p[1][2] * p[2][1])
          - p[0][1] * (p[1][0] * p[2][2] - p[1][2] * p[2][0])
          + p[0][2] * (p[1][0] * p[2][1] - p[1][1] * p[2][0])
        ) / 6;
      }
      if (inhoud >= 0) continue;

      const punten = new Set();
      for (const t of groep) {
        const b = primitief.indices[t * 3 + 1];
        primitief.indices[t * 3 + 1] = primitief.indices[t * 3 + 2];
        primitief.indices[t * 3 + 2] = b;
        gedraaid++;
        for (let k = 0; k < 3; k++) punten.add(primitief.indices[t * 3 + k]);
      }
      if (!primitief.normalen) continue;
      for (const i of punten) {
        for (let a = 0; a < 3; a++) primitief.normalen[i * 3 + a] *= -1;
      }
    }
  }
  return gedraaid;
}

const bronkit = BRONKITS.find((b) => b.map === PAKKET.bron);
if (!bronkit) throw new Error(`${PAKKET.bron}: not in BRONKITS`);
PAKKET.naam = bronkit.naam;

const { modellen } = bronModellen(bronkit);
const perNaam = new Map(modellen.map((model) => [model.naam, model]));
const doelMap = kitMap(PAKKET.kit);

const regels = [];
const namen = [];

console.log(`\n${PAKKET.kit}  (${bronkit.naam})`);
for (const opgave of PAKKET.modellen) {
  const model = perNaam.get(opgave.bronmodel);
  if (!model) throw new Error(`${opgave.bronmodel}: not in ${PAKKET.bron}`);
  const gekeerd = richtSchillen(model);

  const mesh = bouw(model.primitieven, opgave, PAKKET, null);
  schrijf(join(doelMap, `${opgave.naam}.glb`), mesh, opgave, PAKKET);

  const materialen = [...mesh.materialen];
  regels.push([`${PAKKET.kit}/${opgave.naam}`, [opgave.kind, ...materialen, ...opgave.tags]]);
  namen.push(opgave.naam);

  console.log(
    `  ${opgave.bronmodel.padEnd(26)} → ${opgave.naam.padEnd(22)} `
      + `${String(mesh.driehoeken.length / 3).padStart(5)} tris, `
      + `${materialen.length} material(s), ${mesh.banden.size} band(s): ${[...mesh.banden].join(', ')}`
      + `${gekeerd ? `, ${gekeerd} turned out` : ''}`,
  );
}

zetTags(regels);
zetManifest(new Map([[PAKKET.kit, namen]]));
console.log(`\n${regels.length} models added to kits/workfiles/${PAKKET.kit}`);
