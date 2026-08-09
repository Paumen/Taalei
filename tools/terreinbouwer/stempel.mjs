/**
 * Zet een versiestempel achter de verwijzingen in index.html.
 *
 * Draai vanuit de repo-root na elke wijziging aan de bouwer:
 *
 *     node tools/terreinbouwer/stempel.mjs
 *
 * Waarom dit bestaat: een browser die `bouwer.css` al eens heeft opgehaald
 * haalt hem niet zomaar opnieuw op. GitHub Pages stuurt `max-age=600` mee, en
 * op een telefoon overleeft zo'n bestand ook een "wis de geschiedenis" met
 * gemak. Je krijgt dan een verse index.html met een oude stylesheet ernaast, en
 * dat is niet te zien: de pagina laadt, hij klopt alleen niet. Dat heeft hier
 * twee keer een ronde gekost — vandaar dat het nu onmogelijk is gemaakt in
 * plaats van afgeraden.
 *
 * Met de inhoud in het adres verandert het adres mee zodra de inhoud verandert,
 * en dan is er niets meer te onthouden. Dezelfde aanpak als in de catalogus
 * (`kits/catalog.css?v=…` in de index.html van de repo-wortel).
 *
 * tools/toets-terreinbouwer.mjs controleert of de stempel klopt, zodat een
 * vergeten stempel een mislukte toets is en geen raadsel achteraf.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));

/**
 * Alles wat de pagina binnenhaalt en dus kan verouderen.
 *
 * Ook `aansluiting.js` en `aansluitingen.json`, die niet in index.html staan
 * maar door bouwer.js worden opgehaald: die geeft zijn eigen stempel aan ze
 * door, zodat een oude versie van één van de twee net zo goed wordt omzeild.
 * Zonder dat gat is de stempel pas echt een garantie.
 */
const INHOUD = [
  join(HIER, 'bouwer.css'),
  join(HIER, 'bouwer.js'),
  join(HIER, 'aansluiting.js'),
  join(HIER, '..', '..', 'kits', 'modulair-terrein', 'aansluitingen.json'),
];

/**
 * De stempel: tien tekens uit de inhoud van al die bestanden samen.
 *
 * Eén stempel voor het geheel, niet één per bestand. Ze veranderen toch bijna
 * altijd samen, en één getal is makkelijker te vergelijken dan vier.
 */
export function stempel() {
  const hash = createHash('sha256');
  for (const pad of INHOUD) hash.update(readFileSync(pad));
  return hash.digest('hex').slice(0, 10);
}

/** index.html met de gegeven stempel achter elke verwijzing. */
export function metStempel(html, versie) {
  return html.replace(
    /(href|src)="(bouwer\.css|bouwer\.js)(\?v=[0-9a-f]+)?"/g,
    (_, attribuut, bestand) => `${attribuut}="${bestand}?v=${versie}"`,
  );
}

if (process.argv[1] && process.argv[1].endsWith('stempel.mjs')) {
  const pad = join(HIER, 'index.html');
  const oud = readFileSync(pad, 'utf8');
  const versie = stempel();
  const nieuw = metStempel(oud, versie);
  writeFileSync(pad, nieuw);
  console.log(oud === nieuw ? `stempel stond al goed: ${versie}` : `gestempeld: ${versie}`);
}
