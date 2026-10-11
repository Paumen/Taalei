import { readdirSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, readAccessor, measureScene } from '../catalog/tools/glb.mjs';
import { VARS } from './report.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { workfiles, minLongest, texture, atlas } = VARS.golden;

const triangles = (glb) => (glb.json.meshes ?? []).flatMap((m) => m.primitives).filter((p) => (p.mode ?? 4) === 4);
const indices = (glb, p) => (p.indices !== undefined
  ? readAccessor(glb, p.indices).data
  : Array.from({ length: glb.json.accessors[p.attributes.POSITION].count }, (_, k) => k));

const RULES = [
  {
    id: 'R01',
    check: (glb) => {
      const longest = Math.max(...measureScene(glb).wdhExact);
      return longest < minLongest ? `longest side ${longest.toFixed(4)} under ${minLongest}` : null;
    },
  },
  {
    id: 'R02',
    check: (glb) => {
      let zero = 0;
      for (const p of triangles(glb)) {
        if (p.attributes.NORMAL === undefined) continue;
        const n = readAccessor(glb, p.attributes.NORMAL).data;
        for (let i = 0; i < n.length; i += 3) if (Math.hypot(n[i], n[i + 1], n[i + 2]) < 0.5) zero++;
      }
      return zero ? `${zero} zero-length normals` : null;
    },
  },
  {
    id: 'R03',
    check: (glb) => {
      let mixed = 0;
      for (const p of triangles(glb)) {
        const mat = glb.json.materials?.[p.material];
        if (!mat?.pbrMetallicRoughness?.baseColorTexture || p.attributes.TEXCOORD_0 === undefined) continue;
        const uv = readAccessor(glb, p.attributes.TEXCOORD_0).data, I = indices(glb, p);
        for (let t = 0; t + 2 < I.length; t += 3) {
          const corners = [I[t], I[t + 1], I[t + 2]];
          const cu = Math.floor(corners.reduce((s, v) => s + uv[2 * v], 0) / 3 * atlas.cols);
          const cv = Math.floor(corners.reduce((s, v) => s + uv[2 * v + 1], 0) / 3 * atlas.rows);
          if (corners.some((v) => {
            const u = uv[2 * v] * atlas.cols, w = uv[2 * v + 1] * atlas.rows;
            return u < cu - atlas.eps || u > cu + 1 + atlas.eps || w < cv - atlas.eps || w > cv + 1 + atlas.eps;
          })) mixed++;
        }
      }
      return mixed ? `${mixed} triangles with corners in different colormap cells` : null;
    },
  },
  {
    id: 'R04',
    check: (glb) => {
      const roots = glb.json.scenes?.[glb.json.scene ?? 0]?.nodes ?? [];
      return roots.some((i) => glb.json.nodes[i].scale) ? 'scale on a root node' : null;
    },
  },
  {
    id: 'R05',
    check: (glb) => (triangles(glb).some((p) => indices(glb, p).length >= 3) ? null : 'no triangles'),
  },
  {
    id: 'R06',
    check: (glb) => {
      const other = (glb.json.images ?? []).map((im) => im.uri ?? 'embedded').filter((uri) => uri !== texture);
      return other.length ? `texture ${other.join(', ')}, not ${texture}` : null;
    },
  },
];

const glbs = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const path = join(dir, e.name);
  if (e.isDirectory()) return glbs(path);
  return e.name.endsWith('.glb') ? [path] : [];
});

const files = glbs(join(ROOT, workfiles)).sort();
const findings = [];
for (const file of files) {
  const id = relative(join(ROOT, workfiles), file).replace(/\.glb$/, '');
  let glb;
  try {
    glb = readGlb(file);
  } catch (e) {
    findings.push({ id, rule: 'read', text: e.message });
    continue;
  }
  for (const rule of RULES) {
    const text = rule.check(glb);
    if (text) findings.push({ id, rule: rule.id, text });
  }
}

const w = Math.max(0, ...findings.map((f) => f.id.length));
for (const f of findings) console.log(`error  ${f.id.padEnd(w)}  ${f.rule}  ${f.text}`);
console.log(`\n${files.length} checked, ${RULES.length} rules, ${findings.length} errors`);

process.exitCode = findings.length ? 1 : 0;
