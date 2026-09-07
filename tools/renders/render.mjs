#!/usr/bin/env node
// render.mjs — headless GLB renderer (Playwright + three.js via CDN)

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Only the pin for the CDN fallback. By default the page is served three.js from
// whatever copy is installed on this machine (see resolveThree), which needs no
// network and keeps a run reproducible against a known library.
const THREE_VERSION = '0.169.0';

const DEFAULTS = {
  out: './renders', modes: 'pbr', views: 'iso',
  width: 1024, height: 1024,
  bg: '#f2f2f0', env: 'neutral', exposure: 1, tone: 'agx',
  fit: 1.06, compare: false, fov: 35, ortho: false,
  grid: false, axes: false, bbox: false, ruler: false,
  isolate: false,
  sheet: false, sheetCols: 0, sheetTile: 512, sheetLabels: true, sheetOnly: false,
  sheetEach: false, band: '',
  stats: false, timeout: 120000, verbose: false, three: '',
  ladder: 0, annotate: false, lockScale: false, sheetPad: -1,
  ss: 1,
};

// min/max/integer per numeric flag. Unbounded numbers used to produce silent
// degenerate output: --fov 0 puts the camera at infinity, --width 0 makes aspect NaN.
const RANGES = {
  width: [16, 8192, true], height: [16, 8192, true],
  exposure: [0.01, 20], fit: [0.1, 10], fov: [1, 170],
  sheetCols: [0, 64, true], sheetTile: [16, 4096, true], sheetPad: [-1, 512, true],
  timeout: [1000, 3600000, true], ladder: [0, 8, true], ss: [1, 4, true],
};

const HELP = `
render.mjs <file.glb|dir> [...] [flags]
  --out <dir>  --modes <pbr,albedo,clay,claywire,wireframe,normal,faceorient,
                        silhouette,depth,uv,matcap,xray|all>
  --views <front,back,left,right,top,bottom,iso,iso-back,hero | az/el[o|p], e.g. 35/20, 0/0o>
                     (--ladder also uses auto-sil / auto-vert: direction from the bbox)
  --ladder <1..8>   nested default view set; implies --annotate --lock-scale --sheet
  --annotate         burn caption + axis gizmo into every tile
  --lock-scale       one camera distance from the bounding sphere for all views (comparable scale)
  --width/--height   --ss <1-4>  supersample factor, downscaled on output
                     (smooths edges, but also thins 1px wires -- see --modes wireframe)
  --bg <css|transparent> --exposure <n>
  --env <neutral|studio|direct|none>   none = no lights and no environment at all
  --tone <agx|aces|neutral|linear|none>  --fov <deg> --fit <n> --ortho
  --compare          all models side by side in one scene, front-on, with grid + ruler
  --grid --axes --bbox --ruler
  --isolate          one tile per mesh (max 32), each fitted to its own bounds;
                     add --lock-scale to keep the parts size-comparable instead
  --sheet [--sheet-cols n] [--sheet-tile px] [--no-sheet-labels] [--sheet-only]
                     --sheet-only implies --sheet. Several models in one run share
                     one sheet, labelled per model; --sheet-each writes the old one
                     per model instead. --ladder and --isolate always sheet per model.
  --band <col,row>   keep one cell of the colormap and flatten every other filled
                     cell to grey, so only the triangles carrying that band stay
                     coloured. Cells are the 16x4 grid of kits/colormap.png, so
                     --band 2,0 is bark. Reads the base-colour texture the model
                     already carries; the atlas on disk is not touched.
  --stats            <name>.stats.json next to the tiles: counts, bounds, mesh
                     integrity, UV layout and the palette the model actually uses
  --three <dir|url>  where the page gets three.js: a package directory or a base
                     URL. Default: the installed three (vendor/three next to this
                     script, then node_modules, then NODE_PATH), else the CDN.
                     The library version changes lit output, so it is reported on
                     every run and recorded in --stats.
  --timeout <ms> --verbose

Unknown flags, modes, views, tones and envs are rejected before launch.
Missing external textures warn on stdout; exit code stays 0.
Inverted faces: read them off --modes faceorient (front blue / back red) or the
magenta backfaces in clay/claywire. The pbr pass keeps each material's own side
setting, so a single-sided inverted face is culled there and shows no flag at all.
`;

function die(msg) { console.error('error: ' + msg); console.error(HELP); process.exit(2); }

function parseArgs(argv) {
  // `given` is the set of keys the caller actually named. --no-grid and --grid both
  // land on a boolean, and an explicit --bg #f2f2f0 is indistinguishable from the
  // default, so "did the caller touch this?" cannot be answered by comparing values.
  const o = { ...DEFAULTS, inputs: [], given: new Set() };
  const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    if (!a.startsWith('--')) { o.inputs.push(a); continue; }
    let key = camel(a.slice(2));
    if (/^no[A-Z]/.test(key)) {
      const k = key[2].toLowerCase() + key.slice(3);
      if (typeof DEFAULTS[k] !== 'boolean') die('unknown flag: ' + a);
      o[k] = false; o.given.add(k); continue;
    }
    const cur = DEFAULTS[key];
    if (cur === undefined) die('unknown flag: ' + a);
    o.given.add(key);
    if (typeof cur === 'boolean') { o[key] = true; continue; }
    const val = argv[++i];
    if (val === undefined) die(a + ' needs a value');
    if (typeof cur === 'number') {
      const n = Number(val);
      if (!Number.isFinite(n)) die(a + ' needs a number, got: ' + val);
      const rg = RANGES[key];
      if (rg) {
        if (rg[2] && !Number.isInteger(n)) die(a + ' needs a whole number, got: ' + val);
        if (n < rg[0] || n > rg[1]) die(a + ' must be ' + rg[0] + '..' + rg[1] + ', got: ' + val);
      }
      o[key] = n;
    } else o[key] = val;
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.inputs.length) { console.log(HELP); process.exit(1); }
// --sheet-only alone used to render everything, write nothing and exit 0.
if (opts.sheetOnly) opts.sheet = true;

// The colormap grid of kits/colormap.png, which is what --band addresses.
const BAND_COLUMNS = 16, BAND_ROWS = 4;
if (opts.band) {
  const m = opts.band.match(/^(\d+),(\d+)$/);
  if (!m) die('--band needs col,row (e.g. 2,0), got: ' + opts.band);
  if (+m[1] >= BAND_COLUMNS || +m[2] >= BAND_ROWS)
    die('--band is outside the ' + BAND_COLUMNS + 'x' + BAND_ROWS + ' grid: ' + opts.band);
}
const bandSuffix = opts.band ? '_band' + opts.band.replace(',', '-') : '';

const ALL_MODES = ['pbr','albedo','clay','claywire','wireframe','normal','faceorient','silhouette','depth','uv','matcap','xray'];
const ALL_VIEWS = ['front','back','left','right','top','bottom','iso','iso-back','hero'];

// Strictly nested view budget. Tier N is tier N-1 plus the next tile(s).
// v8: back PBR moved above the horizon (215/-30 was underlit mud), normals from
// below promoted to tile 4 (best defect signal per pixel: inverted winding, edge
// splits), top clay+wire added (catches coplanar/inverted shingle faces), side
// silhouette and the third low corner dropped.
const LADDER = [
  { mode:'pbr',        view:'35/25',    grid:true  },   // A: what it is, colour bands
  { mode:'claywire',   view:'215/-30'              },   // B: back + underside + topology
  { mode:'normal',     view:'-35/25'               },   // A': flipped faces, edge splits
  { mode:'claywire',   view:'0/89.9o'              },   // E: top, overlapping faces
  { mode:'pbr',        view:'145/25o'              },   // B': back colour, lit
  { mode:'claywire',   view:'35/25',    grid:true  },   // A: topology aligned with tile 1
  { mode:'normal',     view:'-145/25'              },   // B'': back-left smoothing
  { mode:'silhouette', view:'auto-sil'             },   // C: proportion, symmetry, gaps
];
// Sheet geometry per tier: [cols, cell px]. Cells are multiples of 28 and every
// sheet stays under 1568 px on the long edge and 1.15 MP, so nothing is downscaled.
// Two tiers used to break that: tier 5 was [3,504] (1512x1008 = 1.52 MP, a copy of
// tier 3's cell) and tier 1 was 1092 square (1.19 MP). Both were resized down.
// Cell size differs per tier, so the same tile from --ladder 4 and --ladder 8 is
// framed identically but rendered at a different resolution -- not byte-identical.
// Two ladder tiles pick their direction from the bounding box instead of a fixed
// angle, because a fixed one wastes a tile on outlier shapes: a front silhouette of
// a flat key is an edge-on lozenge, a top view of a chair is a back-panel slab.
//   auto-sil  looks down the SHORTEST axis -> largest projected outline.
// auto-vert is kept for callers that want it, but the ladder uses a fixed top tile:
// the wireframe top view catches coplanar and inverted faces that the silhouette
// cannot show, even when auto-sil also looks down.
// Every candidate is measured during the scale lock, so tiles stay comparable
// between models even when different models resolve to different directions.
const AUTO = {
  'auto-sil':  ['0/0o', '90/0o', '0/89.9o'],
  'auto-vert': ['0/89.9o', '0/-89.9o'],
};
function resolveAuto(token, size) {
  const [x, y, z] = size;
  if (token === 'auto-sil') {
    const min = Math.min(x, y, z);
    if (y === min) return '0/89.9o';        // flat: read it from above
    return x < z ? '90/0o' : '0/0o';         // thinnest horizontal axis; ties go to the front
  }
  const silVertical = resolveAuto('auto-sil', size) === '0/89.9o';
  return (silVertical || y >= Math.max(x, z)) ? '0/-89.9o' : '0/89.9o';
}

