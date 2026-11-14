import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds, editablePrimitives, vertexAdder, vec3View, primitiveMatrix, cross, sub, dot } from './mesh-edit.mjs';

const ZFIGHT_GAP = 2e-4;
const ZFIGHT_COS = 0.9995;
const ZFIGHT_SHARE = 0.05;

const HELP = `backface-twin.mjs [--dry] <workfile.glb> [...]

Renders each workfile from the views catalog/tools/backfaces.mjs uses and gives every
triangle seen from behind a twin facing the other way, with its normals turned round
and the same colour, or the colour of a face of another colour it would lie on (as
lint/glb-lint.mjs judges z-fighting). The twin lies exactly on its original: under the double-sided
materials of the catalogue both shade alike, so they do not flicker. Models whose kind lint/variables.json backface.belowExempt
spares are looked at from above only. --dry reports without writing.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(0); }
const dry = args.includes('--dry');
const files = args.filter((a) => !a.startsWith('--')).map((f) => resolve(f));

const SIZE = 320;
const AZIMUTHS = [0, 45, 90, 135, 180, 225, 270, 315];
const ABOVE = [20, 50].flatMap((el) => AZIMUTHS.map((az) => [az, el]));
const BELOW = [0, -89.9];

const vars = JSON.parse(readFileSync(join(ROOT, 'lint/variables.json'), 'utf8')).backface;
const kinds = Object.fromEntries(JSON.parse(readFileSync(join(ROOT, 'catalog/build/catalog.json'), 'utf8')).models
  .map((m) => [`${m.kit}/${m.name}`, m.kind]));
const under = (k, a) => k === a || Boolean(k?.startsWith(`${a}-`));
const aboveOnly = (kind) => vars.belowExempt.some((k) => under(kind, k)) && !vars.belowKept.some((k) => under(kind, k));

const key = (corners) => corners.map((p) => p.map((v) => v.toFixed(4)).join(',')).sort().join('|');

const PAGE = `<!doctype html>
<script type="importmap">{"imports":{"three":"/catalog/app/vendor/three.module.min.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from '/catalog/app/vendor/three-addons/GLTFLoader.js';
const S = ${SIZE};
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(S, S);
renderer.setClearColor(0x000000, 0);
renderer.autoClear = false;
const target = new THREE.WebGLRenderTarget(S, S);
const vertexShader = \`attribute float tri; varying float vTri;
  void main() { vTri = tri; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }\`;
const frontSide = new THREE.ShaderMaterial({ side: THREE.FrontSide, vertexShader,
  fragmentShader: \`void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }\` });
const backSide = new THREE.ShaderMaterial({ side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 1,
  polygonOffsetUnits: 4, vertexShader,
  fragmentShader: \`varying float vTri;
    void main() {
      float id = floor(vTri + 0.5) + 1.0;
      gl_FragColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
    }\` });
const loader = new GLTFLoader();
const pixels = new Uint8Array(S * S * 4);
window.seen = async (url, views) => {
  const gltf = await loader.loadAsync(url);
  const scene = new THREE.Scene();
  scene.add(gltf.scene);
  scene.updateMatrixWorld(true);
  const tris = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const flat = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const pos = flat.attributes.position;
    const n = pos.count / 3;
    const ids = new Float32Array(n * 3);
    for (let t = 0; t < n; t++) {
      ids[t * 3] = ids[t * 3 + 1] = ids[t * 3 + 2] = tris.length;
      tris.push([0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, t * 3 + k).applyMatrix4(o.matrixWorld).toArray()));
    }
    flat.setAttribute('tri', new THREE.BufferAttribute(ids, 1));
    o.geometry = flat;
  });
  const meshes = [];
  gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const centre = box.getCenter(new THREE.Vector3());
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius || 1;
  const camera = new THREE.PerspectiveCamera(35, 1, radius / 100, radius * 100);
  const distance = radius / Math.sin(17.5 * Math.PI / 180) * 1.05;
  const hit = new Set();
  for (const [az, el] of views) {
    const a = az * Math.PI / 180, e = el * Math.PI / 180;
    camera.position.set(centre.x + distance * Math.cos(e) * Math.sin(a), centre.y + distance * Math.sin(e),
      centre.z + distance * Math.cos(e) * Math.cos(a));
    camera.lookAt(centre);
    renderer.setRenderTarget(target);
    renderer.clear();
    for (const m of meshes) m.material = frontSide;
    renderer.render(scene, camera);
    for (const m of meshes) m.material = backSide;
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, S, S, pixels);
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue;
      const id = pixels[i] + pixels[i + 1] * 256 + pixels[i + 2] * 65536;
      if (id) hit.add(id - 1);
    }
  }
  return [...hit].map((t) => tris[t]);
};
window.ready = true;
</script>`;

const TYPES = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }
  const file = path.startsWith('/@abs/') ? path.slice(5) : resolve(ROOT, '.' + path);
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [page error]', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 90_000 });

function overlap(A, B) {
  let poly = A;
  for (let k = 0; k < 3 && poly.length; k++) {
    const p = B[k], q = B[(k + 1) % 3], side = (v) => (q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]);
    const next = [];
    for (let i = 0; i < poly.length; i++) {
      const v = poly[i], e = poly[(i + 1) % poly.length], dv = side(v), de = side(e);
      if (dv >= 0) next.push(v);
      if ((dv >= 0) !== (de >= 0)) { const t = dv / (dv - de); next.push([v[0] + t * (e[0] - v[0]), v[1] + t * (e[1] - v[1])]); }
    }
    poly = next;
  }
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const v = poly[i], e = poly[(i + 1) % poly.length]; a += v[0] * e[1] - e[0] * v[1]; }
  return Math.abs(a) / 2;
}

