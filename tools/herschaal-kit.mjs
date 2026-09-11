#!/usr/bin/env node
// herschaal-kit.mjs — resize a kit that is already imported.
//
//   node tools/herschaal-kit.mjs <kit> --met 0.7     multiply the current size by 0.7
//   node tools/herschaal-kit.mjs <kit> --naar 0.65   set the factor outright
//   node tools/herschaal-kit.mjs <kit> --met 0.7 --dry
//
// The factor rides in a `rescale-wrapper` node over every model rather than in the
// import scale, which is how dungeon, dungeon-quaternius and pirate-quaternius carry
// theirs — aanvullen.mjs reads it back from there so a model added later lands at the
// size of the models beside it. Re-running is safe: --naar is idempotent.
//
// Rebuild the catalogue afterwards, or the recorded dimensions still describe the old size.

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
    // back to its import size: the wrapper has nothing left to say, so drop it
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