const LADDER_SHEET = { 1:[1,1064], 2:[2,756], 3:[3,504], 4:[2,532], 5:[3,420], 6:[3,420], 7:[4,364], 8:[4,364] };

// az/el[o|p]: azimuth 0 = front and grows CCW seen from above, elevation + = above.
// Trailing o forces orthographic for that view alone, p forces perspective.
const VIEW_RE = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)([op])?$/;
function parseView(n) {
  const m = n.match(VIEW_RE);
  // the o|p suffix belongs in the file name: 35/25o and 35/25p are different
  // renders, and without it the second silently overwrites the first on disk
  if (m) return { name: 'az' + m[1] + '_el' + m[2] + (m[3] || ''), az: +m[1], el: +m[2],
    viewOrtho: m[3] === 'o' ? true : m[3] === 'p' ? false : null,
    label: 'az' + m[1] + ' el' + m[2] };
  if (ALL_VIEWS.includes(n)) return { name: n, preset: n, viewOrtho: null, label: n };
  return null;
}
const ALL_TONES = ['agx','aces','neutral','linear','none'];
// 'direct' is the old 'none': strong key/fill/ambient, no environment map.
// 'none' now means exactly that — no lights, no environment. Only useful with
// unlit modes (albedo, silhouette, uv, wireframe, normal, depth, faceorient).
const ALL_ENVS  = ['neutral','studio','direct','none'];

// Ladder presets only fill in what the caller left alone, so any flag still wins.
let ladderJobs = null;
if (opts.ladder) {
  if (opts.compare) die('--ladder and --compare are different layouts; pick one');
  if (opts.isolate) die('--ladder and --isolate are different job sets; pick one');
  if (opts.ladder > LADDER.length) die('--ladder must be 1..' + LADDER.length);
  ladderJobs = LADDER.slice(0, opts.ladder);
  const untouched = (k) => !opts.given.has(k);
  if (untouched('bg')) opts.bg = '#7f7f7f';        // separates both dark and light models
  if (untouched('fov')) opts.fov = 28;             // ~40mm equiv: near-ortho, honest proportion
  if (untouched('fit')) opts.fit = 1.10;
  if (untouched('env')) opts.env = 'studio';
  if (untouched('tone')) opts.tone = 'none';       // sRGB only: keeps the gradient bands as authored
  const [cols, cell] = LADDER_SHEET[opts.ladder];
  if (untouched('sheetCols')) opts.sheetCols = cols;
  if (untouched('sheetTile')) opts.sheetTile = cell;
  if (untouched('width')) opts.width = cell;
  if (untouched('height')) opts.height = cell;
  if (untouched('sheetLabels')) opts.sheetLabels = false;   // captions already live in the pixels
  if (untouched('ss')) opts.ss = 2;                 // wireframe/silhouette edges are the point here
  opts.sheetPad = 0;
  // v6 advertised --lock-scale in the help and had a ladder-specific branch in the
  // lock measurement, but never set the flag, so it was dead code and every tile
  // fitted itself. The underside and footprint tiles zoomed to fill and became
  // unreadable next to the others.
  opts.annotate = true; opts.sheet = true; opts.lockScale = true;
  opts.modes = [...new Set(ladderJobs.map(j => j.mode))].join(',');
  const expand = (v) => AUTO[v] || [v];
  opts.views = [...new Set(ladderJobs.flatMap(j => expand(j.view)))].join(',');
}

const modes = opts.modes === 'all' ? ALL_MODES : opts.modes.split(',').map(s=>s.trim()).filter(Boolean);
if (opts.compare && opts.isolate) die('--compare and --isolate are different job sets; pick one');
if (opts.compare) opts.views = 'front';  // a row read against a ruler only works square-on
const viewNames = opts.views.split(',').map(s=>s.trim()).filter(Boolean);

// Fail on a typo before launching a browser: an unknown mode used to throw a raw
// page stack, an unknown view silently rendered iso under the wrong filename.
const bad = (label, got, allowed) => {
  const miss = got.filter(v => !allowed.includes(v));
  if (miss.length) die('unknown ' + label + ': ' + miss.join(', ') + '\n  allowed: ' + allowed.join(', '));
};
bad('mode', modes, ALL_MODES);
bad('tone', [opts.tone], ALL_TONES);
bad('env', [opts.env], ALL_ENVS);
if (!modes.length) die('--modes is empty');
if (!viewNames.length) die('--views is empty');

const MODE_LABEL = { pbr:'PBR', albedo:'Albedo', clay:'Clay', claywire:'Clay+wire', wireframe:'Wireframe',
  normal:'Normals', faceorient:'Face dir', silhouette:'Silhouette', depth:'Depth', uv:'UV checker',
  matcap:'Matcap', xray:'X-ray' };

const views = viewNames.map(n => {
  const v = parseView(n);
  if (!v) die('unknown view: ' + n + '\n  allowed: ' + ALL_VIEWS.join(', ') + ', or az/el[o|p] like 35/20 or 0/0o');
  return v;
});
const viewByKey = new Map(viewNames.map((n, i) => [n, views[i]]));

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
// This used to parse the GLB container only, so every .gltf -- a format the tool
// otherwise accepts -- silently reported no kit. Both containers are read here.
const MAX_JSON = 64 * 1024 * 1024;
async function assetExtras(file) {
  let fd = null;
  try {
    fd = await fs.open(file);
    // read() is not guaranteed to fill the buffer in one call; loop until it does
    const readAll = async (buf, pos) => {
      let got = 0;
      while (got < buf.length) {
        const { bytesRead } = await fd.read(buf, got, buf.length - got, pos + got);
        if (!bytesRead) break;
        got += bytesRead;
      }
      return got;
    };
    const head = Buffer.alloc(20);
    if (await readAll(head, 0) < 20) return {};
    if (head.toString('utf8', 0, 4) === 'glTF') {
      if (head.toString('utf8', 16, 20) !== 'JSON') return {};
      const len = head.readUInt32LE(12);
      if (!len || len > MAX_JSON) return {};
      const buf = Buffer.alloc(len);
      if (await readAll(buf, 20) < len) return {};
      return JSON.parse(buf.toString('utf8')).asset?.extras || {};
    }
    const { size } = await fd.stat();
    if (size > MAX_JSON) return {};
    const buf = Buffer.alloc(size);
    if (await readAll(buf, 0) < size) return {};
    return JSON.parse(buf.toString('utf8')).asset?.extras || {};
  } catch { return {}; }
  finally { if (fd) await fd.close().catch(() => {}); }
}
async function kitName(file) {
  const ex = await assetExtras(file);
  const raw = ex.bron || ex.kit || ex.source || Object.values(ex).map(v => v && v.bron).find(Boolean) || '';
  return String(raw).replace(/^KayKit\s+/i, '').replace(/\s+(Bits|Pack|Asset Pack|MegaKit)$/i, '');
}

