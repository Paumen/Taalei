import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kindIs, kindAncestors } from '../catalog/tools/kinds.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

const VARS = read('lint/variables.json');
const KINDS = read(VARS.kinds);
const { models } = read(VARS.models);

const FIELDS = ['high.min', 'high.max', 'longest.min', 'longest.max'];
const EPSILON = 1e-9;

const OWN = new Map();
const collect = (node) => {
  OWN.set(node.id, Object.fromEntries(FIELDS.filter((f) => node[f] !== undefined).map((f) => [f, node[f]])));
  for (const child of node.children ?? []) collect(child);
};
for (const root of KINDS.kinds) collect(root);

const limitsOf = (kind) => {
  const chain = [kind, ...kindAncestors(kind)];
  const out = {};
  for (const field of FIELDS) {
    const from = chain.find((id) => OWN.get(id)?.[field] !== undefined);
    if (from) out[field] = { value: OWN.get(from)[field], from };
    else if (KINDS.defaults?.[field] !== undefined) out[field] = { value: KINDS.defaults[field], from: 'defaults' };
  }
  return out;
};

const exempt = (m) =>
  VARS.exemptKinds.some((k) => kindIs(m.kind, k)) || (m.tags ?? []).some((t) => VARS.exemptTags.includes(t));

const findings = [];
let checked = 0;
let skipped = 0;

for (const m of models) {
  if (!m.kind || exempt(m)) { skipped++; continue; }
  checked++;
  const measures = { high: m.wdh[2], longest: Math.max(...m.wdh) };
  const limits = limitsOf(m.kind);
  for (const [field, { value: limit, from }] of Object.entries(limits)) {
    const [measure, bound] = field.split('.');
    const value = measures[measure];
    const deviation = bound === 'min' ? (limit - value) / limit : (value - limit) / limit;
    if (deviation <= EPSILON) continue;
    const level = deviation <= VARS.warnBand + EPSILON ? 'warning' : 'error';
    findings.push({ level, id: `${m.kit}/${m.name}`, kit: m.kit, kind: m.kind, measure, value, bound, limit, from });
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

const errors = findings.filter((f) => f.level === 'error').length;
const warnings = findings.length - errors;
console.log(`\n${checked} checked, ${skipped} exempt, ${warnings} warnings, ${errors} errors`);

process.exitCode = errors ? 1 : 0;
