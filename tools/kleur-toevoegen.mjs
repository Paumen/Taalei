/**
 * Voegt een kleur toe aan de gedeelde colormap en aan kits/palet.json.
 *
 *   node tools/kleur-toevoegen.mjs <kolom>,<rij> <#hex> <naam>
 *
 * Stijlgids §1 staat een nieuwe kleur toe als geen bestaande in de buurt komt,
 * hij binnen de bestaande kleuren past, en hij áltijd in de gedeelde colormap
 * terechtkomt. Dat laatste is precies wat hier gebeurt, zodat er geen kleur
 * buiten het palet om ontstaat.
 *
 * De cel moet leeg (zwart) zijn. Een bezette cel overschrijven zou de kleur
 * veranderen van elk model waarvan de uv's daarheen wijzen, en dat is nooit de
 * bedoeling — daarom weigert het script dat.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesPng, schrijfPng } from './lezen.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ATLAS = join(ROOT, 'kits', 'colormap.png');
const PALET = join(ROOT, 'kits', 'palet.json');

const KOLOMMEN = 16;
const RIJEN = 4;

const [celTekst, hex, ...naamDelen] = process.argv.slice(2);
const naam = naamDelen.join(' ');

if (!celTekst || !hex || !naam) {
  console.error('gebruik: node tools/kleur-toevoegen.mjs <kolom>,<rij> <#hex> <naam>');
  process.exit(2);
}
if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
  console.error(`geen geldige hexkleur: ${hex}`);
  process.exit(2);
}

const [kolom, rij] = celTekst.split(',').map(Number);
if (!(kolom >= 0 && kolom < KOLOMMEN && rij >= 0 && rij < RIJEN)) {
  console.error(`cel buiten het raster van ${KOLOMMEN} x ${RIJEN}: ${celTekst}`);
  process.exit(2);
}

const img = leesPng(ATLAS);
const celBreed = img.breedte / KOLOMMEN;
const celHoog = img.hoogte / RIJEN;
const stap = img.breedte * img.kanalen;

/* Bezet? Dan hangt er ergens een model aan en gaan we er vanaf. */
let bezet = false;
for (let y = rij * celHoog; y < (rij + 1) * celHoog && !bezet; y++) {
  for (let x = kolom * celBreed; x < (kolom + 1) * celBreed; x++) {
    const i = y * stap + x * img.kanalen;
    if (img.data[i] || img.data[i + 1] || img.data[i + 2]) { bezet = true; break; }
  }
}
if (bezet) {
  console.error(`cel ${kolom},${rij} is al in gebruik — kies een lege cel`);
  process.exit(1);
}

const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
for (let y = rij * celHoog; y < (rij + 1) * celHoog; y++) {
  for (let x = kolom * celBreed; x < (kolom + 1) * celBreed; x++) {
    const i = y * stap + x * img.kanalen;
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    if (img.kanalen === 4) img.data[i + 3] = 255;
  }
}
schrijfPng(ATLAS, img.breedte, img.hoogte, img.data, img.kanalen);

/* palet.json bijwerken. De nieuwe cel krijgt geen `bronnen`: er is nog geen
 * kit-model dat hem gebruikt, alleen het eiland. */
const palet = JSON.parse(readFileSync(PALET, 'utf8'));
const gedeeld = palet.paletten.find((p) => p.id === 'gedeeld');
if (gedeeld.cellen.some((c) => c.cel[0] === kolom && c.cel[1] === rij)) {
  console.error(`cel ${kolom},${rij} staat al in palet.json`);
  process.exit(1);
}
gedeeld.cellen.push({ cel: [kolom, rij], kleur: hex.toLowerCase(), naam, bronnen: [] });
gedeeld.cellen.sort((a, c) => a.cel[1] - c.cel[1] || a.cel[0] - c.cel[0]);
writeFileSync(PALET, `${JSON.stringify(palet, null, 1)}\n`);

console.log(`cel ${kolom},${rij} = ${hex} (${naam}) toegevoegd aan kits/colormap.png en kits/palet.json`);
