// Headless preview renders van kit-assets en blockouts, tegen witte achtergrond.
//
// Eenmalig:   cd tools/asset-preview && npm install three@0.160.0 playwright-core
// Gebruik:    node shot.mjs <spec.json> <uit.png>
//
// De spec somt items op: { "glb": "/kits/…/model.glb" } of { "blockout": "A" },
// elk met x/z-offset, rotatie en label. Zie spec-blockouts.json als voorbeeld.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const HERE = import.meta.dirname;
const REPO = resolve(HERE, '..', '..');
const [spec, out] = process.argv.slice(2);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary' };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  for (const root of [HERE, REPO]) {
    try {
      const data = await readFile(join(root, path));
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
      res.end(data);
      return;
    } catch {}
  }
  res.writeHead(404); res.end('not found: ' + path);
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

// In deze omgeving staat Chromium vast op /opt/pw-browsers; val terug op wat
// playwright zelf vindt als dat pad er niet is.
const executablePath = process.env.CHROMIUM_PATH
  ?? '/opt/pw-browsers/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/render.html?spec=/${spec}`);
await page.waitForFunction('window.__done === true', { timeout: 60000 });
const canvas = await page.$('canvas');
await canvas.screenshot({ path: out });
await browser.close();
server.close();
console.log('geschreven:', out);
