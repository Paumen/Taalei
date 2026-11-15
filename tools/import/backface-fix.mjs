import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, readAccessor, writeGlb } from '../../catalog/tools/glb.mjs';
import { editablePrimitives, primitiveMatrix, repack, fixBounds, vertexAdder, faceNormal, dot, cross, sub, edgeKey, catalogTubeNeed, buildTree, hitBox, hitTriangle, vec3View } from './mesh-edit.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SIZE = 320;
const VIEWS = [...[20, 50].flatMap((el) => [0, 45, 90, 135, 180, 225, 270, 315].map((az) => [az, el])), [0, -89.9]];

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const thick = args.includes('--thick') ? Number(args[args.indexOf('--thick') + 1]) : null;
const turnOnly = args.includes('--turn-only');
const loose = args.includes('--loose');
const PART = 0.0015;
const MARGIN = 1.3;
const files = args.filter((a, i) => a.endsWith('.glb') && args[i - 1] !== '--thick');
if (!files.length || args.includes('--help')) {
  console.log(`backface-fix.mjs <workfile.glb>... [--thick <f>] [--loose] [--turn-only] [--dry]
Looks at a model from the ${VIEWS.length} views of catalog/tools/backfaces.mjs and repairs the
faces seen from behind:
  doubled  two copies of one face turned opposite ways: the copy seen from
           behind is removed when the other copy is never seen from behind
  flipped  a face seen from behind and never from the front is turned around,
           its normals with it
  capped   a flat hole in a shape whose inside is seen is closed, when the cap
           faces down or the shape is narrower than twice --thick
  backed   any other face seen from both sides (a single sheet, the inside
           of an open shape) gets a copy turned the other way, --thick behind
           it, joined to it along its edge; the model is lifted back onto
           its old lowest point
  parted   two doubled copies both seen from behind are moved ${PART} apart
--thick is in world size; by default ${MARGIN} times the thin limit of the model's
kind (thin.min in lint/kinds.json), which G27 asks of a wall.
--loose puts a back ${PART} behind its face and leaves the edge open, for a face
inside a shape too narrow for --thick: G27 does not count a wall that thin.
--turn-only removes, parts and flips, and adds no caps or backs.
Writes in place; prints the counts.`);
  process.exit(0);
}

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
const idColour = \`float id = floor(vTri + 0.5) + 1.0;
  gl_FragColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;\`;
const black = new THREE.ShaderMaterial({ side: THREE.FrontSide, vertexShader,
  fragmentShader: \`void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }\` });
const backSide = new THREE.ShaderMaterial({ side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 4,
  vertexShader, fragmentShader: \`varying float vTri; void main() { \${idColour} }\` });
const backTwin = new THREE.ShaderMaterial({ side: THREE.BackSide, depthFunc: THREE.LessEqualDepth,
  vertexShader, fragmentShader: backSide.fragmentShader });
const frontIds = new THREE.ShaderMaterial({ side: THREE.DoubleSide, vertexShader,
  fragmentShader: \`varying float vTri; void main() { \${idColour} if (!gl_FrontFacing) gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }\` });
const pixels = new Uint8Array(S * S * 4);
window.look = async (url, twins) => {
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = new THREE.Scene();
  scene.add(gltf.scene);
  const meshes = [], pairs = [];
  let offset = 0;
  gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const place = (o) => { const a = gltf.parser.associations.get(o); return a.meshes * 1e4 + (a.primitives ?? 0); };
  meshes.sort((a, b) => place(a) - place(b));
  for (const mesh of meshes) {
    const flat = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const tris = flat.attributes.position.count / 3;
    const ids = new Float32Array(tris * 3);
    for (let t = 0; t < tris; t++) ids[t * 3] = ids[t * 3 + 1] = ids[t * 3 + 2] = offset + t;
    flat.setAttribute('tri', new THREE.BufferAttribute(ids, 1));
    mesh.geometry = flat;
    const mine = twins.filter((t) => t >= offset && t < offset + tris);
    if (mine.length) {
      const keep = new Float32Array(mine.length * 9), keepIds = new Float32Array(mine.length * 3);
      mine.forEach((t, i) => {
        for (let k = 0; k < 9; k++) keep[i * 9 + k] = flat.attributes.position.array[(t - offset) * 9 + k];
        keepIds[i * 3] = keepIds[i * 3 + 1] = keepIds[i * 3 + 2] = t;
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(keep, 3));
      g.setAttribute('tri', new THREE.BufferAttribute(keepIds, 1));
      const pair = new THREE.Mesh(g, backTwin);
      pair.matrixAutoUpdate = false;
      mesh.updateWorldMatrix(true, false);
      pair.matrix.copy(mesh.matrixWorld);
      pairs.push(pair);
    }
    offset += tris;
  }
  const paint = (material) => { for (const mesh of meshes) mesh.material = material; };
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const centre = box.getCenter(new THREE.Vector3());
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius || 1;
  const camera = new THREE.PerspectiveCamera(35, 1, radius / 100, radius * 100);
  const distance = radius / Math.sin(17.5 * Math.PI / 180) * 1.05;
  const back = {}, front = {};
  const count = (into) => {
    renderer.readRenderTargetPixels(target, 0, 0, S, S, pixels);
    for (let i = 0; i < pixels.length; i += 4) {
      const id = pixels[i] + pixels[i + 1] * 256 + pixels[i + 2] * 65536;
      if (pixels[i + 3] >= 128 && id) into[id - 1] = (into[id - 1] ?? 0) + 1;
    }
  };
  for (const [az, el] of ${JSON.stringify(VIEWS)}) {
    const a = az * Math.PI / 180, e = el * Math.PI / 180;
    camera.position.set(centre.x + distance * Math.cos(e) * Math.sin(a), centre.y + distance * Math.sin(e),
      centre.z + distance * Math.cos(e) * Math.cos(a));
    camera.lookAt(centre);
    renderer.setRenderTarget(target);
    renderer.clear();
    paint(black);
    renderer.render(scene, camera);
    paint(backSide);
    renderer.render(scene, camera);
    for (const pair of pairs) renderer.render(pair, camera);
    count(back);
    renderer.clear();
    paint(frontIds);
    renderer.render(scene, camera);
    count(front);
  }
  return { back, front, meshes: meshes.length };
};
window.ready = true;
</script>`;

