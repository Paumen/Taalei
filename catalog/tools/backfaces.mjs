import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODEL_DIR = join(ROOT, 'kits', 'workfiles');
const OUT = join(ROOT, 'catalog', 'build', 'backfaces.json');
const SIZE = 160;
const SAMPLE = 400;
const AZIMUTHS = [0, 45, 90, 135, 180, 225, 270, 315];
const ELEVATIONS = [20, 50];
const LOAD_TIMEOUT = 90_000;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
if (flag('--help') || flag('-h')) {
  console.log(`backfaces.mjs [--kit slug] [--force] [--jobs n]
Renders every workfile from ${AZIMUTHS.length * ELEVATIONS.length} views above the horizon and records, per model,
the largest share of its silhouette that shows back faces in one view, and why
those faces show: inverted (wound against its normals, its neighbours, or facing
into solid material), inside-out (a closed shell wound inward), open (a
single-sided surface seen from behind) or other (a face turned towards a gap or
another part). Writes catalog/build/backfaces.json, which build-catalog.mjs reads.
  --kit slug   only this kit
  --force      measure again even when the .glb is unchanged
  --jobs n     browser pages measuring in parallel (default 4)`);
  process.exit(0);
}
const onlyKit = value('--kit', null);
const force = flag('--force');
const jobs = Math.max(1, Number(value('--jobs', 4)) || 1);

const TOOLING = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 12);
const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const previous = old.tooling === TOOLING ? old.models : {};
if (onlyKit && old.tooling !== TOOLING) console.log('the measure changed since the last run: every workfile is measured, not only --kit');
const kitOnly = old.tooling === TOOLING ? onlyKit : null;
const result = {};

const queue = [];
for (const kit of readdirSync(MODEL_DIR).sort()) {
  const dir = join(MODEL_DIR, kit);
  if (!statSync(dir).isDirectory()) continue;
  for (const file of readdirSync(dir).filter((n) => n.endsWith('.glb')).sort()) {
    const id = `${kit}/${file.replace(/\.glb$/, '')}`;
    const hash = createHash('sha256').update(readFileSync(join(dir, file))).digest('hex').slice(0, 16);
    const have = previous[id];
    if (have?.hash === hash && (!force || (kitOnly && kit !== kitOnly))) { result[id] = have; continue; }
    if (kitOnly && kit !== kitOnly) continue;
    queue.push({ id, hash });
  }
}
console.log(`${Object.keys(result).length + queue.length} workfiles: ${Object.keys(result).length} up to date, ${queue.length} to measure`);

