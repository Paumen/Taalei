import { measureFindingsFor, buildKindFields, materialIdsOf } from './rules.mjs';
import { read, VARS, printTally, widthsOf } from './report.mjs';

const HELP = `measures.mjs [row ids]

Checks the rows of lint/measures.json. Fields, in catalogue units, measured
after the node transform; a part is shells welded on shared positions:
minTube  width of the thinnest tube or stick. A tube is a part whose every
         slice is a ring of at least five directions, at least 2.5 diameters
         long; width is twice the median slice radius. A stick is at least 6
         times as long as its wide side, also when welded into a larger part;
         width is its narrow side. A piece under 0.026 lying within 0.002 of
         another face does not count. None recorded passes G27.
minWall  thinnest wall: rays from sampled faces into the part to the first
         face facing back within 25 degrees; per part the 20% mark by area,
         the lowest part counts. Parts under 0.2% of the surface, and depths
         under 0.026 lying within 0.002 of another part, do not count.
thick    twice the mean depth of the solid over the middle extent; the solid
         is all not seen from at or above the horizon, gaps under about 7% of
         the longest extent closed. thickRel divides by the median of the
         deepest kind with at least 8 models, plural, piece, comp and set
         left out.
leaf     1 when the kind has no children in lint/kinds.json.`;

if (process.argv.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

const { rows } = read(VARS.measures);
const KIND_FIELDS = buildKindFields(read(VARS.kinds));
const { models } = read(VARS.models);

const MATERIALS = read(VARS.materials);
const materialIds = materialIdsOf(MATERIALS);
const lanes = new Map(Object.entries(MATERIALS.bands));

const only = process.argv.slice(2);
const active = only.length ? rows.filter((r) => only.includes(r.id)) : rows;

const findings = [];
for (const m of models) {
  for (const f of measureFindingsFor(m, active, materialIds, VARS, KIND_FIELDS, lanes)) {
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
