import { measureFindingsFor, buildKindFields, materialIdsOf } from './rules.mjs';
import { read, VARS, printTally, widthsOf } from './report.mjs';

const { rows } = read(VARS.measures);
const KIND_FIELDS = buildKindFields(read(VARS.kinds));
const { models } = read(VARS.models);

const materialIds = materialIdsOf(read(VARS.materials));

const only = process.argv.slice(2);
const active = only.length ? rows.filter((r) => only.includes(r.id)) : rows;

const findings = [];
for (const m of models) {
  for (const f of measureFindingsFor(m, active, materialIds, VARS, KIND_FIELDS)) {
    findings.push({ ...f, id: `${m.kit}/${m.name}`, kit: m.kit, kind: m.kind });
  }
}

findings.sort((a, b) => a.rule.localeCompare(b.rule) || a.kit.localeCompare(b.kit) || a.id.localeCompare(b.id));

const w = widthsOf(findings, ['id', 'kind', 'field', 'actual']);

for (const f of findings) {
  console.log(
    `${f.level.padEnd(7)}  ${f.rule}  ${f.id.padEnd(w.id)}  ${f.kind.padEnd(w.kind)}  ${f.field.padEnd(w.field)}  ` +
    `${String(f.actual).padStart(w.actual)}  wants ${f.wants}`,
  );
}

printTally(findings, 'rule', { width: 4, pad: false });

const errors = findings.filter((f) => f.level === 'error').length;
const warnings = findings.length - errors;
console.log(`\n${models.length} checked, ${active.length} rules, ${warnings} warnings, ${errors} errors`);

process.exitCode = errors ? 1 : 0;
