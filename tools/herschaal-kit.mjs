import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readGlb, writeGlb } from '../catalog/tools/glb.mjs';

const WERK_DIR = new URL('../kits/workfiles/', import.meta.url).pathname;

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const getal = (vlag) => {
  const n = argv.indexOf(vlag);
  if (n === -1) return null;
  const waarde = Number(argv[n + 1]);
  if (!(waarde > 0)) throw new Error(`${vlag} verwacht een getal groter dan 0`);
  return waarde;
};
const met = getal('--met');
const naar = getal('--naar');
const slug = argv.find((a) => !a.startsWith('--') && a !== String(met) && a !== String(naar));

if (!slug || (met === null) === (naar === null)) {
  console.error('usage: node tools/herschaal-kit.mjs <kit> (--met f | --naar f) [--dry]');
  process.exit(2);
}

const dir = join(WERK_DIR, slug);
const bestanden = readdirSync(dir).filter((n) => n.endsWith('.glb')).sort();
if (!bestanden.length) throw new Error(`${slug}: geen .glb in ${dir}`);

const rond = (waarde) => Number(waarde.toPrecision(6));

let geraakt = 0;
for (const bestand of bestanden) {
  const pad = join(dir, bestand);
  const { json, bin } = readGlb(pad);
  const nodes = json.nodes ?? [];
  const wikkelIndex = nodes.findIndex((n) => n.name === 'rescale-wrapper');
  const oud = wikkelIndex === -1 ? 1 : nodes[wikkelIndex].scale?.[0] ?? 1;
  const nieuw = rond(naar !== null ? naar : oud * met);
  if (nieuw === oud) continue;

  if (nieuw === 1) {
    const kind = nodes[wikkelIndex].children[0];
    json.nodes = nodes.filter((_, i) => i !== wikkelIndex);
    const verschuif = (i) => (i > wikkelIndex ? i - 1 : i);
    for (const n of json.nodes) if (n.children) n.children = n.children.map(verschuif);
    json.scenes = [{ nodes: [verschuif(kind)] }];
  } else if (wikkelIndex === -1) {
    const wortel = json.scenes[json.scene ?? 0].nodes[0];
    nodes.push({ name: 'rescale-wrapper', scale: [nieuw, nieuw, nieuw], children: [wortel] });
    json.nodes = nodes;
    json.scenes = [{ nodes: [nodes.length - 1] }];
  } else {
    nodes[wikkelIndex].scale = [nieuw, nieuw, nieuw];
  }

  console.log(`  ${bestand.padEnd(34)} ×${oud} → ×${nieuw}`);
  if (!DRY) writeGlb(pad, json, bin, writeFileSync);
  geraakt++;
}

console.log(`\n${geraakt}/${bestanden.length} model(s) in ${slug}${DRY ? ' — dry run' : ''}`);
if (!DRY && geraakt) console.log('now run: node catalog/tools/build-catalog.mjs');