const PAGE = `<!doctype html>
<script type="importmap">{"imports":{"three":"/catalog/app/vendor/three.module.min.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from '/catalog/app/vendor/three-addons/GLTFLoader.js';
const S = ${SIZE};
const SAMPLE = ${SAMPLE};
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(S, S);
renderer.setClearColor(0x000000, 0);
const target = new THREE.WebGLRenderTarget(S, S);
const material = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: \`attribute float tri; varying float vTri;
    void main() { vTri = tri; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }\`,
  fragmentShader: \`varying float vTri;
    void main() {
      if (gl_FrontFacing) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
      float id = floor(vTri + 0.5) + 1.0;
      gl_FragColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
    }\`,
});
const loader = new GLTFLoader();
const pixels = new Uint8Array(S * S * 4);

function classifier(parts, radius) {
  const corners = [], normals = [];
  const weld = new Map();
  const v = new THREE.Vector3(), m = new THREE.Vector3();
  for (const { mesh, geometry } of parts) {
    const pos = geometry.attributes.position, nrm = geometry.attributes.normal;
    const index = geometry.index ? geometry.index.array : null;
    const count = (index ? index.length : pos.count) / 3;
    const mirrored = mesh.matrixWorld.determinant() < 0;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const ids = new Int32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const key = v.x.toFixed(5) + ',' + v.y.toFixed(5) + ',' + v.z.toFixed(5);
      if (!weld.has(key)) weld.set(key, { id: weld.size, at: v.clone() });
      ids[i] = weld.get(key).id;
    }
    for (let t = 0; t < count; t++) {
      const k = [0, 1, 2].map((e) => (index ? index[t * 3 + e] : t * 3 + e));
      if (mirrored) k.reverse();
      corners.push(ids[k[0]], ids[k[1]], ids[k[2]]);
      if (!nrm) { normals.push(null); continue; }
      m.set(0, 0, 0);
      for (const i of k) m.add(v.fromBufferAttribute(nrm, i).applyMatrix3(normalMatrix).normalize());
      normals.push(m.clone());
    }
  }
  const at = [...weld.values()].sort((x, y) => x.id - y.id).map((w) => w.at);
  const count = corners.length / 3;
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const root = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const edges = new Map();
  for (let t = 0; t < count; t++) {
    for (let e = 0; e < 3; e++) {
      const p = corners[t * 3 + e], q = corners[t * 3 + (e + 1) % 3];
      if (p === q) continue;
      const key = p < q ? p + '_' + q : q + '_' + p;
      const list = edges.get(key) ?? [];
      list.push(t, p < q ? 1 : -1);
      edges.set(key, list);
    }
  }
  const against = new Int32Array(count);
  for (const list of edges.values()) {
    if (list.length === 4) parent[root(list[0])] = root(list[2]);
    for (let i = 0; i < list.length; i += 2)
      for (let j = i + 2; j < list.length; j += 2)
        if (list[i + 1] === list[j + 1]) { against[list[i]]++; against[list[j]]++; }
  }
  const open = new Set();
  for (const list of edges.values()) if (list.length === 2) open.add(root(list[0]));
  const volume = new Map(), inverted = new Uint8Array(count);
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let t = 0; t < count; t++) {
    const a = at[corners[t * 3]], b = at[corners[t * 3 + 1]], c = at[corners[t * 3 + 2]];
    const n = ab.subVectors(b, a).cross(ac.subVectors(c, a));
    const r = root(t);
    volume.set(r, (volume.get(r) ?? 0) + a.dot(n) / 6);
    if (against[t] >= 2) { inverted[t] = 1; continue; }
    const s = normals[t], nl = n.length(), sl = s ? s.length() : 0;
    if (nl > 1e-12 && sl > 1e-12 && n.dot(s) / (nl * sl) < -0.5) inverted[t] = 1;
  }
  const meshes = parts.map((p) => p.mesh);
  const ray = new THREE.Raycaster();
  const hitNormal = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  const intoSolid = (t) => {
    const a = at[corners[t * 3]], b = at[corners[t * 3 + 1]], c = at[corners[t * 3 + 2]];
    const dir = ab.subVectors(b, a).cross(ac.subVectors(c, a)).normalize();
    const origin = a.clone().add(b).add(c).divideScalar(3).addScaledVector(dir, radius * 1e-4);
    ray.set(origin, dir);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) return false;
    hitNormal.copy(hit.face.normal).applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld));
    return hitNormal.dot(dir) > 0;
  };
  return (t) => {
    if (inverted[t]) return 'inverted';
    const r = root(t);
    if (open.has(r)) return 'open';
    if (volume.get(r) < 0) return 'inside-out';
    return intoSolid(t) ? 'inverted' : 'other';
  };
}

window.measure = async (url) => {
  const gltf = await loader.loadAsync(url);
  const scene = new THREE.Scene();
  scene.add(gltf.scene);
  const parts = [];
  let offset = 0;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const original = o.geometry;
    const flat = original.index ? original.toNonIndexed() : original.clone();
    const tris = flat.attributes.position.count / 3;
    const ids = new Float32Array(tris * 3);
    for (let t = 0; t < tris; t++) ids[t * 3] = ids[t * 3 + 1] = ids[t * 3 + 2] = offset + t;
    flat.setAttribute('tri', new THREE.BufferAttribute(ids, 1));
    o.geometry = flat;
    o.material = material;
    parts.push({ mesh: o, geometry: original });
    offset += tris;
  });
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const centre = box.getCenter(new THREE.Vector3());
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius || 1;
  const fov = 35;
  const camera = new THREE.PerspectiveCamera(fov, 1, radius / 100, radius * 100);
  const distance = radius / Math.sin((fov / 2) * Math.PI / 180) * 1.05;
  const seen = new Map();
  let worst = { share: 0, view: null };
  for (const el of ${JSON.stringify(ELEVATIONS)}) for (const az of ${JSON.stringify(AZIMUTHS)}) {
    const a = az * Math.PI / 180, e = el * Math.PI / 180;
    camera.position.set(centre.x + distance * Math.cos(e) * Math.sin(a), centre.y + distance * Math.sin(e),
      centre.z + distance * Math.cos(e) * Math.cos(a));
    camera.lookAt(centre);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, S, S, pixels);
    let fill = 0, back = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue;
      fill++;
      const id = pixels[i] + pixels[i + 1] * 256 + pixels[i + 2] * 65536;
      if (!id) continue;
      back++;
      seen.set(id - 1, (seen.get(id - 1) ?? 0) + 1);
    }
    const share = fill ? back / fill : 0;
    if (share > worst.share) worst = { share, view: az + '/' + el };
  }
  const causes = {};
  let total = 0;
  if (seen.size) {
    const cause = classifier(parts, radius);
    for (const [id, n] of [...seen].sort((x, y) => y[1] - x[1]).slice(0, SAMPLE)) {
      const why = cause(id);
      causes[why] = (causes[why] ?? 0) + n;
      total += n;
    }
  }
  gltf.scene.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  if (!seen.size) return { share: 0 };
  for (const k of Object.keys(causes)) causes[k] = Math.round(causes[k] / total * 100) / 100;
  return { share: Math.round(worst.share * 1e4) / 1e4, view: worst.view, causes };
};
window.ready = true;
</script>`;

