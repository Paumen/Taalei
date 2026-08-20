/**
 * Schiet de WebGPU-scène als docs/webgpu_scene/scene.png.
 *
 * Draaien vanuit de repo-root:
 *   NODE_PATH=$(npm root -g) node tools/webgpu-scene/render.mjs
 *
 * Chromium krijgt hier --enable-unsafe-swiftshader mee: deze omgeving heeft geen
 * GPU, en zonder die vlag komt requestAdapter() met niets terug. Op een machine
 * mét GPU is de vlag overbodig; in de browser zelf is hij dat sowieso.
 */
import { chromium } from 'playwright';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');
const UIT = path.join(ROOT, 'docs', 'webgpu_scene');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.glb': 'model/gltf-binary' };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.normalize(path.join(ROOT, p));
  if (!fp.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    if (!existsSync(fp) || !statSync(fp).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
    createReadStream(fp).pipe(res);
  } catch { res.writeHead(500); res.end(); }
});
await new Promise((r) => server.listen(8933, r));

mkdirSync(UIT, { recursive: true });
const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text()); });
page.on('pageerror', (err) => console.log('  [fout]', err.message));

await page.goto('http://127.0.0.1:8933/tools/webgpu-scene/index.html');
await page.waitForFunction('window.KLAAR === true', null, { timeout: 120000 });

const doel = path.join(UIT, 'scene.png');
await page.screenshot({ path: doel });
console.log('ok', path.relative(ROOT, doel));

await browser.close();
server.close();
