#!/usr/bin/env node
// render-cli.mjs — headless GLB renderer (Playwright + three.js).
//
// Anders dan render.mjs ernaast, dat een sets.json leest en per set een blad van
// acht tegels schrijft, neemt dit gereedschap losse .glb-bestanden of een map en
// laat het per model de views, modes en de bladindeling op de opdrachtregel zetten.
//
// three komt uit de globale npm-installatie als die er is en anders van unpkg; in
// een omgeving zonder net naar unpkg is de lokale kopie de enige die laadt. Let op
// dat een .glb zijn textuur relatief oplost (Textures/colormap.png naast het
// model): kopieer een model nooit zonder die map mee, anders rendert het ongekleurd.

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';

const THREE_VERSION = '0.169.0';

// De globale three, als npm er een heeft; anders blijft het bij de CDN hieronder.
const THREE_LOCAL = (() => {
  try {
    const dir = path.join(execSync('npm root -g').toString().trim(), 'three');
    return fss.existsSync(path.join(dir, 'build/three.module.js')) ? dir : null;
  } catch { return null; }
})();

const DEFAULTS = {
  out: './renders', modes: 'pbr', views: 'iso',
  width: 1024, height: 1024, dpr: 2,
  bg: '#f2f2f0', env: 'neutral', exposure: 1, tone: 'agx',
  fit: 1.06, compare: false, fov: 35, ortho: false,
  shadow: false, grid: false, axes: false, bbox: false, ruler: false,
  isolate: false,
  sheet: false, sheetCols: 0, sheetTile: 512, sheetLabels: true, sheetOnly: false,
  stats: false, timeout: 120000, verbose: false,
};

const HELP = `
render-cli.mjs <file.glb|dir> [...] [flags]
  --out <dir>  --modes <pbr,clay,wireframe,normal,depth,uv,matcap,xray|all>
  --views <front,back,left,right,top,bottom,iso,iso-back,hero>
  --width/--height/--dpr
  --bg <css|transparent> --env <neutral|studio|none> --exposure <n>
  --tone <agx|aces|neutral|linear|none>  --fov <deg> --fit <n> --ortho
  --compare          all models side by side in one scene, front-on, with grid + ruler
  --shadow --grid --axes --bbox --ruler --isolate
  --sheet [--sheet-cols n] [--sheet-tile px] [--no-sheet-labels] [--sheet-only]
  --stats --timeout <ms> --verbose

Unknown flags, modes, views, tones and envs are rejected before launch.
Missing external textures warn on stdout; exit code stays 0.
`;

function die(msg) { console.error('error: ' + msg); console.error(HELP); process.exit(2); }

function parseArgs(argv) {
  const o = { ...DEFAULTS, inputs: [] };
  const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    if (!a.startsWith('--')) { o.inputs.push(a); continue; }
    let key = camel(a.slice(2));
    if (/^no[A-Z]/.test(key)) {
      const k = key[2].toLowerCase() + key.slice(3);
      if (typeof DEFAULTS[k] !== 'boolean') die('unknown flag: ' + a);
      o[k] = false; continue;
    }
    const cur = DEFAULTS[key];
    if (cur === undefined) die('unknown flag: ' + a);
    if (typeof cur === 'boolean') { o[key] = true; continue; }
    const val = argv[++i];
    if (val === undefined) die(a + ' needs a value');
    if (typeof cur === 'number') {
      const n = Number(val);
      if (!Number.isFinite(n)) die(a + ' needs a number, got: ' + val);
      o[key] = n;
    } else o[key] = val;
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.inputs.length) { console.log(HELP); process.exit(1); }

const ALL_MODES = ['pbr','clay','wireframe','normal','depth','uv','matcap','xray'];
const ALL_VIEWS = ['front','back','left','right','top','bottom','iso','iso-back','hero'];
const ALL_TONES = ['agx','aces','neutral','linear','none'];
const ALL_ENVS  = ['neutral','studio','none'];

const modes = opts.modes === 'all' ? ALL_MODES : opts.modes.split(',').map(s=>s.trim()).filter(Boolean);
if (opts.compare) opts.views = 'front';  // a row read against a ruler only works square-on
const viewNames = opts.views.split(',').map(s=>s.trim()).filter(Boolean);

// Fail on a typo before launching a browser: an unknown mode used to throw a raw
// page stack, an unknown view silently rendered iso under the wrong filename.
const bad = (label, got, allowed) => {
  const miss = got.filter(v => !allowed.includes(v));
  if (miss.length) die('unknown ' + label + ': ' + miss.join(', ') + '\n  allowed: ' + allowed.join(', '));
};
bad('mode', modes, ALL_MODES);
bad('view', viewNames, ALL_VIEWS);
bad('tone', [opts.tone], ALL_TONES);
bad('env', [opts.env], ALL_ENVS);
if (!modes.length) die('--modes is empty');
if (!viewNames.length) die('--views is empty');

const views = viewNames.map(n => ({ name:n, preset:n }));

