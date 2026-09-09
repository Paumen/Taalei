#!/usr/bin/env node
// Cross-kit size report: for every kind tag, what one kit makes a thing and what the
// other kits make the same thing, so a kit that is out of scale with the rest is
// visible without rendering all of them side by side.
//
//   node tools/maat-rapport.mjs [--tag <id>] [--kit <slug>] [--ratio 1.6]
//                               [--spread 8] [--json out.json]
//
// Heights are measured from the glb itself -- the world-space bounding box over every
// primitive, node transforms applied -- not from catalog.json wdh, which is rounded to
// 0.1 m and so reports every plate, coin and shell in the catalogue as 0.0 or 0.1.
//
// A kit is flagged for a tag when its median height differs from the median across the
// other kits carrying that tag by more than --ratio (default 1.6x either way). Tags
// that name a theme, a build property or a kit (object, ngons, kay, ...) are skipped:
// they group things that have no reason to share a size, and so is any tag whose own
// models span more than --spread from p10 to p90 -- it is not naming one size of thing.

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const CATALOG = 'catalog/catalog.json';
const ROOT = 'kits/workfiles';

// Not a kind of thing: a theme, a provenance mark, or a property of the mesh.
const NOT_A_KIND = new Set(['object', 'nature', 'structure', 'modular', 'ngons', 'animation',
  'assembly', 'hero', 'ken', 'kay', 'qua', 'own', 'pirate', 'halloween', 'robin-hood']);

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = args.indexOf('--' + name);
  if (i < 0) return dflt;
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) die('--' + name + ' needs a value');
  return v;
};
function die(msg) { console.error('maat-rapport: ' + msg); process.exit(1); }

const onlyTag = flag('tag', null);
const onlyKit = flag('kit', null);
const ratio = Number(flag('ratio', '1.6'));
const jsonOut = flag('json', null);
const spread = Number(flag('spread', '8'));
if (!Number.isFinite(spread) || spread <= 1) die('--spread must be greater than 1');
if (!Number.isFinite(ratio) || ratio <= 1) die('--ratio must be greater than 1');

// --- glb geometry ---------------------------------------------------------------

function readGlbJson(buf) {
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) return null;
  const len = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) return null;
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

const IDENTITY = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];

function mul(a, b) {  // column-major, as glTF stores them
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let v = 0;
    for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = v;
  }
  return o;
}

function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  const [qx, qy, qz, qw] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

const apply = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

// The bounds come from each POSITION accessor's own min/max, which glTF requires, so
// no vertex data is decoded: the eight corners of that box through the node's world
// matrix bound the primitive exactly for any affine transform.
function worldBounds(doc) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let any = false;
  const visit = (idx, parent) => {
    const n = doc.nodes[idx];
    if (!n) return;
    const m = mul(parent, nodeMatrix(n));
    if (n.mesh !== undefined && doc.meshes[n.mesh]) {
      for (const prim of doc.meshes[n.mesh].primitives || []) {
        const acc = doc.accessors?.[prim.attributes?.POSITION];
        if (!acc || !acc.min || !acc.max) continue;
        any = true;
        for (let c = 0; c < 8; c++) {
          const p = apply(m, [
            c & 1 ? acc.max[0] : acc.min[0],
            c & 2 ? acc.max[1] : acc.min[1],
            c & 4 ? acc.max[2] : acc.min[2],
          ]);
          for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; }
        }
      }
    }
    for (const child of n.children || []) visit(child, m);
  };
  const scene = doc.scenes?.[doc.scene ?? 0];
  for (const r of scene?.nodes || []) visit(r, IDENTITY);
  if (!any) return null;
  return { w: hi[0] - lo[0], h: hi[1] - lo[1], d: hi[2] - lo[2] };
}

// --- report ---------------------------------------------------------------------

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const catalog = JSON.parse(await fs.readFile(CATALOG, 'utf8'));
const tagType = new Map(catalog.tags.map(t => [t.id, t.type]));

const size = new Map();   // "kit/name" -> {w,h,d}
let missing = 0;
for (const m of catalog.models) {
  const file = path.join(ROOT, m.kit, m.name + '.glb');
  const buf = await fs.readFile(file).catch(() => null);
  if (!buf) { missing++; continue; }
  const doc = readGlbJson(buf);
  const b = doc && worldBounds(doc);
  if (b) size.set(m.kit + '/' + m.name, b);
}
if (missing) console.warn('! ' + missing + ' model(s) in the catalogue have no workfile glb');

