import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashOf, stampPages } from './stamp.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CATALOG_DIR = join(ROOT, 'catalog');
const THUMB_DIR = join(CATALOG_DIR, 'build', 'thumbs');
const TILE_DIR = join(ROOT, 'kits', '.cache', 'thumbs');
const MANIFEST = join(CATALOG_DIR, 'build', 'thumbs.json');

const SIZE = 128;
const QUALITY = 0.82;
const LOAD_TIMEOUT = 90_000;
const NO_KIND = 'none';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
if (flag('--help') || flag('-h')) {
  console.log(`build-thumbs.mjs [--kit slug] [--force] [--jobs n] [--limit n] [--no-prune]
  --kit slug   only render models of this kit
  --force      re-render even when the .glb is unchanged
  --jobs n     browser pages rendering in parallel (default 2)
  --limit n    stop after n renders (for a trial run)
  --no-prune   keep sheets of kinds that left the catalog`);
  process.exit(0);
}
const onlyKit = value('--kit', null);
const force = flag('--force');
const jobs = Math.max(1, Number(value('--jobs', 2)) || 1);
const limit = Number(value('--limit', 0)) || 0;
const prune = !flag('--no-prune');

const catalog = JSON.parse(readFileSync(join(CATALOG_DIR, 'build', 'catalog.json'), 'utf8'));
const read = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const sameSize = read.size === SIZE && read.sheets;
if (!sameSize && read.size) console.log(`thumbnail size or layout changed (${read.size} → ${SIZE}): everything re-renders`);
const old = sameSize ? read : { size: SIZE, sheets: {}, models: {} };

const tiles = (id) => ({ soft: join(TILE_DIR, `${id}.png`), flat: join(TILE_DIR, `${id}.flat.png`) });
const hasTiles = (id) => existsSync(tiles(id).soft) && existsSync(tiles(id).flat);
const sheetFile = (kind, flat) => join(THUMB_DIR, `${kind}${flat ? '.flat' : ''}.webp`);
const sheetUrl = (kind, flat) => `/catalog/build/thumbs/${encodeURIComponent(kind)}${flat ? '.flat' : ''}.webp`;

const perKind = new Map();
const toRender = [];
const toCut = new Map();
let missingGlb = 0;
for (const m of catalog.models) {
  const id = `${m.kit}/${m.name}`;
  const glbPath = join(ROOT, 'kits', 'workfiles', m.kit, `${m.name}.glb`);
  if (!existsSync(glbPath)) { console.warn(`! no .glb for ${id}`); missingGlb++; continue; }
  const model = { id, kit: m.kit, name: m.name, kind: m.kind ?? NO_KIND, glb: m.hash ?? hashOf(readFileSync(glbPath)) };
  if (!perKind.has(model.kind)) perKind.set(model.kind, []);
  perKind.get(model.kind).push(model);

  const was = old.models[id];
  const current = was?.glb === model.glb;
  if (current && !force && hasTiles(id)) continue;
  if (current && !force && was.at !== undefined
    && existsSync(sheetFile(was.kind, false)) && existsSync(sheetFile(was.kind, true))) {
    if (!toCut.has(was.kind)) toCut.set(was.kind, []);
    toCut.get(was.kind).push({ id, at: was.at, cols: old.sheets[was.kind].cols });
    continue;
  }
  if (onlyKit && m.kit !== onlyKit) continue;
  toRender.push(model);
}
for (const list of perKind.values()) list.sort((a, b) => a.id.localeCompare(b.id));
const queue = limit ? toRender.slice(0, limit) : toRender;
const cutCount = [...toCut.values()].reduce((n, l) => n + l.length, 0);
console.log(`${catalog.models.length} models in ${perKind.size} kinds: ${queue.length} to render${limit && toRender.length > limit ? ` (of ${toRender.length})` : ''}, ${cutCount} to cut from old sheets`);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.bin': 'application/octet-stream',
};
const PAGE = `<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; background: transparent; }
  model-viewer { width: ${SIZE}px; height: ${SIZE}px; display: block; --poster-color: transparent; }
</style>
<model-viewer id="soft" camera-orbit="35deg 68deg auto" shadow-softness="0.9" tone-mapping="neutral"
  environment-image="/catalog/app/zachte-omgeving.png" shadow-intensity="0.6" exposure="1.5"
  interaction-prompt="none" disable-zoom loading="eager"></model-viewer>
<model-viewer id="flat" camera-orbit="35deg 68deg auto" shadow-softness="0.9" tone-mapping="neutral"
  environment-image="/catalog/app/effen-omgeving.png" shadow-intensity="0" exposure="1.3"
  interaction-prompt="none" disable-zoom loading="eager"></model-viewer>
<script type="module" src="/catalog/app/vendor/model-viewer.min.js"></script>
<script type="module">
const viewers = [document.querySelector('#soft'), document.querySelector('#flat')];
const once = (el, type, timeout) => new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error(type + ' timed out')), timeout);
  el.addEventListener(type, () => { clearTimeout(t); ok(); }, { once: true });
});
const frames = (n) => new Promise((r) => { const step = () => (n-- > 0 ? requestAnimationFrame(step) : r()); step(); });
const image = (src) => new Promise((ok, fail) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => fail(new Error('cannot load ' + src.slice(0, 80)));
  img.src = src;
});
const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const base64 = (c, type, quality) => c.toDataURL(type, quality).split(',')[1];
await customElements.whenDefined('model-viewer');
window.render = async (src, timeout) => {
  const loads = viewers.map((v) => once(v, 'load', timeout));
  for (const v of viewers) v.src = src;
  await Promise.all(loads);
  await frames(3);
  return viewers.map((v) => v.toDataURL('image/png').split(',')[1]);
};
window.compose = async (pngs, cols, rows, size, quality) => {
  const sheet = canvas(cols * size, rows * size);
  const ctx = sheet.getContext('2d');
  for (const [i, png] of pngs.entries()) {
    if (png) ctx.drawImage(await image('data:image/png;base64,' + png), (i % cols) * size, Math.floor(i / cols) * size, size, size);
  }
  return base64(sheet, 'image/webp', quality);
};
window.cut = async (src, spots, cols, size) => {
  const img = await image(src);
  const tile = canvas(size, size);
  const ctx = tile.getContext('2d');
  return spots.map((at) => {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, (at % cols) * size, Math.floor(at / cols) * size, size, size, 0, 0, size, size);
    return base64(tile, 'image/png');
  });
};
window.ready = true;
</script>`;

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

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
});
const openPage = async () => {
  const page = await browser.newPage({ viewport: { width: SIZE * 2 + 40, height: SIZE + 20 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('  [page error]', e.message));
  await page.goto(`${ORIGIN}/__thumbs.html`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: LOAD_TIMEOUT });
  return page;
};
const writeTile = (path, b64) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(b64, 'base64'));
};