async function collect(inputs) {
  const out = [];
  for (const inp of inputs) {
    const p = path.resolve(inp);
    const st = await fs.stat(p).catch(()=>null);
    if (!st) { console.warn('skip (not found):', inp); continue; }
    if (st.isDirectory()) {
      for (const e of await fs.readdir(p, { withFileTypes:true }))
        if (e.isFile() && /\.(glb|gltf)$/i.test(e.name)) out.push(path.join(p, e.name));
    } else out.push(p);
  }
  return out;
}
// Kit name lives in the glTF asset extras; several exporters write it there.
async function kitName(file) {
  try {
    const fd = await fs.open(file);
    const head = Buffer.alloc(20);
    await fd.read(head, 0, 20, 0);
    if (head.toString('utf8', 0, 4) !== 'glTF') { await fd.close(); return ''; }
    const len = head.readUInt32LE(12);
    const buf = Buffer.alloc(len);
    await fd.read(buf, 0, len, 20);
    await fd.close();
    const ex = JSON.parse(buf.toString('utf8')).asset?.extras || {};
    const raw = ex.bron || ex.kit || ex.source || Object.values(ex).map(v => v && v.bron).find(Boolean) || '';
    return String(raw).replace(/^KayKit\s+/i, '').replace(/\s+(Bits|Pack|Asset Pack|MegaKit)$/i, '');
  } catch { return ''; }
}

const models = await collect(opts.inputs);
if (!models.length) { console.error('no .glb/.gltf inputs'); process.exit(1); }

// Each file is served under its own /asset/<id>/ prefix so relative URIs inside a
// .glb or .gltf (external textures, .bin buffers) resolve against that file's folder.
const served = new Map(); let idc = 0;
const serve = (abs) => {
  const id = 'f' + idc++;
  served.set(id, path.dirname(abs));
  return '/asset/' + id + '/' + encodeURIComponent(path.basename(abs));
};
const modelUrls = models.map(serve);

const MIME = { '.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg','.ktx2':'image/ktx2' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type':'text/html' });
    return res.end(pageHTML());
  }
  if (THREE_LOCAL && url.pathname.startsWith('/three/')) {
    const abs = path.normalize(path.join(THREE_LOCAL, url.pathname.slice('/three/'.length)));
    if (abs.startsWith(THREE_LOCAL) && fss.existsSync(abs)) {
      res.writeHead(200, { 'content-type': MIME[path.extname(abs).toLowerCase()] || 'text/javascript' });
      return res.end(await fs.readFile(abs));
    }
  }
  const m = url.pathname.match(/^\/asset\/(f\d+)\/(.+)$/);
  if (m && served.has(m[1])) {
    const base = served.get(m[1]);
    const abs = path.resolve(base, decodeURIComponent(m[2]));
    if (abs.startsWith(base) && fss.existsSync(abs)) {
      res.writeHead(200, { 'content-type': MIME[path.extname(abs).toLowerCase()]||'application/octet-stream', 'access-control-allow-origin':'*' });
      return res.end(await fs.readFile(abs));
    }
  }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;

function pageHTML() {
  const cdn = THREE_LOCAL ? ORIGIN + '/three' : 'https://unpkg.com/three@' + THREE_VERSION;
  return '<!doctype html><html><head><meta charset="utf-8">'
    + '<style>html,body{margin:0;background:#000}canvas{display:block}</style>'
    + '<script type="importmap">{"imports":{"three":"' + cdn + '/build/three.module.js","three/addons/":"' + cdn + '/examples/jsm/"}}</' + 'script>'
    + '</head><body><script type="module">const THREE_CDN = ' + JSON.stringify(cdn) + ';' + PAGE_SCRIPT + '</' + 'script></body></html>';
}

