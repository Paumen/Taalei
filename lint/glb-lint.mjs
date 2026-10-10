#!/usr/bin/env node
// Usage: node lint/glb-lint.mjs <file.glb|folder>... [--json report.json] [--only-problems]
// Needs: npm install
import fs from 'fs';
import path from 'path';
import validator from 'gltf-validator';
import { parseGlb, readAccessor, multiplyMatrix, nodeMatrix } from '../catalog/tools/glb.mjs';

const CFG = {
  degenerateWarn: 0.01,      // share of triangles
  doubledWarn: 0.01,
  atlas: { cols: 16, rows: 4, eps: 1e-3 },
  nonManifoldWarn: 0.02,
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

// ---------- small maths ----------
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
  let nonMan = 0; for (const L of edges.values()) if (L.length > 2) nonMan++;
  const used = new Set(); for (let v = 0; v < nv; v++) used.add(find(weld[v]));
  return { nt, nv, uniq: keys.size, zeroN, degen, flat, surf, doubled, nonMan, edges: edges.size, parts: used.size };
}

// ---------- per file ----------
async function lint(file) {
  const buf = fs.readFileSync(file), g = parseGlb(buf, file), j = g.json, out = [];
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
  const world = i => { let m = nodeMatrix(nodes[i]); while (parent[i] !== undefined) { i = parent[i]; m = multiplyMatrix(nodeMatrix(nodes[i]), m); } return m; };
  if (nodes.some((n, i) => n.children && !('mesh' in n) && parent[i] === undefined && n.children.length === 1)) add('info', 'structure', 'wrapper node around the mesh (box inside a box)');
  if (nodes.some(n => n.rotation && Math.abs(n.rotation[3]) < 0.9999)) add('info', 'structure', 'rotation stored on the node, not in the shape');
  if ((j.scenes?.[j.scene ?? 0]?.nodes || []).some(i => nodes[i].scale)) add('error', 'house', 'scale on a root node: the size belongs in the geometry (tools/import/scale.mjs)');
  if (nodes.some(n => n.scale && (Math.abs(n.scale[0] - n.scale[1]) > 1e-6 || Math.abs(n.scale[0] - n.scale[2]) > 1e-6))) add('warn', 'structure', 'non-uniform scale on a node');
  if ((j.animations || []).length) add('info', 'structure', `${j.animations.length} animation(s): ${j.animations.map(a => a.name).join(', ')}`);

  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], rawExt = 0;
  const T = { nt: 0, nv: 0, uniq: 0, zeroN: 0, degen: 0, flat: 0, surf: 0, doubled: 0, nonMan: 0, edges: 0, parts: 0 };
  let xband = 0;
  for (let ni = 0; ni < nodes.length; ni++) {
    if (!('mesh' in nodes[ni])) continue;
    const W = world(ni), NM = normalMat(W);
    for (const pr of j.meshes[nodes[ni].mesh].primitives) {
      if ((pr.mode ?? 4) !== 4) { add('warn', 'geometry', `primitive mode ${pr.mode} (not triangles) skipped`); continue; }
      const Pr = readAccessor(g, pr.attributes.POSITION).data, nv = Pr.length / 3;
      const Nr = pr.attributes.NORMAL !== undefined ? readAccessor(g, pr.attributes.NORMAL).data : null;
      if (!Nr) add('warn', 'shading', 'no stored normals: viewer will guess');
      const I = pr.indices !== undefined ? readAccessor(g, pr.indices).data : Float64Array.from({ length: nv }, (_, k) => k);
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
        const Uv = readAccessor(g, pr.attributes.TEXCOORD_0).data;
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
    }
  }
  if (!T.nt) { add('error', 'geometry', 'no triangles'); return { file, findings: out }; }

  const size = sub(hi, lo);
  if (rawExt > CFG.rawExtentFar) add('info', 'structure', `raw shape spans ±${rawExt.toFixed(0)} units before node scale (odd units)`);

  if (T.zeroN) add('error', 'shading', `${T.zeroN} zero-length normals (black specks / broken light)`);
  if (T.degen / T.nt > CFG.degenerateWarn) add('warn', 'geometry', `${pct(T.degen / T.nt)} triangles with no area`);
  if (T.doubled / T.nt > CFG.doubledWarn) add('warn', 'geometry', `${pct(T.doubled / T.nt)} triangles doubled back-to-back (flicker)`);
  if (xband) add('error', 'colour', `${xband} triangles with corners in different colormap cells (smeared band)`);
  if (T.nonMan / T.edges > CFG.nonManifoldWarn) add('info', 'geometry', `${pct(T.nonMan / T.edges)} edges shared by 3+ faces`);

  const density = T.nt / T.surf;

  return {
    file, findings: out,
    stats: { tris: T.nt, verts: T.nv, vertsPerCorner: +(T.nv / T.uniq).toFixed(2), parts: T.parts, flatFaces: +(T.flat / T.nt).toFixed(3),
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
  console.log(`\n${path.relative(process.cwd(), r.file)}${s ? `  [${s.tris} tris, ${s.parts} parts, ${s.size.join('×')} m]` : ''}`);
  for (const f of r.findings.sort((a, b) => ORDER[a.level] - ORDER[b.level])) if (!onlyProblems || f.level !== 'info') console.log(`  ${ICON[f.level]} ${f.check.padEnd(9)} ${f.msg}`);
}
const count = l => results.filter(r => r.findings.some(f => f.level === l)).length;
console.log(`\n${results.length} files — ${count('error')} with errors, ${count('warn')} with warnings`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 2));
process.exit(count('error') ? 1 : 0);
