import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMaterialRules, materialFindingsFor, idUnder } from './rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

const VARS = read('lint/variables.json');
const RULES = buildMaterialRules(read(VARS.kinds));
const { models } = read(VARS.models);

const materialIds = new Set();
const collect = (nodes) => {
  for (const node of nodes) {
    materialIds.add(node.id);
    collect(node.children ?? []);
  }
};
collect(read(VARS.materials).materials);

const findings = [];
let checked = 0;
let skipped = 0;

for (const m of models) {
  if (!m.kind || VARS.mat.exemptKinds.some((k) => idUnder(m.kind, k))) { skipped++; continue; }
  checked++;
  for (const f of materialFindingsFor(m, RULES.get(m.kind), materialIds, VARS)) {
    findings.push({ ...f, id: `${m.kit}/${m.name}`, kit: m.kit, kind: m.kind });
  }
}

findings.sort((a, b) => a.kit.localeCompare(b.kit) || a.id.localeCompare(b.id) || a.family.localeCompare(b.family));

const width = (key) => Math.max(...findings.map((f) => String(f[key]).length), 0);
const w = { id: width('id'), kind: width('kind'), family: width('family'), required: width('required'), present: width('present') };

for (const f of findings) {
  console.log(
    `${f.id.padEnd(w.id)}  ${f.kind.padEnd(w.kind)}  ${f.family.padEnd(w.family)}  ` +
    `needs ${f.required.padEnd(w.required)}  has ${f.present.padEnd(w.present)}  (${f.from})`,
  );
}

const perKit = new Map();
for (const f of findings) perKit.set(f.kit, (perKit.get(f.kit) ?? 0) + 1);
if (perKit.size) {
  console.log('');
  const kw = Math.max(...[...perKit.keys()].map((k) => k.length));
  for (const [kit, n] of [...perKit].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${kit.padEnd(kw)}  ${String(n).padStart(3)} errors`);
  }
}

console.log(`\n${checked} checked, ${skipped} exempt, ${findings.length} errors`);

process.exitCode = findings.length ? 1 : 0;
