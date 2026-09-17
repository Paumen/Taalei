import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRules, idUnder, materialFindingsFor } from './rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

const VARS = read('lint/variables.json');
const { rules, materials } = buildRules(read(VARS.materials), read(VARS.kinds));
const { models } = read(VARS.models);

const findings = [];
let checked = 0;
let skipped = 0;

for (const m of models) {
  if (!m.kind || VARS.exemptKinds.some((k) => idUnder(m.kind, k))) { skipped++; continue; }
  checked++;
  const mats = new Set((m.tags ?? []).filter((t) => materials.has(t)));
  for (const f of materialFindingsFor(m, mats, rules)) {
    findings.push({ ...f, id: `${m.kit}/${m.name}`, kit: m.kit, kind: m.kind });
  }
}

findings.sort((a, b) => a.rule.localeCompare(b.rule) || a.kit.localeCompare(b.kit) || a.id.localeCompare(b.id));

const width = (key) => Math.max(...findings.map((f) => String(f[key]).length), 0);
const w = { id: width('id'), kind: width('kind'), subject: width('subject') };

for (const f of findings) {
  console.log(
    `${f.rule}  ${f.id.padEnd(w.id)}  ${f.kind.padEnd(w.kind)}  ${f.subject.padEnd(w.subject)}  ` +
    `${f.assert} ${[f.value].flat().join(', ')}  (has ${f.have.join(', ') || '—'})`,
  );
}

const perKit = new Map();
for (const f of findings) perKit.set(f.kit, (perKit.get(f.kit) ?? 0) + 1);
if (perKit.size) {
  console.log('');
  const kw = Math.max(...[...perKit.keys()].map((k) => k.length));
  for (const [kit, count] of [...perKit].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${kit.padEnd(kw)}  ${String(count).padStart(3)} errors`);
  }
}

console.log(`\n${rules.length} rules, ${checked} checked, ${skipped} exempt, ${findings.length} errors`);

process.exitCode = findings.length ? 1 : 0;
