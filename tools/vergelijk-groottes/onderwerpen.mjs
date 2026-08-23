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
  'bare', 'decorated', 'fortified', 'melted', 'stepping', 'tiny', 'huge', 'giant', 'mini', 'prop',
  'red', 'green', 'blue', 'yellow', 'white', 'black', 'brown', 'grey', 'gray', 'orange', 'purple',
  'wood', 'wooden', 'stone', 'metal', 'iron', 'gold', 'silver', 'snow', 'snowy', 'fall', 'autumn',
  'winter', 'summer', 'spring', 'dark', 'light', 'and', 'with', 'the', 'lod',
]);

const MIN_KITS = 2;   // vanaf twee kits valt er iets te vergelijken
const MAX_KITS = 12;  // anders wordt de strook onleesbaar breed
const PER_KIT = 3;    // hoogstens drie voorbeelden per kit

const catalogus = JSON.parse(readFileSync(path.join(ROOT, 'catalog', 'catalog.json'), 'utf8'));

const woorden = (naam) => naam.toLowerCase().split(/[^a-z]+/).filter(Boolean);
// 'rocks' en 'rock' horen bij elkaar, maar 'debris' en 'grass' blijven zoals ze zijn.
const GEEN_MEERVOUD = /(ss|is|us|as)$/;
const enkelvoud = (w) => (w.length > 3 && w.endsWith('s') && !GEEN_MEERVOUD.test(w) ? w.slice(0, -1) : w);

// Het onderwerp is het laatste zelfstandige woord in de naam: 'tree-dead-large' is
// een tree, maar 'table-plate' is een plate en 'tree-log' een log. Zo staat er per
// strook echt hetzelfde ding, en niet alles wat het woord toevallig noemt.
const onderwerpVan = (naam) => {
  const kern = woorden(naam)
    .map(enkelvoud)
    .filter((w) => w.length > 2 && !VARIANTWOORDEN.has(w));
  return kern.at(-1) ?? null;
};

// onderwerp -> kit -> modellen
const perOnderwerp = new Map();
for (const model of catalogus.modellen) {
  if (!model.pad?.endsWith('.glb')) continue;
  const woord = onderwerpVan(model.naam);
  if (!woord) continue;
  if (!perOnderwerp.has(woord)) perOnderwerp.set(woord, new Map());
  const kits = perOnderwerp.get(woord);
  if (!kits.has(model.kit)) kits.set(model.kit, []);
  kits.get(model.kit).push(model);
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
