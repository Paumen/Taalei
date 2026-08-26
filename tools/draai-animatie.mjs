// Geeft een glb een draai-animatie: een knoop die eindeloos om een as rondgaat.
// Vier kwartslagen als sleutels, zodat slerp elke stap de korte weg neemt en de
// snelheid gelijk blijft; de laatste sleutel is dezelfde stand als de eerste, dus
// de lus sluit naadloos.
// Met --om draait niet de knoop zelf maar zijn inhoud om een punt ernaast: er
// komen twee hulpknopen tussen (heen naar het draaipunt, terug naar de oorsprong),
// zodat de knoop zelf op zijn plek blijft staan.
//
//   node tools/draai-animatie.mjs <glb> --knoop <naam> --as y [--om x,y,z] [--duur 2] [--naam spin] [--proef]
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb } from '../catalog/tools/glb.mjs';

const a = process.argv.slice(2);
let pad = null, knoopnaam = null, as = null, om = null, duur = 2, naam = 'spin', proef = false;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--knoop') knoopnaam = a[++i];
  else if (a[i] === '--as') as = a[++i];
  else if (a[i] === '--om') om = a[++i].split(',').map(Number);
  else if (a[i] === '--duur') duur = Number(a[++i]);
  else if (a[i] === '--naam') naam = a[++i];
  else if (a[i] === '--proef') proef = true;
  else pad = a[i];
}
if (!pad || !knoopnaam || !as) throw new Error('gebruik: <glb> --knoop <naam> --as [-]x|y|z [--om x,y,z]');

const teken = as.startsWith('-') ? -1 : 1;
const asindex = { x: 0, y: 1, z: 2 }[as.replace(/^[-+]/, '')];
if (asindex === undefined) throw new Error(`onbekende as: ${as}`);
if (om && om.length !== 3) throw new Error('--om vraagt om drie getallen');

const glb = readGlb(pad);
const knopen = glb.json.nodes ?? [];
const doel = knopen.findIndex((k) => k.name === knoopnaam);
if (doel < 0) throw new Error(`geen knoop ${knoopnaam} in ${pad}`);

// Sleutels: vijf standen van 0 tot 360 graden. w loopt 1 → 0 → -1, dus elk
// opeenvolgend paar heeft een positief inproduct en draait dezelfde kant op.
const tijden = [0, 1, 2, 3, 4].map((k) => (k * duur) / 4);
const draaiingen = [0, 1, 2, 3, 4].map((k) => {
  const halve = (k * Math.PI) / 4;
  const q = [0, 0, 0, Math.cos(halve)];
  q[asindex] = teken * Math.sin(halve);
  return q;
});

// De knoop die de animatie draagt. Met --om schuiven we de inhoud van de doelknoop
// in een paar hulpknopen: eerst naar het draaipunt, dan terug, zodat de draaiing
// om dat punt gaat in plaats van om de oorsprong van de knoop.
let draaier = doel;
if (om) {
  const terug = knopen.push({
    name: `${knoopnaam}_draaias`,
    translation: om.map((v) => -v),
    children: knopen[doel].children ?? [],
  }) - 1;
  draaier = knopen.push({
    name: `${knoopnaam}_draaipunt`,
    translation: om,
    children: [terug],
  }) - 1;
  knopen[doel].children = [draaier];
}

// Een geanimeerde knoop mag geen matrix hebben; die van deze kits zijn zuivere
// verplaatsingen, dus dat is een veilige omzetting — iets anders weigeren we.
const m = knopen[draaier].matrix;
if (m) {
  const rest = [...m.slice(0, 12), 0, 0, 0, 1];
  const eenheid = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  if (rest.some((v, i) => Math.abs(v - eenheid[i]) > 1e-6)) {
    throw new Error(`matrix van ${knoopnaam} draait of schaalt al; omzetten naar TRS gaat niet blind`);
  }
  delete knopen[draaier].matrix;
  knopen[draaier].translation = [m[12], m[13], m[14]];
}

if (proef) {
  console.log(`${pad}: ${naam} — knoop ${knoopnaam}${om ? ` om ${om.join(',')}` : ''}, as ${as}, ${duur}s`);
  process.exit(0);
}

const stukken = [glb.bin];
let lengte = glb.bin.length;
const nieuweAccessor = (getallen, type, breedte) => {
  const vul = (4 - (lengte % 4)) % 4;
  if (vul) { stukken.push(Buffer.alloc(vul, 0)); lengte += vul; }
  const data = Buffer.from(new Float32Array(getallen).buffer);
  const view = glb.json.bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: data.length }) - 1;
  stukken.push(data); lengte += data.length;
  const kolom = (k) => getallen.filter((_, i) => i % breedte === k);
  return glb.json.accessors.push({
    bufferView: view,
    componentType: 5126,
    count: getallen.length / breedte,
    type,
    min: Array.from({ length: breedte }, (_, k) => Math.min(...kolom(k))),
    max: Array.from({ length: breedte }, (_, k) => Math.max(...kolom(k))),
  }) - 1;
};

// Draagt het model die clip al, dan schrijven we de sleutels over de bestaande
// accessors heen in plaats van er een tweede clip naast te zetten. Het aantal
// sleutels ligt vast op vijf, dus de plek in de buffer blijft even groot en er
// blijven geen losse accessors of bufferViews achter.
const bestaand = (glb.json.animations ?? []).find((a) => a.name === naam);
if (bestaand) {
  const overschrijf = (accessorIndex, getallen, breedte) => {
    const acc = glb.json.accessors[accessorIndex];
    if (acc.componentType !== 5126) throw new Error(`${naam}: bestaande sleutels zijn geen float`);
    if (acc.count * breedte !== getallen.length) {
      throw new Error(`${naam}: bestaande clip heeft ${acc.count} sleutels, nieuwe ${getallen.length / breedte}`);
    }
    const view = glb.json.bufferViews[acc.bufferView];
    const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    for (let i = 0; i < getallen.length; i++) glb.bin.writeFloatLE(getallen[i], start + i * 4);
    const kolom = (k) => getallen.filter((_, i) => i % breedte === k);
    acc.min = Array.from({ length: breedte }, (_, k) => Math.min(...kolom(k)));
    acc.max = Array.from({ length: breedte }, (_, k) => Math.max(...kolom(k)));
  };
  const sampler = bestaand.samplers[bestaand.channels[0].sampler];
  overschrijf(sampler.input, tijden, 1);
  overschrijf(sampler.output, draaiingen.flat(), 4);
  bestaand.channels[0].target.node = draaier;
  writeGlb(pad, glb.json, glb.bin, writeFileSync);
  console.log(`${pad}: ${naam} bijgesteld — knoop ${knoopnaam}, as ${as}, ${duur}s`);
  process.exit(0);
}

const iTijd = nieuweAccessor(tijden, 'SCALAR', 1);
const iDraai = nieuweAccessor(draaiingen.flat(), 'VEC4', 4);

glb.json.animations ??= [];
glb.json.animations.push({
  name: naam,
  samplers: [{ input: iTijd, output: iDraai, interpolation: 'LINEAR' }],
  channels: [{ sampler: 0, target: { node: draaier, path: 'rotation' } }],
});

const bin = Buffer.concat(stukken);
glb.json.buffers[0].byteLength = bin.length;
writeGlb(pad, glb.json, bin, writeFileSync);
console.log(`${pad}: ${naam} — knoop ${knoopnaam}${om ? ` om ${om.join(',')}` : ''}, as ${as}, ${duur}s`);
