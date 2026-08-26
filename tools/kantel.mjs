// Kantelt de inhoud van een knoop om een as door de oorsprong van die knoop.
// Er komt één hulpknoop onder de knoop die de kinderen overneemt; de knoop zelf
// houdt zijn eigen plek en zijn eigen animatie. Zet je hem onder een draaiknoop
// van tools/draai-animatie.mjs, dan kantelt het model binnen de draaiing mee in
// plaats van naar één vaste kant van de wereld te blijven hangen.
//
//   node tools/kantel.mjs <glb> --knoop <naam> --as x --graden 12 [--proef]
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb } from '../catalog/tools/glb.mjs';

const a = process.argv.slice(2);
let pad = null, knoopnaam = null, as = null, graden = null, proef = false;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--knoop') knoopnaam = a[++i];
  else if (a[i] === '--as') as = a[++i];
  else if (a[i] === '--graden') graden = Number(a[++i]);
  else if (a[i] === '--proef') proef = true;
  else pad = a[i];
}
if (!pad || !knoopnaam || !as || graden === null) {
  throw new Error('gebruik: <glb> --knoop <naam> --as x|y|z --graden <getal>');
}

const asindex = { x: 0, y: 1, z: 2 }[as.replace(/^[-+]/, '')];
if (asindex === undefined) throw new Error(`onbekende as: ${as}`);
const teken = as.startsWith('-') ? -1 : 1;

const glb = readGlb(pad);
const knopen = glb.json.nodes ?? [];
const doel = knopen.findIndex((k) => k.name === knoopnaam);
if (doel < 0) throw new Error(`geen knoop ${knoopnaam} in ${pad}`);

const halve = (teken * graden * Math.PI) / 360;
const draai = [0, 0, 0, Math.cos(halve)];
draai[asindex] = Math.sin(halve);

if (proef) {
  console.log(`${pad}: ${knoopnaam} kantelt ${graden}° om ${as}`);
  process.exit(0);
}

const helling = knopen.push({
  name: `${knoopnaam}_helling`,
  rotation: draai,
  children: knopen[doel].children ?? [],
}) - 1;
knopen[doel].children = [helling];

writeGlb(pad, glb.json, glb.bin, writeFileSync);
console.log(`${pad}: ${knoopnaam} kantelt ${graden}° om ${as}`);
