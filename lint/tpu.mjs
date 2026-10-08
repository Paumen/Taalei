import { buildLimits, tpuFindingsFor, isExempt } from './rules.mjs';
import { read, VARS, printTally, widthsOf } from './report.mjs';

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

const w = widthsOf(findings, ['id', 'kind']);

for (const f of findings) {
  console.log(
    `${f.level.padEnd(7)}  ${f.id.padEnd(w.id)}  ${f.kind.padEnd(w.kind)}  ` +
    `${String(f.value).padStart(6)}  max ${String(f.limit).padStart(5)}  ${String(f.tris).padStart(6)} tris  (${f.from})`,
  );
}

printTally(findings, 'kit');

const errors = findings.filter((f) => f.level === 'error').length;
const warnings = findings.length - errors;
console.log(`\n${checked} checked, ${skipped} exempt, ${warnings} warnings, ${errors} errors`);

process.exitCode = errors ? 1 : 0;
