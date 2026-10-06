import { buildPalettes, buildKindBands, kindBandFindingsFor, idUnder, materialIdsOf } from './rules.mjs';
import { read, VARS, printTally, widthsOf } from './report.mjs';

const MATERIALS = read(VARS.materials);
const PALETTES = buildPalettes(MATERIALS, VARS);
const RULES = buildKindBands(read(VARS.kinds));
const { models } = read(VARS.models);

const materialIds = materialIdsOf(MATERIALS);

const findings = [];
let checked = 0;
let skipped = 0;

for (const m of models) {
  if (!m.kind || VARS.bands.exemptKinds.some((k) => idUnder(m.kind, k))) { skipped++; continue; }
  checked++;
  for (const f of kindBandFindingsFor(m, RULES.get(m.kind), PALETTES, materialIds, VARS)) {
    findings.push({ ...f, id: `${m.kit}/${m.name}`, kit: m.kit, kind: m.kind });
  }
}

findings.sort((a, b) => a.kit.localeCompare(b.kit) || a.id.localeCompare(b.id) || a.material.localeCompare(b.material));

const w = widthsOf(findings, ['id', 'kind', 'material', 'wants', 'has']);

for (const f of findings) {
  console.log(
    `${f.id.padEnd(w.id)}  ${f.kind.padEnd(w.kind)}  ${f.material.padEnd(w.material)}  ` +
    `wants ${f.wants.padEnd(w.wants)}  has ${f.has.padEnd(w.has)}  (${f.from})`,
  );
}

printTally(findings, 'kit', { levels: false });

console.log(`\n${checked} checked, ${skipped} exempt, ${findings.length} errors`);

process.exitCode = findings.length ? 1 : 0;