const PAGE_SCRIPT = String.raw`
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const S = { tiles: [], model: null, missing: [] };
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const root = new THREE.Group(); scene.add(root);
const helpers = new THREE.Group(); scene.add(helpers);
const pmrem = new THREE.PMREMGenerator(renderer);

const manager = new THREE.LoadingManager();
manager.onError = (url) => { S.missing.push(url.replace(location.origin, '')); };
const dracoL = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const ktx2L = new KTX2Loader().setTranscoderPath(THREE_CDN + '/examples/jsm/libs/basis/').detectSupport(renderer);
const loader = new GLTFLoader(manager).setDRACOLoader(dracoL).setKTX2Loader(ktx2L).setMeshoptDecoder(MeshoptDecoder);

function checkerTexture() {
  const n = 512, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), cells = 8, s = n / cells;
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    g.fillStyle = (x + y) % 2 ? '#d94f3d' : '#f2f2f2'; g.fillRect(x*s, y*s, s, s);
  }
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
  for (let i = 0; i <= cells; i++) { g.beginPath(); g.moveTo(i*s,0); g.lineTo(i*s,n); g.moveTo(0,i*s); g.lineTo(n,i*s); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function matcapTexture() {
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(n*0.35, n*0.3, n*0.05, n*0.5, n*0.5, n*0.6);
  rg.addColorStop(0,'#ffffff'); rg.addColorStop(0.45,'#9aa4ae'); rg.addColorStop(1,'#20262c');
  g.fillStyle = rg; g.fillRect(0,0,n,n);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const CHECKER = checkerTexture(), MATCAP = matcapTexture();
const RULER_UNIT = 1, RULER_MINOR = 0.25;

// Bounded rectangle of rules in the XY plane — the backdrop a front orthographic
// view reads height against. GridHelper can't do this: it's XZ and unbounded.
// One-unit staff, banded every minor step. Red bands read as a scale marker
// rather than as part of the model.
function rulerStaff(major, minor) {
  const g = new THREE.Group();
  const w = major * 0.035, bands = Math.round(major / minor) * 2, bh = major / bands;
  for (let i = 0; i < bands; i++) {
    const top = i >= bands - 2;
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(w, bh, w),
      new THREE.MeshBasicMaterial({ color: top ? (i % 2 ? 0xc0392b : 0xa93226) : (i % 2 ? 0xe8e8e8 : 0x2a2a2a) })
    );
    seg.position.y = bh * (i + 0.5);
    g.add(seg);
  }
  return g;
}

function wallGrid(w, h, minor, major) {
  const g = new THREE.Group();
  const mk = (pts, colour, opacity, width) => {
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: opacity, linewidth: width });
    return new THREE.LineSegments(geo, m);
  };
  const minorPts = [], majorPts = [], V = THREE.Vector3;
  for (let x = 0; x <= w + 1e-6; x += minor) {
    const near = Math.abs(x / major - Math.round(x / major)) < 1e-6;
    (near ? majorPts : minorPts).push(new V(x, 0, 0), new V(x, h, 0));
  }
  for (let y = 0; y <= h + 1e-6; y += minor) {
    const near = Math.abs(y / major - Math.round(y / major)) < 1e-6;
    (near ? majorPts : minorPts).push(new V(0, y, 0), new V(w, y, 0));
  }
  g.add(mk(minorPts, 0x9a9a94, 0.5), mk(majorPts, 0x55534e, 0.9));
  const b = [new V(0,0,0), new V(w,0,0), new V(w,0,0), new V(w,h,0), new V(w,h,0), new V(0,h,0), new V(0,h,0), new V(0,0,0)];
  g.add(mk(b, 0x3c3c3c, 1));
  g.position.x = -w / 2;
  return g;
}
const PRESETS = { front:[0,0], back:[180,0], left:[-90,0], right:[90,0], top:[0,89.9], bottom:[0,-89.9], iso:[35,25], 'iso-back':[215,25], hero:[25,12] };

// Snap to a 1/2/5 x 10^k step so grid lines land on round metric values.
function niceStep(x) {
  const k = Math.pow(10, Math.floor(Math.log10(x))), n = x / k;
  return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * k;
}
function formatLength(m) {
  if (m < 0.01) return Math.round(m * 1000) + ' mm';
  if (m < 1) return +(m * 100).toFixed(m * 100 < 10 ? 1 : 0) + ' cm';
  return +m.toFixed(2) + ' m';
}
function labelSprite(text, worldHeight) {
  const pad = 8, fs = 64;
  const c = document.createElement('canvas');
  const g0 = c.getContext('2d'); g0.font = fs + 'px ui-monospace, monospace';
  c.width = Math.ceil(g0.measureText(text).width) + pad * 2;
  c.height = fs + pad * 2;
  const g = c.getContext('2d');
  g.font = fs + 'px ui-monospace, monospace';
  g.fillStyle = '#1a1a1a'; g.textBaseline = 'top';
  g.fillText(text, pad, pad);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  sp.renderOrder = 1000;
  sp.scale.set(worldHeight * (c.width / c.height), worldHeight, 1);
  return sp;
}

// The stock depth material writes non-linear clip-space z, which clamps to near-black
// for anything but a razor-thin frustum. Patch it to emit linear view distance instead.
const DEPTH_MAT = new THREE.MeshDepthMaterial();
DEPTH_MAT.userData.u = { uNear: { value: 0 }, uFar: { value: 1 } };
DEPTH_MAT.onBeforeCompile = (sh) => {
  sh.uniforms.uNear = DEPTH_MAT.userData.u.uNear;
  sh.uniforms.uFar = DEPTH_MAT.userData.u.uFar;
  sh.vertexShader = 'varying float vLinZ;\n' + sh.vertexShader.replace(
    '#include <project_vertex>', '#include <project_vertex>\n vLinZ = -mvPosition.z;');
  sh.fragmentShader = 'uniform float uNear;\nuniform float uFar;\nvarying float vLinZ;\n' + sh.fragmentShader.replace(
    'vec3( 1.0 - fragCoordZ )',
    'vec3( 1.0 - clamp( ( vLinZ - uNear ) / max( uFar - uNear, 1e-6 ), 0.0, 1.0 ) )');
};

// Box3.setFromObject ignores skinning, so a rigged mesh frames off its bind pose.
// Walk actual deformed vertices instead; falls back to the cheap path for static meshes.
const MAX_CLOUD = 200000;
function posedBounds(obj, keepCloud) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  const pts = [];
  let total = 0, any = false;
  obj.traverse(o => { if (o.isMesh && o.visible) total += o.geometry.attributes.position.count; });
  const stride = Math.max(1, Math.ceil(total / MAX_CLOUD));
  obj.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    any = true;
    const pos = o.geometry.attributes.position, n = pos.count;
    for (let i = 0; i < n; i++) {
      if (o.isSkinnedMesh && o.getVertexPosition) o.getVertexPosition(i, v);
      else v.fromBufferAttribute(pos, i);
      o.localToWorld(v);
      box.expandByPoint(v);
      if (keepCloud && i % stride === 0) pts.push(v.x, v.y, v.z);
    }
  });
  if (keepCloud) S.cloud = new Float32Array(pts);
  return any && !box.isEmpty() ? box : new THREE.Box3().setFromObject(obj);
}

function setEnv(cfg) {
  scene.environment = null;
  if (cfg.env === 'neutral' || cfg.env === 'studio') {
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  }
  scene.children.filter(o => o.isLight).forEach(o => scene.remove(o));
  if (cfg.env === 'studio' || cfg.env === 'none') {
    const key = new THREE.DirectionalLight(0xffffff, cfg.env === 'none' ? 3 : 1.6);
    key.position.set(3,5,4); key.castShadow = true;
    key.shadow.mapSize.set(2048,2048); key.shadow.bias = -0.0008;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-4,2,-3); scene.add(fill);
    scene.add(new THREE.AmbientLight(0xffffff, cfg.env === 'none' ? 0.6 : 0.2));
  } else if (cfg.shadow) {
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3,5,4); key.castShadow = true;
    key.shadow.mapSize.set(2048,2048); key.shadow.bias = -0.0008;
    scene.add(key);
  }
}

window.API = {
  async load(url, cfg) {
    root.clear(); helpers.clear(); S.missing = [];
    const gltf = await loader.loadAsync(url);
    const obj = gltf.scene;
    obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.orig = o.material; } });
    root.add(obj); S.model = obj;


    const raw = posedBounds(obj);
    S.pivot = { min: raw.min.toArray(), max: raw.max.toArray() };
    obj.position.sub(raw.getCenter(new THREE.Vector3()));
    obj.updateMatrixWorld(true);

    S.box = posedBounds(obj, true);
    S.radius = S.box.getBoundingSphere(new THREE.Sphere()).radius;
    S.center = S.box.getCenter(new THREE.Vector3());
    setEnv(cfg);
    return this.stats();
  },

  // --compare: all models in one scene, standing on a shared baseline in input
  // order, packed into equal-width rows. Equal width means one camera serves every
  // row, so scale is comparable down the page as well as across it.
  async loadMany(urls, meta, cfg) {
    root.clear(); helpers.clear(); S.missing = [];
    const items = [];
    for (let i = 0; i < urls.length; i++) {
      const gltf = await loader.loadAsync(urls[i]);
      const obj = gltf.scene;
      obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.orig = o.material; } });
      root.add(obj);
      const box = posedBounds(obj);
      const sz = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      obj.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));   // base at y=0, centred in x/z
      items.push({ obj, w: sz.x, h: sz.y, name: meta[i].name, kit: meta[i].kit });
    }
    S.model = root;

    const gap = RULER_UNIT * 0.18;
    const total = items.reduce((a, it) => a + it.w + gap, 0) - gap;
    const rowH = RULER_UNIT;
    const nRows = Math.max(1, Math.ceil(total / (rowH * 7)));
    const rowW = Math.max(total / nRows, RULER_UNIT) + RULER_UNIT * 1.1;  // margin for both staffs

    S.rows = []; let row = [], x = 0;
    for (const it of items) {
      if (row.length && x + it.w > rowW - RULER_UNIT * 1.1) { S.rows.push({ items: row, w: x - gap }); row = []; x = 0; }
      it.cx = x + it.w / 2;
      row.push(it); x += it.w + gap;
    }
    if (row.length) S.rows.push({ items: row, w: x - gap });
    S.rowW = rowW; S.rowH = rowH;

    for (const r of S.rows) for (const it of r.items) it.obj.position.x += it.cx - r.w / 2;
    root.updateMatrixWorld(true);
    setEnv(cfg);
    return {
      rowW, rowH, missingResources: S.missing.slice(),
      rows: S.rows.map(r => ({
        items: r.items.map(it => ({ name: it.name, kit: it.kit, h: +it.h.toFixed(2), cx: it.cx - r.w / 2 }))
      }))
    };
  },

  showRow(i) {
    S.rows.forEach((r, ri) => r.items.forEach(it => it.obj.visible = (ri === i)));
    S.box = new THREE.Box3(new THREE.Vector3(-S.rowW/2, 0, -S.rowW/2), new THREE.Vector3(S.rowW/2, S.rowH, S.rowW/2));
    S.center = new THREE.Vector3(0, S.rowH / 2, 0);
    S.radius = S.rowW;
    S.cloud = null;
  },

  stats() {
    let tris = 0, verts = 0, meshes = 0, draws = 0;
    const mats = new Set(), texs = new Set();
    S.model.traverse(o => {
      if (!o.isMesh) return;
      meshes++; draws += Array.isArray(o.material) ? o.material.length : 1;
      const g = o.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      verts += g.attributes.position.count;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        if (!m) return; mats.add(m.uuid);
        ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap'].forEach(k => { if (m[k]) texs.add(m[k].uuid); });
      });
    });
    const s = S.box.getSize(new THREE.Vector3());
    return {
      meshes, drawCalls: draws, triangles: Math.round(tris), vertices: verts,
      materials: mats.size, textures: texs.size,
      missingResources: S.missing.slice(),
      boundsSize: s.toArray().map(v => +v.toFixed(4)),
      boundsMin: S.box.min.toArray().map(v => +v.toFixed(4)),
      boundsMax: S.box.max.toArray().map(v => +v.toFixed(4)),
      radius: +S.radius.toFixed(4),
      // bounds as authored, before the renderer recentres the model
      originBoundsMin: S.pivot ? S.pivot.min.map(v => +v.toFixed(4)) : null,
      originBoundsMax: S.pivot ? S.pivot.max.map(v => +v.toFixed(4)) : null
    };
  },

  // hard cap: --isolate on a many-part model would otherwise fire off hundreds of renders
  meshNames() {
    const out = [];
    S.model.traverse(o => { if (o.isMesh && out.length < 32) out.push(o.name || ('mesh_' + out.length)); });
    return out;
  },

  applyMode(mode) {
    S.model.traverse(o => {
      if (!o.isMesh) return;
      const orig = o.userData.orig;
      if (mode === 'pbr') { o.material = orig; return; }
      let m;
      if (mode === 'clay') m = new THREE.MeshStandardMaterial({ color: 0xd9d4cc, roughness: 0.85, metalness: 0 });
      else if (mode === 'wireframe') m = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, wireframe: true });
      else if (mode === 'normal') m = new THREE.MeshNormalMaterial();
      else if (mode === 'depth') m = DEPTH_MAT;
      else if (mode === 'uv') m = new THREE.MeshBasicMaterial({ map: CHECKER });
      else if (mode === 'matcap') m = new THREE.MeshMatcapMaterial({ matcap: MATCAP });
      // normal blending + no depth write: overlapping shells accumulate, so thickness
      // reads as density on a light background (additive only works on a dark one)
      else if (mode === 'xray') m = new THREE.MeshBasicMaterial({ color: 0x1f6feb, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
      o.material = Array.isArray(orig) ? orig.map(() => m) : m;
    });
  },

  setHelpers(cfg, dir, aspect) {
    helpers.clear();
    const r = S.radius;
    const floorY = S.box.min.y;
    const major = RULER_UNIT, minor = RULER_MINOR;

    if (cfg.compare) {
      helpers.add(wallGrid(S.rowW, S.rowH, minor, major));
      for (const sign of [-1, 1]) {
        const st = rulerStaff(major, minor);
        st.position.set(sign * (S.rowW / 2 - major * 0.14), 0, major * 0.02);
        helpers.add(st);
      }
      return;
    }

    if (cfg.grid) {
      const span = Math.ceil(Math.max(r * 2.4, major) / major) * major;
      const mkGrid = (step, colour, opacity) => {
        const g = new THREE.GridHelper(span, Math.round(span / step), colour, colour);
        g.material.transparent = true; g.material.opacity = opacity;
        return g;
      };
      const floor = new THREE.Group();
      floor.add(mkGrid(minor, 0xb4b4b4, 0.45), mkGrid(major, 0x6e6e6e, 0.85));
      floor.position.y = floorY;
      helpers.add(floor);
    }

    if (cfg.ruler) {
      const st = rulerStaff(major, minor);
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), dir).normalize();
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      st.position.copy(S.center).addScaledVector(right, -(r + major * 0.12));
      st.position.y = floorY;
      helpers.add(st);
    }

    if (cfg.axes) { const ax = new THREE.AxesHelper(r * 1.2); ax.position.copy(S.box.min); helpers.add(ax); }
    if (cfg.bbox) helpers.add(new THREE.Box3Helper(S.box.clone(), 0xff3b30));
    if (cfg.shadow) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(r*20, r*20), new THREE.ShadowMaterial({ opacity: 0.28 }));
      g.rotation.x = -Math.PI/2; g.position.y = S.box.min.y - r*0.001; g.receiveShadow = true;
      helpers.add(g);
    }
  },

  async render(cfg) {
    const W = Math.round(cfg.width * cfg.dpr), H = Math.round(cfg.height * cfg.dpr);
    renderer.setSize(W, H, false);
    renderer.toneMapping = ({ agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, linear: THREE.LinearToneMapping, none: THREE.NoToneMapping })[cfg.tone] || THREE.AgXToneMapping;
    renderer.toneMappingExposure = cfg.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const bg = cfg.mode === 'depth' ? '#000000' : cfg.bg;
    scene.background = bg === 'transparent' ? null : new THREE.Color(bg);
    renderer.setClearAlpha(bg === 'transparent' ? 0 : 1);

    if (cfg.isolateIndex >= 0) { let i = 0; S.model.traverse(o => { if (o.isMesh) { o.visible = (i === cfg.isolateIndex); i++; } }); }
    else S.model.traverse(o => { if (o.isMesh) o.visible = true; });

    const p = PRESETS[cfg.preset] || PRESETS.iso;
    const az = p[0] * Math.PI/180, el = p[1] * Math.PI/180;

    const aspect = W/H, r = S.radius;
    const dir = new THREE.Vector3(Math.cos(el)*Math.sin(az), Math.sin(el), Math.cos(el)*Math.cos(az));
    const up = new THREE.Vector3(0,1,0);
    const right = new THREE.Vector3().crossVectors(up, dir).normalize();
    if (right.lengthSq() < 1e-6) right.set(1,0,0);
    const vup = new THREE.Vector3().crossVectors(dir, right).normalize();

    // Project the 8 bbox corners onto the camera basis so framing is view-dependent
    // (a sphere fit wastes half the frame on anything that isn't roughly cubic).
    const tv = Math.tan((cfg.fov*Math.PI/180)/2), th = tv * aspect;
    let maxX = 0, maxY = 0, maxD = 0, minD = 0, dist = 0, offX = 0, offY = 0;

    // The ruler stands outside the model, so framing computed from model vertices
    // alone always crops it. Fold its corners into the point set being framed.
    let cloud = S.cloud;
    if (cloud && cfg.ruler && !cfg.compare) {
      const off = S.radius + RULER_UNIT * 0.12, hw = RULER_UNIT * 0.0175;
      const y0 = S.box.min.y, y1 = y0 + RULER_UNIT;
      const ex = [];
      for (const sx of [-off - hw, -off + hw]) for (const y of [y0, y1]) for (const sz of [-hw, hw]) {
        ex.push(S.center.x + right.x * sx + sz * dir.x,
                y,
                S.center.z + right.z * sx + sz * dir.z);
      }
      const merged = new Float32Array(cloud.length + ex.length);
      merged.set(cloud); merged.set(ex, cloud.length);
      cloud = merged;
    }
    if (cloud) {
      const cx = S.center.x, cy = S.center.y, cz = S.center.z;
      let miX = Infinity, maX = -Infinity, miY = Infinity, maY = -Infinity;
      minD = Infinity;
      for (let i = 0; i < cloud.length; i += 3) {
        const x = cloud[i]-cx, y = cloud[i+1]-cy, z = cloud[i+2]-cz;
        const px = x*right.x + y*right.y + z*right.z;
        const py = x*vup.x + y*vup.y + z*vup.z;
        const pd = x*dir.x + y*dir.y + z*dir.z;
        if (px < miX) miX = px; if (px > maX) maX = px;
        if (py < miY) miY = py; if (py > maY) maY = py;
        if (pd > maxD) maxD = pd;
        if (pd < minD) minD = pd;
      }
      offX = (miX + maX) / 2; offY = (miY + maY) / 2;
      maxX = (maX - miX) / 2; maxY = (maY - miY) / 2;
      for (let i = 0; i < cloud.length; i += 3) {
        const x = cloud[i]-cx, y = cloud[i+1]-cy, z = cloud[i+2]-cz;
        const px = Math.abs(x*right.x + y*right.y + z*right.z - offX);
        const py = Math.abs(x*vup.x + y*vup.y + z*vup.z - offY);
        const pd = x*dir.x + y*dir.y + z*dir.z;
        const need = Math.max(px/th, py/tv) + pd;   // distance putting this point on the frustum edge
        if (need > dist) dist = need;
      }
    } else { maxX = maxY = maxD = r; minD = -r; dist = r / Math.sin((cfg.fov*Math.PI/180)/2); }

    let cam;
    if (cfg.compare) {
      // Fixed orthographic box: identical for every row, and linear, so label
      // positions can be derived from world x without projecting.
      const hw = S.rowW / 2, hh = hw / aspect;
      cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.001, S.rowW * 20);
      cam.position.set(0, S.rowH / 2, S.rowW * 5);
      cam.lookAt(0, S.rowH / 2, 0);
      cam.updateProjectionMatrix();
      this.applyMode(cfg.mode);
      this.setHelpers(cfg, new THREE.Vector3(0,0,1), aspect);
      renderer.render(scene, cam);
      const c2 = document.createElement('canvas');
      c2.width = cfg.width; c2.height = cfg.height;
      c2.getContext('2d').drawImage(renderer.domElement, 0, 0, cfg.width, cfg.height);
      if (cfg.keepTile) S.tiles.push({ bmp: await createImageBitmap(c2), label: '' });
      return c2.toDataURL('image/png').split(',')[1];
    }
    this.applyMode(cfg.mode);
    this.setHelpers(cfg, dir, aspect);
    const target = S.center.clone().addScaledVector(right, offX).addScaledVector(vup, offY);
    if (cfg.ortho) {
      const h = Math.max(maxY, maxX / aspect) * cfg.fit;
      dist = r * 4;
      cam = new THREE.OrthographicCamera(-h*aspect, h*aspect, h, -h, 0.001, dist + r * 4);
    } else {
      dist *= cfg.fit;
      // depth mode needs the near/far planes hugging the model or everything clamps to black
      const pad = cfg.mode === 'depth' ? r * 1.02 : r * 2;
      cam = new THREE.PerspectiveCamera(cfg.fov, aspect, Math.max(dist - pad, r*0.005), dist + pad);
    }
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.lookAt(target); cam.updateProjectionMatrix();
    if (cfg.mode === 'depth') {
      DEPTH_MAT.userData.u.uNear.value = dist - maxD;
      DEPTH_MAT.userData.u.uFar.value = dist - minD;
    }

    const key = scene.children.find(o => o.isDirectionalLight && o.castShadow);
    if (key) {
      key.position.copy(cam.position).multiplyScalar(0.6).add(new THREE.Vector3(r, r*1.5, r*0.5));
      const c = key.shadow.camera;
      c.left=-r*2; c.right=r*2; c.top=r*2; c.bottom=-r*2; c.near=0.01; c.far=dist*4;
      c.updateProjectionMatrix();
      key.target.position.copy(S.center); key.target.updateMatrixWorld();
    }

    renderer.render(scene, cam);

    let src = renderer.domElement;
    if (cfg.dpr !== 1) {
      const c = document.createElement('canvas');
      c.width = cfg.width; c.height = cfg.height;
      c.getContext('2d').drawImage(src, 0, 0, cfg.width, cfg.height);
      src = c;
    }
    if (cfg.keepTile) S.tiles.push({ bmp: await createImageBitmap(src), label: cfg.label || '' });
    return src.toDataURL('image/png').split(',')[1];
  },

  // Stack the row strips and caption each model beneath its own position. Labels
  // step through three heights so neighbours never collide.
  async compareSheet(rowsMeta, cfg) {
    const tw = cfg.width, th = cfg.height, pad = 26;
    const line = Math.max(13, Math.round(tw / 78)), lead = Math.round(line * 1.5);
    const levels = 3, block = levels * lead * 2 + lead;
    const c = document.createElement('canvas');
    c.width = tw + pad * 2;
    c.height = pad + S.tiles.length * (th + block);
    const g = c.getContext('2d');
    g.fillStyle = cfg.bg === 'transparent' ? '#ffffff' : cfg.bg;
    g.fillRect(0, 0, c.width, c.height);
    g.textAlign = 'center';
    for (let ri = 0; ri < S.tiles.length; ri++) {
      const y = pad + ri * (th + block);
      g.drawImage(S.tiles[ri].bmp, pad, y, tw, th);
      const items = rowsMeta[ri].items;
      items.forEach((it, i) => {
        const sx = pad + (it.cx / cfg.rowW + 0.5) * tw;
        const ly = y + th + lead + (i % levels) * lead * 2;
        if (it.kit) {
          g.font = line + 'px ui-sans-serif, system-ui, sans-serif';
          g.fillStyle = '#a8a29a';
          g.fillText(it.kit, sx, ly);
        }
        g.font = '600 ' + Math.round(line * 1.15) + 'px ui-sans-serif, system-ui, sans-serif';
        g.fillStyle = '#3a3a38';
        g.fillText(it.name + '  h=' + it.h.toFixed(2), sx, ly + lead);
      });
    }
    return c.toDataURL('image/png').split(',')[1];
  },

  clearTiles() { S.tiles.forEach(t => t.bmp.close && t.bmp.close()); S.tiles = []; },

  async sheet(cfg) {
    const n = S.tiles.length; if (!n) return null;
    const cols = cfg.sheetCols > 0 ? cfg.sheetCols : Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const t = cfg.sheetTile, pad = Math.round(t*0.03), lab = cfg.sheetLabels ? Math.round(t*0.09) : 0;
    const c = document.createElement('canvas');
    c.width = cols*(t+pad)+pad; c.height = rows*(t+pad+lab)+pad;
    const g = c.getContext('2d');
    if (cfg.bg !== 'transparent') { g.fillStyle = cfg.bg; g.fillRect(0,0,c.width,c.height); }
    g.font = Math.round(t*0.055) + 'px ui-monospace, monospace';
    g.textBaseline = 'top';
    S.tiles.forEach((tile, i) => {
      const x = pad + (i%cols)*(t+pad), y = pad + Math.floor(i/cols)*(t+pad+lab);
      g.drawImage(tile.bmp, x, y, t, t);
      if (lab) { g.fillStyle = '#333'; g.fillText(tile.label, x+2, y+t+pad*0.4); }
    });
    return c.toDataURL('image/png').split(',')[1];
  }
};
window.__ready = true;
`;

