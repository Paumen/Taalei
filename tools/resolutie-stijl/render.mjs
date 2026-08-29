import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Rendert elk stimulus uit stimuli.json op volle resolutie (2576 px lange zijde).
// Gebruik: node tools/resolutie-stijl/render.mjs [stimuli.json] [uitdir]
const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..', '..');
const THREE = path.join(execSync('npm root -g').toString().trim(), 'three');
const [stimArg, uitArg] = process.argv.slice(2);
const STIM = JSON.parse(readFileSync(path.resolve(stimArg || path.join(HIER, 'stimuli.json')), 'utf8'));
const UIT = path.resolve(uitArg || path.join(ROOT, 'docs', 'resolutie-stijl', 'stimuli', '2576'));
const MAAT = 2576;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const fp = p.startsWith('/three/')
    ? path.normalize(path.join(THREE, p.slice(7)))
    : path.normalize(path.join(ROOT, p));
  try {
    if (!existsSync(fp) || !statSync(fp).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    createReadStream(fp).pipe(res);
  } catch { res.writeHead(500); res.end(); }
});
await new Promise((r) => server.listen(8933, r));

mkdirSync(UIT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
let mislukt = 0;
for (const s of STIM.stimuli) {
  const uit = path.join(UIT, `${s.id}.png`);
  if (existsSync(uit)) continue;
  try {
    await page.goto(`http://127.0.0.1:8933${HIER.slice(ROOT.length)}/viewer.html?maat=${MAAT}&file=${encodeURIComponent('/' + s.model)}`);
    await page.waitForFunction('window.KLAAR === true || window.FOUT === true', null, { timeout: 60000 });
    if (await page.evaluate('window.FOUT === true')) throw new Error(await page.evaluate('window.FOUTMSG'));
    const data = await page.evaluate('document.getElementById("blad").toDataURL("image/png")');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(uit, Buffer.from(data.split(',')[1], 'base64'));
    console.log('ok', s.id);
  } catch (e) {
    mislukt++;
    console.log('MISLUKT', s.id, String(e).slice(0, 140));
  }
}
await browser.close();
server.close();
console.log('klaar, mislukt:', mislukt);
if (mislukt) process.exitCode = 1;
