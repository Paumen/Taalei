import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModel, saveModel, bounds, median, clamp, samples, profile, straightRuns, warp, BINS } from './mesh.mjs';

const HELP = `stylize.mjs <batch.json> [name,...]

Resizes and reshapes the models a batch file names, from its "src" folder into its
"out" folder, and prints one JSON line per model with what it did. Never writes
into "src". Each model is one node with one mesh of one primitive.

Shape, in this order:
  stick    a model over 4x as tall as wide gets thicker; straight runs keep
           their length and the ends scale evenly. Off for "noStick".
  squeeze  otherwise a model taller than wide has its straight runs shortened,
           never below their own width; round and square parts are untouched.
           Off for "keep".
  flat     a flat model is thickened in height toward its kind's thickness in
           the catalogue (at least 3 peers; "flatRefs" names peers by model).
           Off for "noFlat", mixed kinds and children.
  depth    models in "depth" get their thinnest axis thickened toward the
           given share of their longest side, at most 2.5x.

Size, the longest side:
  parent   "size": {"name": {"parent": "other"}} scales with the other model.
  refs     {"refs": [catalogue names]}: between those models and the curve.
  curve    "curve": a * L^b on the model's own length.
  kind     the kind's catalogue median times (length / batch kind median)^0.5,
           when the kind has 3 or more peers in other kits.
  mixed    kinds in "mixedKinds": between the kind median and the curve.
  height   kinds in "heightKinds" also aim at the kind's median height.
  Then the kind's longest.min/max and high.min/max limits apply, unless the
  model is in "noClamp".

batch.json:
  { "src": dir, "out": dir, "kits": [kit], "dropKits": [kit], "models": { name: kind },
    "curve": [0.70, 0.511], "blend": 0.75,
    "size": {}, "mixedKinds": [], "heightKinds": [],
    "keep": [], "noStick": [], "noFlat": [], "noClamp": [],
    "flatRefs": { name: [catalogue names] }, "depth": { name: share } }

  "kits" names the batch's own kits and "dropKits" kits that skew a kind; neither
  counts as a peer.`;

const P_SQUEEZE = 0.63;

function args() {
  const [file, only] = process.argv.slice(2);
  if (!file || file === '--help') { console.log(HELP); process.exit(file ? 0 : 1); }
  const batch = JSON.parse(readFileSync(file, 'utf8'));
  const set = (k) => new Set(batch[k] ?? []);
  if (!batch.kits?.length) { console.error('batch.json needs "kits"'); process.exit(1); }
  return {
    ...batch,
    dropKits: batch.dropKits ?? [],
    curve: batch.curve ?? [0.7, 0.511],
    blend: batch.blend ?? 0.75,
    size: batch.size ?? {},
    flatRefs: batch.flatRefs ?? {},
    depth: batch.depth ?? {},
    mixedKinds: set('mixedKinds'), heightKinds: set('heightKinds'),
    keep: set('keep'), noStick: set('noStick'), noFlat: set('noFlat'), noClamp: set('noClamp'),
    only: only ? only.split(',') : null,
  };
}

const B = args();
const mix = (o, c) => o ** (1 - B.blend) * c ** B.blend;
const curve = (L) => B.curve[0] * L ** B.curve[1];
const build = fileURLToPath(new URL('../../catalog/build/', import.meta.url));
const catalog = JSON.parse(readFileSync(join(build, 'catalog.json'), 'utf8')).models;
const groups = Object.fromEntries(JSON.parse(readFileSync(join(build, 'scale-groups.json'), 'utf8')).map((g) => [g.slug, g]));
const own = new Set([...B.kits, ...B.dropKits]);
const others = catalog.filter((m) => !own.has(m.kit));
const peers = (kind) => (groups[kind]?.items ?? []).filter((i) => !own.has(i.slug));

const original = {};
const orig = (n) => (original[n] ??= bounds(loadModel(join(B.src, `${n}.glb`)).P).size);
const parentOf = (n) => B.size[n]?.parent;
const rel = (n, pick) => {
  const same = Object.keys(B.models).filter((m) => B.models[m] === B.models[n] && !parentOf(m));
  return pick(orig(n)) / median(same.map((m) => pick(orig(m))));
};
const longest = (s) => Math.max(...s);

function stick(Q, M, S, log) {
  const { size } = bounds(Q);
  const w = Math.max(size[0], size[2]), h = size[1];
  if (h <= 4 * w) return null;
  const f = (h / w) ** (1 - P_SQUEEZE);
  const prof = profile(S);
  const { mask } = straightRuns(prof);
  const fx = new Array(BINS).fill(f);
  log.thicken = +f.toFixed(2);
  return warp(Q, M, prof, fx, mask.map((m) => (m ? 1 : f)), fx);
}

function squeeze(Q, M, S, log) {
  const { size } = bounds(Q);
  const w = Math.max(size[0], size[2]), h = size[1];
  if (h <= w) return null;
  const prof = profile(S);
  const { runs } = straightRuns(prof);
  const spare = runs.reduce((s, r) => s + Math.max(0, r.length - r.width), 0);
  const want = (h - w * (h / w) ** P_SQUEEZE) / h;
  if (spare <= 0 || want <= 0) return null;
  const r = Math.min(1, (want * prof.H) / spare);
  const fy = new Array(BINS).fill(1);
  for (const run of runs) if (run.length > run.width) {
    for (let i = run.i; i <= run.j; i++) fy[i] *= (run.length - r * (run.length - run.width)) / run.length;
  }
  log.squeeze = +(1 - Math.min(want, spare / prof.H)).toFixed(2);
  const ones = new Array(BINS).fill(1);
  return warp(Q, M, prof, ones, fy, ones);
}