// The page loads three.js at run time. Serving it from the local install keeps the
// render offline -- a browser that cannot reach the CDN used to hang until --timeout
// -- and pins the run to one known library. Lit modes are not version-neutral: the
// same model through 0.169.0 and 0.185.1 differs by up to 37/255 on the PBR pass, so
// the version in use is reported rather than assumed.
function resolveThree() {
  const spec = opts.three.trim();
  if (/^https?:\/\//i.test(spec)) return { base: spec.replace(/\/+$/, ''), source: 'url', version: '' };
  const here = path.dirname(fileURLToPath(import.meta.url));
  const cands = [];
  if (spec) cands.push(path.resolve(spec));
  else {
    cands.push(path.join(here, 'vendor', 'three'));
    // three's package.json is not exported, so resolve the entry point and walk up
    try { cands.push(path.resolve(path.dirname(createRequire(import.meta.url).resolve('three')), '..')); } catch {}
    for (const root of (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean))
      cands.push(path.join(root, 'three'));
  }
  for (const dir of cands) {
    if (!fss.existsSync(path.join(dir, 'build', 'three.module.js'))) continue;
    if (!fss.existsSync(path.join(dir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js'))) continue;
    let version = '';
    try { version = JSON.parse(fss.readFileSync(path.join(dir, 'package.json'), 'utf8')).version || ''; } catch {}
    return { dir, source: 'local', version };
  }
  if (spec) die('--three: no three.js package (build/three.module.js + examples/jsm) at ' + spec);
  return { base: 'https://unpkg.com/three@' + THREE_VERSION, source: 'cdn', version: THREE_VERSION };
}
const THREE_SRC = resolveThree();

const models = await collect(opts.inputs);
if (!models.length) { console.error('no .glb/.gltf inputs'); process.exit(1); }

// Output goes to <out>/<basename>/, and basenames repeat across kits -- this repo
// alone has six wall.glb and six flag.glb. Both landed in the same folder and the
// second silently destroyed the first. Only names that actually clash get qualified,
// so a single-kit run keeps its plain folder names.
const outNames = (() => {
  const base = models.map(f => path.basename(f).replace(/\.(glb|gltf)$/i, ''));
  const dup = new Set(base.filter((b, i) => base.indexOf(b) !== i));
  const used = new Set();
  return base.map((b, i) => {
    let n = dup.has(b) ? path.basename(path.dirname(models[i])) + '__' + b : b;
    if (used.has(n)) { let k = 2; while (used.has(n + '_' + k)) k++; n = n + '_' + k; }
    used.add(n);
    return n;
  });
})();
if (outNames.some((n, i) => n !== path.basename(models[i]).replace(/\.(glb|gltf)$/i, '')))
  console.warn('! duplicate model names: qualified with their folder to keep the tiles apart');

// Each file is served under its own /asset/<id>/ prefix so relative URIs inside a
// .glb or .gltf (external textures, .bin buffers) resolve against that file's folder.
const served = new Map(); let idc = 0;
const serve = (abs) => {
  const id = 'f' + idc++;
  served.set(id, path.dirname(abs));
  return '/asset/' + id + '/' + encodeURIComponent(path.basename(abs));
};
const modelUrls = models.map(serve);

const MIME = { '.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream',
  '.png':'image/png','.jpg':'image/jpeg','.ktx2':'image/ktx2',
  // a module script served as octet-stream is refused outright, and streaming
  // instantiation of the draco decoder needs the wasm type
  '.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type':'text/html' });
    return res.end(pageHTML());
  }
  const t = THREE_SRC.dir && url.pathname.match(/^\/three\/(.+)$/);
  if (t) {
    const abs = path.resolve(THREE_SRC.dir, decodeURIComponent(t[1]));
    if (abs.startsWith(THREE_SRC.dir + path.sep) && fss.existsSync(abs) && fss.statSync(abs).isFile()) {
      res.writeHead(200, { 'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'access-control-allow-origin':'*' });
      return res.end(await fs.readFile(abs));
    }
    res.writeHead(404); return res.end();
  }
  const m = url.pathname.match(/^\/asset\/(f\d+)\/(.+)$/);
  if (m && served.has(m[1])) {
    const base = served.get(m[1]);
    const abs = path.resolve(base, decodeURIComponent(m[2]));
    // startsWith(base) alone lets /models-private through for a base of /models
    if ((abs === base || abs.startsWith(base + path.sep)) && fss.existsSync(abs)) {
      res.writeHead(200, { 'content-type': MIME[path.extname(abs).toLowerCase()]||'application/octet-stream', 'access-control-allow-origin':'*' });
      return res.end(await fs.readFile(abs));
    }
  }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;

function pageHTML() {
  const cdn = THREE_SRC.dir ? ORIGIN + '/three' : THREE_SRC.base;
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
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const root = new THREE.Group(); scene.add(root);
const helpers = new THREE.Group(); scene.add(helpers);
const pmrem = new THREE.PMREMGenerator(renderer);

const manager = new THREE.LoadingManager();
manager.onError = (url) => { S.missing.push(url.replace(location.origin, '')); };
// same source as the library itself: a CDN-free run must not fall back to gstatic
const dracoL = new DRACOLoader().setDecoderPath(THREE_CDN + '/examples/jsm/libs/draco/');
const ktx2L = new KTX2Loader().setTranscoderPath(THREE_CDN + '/examples/jsm/libs/basis/').detectSupport(renderer);
const loader = new GLTFLoader(manager).setDRACOLoader(dracoL).setKTX2Loader(ktx2L).setMeshoptDecoder(MeshoptDecoder);

// A bare chequerboard shows stretching and relative texel density, but it is
// rotationally and mirror symmetric, so a rotated or flipped island looks correct.
// Each cell carries its column letter + row number and an up-arrow: mirrored text
// and sideways arrows make those two failures obvious.
function checkerTexture() {
  const n = 1024, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), cells = 8, s = n / cells;
  const COL = 'ABCDEFGH';
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    const dark = (x + y) % 2;
    g.fillStyle = dark ? '#d94f3d' : '#f2f2f2';
    g.fillRect(x*s, y*s, s, s);
    // canvas y grows downward, UV v grows upward: flip so row 1 is at the UV origin
    const label = COL[x] + (cells - y);
    g.fillStyle = dark ? 'rgba(255,255,255,.92)' : 'rgba(0,0,0,.72)';
    g.font = '700 ' + Math.round(s * 0.30) + 'px ui-monospace, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, x*s + s*0.5, y*s + s*0.58);
    g.beginPath();                                    // up-arrow: catches mirroring
    g.moveTo(x*s + s*0.5, y*s + s*0.14);
    g.lineTo(x*s + s*0.63, y*s + s*0.30);
    g.lineTo(x*s + s*0.37, y*s + s*0.30);
    g.closePath(); g.fill();
  }
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
  for (let i = 0; i <= cells; i++) { g.beginPath(); g.moveTo(i*s,0); g.lineTo(i*s,n); g.moveTo(0,i*s); g.lineTo(n,i*s); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.colorSpace = THREE.SRGBColorSpace; return t;
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

// MeshNormalMaterial encodes view-space normals, so the same face changes colour
// every time the camera moves and cross-view comparison is meaningless. We want
// world space, but writing the shader by hand loses skinning, morph targets and
// the inverse-transpose normal matrix (so any non-uniformly scaled part is wrong).
// Instead patch the stock material, which already has all three, and rotate its
// view-space normal back to world with the transpose of the view rotation — exact,
// because a view matrix's upper 3x3 is a pure rotation. Backfaces go flat magenta
// so inverted or missing winding reads as a flag rather than a plausible shade.
const WORLD_NORMAL_MAT = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
WORLD_NORMAL_MAT.onBeforeCompile = (sh) => {
  // Three rewrote this line between 0.169 and 0.185: the packNormalToRGB call was
  // inlined AND #include <packing> was dropped from this shader, so the function is
  // no longer declared here. Each form therefore needs its own replacement -- calling
  // packNormalToRGB on 0.185 links nothing and the pass renders an empty frame.
  const FORMS = [
    ['packNormalToRGB( normal )', 'packNormalToRGB( normalize( normal * mat3( viewMatrix ) ) )'],
    ['normalize( normal ) * 0.5 + 0.5', 'normalize( normal * mat3( viewMatrix ) ) * 0.5 + 0.5'],
  ];
  const form = FORMS.find(([a]) => sh.fragmentShader.includes(a));
  const B = '#ifdef OPAQUE';
  if (!form || !sh.fragmentShader.includes(B)) {
    console.warn('normal mode: shader patch did not apply, output is view-space');
    return;
  }
  sh.fragmentShader = sh.fragmentShader
    .replace(form[0], form[1])
    .replace(B, 'if( !gl_FrontFacing ) gl_FragColor = vec4( 1.0, 0.0, 1.0, 1.0 );\n\t' + B);
};

// Front blue / back red. The single fastest way to spot inverted winding, and
// unlike the normals pass it carries no other information to misread.
const FACE_ORIENT_MAT = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
FACE_ORIENT_MAT.onBeforeCompile = (sh) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
    '#include <dithering_fragment>\n gl_FragColor = gl_FrontFacing'
    + ' ? vec4(0.16,0.42,0.86,1.0) : vec4(0.86,0.20,0.16,1.0);');
};

// Every mode material below is mesh-independent, so one instance serves the whole
// run. v6 allocated a fresh material per mesh per mode per tile and never freed any
// of them, which is what made long batches die on the software renderer.
const CLAY_BASE = { color: 0xd9d4cc, roughness: 0.6, metalness: 0, side: THREE.DoubleSide };
// backfaces flat magenta: inverted winding and holes read as a flag, not a shade
// The authored materials get the same magenta backface flag as clay. Note what that
// does and does not buy: the flag only fires on faces the material actually draws, so
// it catches defects on double-sided materials (capes, foliage) and nothing at all on
// a single-sided one, where an inverted face is culled and you see a plausible-looking
// interior instead. faceorient is the pass that always answers this question; clay
// forces DoubleSide and answers it too. Patched once per material and recompiled;
// the front-facing result is untouched.
const flaggedMats = new WeakSet();
function flagBackfaces(mat) {
  for (const m of (Array.isArray(mat) ? mat : [mat])) {
    if (!m || flaggedMats.has(m)) continue;
    flaggedMats.add(m);
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\n if(!gl_FrontFacing) gl_FragColor = vec4(1.0,0.0,1.0,1.0);');
    };
    m.needsUpdate = true;
  }
}
const clayBackfaceFlag = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
  '#include <dithering_fragment>\n if(!gl_FrontFacing) gl_FragColor = vec4(1.0,0.0,1.0,1.0);'); };
const CLAY_MAT = new THREE.MeshStandardMaterial(CLAY_BASE);
CLAY_MAT.onBeforeCompile = clayBackfaceFlag;
// polygon offset keeps the wire overlay from z-fighting the surface it sits on
const CLAYWIRE_MAT = new THREE.MeshStandardMaterial({ ...CLAY_BASE,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
CLAYWIRE_MAT.onBeforeCompile = clayBackfaceFlag;
const WIRE_MAT = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, wireframe: true });
const WIRE_LINE_MAT = new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.6 });
const SIL_MAT = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide });
const UV_MAT = new THREE.MeshBasicMaterial({ map: CHECKER });
// A mesh with no UV attribute samples the checker at a single texel and comes out a
// flat colour, which reads as a valid unwrapped surface. Hazard stripes instead, so
// "not unwrapped" is never mistaken for "unwrapped fine".
const NO_UV_MAT = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
NO_UV_MAT.onBeforeCompile = (sh) => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
    '#include <dithering_fragment>\n float st = fract( ( gl_FragCoord.x + gl_FragCoord.y ) / 24.0 );'
    + '\n gl_FragColor = vec4( st < 0.5 ? vec3(0.98,0.85,0.10) : vec3(0.10,0.10,0.10), 1.0 );');
};
const MATCAP_MAT = new THREE.MeshMatcapMaterial({ matcap: MATCAP });
// normal blending + no depth write: overlapping shells accumulate, so thickness
// reads as density on a light background (additive only works on a dark one)
const XRAY_MAT = new THREE.MeshBasicMaterial({ color: 0x1f6feb, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });

