// Schuift een knoop eindeloos langs een as: twee sleutels, van zijn plek naar
// die plek plus --afstand, en dan weer van voren af aan.
//
// Waarom dat naadloos kan: staat er op het model een patroon dat zich elke
// --afstand herhaalt, dan ziet de eindstand er precies zo uit als de beginstand
// en is de sprong terug niet te zien. Het ding beweegt dus écht, oneindig door,
// zonder illusie — mits de uiteinden uit het zicht blijven, want die herhalen
// zich niet.
//
// Met --cycli n gebeurt dat n keer binnen de clip. De sprong terug aan het eind
// van elke cyclus is er wel maar is niet te zien, want hij is precies één
// herhaling groot. Zo kan het ding sneller lopen dan de ruimte waarin zijn
// uiteinden verstopt zitten: die ruimte begrenst één cyclus, niet de snelheid.
//
// Het kanaal komt in dezelfde clip als de rest, zodat één knop alles aandrijft.
//
//   node tools/schuif-animatie.mjs <glb> --knoop well-a_touw --as y --afstand 0.069 [--duur 2] [--naam spin] [--proef]
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb } from '../catalog/tools/glb.mjs';

const a = process.argv.slice(2);
let pad = null, knoopnaam = null, as = null, afstand = null, duur = 2, cycli = 1, naam = 'spin', proef = false;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--knoop') knoopnaam = a[++i];
  else if (a[i] === '--as') as = a[++i];
  else if (a[i] === '--afstand') afstand = Number(a[++i]);
  else if (a[i] === '--duur') duur = Number(a[++i]);
  else if (a[i] === '--cycli') cycli = Number(a[++i]);
  else if (a[i] === '--naam') naam = a[++i];
  else if (a[i] === '--proef') proef = true;
  else pad = a[i];
}
if (!pad || !knoopnaam || !as || afstand === null) {
  throw new Error('gebruik: <glb> --knoop <naam> --as [-]x|y|z --afstand <getal>');
}
const teken = as.startsWith('-') ? -1 : 1;
const asindex = { x: 0, y: 1, z: 2 }[as.replace(/^[-+]/, '')];
if (asindex === undefined) throw new Error(`onbekende as: ${as}`);

const glb = readGlb(pad);
const knopen = glb.json.nodes ?? [];
const doel = knopen.findIndex((k) => k.name === knoopnaam);
if (doel < 0) throw new Error(`geen knoop ${knoopnaam} in ${pad}`);
if (knopen[doel].matrix) throw new Error(`${knoopnaam} draagt een matrix; die mag niet op een geanimeerde knoop`);

const basis = knopen[doel].translation ?? [0, 0, 0];
const eind = [...basis];
eind[asindex] += teken * afstand;
// Per cyclus: van basis omhoog tot vlak voor het eind, dan in een oogwenk terug.
// De sleutels moeten strikt oplopen, vandaar het haartje speling.
const haartje = Math.min(0.001, duur / cycli / 20);
const tijden = [], plekken = [];
for (let k = 0; k < cycli; k++) {
  tijden.push((k * duur) / cycli); plekken.push(...basis);
  tijden.push(((k + 1) * duur) / cycli - haartje); plekken.push(...eind);
}
tijden.push(duur); plekken.push(...basis);

if (proef) {
  console.log(`${pad}: ${naam} — ${knoopnaam} van ${basis.map((v) => +v.toFixed(4))} naar ${eind.map((v) => +v.toFixed(4))} in ${duur}s`);
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
    bufferView: view, componentType: 5126, count: getallen.length / breedte, type,
    min: Array.from({ length: breedte }, (_, k) => Math.min(...kolom(k))),
    max: Array.from({ length: breedte }, (_, k) => Math.max(...kolom(k))),
  }) - 1;
};

const iTijd = nieuweAccessor(tijden, 'SCALAR', 1);
const iPlek = nieuweAccessor(plekken, 'VEC3', 3);

glb.json.animations ??= [];
let clip = glb.json.animations.find((x) => x.name === naam);
if (!clip) {
  clip = { name: naam, samplers: [], channels: [] };
  glb.json.animations.push(clip);
}
const bestaand = clip.channels.find((c) => c.target.node === doel && c.target.path === 'translation');
if (bestaand) {
  const s = clip.samplers[bestaand.sampler];
  s.input = iTijd; s.output = iPlek; s.interpolation = 'LINEAR';
} else {
  const s = clip.samplers.push({ input: iTijd, output: iPlek, interpolation: 'LINEAR' }) - 1;
  clip.channels.push({ sampler: s, target: { node: doel, path: 'translation' } });
}

const bin = Buffer.concat(stukken);
glb.json.buffers[0].byteLength = bin.length;
writeGlb(pad, glb.json, bin, writeFileSync);
console.log(`${pad}: ${naam} — ${knoopnaam} schuift ${cycli}× ${teken * afstand} langs ${as} in ${duur}s (${(cycli * afstand / duur).toFixed(3)} per seconde)`);