function clashes(glb, prim, idx, place) {
  const uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(glb, prim.attributes.TEXCOORD_0).data : null;
  if (!uv) return () => null;
  const tris = [];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < idx.length; t += 3) {
    const p = [0, 1, 2].map((k) => Array.from(place(idx[t + k])));
    for (const v of p) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
    const n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const len = Math.hypot(...n) || 1;
    const u = [0, 1, 2].reduce((s, k) => [s[0] + uv[idx[t + k] * 2] / 3, s[1] + uv[idx[t + k] * 2 + 1] / 3], [0, 0]);
    tris.push({ p, n: n.map((v) => v / len), area: len / 2, uv: u, colour: u.map((v) => Math.floor(v * 64)).join(',') });
  }
  const gap = Math.max(...hi.map((v, k) => v - lo[k])) * ZFIGHT_GAP;
  return (t) => {
    const A = tris[t / 3];
    const twin = A.n.map((v) => -v);
    const ax = twin.map(Math.abs), drop = ax[0] > ax[1] ? (ax[0] > ax[2] ? 0 : 2) : (ax[1] > ax[2] ? 1 : 2);
    const flat = (p) => {
      const q = p.map((v) => v.filter((_, c) => c !== drop));
      return (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0]) < 0 ? q.reverse() : q;
    };
    const B = tris.find((B) => B !== A && B.colour !== A.colour && dot(twin, B.n) > ZFIGHT_COS
      && B.p.every((v) => Math.abs(dot(twin, sub(v, A.p[0]))) <= gap)
      && overlap(flat(A.p), flat(B.p)) > ZFIGHT_SHARE * Math.min(A.area, B.area) * ax[drop]);
    return B ? B.uv : null;
  };
}

const apply = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);

let failed = 0;
for (const file of files) {
  const id = relative(join(ROOT, 'kits/workfiles'), file).replace(/\.glb$/, '');
  try {
    const views = aboveOnly(kinds[id]) ? ABOVE : [...ABOVE, BELOW];
    const seen = await page.evaluate(([u, v]) => window.seen(u, v), [`/@abs${file}`, views]);
    const want = new Set(seen.map(key));
    const glb = readGlb(file);
    const replaced = new Map();
    let twins = 0, recoloured = 0;
    for (const prim of editablePrimitives(glb.json)) {
      const m = primitiveMatrix(glb.json, prim);
      const place = vec3View(glb, prim.attributes.POSITION);
      const idx = Array.from(readAccessor(glb, prim.indices).data);
      const normal = prim.attributes.NORMAL !== undefined ? vec3View(glb, prim.attributes.NORMAL) : null;
      const adder = vertexAdder(glb, prim);
      const clash = clashes(glb, prim, idx, place);
      const extra = [];
      for (let t = 0; t < idx.length; t += 3) {
        const c = [idx[t], idx[t + 1], idx[t + 2]];
        if (!want.has(key(c.map((i) => apply(m, place(i)))))) continue;
        const colour = clash(t);
        if (colour) recoloured++;
        const copy = c.map((i) => adder.add(i, {
          ...(normal ? { NORMAL: Array.from(normal(i), (v) => -v) } : {}),
          ...(colour ? { TEXCOORD_0: colour } : {}),
        }));
        extra.push(copy[0], copy[2], copy[1]);
        twins++;
      }
      if (extra.length) adder.commit(idx.concat(extra), replaced);
    }
    console.log(`${id}: ${seen.length} seen, ${twins} twinned${twins < seen.length ? ` (${seen.length - twins} not matched)` : ''}${recoloured ? `, ${recoloured} in the colour of a face they would z-fight with` : ''}`);
    if (!dry && twins) {
      repack(glb, replaced);
      fixBounds(glb);
      writeGlb(file, glb.json, glb.bin, writeFileSync);
    }
  } catch (e) {
    failed++;
    console.error(`x ${id}: ${e.message.split('\n')[0]}`);
  }
}
await browser.close();
server.close();
process.exitCode = failed ? 1 : 0;