// Anything in here is reused for the whole process and must survive a model unload.
const SHARED = new Set([CHECKER, MATCAP, WORLD_NORMAL_MAT, FACE_ORIENT_MAT, CLAY_MAT,
  CLAYWIRE_MAT, WIRE_MAT, WIRE_LINE_MAT, SIL_MAT, UV_MAT, NO_UV_MAT, MATCAP_MAT, XRAY_MAT]);

// Detaching an object from the scene graph does not free its GPU memory. Every
// load/clear cycle in v6 leaked geometries, textures and one environment map.
function disposeMaterial(mat) {
  for (const m of (Array.isArray(mat) ? mat : [mat])) {
    if (!m || SHARED.has(m)) continue;
    for (const k of Object.keys(m)) {
      const v = m[k];
      if (v && v.isTexture && !SHARED.has(v)) v.dispose();
    }
    m.dispose();
  }
}
function disposeNode(o) {
  if (o.geometry && !SHARED.has(o.geometry)) o.geometry.dispose();
  disposeMaterial(o.material);
}
function purge(group) {
  group.traverse(o => {
    if (o.userData && o.userData.wire) { disposeNode(o.userData.wire); o.userData.wire = null; }
    if (o.userData && o.userData.albedo) { o.userData.albedo.dispose(); o.userData.albedo = null; }
    if (o.geometry || o.material) disposeNode(o);
    // applyMode parks the authored material in userData and puts a shared one on the
    // mesh, so unless the last tile happened to be pbr, o.material is not the material
    // holding the model's textures. Freeing only o.material leaked one atlas per model:
    // 76 castle-kit models rendered as --modes pbr,clay ended with 78 live GPU textures.
    if (o.userData && o.userData.orig) { disposeMaterial(o.userData.orig); o.userData.orig = null; }
  });
  group.clear();
}

const RULER_UNIT = 1, RULER_MINOR = 0.25;

// Modes whose pixels are data, not a picture. A tone curve or an sRGB transfer
// applied to these silently corrupts the value being read: v6 ran the world-space
// normal encoding through AgX unless --ladder happened to set --tone none.
const RAW_MODES = new Set(['normal', 'depth']);              // no tone curve, linear out
const UNTONED_MODES = new Set(['uv', 'silhouette', 'faceorient', 'wireframe', 'albedo', 'matcap']);
// Grid, ruler, axes and bbox live outside the model, so applyMode never reaches
// them: v6 drew a full-colour grid across a greyscale depth pass.
const NO_HELPER_MODES = new Set(['normal', 'depth', 'silhouette', 'faceorient']);
// One predicate for "this tile draws no helpers", used by both setHelpers and the
// framing pass. With the test in setHelpers only, a --ruler run reserved frame for a
// staff these modes never drew and pushed the model small and off-centre.
// cfg.mode is undefined during the scale lock, which is right: the lock has to cover
// the worst case across every mode in the run.
const helpersHidden = (cfg) => NO_HELPER_MODES.has(cfg.mode) && !(cfg.compare && cfg.mode === 'silhouette');

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
  // WebGL ignores LineBasicMaterial.linewidth entirely, so a LineSegments grid is
  // always one device pixel: it thins out as --ss or --width goes up, exactly when
  // the tile has room for a heavier rule. These lines are quads instead, sized in
  // world units taken from the frame width, so a line keeps the same share of the
  // image whatever the row holds.
  const V = THREE.Vector3;
  const W_MINOR = w * 0.0007, W_MAJOR = w * 0.0015, W_EDGE = w * 0.002;

  // One triangle soup per weight: a grid is three draw calls, not one per rule.
  const mk = (segs, width, colour, opacity, z) => {
    const pos = [];
    const half = width / 2;
    for (const [a, b] of segs) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * half, ny = dx / len * half;   // normal in the wall plane
      const p1 = [a.x + nx, a.y + ny, z], p2 = [b.x + nx, b.y + ny, z];
      const p3 = [b.x - nx, b.y - ny, z], p4 = [a.x - nx, a.y - ny, z];
      pos.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.MeshBasicMaterial({ color: colour, transparent: true,
      opacity: opacity, side: THREE.DoubleSide, depthWrite: false });
    return new THREE.Mesh(geo, m);
  };

  const minorSegs = [], majorSegs = [];
  // Ends are extended by half a line width so crossings square off instead of
  // leaving a notch at every intersection.
  const e = W_EDGE;
  for (let x = 0; x <= w + 1e-6; x += minor) {
    const near = Math.abs(x / major - Math.round(x / major)) < 1e-6;
    (near ? majorSegs : minorSegs).push([new V(x, -e, 0), new V(x, h + e, 0)]);
  }
  for (let y = 0; y <= h + 1e-6; y += minor) {
    const near = Math.abs(y / major - Math.round(y / major)) < 1e-6;
    (near ? majorSegs : minorSegs).push([new V(-e, y, 0), new V(w + e, y, 0)]);
  }
  // Stacked front to back by weight, so a major rule covers the minor it crosses
  // rather than blending with it.
  g.add(mk(minorSegs, W_MINOR, 0x9a9a94, 0.5, 0));
  g.add(mk(majorSegs, W_MAJOR, 0x55534e, 0.9, 0.001));
  const b = [[new V(0,0,0), new V(w,0,0)], [new V(w,0,0), new V(w,h,0)],
             [new V(w,h,0), new V(0,h,0)], [new V(0,h,0), new V(0,0,0)]];
  g.add(mk(b, W_EDGE, 0x3c3c3c, 1, 0.002));
  g.position.x = -w / 2;
  return g;
}
const PRESETS = { front:[0,0], back:[180,0], left:[-90,0], right:[90,0], top:[0,89.9], bottom:[0,-89.9], iso:[35,25], 'iso-back':[215,25], hero:[25,12] };

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
// Returns { box, cloud }. Writing the cloud straight into S made it unusable for
// anything but the whole model -- --isolate needs the same measurement per part.
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
  return { box: any && !box.isEmpty() ? box : new THREE.Box3().setFromObject(obj),
    cloud: keepCloud ? new Float32Array(pts) : null };
}

