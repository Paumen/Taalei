import { buildMaterialRules, materialFindingsFor, idUnder, materialIdsOf } from './rules.mjs';
import { read, VARS, printTally, widthsOf } from './report.mjs';

const RULES = buildMaterialRules(read(VARS.kinds));
const { models } = read(VARS.models);

const materialIds = materialIdsOf(read(VARS.materials));

const findings = [];
let checked = 0;
let skipped = 0;

for (const m of models) {
  if (!m.kind || VARS.mat.exemptKinds.some((k) => idUnder(m.kind, k))) { skipped++; continue; }
  checked++;
  for (const f of materialFindingsFor(m, RULES.get(m.kind), materialIds, VARS)) {
    findings.push({ ...f, id: `${m.kit}/${m.name}`, kit: m.kit, kind: m.kind });
  }
}

findings.sort((a, b) => a.kit.localeCompare(b.kit) || a.id.localeCompare(b.id) || a.family.localeCompare(b.family));

const w = widthsOf(findings, ['id', 'kind', 'family', 'required', 'present']);

for (const f of findings) {
  console.log(
    `${f.id.padEnd(w.id)}  ${f.kind.padEnd(w.kind)}  ${f.family.padEnd(w.family)}  ` +
    `needs ${f.required.padEnd(w.required)}  has ${f.present.padEnd(w.present)}  (${f.from})`,
  );
}

printTally(findings, 'kit', { levels: false });

console.log(`\n${checked} checked, ${skipped} exempt, ${findings.length} errors`);

process.exitCode = findings.length ? 1 : 0;
