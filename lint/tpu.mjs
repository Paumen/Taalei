import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLimits, tpuFindingsFor, isExempt } from './rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

const VARS = read('lint/variables.json');
const LIMITS = buildLimits(read(VARS.kinds));
const { models } = read(VARS.models);

const findings = [];
let checked = 0;
let skipped = 0;

for (const m of models) {
  if (!m.kind || isExempt(m, VARS)) { skipped++; continue; }
  checked++;
  for (const f of tpuFindingsFor(m, LIMITS.get(m.kind), VARS)) {
    findings.push({ ...f, id: `${m.kit}/${m.name}`, kit: m.kit, kind: m.kind, tris: m.tris });
  }
}

findings.sort((a, b) => a.kit.localeCompare(b.kit) || a.id.localeCompare(b.id));

const width = (key) => Math.max(...findings.map((f) => String(f[key]).length), 0);
const w = { id: width('id'), kind: width('kind') };

for (const f of findings) {
  console.log(
    `${f.level.padEnd(7)}  ${f.id.padEnd(w.id)}  ${f.kind.padEnd(w.kind)}  ` +
    `${String(f.value).padStart(6)}  max ${String(f.limit).padStart(5)}  ${String(f.tris).padStart(6)} tris  (${f.from})`,
  );
}

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
console.log(`\n${checked} checked, ${skipped} exempt, ${warnings} warnings, ${errors} errors`);

process.exitCode = errors ? 1 : 0;