const helper = await openPage();
for (const [kind, list] of toCut) {
  const cols = list[0].cols;
  const spots = list.map((t) => t.at);
  const [soft, flat] = await Promise.all([false, true].map((f) =>
    helper.evaluate(([s, a, c, z]) => window.cut(s, a, c, z), [sheetUrl(kind, f), spots, cols, SIZE])));
  list.forEach((t, i) => { writeTile(tiles(t.id).soft, soft[i]); writeTile(tiles(t.id).flat, flat[i]); });
}

let done = 0;
let failed = 0;
const total = queue.length;
const started = Date.now();
const renderedIds = new Set();

async function worker() {
  const page = await openPage();
  for (;;) {
    const item = queue.shift();
    if (!item) break;
    const src = `/kits/workfiles/${encodeURIComponent(item.kit)}/${encodeURIComponent(item.name)}.glb`;
    try {
      const [soft, flat] = await page.evaluate(([s, t]) => window.render(s, t), [src, LOAD_TIMEOUT]);
      writeTile(tiles(item.id).soft, soft);
      writeTile(tiles(item.id).flat, flat);
      renderedIds.add(item.id);
      done++;
      if (done % 25 === 0 || done + failed === total) {
        const s = (Date.now() - started) / 1000;
        console.log(`  ${done} rendered, ${failed} failed, ${s.toFixed(0)} s`);
      }
    } catch (e) {
      failed++;
      rmSync(tiles(item.id).soft, { force: true });
      rmSync(tiles(item.id).flat, { force: true });
      console.error(`  x ${item.id}: ${e.message.split('\n')[0]}`);
      await page.reload();
      await page.waitForFunction(() => window.ready === true, null, { timeout: LOAD_TIMEOUT });
    }
  }
  await page.close();
}
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, worker));

const manifest = { size: SIZE, sheets: {}, models: {} };
let composed = 0;
mkdirSync(THUMB_DIR, { recursive: true });
for (const kind of [...perKind.keys()].sort()) {
  const members = perKind.get(kind).filter((m) => hasTiles(m.id));
  if (!members.length) continue;
  const cols = Math.ceil(Math.sqrt(members.length));
  const rows = Math.ceil(members.length / cols);
  const key = hashOf(`${SIZE} ${QUALITY} ${members.map((m) => `${m.id}:${m.glb}`).join(' ')}`);
  const was = old.sheets[kind];
  let sheet = was;
  const rendered = members.some((m) => renderedIds.has(m.id));
  if (force || rendered || was?.key !== key || !existsSync(sheetFile(kind, false)) || !existsSync(sheetFile(kind, true))) {
    const hashes = [];
    for (const flat of [false, true]) {
      const pngs = members.map((m) => readFileSync(flat ? tiles(m.id).flat : tiles(m.id).soft).toString('base64'));
      const webp = Buffer.from(await helper.evaluate(([p, c, r, z, q]) => window.compose(p, c, r, z, q),
        [pngs, cols, rows, SIZE, QUALITY]), 'base64');
      writeFileSync(sheetFile(kind, flat), webp);
      hashes.push(hashOf(webp));
    }
    sheet = { cols, rows, key, v: hashes[0], f: hashes[1] };
    composed++;
  }
  manifest.sheets[kind] = sheet;
  members.forEach((m, at) => { manifest.models[m.id] = { glb: m.glb, kind, at }; });
}
await helper.close();
await browser.close();
server.close();

if (prune) {
  const keep = new Set(Object.keys(manifest.sheets).flatMap((k) => [`${k}.webp`, `${k}.flat.webp`]));
  let pruned = 0;
  for (const entry of readdirSync(THUMB_DIR)) {
    if (keep.has(entry)) continue;
    rmSync(join(THUMB_DIR, entry), { recursive: true, force: true });
    pruned++;
  }
  if (pruned) console.log(`pruned ${pruned} stale entr${pruned === 1 ? 'y' : 'ies'} from catalog/build/thumbs`);
}

const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(MANIFEST, JSON.stringify({ size: SIZE, sheets: sorted(manifest.sheets), models: sorted(manifest.models) }, null, 1) + '\n');
stampPages();

const seconds = ((Date.now() - started) / 1000).toFixed(0);
console.log(`${done} rendered${failed ? `, ${failed} failed` : ''}, ${composed} of ${Object.keys(manifest.sheets).length} kind sheets rebuilt in ${seconds} s → catalog/build/thumbs, catalog/build/thumbs.json`);
process.exitCode = failed || missingGlb ? 1 : 0;
