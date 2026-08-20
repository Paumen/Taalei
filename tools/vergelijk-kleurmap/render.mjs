/**
 * Zet de props uit props.json en props-b.json naast elkaar met de atlas van vóór
 * de overname (colormap-v1.png) en met de atlas die de kits nu meedragen, en
 * schrijft de bladen weg in docs/kleurmap_review/.
 *
 * Draaien vanuit de repo-root:
 *   NODE_PATH=$(npm root -g) node tools/vergelijk-kleurmap/render.mjs
 *
 * Zonder argument komen beide bladen langs; met een naam erachter alleen dat
 * blad, bijvoorbeeld `... render.mjs props-vergelijking-b`.
 *
 * Gebruikt de globale npm-installaties van three en playwright, net als
 * tools/vergelijk-groottes/render.mjs.
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');
const THREE = path.join(execSync('npm root -g').toString().trim(), 'three');
const UIT = path.join(ROOT, 'docs', 'kleurmap_review');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.glb': 'model/gltf-binary' };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const drie = p.startsWith('/three/');
  const basis = drie ? THREE : ROOT;
  const fp = path.normalize(path.join(basis, drie ? p.slice(7) : p));
  /* alleen bestanden binnen de repo of het three-pakket serveren */
  if (!fp.startsWith(basis + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    if (!existsSync(fp) || !statSync(fp).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
    createReadStream(fp).pipe(res);
  } catch { res.writeHead(500); res.end(); }
});
await new Promise((r) => server.listen(8932, r));

mkdirSync(UIT, { recursive: true });

const BLADEN = [
  { naam: 'props-vergelijking', lijst: 'props.json' },
  { naam: 'props-vergelijking-b', lijst: 'props-b.json' },
];
const gevraagd = process.argv[2];
const bladen = gevraagd ? BLADEN.filter((b) => b.naam === gevraagd) : BLADEN;
if (bladen.length === 0) throw new Error(`onbekend blad: ${gevraagd}`);

const browser = await chromium.launch();

for (const blad of bladen) {
  const page = await browser.newPage({ viewport: { width: 1880, height: 1200 } });
  page.on('pageerror', (err) => console.log('  [fout]', err.message));
  await page.goto(`http://127.0.0.1:8932/tools/vergelijk-kleurmap/index.html?lijst=${blad.lijst}`);
  /* FOUT wordt gezet door index.html bij een scriptfout, zodat we niet op de
   * volle timeout hoeven te wachten */
  await page.waitForFunction('window.KLAAR === true || window.FOUT === true', null, { timeout: 180000 });

  if (await page.evaluate('window.FOUT === true')) {
    console.log('MISLUKT', blad.naam);
    process.exitCode = 1;
  } else {
    const doel = path.join(UIT, `${blad.naam}.png`);
    await page.locator('#blad').screenshot({ path: doel });
    console.log('ok', path.relative(ROOT, doel));
  }
  await page.close();
}

await browser.close();
server.close();
