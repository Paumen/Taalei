import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');
const THREE = path.join(execSync('npm root -g').toString().trim(), 'three');
const [bronArg, uitArg, paginaArg] = process.argv.slice(2);
const BRON = bronArg ? path.resolve(ROOT, bronArg) : path.join(HIER, 'groups.json');
const UIT = uitArg ? path.resolve(ROOT, uitArg) : path.join(ROOT, 'docs', 'asset_size_review');
const PAGINA = paginaArg ?? 'index.html';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const drie = p.startsWith('/three/');
  const basis = drie ? THREE : ROOT;
  const fp = path.normalize(path.join(basis, drie ? p.slice(7) : p));
  if (!fp.startsWith(basis + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    if (!existsSync(fp) || !statSync(fp).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
    createReadStream(fp).pipe(res);
  } catch { res.writeHead(500); res.end(); }
});
await new Promise((r) => server.listen(8931, r));

mkdirSync(UIT, { recursive: true });
const groups = JSON.parse(readFileSync(BRON, 'utf8'));
const bronUrl = `/${path.relative(ROOT, BRON).split(path.sep).join('/')}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 760 } });
page.on('pageerror', (err) => console.log('  [fout]', err.message));

let mislukt = 0;
for (const naam of Object.keys(groups)) {
  await page.goto(`http://127.0.0.1:8931/tools/vergelijk-groottes/${PAGINA}?group=${naam}&bron=${encodeURIComponent(bronUrl)}`);
  await page.waitForFunction('window.KLAAR === true || window.FOUT === true', null, { timeout: 30000 });
  if (await page.evaluate('window.FOUT === true')) {
    mislukt++;
    console.log('MISLUKT', naam);
    continue;
  }
  // Het canvas bepaalt zelf zijn breedte, dus knippen we precies dat element uit.
  await page.locator('canvas').screenshot({ path: path.join(UIT, `${naam}.png`) });
  console.log('ok', naam);
}
if (mislukt) process.exitCode = 1;
await browser.close();
server.close();