function flatRatio(n) {
  const named = B.flatRefs[n];
  const rows = named
    ? others.filter((m) => named.includes(m.name) && m.wdh[2] < 0.35 * Math.max(m.wdh[0], m.wdh[1]))
    : others.filter((m) => m.kind === B.models[n] && m.wdh[2] < Math.max(m.wdh[0], m.wdh[1]));
  if (rows.length < (named ? 1 : 3)) return null;
  return median(rows.map((m) => m.wdh[2] / Math.max(m.wdh[0], m.wdh[1])));
}

function scaleAxis(Q, M, ax, f, fromBottom) {
  const b = bounds(Q);
  const c = fromBottom ? b.min[ax] : (b.min[ax] + b.max[ax]) / 2;
  const R = Q.slice(), Nn = M.slice();
  for (let v = ax; v < Q.length; v += 3) { R[v] = c + (Q[v] - c) * f; Nn[v] /= f; }
  return [R, Nn];
}

function flat(n, Q, M, log) {
  const { size } = bounds(Q);
  const L = Math.max(size[0], size[2]), r = size[1] / L;
  if (B.noFlat.has(n) || r >= 1 || Math.min(size[0], size[2]) < 1.5 * size[1]) return [Q, M];
  if (!B.flatRefs[n] && (B.mixedKinds.has(B.models[n]) || parentOf(n))) return [Q, M];
  const rc = flatRatio(n);
  if (rc === null) return [Q, M];
  const f = clamp(mix(r, rc) / r, 1, 3);
  if (f <= 1) return [Q, M];
  log.thickenY = +f.toFixed(2);
  return scaleAxis(Q, M, 1, f, true);
}

function depth(n, Q, M, log) {
  if (!(n in B.depth)) return [Q, M];
  const { size } = bounds(Q);
  const ax = size.indexOf(Math.min(...size));
  const r = size[ax] / longest(size);
  const f = clamp(mix(r, B.depth[n]) / r, 1, 2.5);
  if (f <= 1) return [Q, M];
  log.depth = +f.toFixed(2);
  return scaleAxis(Q, M, ax, f, ax === 1);
}

function shape(n, model, log) {
  let Q = model.P.slice(), M = model.N.slice();
  const S = samples(Q, model.F);
  const stuck = B.noStick.has(n) ? null : stick(Q, M, S, log);
  if (stuck) [Q, M] = stuck;
  else if (!B.keep.has(n)) [Q, M] = squeeze(Q, M, S, log) ?? [Q, M];
  [Q, M] = flat(n, Q, M, log);
  [Q, M] = depth(n, Q, M, log);
  return [Q, M];
}

const factor = {};

function target(n, Q, log) {
  const kind = B.models[n];
  const { size } = bounds(Q);
  const L0 = longest(size), H0 = size[1];
  const spec = B.size[n];
  if (spec?.parent) {
    log.size = 'parent';
    return factor[spec.parent] * L0;
  }
  const R = peers(kind).map((i) => longest(i.wdh));
  let tgt;
  if (spec?.refs) {
    tgt = (median(others.filter((m) => spec.refs.includes(m.name)).map((m) => longest(m.wdh))) * curve(L0)) ** 0.5;
    log.size = 'refs';
  } else if (spec === 'curve' || R.length < 3) {
    tgt = curve(L0);
    log.size = 'curve';
  } else if (!B.mixedKinds.has(kind)) {
    tgt = median(R) * rel(n, longest) ** 0.5;
    log.size = 'kind';
  } else {
    tgt = (curve(L0) * median(R) * rel(n, longest) ** 0.5) ** 0.5;
    log.size = 'mixed';
  }
  if (B.heightKinds.has(kind)) {
    const hR = median(peers(kind).map((i) => i.wdh[2]));
    tgt = ((tgt * L0 * hR * rel(n, (s) => s[1]) ** 0.5) / H0) ** 0.5;
    log.size += '+height';
  }
  const lim = B.noClamp.has(n) ? {} : groups[kind]?.limits ?? {};
  tgt = clamp(tgt, lim['longest.min'] ?? 0, lim['longest.max'] ?? Infinity);
  if (lim['high.min']) tgt = Math.max(tgt, (lim['high.min'] * 1.03 * L0) / H0);
  if (lim['high.max']) tgt = Math.min(tgt, (lim['high.max'] * 0.97 * L0) / H0);
  return tgt;
}

function run(n) {
  const model = loadModel(join(B.src, `${n}.glb`));
  const log = { n, kind: B.models[n] };
  const [Q, M] = shape(n, model, log);
  const L0 = longest(bounds(Q).size);
  const tgt = target(n, Q, log);
  factor[n] = tgt / L0;
  const b = bounds(model.P);
  const g = tgt / L0;
  const centre = [((b.min[0] + b.max[0]) / 2) * g, 0, ((b.min[2] + b.max[2]) / 2) * g];
  const wdh = saveModel(model, Q, M, g, centre, join(B.out, `${n}.glb`));
  log.cm = wdh.map((x) => +(x * 100).toFixed(1));
  console.log(JSON.stringify(log));
}

mkdirSync(B.out, { recursive: true });
const names = B.only ?? Object.keys(B.models);
const order = (n) => {
  let d = 0;
  for (let p = parentOf(n); p; p = parentOf(p)) d++;
  return d;
};
for (const n of [...names].sort((a, b) => order(a) - order(b))) {
  if (parentOf(n) && !(parentOf(n) in factor)) run(parentOf(n));
  run(n);
}
