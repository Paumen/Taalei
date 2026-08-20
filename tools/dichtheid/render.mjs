/**
 * Rangschikt de kleine props op driehoeken per kubieke unit — dichtheid tegen
 * de wérkelijke afmeting, niet tegen de budgetcel van `driehoekenPerUnit`
 * (die klemt op minimaal één cel, waardoor elk model onder 1×1×1 op zijn ruwe
 * driehoekental uitkomt). Rendert de kop en de staart als contactvel.
 *
 * Draaien vanuit de repo-root:
 *   NODE_PATH=$(npm root -g) node tools/dichtheid/render.mjs
 *
 * Gebruikt de globale npm-installaties van three en playwright.
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');
const THREE = path.join(execSync('npm root -g').toString().trim(), 'three');
const UIT = path.join(ROOT, 'docs', 'dichtheid');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' };

/* de selectie: alles dat in een cel van 1×1×1 past, zonder terrein, bouwpakket,
 * zee en grot — dat zijn de groepen waar "prop" niet op slaat */
const UIT_GROEPEN = ['terrein', 'bouwpakket', 'zee', 'grot'];
const AANTAL = 25;

const catalogus = JSON.parse(readFileSync(path.join(ROOT, 'kits', 'catalog.json'), 'utf8'));
const pool = catalogus.modellen
  .filter((m) => m.wdh.every((maat) => maat > 0 && maat < 1)
    && !UIT_GROEPEN.some((g) => m.groep.startsWith(g)))
  .map((m) => {
    const volume = m.wdh[0] * m.wdh[1] * m.wdh[2];
    return { ...m, volume, dichtheid: m.driehoeken / volume };
  })
  .sort((a, b) => b.dichtheid - a.dichtheid || a.id.localeCompare(b.id));

const kort = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));
const naarItem = (m, rang) => ({
  pad: m.pad.replace(/^kits\//, ''),
  regels: [
    `${rang}. ${m.naam}`,
    `${m.kit} · ${m.driehoeken.toLocaleString('nl-NL')} tri`,
    `${m.wdh.map((v) => v.toFixed(2)).join(' × ')} · ${kort(m.dichtheid)}/u³`,
  ],
});

const sets = {
  top25: { items: pool.slice(0, AANTAL).map((m, i) => naarItem(m, i + 1)) },
  bottom25: { items: pool.slice(-AANTAL).map((m, i) => naarItem(m, pool.length - AANTAL + i + 1)) },
};

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
const browser = await chromium.launch();

let mislukt = 0;
for (const [naam, set] of Object.entries(sets)) {
  /* een verse pagina per set: addInitScript stapelt anders op */
  const page = await browser.newPage({ viewport: { width: 1700, height: 1560 } });
  page.on('pageerror', (err) => console.log('  [fout]', err.message));
  await page.addInitScript((s) => { window.SELECTIE = s; }, set);
  await page.goto('http://127.0.0.1:8932/tools/dichtheid/index.html');
  /* FOUT wordt gezet door index.html bij een scriptfout, zodat we niet op de
   * volle timeout hoeven te wachten */
  await page.waitForFunction('window.KLAAR === true || window.FOUT === true', null, { timeout: 60000 });
  if (await page.evaluate('window.FOUT === true')) {
    mislukt++;
    console.log('MISLUKT', naam);
    await page.close();
    continue;
  }
  await page.screenshot({ path: path.join(UIT, `${naam}.png`) });
  console.log('ok', naam, `(${set.items.length})`);
  await page.close();
}
if (mislukt) process.exitCode = 1;
await browser.close();
server.close();
