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
    `${f.level.padEnd(7)}  ${f.rule}  ${f.id.padEnd(w.id)}  ${f.kind.padEnd(w.kind)}  ${f.field.padEnd(w.field)}  ` +
    `${String(f.actual).padStart(w.actual)}  wants ${f.wants}`,
  );
}

const perRule = new Map();
for (const f of findings) {
  const row = perRule.get(f.rule) ?? { errors: 0, warnings: 0 };
  row[`${f.level}s`]++;
  perRule.set(f.rule, row);
}
if (perRule.size) {
  console.log('');
  for (const [rule, row] of [...perRule].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${rule}  ${String(row.errors).padStart(4)} errors  ${String(row.warnings).padStart(4)} warnings`);
  }
}

const errors = findings.filter((f) => f.level === 'error').length;
const warnings = findings.length - errors;
console.log(`\n${models.length} checked, ${active.length} rules, ${warnings} warnings, ${errors} errors`);

process.exitCode = errors ? 1 : 0;
