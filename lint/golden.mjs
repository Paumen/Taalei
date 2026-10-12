import { readdirSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, readAccessor, measureScene, badNormals } from '../catalog/tools/glb.mjs';
import { VARS, read } from './report.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { workfiles, minLongest, texture, atlas, maxCalls, except } = VARS.golden;

const TAGS = read('catalog/data/tags.json').tags;
const KINDS = new Set();
const walkKinds = (node) => { KINDS.add(node.id); (node.children ?? []).forEach(walkKinds); };
read(VARS.kinds).kinds.forEach(walkKinds);
const PARENT = new Map();
const walkMaterials = (node, parent) => { PARENT.set(node.id, parent); (node.children ?? []).forEach((c) => walkMaterials(c, node.id)); };
read(VARS.materials).materials.forEach((m) => walkMaterials(m, null));

const isUnder = (id, ancestor) => {
  for (let at = PARENT.get(id); at; at = PARENT.get(at)) if (at === ancestor) return true;
  return false;
};

const tagsOf = new Map();
for (const tag of TAGS) for (const model of tag.models) {
  if (!tagsOf.has(model)) tagsOf.set(model, []);
  tagsOf.get(model).push(tag);
}
const exempt = (ruleId, { glb, tags }) => (except[ruleId] ?? []).some((id) => (id === 'animation'
  ? Boolean(glb.json.animations?.length)
  : tags.some((t) => t.id === id)));

const triangles = (glb) => (glb.json.meshes ?? []).flatMap((m) => m.primitives).filter((p) => (p.mode ?? 4) === 4);
const indexCount = (glb, p) => glb.json.accessors[p.indices ?? p.attributes.POSITION].count;
const indices = (glb, p) => (p.indices !== undefined
  ? readAccessor(glb, p.indices).data
  : Array.from({ length: glb.json.accessors[p.attributes.POSITION].count }, (_, k) => k));

const RULES = [
  {
    id: 'R01',
    check: ({ scene }) => {
      const longest = Math.max(...scene().wdhExact);
      return longest < minLongest ? `longest side ${longest.toFixed(4)} under ${minLongest}` : null;
    },
  },
  {
    id: 'R02',
    check: ({ glb }) => {
      const bad = badNormals(glb);
      return bad ? `${bad} normals not unit length` : null;
    },
  },
  {
    id: 'R03',
    check: ({ glb }) => {
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
    check: ({ glb }) => {
      const roots = glb.json.scenes?.[glb.json.scene ?? 0]?.nodes ?? [];
      return roots.some((i) => glb.json.nodes[i].scale) ? 'scale on a root node' : null;
    },
  },
  {
    id: 'R05',
    check: ({ glb }) => (triangles(glb).some((p) => indexCount(glb, p) >= 3) ? null : 'no triangles'),
  },
  {
    id: 'R06',
    check: ({ glb }) => {
      const other = (glb.json.images ?? []).map((im) => im.uri ?? 'embedded').filter((uri) => uri !== texture);
      return other.length ? `texture ${other.join(', ')}, not ${texture}` : null;
    },
  },
  {
    id: 'R07',
    check: ({ glb }) => {
      const blended = (glb.json.materials ?? []).filter((m) => (m.alphaMode ?? 'OPAQUE') !== 'OPAQUE');
      return blended.length ? `alpha mode ${blended.map((m) => m.alphaMode).join(', ')}` : null;
    },
  },
  {
    id: 'R08',
    check: ({ glb }) => {
      const shiny = (glb.json.materials ?? []).filter((m) => (m.pbrMetallicRoughness?.roughnessFactor ?? 1) !== 1
        || (m.pbrMetallicRoughness?.metallicFactor ?? 1) !== 0);
      return shiny.length ? `${shiny.length} materials not metallic 0, roughness 1` : null;
    },
  },
  {
    id: 'R09',
    check: ({ scene }) => {
      const { calls } = scene();
      return calls > maxCalls ? `${calls} draw calls over ${maxCalls}` : null;
    },
  },
  {
    id: 'R10',
    check: ({ tags }) => {
      const kinds = tags.filter((t) => t.type === 'kind');
      if (kinds.length !== 1) return `${kinds.length} kinds, not 1`;
      return KINDS.has(kinds[0].id) ? null : `kind ${kinds[0].id} not in ${VARS.kinds}`;
    },
  },
  {
    id: 'R11',
    check: ({ tags }) => {
      const mats = tags.filter((t) => t.type === 'material').map((t) => t.id);
      const unknown = mats.filter((m) => !PARENT.has(m));
      if (unknown.length) return `material ${unknown.join(', ')} not in ${VARS.materials}`;
      const doubled = mats.filter((m) => mats.some((s) => s !== m && isUnder(s, m)));
      return doubled.length ? `material ${doubled.join(', ')} carried with a subtype` : null;
    },
  },
];

const glbs = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const path = join(dir, e.name);
  if (e.isDirectory()) return glbs(path);
  return e.name.endsWith('.glb') ? [path] : [];
});

const files = glbs(join(ROOT, workfiles)).sort();
const ids = new Set();
const findings = [];
for (const file of files) {
  const id = relative(join(ROOT, workfiles), file).replace(/\.glb$/, '');
  ids.add(id);
  let glb;
  try {
    glb = readGlb(file);
  } catch (e) {
    findings.push({ id, rule: 'read', text: e.message });
    continue;
  }
  let measured;
  const tags = tagsOf.get(id) ?? [];
  const model = { glb, tags, scene: () => (measured ??= measureScene(glb)) };
  for (const rule of RULES) {
    if (exempt(rule.id, model)) continue;
    const text = rule.check(model);
    if (text) findings.push({ id, rule: rule.id, text });
  }
}
for (const id of tagsOf.keys()) {
  if (!ids.has(id)) findings.push({ id, rule: 'R10', text: 'tagged, but no workfile' });
}

const w = Math.max(0, ...findings.map((f) => f.id.length));
for (const f of findings) console.log(`error  ${f.id.padEnd(w)}  ${f.rule}  ${f.text}`);
console.log(`\n${files.length} checked, ${RULES.length} rules, ${findings.length} errors`);

process.exitCode = findings.length ? 1 : 0;
