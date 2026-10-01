#!/usr/bin/env node
// Usage: node lint/glb-lint.mjs <file.glb|folder>... [--json report.json] [--only-problems]
// Needs: npm install
import fs from 'fs';
import path from 'path';
import validator from 'gltf-validator';

const CFG = {
  groundTol: 0.02,           // m: lowest point must be within this of y=0
  centreTol: 0.02,           // m: footprint centre must be within this of x=0 and z=0
  checkPlacement: true,      // false for modular kits with corner pivots (walls, floors)
  degenerateWarn: 0.01,      // share of triangles
  doubledWarn: 0.01,
  atlas: { cols: 16, rows: 4, eps: 1e-3 },
  nonManifoldWarn: 0.02,
  ruleAgreeMin: 0.9,         // below this: "no single soft/sharp rule"
  densityLow: 150,           // triangles per m² of surface
  densityHigh: 20000,
  rawExtentFar: 50,          // raw shape bigger than this (before node scale) = odd units
  house: { materials: 1, texture: 'Textures/colormap.png' },
  ignoreCodes: ['URI_GLB', 'BUFFER_VIEW_TARGET_MISSING'],
};

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const onlyProblems = args.includes('--only-problems');
const inputs = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--json');
if (!inputs.length) { console.log('usage: node lint/glb-lint.mjs <file.glb|folder>... [--json out.json] [--only-problems]'); process.exit(2); }

const files = inputs.flatMap(p => fs.statSync(p).isDirectory()
  ? fs.readdirSync(p, { recursive: true }).filter(f => f.endsWith('.glb')).map(f => path.join(p, f))
  : [p]).sort();

// ---------- reading ----------
function readGlb(buf) {
  let json, bin;
  for (let o = 12; o < buf.length;) {
    const len = buf.readUInt32LE(o), type = buf.readUInt32LE(o + 4), chunk = buf.subarray(o + 8, o + 8 + len);
    if (type === 0x4E4F534A) json = JSON.parse(chunk.toString('utf8')); else bin = chunk;
    o += 8 + len;
  }
  return { json, bin };
}
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function accessor(g, i) {
  const a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView], T = COMP[a.componentType], n = NCOMP[a.type];
  const size = T.BYTES_PER_ELEMENT, stride = bv.byteStride || size * n;
  const base = g.bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0);
  const dv = new DataView(g.bin.buffer), out = new Float64Array(a.count * n);
  const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = dv[get](base + k * stride + c * size, true);
  return out;
}