// v6 built a fresh room environment and PMREM target on every load and never
// released the previous one — one leaked cubemap per model. It is identical every
// time, so build it once.
let ROOM_ENV = null;
function roomEnv() {
  if (!ROOM_ENV) {
    const room = new RoomEnvironment();
    ROOM_ENV = pmrem.fromScene(room, 0.04).texture;
    room.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  return ROOM_ENV;
}
function setEnv(cfg) {
  scene.environment = (cfg.env === 'neutral' || cfg.env === 'studio') ? roomEnv() : null;
  const old = scene.children.filter(o => o.isLight);
  old.forEach(o => { scene.remove(o); if (o.dispose) o.dispose(); });
  // 'direct' is v6's 'none': lights but no reflections. 'none' now means nothing at all.
  if (cfg.env === 'studio' || cfg.env === 'direct') {
    const key = new THREE.DirectionalLight(0xffffff, cfg.env === 'direct' ? 3 : 1.6);
    key.position.set(3,5,4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(-4,2,-3); scene.add(fill);
    scene.add(new THREE.AmbientLight(0xffffff, cfg.env === 'direct' ? 0.6 : 0.2));
  }
}

window.API = {
  async load(url, cfg) {
    purge(root); purge(helpers); S.missing = [];
    const gltf = await loader.loadAsync(url);
    const obj = gltf.scene;
    obj.traverse(o => { if (o.isMesh) o.userData.orig = o.material; });
    root.add(obj); S.model = obj;

    // v6 walked every vertex twice: once for the centre, once again for the cloud.
    // Recentring is a rigid translation, so the second walk is just a subtraction.
    const posed = posedBounds(obj, true);
    const raw = posed.box;
    S.cloud = posed.cloud;
    S.parts = new Map();
    S.pivot = { min: raw.min.toArray(), max: raw.max.toArray() };
    const ctr = raw.getCenter(new THREE.Vector3());
    obj.position.sub(ctr);
    obj.updateMatrixWorld(true);
    if (S.cloud) for (let i = 0; i < S.cloud.length; i += 3) {
      S.cloud[i] -= ctr.x; S.cloud[i+1] -= ctr.y; S.cloud[i+2] -= ctr.z;
    }
    S.box = raw.clone().translate(ctr.clone().negate());
    S.radius = S.box.getBoundingSphere(new THREE.Sphere()).radius;
    S.center = S.box.getCenter(new THREE.Vector3());
    setEnv(cfg);
    return this.stats();
  },

  // --compare: all models in one scene, standing on a shared baseline in input
  // order, packed into equal-width rows. Equal width means one camera serves every
  // row, so scale is comparable down the page as well as across it.
  async loadMany(urls, meta, cfg) {
    purge(root); purge(helpers); S.missing = [];
    const items = [];
    for (let i = 0; i < urls.length; i++) {
      const gltf = await loader.loadAsync(urls[i]);
      const obj = gltf.scene;
      obj.traverse(o => { if (o.isMesh) o.userData.orig = o.material; });
      root.add(obj);
      const box = posedBounds(obj).box;
      const sz = box.getSize(new THREE.Vector3());
      const c = box.getCenter(new THREE.Vector3());
      obj.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));   // base at y=0, centred in x/z
      items.push({ obj, w: sz.x, h: sz.y, name: meta[i].name, kit: meta[i].kit });
    }
    S.model = root;

    const gap = RULER_UNIT * 0.18;
    const total = items.reduce((a, it) => a + it.w + gap, 0) - gap;
    // The frame is exactly rowH tall, so it has to clear the tallest model or the
    // row silently crops it. The ruler staff stays RULER_UNIT high either way, so
    // the scale reference does not move; only the headroom above it grows.
    const rowH = Math.max(RULER_UNIT, Math.max(...items.map(it => it.h)) * 1.06);
    const nRows = Math.max(1, Math.ceil(total / (RULER_UNIT * 7)));
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
    let tris = 0, verts = 0, meshes = 0, draws = 0, noUV = 0;
    const mats = new Set(), texs = new Set();
    S.model.traverse(o => {
      if (!o.isMesh) return;
      meshes++; draws += Array.isArray(o.material) ? o.material.length : 1;
      if (!o.geometry.attributes.uv) noUV++;
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
      meshes, drawCalls: draws, triangles: Math.round(tris), vertices: verts, meshesWithoutUV: noUV,
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

  // Everything --stats adds on top of the counts above: mesh integrity, UV layout
  // and which atlas colours the model actually uses. All of it is measured in world
  // space after node transforms, so the numbers match what the tiles show.
  deepStats() {
    const g = { boundaryEdges: 0, nonManifoldEdges: 0, degenerateTris: 0, looseVerts: 0,
      flippedTris: 0, signedVolume: 0, triAreaMin: Infinity, triAreaMax: 0, edgeMin: Infinity, edgeMax: 0 };
    const uv = { present: 0, absent: 0, min: [1e9, 1e9], max: [-1e9, -1e9], outside01: 0, points: new Set(),
      islands: 0, texelArea: 0 };
    const perMesh = [];
    const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();

    S.model.updateMatrixWorld(true);
    S.model.traverse(o => {
      if (!o.isMesh) return;
      const geo = o.geometry, pos = geo.attributes.position;
      const idx = geo.index ? geo.index.array : null;
      const count = idx ? idx.length : pos.count;
      const world = [];
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); world.push(v.x, v.y, v.z); }
      const gi = (k) => idx ? idx[k] : k;
      const edges = new Map();
      const used = new Set();
      let mTris = 0, mVol = 0, mDegen = 0;
      for (let k = 0; k < count; k += 3) {
        const i0 = gi(k), i1 = gi(k+1), i2 = gi(k+2);
        used.add(i0); used.add(i1); used.add(i2);
        a.set(world[i0*3], world[i0*3+1], world[i0*3+2]);
        b.set(world[i1*3], world[i1*3+1], world[i1*3+2]);
        c.set(world[i2*3], world[i2*3+1], world[i2*3+2]);
        ab.subVectors(b, a); ac.subVectors(c, a); n.crossVectors(ab, ac);
        const area = n.length() * 0.5;
        if (area < 1e-12) { mDegen++; } else {
          g.triAreaMin = Math.min(g.triAreaMin, area); g.triAreaMax = Math.max(g.triAreaMax, area);
        }
        [[a,b],[b,c],[c,a]].forEach(([p, q]) => {
          const L = p.distanceTo(q);
          if (L > 1e-9) { g.edgeMin = Math.min(g.edgeMin, L); g.edgeMax = Math.max(g.edgeMax, L); }
        });
        mVol += a.dot(n) / 6;   // signed tetra volume against the origin
        // a shading normal pointing against the geometric one means the stored
        // normal disagrees with the winding: the flag the magenta backface shows
        const nrm = geo.attributes.normal;
        if (nrm) {
          const sx = (nrm.getX(i0) + nrm.getX(i1) + nrm.getX(i2));
          const sy = (nrm.getY(i0) + nrm.getY(i1) + nrm.getY(i2));
          const sz = (nrm.getZ(i0) + nrm.getZ(i1) + nrm.getZ(i2));
          // normalise the comparison so near-perpendicular smooth normals on curved
          // low-poly surfaces do not register; only a clear disagreement counts
          const nl = n.length(), sl = Math.hypot(sx, sy, sz);
          if (nl > 1e-12 && sl > 1e-12 && (n.x*sx + n.y*sy + n.z*sz) / (nl*sl) < -0.5) g.flippedTris++;
        }
        [[i0,i1],[i1,i2],[i2,i0]].forEach(([p, q]) => {
          const key = p < q ? p + '_' + q : q + '_' + p;
          edges.set(key, (edges.get(key) || 0) + 1);
        });
        mTris++;
      }
      for (const cnt of edges.values()) { if (cnt === 1) g.boundaryEdges++; else if (cnt > 2) g.nonManifoldEdges++; }
      g.degenerateTris += mDegen; g.signedVolume += mVol; g.looseVerts += pos.count - used.size;

      const uvA = geo.attributes.uv;
      if (!uvA) uv.absent++; else {
        uv.present++;
        for (let i = 0; i < uvA.count; i++) {
          const u = uvA.getX(i), w = uvA.getY(i);
          uv.min[0] = Math.min(uv.min[0], u); uv.min[1] = Math.min(uv.min[1], w);
          uv.max[0] = Math.max(uv.max[0], u); uv.max[1] = Math.max(uv.max[1], w);
          if (u < -1e-4 || u > 1 + 1e-4 || w < -1e-4 || w > 1 + 1e-4) uv.outside01++;
          uv.points.add(Math.round(u * 4096) + ':' + Math.round(w * 4096));
        }
      }
      perMesh.push({ name: o.name || '(unnamed)', triangles: mTris,
        vertices: pos.count, hasUV: !!uvA, degenerate: mDegen,
        material: Array.isArray(o.material) ? o.material.map(m => m && m.name) : (o.material && o.material.name) });
    });

    const fin = (x) => Number.isFinite(x) ? +x.toFixed(6) : null;
    return {
      integrity: {
        boundaryEdges: g.boundaryEdges, nonManifoldEdges: g.nonManifoldEdges,
        degenerateTris: g.degenerateTris, looseVerts: g.looseVerts,
        trisWithNormalAgainstWinding: g.flippedTris,
        closed: g.boundaryEdges === 0,
        signedVolume: fin(g.signedVolume),
        triAreaMin: fin(g.triAreaMin), triAreaMax: fin(g.triAreaMax),
        triAreaRatio: g.triAreaMin > 0 ? +(g.triAreaMax / g.triAreaMin).toFixed(1) : null,
        edgeMin: fin(g.edgeMin), edgeMax: fin(g.edgeMax),
      },
      uv: {
        meshesWithUV: uv.present, meshesWithoutUV: uv.absent,
        bbox: uv.present ? [+uv.min[0].toFixed(4), +uv.min[1].toFixed(4), +uv.max[0].toFixed(4), +uv.max[1].toFixed(4)] : null,
        spanU: uv.present ? +(uv.max[0] - uv.min[0]).toFixed(4) : null,
        spanV: uv.present ? +(uv.max[1] - uv.min[1]).toFixed(4) : null,
        uniquePoints: uv.points.size,
        outside01: uv.outside01,
        // one UV point for the whole mesh means an atlas swatch lookup, not an unwrap
        kind: !uv.present ? 'none' : uv.points.size <= 2 ? 'single-swatch'
          : uv.points.size < 256 ? 'atlas-swatches' : 'unwrapped',
      },
      palette: this.paletteStats(),
    };
  },

  // Which atlas colours the model lands on. Samples the base-colour texture at every
  // unique UV point and clusters identical texels, so the result is the model's
  // actual palette, not the whole atlas.
  paletteStats() {
    let tex = null;
    S.model.traverse(o => { if (!tex && o.isMesh) {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m && m.map && m.map.image) tex = m.map;
    }});
    if (!tex) return { source: 'none', colors: [] };
    const img = tex.image;
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    let data;
    try { data = ctx.getImageData(0, 0, cv.width, cv.height).data; }
    catch (e) { return { source: 'unreadable', colors: [] }; }

    const hits = new Map();   // hex -> triangle area using it
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    S.model.updateMatrixWorld(true);
    S.model.traverse(o => {
      if (!o.isMesh) return;
      const geo = o.geometry, pos = geo.attributes.position, uvA = geo.attributes.uv;
      if (!uvA) return;
      const idx = geo.index ? geo.index.array : null;
      const count = idx ? idx.length : pos.count;
      const gi = (k) => idx ? idx[k] : k;
      for (let k = 0; k < count; k += 3) {
        const i0 = gi(k), i1 = gi(k+1), i2 = gi(k+2);
        va.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
        vb.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
        vc.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
        e1.subVectors(vb, va); e2.subVectors(vc, va);
        const area = e1.cross(e2).length() * 0.5;
        // Sample the three corner UVs, not the centroid: on a swatch atlas the
        // corners sit inside the colour strip while the centroid can fall into the
        // black gutter between strips and report every model as black.
        for (const vi of [i0, i1, i2]) {
          const u = uvA.getX(vi), w = uvA.getY(vi);
          const px = Math.min(cv.width - 1, Math.max(0, Math.round(u * cv.width - 0.5)));
          // glTF UV origin is top-left and three keeps flipY off for glTF textures,
          // so the V axis maps straight to the pixel row. Flipping it here sampled the
          // empty bottom of the atlas and reported every model as black.
          const py = Math.min(cv.height - 1, Math.max(0, Math.round(w * cv.height - 0.5)));
          const p = (py * cv.width + px) * 4;
          const hex = '#' + [data[p], data[p+1], data[p+2]]
            .map(x => x.toString(16).padStart(2, '0')).join('');
          hits.set(hex, (hits.get(hex) || 0) + area / 3);
        }
      }
    });
    const total = [...hits.values()].reduce((s, x) => s + x, 0) || 1;
    const srgbToOklch = (hex) => {
      const to = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const r = to(parseInt(hex.slice(1,3),16)), gg = to(parseInt(hex.slice(3,5),16)), bl = to(parseInt(hex.slice(5,7),16));
      const l = Math.cbrt(0.4122214708*r + 0.5363325363*gg + 0.0514459929*bl);
      const m = Math.cbrt(0.2119034982*r + 0.6806995451*gg + 0.1073969566*bl);
      const s2 = Math.cbrt(0.0883024619*r + 0.2817188376*gg + 0.6299787005*bl);
      const L = 0.2104542553*l + 0.7936177850*m - 0.0040720468*s2;
      const A = 1.9779984951*l - 2.4285922050*m + 0.4505937099*s2;
      const B = 0.0259040371*l + 0.7827717662*m - 0.8086757660*s2;
      const C = Math.hypot(A, B);
      let H = Math.atan2(B, A) * 180 / Math.PI; if (H < 0) H += 360;
      return { L: +L.toFixed(4), C: +C.toFixed(4), H: +H.toFixed(1) };
    };
    const colors = [...hits.entries()]
      .sort((x, y) => y[1] - x[1])
      .map(([hex, area]) => ({ hex, areaShare: +(area / total).toFixed(4), oklch: srgbToOklch(hex) }));
    return { source: tex.image.src ? 'baseColorTexture' : 'baseColorTexture',
      atlas: [cv.width, cv.height], distinctColors: colors.length, colors: colors.slice(0, 24) };
  },

  // --isolate used to frame every part from the whole model's bounds, so on a 40-part
  // model each part was ~1% of its tile. Measure the part itself; the result is cached
  // because the same part is re-measured for every tile of a multi-view run.
  // --lock-scale still wins, so pass it when parts must stay size-comparable.
  partState(i) {
    if (!S.parts) S.parts = new Map();
    if (S.parts.has(i)) return S.parts.get(i);
    let idx = 0, target = null;
    S.model.traverse(o => { if (o.isMesh) { if (idx === i) target = o; idx++; } });
    let st = null;
    if (target) {
      const wasVisible = target.visible;
      target.visible = true;
      const { box, cloud } = posedBounds(target, true);
      target.visible = wasVisible;
      st = { box, cloud, center: box.getCenter(new THREE.Vector3()),
        radius: box.getBoundingSphere(new THREE.Sphere()).radius };
    }
    S.parts.set(i, st);
    return st;
  },

  // hard cap: --isolate on a many-part model would otherwise fire off hundreds of renders
  meshNames() {
    const out = [];
    S.model.traverse(o => { if (o.isMesh && out.length < 32) out.push(o.name || ('mesh_' + out.length)); });
    return out;
  },

  // Framing pass. The driver measures every requested view, takes the worst case,
  // and renders them all with that one camera: nothing crops, nothing rescales.
  // A bounding-sphere fit would also be consistent but throws away most of the
  // frame on anything that isn't roughly cubic.
  // The ruler stands outside the model, so a point set built from model vertices
  // alone always crops it. v6 folded its corners in inside render() but not inside
  // measure(), so --lock-scale --ruler measured without the staff and drew with it.
  cloudWithRuler(cfg, right, dir) {
    const cloud = S.cloud;
    if (!cloud || !cfg.ruler || cfg.compare || helpersHidden(cfg)) return cloud;
    const off = S.radius + RULER_UNIT * 0.12, hw = RULER_UNIT * 0.0175;
    const y0 = S.box.min.y, y1 = y0 + RULER_UNIT;
    const ex = [];
    for (const sx of [-off - hw, -off + hw]) for (const y of [y0, y1]) for (const sz of [-hw, hw]) {
      ex.push(S.center.x + right.x * sx + sz * dir.x, y, S.center.z + right.z * sx + sz * dir.z);
    }
    const merged = new Float32Array(cloud.length + ex.length);
    merged.set(cloud); merged.set(ex, cloud.length);
    return merged;
  },

  measure(cfg) {
    const aspect = cfg.width / cfg.height;
    const p = (cfg.az === undefined || cfg.az === null) ? (PRESETS[cfg.preset] || PRESETS.iso) : [cfg.az, cfg.el];
    const az = p[0]*Math.PI/180, el = p[1]*Math.PI/180;
    const dir = new THREE.Vector3(Math.cos(el)*Math.sin(az), Math.sin(el), Math.cos(el)*Math.cos(az));
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), dir).normalize();
    if (right.lengthSq() < 1e-6) right.set(1,0,0);
    const vup = new THREE.Vector3().crossVectors(dir, right).normalize();
    const tv = Math.tan((cfg.fov*Math.PI/180)/2), th = tv*aspect;
    const cloud = this.cloudWithRuler(cfg, right, dir);
    if (!cloud) return { dist: S.radius/tv, half: S.radius };
    const c = S.center;
    let dist = 0, hx = 0, hy = 0;
    for (let i = 0; i < cloud.length; i += 3) {
      const x = cloud[i]-c.x, y = cloud[i+1]-c.y, z = cloud[i+2]-c.z;
      const px = Math.abs(x*right.x + y*right.y + z*right.z);
      const py = Math.abs(x*vup.x + y*vup.y + z*vup.z);
      const pd = x*dir.x + y*dir.y + z*dir.z;
      if (px > hx) hx = px;
      if (py > hy) hy = py;
      const need = Math.max(px/th, py/tv) + pd;
      if (need > dist) dist = need;
    }
    return { dist, half: Math.max(hy, hx/aspect) };
  },

  // Albedo depends on the mesh's own texture and tint, so it is the one mode that
  // needs a per-mesh material. Built once and cached; purge() frees it.
  albedoMat(o) {
    if (o.userData.albedo) return o.userData.albedo;
    const src = Array.isArray(o.userData.orig) ? o.userData.orig[0] : o.userData.orig;
    const m = new THREE.MeshBasicMaterial({
      map: src && src.map ? src.map : null,
      color: src && src.color ? src.color.clone() : new THREE.Color(0xffffff),
      vertexColors: !!(src && src.vertexColors),
      transparent: !!(src && src.transparent), alphaTest: src ? src.alphaTest : 0,
      side: src ? src.side : THREE.FrontSide,
    });
    o.userData.albedo = m;
    return m;
  },

  applyMode(mode) {
    S.model.traverse(o => {
      if (!o.isMesh) return;
      // overlay is a child of the mesh, so it must be detached before any other mode
      if (o.userData.wire && o.userData.wire.parent) o.remove(o.userData.wire);
      const orig = o.userData.orig;
      if (mode === 'pbr') { o.material = orig; flagBackfaces(orig); return; }
      let m;
      if (mode === 'albedo') m = this.albedoMat(o);
      else if (mode === 'clay') m = CLAY_MAT;
      else if (mode === 'claywire') {
        m = CLAYWIRE_MAT;
        if (!o.userData.wire) o.userData.wire =
          new THREE.LineSegments(new THREE.WireframeGeometry(o.geometry), WIRE_LINE_MAT);
        o.add(o.userData.wire);   // depth-tested, so hidden edges stay hidden
      }
      else if (mode === 'wireframe') m = WIRE_MAT;
      else if (mode === 'normal') m = WORLD_NORMAL_MAT;
      else if (mode === 'faceorient') m = FACE_ORIENT_MAT;
      else if (mode === 'silhouette') m = SIL_MAT;
      else if (mode === 'depth') m = DEPTH_MAT;
      else if (mode === 'uv') m = o.geometry.attributes.uv ? UV_MAT : NO_UV_MAT;
      else if (mode === 'matcap') m = MATCAP_MAT;
      else if (mode === 'xray') m = XRAY_MAT;
      o.material = Array.isArray(orig) ? orig.map(() => m) : m;
    });
  },

  setHelpers(cfg, dir, aspect) {
    purge(helpers);   // v6 detached these every frame without freeing them
    // A lit, coloured grid drawn across a depth ramp or a normal encoding is not a
    // backdrop, it is wrong data. Compare mode keeps its ruler under silhouette,
    // because reading heights off the staff is the entire point of that layout.
    if (helpersHidden(cfg)) return;
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
  },

  async render(cfg) {
    const ss = Math.max(1, cfg.ss || 1);
    const W = cfg.width * ss, H = cfg.height * ss;
    renderer.setSize(W, H, false);
    // A tone curve is right for a photograph and wrong for a measurement. The normal
    // and depth passes also need a linear framebuffer: an sRGB transfer would bend
    // the very values the pass exists to encode.
    const raw = RAW_MODES.has(cfg.mode), untoned = raw || UNTONED_MODES.has(cfg.mode);
    renderer.toneMapping = untoned ? THREE.NoToneMapping
      // ?? not ||: THREE.NoToneMapping is 0, so || swallowed it and --tone none
      // silently rendered AgX -- including for --ladder, which sets tone 'none' on
      // purpose to keep the authored colormap bands unbent.
      : ({ agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, linear: THREE.LinearToneMapping, none: THREE.NoToneMapping })[cfg.tone] ?? THREE.AgXToneMapping;
    renderer.toneMappingExposure = untoned ? 1 : cfg.exposure;
    renderer.outputColorSpace = raw ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
    const bg = cfg.mode === 'depth' ? '#000000' : cfg.mode === 'silhouette' ? '#ffffff' : cfg.bg;
    scene.background = bg === 'transparent' ? null : new THREE.Color(bg);
    renderer.setClearAlpha(bg === 'transparent' ? 0 : 1);

    let savedFrame = null;
    if (cfg.isolateIndex >= 0) {
      let i = 0; S.model.traverse(o => { if (o.isMesh) { o.visible = (i === cfg.isolateIndex); i++; } });
      const ps = this.partState(cfg.isolateIndex);
      if (ps) {
        savedFrame = { box: S.box, center: S.center, radius: S.radius, cloud: S.cloud };
        S.box = ps.box; S.center = ps.center; S.radius = ps.radius; S.cloud = ps.cloud;
      }
    }
    else S.model.traverse(o => { if (o.isMesh) o.visible = true; });

    const p = (cfg.az === undefined || cfg.az === null) ? (PRESETS[cfg.preset] || PRESETS.iso) : [cfg.az, cfg.el];
    const az = p[0] * Math.PI/180, el = p[1] * Math.PI/180;
    const useOrtho = (cfg.viewOrtho === true || cfg.viewOrtho === false) ? cfg.viewOrtho : cfg.ortho;

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

    const cloud = this.cloudWithRuler(cfg, right, dir);
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

    // Per-view auto-fit rescales the model in every tile, which destroys the one
    // thing a multi-view set is for: reading proportion across views. Framing from
    // the bounding sphere instead costs some frame area and keeps scale identical.
    if (cfg.lockScale) {
      offX = 0; offY = 0; maxD = r; minD = -r;
      dist = cfg.lockDist || (r / Math.sin((cfg.fov*Math.PI/180)/2));
      maxY = cfg.lockHalf || r; maxX = 0;   // ortho half-height comes straight from the lock
    }

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
    if (useOrtho) {
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

    renderer.render(scene, cam);

    let src = renderer.domElement;
    if (ss > 1) {
      const d = document.createElement('canvas');
      d.width = cfg.width; d.height = cfg.height;
      const dg = d.getContext('2d');
      dg.imageSmoothingEnabled = true; dg.imageSmoothingQuality = 'high';
      dg.drawImage(src, 0, 0, cfg.width, cfg.height);
      src = d;
    }
    if (cfg.annotate) src = this.annotate(src, cfg.caption || cfg.label || '', right, vup, useOrtho);
    if (cfg.keepTile) S.tiles.push({ bmp: await createImageBitmap(src), label: cfg.label || '' });
    if (savedFrame) Object.assign(S, savedFrame);
    return src.toDataURL('image/png').split(',')[1];
  },

  // A grid of unlabelled tiles is unreadable to a model reading them as one image:
  // it cannot tell which tile is which angle. Caption and gizmo travel in the pixels
  // so a single cropped tile is still self-describing.
  annotate(gl, caption, right, vup, isOrtho) {
    const c = document.createElement('canvas');
    c.width = gl.width; c.height = gl.height;
    const g = c.getContext('2d');
    g.drawImage(gl, 0, 0);
    const s = Math.min(c.width, c.height);
    const fs = Math.max(11, Math.round(s * 0.030)), pad = Math.round(s * 0.020);
    g.font = '600 ' + fs + 'px ui-monospace, monospace';
    const text = caption + (isOrtho ? ' o' : ' p');
    const tw = g.measureText(text).width;
    g.fillStyle = 'rgba(255,255,255,0.86)';
    g.fillRect(pad * 0.5, c.height - pad - fs * 1.6, tw + pad * 1.4, fs * 1.6);
    g.fillStyle = '#141414';
    g.textBaseline = 'alphabetic';
    g.fillText(text, pad, c.height - pad - fs * 0.45);

    const gx = c.width - s * 0.10, gy = c.height - s * 0.10, L = s * 0.055;
    g.lineWidth = Math.max(2, s * 0.006);
    g.font = '600 ' + Math.round(fs * 0.85) + 'px ui-monospace, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const a of [[1,0,0,'#d1443c','X'], [0,1,0,'#2f8f45','Y'], [0,0,1,'#3a6fd8','Z']]) {
      const dx = a[0]*right.x + a[1]*right.y + a[2]*right.z;
      const dy = -(a[0]*vup.x + a[1]*vup.y + a[2]*vup.z);
      g.strokeStyle = a[3];
      g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + dx*L, gy + dy*L); g.stroke();
      g.fillStyle = a[3];
      g.fillText(a[4], gx + dx*L*1.3, gy + dy*L*1.3);
    }
    g.textAlign = 'left';
    return c;
  },

  // Stack the row strips and caption each model beneath its own position.
  // Three fixed label heights with no clamping meant that on a row of narrow parts
  // neighbours wrote straight over each other and the outermost labels ran off
  // the canvas. Captions are measured and placed first -- each one drops to the first
  // height that is clear of its left neighbour, and the row is as tall as that needs.
  async compareSheet(rowsMeta, cfg) {
    const tw = cfg.width, th = cfg.height, pad = 26;
    const line = Math.max(13, Math.round(tw / 78)), lead = Math.round(line * 1.5);
    const nameFont = '600 ' + Math.round(line * 1.15) + 'px ui-sans-serif, system-ui, sans-serif';
    const kitFont = line + 'px ui-sans-serif, system-ui, sans-serif';
    const canvasW = tw + pad * 2, gap = Math.round(line * 0.9);

    const mg = document.createElement('canvas').getContext('2d');
    const rows = S.tiles.map((_, ri) => {
      const items = (rowsMeta[ri] && rowsMeta[ri].items) || [];
      const rights = [];
      const placed = items.map(it => {
        mg.font = nameFont;
        let w = mg.measureText(it.name + '  h=' + it.h.toFixed(2)).width;
        if (it.kit) { mg.font = kitFont; w = Math.max(w, mg.measureText(it.kit).width); }
        const half = w / 2;
        const x = Math.min(Math.max(pad + (it.cx / cfg.rowW + 0.5) * tw, half + 2), canvasW - half - 2);
        let lv = 0;
        while (lv < rights.length && x - half < rights[lv] + gap) lv++;
        rights[lv] = x + half;
        return { it, x, level: lv };
      });
      return { placed, block: Math.max(1, rights.length) * lead * 2 + lead };
    });

    const c = document.createElement('canvas');
    c.width = canvasW;
    c.height = pad + rows.reduce((a, r) => a + th + r.block, 0);
    const g = c.getContext('2d');
    g.fillStyle = cfg.bg === 'transparent' ? '#ffffff' : cfg.bg;
    g.fillRect(0, 0, c.width, c.height);
    g.textAlign = 'center';
    let y = pad;
    for (let ri = 0; ri < S.tiles.length; ri++) {
      g.drawImage(S.tiles[ri].bmp, pad, y, tw, th);
      for (const q of rows[ri].placed) {
        const ly = y + th + lead + q.level * lead * 2;
        if (q.it.kit) { g.font = kitFont; g.fillStyle = '#a8a29a'; g.fillText(q.it.kit, q.x, ly); }
        g.font = nameFont; g.fillStyle = '#3a3a38';
        g.fillText(q.it.name + '  h=' + q.it.h.toFixed(2), q.x, ly + lead);
      }
      y += th + rows[ri].block;
    }
    return c.toDataURL('image/png').split(',')[1];
  },

  // --band: keep one cell of the colormap and flatten every other filled cell to a
  // flat grey. Lighting still gives the greyed parts their form, so what is left
  // coloured is exactly the geometry carrying that band -- which mesh names cannot
  // answer on a model merged into one primitive.
  bandOnly(lane, columns, rows) {
    const [tc, tr] = lane.split(',').map(Number);
    const seen = new Set();
    let filtered = 0;
    S.model.traverse(o => {
      if (!o.isMesh) return;
      for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) {
        const tex = mat && mat.map;
        if (!tex || !tex.image || seen.has(tex.uuid)) continue;
        seen.add(tex.uuid);
        const img = tex.image;
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        let d;
        try { d = ctx.getImageData(0, 0, cv.width, cv.height); } catch (e) { continue; }
        const cw = cv.width / columns, ch = cv.height / rows, px = d.data;
        for (let y = 0; y < cv.height; y++) {
          const row = Math.floor(y / ch);
          for (let x = 0; x < cv.width; x++) {
            if (row === tr && Math.floor(x / cw) === tc) continue;
            const i = (y * cv.width + x) * 4;
            // an unused cell is black in the atlas and stays black: greying it would
            // paint the gaps between bands the same as the bands themselves
            if (px[i] === 0 && px[i+1] === 0 && px[i+2] === 0) continue;
            px[i] = px[i+1] = px[i+2] = 205;
          }
        }
        ctx.putImageData(d, 0, 0);
        tex.image = cv;
        tex.needsUpdate = true;
        filtered++;
      }
    });
    return filtered;
  },

  clearTiles() { S.tiles.forEach(t => t.bmp.close && t.bmp.close()); S.tiles = []; },

  // Batches on the software renderer die from accumulated GPU objects rather than
  // from any one model. Exposed so the driver can check the trend with --verbose.
  memInfo() { const i = renderer.info.memory; return { geometries: i.geometries, textures: i.textures }; },

  async sheet(cfg) {
    const n = S.tiles.length; if (!n) return null;
    const cols = cfg.sheetCols > 0 ? cfg.sheetCols : Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const t = cfg.sheetTile, pad = cfg.sheetPad >= 0 ? cfg.sheetPad : Math.round(t*0.03), lab = cfg.sheetLabels ? Math.round(t*0.09) : 0;
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
const THREE_DESC = 'three '
  + (THREE_SRC.version ? THREE_SRC.version + ' ' : '')
  + 'from ' + (THREE_SRC.dir || THREE_SRC.base);
console.log(THREE_DESC);

// The page loads three.js itself, so an unreachable or slow source used to surface as
// a bare TimeoutError stack from inside Playwright. Say what failed.
try {
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'load', timeout: opts.timeout });
  await page.waitForFunction('window.__ready === true', null, { timeout: opts.timeout });
} catch (e) {
  await browser.close().catch(() => {});
  server.close();
  console.error('error: the render page never became ready (' + e.message.split('\n')[0] + ')');
  console.error('  the page loads ' + THREE_DESC);
  if (THREE_SRC.source !== 'local')
    console.error('  that is a network fetch by the browser; point --three at a local three package to avoid it.');
  else
    console.error('  check that directory holds a complete three package, or raise --timeout.');
  process.exit(3);
}

