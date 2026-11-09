import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { editablePrimitives, primitiveMatrix } from '../import/mesh-edit.mjs';

const args = process.argv.slice(2);
if (args.length < 3) {
  console.log(`closeup.mjs <before.glb> <after.glb> <out.png> [--tile px]
Finds every spot where the surface moved between before and after, and draws
each spot zoomed in, before and after side by side from three angles, with
edges. Every spot is drawn: the printed count is the number to look at.`);
  process.exit(0);
}
const [fa, fb, out] = args;
const T = +(args[args.indexOf('--tile') + 1] || 0) || 300;

function points(file) {
  const g = readGlb(file);
  const all = [];
  for (const p of editablePrimitives(g.json)) {
    const M = primitiveMatrix(g.json, p);
    const L = readAccessor(g, p.attributes.POSITION).data;
    for (let i = 0; i < L.length; i += 3) all.push([0, 1, 2].map((r) => M[r] * L[i] + M[4 + r] * L[i + 1] + M[8 + r] * L[i + 2] + M[12 + r]));
  }
  return [...new Map(all.map((p) => [p.map((x) => Math.round(x * 1e5)).join(','), p])).values()];
}
const PA = points(fa), PB = points(fb);
const cell = 0.002;
const grid = (P) => {
  const g = new Map();
  for (const p of P) { const k = p.map((x) => Math.floor(x / cell)).join(','); (g.get(k) ?? g.set(k, []).get(k)).push(p); }
  return g;
};
const nearest = (g, p) => {
  const c = p.map((x) => Math.floor(x / cell));
  let best = Infinity;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++)
    for (const q of g.get([c[0] + i, c[1] + j, c[2] + k].join(',')) ?? []) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
  return best;
};
const GA = grid(PA), GB = grid(PB);
const moved = [...PB.filter((p) => nearest(GA, p) > 0.0003), ...PA.filter((p) => nearest(GB, p) > 0.0003)];
const mn = [0, 1, 2].map((k) => Math.min(...PA.map((p) => p[k]))), mx = [0, 1, 2].map((k) => Math.max(...PA.map((p) => p[k])));
const long = Math.max(...mx.map((x, k) => x - mn[k]));

const box = (ps) => {
  const lo = [0, 1, 2].map((k) => Math.min(...ps.map((q) => q[k]))), hi = [0, 1, 2].map((k) => Math.max(...ps.map((q) => q[k])));
  return { ps, c: lo.map((x, k) => (x + hi[k]) / 2), rad: Math.hypot(...hi.map((x, k) => x - lo[k])) / 2 };
};
function group(link) {
  let rs = moved.map((p) => box([p]));
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < rs.length && !again; i++) for (let j = i + 1; j < rs.length && !again; j++) {
      if (Math.hypot(...rs[i].c.map((x, k) => x - rs[j].c[k])) < rs[i].rad + rs[j].rad + link) {
        rs[i] = box([...rs[i].ps, ...rs[j].ps]); rs.splice(j, 1); again = true;
      }
    }
  }
  return rs;
}
let link = Math.max(0.006, long * 0.04), regions = group(link);
while (regions.length > 12) { link *= 1.6; regions = group(link); }
regions.sort((a, b) => b.ps.length - a.ps.length);
const spec = regions.map((r) => ({ c: r.c, h: Math.min(long * 0.6, Math.max(r.rad * 1.25, 0.012)) }));
console.log(`${moved.length} points moved, ${regions.length} spots drawn in ${out}`);
if (!regions.length) process.exit(0);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'closeup-'));
fs.mkdirSync(path.join(dir, 'Textures'));
fs.copyFileSync(new URL('../../kits/colormap.png', import.meta.url), path.join(dir, 'Textures', 'colormap.png'));
fs.copyFileSync(fa, path.join(dir, 'a.glb'));
fs.copyFileSync(fb, path.join(dir, 'b.glb'));
const three = path.resolve(path.dirname(createRequire(import.meta.url).resolve('three')), '..');
const types = { '.js': 'text/javascript', '.png': 'image/png', '.html': 'text/html' };
const server = http.createServer((q, s) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  const f = p.startsWith('/three/') ? path.join(three, p.slice(7)) : path.join(dir, p);
  if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(s);
}).listen(0);
fs.writeFileSync(path.join(dir, 'index.html'), `<html><body style="margin:0"><canvas id=c></canvas>
<script type=importmap>{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type=module>
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const spec = ${JSON.stringify(spec)}, T = ${T}, views = [[0.35, 0.45, 1], [1, 0.3, -0.25], [-0.3, -0.5, -1]];
const loader = new GLTFLoader(), get = (u) => new Promise((r) => loader.load(u, (g) => r(g.scene)));
const scene = (s) => {
  const sc = new THREE.Scene(); sc.add(s, new THREE.HemisphereLight(0xffffff, 0x888888, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(1, 2, 3); sc.add(d);
  s.traverse((o) => { if (o.isMesh) { o.material.side = THREE.DoubleSide; o.add(new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), new THREE.LineBasicMaterial({ color: 0x111111 }))); } });
  return sc;
};
const both = [scene(await get('/a.glb')), scene(await get('/b.glb'))];
const r = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
r.setSize(T * views.length * 2, T * spec.length); r.setScissorTest(true); r.setClearColor(0xf4f4f0);
spec.forEach((s, row) => views.forEach((v, vi) => both.forEach((sc, k) => {
  const cam = new THREE.OrthographicCamera(-s.h, s.h, s.h, -s.h, -10, 10), d = new THREE.Vector3(...v).normalize();
  cam.position.set(s.c[0] + d.x, s.c[1] + d.y, s.c[2] + d.z); cam.lookAt(...s.c);
  const x = (vi * 2 + k) * T, y = (spec.length - 1 - row) * T; r.setViewport(x, y, T, T); r.setScissor(x, y, T, T); r.render(sc, cam);
})));
window.done = true;
</script></body></html>`);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
await page.waitForFunction('window.done', null, { timeout: 60000 });
await page.locator('canvas').screenshot({ path: out });
await browser.close();
server.close();
fs.rmSync(dir, { recursive: true, force: true });
