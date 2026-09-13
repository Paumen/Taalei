#!/usr/bin/env node
// build-thumbs.mjs — card thumbnails for the catalogue, rendered by model-viewer itself.
//
// A card used to carry a live <model-viewer>; with 1200 cards that meant sixty-odd WebGL
// scenes and as many .glb downloads per screenful. Now the card shows a WebP and the
// live viewer is kept for the model panel. The thumbnails come out of the same
// model-viewer build, environment images, exposure and camera the panel uses, so a card
// and the panel behind it show the same picture.
//
// Two files per model: <name>.webp (soft sky, the default) and <name>.flat.webp (the
// Flat mode: bake only). A model is re-rendered when its .glb changed; the hashes live in
// catalog/thumbs.json, which the page also reads to know which cards have a thumbnail
// and which version to fetch.
//
//   node catalog/tools/build-thumbs.mjs [--kit slug] [--force] [--jobs n] [--limit n] [--no-prune]

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CATALOG_DIR = join(ROOT, 'catalog');
const THUMB_DIR = join(CATALOG_DIR, 'thumbs');
const MANIFEST = join(CATALOG_DIR, 'thumbs.json');

// 256 px: sharp on a 2x screen at the card's 112 px minimum, and small enough that a
// screenful of cards weighs less than one of the models it replaces.
const SIZE = 256;
const QUALITY = 0.82;
const LOAD_TIMEOUT = 90_000;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
if (flag('--help') || flag('-h')) {
  console.log(`build-thumbs.mjs [--kit slug] [--force] [--jobs n] [--limit n] [--no-prune]
  --kit slug   only this kit
  --force      re-render even when the .glb is unchanged
  --jobs n     browser pages rendering in parallel (default 2)
  --limit n    stop after n models (for a trial run)
  --no-prune   keep thumbnails of models that left the catalogue`);
  process.exit(0);
}
const onlyKit = value('--kit', null);
const force = flag('--force');
const jobs = Math.max(1, Number(value('--jobs', 2)) || 1);
const limit = Number(value('--limit', 0)) || 0;
const prune = !flag('--no-prune');

const catalog = JSON.parse(readFileSync(join(CATALOG_DIR, 'catalog.json'), 'utf8'));
const manifest = existsSync(MANIFEST)
  ? JSON.parse(readFileSync(MANIFEST, 'utf8'))
  : { size: SIZE, models: {} };
if (manifest.size !== SIZE) {
  console.log(`thumbnail size changed (${manifest.size} → ${SIZE}): everything re-renders`);
  manifest.models = {};
  manifest.size = SIZE;
}

const hashOf = (buffer) => createHash('sha256').update(buffer).digest('hex').slice(0, 10);
const files = (m) => ({
  soft: join(THUMB_DIR, m.kit, `${m.name}.webp`),
  flat: join(THUMB_DIR, m.kit, `${m.name}.flat.webp`),
});

const todo = [];
let unchanged = 0;
let missingGlb = 0;
for (const m of catalog.models) {
  if (onlyKit && m.kit !== onlyKit) continue;
  const id = `${m.kit}/${m.name}`;
  const glbPath = join(ROOT, 'kits', 'workfiles', m.kit, `${m.name}.glb`);
  if (!existsSync(glbPath)) { console.warn(`! no .glb for ${id}`); missingGlb++; continue; }
  const glb = hashOf(readFileSync(glbPath));
  const own = files(m);
  const have = manifest.models[id];
  if (!force && have?.glb === glb && existsSync(own.soft) && existsSync(own.flat)) { unchanged++; continue; }
  todo.push({ id, kit: m.kit, name: m.name, glb, ...own });
}
const queue = limit ? todo.slice(0, limit) : todo;
console.log(`${catalog.models.length} models: ${unchanged} up to date, ${queue.length} to render${limit && todo.length > limit ? ` (of ${todo.length})` : ''}`);

// Thumbnails of models that are no longer in the catalogue only take up space.
if (prune && !onlyKit && existsSync(THUMB_DIR)) {
  const known = new Set(catalog.models.map((m) => `${m.kit}/${m.name}`));
  let pruned = 0;
  for (const kit of readdirSync(THUMB_DIR)) {
    const dir = join(THUMB_DIR, kit);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      const name = file.replace(/(\.flat)?\.webp$/, '');
      if (known.has(`${kit}/${name}`)) continue;
      rmSync(join(dir, file));
      pruned++;
    }
    if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
  }
  for (const id of Object.keys(manifest.models)) if (!known.has(id)) delete manifest.models[id];
  if (pruned) console.log(`pruned ${pruned} stale thumbnail file(s)`);
}

