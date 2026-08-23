// Schrijft bij de renders twee documenten: een index van alle onderwerpen en een
// analyse van de inconsistenties tussen kits — kits die eenzelfde boom, kist of hek
// veel groter, kleiner of veel gedetailleerder maken dan de rest.
// Gebruik: node tools/vergelijk-groottes/rapport.mjs [map]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');
const MAP = path.resolve(ROOT, process.argv[2] ?? path.join(ROOT, 'docs', 'asset_size_review', 'onderwerpen'));

const GROOT = 1.8;   // vanaf dit veelvoud van de mediaan noemen we het een uitschieter
const KLEIN = 1 / GROOT;
const DETAIL = 2.5;  // idem voor driehoeken per unit

const onderwerpen = JSON.parse(readFileSync(path.join(HIER, 'onderwerpen.json'), 'utf8'));
const catalogus = JSON.parse(readFileSync(path.join(ROOT, 'catalog', 'catalog.json'), 'utf8'));
const perId = new Map(catalogus.modellen.map((m) => [m.id, m]));

const mediaan = (rij) => {
  const s = [...rij].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

// Alleen de modellen die ook in de renders staan; dat is wat je op het plaatje ziet.
// De drie meest gebruikte kleuren, om stijlverschillen binnen hetzelfde onderwerp te zien.
const veelGebruikt = (kleuren) => {
  const telling = new Map();
  for (const k of kleuren) telling.set(k, (telling.get(k) ?? 0) + 1);
  return [...telling.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
};

const rapport = [];
for (const [onderwerp, groep] of Object.entries(onderwerpen)) {
  const perKit = new Map();
  for (const item of groep.items) {
    const id = item.label;
    const model = perId.get(id);
    if (!model) continue;
    if (!perKit.has(model.kit)) perKit.set(model.kit, []);
    perKit.get(model.kit).push(model);
  }
  const kits = [...perKit.entries()].map(([kit, modellen]) => ({
    kit,
    hoogte: mediaan(modellen.map((m) => m.wdh[2])),
    grondvlak: mediaan(modellen.map((m) => Math.max(m.wdh[0], m.wdh[1]))),
    detail: mediaan(modellen.map((m) => m.driehoekenPerUnit)),
    kleuren: veelGebruikt(modellen.flatMap((m) => m.kleuren ?? [])),
    namen: modellen.map((m) => m.naam),
  }));
  if (kits.length < 2) continue;
  const midHoogte = mediaan(kits.map((k) => k.hoogte));
  const midDetail = mediaan(kits.map((k) => k.detail));
  for (const k of kits) {
    k.hoogteFactor = k.hoogte / midHoogte;
    k.detailFactor = k.detail / midDetail;
  }
  const factoren = kits.map((k) => k.hoogteFactor);
  rapport.push({
    onderwerp,
    kits: kits.sort((a, b) => b.hoogteFactor - a.hoogteFactor),
    midHoogte,
    midDetail,
    spreiding: Math.max(...factoren) / Math.min(...factoren),
  });
}

// Kits die het structureel anders doen dan de rest, over alle onderwerpen heen.
const perKit = new Map();
for (const r of rapport) {
  for (const k of r.kits) {
    if (!perKit.has(k.kit)) perKit.set(k.kit, { kit: k.kit, log: [], groot: [], klein: [], detail: [] });
    const p = perKit.get(k.kit);
    p.log.push(Math.log(k.hoogteFactor));
    if (k.hoogteFactor >= GROOT) p.groot.push(r.onderwerp);
    if (k.hoogteFactor <= KLEIN) p.klein.push(r.onderwerp);
    if (k.detailFactor >= DETAIL) p.detail.push(r.onderwerp);
  }
}
const kitRijen = [...perKit.values()]
  .map((p) => ({ ...p, factor: Math.exp(p.log.reduce((a, b) => a + b, 0) / p.log.length) }))
  .sort((a, b) => (b.groot.length + b.klein.length) - (a.groot.length + a.klein.length) || b.factor - a.factor);

const opvallend = rapport.filter((r) => r.spreiding >= GROOT).sort((a, b) => b.spreiding - a.spreiding);
const getal = (n) => n.toFixed(2);

const regels = [
  '# Inconsistenties tussen kits',
  '',
  'Afgeleid uit `onderwerpen.json` en `catalog/catalog.json`, over dezelfde modellen',
  'als in de renders. Per onderwerp is de mediane hoogte per kit vergeleken met de',
  'mediaan over alle kits; een factor van 1.00 is dus "net als de rest".',
  '',
  '```sh',
  'node tools/vergelijk-groottes/afwijkingen.mjs',
  '```',
  '',
  `Onderwerpen met meer dan één kit: ${rapport.length}. Daarvan met een spreiding van`,
  `${GROOT}× of meer tussen grootste en kleinste kit: ${opvallend.length}.`,
  '',
  '## Kits die er structureel uit springen',
  '',
  '`factor` is het meetkundig gemiddelde over alle onderwerpen van die kit.',
  '',
  '| kit | factor | te groot bij | te klein bij | veel dichter mesh bij |',
  '| --- | ---: | --- | --- | --- |',
];
for (const k of kitRijen) {
  regels.push(`| ${k.kit} | ${getal(k.factor)} | ${k.groot.join(', ') || '–'} | ${k.klein.join(', ') || '–'} | ${k.detail.join(', ') || '–'} |`);
}
regels.push('', '## Per onderwerp', '');
for (const r of opvallend) {
  regels.push(`### ${r.onderwerp} — spreiding ${getal(r.spreiding)}×`);
  regels.push('');
  regels.push(`Mediaan over de kits: ${getal(r.midHoogte)} unit hoog. ![${r.onderwerp}](${r.onderwerp}.png)`);
  regels.push('');
  regels.push('| kit | hoogte | factor | grondvlak | driehoeken/unit | kleuren | modellen |');
  regels.push('| --- | ---: | ---: | ---: | ---: | --- | --- |');
  for (const k of r.kits) {
    const merk = k.hoogteFactor >= GROOT ? ' ⬆' : k.hoogteFactor <= KLEIN ? ' ⬇' : '';
    regels.push(`| ${k.kit} | ${getal(k.hoogte)} | ${getal(k.hoogteFactor)}${merk} | ${getal(k.grondvlak)} | ${Math.round(k.detail)} | ${k.kleuren.join(' ') || '–'} | ${k.namen.join(', ')} |`);
  }
  regels.push('');
}
writeFileSync(path.join(MAP, 'afwijkingen.md'), regels.join('\n') + '\n');

// Index van alle stroken, ook de onderwerpen zonder opvallende spreiding.
const index = [
  '# Zelfde onderwerp naast elkaar',
  '',
  'Per onderwerp staan de modellen uit alle kits die het hebben naast elkaar, op ware',
  'schaal langs dezelfde meetlat van 1 unit, gegroepeerd per kit. Het onderwerp is het',
  'laatste zelfstandige woord in de modelnaam, dus `tree-dead-large` staat bij *tree* en',
  '`table-plate` bij *plate*.',
  '',
  'Zie [afwijkingen.md](afwijkingen.md) voor de kits die uit de toon vallen en',
  '[bevindingen.md](bevindingen.md) voor wat daar met het oog van te maken is.',
  '',
  'Opnieuw maken:',
  '',
  '```sh',
  'node tools/vergelijk-groottes/onderwerpen.mjs',
  'node tools/vergelijk-groottes/render.mjs \\',
  '  tools/vergelijk-groottes/onderwerpen.json docs/asset_size_review/onderwerpen onderwerp.html',
  'node tools/vergelijk-groottes/rapport.mjs',
  '```',
  '',
  `${Object.keys(onderwerpen).length} onderwerpen, elk met hoogstens drie voorbeelden per kit.`,
  '',
];
const spreidingVan = new Map(rapport.map((r) => [r.onderwerp, r.spreiding]));
for (const [onderwerp, groep] of Object.entries(onderwerpen)) {
  const kits = [...new Set(groep.items.map((i) => i.label.split('/')[0]))];
  const spreiding = spreidingVan.get(onderwerp);
  index.push(`## ${onderwerp}`, '');
  index.push(`${groep.items.length} modellen uit ${kits.length} kits: ${kits.join(', ')}.`
    + (spreiding ? ` Hoogtespreiding ${getal(spreiding)}×.` : ''));
  index.push('', `![${onderwerp}](${onderwerp}.png)`, '');
}
writeFileSync(path.join(MAP, 'README.md'), index.join('\n') + '\n');
console.log(`${opvallend.length} opvallende onderwerpen -> ${path.relative(ROOT, MAP)}`);
for (const k of kitRijen.slice(0, 8)) {
  console.log(`  ${k.kit}: factor ${getal(k.factor)}, ${k.groot.length} te groot, ${k.klein.length} te klein`);
}