// ---------- small maths ----------
const mul = (a, b) => { const r = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return r; };
function local(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
          (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
          (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
function normalMat(m) {
  const a = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const c = [a[4] * a[8] - a[5] * a[7], a[5] * a[6] - a[3] * a[8], a[3] * a[7] - a[4] * a[6],
             a[2] * a[7] - a[1] * a[8], a[0] * a[8] - a[2] * a[6], a[1] * a[6] - a[0] * a[7],
             a[1] * a[5] - a[2] * a[4], a[2] * a[3] - a[0] * a[5], a[0] * a[4] - a[1] * a[3]];
  const det = a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
  return c.map(v => v / det); // row-major inverse-transpose of column-major 3x3
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const deg = c => Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;

// ---------- geometry checks for one primitive (world space) ----------
function analysePrim(P, N, I) {
  const nv = P.length / 3, nt = I.length / 3;
  let ext = 0; for (let k = 0; k < P.length; k++) ext = Math.max(ext, Math.abs(P[k]));
  const eps = Math.max(1e-7, ext * 1e-5);
  const weld = new Int32Array(nv), keys = new Map();
  for (let v = 0; v < nv; v++) {
    const k = `${Math.round(P[3 * v] / eps)},${Math.round(P[3 * v + 1] / eps)},${Math.round(P[3 * v + 2] / eps)}`;
    if (!keys.has(k)) keys.set(k, keys.size); weld[v] = keys.get(k);
  }
  const pv = v => [P[3 * v], P[3 * v + 1], P[3 * v + 2]], nvv = v => [N[3 * v], N[3 * v + 1], N[3 * v + 2]];
  let zeroN = 0; for (let v = 0; v < nv; v++) if (len(nvv(v)) < 0.5) zeroN++;
  const fn = [], ok = [], area = []; let degen = 0, flat = 0, surf = 0;
  const triKeys = new Map(), edges = new Map();
  const parent = Array.from({ length: keys.size }, (_, i) => i);
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let f = 0; f < nt; f++) {
    const [a, b, c] = [I[3 * f], I[3 * f + 1], I[3 * f + 2]];
    const n = cross(sub(pv(b), pv(a)), sub(pv(c), pv(a))), l = len(n);
    area[f] = l / 2; surf += l / 2;
    ok[f] = l > eps * eps; fn[f] = ok[f] ? n.map(x => x / l) : [0, 0, 0];
    if (!ok[f]) { degen++; continue; }
    if ([a, b, c].every(v => len(nvv(v)) > 0.5 && deg(dot(fn[f], nvv(v)) / len(nvv(v))) < 1)) flat++;
    const w = [weld[a], weld[b], weld[c]];
    const tk = [...w].sort((x, y) => x - y).join(','); triKeys.set(tk, (triKeys.get(tk) || 0) + 1);
    parent[find(w[1])] = find(w[0]); parent[find(w[2])] = find(w[0]);
    for (let k = 0; k < 3; k++) {
      const u = [a, b, c][k], v = [a, b, c][(k + 1) % 3], ek = Math.min(weld[u], weld[v]) + ',' + Math.max(weld[u], weld[v]);
      if (!edges.has(ek)) edges.set(ek, []); edges.get(ek).push({ f, u, v });
    }
  }
  let doubled = 0; for (const c of triKeys.values()) if (c > 1) doubled += c;
  let nonMan = 0; const folds = [];
  for (const L of edges.values()) {
    if (L.length > 2) nonMan++;
    if (L.length !== 2) continue;
    const [e1, e2] = L, fold = deg(dot(fn[e1.f], fn[e2.f]));
    if (fold < 0.5) continue;
    const at = w => [e1.u, e1.v].find(x => weld[x] === w), bt = w => [e2.u, e2.v].find(x => weld[x] === w);
    const shared = weld[e1.u];
    const d = len(sub(nvv(at(shared)), nvv(bt(shared))));
    folds.push([fold, d > 0.02]);
  }
  const used = new Set(); for (let v = 0; v < nv; v++) used.add(find(weld[v]));
  return { nt, nv, uniq: keys.size, zeroN, degen, flat, surf, doubled, nonMan, edges: edges.size, folds, parts: used.size };
}

function bestRule(folds) {
  if (!folds.length) return null;
  let best = { cut: 0, agree: -1 };
  for (let t = 0; t <= 180; t++) {
    let ok = 0; for (const [a, s] of folds) if ((a > t) === s) ok++;
    if (ok > best.agree) best = { cut: t, agree: ok };
  }
  const softMax = Math.max(0, ...folds.filter(f => !f[1]).map(f => f[0]));
  return { cut: best.cut, agree: best.agree / folds.length, allSharp: folds.every(f => f[1]), allSoft: folds.every(f => !f[1]), softMax };
}

// ---------- per file ----------
async function lint(file) {
  const buf = fs.readFileSync(file), g = readGlb(buf), j = g.json, out = [];
  const add = (level, check, msg) => out.push({ level, check, msg });
  const pct = x => (100 * x).toFixed(1) + '%';

  const rep = await validator.validateBytes(new Uint8Array(buf), {
    uri: file, maxIssues: 0,
    externalResourceFunction: u => new Promise((res, rej) => fs.readFile(path.join(path.dirname(file), decodeURIComponent(u)), (e, d) => e ? rej(e) : res(new Uint8Array(d)))),
  });
  const byCode = {};
  for (const m of rep.issues.messages) if (!CFG.ignoreCodes.includes(m.code)) (byCode[m.code] ||= { n: 0, sev: m.severity, msg: m.message }).n++;
  for (const [code, v] of Object.entries(byCode))
    add(v.sev === 0 ? 'error' : v.sev === 1 ? 'warn' : 'info', 'validator', `${code} ×${v.n} — ${v.msg}`);

  const meta = j.asset?.extras?.taaleiland;
  if ((j.materials || []).length !== CFG.house.materials) add('warn', 'house', `${(j.materials || []).length} materials (expected ${CFG.house.materials})`);
  for (const im of j.images || []) if (im.uri !== CFG.house.texture) add('warn', 'house', `texture "${im.uri || 'embedded'}" (expected ${CFG.house.texture})`);
  if (meta && !meta.bronmodel) add('info', 'meta', 'no bronmodel in metadata');

  const nodes = j.nodes || [], parent = {};
  nodes.forEach((n, i) => (n.children || []).forEach(c => parent[c] = i));
  const world = i => { let m = local(nodes[i]); while (parent[i] !== undefined) { i = parent[i]; m = mul(local(nodes[i]), m); } return m; };
  if (nodes.some((n, i) => n.children && !('mesh' in n) && parent[i] === undefined && n.children.length === 1)) add('info', 'structure', 'wrapper node around the mesh (box inside a box)');
  if (nodes.some(n => n.rotation && Math.abs(n.rotation[3]) < 0.9999)) add('info', 'structure', 'rotation stored on the node, not in the shape');
  if (nodes.some(n => n.scale && (Math.abs(n.scale[0] - n.scale[1]) > 1e-6 || Math.abs(n.scale[0] - n.scale[2]) > 1e-6))) add('warn', 'structure', 'non-uniform scale on a node');
  if ((j.animations || []).length) add('info', 'structure', `${j.animations.length} animation(s): ${j.animations.map(a => a.name).join(', ')}`);

  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], rawExt = 0;
  const T = { nt: 0, nv: 0, uniq: 0, zeroN: 0, degen: 0, flat: 0, surf: 0, doubled: 0, nonMan: 0, edges: 0, parts: 0 }, folds = [];
  let xband = 0;
  for (let ni = 0; ni < nodes.length; ni++) {
    if (!('mesh' in nodes[ni])) continue;
    const W = world(ni), NM = normalMat(W);
    for (const pr of j.meshes[nodes[ni].mesh].primitives) {
      if ((pr.mode ?? 4) !== 4) { add('warn', 'geometry', `primitive mode ${pr.mode} (not triangles) skipped`); continue; }
      const Pr = accessor(g, pr.attributes.POSITION), nv = Pr.length / 3;
      const Nr = pr.attributes.NORMAL !== undefined ? accessor(g, pr.attributes.NORMAL) : null;
      if (!Nr) add('warn', 'shading', 'no stored normals: viewer will guess');
      const I = pr.indices !== undefined ? accessor(g, pr.indices) : Float64Array.from({ length: nv }, (_, k) => k);
      const P = new Float64Array(nv * 3), N = new Float64Array(nv * 3);
      for (let v = 0; v < nv; v++) {
        const [x, y, z] = [Pr[3 * v], Pr[3 * v + 1], Pr[3 * v + 2]];
        rawExt = Math.max(rawExt, Math.abs(x), Math.abs(y), Math.abs(z));
        for (let c = 0; c < 3; c++) { P[3 * v + c] = W[c] * x + W[4 + c] * y + W[8 + c] * z + W[12 + c]; lo[c] = Math.min(lo[c], P[3 * v + c]); hi[c] = Math.max(hi[c], P[3 * v + c]); }
        if (Nr) {
          const n0 = [Nr[3 * v], Nr[3 * v + 1], Nr[3 * v + 2]], l0 = len(n0);
          const t = [0, 1, 2].map(r => NM[3 * r] * n0[0] + NM[3 * r + 1] * n0[1] + NM[3 * r + 2] * n0[2]), l = len(t) || 1;
          for (let c = 0; c < 3; c++) N[3 * v + c] = t[c] / l * l0;
        }
      }
      const mat = (j.materials || [])[pr.material];
      if (mat?.pbrMetallicRoughness?.baseColorTexture && pr.attributes.TEXCOORD_0 !== undefined) {
        const Uv = accessor(g, pr.attributes.TEXCOORD_0);
        for (let t = 0; t + 2 < I.length; t += 3) {
          const cu = Math.floor((Uv[2 * I[t]] + Uv[2 * I[t + 1]] + Uv[2 * I[t + 2]]) / 3 * CFG.atlas.cols);
          const cv = Math.floor((Uv[2 * I[t] + 1] + Uv[2 * I[t + 1] + 1] + Uv[2 * I[t + 2] + 1]) / 3 * CFG.atlas.rows);
          const outside = [I[t], I[t + 1], I[t + 2]].some(v => {
            const u = Uv[2 * v] * CFG.atlas.cols, w = Uv[2 * v + 1] * CFG.atlas.rows;
            return u < cu - CFG.atlas.eps || u > cu + 1 + CFG.atlas.eps || w < cv - CFG.atlas.eps || w > cv + 1 + CFG.atlas.eps;
          });
          if (outside) xband++;
        }
      }
      const r = analysePrim(P, N, I);
      for (const k in T) T[k] += r[k];
      folds.push(...r.folds);
    }
  }
  if (!T.nt) { add('error', 'geometry', 'no triangles'); return { file, findings: out }; }

  const size = sub(hi, lo), cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
  if (CFG.checkPlacement && Math.abs(lo[1]) >= CFG.groundTol) add('warn', 'placement', `lowest point at y=${lo[1].toFixed(3)} m: ${lo[1] > 0 ? 'floats above' : 'sinks into'} the ground`);
  if (CFG.checkPlacement && (Math.abs(cx) >= CFG.centreTol || Math.abs(cz) >= CFG.centreTol)) add('warn', 'placement', `off-centre by x=${cx.toFixed(3)} z=${cz.toFixed(3)} m`);
  if (rawExt > CFG.rawExtentFar) add('info', 'structure', `raw shape spans ±${rawExt.toFixed(0)} units before node scale (odd units)`);

  if (T.zeroN) add('error', 'shading', `${T.zeroN} zero-length normals (black specks / broken light)`);
  if (T.degen / T.nt > CFG.degenerateWarn) add('warn', 'geometry', `${pct(T.degen / T.nt)} triangles with no area`);
  if (T.doubled / T.nt > CFG.doubledWarn) add('warn', 'geometry', `${pct(T.doubled / T.nt)} triangles doubled back-to-back (flicker)`);
  if (xband) add('error', 'colour', `${xband} triangles with corners in different colormap cells (smeared band)`);
  if (T.nonMan / T.edges > CFG.nonManifoldWarn) add('warn', 'geometry', `${pct(T.nonMan / T.edges)} edges shared by 3+ faces`);

  const rule = bestRule(folds);
  let shade = 'n/a';
  if (rule) {
    shade = rule.allSharp ? 'all sharp' : rule.allSoft ? 'all soft' : rule.agree >= CFG.ruleAgreeMin ? `rule ~${rule.cut}° (${pct(rule.agree)} fit)` : `no single rule (best ~${rule.cut}°, ${pct(rule.agree)} fit)`;
    if (!rule.allSharp && !rule.allSoft && rule.agree < CFG.ruleAgreeMin) add('info', 'shading', `soft/sharp set per part, not by one angle (best fit ~${rule.cut}° explains ${pct(rule.agree)})`);
    if (rule.allSoft && rule.softMax >= 80) add('info', 'shading', `everything soft, even ${rule.softMax.toFixed(0)}° corners`);
  }
  const density = T.nt / T.surf;
  if (density < CFG.densityLow) add('info', 'detail', `${density.toFixed(0)} triangles/m²: coarse (fine for boxy shapes, curves look polygonal)`);
  if (density > CFG.densityHigh) add('info', 'detail', `${density.toFixed(0)} triangles/m²: very fine for its size`);

  return {
    file, findings: out,
    stats: { tris: T.nt, verts: T.nv, vertsPerCorner: +(T.nv / T.uniq).toFixed(2), parts: T.parts, flatFaces: +(T.flat / T.nt).toFixed(3), shading: shade,
      size: size.map(v => +v.toFixed(3)), minY: +lo[1].toFixed(4), density: Math.round(density) },
  };
}

// ---------- run ----------
const results = [];
for (const f of files) {
  try { results.push(await lint(f)); } catch (e) { results.push({ file: f, findings: [{ level: 'error', check: 'read', msg: e.message ?? String(e) }] }); }
}
const ICON = { error: '✖', warn: '▲', info: '·' }, ORDER = { error: 0, warn: 1, info: 2 };
for (const r of results) {
  const probs = r.findings.filter(f => f.level !== 'info');
  if (onlyProblems && !probs.length) continue;
  const s = r.stats;
  console.log(`\n${path.relative(process.cwd(), r.file)}${s ? `  [${s.tris} tris, ${s.parts} parts, ${s.size.join('×')} m, ${s.shading}]` : ''}`);
  for (const f of r.findings.sort((a, b) => ORDER[a.level] - ORDER[b.level])) if (!onlyProblems || f.level !== 'info') console.log(`  ${ICON[f.level]} ${f.check.padEnd(9)} ${f.msg}`);
}
const count = l => results.filter(r => r.findings.some(f => f.level === l)).length;
console.log(`\n${results.length} files — ${count('error')} with errors, ${count('warn')} with warnings`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2));
process.exit(count('error') ? 1 : 0);