if (queue.length === 0) {
  writeManifest();
  console.log('nothing to render');
  process.exit(missingGlb ? 1 : 0);
}

// The page needs the repo as a site: model-viewer from catalog/vendor, the two
// environment images from catalog/, and the .glb files with the colormap next to them.
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream',
};
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__thumbs.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(PAGE);
  }
  const abs = resolve(ROOT, `.${decodeURIComponent(url.pathname)}`);
  if (!abs.startsWith(ROOT) || !existsSync(abs) || !statSync(abs).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream' });
  res.end(readFileSync(abs));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// The two viewers mirror attachViewer() and setLighting() in catalog.js. Keep them in
// step: a thumbnail lit differently from the panel is a card that lies.
const PAGE = `<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; background: transparent; }
  model-viewer { width: ${SIZE}px; height: ${SIZE}px; display: block; --poster-color: transparent; }
</style>
<model-viewer id="soft" camera-orbit="35deg 68deg auto" shadow-softness="0.9" tone-mapping="neutral"
  environment-image="/catalog/zachte-omgeving.png" shadow-intensity="0.6" exposure="1.5"
  interaction-prompt="none" disable-zoom loading="eager"></model-viewer>
<model-viewer id="flat" camera-orbit="35deg 68deg auto" shadow-softness="0.9" tone-mapping="neutral"
  environment-image="/catalog/effen-omgeving.png" shadow-intensity="0" exposure="1.3"
  interaction-prompt="none" disable-zoom loading="eager"></model-viewer>
<script type="module" src="/catalog/vendor/model-viewer.min.js"></script>
<script type="module">
const viewers = [document.querySelector('#soft'), document.querySelector('#flat')];
const once = (el, type, timeout) => new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error(type + ' timed out')), timeout);
  el.addEventListener(type, () => { clearTimeout(t); ok(); }, { once: true });
});
const frames = (n) => new Promise((r) => { const step = () => (n-- > 0 ? requestAnimationFrame(step) : r()); step(); });
await customElements.whenDefined('model-viewer');
window.render = async (src, quality, timeout) => {
  const loads = viewers.map((v) => once(v, 'load', timeout));
  for (const v of viewers) v.src = src;
  await Promise.all(loads);
  // load fires when the scene is built, not when the first frame with the new model
  // has been drawn into this element's canvas; give the renderer two frames.
  await frames(3);
  return viewers.map((v) => v.toDataURL('image/webp', quality).split(',')[1]);
};
window.ready = true;
</script>`;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
});

let done = 0;
let failed = 0;
const total = queue.length;
const started = Date.now();

async function worker() {
  const page = await browser.newPage({ viewport: { width: SIZE * 2 + 40, height: SIZE + 20 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('  [page error]', e.message));
  await page.goto(`${ORIGIN}/__thumbs.html`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: LOAD_TIMEOUT });
  for (;;) {
    const item = queue.shift();
    if (!item) break;
    const src = `/kits/workfiles/${encodeURIComponent(item.kit)}/${encodeURIComponent(item.name)}.glb`;
    try {
      const [soft, flat] = await page.evaluate(
        ([s, q, t]) => window.render(s, q, t), [src, QUALITY, LOAD_TIMEOUT],
      );
      const softBuf = Buffer.from(soft, 'base64');
      const flatBuf = Buffer.from(flat, 'base64');
      mkdirSync(dirname(item.soft), { recursive: true });
      writeFileSync(item.soft, softBuf);
      writeFileSync(item.flat, flatBuf);
      manifest.models[item.id] = { glb: item.glb, v: hashOf(Buffer.concat([softBuf, flatBuf])) };
      done++;
      if (done % 25 === 0 || done + failed === total) {
        const s = (Date.now() - started) / 1000;
        console.log(`  ${done} rendered, ${failed} failed, ${s.toFixed(0)} s`);
      }
    } catch (e) {
      failed++;
      console.error(`  x ${item.id}: ${e.message.split('\n')[0]}`);
      // a model that hangs the viewer must not poison the next one on this page
      await page.reload();
      await page.waitForFunction(() => window.ready === true, null, { timeout: LOAD_TIMEOUT });
    }
  }
  await page.close();
}

await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, worker));
await browser.close();
server.close();
writeManifest();

const seconds = ((Date.now() - started) / 1000).toFixed(0);
console.log(`${done} thumbnail pair(s) rendered in ${seconds} s${failed ? `, ${failed} failed` : ''} → catalog/thumbs, catalog/thumbs.json`);
process.exitCode = failed || missingGlb ? 1 : 0;

function writeManifest() {
  const sorted = Object.fromEntries(Object.entries(manifest.models).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, JSON.stringify({ size: manifest.size, models: sorted }, null, 1) + '\n');
}