await fs.mkdir(opts.out, { recursive: true });
const cfgBase = {
  width: opts.width, height: opts.height,
  bg: opts.bg, env: opts.env, exposure: opts.exposure, tone: opts.tone,
  fit: opts.fit, fov: opts.fov, ortho: opts.ortho, ss: opts.ss,
  grid: opts.grid, axes: opts.axes, bbox: opts.bbox, ruler: opts.ruler,
  compare: opts.compare,
  annotate: opts.annotate, lockScale: opts.lockScale,
  isolateIndex: -1,
  sheetCols: opts.sheetCols, sheetTile: opts.sheetTile, sheetLabels: opts.sheetLabels, sheetPad: opts.sheetPad,
};

const write = async (file, b64) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.from(b64, 'base64'));
  console.log('  ->', path.relative(process.cwd(), file));
};

// One sheet for the whole run once several models are named: the point of a contact
// sheet is the comparison between them, and a sheet per model is not one. The ladder
// and --isolate are per-model layouts by construction, so they keep their own sheets.
const runSheet = opts.sheet && !opts.sheetEach && !ladderJobs && !opts.isolate && models.length > 1;

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
  if (opts.band) await page.evaluate(([b, c, r]) => window.API.bandOnly(b, c, r), [opts.band, BAND_COLUMNS, BAND_ROWS]);
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
    await write(path.join(opts.out, 'compare_' + mode + bandSuffix + '.png'), b64);
  }
  if (opts.stats) await fs.writeFile(path.join(opts.out, 'compare.stats.json'), JSON.stringify(layout, null, 2));
  await browser.close(); server.close();
  console.log(warnings ? 'done with ' + warnings + ' warning(s)' : 'done');
}

