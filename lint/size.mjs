import { buildLimits, buildScales, findingsFor, isExempt } from './rules.mjs';
import { read, VARS, printTally, widthsOf } from './report.mjs';

const KINDS = read(VARS.kinds);
const LIMITS = buildLimits(KINDS);
const SCALES = buildScales(KINDS);
const { models, kits } = read(VARS.models);
const KITS = new Map(kits.filter((k) => k.kitCheck).map((k) => [k.slug, k.kitCheck]));

const findings = [];
let checked = 0;
let skipped = 0;

for (const m of models) {
  if (!m.kind || isExempt(m, VARS)) { skipped++; continue; }
  checked++;
  for (const f of findingsFor(m, LIMITS.get(m.kind), VARS, SCALES)) {
    findings.push({ ...f, id: `${m.kit}/${m.name}`, kit: m.kit, kind: m.kind });
  }
}

findings.sort((a, b) => a.kit.localeCompare(b.kit) || a.id.localeCompare(b.id) || a.measure.localeCompare(b.measure));

const w = widthsOf(findings, ['id', 'kind', 'measure']);

for (const f of findings) {
  console.log(
    `${f.level.padEnd(7)}  ${f.id.padEnd(w.id)}  ${f.kind.padEnd(w.kind)}  ` +
    `${f.measure.padEnd(w.measure)}  ${String(f.value).padStart(6)}  ${f.bound} ${String(f.limit).padStart(5)}  (${f.from})`,
  );
}

printTally(findings, 'kit');

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