const TYPES = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }
  const file = resolve(ROOT, '.' + path);
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

let failed = 0;
if (queue.length) {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
  });
  const total = queue.length;
  const started = Date.now();
  let done = 0;
  const worker = async () => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('  [page error]', e.message));
    const open = async () => {
      await page.goto(`${ORIGIN}/`);
      await page.waitForFunction(() => window.ready === true, null, { timeout: LOAD_TIMEOUT });
    };
    await open();
    for (let item = queue.shift(); item; item = queue.shift()) {
      const [kit, name] = item.id.split('/');
      try {
        const m = await page.evaluate((u) => window.measure(u),
          `/kits/workfiles/${encodeURIComponent(kit)}/${encodeURIComponent(name)}.glb`);
        result[item.id] = { hash: item.hash, ...m };
        if (++done % 250 === 0) console.log(`  ${done} of ${total}, ${((Date.now() - started) / 1000).toFixed(0)} s`);
      } catch (e) {
        failed++;
        console.error(`  x ${item.id}: ${e.message.split('\n')[0]}`);
        await open();
      }
    }
    await page.close();
  };
  await Promise.all(Array.from({ length: Math.min(jobs, total) }, worker));
  await browser.close();
  console.log(`${done} measured in ${((Date.now() - started) / 1000).toFixed(0)} s${failed ? `, ${failed} failed` : ''}`);
}
server.close();

const sorted = Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, JSON.stringify({ tooling: TOOLING, views: AZIMUTHS.length * ELEVATIONS.length, size: SIZE, models: sorted }, null, 1) + '\n');
const flagged = Object.values(sorted).filter((m) => m.share > 0).length;
console.log(`${flagged} of ${Object.keys(sorted).length} workfiles show back faces → catalog/build/backfaces.json`);
process.exitCode = failed ? 1 : 0;
