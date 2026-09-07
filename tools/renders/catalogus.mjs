// Rendert elk model uit catalog.json als diagnostisch blad van acht tegels
// (render.mjs --ladder 8: pbr, claywire, normals, silhouet).
// Gebruik: node tools/renders/catalogus.mjs [uitdir] [--ladder n]
// Standaard uitdir: docs/catalogus_views
//
// Per kit één renderloop, niet één voor de hele catalogus. Dat is geen detail:
// render.mjs kwalificeert dubbele modelnamen met hun map, en `tree` bestaat in
// vijf kits. Binnen één kit zijn de namen uniek, dus heet de uitvoermap altijd
// naar het model zelf — en dat maakt hervatten exact: een map die er al staat is
// af en wordt overgeslagen. Over de hele catalogus in één run zou de naam
// afhangen van wie er verder in de batch zit, en dus verschuiven zodra je
// hervat.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');

const args = process.argv.slice(2);
const li = args.indexOf('--ladder');
const LADDER = li === -1 ? '8' : args[li + 1];
if (!/^[1-8]$/.test(LADDER)) { console.error('--ladder wil 1..8, kreeg: ' + LADDER); process.exit(2); }
const uitArg = (li === -1 ? args : args.filter((_, i) => i !== li && i !== li + 1))[0];
const UIT = path.resolve(ROOT, uitArg ?? 'docs/catalogus_views');

const catalogus = JSON.parse(readFileSync(path.join(ROOT, 'catalog', 'catalog.json'), 'utf8'));
const perKit = new Map();
for (const m of catalogus.models) {
  if (!perKit.has(m.kit)) perKit.set(m.kit, []);
  perKit.get(m.kit).push(m.name);
}

console.log(`${catalogus.models.length} modellen in ${perKit.size} kits -> ${UIT}`);
let gedaan = 0, overgeslagen = 0, ontbreekt = 0, mislukt = 0;

for (const [kit, namen] of perKit) {
  const kitUit = path.join(UIT, kit);
  const todo = [];
  for (const naam of namen) {
    if (existsSync(path.join(kitUit, `${naam}_sheet.png`))) { overgeslagen++; continue; }
    const glb = path.join(ROOT, 'kits', 'workfiles', kit, `${naam}.glb`);
    if (!existsSync(glb)) { console.log('ONTBREEKT', kit, naam); ontbreekt++; continue; }
    todo.push(glb);
  }
  if (!todo.length) continue;

  mkdirSync(kitUit, { recursive: true });
  console.log(`[${kit}] ${todo.length} modellen`);
  const r = spawnSync('node', [path.join(HIER, 'render.mjs'), ...todo,
    '--ladder', LADDER, '--out', kitUit], { stdio: 'inherit' });
  if (r.status !== 0) { console.log('MISLUKT', kit, 'exit ' + r.status); mislukt += todo.length; }
  else gedaan += todo.length;
}

console.log(`klaar: ${gedaan} gerenderd, ${overgeslagen} overgeslagen, ${ontbreekt} ontbrekend, ${mislukt} mislukt`);
if (mislukt || ontbreekt) process.exitCode = 1;
