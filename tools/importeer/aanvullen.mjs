import { join } from 'node:path';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';
import { textuurZoeker } from './leerbanden.mjs';
import {
  bouw, schrijf, bandPlekken, kitMap, zetTags, zetManifest, ontdubbel, richtSchillen,
  richtWinding,
} from './bouwer.mjs';
import { scaleTarget } from './scale-factors.mjs';
import { specVoor, bandNaarMateriaal } from './quat-specs.mjs';

const KITS = [
  'quat-blood-ring', 'quat-dun-1', 'quat-dun-2', 'quat-fish', 'quat-food',
  'quat-nature', 'quat-pirate', 'quat-props', 'quat-rpg', 'quat-ships',
  'quat-skeleton', 'quat-town',
];

const gevraagd = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const droog = process.argv.includes('--dry-run');
const kits = gevraagd.length ? gevraagd : KITS;

const regels = [];
const perKit = new Map();

for (const kit of kits) {
  const spec = specVoor(kit);
  const bronkit = BRONKITS.find((b) => b.kit === kit);

  const pakket = {
    kit,
    bron: spec.bron,
    naam: bronkit.naam,
    schaal: scaleTarget(kit),
    generator: 'tools/importeer/aanvullen.mjs',
    modellen: spec.modellen.map((model) => ({
      naam: model.naam,
      bronmodel: model.bronmodel,
      kind: model.kind,
      tags: model.tags,
      rotatie: model.rotatie,
      kleuren: Object.fromEntries([
        ...Object.entries(model.kleuren).map(([hex, band]) =>
          [hex, [bandNaarMateriaal(band, model.materialen), band]]),
        ['*', [bandNaarMateriaal(model.val, model.materialen), model.val]],
      ]),
    })),
  };
  if (pakket.schaal === null) throw new Error(`${kit}: no factor in scale-factors.mjs`);

  const { modellen, uitgepakt } = bronModellen(bronkit);
  const perNaam = new Map(modellen.map((model) => [model.naam, model]));
  pakket.atlas = modellen.some((m) => m.primitieven.some((p) => p.materiaal.textuur));
  const zoekTextuur = textuurZoeker(uitgepakt);
  const plek = bandPlekken(pakket);
  const doelMap = kitMap(kit);

  console.log(`\n${kit}  (${bronkit.naam})  scale ${pakket.schaal}  ${pakket.modellen.length} models`);
  for (const opgave of pakket.modellen) {
    const model = perNaam.get(opgave.bronmodel);
    if (!model) throw new Error(`${opgave.bronmodel}: not in ${pakket.bron}`);
    if (pakket.atlas) {
      for (const prim of model.primitieven) {
        const gevonden = zoekTextuur(prim.materiaal?.textuur);
        if (gevonden) prim.materiaal.textuur = gevonden;
      }
    }
    const dubbel = ontdubbel(model);
    const gekeerd = richtSchillen(model);
    const gericht = richtWinding(model);

    const mesh = bouw(model.primitieven, opgave, pakket, plek);
    if (!droog) schrijf(join(doelMap, `${opgave.naam}.glb`), mesh, opgave, pakket);

    const materialen = [...mesh.materialen];
    regels.push([`${kit}/${opgave.naam}`, [opgave.kind, ...materialen, ...opgave.tags]]);
    perKit.set(kit, [...(perKit.get(kit) ?? []), opgave.naam]);

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

if (!droog) {
  zetTags(regels);
  zetManifest(perKit);
}
console.log(`\n${regels.length} models ${droog ? 'checked' : 'written to kits/workfiles'}`);
