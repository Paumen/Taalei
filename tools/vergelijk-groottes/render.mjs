/**
 * Rendert per groep uit groups.json vergelijkbare assets uit verschillende
 * kits naast elkaar, op ware grootte tegen een raster van 1 unit. De
 * schermafbeeldingen komen in docs/asset_size_review/.
 *
 * Draaien vanuit de repo-root:
 *   NODE_PATH=$(npm root -g) node tools/vergelijk-groottes/render.mjs
 *
 * Gebruikt de globale npm-installaties van three en playwright.
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');
const THREE = path.join(execSync('npm root -g').toString().trim(), 'three');
const UIT = path.join(ROOT, 'docs', 'asset_size_review');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  const fp = p.startsWith('/three/') ? path.join(THREE, p.slice(7)) : path.join(ROOT, p);
  try {
    if (!existsSync(fp) || !statSync(fp).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
    createReadStream(fp).pipe(res);
  } catch { res.writeHead(500); res.end(); }
});
await new Promise((r) => server.listen(8931, r));

const groups = JSON.parse(readFileSync(path.join(HIER, 'groups.json'), 'utf8'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 760 } });
page.on('pageerror', (err) => console.log('  [fout]', err.message));

for (const naam of Object.keys(groups)) {
  await page.goto(`http://127.0.0.1:8931/tools/vergelijk-groottes/index.html?group=${naam}`);
  await page.waitForFunction('window.KLAAR === true', null, { timeout: 30000 });
  await page.screenshot({ path: path.join(UIT, `${naam}.png`) });
  console.log('ok', naam);
}
await browser.close();
server.close();