const byTag = new Map();
for (const m of catalog.models) {
  const b = size.get(m.kit + '/' + m.name);
  if (!b) continue;
  if (onlyKit && m.kit !== onlyKit) continue;
  for (const t of m.tags || []) {
    if (tagType.get(t) !== 'tag' || NOT_A_KIND.has(t)) continue;
    if (onlyTag && t !== onlyTag) continue;
    if (!byTag.has(t)) byTag.set(t, new Map());
    const kits = byTag.get(t);
    if (!kits.has(m.kit)) kits.set(m.kit, []);
    kits.get(m.kit).push({ name: m.name, h: b.h, w: b.w, d: b.d });
  }
}

// A tag only defines a size to be out of when the tag itself names one size of thing.
// flora spans a 2 m tree and a 3 cm sprig, so every kit is an outlier against the
// others and none of it means anything: tags whose own models span more than
// --spread from p10 to p90 are reported as unusable rather than measured.
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
};

const findings = [];
const loose = [];
for (const [tag, kits] of byTag) {
  if (kits.size < 2) continue;                       // nothing to compare against
  const all = [...kits.values()].flat().map(x => x.h);
  const lo = pct(all, 0.1), hi = pct(all, 0.9);
  if (lo > 0 && hi / lo > spread) { loose.push({ tag, n: all.length, lo, hi, span: hi / lo }); continue; }
  const perKit = [...kits].map(([kit, ms]) => ({ kit, n: ms.length, med: median(ms.map(x => x.h)), ms }));
  for (const k of perKit) {
    const others = perKit.filter(o => o.kit !== k.kit).flatMap(o => o.ms.map(x => x.h));
    if (!others.length) continue;
    const ref = median(others);
    const r = k.med / ref;
    if (r >= ratio || r <= 1 / ratio) {
      const ex = [...k.ms].sort((a, b) => b.h - a.h)[r >= ratio ? 0 : k.ms.length - 1];
      findings.push({ tag, kit: k.kit, n: k.n, med: k.med, ref, ratio: r,
        example: ex.name, exampleH: ex.h });
    }
  }
}
findings.sort((a, b) => Math.max(b.ratio, 1 / b.ratio) - Math.max(a.ratio, 1 / a.ratio));

const fm = (x) => (x >= 1 ? x.toFixed(2) + ' m' : (x * 100).toFixed(1) + ' cm');
console.log('measured ' + size.size + ' models over ' + byTag.size + ' kind tags\n');
console.log('tag            kit                  n   median      others      x');
for (const f of findings) {
  const mult = f.ratio >= 1 ? f.ratio.toFixed(1) + '× bigger' : (1 / f.ratio).toFixed(1) + '× smaller';
  console.log(f.tag.padEnd(15) + f.kit.padEnd(21) + String(f.n).padStart(2)
    + fm(f.med).padStart(10) + fm(f.ref).padStart(12) + '   ' + mult
    + '   e.g. ' + f.example + ' ' + fm(f.exampleH));
}
console.log('\n' + findings.length + ' kit/tag pair(s) outside ' + ratio + '×'
  + ' over ' + (byTag.size - loose.length) + ' comparable tag(s)');
if (loose.length) {
  loose.sort((a, b) => b.span - a.span);
  console.log('\nnot a size class (p10..p90 spans more than ' + spread + '×), not measured:');
  for (const l of loose)
    console.log('  ' + l.tag.padEnd(14) + String(l.n).padStart(4) + ' models   '
      + fm(l.lo) + ' .. ' + fm(l.hi) + '   ' + l.span.toFixed(0) + '×');
}

if (jsonOut) {
  const dump = { ratio, spread, findings, loose, tags: [...byTag].map(([tag, kits]) => ({
    tag, kits: [...kits].map(([kit, ms]) => ({ kit, n: ms.length, median: median(ms.map(x => x.h)),
      models: ms.map(x => ({ name: x.name, h: +x.h.toFixed(4), w: +x.w.toFixed(4), d: +x.d.toFixed(4) })) })) })) };
  await fs.writeFile(jsonOut, JSON.stringify(dump, null, 2));
  console.log('wrote ' + jsonOut);
}
