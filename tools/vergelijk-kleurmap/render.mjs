/**
 * Zet de props uit props.json en props-b.json naast elkaar met de atlas van vóór
 * de overname (colormap-v1.png) en met de atlas die de kits nu dragen, en
 * schrijft de bladen weg in docs/kleurmap_review/.
 *
 * Draaien vanuit de repo-root:
 *   NODE_PATH=$(npm root -g) node tools/vergelijk-kleurmap/render.mjs
 *
 * Zonder argument komen beide bladen langs; met een naam erachter alleen dat
 * blad, bijvoorbeeld `... render.mjs props-vergelijking-b`.
 *
 * Elke tegel wordt geschoten met dezelfde <model-viewer> als kits/catalog.js
 * gebruikt — zelfde omgeving, belichting, belichtingssterkte en blik. Dat is de
 * hele bedoeling: een oordeel over een kleur moet gaan over de kleur zoals hij
 * in de catalogus verschijnt, niet over de belichting van een eigen scène.
 *
 * De oude atlas komt in beeld zonder de kits aan te raken: elk verzoek onder
 * /voor/ wijst naar dezelfde bestanden, behalve Textures/colormap.png — daar gaat
 * colormap-v1.png terug. De .glb's wijzen met een relatief pad naar die textuur,
 * dus dan laadt hetzelfde model met de andere atlas.
 */
import { chromium } from 'playwright';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');
const UIT = path.join(ROOT, 'docs', 'kleurmap_review');
const OUDE_ATLAS = path.join(HIER, 'colormap-v1.png');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.glb': 'model/gltf-binary' };

const server = http.createServer((req, res) => {
  const gevraagd = decodeURIComponent(req.url.split('?')[0]);
  const voor = gevraagd.startsWith('/voor/');
  const p = voor ? gevraagd.slice('/voor'.length) : gevraagd;
  const fp = voor && p.endsWith('/Textures/colormap.png')
    ? OUDE_ATLAS
    : path.normalize(path.join(ROOT, p));
  /* alleen bestanden binnen de repo serveren */
  if (!fp.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    if (!existsSync(fp) || !statSync(fp).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
    createReadStream(fp).pipe(res);
  } catch { res.writeHead(500); res.end(); }
});
await new Promise((r) => server.listen(8932, r));
const url = (p) => `http://127.0.0.1:8932${p}`;

const BLADEN = [
  { naam: 'props-vergelijking', lijst: 'props.json' },
  { naam: 'props-vergelijking-b', lijst: 'props-b.json' },
];
const gevraagd = process.argv[2];
const bladen = gevraagd ? BLADEN.filter((b) => b.naam === gevraagd) : BLADEN;
if (bladen.length === 0) throw new Error(`onbekend blad: ${gevraagd}`);

mkdirSync(UIT, { recursive: true });
const browser = await chromium.launch();

for (const blad of bladen) {
  const lijst = JSON.parse(readFileSync(path.join(HIER, blad.lijst), 'utf8'));

  /* -- tegels schieten ---------------------------------------------------- */
  const tegel = await browser.newPage({ viewport: { width: 260, height: 260 } });
  tegel.on('pageerror', (err) => console.log('  [fout]', err.message));
  await tegel.goto(url('/tools/vergelijk-kleurmap/tegel.html'));
  const viewer = tegel.locator('#viewer');

  const schiet = async (src) => {
    await tegel.evaluate((s) => window.laad(s), src);
    return 'data:image/png;base64,' + (await viewer.screenshot()).toString('base64');
  };

  const kaarten = [];
  for (const prop of lijst.props) {
    kaarten.push({
      label: prop.label,
      id: prop.id,
      voor: await schiet(url(`/voor/kits/${prop.id}.glb`)),
      nu: await schiet(url(`/kits/${prop.id}.glb`)),
    });
  }
  await tegel.close();

  /* -- blad zetten en wegschrijven ---------------------------------------- */
  const pagina = await browser.newPage({ viewport: { width: 1880, height: 1200 } });
  pagina.on('pageerror', (err) => console.log('  [fout]', err.message));
  await pagina.addInitScript(
    (b) => { window.BLAD = b; },
    { titel: lijst.titel, toelichting: lijst.toelichting, kaarten },
  );
  await pagina.goto(url('/tools/vergelijk-kleurmap/blad.html'));
  await pagina.waitForFunction('document.querySelectorAll("#blad .kaart").length > 0');
  const doel = path.join(UIT, `${blad.naam}.png`);
  await pagina.locator('#blad').screenshot({ path: doel });
  await pagina.close();
  console.log('ok', path.relative(ROOT, doel));
}

await browser.close();
server.close();