// v6 called process.exit() here, which can drop buffered output when stdout is a
// pipe. Skipping the loop instead lets the process end on its own.
if (runSheet) await page.evaluate(() => window.API.clearTiles());

for (let i = 0; !opts.compare && i < models.length; i++) {
  const file = models[i];
  const name = outNames[i];
  console.log('[' + (i+1) + '/' + models.length + '] ' + name);
  const dir = path.join(opts.out, name);
  try {
    const stats = await page.evaluate(([url, cfg]) => window.API.load(url, cfg), [ORIGIN + modelUrls[i], cfgBase]);
    if (opts.stats) {
      await fs.mkdir(dir, { recursive: true });
      const deep = await page.evaluate(() => window.API.deepStats());
      await fs.writeFile(path.join(dir, name + '.stats.json'),
        JSON.stringify({ file, model: name,
          three: { version: THREE_SRC.version || null, source: THREE_SRC.source },
          ...stats, ...deep }, null, 2));
    }
    if (stats.missingResources.length) {
      warnings++;
      for (const u of stats.missingResources)
        console.warn('  ! missing resource: ' + decodeURIComponent(u.replace(/^\/asset\/f\d+\//, '')) + '  (renders untextured)');
    }
    if (opts.verbose) console.log('  ', stats.triangles + ' tris,', stats.meshes + ' meshes,', stats.materials + ' mats');
    if (!stats.meshes) {
      warnings++;
      console.warn('  ! no meshes in this file; the tiles are empty and the bounds are meaningless');
    }
    if (stats.meshesWithoutUV && modes.includes('uv')) {
      warnings++;
      console.warn('  ! ' + stats.meshesWithoutUV + '/' + stats.meshes
        + ' mesh(es) have no UVs (drawn as yellow hazard stripes)');
    }

    if (opts.band) {
      const filtered = await page.evaluate(([b, c, r]) => window.API.bandOnly(b, c, r), [opts.band, BAND_COLUMNS, BAND_ROWS]);
      if (!filtered) {
        warnings++;
        console.warn('  ! --band: no base-colour texture on this model, nothing filtered');
      }
    }
    if (!runSheet) await page.evaluate(() => window.API.clearTiles());

    const jobs = [];
    if (opts.isolate) {
      const names = await page.evaluate(() => window.API.meshNames());
      if (names.length >= 32 && stats.meshes > 32) {
        warnings++;
        console.warn('  ! --isolate caps at 32 parts; ' + (stats.meshes - 32) + ' not rendered');
      }
      if (modes.length > 1 || views.length > 1) {
        warnings++;
        console.warn('  ! --isolate uses only the first mode and view (' + modes[0] + ' / ' + views[0].name + ')');
      }
      names.forEach((mn, idx) => jobs.push({ mode: modes[0], view: views[0], isolateIndex: idx, label: mn.slice(0,22) }));
    } else if (ladderJobs) {
      ladderJobs.forEach((lj, idx) => {
        const view = viewByKey.get(AUTO[lj.view] ? resolveAuto(lj.view, stats.boundsSize) : lj.view);
        const tier = String(idx + 1).padStart(2, '0');
        jobs.push({ mode: lj.mode, view, isolateIndex: -1,
          grid: opts.given.has('grid') ? opts.grid : !!lj.grid,
          label: (idx + 1) + ' ' + MODE_LABEL[lj.mode] + ' ' + view.label,
          caption: tier + ' ' + MODE_LABEL[lj.mode] + ' ' + view.label.replace(/^az(-?[\d.]+) el(-?[\d.]+)$/, '$1/$2') + ' '
            + stats.boundsSize.map(v => v.toFixed(2)).join('×') + 'm ' + stats.triangles + 't',
          file: tier + '_' + lj.mode + '_' + view.name });
      });
    } else {
      for (const mode of modes) for (const view of views)
        jobs.push({ mode, view, isolateIndex: -1,
          label: modes.length > 1 ? mode + ' / ' + view.name : view.name,
          caption: MODE_LABEL[mode] + ' · ' + view.label });
    }

    if (runSheet) for (const j of jobs) j.label = name + ' ' + j.label;

    // Matching ortho half-height to tan(fov/2)*dist puts an orthographic tile at the
    // same apparent size as a perspective one, so the two projections stay comparable.
    // In ladder mode the lock is measured over all eight views, not just the ones being
    // rendered, so a --ladder 4 tile is framed exactly like the same tile from
    // --ladder 8. Not byte-identical: the cell size differs per tier, so it is the same
    // framing at a different resolution.
    const lockViews = ladderJobs
      ? [...new Set(LADDER.flatMap(l => AUTO[l.view] || [l.view]))].map(parseView)
      : jobs.map(j => j.view);
    if (opts.lockScale) {
      let dist = 0, half = 0;
      for (const v of lockViews) {
        const m = await page.evaluate(c => window.API.measure(c),
          { ...cfgBase, preset: v.preset, az: v.az, el: v.el });
        dist = Math.max(dist, m.dist); half = Math.max(half, m.half);
      }
      cfgBase.lockDist = dist;
      cfgBase.lockHalf = Math.max(half, Math.tan(opts.fov * Math.PI / 360) * dist);
      if (opts.verbose) console.log('   lock: dist=' + dist.toFixed(3) + ' half=' + cfgBase.lockHalf.toFixed(3));
    }

    for (const j of jobs) {
      const cfg = { ...cfgBase, mode: j.mode, isolateIndex: j.isolateIndex,
        preset: j.view.preset, az: j.view.az, el: j.view.el, viewOrtho: j.view.viewOrtho,
        keepTile: opts.sheet, label: j.label, caption: j.caption, grid: j.grid ?? cfgBase.grid };
      const b64 = await page.evaluate(c => window.API.render(c), cfg);
      if (!opts.sheetOnly) {
        const fn = j.file ? j.file
          : j.isolateIndex >= 0
            ? 'iso_' + String(j.isolateIndex).padStart(3,'0') + '_' + j.label.replace(/[^\w.-]/g,'_')
            : j.mode + '_' + j.view.name + bandSuffix;
        await write(path.join(dir, fn + '.png'), b64);
      }
    }

    if (opts.sheet && !runSheet) {
      const b64 = await page.evaluate(c => window.API.sheet(c), cfgBase);
      if (b64) await write(path.join(opts.out, name + bandSuffix + '_sheet.png'), b64);
    }
  } catch (e) { failures++; console.error('  x failed:', e.message); }
}

if (runSheet) {
  const b64 = await page.evaluate(c => window.API.sheet(c), cfgBase);
  if (b64) await write(path.join(opts.out, 'sheet' + bandSuffix + '.png'), b64);
}

if (!opts.compare) {
  if (opts.verbose) {
    const mem = await page.evaluate(() => window.API.memInfo());
    console.log('  gpu objects at exit: ' + mem.geometries + ' geometries, ' + mem.textures + ' textures');
  }
  await browser.close();
  server.close();
  const tail = [failures ? failures + ' failure(s)' : '', warnings ? warnings + ' warning(s)' : ''].filter(Boolean);
  console.log(tail.length ? 'done with ' + tail.join(', ') : 'done');
}
process.exitCode = failures ? 1 : 0;