const browser = await chromium.launch({
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist','--enable-gpu-rasterization','--disable-dev-shm-usage',
    '--force-color-profile=srgb','--disable-lcd-text'],
});
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
if (opts.verbose) page.on('console', m => console.log('  [page]', m.text()));
page.on('pageerror', e => console.error('  [page error]', e.message));
await page.goto(ORIGIN + '/index.html', { waitUntil: 'load', timeout: opts.timeout });
await page.waitForFunction('window.__ready === true', null, { timeout: opts.timeout });

await fs.mkdir(opts.out, { recursive: true });
const cfgBase = {
  width: opts.width, height: opts.height, dpr: opts.dpr,
  bg: opts.bg, env: opts.env, exposure: opts.exposure, tone: opts.tone,
  fit: opts.fit, fov: opts.fov, ortho: opts.ortho,
  shadow: opts.shadow, grid: opts.grid, axes: opts.axes, bbox: opts.bbox, ruler: opts.ruler,
  compare: opts.compare,
  isolateIndex: -1,
  sheetCols: opts.sheetCols, sheetTile: opts.sheetTile, sheetLabels: opts.sheetLabels,
};

const write = async (file, b64) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.from(b64, 'base64'));
  console.log('  ->', path.relative(process.cwd(), file));
};

let failures = 0, warnings = 0;

