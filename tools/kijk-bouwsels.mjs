/**
 * Zet elk voorbeeldbouwsel op een plaatje in docs/bouwsels/.
 *
 * Draaien vanuit de repo-root:
 *
 *     NODE_PATH=$(npm root -g) node tools/kijk-bouwsels.mjs
 *
 * ── Waarom dit bestaat ─────────────────────────────────────────────────────
 *
 * Omdat "het klopt volgens de meting" en "het ziet eruit als iets" twee
 * verschillende dingen zijn, en ik dat een ronde lang door elkaar heb gehaald.
 * Zes bouwsels gingen de deur uit op grond van hun cijfers — zoveel voegen,
 * zoveel sluiten er — zonder dat er ooit iemand naar gekeken had. Vijf ervan
 * waren onbruikbaar:
 *
 *   - twee hellingen vielen over elkaar heen, want een stuk van 1×4 vakken was
 *     vier keer áchter elkaar gezet in plaats van naast elkaar. Alle voegen
 *     sloten, want de stukken lagen op elkaar;
 *   - een beek zweefde een kwart unit boven het gras;
 *   - een waterval had geen water, terwijl de beschrijving het beloofde;
 *   - twee hoeken stonden in een draaistand die was gekozen door een
 *     zoekfunctie die het aantal sluitende voegen maximaliseert. Dat levert een
 *     hoge score op en een kluwen om naar te kijken.
 *
 * Geen van die vijf was met een getal te vinden. Alle vijf waren met één blik te
 * zien. Vandaar dit script: het maakt de blik goedkoop en herhaalbaar, en de
 * plaatjes staan in de repo zodat ze in een pull request na te kijken zijn.
 *
 * Twee standpunten per bouwsel, want geen van beide is genoeg:
 *   - schuin van boven laat de indeling zien: wat staat waar, en overlapt er
 *     iets;
 *   - laag van opzij laat de hoogtes zien. Een helling van een halve unit is van
 *     bovenaf niet van een vlakke plaat te onderscheiden.
 */

import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { maakServer } from './terreinbouwer/serve.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UIT = join(ROOT, 'docs', 'bouwsels');
mkdirSync(UIT, { recursive: true });

const server = maakServer();
await new Promise((klaar) => server.listen(0, klaar));
const poort = server.address().port;

const browser = await chromium.launch();
const pagina = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
pagina.on('pageerror', (fout) => console.log('  [paginafout]', fout.message));

await pagina.goto(`http://127.0.0.1:${poort}/tools/terreinbouwer/`);
await pagina.waitForFunction('window.KLAAR === true', null, { timeout: 30000 });

const namen = await pagina.evaluate(() => window.TERREINBOUWER.voorbeelden.map((v) => v.naam));

/**
 * De camera op het bouwsel richten.
 *
 * @param {number} hoogte  0 = laag van opzij, 1 = schuin van boven
 */
const richt = (naam, hoogte) => pagina.evaluate(async ([n, h]) => {
  const T = window.TERREINBOUWER;
  await T.openBouwsel(T.voorbeelden.find((v) => v.naam === n));

  const stukken = [...T.bouwsel.stukken.values()];
  const xs = stukken.map((s) => s.x);
  const zs = stukken.map((s) => s.z);
  const lagen = stukken.map((s) => s.laag);
  const vak = T.kit.vak;

  const midX = ((Math.min(...xs) + Math.max(...xs)) / 2) * vak;
  const midZ = ((Math.min(...zs) + Math.max(...zs)) / 2) * vak;
  const breed = Math.max(
    (Math.max(...xs) - Math.min(...xs) + 1) * vak,
    (Math.max(...zs) - Math.min(...zs) + 1) * vak,
    (Math.max(...lagen) + 1) * T.kit.laagHoogte * 2,
  );
  const afstand = breed * 1.5 + 2;

  T.stuur.target.set(midX, Math.max(...lagen) * T.kit.laagHoogte * 0.4, midZ);
  T.camera.position.set(
    midX + afstand * (h ? 0.55 : 0.95),
    h ? afstand * 0.7 : Math.max(0.7, breed * 0.14),
    midZ + afstand * (h ? 0.7 : 0.3),
  );
  T.stuur.update();
}, [naam, hoogte]);

for (const naam of namen) {
  const kaal = naam.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  for (const [hoogte, achtervoegsel] of [[1, 'boven'], [0, 'opzij']]) {
    await richt(naam, hoogte);
    await pagina.waitForTimeout(350);
    await pagina.locator('.doek').screenshot({ path: join(UIT, `${kaal}-${achtervoegsel}.png`) });
  }
  console.log(`${naam.padEnd(34)} → docs/bouwsels/${kaal}-{boven,opzij}.png`);
}

await browser.close();
server.close();

console.log(`\n${namen.length} bouwsels, ${namen.length * 2} plaatjes. Kijk ernaar.`);
