import { backfaceFindingsFor, findingText } from './rules.mjs';
import { read, VARS, printTally, widthsOf } from './report.mjs';

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

const w = widthsOf(findings, ['id']);
for (const f of findings) console.log(`${f.level.padEnd(7)}  ${f.id.padEnd(w.id)}  ${f.text}`);

printTally(findings, 'kit');

const errors = findings.filter((f) => f.level === 'error').length;
const warnings = findings.length - errors;
console.log(`\n${models.length - unmeasured} checked, ${unmeasured} unmeasured, ${warnings} warnings, ${errors} errors`);

process.exitCode = errors ? 1 : 0;
