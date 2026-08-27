import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Rendert elk asset uit sets.json als blad van acht tegels (tools/renders/index.html).
// Gebruik: node tools/renders/render.mjs <sets.json> <uitdir>
// sets.json: { set1: [{kit,name,path}], set2: [...], set3: [...] } met absolute paden.
const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');
const THREE = path.join(execSync('npm root -g').toString().trim(), 'three');
const [setsArg, uitArg] = process.argv.slice(2);
const SETS = JSON.parse(readFileSync(path.resolve(setsArg), 'utf8'));
const UIT = path.resolve(uitArg);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg' };

// Assets staan deels buiten de repo (uitgepakte bronkits); serveer daarom op
// absolute paden onder /fs/, en three onder /three/.
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let fp;
  if (p.startsWith('/three/')) fp = path.normalize(path.join(THREE, p.slice(7)));
  else if (p.startsWith('/fs/')) fp = path.normalize(p.slice(3));
  else fp = path.normalize(path.join(ROOT, p));
  try {
    if (!existsSync(fp) || !statSync(fp).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    createReadStream(fp).pipe(res);
  } catch { res.writeHead(500); res.end(); }
});
await new Promise((r) => server.listen(8932, r));

const werk = [];
const gezien = new Set();
for (const [set, items] of Object.entries(SETS)) {
  mkdirSync(path.join(UIT, set), { recursive: true });
  for (const it of items) {
    const id = `${set}/${it.kit.replaceAll('/', '_')}__${it.name.replaceAll('/', '_')}`;
    if (gezien.has(id)) throw new Error(`dubbel asset-id ${id}: hernoem een van beide in sets.json`);
    gezien.add(id);
    werk.push({ set, ...it });
  }
}

const browser = await chromium.launch({ args: ['--use-gl=angle'] });
let mislukt = 0;
async function worker() {
  const page = await browser.newPage({ viewport: { width: 900, height: 460 } });
  for (;;) {
    const t = werk.shift();
    if (!t) break;
    const uit = path.join(UIT, t.set, `${t.kit.replaceAll('/', '_')}__${t.name.replaceAll('/', '_')}.png`);
    if (existsSync(uit)) continue;
    try {
      await page.goto(`http://127.0.0.1:8932/tools/renders/index.html?file=${encodeURIComponent('/fs' + t.path)}`);
      await page.waitForFunction('window.KLAAR === true || window.FOUT === true', null, { timeout: 45000 });
      if (await page.evaluate('window.FOUT === true')) throw new Error(await page.evaluate('window.FOUTMSG'));
      await page.locator('#sheet').screenshot({ path: uit });
    } catch (e) {
      mislukt++;
      console.log('MISLUKT', t.set, t.kit, t.name, String(e).slice(0, 120));
    }
  }
  await page.close();
}
await Promise.all(Array.from({ length: 4 }, worker));
console.log('klaar, mislukt:', mislukt);
if (mislukt) process.exitCode = 1;
await browser.close();
server.close();