const TYPES = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(PAGE); return; }
  const file = resolve(ROOT, '.' + path);
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.ready === true);

const unit = (n) => { const l = Math.hypot(...n); return l ? n.map((x) => x / l) : [0, 0, 0]; };

function newell(pts) {
  const n = [0, 0, 0];
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  });
  return n;
}

function earClip(pts, n) {
  const u = unit(cross(n, Math.abs(n[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross(n, u);
  const q = pts.map((p) => [dot(p, u), dot(p, v)]);
  const area = (a, b, c) => (q[b][0] - q[a][0]) * (q[c][1] - q[a][1]) - (q[c][0] - q[a][0]) * (q[b][1] - q[a][1]);
  const left = pts.map((_, i) => i);
  const out = [];
  while (left.length > 3) {
    const k = left.findIndex((b, i) => {
      const a = left[(i + left.length - 1) % left.length], c = left[(i + 1) % left.length];
      return area(a, b, c) > 1e-14
        && !left.some((p) => p !== a && p !== b && p !== c && area(a, b, p) >= 0 && area(b, c, p) >= 0 && area(c, a, p) >= 0);
    });
    if (k < 0) return null;
    out.push([left[(k + left.length - 1) % left.length], left[k], left[(k + 1) % left.length]]);
    left.splice(k, 1);
  }
  out.push(left);
  return out;
}

for (const file of files) {
  const glb = readGlb(file);
  const prims = editablePrimitives(glb.json);
  const all = (glb.json.meshes ?? []).flatMap((m) => m.primitives);
  if (prims.length !== all.length || glb.json.nodes.filter((n) => n.mesh !== undefined).length !== glb.json.meshes.length) {
    console.log(`${file}  skipped: ${all.length} primitives, ${prims.length} editable, or a mesh used twice`);
    continue;
  }
  const M0 = primitiveMatrix(glb.json, all[0]);
  const scale = ((M) => Math.cbrt(Math.abs(M[0] * (M[5] * M[10] - M[6] * M[9]) - M[4] * (M[1] * M[10] - M[2] * M[9]) + M[8] * (M[1] * M[6] - M[2] * M[5]))) || 1)(M0);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const parts = [];
  let offset = 0;
  for (const prim of all) {
    const M = primitiveMatrix(glb.json, prim);
    const P = readAccessor(glb, prim.attributes.POSITION).data;
    const N = prim.attributes.NORMAL !== undefined ? readAccessor(glb, prim.attributes.NORMAL).data : null;
    const UV = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(glb, prim.attributes.TEXCOORD_0).data : null;
    const I = Array.from(readAccessor(glb, prim.indices).data);
    const welded = new Map();
    const world = (v) => [0, 1, 2].map((r) => M[r] * P[v * 3] + M[4 + r] * P[v * 3 + 1] + M[8 + r] * P[v * 3 + 2] + M[12 + r]);
    const ids = Array.from({ length: P.length / 3 }, (_, v) => {
      const at = world(v);
      at.forEach((x, k) => { lo[k] = Math.min(lo[k], x); hi[k] = Math.max(hi[k], x); });
      const key = at.map((x) => x.toFixed(5)).join(',');
      return welded.get(key) ?? welded.set(key, welded.size).get(key);
    });
    const sets = new Map();
    for (let t = 0; t < I.length / 3; t++) {
      const k = [0, 1, 2].map((e) => ids[I[t * 3 + e]]);
      if (k[0] === k[1] || k[1] === k[2] || k[0] === k[2]) continue;
      const r = k.indexOf(Math.min(...k));
      const id = [...k].sort((a, b) => a - b).join(',');
      (sets.get(id) ?? sets.set(id, []).get(id)).push({ t, turn: `${k[(r + 1) % 3]},${k[(r + 2) % 3]}` });
    }
    const twinOf = new Map();
    for (const list of sets.values()) {
      if (new Set(list.map((x) => x.turn)).size < 2) continue;
      for (const x of list) twinOf.set(x.t, list.filter((y) => y.turn !== x.turn).map((y) => y.t));
    }
    parts.push({ prim, M, P, N, UV, I, ids, twinOf, offset });
    offset += I.length / 3;
  }
  const d = (loose ? PART : thick ?? MARGIN * (catalogTubeNeed(file) || 0.026)) / scale;

  const url = '/' + relative(ROOT, resolve(file)).split('\\').join('/').split('/').map(encodeURIComponent).join('/');
  const seen = await page.evaluate(([u, twins]) => window.look(u, twins),
    [url, parts.flatMap((p) => [...p.twinOf.keys()].map((t) => t + p.offset))]);
  if (seen.meshes !== all.length) { console.log(`${file}  skipped: the loader made ${seen.meshes} meshes of ${all.length} primitives`); continue; }

  const sum = { drop: 0, part: 0, flip: 0, backed: 0, caps: 0 };
  const replaced = new Map();
  for (const { prim, M, P, N, UV, I, ids, twinOf, offset: first } of parts) {
    const count = I.length / 3;
    const back = (t) => seen.back[t + first], front = (t) => seen.front[t + first];
    const drop = new Set(), flip = new Set(), part = new Set(), backed = new Set();
    for (let t = 0; t < count; t++) {
      if (!back(t)) continue;
      if (twinOf.has(t)) {
        if (twinOf.get(t).every((o) => !back(o) && !drop.has(o))) drop.add(t); else part.add(t);
      } else if (!front(t)) flip.add(t);
      else if (!turnOnly) backed.add(t);
    }
    for (const t of part) if (twinOf.get(t).some((o) => drop.has(o))) part.delete(t);
    if (!(drop.size + flip.size + part.size + backed.size)) continue;

    const at = (v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
    const moved = (v, n, by) => at(v).map((x, k) => x + n[k] * by);
    const normalOf = (t) => unit(faceNormal(P, I[t * 3], I[t * 3 + 1], I[t * 3 + 2]));
    const lean = new Map();
    for (const t of backed) {
      const n = normalOf(t);
      for (let e = 0; e < 3; e++) lean.set(ids[I[t * 3 + e]], (lean.get(ids[I[t * 3 + e]]) ?? [0, 0, 0]).map((x, k) => x + n[k]));
    }
    const faces = Array.from({ length: count }, (_, t) => [at(I[t * 3]), at(I[t * 3 + 1]), at(I[t * 3 + 2])]);
    const tree = buildTree(faces);
    const tight = (v) => {
      const w = ids[v];
      const dir = unit(lean.get(w)).map((x) => -x);
      const inv = dir.map((x) => 1 / x);
      const stack = [tree.root];
      while (stack.length) {
        const node = stack.pop();
        if (!hitBox(node.b, at(v), inv, 2 * d)) continue;
        if (node.left) { stack.push(node.left, node.right); continue; }
        for (let i = node.start; i < node.end; i++) {
          const t = tree.order[i];
          if ([0, 1, 2].some((e) => ids[I[t * 3 + e]] === w)) continue;
          const hit = hitTriangle(at(v), dir, faces[t]);
          if (hit > 0 && hit < 2 * d) return true;
        }
      }
      return false;
    };

    const group = Int32Array.from({ length: count }, (_, t) => t);
    const find = (t) => { while (group[t] !== t) t = group[t] = group[group[t]]; return t; };
    const first1 = new Map();
    const edges = new Map();
    for (let t = 0; t < count; t++) for (let e = 0; e < 3; e++) {
      const a = I[t * 3 + e], b = I[t * 3 + (e + 1) % 3];
      if (first1.has(ids[a])) group[find(t)] = find(first1.get(ids[a])); else first1.set(ids[a], t);
      if (ids[a] === ids[b]) continue;
      const key = edgeKey(ids[a], ids[b]);
      (edges.get(key) ?? edges.set(key, []).get(key)).push([a, b, t]);
    }
    const loopsOf = new Map();
    const from = new Map();
    for (const list of edges.values()) if (list.length === 1) {
      const edge = list[0];
      (from.get(ids[edge[0]]) ?? from.set(ids[edge[0]], []).get(ids[edge[0]])).push(edge);
    }
    const used = new Set();
    for (const [start, list] of from) for (const head of list) {
      if (used.has(head)) continue;
      const loop = [];
      for (let e = head; e && !used.has(e); e = (from.get(ids[e[1]]) ?? []).find((x) => !used.has(x))) {
        used.add(e);
        loop.push(e);
        if (ids[e[1]] === start) break;
      }
      if (loop.length < 3 || ids[loop.at(-1)[1]] !== start) continue;
      const g = find(head[2]);
      (loopsOf.get(g) ?? loopsOf.set(g, []).get(g)).push(loop);
    }

    const capped = new Set();
    const caps = [];
    const groups = new Map();
    for (const t of backed) (groups.get(find(t)) ?? groups.set(find(t), []).get(find(t))).push(t);
    for (const [g, list] of groups) {
      const squeezed = list.some((t) => [0, 1, 2].some((e) => tight(I[t * 3 + e])));
      for (const loop of loopsOf.get(g) ?? []) {
        const pts = loop.map(([v]) => at(v)).reverse();
        const n = unit(newell(pts));
        const c = pts.reduce((sum1, q) => sum1.map((x, k) => x + q[k] / pts.length), [0, 0, 0]);
        const reach = Math.max(...pts.map((q) => Math.hypot(...sub(q, c))));
        const off = (q) => Math.abs(dot(sub(q, c), n));
        if (!reach || pts.some((q) => off(q) > 0.02 * reach)) continue;
        let flat = true;
        for (let t = 0; t < count && flat; t++) if (find(t) === g) flat = faces[t].every((q) => off(q) <= 0.02 * reach);
        if (flat) continue;
        const down = M[1] * n[0] + M[5] * n[1] + M[9] * n[2];
        if (down > -0.2 * scale && !squeezed) continue;
        const turn = (a, b, e) => dot(cross(sub(b, a), sub(e, a)), n);
        const star = pts.every((q, i) => turn(c, q, pts[(i + 1) % pts.length]) > 0);
        const tris = star ? pts.map((_, i) => [pts.length, i, (i + 1) % pts.length]) : earClip(pts, n);
        const whole = pts.reduce((sum1, q, i) => sum1 + turn(pts[0], q, pts[(i + 1) % pts.length]), 0);
        if (!tris || (!star && Math.abs(tris.reduce((sum1, f) => sum1 + turn(pts[f[0]], pts[f[1]], pts[f[2]]), 0) - whole) > 1e-6 * Math.abs(whole))) continue;
        const weight = new Map();
        for (const [a, b] of loop) {
          const key = UV ? `${UV[a * 2]},${UV[a * 2 + 1]}` : '';
          weight.set(key, (weight.get(key) ?? 0) + Math.hypot(...sub(at(a), at(b))));
        }
        const uv = [...weight].sort((x, y) => y[1] - x[1])[0][0].split(',').map(Number);
        caps.push({ src: loop.map(([v]) => v).reverse(), n, uv, tris, centre: star ? c : null });
        capped.add(g);
      }
    }
    for (const t of [...backed]) if (capped.has(find(t))) backed.delete(t);
    sum.drop += drop.size; sum.part += part.size; sum.flip += flip.size; sum.backed += backed.size; sum.caps += caps.length;

    const rim = new Map();
    for (const t of backed) for (let e = 0; e < 3; e++) {
      const a = I[t * 3 + e], b = I[t * 3 + (e + 1) % 3];
      const key = edgeKey(ids[a], ids[b]);
      (rim.get(key) ?? rim.set(key, []).get(key)).push([a, b, normalOf(t)]);
    }
    const adder = vertexAdder(glb, prim);
    const out = [];
    const behind = new Map();
    const under = (v) => moved(v, unit(lean.get(ids[v])), -d);
    for (let t = 0; t < count; t++) {
      if (drop.has(t)) continue;
      const [a, b, c] = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
      if (part.has(t)) {
        const n = normalOf(t);
        out.push(...[a, b, c].map((v) => adder.add(v, { POSITION: moved(v, n, PART / 2 / scale) })));
      } else if (backed.has(t)) {
        out.push(a, b, c, ...[a, c, b].map((v) => {
          if (!behind.has(v)) {
            const set = { POSITION: under(v) };
            if (N) set.NORMAL = [-N[v * 3], -N[v * 3 + 1], -N[v * 3 + 2]];
            behind.set(v, adder.add(v, set));
          }
          return behind.get(v);
        }));
      } else if (flip.has(t)) {
        const n = faceNormal(P, a, c, b);
        out.push(...[a, c, b].map((v) => {
          const vn = N ? [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]] : null;
          return vn && dot(vn, n) < 0 ? adder.add(v, { NORMAL: vn.map((x) => -x) }) : v;
        }));
      } else out.push(a, b, c);
    }
    for (const list of rim.values()) {
      if (list.length !== 1 || loose) continue;
      const [a, b, n] = list[0];
      const outward = unit(cross(sub(at(b), at(a)), n));
      const quad = [at(a), at(b), under(b), under(a)];
      const set = N ? { NORMAL: outward } : {};
      const qid = quad.map((q, k) => adder.add(k === 1 || k === 2 ? b : a, { ...set, POSITION: q }));
      for (const f of [[0, 1, 2], [0, 2, 3]]) {
        const fn = cross(sub(quad[f[1]], quad[f[0]]), sub(quad[f[2]], quad[f[0]]));
        out.push(...(dot(fn, outward) >= 0 ? f : [f[0], f[2], f[1]]).map((k) => qid[k]));
      }
    }
    for (const { src, n, uv, tris, centre } of caps) {
      const set = { ...(N ? { NORMAL: n } : {}), ...(UV ? { TEXCOORD_0: uv } : {}) };
      const cid = src.map((v) => adder.add(v, set));
      if (centre) cid.push(adder.add(src[0], { ...set, POSITION: centre }));
      for (const f of tris) out.push(...f.map((k) => cid[k]));
    }
    adder.commit(out, replaced);
  }
  console.log(`${file}  removed ${sum.drop} doubled, parted ${sum.part} doubled, flipped ${sum.flip}, capped ${sum.caps} holes, backed ${sum.backed}`);
  if (dry || !replaced.size) continue;
  repack(glb, replaced);
  const floor = (rows) => { let y = Infinity; for (let i = 0; i < rows.length; i += 3) y = Math.min(y, M0[1] * rows[i] + M0[5] * rows[i + 1] + M0[9] * rows[i + 2]); return y; };
  const sunk = Math.min(...parts.map((q) => floor(q.P))) - Math.min(...parts.map((q) => floor(readAccessor(glb, q.prim.attributes.POSITION).data)));
  if (sunk > 0 && all.length === 1) {
    const lift = [M0[1], M0[5], M0[9]].map((x) => x * sunk / (scale * scale));
    const row = vec3View(glb, all[0].attributes.POSITION);
    for (let i = 0; i < glb.json.accessors[all[0].attributes.POSITION].count; i++) row(i).set(Array.from(row(i), (x, k) => x + lift[k]));
  }
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
}

await browser.close();
server.close();
