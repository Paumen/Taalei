import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureFindingsFor } from './rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

const VARS = read('lint/variables.json');
const { rows } = read(VARS.measures);
const { models } = read(VARS.models);

const materialIds = new Set();
const collect = (nodes) => {
  for (const node of nodes) {
    materialIds.add(node.id);
    collect(node.children ?? []);
  }
};
collect(read(VARS.materials).materials);

const only = process.argv.slice(2);
const active = only.length ? rows.filter((r) => only.includes(r.id)) : rows;

const findings = [];
for (const m of models) {
  for (const f of measureFindingsFor(m, active, materialIds, VARS)) {
    findings.push({ ...f, id: `${m.kit}/${m.name}`, kit: m.kit, kind: m.kind });
  }
}

findings.sort((a, b) => a.rule.localeCompare(b.rule) || a.kit.localeCompare(b.kit) || a.id.localeCompare(b.id));

const width = (key) => Math.max(...findings.map((f) => String(f[key]).length), 0);
const w = { id: width('id'), kind: width('kind'), field: width('field'), actual: width('actual') };

for (const f of findings) {
  console.log(
    `${f.rule}  ${f.id.padEnd(w.id)}  ${f.kind.padEnd(w.kind)}  ${f.field.padEnd(w.field)}  ` +
    `${String(f.actual).padStart(w.actual)}  wants ${f.wants}`,
  );
}

const perRule = new Map();
for (const f of findings) perRule.set(f.rule, (perRule.get(f.rule) ?? 0) + 1);
if (perRule.size) {
  console.log('');
  for (const [rule, n] of [...perRule].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${rule}  ${String(n).padStart(4)} errors`);
  }
}

console.log(`\n${models.length} checked, ${active.length} rules, ${findings.length} errors`);

process.exitCode = findings.length ? 1 : 0;
