import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backfaceFindingsFor, findingText } from './rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

const VARS = read('lint/variables.json');
const { models } = read(VARS.models);
const measured = read(VARS.backface.file).models;

const findings = [];
let unmeasured = 0;

for (const m of models) {
  if (!measured[`${m.kit}/${m.name}`]) unmeasured++;
  for (const f of backfaceFindingsFor(m, VARS)) {
    findings.push({ level: f.level, text: findingText('backface', f), id: `${m.kit}/${m.name}`, kit: m.kit });
  }
}

findings.sort((a, b) => a.kit.localeCompare(b.kit) || a.id.localeCompare(b.id));

const w = Math.max(...findings.map((f) => f.id.length), 0);
for (const f of findings) console.log(`${f.level.padEnd(7)}  ${f.id.padEnd(w)}  ${f.text}`);

const perKit = new Map();
for (const f of findings) {
  const row = perKit.get(f.kit) ?? { errors: 0, warnings: 0 };
  row[`${f.level}s`]++;
  perKit.set(f.kit, row);
}
if (perKit.size) {
  console.log('');
  const kw = Math.max(...[...perKit.keys()].map((k) => k.length));
  for (const [kit, row] of [...perKit].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${kit.padEnd(kw)}  ${String(row.errors).padStart(3)} errors  ${String(row.warnings).padStart(3)} warnings`);
  }
}

const errors = findings.filter((f) => f.level === 'error').length;
const warnings = findings.length - errors;
console.log(`\n${models.length - unmeasured} checked, ${unmeasured} unmeasured, ${warnings} warnings, ${errors} errors`);

process.exitCode = errors ? 1 : 0;
