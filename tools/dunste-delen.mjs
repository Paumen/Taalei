// Meet hoe dun de onderdelen van een model zijn en zet de dunste bovenaan.
//
// Het meten zelf staat in catalog/tools/dikte.mjs: samenhangende onderdelen, en
// per onderdeel de kleinste breedte van de strakst passende doos. Dit script
// loopt de catalogus langs en maakt er een lijst van.
//
// Vlakke onderdelen (een enkel vlak: bladkaartjes, vlaggen, kleden) hebben geen
// dikte; zij en alles onder --ondergrens vallen af.
//
//   node tools/dunste-delen.mjs [--aantal 20] [--ondergrens 0.001] \
//     [--kit dungeon] [--json pad.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readGlb } from '../catalog/tools/glb.mjs';
import { wereldMesh, onderdelen, dikte } from '../catalog/tools/dikte.mjs';

const WORTEL = new URL('..', import.meta.url).pathname;
const MODELMAP = join(WORTEL, 'kits/workfiles');

const a = process.argv.slice(2);
let aantal = 20, ondergrens = 0.001, kitfilter = null, jsonpad = null;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--aantal') aantal = Number(a[++i]);
  else if (a[i] === '--ondergrens') ondergrens = Number(a[++i]);
  else if (a[i] === '--kit') kitfilter = a[++i];
  else if (a[i] === '--json') jsonpad = a[++i];
  else throw new Error(`onbekend argument: ${a[i]}`);
}

const catalogus = JSON.parse(readFileSync(join(WORTEL, 'catalog/catalog.json'), 'utf8'));
const modellen = catalogus.models.filter((m) => !kitfilter || m.kit === kitfilter);

const rijen = [];
let vlakkeDelen = 0, dunneDelen = 0, gemetenDelen = 0, zonderDikOnderdeel = 0, benaderdeDelen = 0;
for (const model of modellen) {
  const glb = readGlb(join(MODELMAP, model.kit, `${model.name}.glb`));
  const mesh = wereldMesh(glb);
  const delen = onderdelen(mesh).map((g) => dikte(g, mesh.punten));
  gemetenDelen += delen.length;
  benaderdeDelen += delen.filter((d) => d.benaderd).length;

  const dik = delen.filter((d) => d.dikte >= ondergrens);
  vlakkeDelen += delen.filter((d) => d.dikte === 0).length;
  dunneDelen += delen.filter((d) => d.dikte > 0 && d.dikte < ondergrens).length;
  if (dik.length === 0) { zonderDikOnderdeel++; continue; }

  const dunste = dik.reduce((a, b) => (b.dikte < a.dikte ? b : a));
  rijen.push({
    kit: model.kit,
    naam: model.name,
    dikte: Math.round(dunste.dikte * 100000) / 100000,
    as: dunste.as.map((v) => Math.round(v * 1000) / 1000),
    deelDoos: dunste.doos.map((v) => Math.round(v * 100000) / 100000),
    deelDriehoeken: dunste.driehoeken,
    benaderd: dunste.benaderd,
    delen: delen.length,
    dikkeDelen: dik.length,
    modelDoos: model.wdh,
  });
}

rijen.sort((a, b) => a.dikte - b.dikte);

const mm = (v) => `${(v * 1000).toFixed(1)} mm`;
console.log(`${modellen.length} modellen, ${gemetenDelen} onderdelen — ${vlakkeDelen} vlak en niet meegeteld`);
if (dunneDelen) console.log(`${dunneDelen} onderdelen zijn wel massief maar dunner dan ${mm(ondergrens)} en tellen ook niet mee`);
if (benaderdeDelen) console.log(`${benaderdeDelen} onderdelen hebben een te fijne omhullende voor de exacte meting en zijn benaderd`);
if (zonderDikOnderdeel) console.log(`${zonderDikOnderdeel} modellen houden geen enkel onderdeel over en staan niet in de lijst`);
console.log('');
console.log('  #     dikte  model                                       dunste deel (mm)   drieh.   delen');
rijen.slice(0, aantal).forEach((r, i) => {
  console.log([
    String(i + 1).padStart(3),
    mm(r.dikte).padStart(9),
    `${r.kit}/${r.naam}`.padEnd(42),
    r.deelDoos.map((v) => (v * 1000).toFixed(0).padStart(4)).join(' ×').padEnd(17),
    String(r.deelDriehoeken).padStart(6),
    String(r.dikkeDelen).padStart(7),
  ].join('  '));
});

if (jsonpad) {
  writeFileSync(jsonpad, JSON.stringify(rijen, null, 1) + '\n');
  console.log(`\n${rijen.length} modellen → ${jsonpad}`);
}
