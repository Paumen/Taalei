import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, readAccessor, worldMatrices } from '../catalog/tools/glb.mjs';
import { read, VARS, printTally, widthsOf } from './report.mjs';
import { idUnder } from './rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { kinds, ranges, tolerance } = VARS.ceramic;
const MATERIALS = read(VARS.materials);
const { models } = read(VARS.models);
const only = process.argv.slice(2);

const bandOfTag = new Map();
(function walk(nodes) {
  for (const node of nodes) {
    if (node.id.startsWith('ceramic-')) bandOfTag.set(node.id, node.bands[0]);
    walk(node.children ?? []);
  }
})(MATERIALS.materials);

const findings = [];
let checked = 0;

for (const m of models) {
  const id = `${m.kit}/${m.name}`;
  if (only.length && !only.includes(id)) continue;
  if (!kinds.some((k) => idUnder(m.kind, k))) continue;
  const bands = (m.tags ?? []).filter((t) => bandOfTag.has(t)).map((t) => bandOfTag.get(t));
  if (!bands.length) continue;
  checked++;
  const cells = new Map(bands.map((band) => [MATERIALS.bands[band], band]));
  const glb = readGlb(join(ROOT, 'kits', 'workfiles', m.kit, `${m.name}.glb`));
  const world = worldMatrices(glb.json);
  const off = {};
  glb.json.nodes.forEach((node, ni) => {
    if (node.mesh === undefined) return;
    const w = world[ni];
    for (const p of glb.json.meshes[node.mesh].primitives) {
      const uv = readAccessor(glb, p.attributes.TEXCOORD_0).data;
      const normal = readAccessor(glb, p.attributes.NORMAL).data;
      for (let i = 0; i < uv.length / 2; i++) {
        const col = Math.min(15, Math.floor(uv[2 * i] * 16)), row = Math.min(3, Math.floor(uv[2 * i + 1] * 4));
        const band = cells.get(`${col},${row}`);
        if (!band) continue;
        const [a, b, c] = [normal[3 * i], normal[3 * i + 1], normal[3 * i + 2]];
        const n = [w[0] * a + w[4] * b + w[8] * c, w[1] * a + w[5] * b + w[9] * c, w[2] * a + w[6] * b + w[10] * c];
        const [top, bottom] = ranges[band];
        const want = top + (bottom - top) * (1 - n[1] / (Math.hypot(...n) || 1)) / 2;
        const miss = Math.abs(uv[2 * i + 1] * 4 - row - want);
        if (miss > tolerance) off[band] = Math.max(off[band] ?? 0, miss);
      }
    }
  });
  for (const [band, miss] of Object.entries(off)) {
    findings.push({ id, kit: m.kit, kind: m.kind, band, miss: miss.toFixed(2) });
  }
}

const w = widthsOf(findings, ['id', 'kind', 'band']);
for (const f of findings) {
  console.log(`${f.id.padEnd(w.id)}  ${f.kind.padEnd(w.kind)}  ${f.band.padEnd(w.band)}  off the facing shade by up to ${f.miss}`);
}

printTally(findings, 'kit', { levels: false });

console.log(`\n${checked} checked, ${findings.length} errors`);

process.exitCode = findings.length ? 1 : 0;
