import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPalettes, kindBandRulesFor, kindBandFindingsFor, idUnder } from './rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

const VARS = read('lint/variables.json');
const MATERIALS = read(VARS.materials);
const PALETTES = buildPalettes(MATERIALS, VARS);
const { rows } = read(VARS.kindBands);
const { models } = read(VARS.models);

const materialIds = new Set();
const collect = (nodes) => {
  for (const node of nodes) {
    materialIds.add(node.id);
    collect(node.children ?? []);
  }
};
collect(MATERIALS.materials);

const rulesByKind = new Map();
const rulesFor = (kind) => {
  if (!rulesByKind.has(kind)) rulesByKind.set(kind, kindBandRulesFor(kind, rows));
  return rulesByKind.get(kind);
};

const findings = [];
let checked = 0;
let skipped = 0;

for (const m of models) {
  if (!m.kind || VARS.bands.exemptKinds.some((k) => idUnder(m.kind, k))) { skipped++; continue; }
  checked++;
  for (const f of kindBandFindingsFor(m, rulesFor(m.kind), PALETTES, materialIds, VARS)) {
    findings.push({ ...f, id: `${m.kit}/${m.name}`, kit: m.kit, kind: m.kind });
  }
}

findings.sort((a, b) => a.kit.localeCompare(b.kit) || a.id.localeCompare(b.id) || a.rule.localeCompare(b.rule));

const width = (key) => Math.max(...findings.map((f) => String(f[key]).length), 0);
const w = { id: width('id'), kind: width('kind'), rule: width('rule'), material: width('material'), wants: width('wants') };

for (const f of findings) {
  console.log(
    `${f.id.padEnd(w.id)}  ${f.kind.padEnd(w.kind)}  ${f.rule.padEnd(w.rule)}  ${f.material.padEnd(w.material)}  ` +
    `wants ${f.wants.padEnd(w.wants)}  has ${f.has}`,
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
