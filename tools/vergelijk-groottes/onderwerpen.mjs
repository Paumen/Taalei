// Bouwt groepen van hetzelfde onderwerp uit verschillende kits, zodat je in een
// render dezelfde boom, rots of kist naast elkaar ziet staan per kit.
// Gebruik: node tools/vergelijk-groottes/onderwerpen.mjs [uit.json]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');
const UIT = path.resolve(ROOT, process.argv[2] ?? path.join(HIER, 'onderwerpen.json'));

// Woorden die een variant beschrijven, geen onderwerp.
const VARIANTWOORDEN = new Set([
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
  'small', 'medium', 'large', 'big', 'tall', 'short', 'wide', 'narrow', 'long', 'thin', 'thick',
  'single', 'double', 'triple', 'quad', 'half', 'full', 'low', 'high', 'mid', 'top', 'bottom',
  'left', 'right', 'front', 'back', 'side', 'inner', 'outer', 'corner', 'straight', 'curve',
  'curved', 'diagonal', 'end', 'start', 'middle', 'open', 'closed', 'broken', 'damaged', 'empty',
  'new', 'old', 'alt', 'variant', 'type', 'group', 'set', 'pack', 'kit', 'ref',
  'flat', 'round', 'square', 'simple', 'plain', 'dead', 'hanging', 'base', 'structure', 'support',
  'red', 'green', 'blue', 'yellow', 'white', 'black', 'brown', 'grey', 'gray', 'orange', 'purple',
  'wood', 'wooden', 'stone', 'metal', 'iron', 'gold', 'silver', 'snow', 'snowy', 'fall', 'autumn',
  'winter', 'summer', 'spring', 'dark', 'light', 'and', 'with', 'the', 'lod',
]);

const MIN_KITS = 3;   // pas vergelijken als drie kits het onderwerp hebben
const MAX_KITS = 10;  // anders wordt de strook onleesbaar breed
const PER_KIT = 2;    // hoogstens twee voorbeelden per kit

const catalogus = JSON.parse(readFileSync(path.join(ROOT, 'catalog', 'catalog.json'), 'utf8'));

const woorden = (naam) => naam.toLowerCase().split(/[^a-z]+/).filter(Boolean);
const enkelvoud = (w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

// onderwerp -> kit -> modellen
const perOnderwerp = new Map();
for (const model of catalogus.modellen) {
  if (!model.pad?.endsWith('.glb')) continue;
  for (const woord of new Set(woorden(model.naam).map(enkelvoud))) {
    if (woord.length < 3 || VARIANTWOORDEN.has(woord)) continue;
    if (!perOnderwerp.has(woord)) perOnderwerp.set(woord, new Map());
    const kits = perOnderwerp.get(woord);
    if (!kits.has(model.kit)) kits.set(model.kit, []);
    kits.get(model.kit).push(model);
  }
}

// Het meest typische model eerst: korte naam = weinig varianttoevoegingen.
const rangschik = (a, b) => a.naam.length - b.naam.length || a.naam.localeCompare(b.naam);

const groepen = {};
for (const [onderwerp, kits] of [...perOnderwerp].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (kits.size < MIN_KITS) continue;
  const gekozenKits = [...kits.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, MAX_KITS)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const items = [];
  for (const [kit, modellen] of gekozenKits) {
    for (const model of [...modellen].sort(rangschik).slice(0, PER_KIT)) {
      items.push({
        pad: model.pad.replace(/^kits\//, ''),
        label: `${kit}/${model.naam}`,
      });
    }
  }
  groepen[onderwerp] = { items };
}

writeFileSync(UIT, JSON.stringify(groepen, null, 1) + '\n');
console.log(`${Object.keys(groepen).length} onderwerpen -> ${path.relative(ROOT, UIT)}`);
for (const [naam, groep] of Object.entries(groepen)) {
  console.log(`  ${naam}: ${groep.items.length} modellen uit ${new Set(groep.items.map((i) => i.label.split('/')[0])).size} kits`);
}