if (opts.compare) {
  const meta = [];
  for (const f of models) meta.push({ name: path.basename(f).replace(/\.(glb|gltf)$/i, ''), kit: await kitName(f) });
  const layout = await page.evaluate(([urls, m, cfg]) => window.API.loadMany(urls, m, cfg),
    [modelUrls.map(u => ORIGIN + u), meta, cfgBase]);
  if (layout.missingResources.length) {
    warnings += layout.missingResources.length;
    for (const u of layout.missingResources)
      console.warn('! missing resource: ' + decodeURIComponent(u.replace(/^\/asset\/f\d+\//, '')) + '  (renders untextured)');
  }
  console.log('compare: ' + models.length + ' models, ' + layout.rows.length + ' row(s), '
    + layout.rowW.toFixed(2) + ' m wide');
  cfgBase.rowW = layout.rowW;
  const rowH = Math.round(opts.width * (layout.rowH / layout.rowW));

  for (const mode of modes) {
    await page.evaluate(() => window.API.clearTiles());
    for (let ri = 0; ri < layout.rows.length; ri++) {
      await page.evaluate(i => window.API.showRow(i), ri);
      const cfg = { ...cfgBase, mode, preset: 'front', height: rowH, keepTile: true };
      const b64 = await page.evaluate(c => window.API.render(c), cfg);
      if (!opts.sheetOnly && layout.rows.length > 1)
        await write(path.join(opts.out, 'compare_' + mode + '_row' + (ri + 1) + '.png'), b64);
    }
    const b64 = await page.evaluate(([r, cfg]) => window.API.compareSheet(r, cfg),
      [layout.rows, { ...cfgBase, height: rowH }]);
    await write(path.join(opts.out, 'compare_' + mode + '.png'), b64);
  }
  if (opts.stats) await fs.writeFile(path.join(opts.out, 'compare.stats.json'), JSON.stringify(layout, null, 2));
  await browser.close(); server.close();
  console.log(warnings ? 'done with ' + warnings + ' warning(s)' : 'done');
  process.exit(0);
}

for (let i = 0; i < models.length; i++) {
  const file = models[i];
  const name = path.basename(file).replace(/\.(glb|gltf)$/i, '');
  console.log('[' + (i+1) + '/' + models.length + '] ' + name);
  const dir = path.join(opts.out, name);
  try {
    const stats = await page.evaluate(([url, cfg]) => window.API.load(url, cfg), [ORIGIN + modelUrls[i], cfgBase]);
    if (opts.stats) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, name + '.stats.json'), JSON.stringify({ file, ...stats }, null, 2));
    }
    if (stats.missingResources.length) {
      warnings++;
      for (const u of stats.missingResources)
        console.warn('  ! missing resource: ' + decodeURIComponent(u.replace(/^\/asset\/f\d+\//, '')) + '  (renders untextured)');
    }
    if (opts.verbose) console.log('  ', stats.triangles + ' tris,', stats.meshes + ' meshes,', stats.materials + ' mats');

    await page.evaluate(() => window.API.clearTiles());

    const jobs = [];
    if (opts.isolate) {
      const names = await page.evaluate(() => window.API.meshNames());
      names.forEach((mn, idx) => jobs.push({ mode: modes[0], view: views[0], isolateIndex: idx, label: mn.slice(0,22) }));
    } else {
      for (const mode of modes) for (const view of views)
        jobs.push({ mode, view, isolateIndex: -1, label: modes.length > 1 ? mode + ' / ' + view.name : view.name });
    }

    for (const j of jobs) {
      const cfg = { ...cfgBase, mode: j.mode, isolateIndex: j.isolateIndex,
        preset: j.view.preset,
        keepTile: opts.sheet, label: j.label };
      const b64 = await page.evaluate(c => window.API.render(c), cfg);
      if (!opts.sheetOnly) {
        const fn = j.isolateIndex >= 0
          ? 'iso_' + String(j.isolateIndex).padStart(3,'0') + '_' + j.label.replace(/[^\w.-]/g,'_')
          : j.mode + '_' + j.view.name;
        await write(path.join(dir, fn + '.png'), b64);
      }
    }

    if (opts.sheet) {
      const b64 = await page.evaluate(c => window.API.sheet(c), cfgBase);
      if (b64) await write(path.join(opts.out, name + '_sheet.png'), b64);
    }
  } catch (e) { failures++; console.error('  x failed:', e.message); }
}

await browser.close();
server.close();
const tail = [failures ? failures + ' failure(s)' : '', warnings ? warnings + ' warning(s)' : ''].filter(Boolean);
console.log(tail.length ? 'done with ' + tail.join(', ') : 'done');
process.exit(failures ? 1 : 0);
