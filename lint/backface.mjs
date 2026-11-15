import { backfaceFindingsFor, findingText } from './rules.mjs';
import { execFileSync } from 'node:child_process';
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

let base = null;
try {
  base = JSON.parse(execFileSync('git', ['show', `${VARS.backface.base}:${VARS.backface.file}`], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })).models;
} catch {
  console.log(`no ${VARS.backface.base} copy of ${VARS.backface.file}: views are not compared with it\n`);
}
const pct = (v) => `${(v * 100).toFixed(1)}%`;
for (const m of base ? models : []) {
  const id = `${m.kit}/${m.name}`, now = measured[id], was = base[id];
  if (!now || !was || now.hash === was.hash) continue;
  const pairs = now.views && was.views
    ? Object.keys({ ...now.views, ...was.views }).map((v) => [v, was.views[v] ?? 0, now.views[v] ?? 0])
    : [[now.view ?? was.view ?? 'worst', was.share, now.share]];
  for (const [view, before, after] of pairs) {
    if (after - before <= VARS.backface.worse) continue;
    findings.push({ level: 'error', text: `view ${view} worse than ${VARS.backface.base}: ${pct(before)} → ${pct(after)}`, id, kit: m.kit });
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
