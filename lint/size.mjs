import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildKitScales, buildLimits, buildScales, findingsFor, isExempt } from './rules.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

const VARS = read('lint/variables.json');
const KINDS = read(VARS.kinds);
const LIMITS = buildLimits(KINDS);
const SCALES = buildScales(KINDS);
const { models } = read(VARS.models);
const KITS = buildKitScales(models, { vars: VARS, limits: LIMITS, scales: SCALES });

const findings = [];
let checked = 0;
let skipped = 0;

for (const m of models) {
  if (!m.kind || isExempt(m, VARS)) { skipped++; continue; }
  checked++;
  for (const f of findingsFor(m, LIMITS.get(m.kind), VARS, SCALES, KITS.get(m.kit))) {
    findings.push({ ...f, id: `${m.kit}/${m.name}`, kit: m.kit, kind: m.kind });
  }
}

findings.sort((a, b) => a.kit.localeCompare(b.kit) || a.id.localeCompare(b.id) || a.measure.localeCompare(b.measure));

const width = (key) => Math.max(...findings.map((f) => String(f[key]).length), 0);
const w = { id: width('id'), kind: width('kind'), measure: width('measure') };

for (const f of findings) {
  console.log(
    `${f.level.padEnd(7)}  ${f.id.padEnd(w.id)}  ${f.kind.padEnd(w.kind)}  ` +
    `${f.measure.padEnd(w.measure)}  ${String(f.value).padStart(5)}  ${f.bound} ${String(f.limit).padStart(5)}  (${f.from})`,
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

const offKits = [...KITS].filter(([, k]) => k.level).sort(([, a], [, b]) => Math.abs(Math.log(b.factor)) - Math.abs(Math.log(a.factor)));
if (offKits.length) {
  console.log(`\nkits off the size curve (warning past ×${VARS.kit.warn}, error past ×${VARS.kit.error}, from ${VARS.kit.minKinds} kinds):`);
  const kw = Math.max(...offKits.map(([kit]) => kit.length));
  for (const [kit, k] of offKits) console.log(`${k.level.padEnd(7)}  ${kit.padEnd(kw)}  ×${k.factor}  over ${k.kinds} kinds`);
}

const errors = findings.filter((f) => f.level === 'error').length;
const warnings = findings.length - errors;
const kitErrors = offKits.filter(([, k]) => k.level === 'error').length;
const kitWarnings = offKits.length - kitErrors;
console.log(`\n${checked} checked, ${skipped} exempt, ${warnings} warnings, ${errors} errors; kits: ${kitWarnings} warnings, ${kitErrors} errors`);

process.exitCode = errors || kitErrors ? 1 : 0;
